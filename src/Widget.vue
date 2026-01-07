<script setup lang="ts">
/* -----------------------------------------------
   Imports
------------------------------------------------ */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineExpose, onUnmounted } from '/runtime/vue.js'
import {
  fsListDirSmart,
  fsValidate,
  shortcutsProbe,
  fsRename,
  fsMove,
  onFsQueueUpdate,
} from '/src/widgets/fs'
import { sendWidgetMessage, onWidgetMessage } from '/src/widgets/instances'
import { loadIconPack, iconFor, ensureIconsFor } from '/src/icons/index.ts'
import { ensureConsent } from '/src/consent/service'
import { createSelectionEngine, type ItemsAdapter, type Mods } from '/src/widgets/selection/selection-engine'
import { createMarqueeDriver, type GeometryAdapter, type ScrollerAdapter, type Rect } from '/src/widgets/selection/marquee-driver';
import { PickerMode, FileFilter, PickerSurfaceAdapter } from '/src/widgets/pickers/api';

import {
  createGexPayload,
  setGexPayload,
  createDragPreview,
  hasGexPayload,
  extractGexPayload,
  authorizeFileRefs
} from 'gexplorer/widgets'

import { buildVfsInfo } from '/src/contextmenu/context'
import { startRename } from '/src/widgets/renameOverlay' 
import { getItemsLayoutService, type ViewConfig } from './layout-service'

const contextMenuOptions = computed(() => {
  const selectedPaths = Array.from(selected.value)
  const hasSelection = selectedPaths.length > 0
  
  const opts = {
    widgetType: 'items',
    widgetId: props.sourceId,
    location: { area: 'grid' as const },
    target: hasSelection ? ('selection' as const) : ('background' as const),
    vfs: buildVfsInfo(cwd.value || merged.value.rpath || ''),
    selection: selectedPaths,
    widgetConfig: props.config
  }
  
  // 🐛 DEBUG
  console.log('[items] contextMenuOptions computed:', {
    selectedValue: selected.value,
    selectedSize: selected.value.size,
    selectedPaths,
    hasSelection,
    target: opts.target,
    selection: opts.selection
  })
  
  return opts
})

/* -----------------------------------------------
   Types
------------------------------------------------ */
type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

  
type ResCol = keyof DetailWeights

const props = defineProps<{
  sourceId: string
  instanceId: string
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    size: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean,
}>()

const emit = defineEmits<{ 
  (e: 'updateConfig', config: any): void 
  (e: 'event', payload: any): void
}>()

type SortKey = 'name' | 'kind' | 'ext' | 'size' | 'modified'
type SortDir = 'asc' | 'desc'

const sortKey = ref<SortKey>((props.config?.view?.sortKey as SortKey) || 'name')
const sortDir = ref<SortDir>((props.config?.view?.sortDir as SortDir) || 'asc')

const offWidgetMsg = ref<null | (() => void)>(null)

const iconsTick = ref(0)

const NAME_MIN = 140
const EXT_MIN  = 70
const SIZE_MIN = 90
// put this near your other constants
const MIN_MOD_PX = 150; // min width for "Modified" col

/* -----------------------------------------------
   Selection marquee with rAF autoscroll
   Rules:
   - Do NOT scroll while pointer is inside the scroll rect.
   - When pointer is outside, scroll speed grows with distance
     (quadratic), capped at MAX_SPEED.
------------------------------------------------ */
const scrollEl = ref<HTMLElement | null>(null)

// tie driver to the engine you already created
const marqueeRect = ref<Rect | null>(null);

let squelchNextPlaneClick = false;
let lastScrollTopForDrag = 0;

const selected = ref<Set<string>>(new Set());   // now driven by engine
const focusIndex = ref<number | null>(null);

const headerH = ref(36)
const detailsScrollEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement|null>(null)
const padEl    = ref<HTMLElement|null>(null)
const sbw = ref(0)

const selectedMap = computed<Record<string, true>>(() => {
  const m: Record<string, true> = {};
  for (const id of selected.value) m[id] = true;
  return m;
});

const marqueeActive = computed(() => {
  const r = marqueeRect.value;
  return !!r && (r.w > 0 || r.h > 0);
});

const detailsRootEl = ref<HTMLElement|null>(null)
const loading = ref(false)
const error = ref('')

const S = computed(() => sizeTokens(merged.value.itemSize))

const sortedEntries = computed(() => {
  const k = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1

  const cmp = (a: string, b: string) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })

  // Start from raw directory entries
  let data = entries.value.slice()

  // ---- Apply extension filter (from dialog / other callers) ----
  const f = activeFilter.value
  if (f?.exts && f.exts.length) {
    const allowed = new Set(
      f.exts
        .map(e => (e || '').toString().toLowerCase())
        .filter(e => e && e !== '*')    // treat "*" as "no restriction"
    )

    if (allowed.size) {
      data = data.filter((e: any) => {
        const kindStr = String(e?.Kind || '').toLowerCase()
        const isDir =
          kindStr.includes('dir') ||   // "Dir", "Directory"
          kindStr === 'folder'

        // Never hide folders – matches OS dialogs
        if (isDir) return true

        const ext = String(e?.Ext || '')
          .toLowerCase()
          .replace(/^\./, '')          // ".mp3" -> "mp3"

        if (!ext) return false         // files with no ext are hidden under filtered view
        return allowed.has(ext)
      })
    }
  }

  // ---- Then sort the filtered set ----
  data.sort((A, B) => {
    if (k === 'name')
      return cmp(A?.Name || '', B?.Name || '') * dir

    if (k === 'ext') {
      const c = cmp(A?.Ext || '', B?.Ext || '')
      return (c || cmp(A?.Name || '', B?.Name || '')) * dir
    }

    if (k === 'size') {
      const sa = (A?.Size ?? 0), sb = (B?.Size ?? 0)
      const c = sa === sb ? 0 : (sa < sb ? -1 : 1)
      return (c || cmp(A?.Name || '', B?.Name || '')) * dir
    }

    if (k === 'modified') {
      const ta = A?.ModifiedAt ? +new Date(A.ModifiedAt) : 0
      const tb = B?.ModifiedAt ? +new Date(B.ModifiedAt) : 0
      const c = ta === tb ? 0 : (ta < tb ? -1 : 1)
      return (c || cmp(A?.Name || '', B?.Name || '')) * dir
    }

    return 0
  })

  return data
})


const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

type ItemsFilter = {
  exts?: string[];   // lowercased, no dots, e.g. ["mp3", "wav"]
}

const activeFilter = computed<ItemsFilter | null>(() => {
  const raw = cfg.value.data?.filters
  if (!raw) return null

  // Be forgiving: accept plain objects that look like { exts?: string[] }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as ItemsFilter
  }

  return null
})


const autoColumns = computed(() => {
  if (props.placement?.context === 'sidebar') return 1
  const gridCols = props.placement?.size?.cols || 4
  if (gridCols <= 2) return 1
  if (gridCols <= 3) return 2
  if (gridCols <= 5) return 3
  if (gridCols <= 8) return 4
  return 5
})

const autoItemSize = computed(() => {
  const gridCols = props.placement?.size?.cols || 4
  if (gridCols <= 3) return 'sm'
  if (gridCols <= 6) return 'md'
  return 'lg'
})

const merged = computed(() => ({
  rpath: String(cfg.value.data.rpath ?? ''),
  layout: String(cfg.value.view.layout ?? 'list'),
  columns: cfg.value.view.columns || autoColumns.value,
  itemSize: cfg.value.view.itemSize || autoItemSize.value,
  showHidden: !!(cfg.value.view.showHidden ?? false),
  navigateMode: String(cfg.value.view.navigateMode ?? 'tab').toLowerCase(),
}))

const cwd = ref<string>('')

function isInternalHistory() {
  return (merged.value.navigateMode || 'internal') === 'internal'
}

// ---- PathBar ownership announce ----
watch(cwd, (v) => {
  emit('event', { type: 'cwd-changed', payload: { sourceId: props.sourceId, cwd: v } })
})

watch(
  () => cfg.value.data?.filters,
  () => {
    // Clear selection when filter changes
    selected.value = new Set()
    engine.replaceSelection([], { reason: 'filter-changed' })
  }
)

const entries = ref<Array<{
  Name: string; FullPath: string; Kind?: string; Ext?: string; Size?: number; ModifiedAt?: number; IconKey?: string
}>>([])

function emitSelectionChanged() {
  // Build a lookup from FullPath → entry
  const byPath = new Map<string, (typeof entries.value)[number]>()
  for (const e of entries.value) byPath.set(e.FullPath, e)

  const payload: Array<{
    path: string
    kind: 'file' | 'folder'
    name?: string
    size?: number
    mtime?: number
  }> = []

  for (const fullPath of selected.value) {
    const entry = byPath.get(fullPath)
    if (!entry) {
      payload.push({ path: fullPath, kind: 'file' })
      continue
    }

    const kindStr = entry.Kind?.toLowerCase?.() ?? ''
    const isFolder =
      kindStr.includes('dir') ||   // "Dir", "Directory"
      kindStr === 'folder'

    payload.push({
      path: entry.FullPath,
      kind: isFolder ? 'folder' : 'file',
      name: entry.Name,
      size: entry.Size,
      mtime: entry.ModifiedAt,
    })
  }

  emit('event', { type: 'selectionChanged', payload })
}

// ----- Resizer drag -----
const isResizing = ref(false)

// Adapters
const geo: GeometryAdapter = {
  // Viewport rect in scroller-viewport space
  contentRect() {
    const sc = detailsScrollEl.value!;
    console.log('shitcaca')
    return { x: 0, y: 0, w: sc.clientWidth, h: sc.clientHeight };
  },

  // Item rects in the same scroller-viewport space
  itemRects() {
    const sc = detailsScrollEl.value!;
    const scR = sc.getBoundingClientRect();
    const root = padEl.value ?? sc;
    const rows = root.querySelectorAll<HTMLElement>('.row[data-path]');
    const arr: Array<{ id: string; rect: Rect }> = [];
    rows.forEach(row => {
      const rr = row.getBoundingClientRect();
      arr.push({
        id: row.dataset.path!,
        rect: {
          x: rr.left - scR.left,
          y: rr.top  - scR.top,
          w: rr.width,
          h: rr.height,
        },
      });
    });
    return arr;
  },

  // Pointer in the same scroller-viewport space
  pointFromClient(clientX, clientY) {
    const sc = detailsScrollEl.value!;
    const scR = sc.getBoundingClientRect();
    return { x: clientX - scR.left, y: clientY - scR.top };
  },
};

const scroller: ScrollerAdapter = {
  scrollTop() { return (detailsScrollEl.value ?? scrollEl.value)!.scrollTop; },
  maxScrollTop() {
    const el = (detailsScrollEl.value ?? scrollEl.value)!;
    return Math.max(0, el.scrollHeight - el.clientHeight);
  },
  scrollBy(dy) {
    // Only allow when the pointer is truly outside the viewport,
    // measured in the same coordinate space (pad-space) as the driver.
    const outside = !pointerInsideViewportFromClient(lastClientX, lastClientY);
    if (!outside) return;
    (detailsScrollEl.value ?? scrollEl.value)!.scrollTop += dy;
  },
};

let lastClientX = 0, lastClientY = 0;

// Reuse the adapter's math so we're 100% consistent with pad-space
function pointerInsideViewportFromClient(cx: number, cy: number) {
  const cr = geo.contentRect();
  const p  = geo.pointFromClient(cx, cy);
  return p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h;
}

function createItemsAdapter(vm): PickerSurfaceAdapter {
  return {
    getCwd: () => vm.cwd,
    getSelection: () => [...vm.selectionAbs],
    setSelection: paths => vm.setSelectionByPaths(paths),

    navigateTo: path => vm.navigateTo(path),

    onCwdChange: cb => vm.on('cwd-changed', cb),
    onSelectionChange: cb => vm.on('selection-changed', cb),
    onItemActivate: cb => vm.on('item-activate', cb),

    setPickerMode: mode => vm.setPickerMode(mode),
    setFilters: (filters, idx) => vm.setFilters(filters, idx),
    setSuggestedName: name => vm.setSuggestedName(name),
  };
}

const driver = createMarqueeDriver(
  {
    enabled: true,
    startThresholdPx: 6,
    fps: 30,                   // ← your SELECTION_FPS
    guardTopPx: 0,             // set to header height if needed
    autoscroll: { enabled: true, baseSpeed: 2400, speedMultiplier: 1.75, maxDistancePx: 240 },
    combine: 'auto',           // Shift→add, Ctrl/Cmd→toggle, else replace
    policy: /Mac/i.test(navigator.platform) ? 'mac' : 'windows',
  },
  geo,
  scroller,
  {
    replaceSelection: (...args) => engine.replaceSelection(...args as any),
    getSelected: () => engine.getSelected(),
  },
  {
    rectChanged: (r) => {
      if (r) {
        const st = detailsScrollEl.value?.scrollTop ?? 0; // current scrollTop of .details-scroll
        marqueeRect.value = { x: r.x, y: r.y + st, w: r.w, h: r.h };
        squelchNextPlaneClick = (r.w > 0 || r.h > 0);
      } else {
        marqueeRect.value = null;
      }
    },
    log: (e) => console.debug('[marquee]', e),
  }
);

function sizeTokens(Size?: string) {
  const s = (Size || 'md').toLowerCase()
  if (s === 'sm') return { padY: 8, padX: 10, radius: 8, gap: 6, font: 0.95, title: 600 }
  if (s === 'lg') return { padY: 14, padX: 14, radius: 12, gap: 10, font: 1.05, title: 650 }
  return { padY: 10, padX: 12, radius: 10, gap: 8, font: 1.0, title: 600 }
}

// helper to package modifiers
function modsFromEvent(e: PointerEvent | MouseEvent | KeyboardEvent) {
  return { ctrl: e.ctrlKey || false, meta: (e as any).metaKey || false, shift: e.shiftKey || false, alt: e.altKey || false };
}
// Engine
const itemsAdapter: ItemsAdapter = {
  orderedIds() {
    // strictly order by the current DOM rows; no layout needed
    const root = padEl.value ?? detailsScrollEl.value ?? scrollEl.value;
    if (!root) return [];
    const rows = root.querySelectorAll<HTMLElement>('.row[data-path]');
    return Array.from(rows).map(r => r.dataset.path!).filter(Boolean);
  }
};

const engine = createSelectionEngine(
  {
    dragThresholdPx: 6,
    policy: /Mac/i.test(navigator.platform) ? 'mac' : 'windows'
  },
  itemsAdapter,
  {
    selectionChanged: (set) => {
      selected.value = new Set(set)
      emitSelectionChanged()
    },
    focusChanged: (i) => { focusIndex.value = i; },
    //log: (e) => console.debug('[sel]', e.reason, e.selected, e),
  }
);

watch(focusIndex, (idx) => {
  if (idx != null) scrollRowIntoView(idx);
});

function planeEl(): HTMLElement {
  return (merged.value.layout === 'details' && detailsScrollEl.value)
    ? detailsScrollEl.value
    : (scrollEl.value as HTMLElement)
}

// --- Column widths now include NAME so each divider moves the column under it ---
type DetailWeights = { name: number; ext: number; size: number; mod: number }
const defaultPx = { name: 420, ext: 110, size: 130, mod: 220 }

// Normalize any numbers to a nice total (100) for persistence/readability.
function normalizeWeights<T extends Record<string, number>>(o: T): DetailWeights {
  const sum = Math.max(
    1,
    (o.name ?? 0) + (o.ext ?? 0) + (o.size ?? 0) + (o.mod ?? 0)
  )
  const scale = 100 / sum
  return {
    name: (o.name ?? 0) * scale,
    ext:  (o.ext  ?? 0) * scale,
    size: (o.size ?? 0) * scale,
    mod:  (o.mod  ?? 0) * scale,
  }
}

// One-time migration: prefer saved weights; else derive from old px (detailCols); else defaults.
function initialWeights(): DetailWeights {
  const saved = props.config?.view?.detailWeights as Partial<DetailWeights> | undefined
  if (saved && typeof saved.name === 'number') return normalizeWeights(saved as any)

  const oldPx = props.config?.view?.detailCols as Partial<Record<keyof DetailWeights, number>> | undefined
  if (oldPx && typeof oldPx.name === 'number') return normalizeWeights(oldPx as any)

  return normalizeWeights(defaultPx)
}

// Our reactive weights
const colW = ref<DetailWeights>(initialWeights())

// computed CSS value for details grid
const detailsCols = computed(() =>
  `minmax(${NAME_MIN}px, ${colW.value.name}fr) ` +
  `minmax(${EXT_MIN }px, ${colW.value.ext }fr) ` +
  `minmax(${SIZE_MIN}px, ${colW.value.size}fr) ` +
  `minmax(${MIN_MOD_PX}px, ${colW.value.mod }fr)`
)

const anchorIndex = ref<number | null>(null)   // selection anchor for Shift-range

// --- Focus management: keep focus on the scroller so rows don't show the white ring
function refocusScrollerAfterEvent(ev?: Event) {
  const t = (ev?.currentTarget as HTMLElement | null)
  // blur the clicked button first (prevents UA ring from sticking)
  t?.blur?.()
  // then return focus to the scroll area on the next frame
  requestAnimationFrame(() => {
    scrollEl.value?.focus?.({ preventScroll: true })
  })
}

function measureScrollbarWidth() {
  const el = detailsScrollEl.value;
  const host = detailsRootEl.value;
  if (!el || !host) return;

  // What the browser is actually reserving for the end gutter / scrollbar.
  const raw = Math.max(0, el.offsetWidth - el.clientWidth);

  // If we’re basically at the minimum possible grid width, don’t add extra header padding.
  // This avoids the “compensates twice when there’s no room left” look.
  const minSum = NAME_MIN + EXT_MIN + SIZE_MIN + MIN_MOD_PX;     // track mins
  const gap =  (parseFloat(getComputedStyle(host).getPropertyValue('--space-xs')) || 6) * 3; // 3 gaps
  const padX = (parseFloat(getComputedStyle(host).getPropertyValue('--space-sm')) || 8) * 2; // left+right
  const contentW = contentGridWidth();                            // your helper (header/rows width)
  const atMinish = contentW <= (minSum + gap + padX + 1);

  const width = atMinish ? 0 : raw;
  sbw.value = width;
  host.style.setProperty('--sbw', `${width}px`);
}

function selectOnly(idx: number) {
  const path = sortedEntries.value[idx]?.FullPath
  if (!path) return
  selected.value = new Set([path])
  focusIndex.value = idx
  anchorIndex.value = idx
}

function contentGridWidth(): number {
  const hdrInner = headerEl.value?.querySelector<HTMLElement>('.details-header-inner')
  if (hdrInner) return hdrInner.clientWidth
  const pad = padEl.value
  if (pad) {
    const cs = getComputedStyle(pad)
    const pl = parseFloat(cs.paddingLeft) || 0
    const pr = parseFloat(cs.paddingRight) || 0
    return pad.clientWidth - pl - pr
  }
  const el = planeEl()
  return el ? el.clientWidth : 0
}

function onRowDblClick(e: { FullPath: string }, idx: number, ev?: MouseEvent) {
  selectOnly(idx)
  refocusScrollerAfterEvent(ev)
  openEntry(e.FullPath)
}

// =========================
// Keyboard navigation
// =========================
function scrollRowIntoView(idx: number) {
  const el = planeEl()
  if (!el) return
  const rows = el.querySelectorAll<HTMLElement>('.row[data-path]')
  const row = rows[idx]
  if (!row) return

  const cr = el.getBoundingClientRect()
  const rr = row.getBoundingClientRect()

  // Header lives inside the same scroller, so sticky top is 0 here.
  const stickyTopPx = 0

  if (rr.top < cr.top + stickyTopPx) el.scrollTop -= (cr.top + stickyTopPx - rr.top)
  else if (rr.bottom > cr.bottom)    el.scrollTop += (rr.bottom - cr.bottom)
}

function onKeyDown(ev: KeyboardEvent) {
  if (!sortedEntries.value.length) return
  
  // F2 = Rename selected item
  if (ev.key === 'F2') {
    ev.preventDefault()
    ev.stopPropagation()
    
    const selectedPaths = Array.from(selected.value)
    console.debug('[items] F2 pressed, selected:', selectedPaths)
    
    if (selectedPaths.length === 1) {
      console.debug('[items] Starting rename for:', selectedPaths[0])
      startItemRename(selectedPaths[0])
    } else if (selectedPaths.length === 0) {
      console.debug('[items] F2: No selection')
    } else {
      console.debug('[items] F2: Multiple selection, cannot rename')
    }
    return  // Don't continue to arrow key handling
  }
  
  const key =
    ev.key === 'ArrowDown' ? 'Down' :
    ev.key === 'ArrowUp'   ? 'Up'   :
    ev.key === 'Home'      ? 'Home' :
    ev.key === 'End'       ? 'End'  : null
  if (!key) return

  ev.preventDefault()
  ev.stopPropagation()
  engine.kbd(key as any, modsFromEvent(ev))
}

function isOnScrollbar(el: HTMLElement, ev: PointerEvent) {
  const r = el.getBoundingClientRect();
  const sb = sbw.value || 0;             // you already measure this
  // treat the last sb px on the end as the scrollbar gutter
  return ev.clientX >= (r.right - sb - 1);
}

function onSurfacePointerDown(ev: PointerEvent) {
  if (merged.value.layout !== 'details' || ev.button !== 0) return;
  const t = ev.target as HTMLElement | null;
  const plane = detailsScrollEl.value!;
  if (t?.closest('.row[data-path], [draggable="true"]')) return;
  if (isOnScrollbar(plane, ev)) return;

  (ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId);

  // Ensure the widget owns focus on any left click in the canvas
  scrollEl.value?.focus({ preventScroll: true })

  lastClientX = ev.clientX; lastClientY = ev.clientY;
  lastScrollTopForDrag = detailsScrollEl.value!.scrollTop;  // add this
  driver.pointerDown(ev, modsFromEvent(ev));

  window.addEventListener('pointerup', onSurfacePointerUp, { once: true });
  ev.preventDefault();
}

function isInsideScrollRect(cx: number, cy: number) {
  const sc = detailsScrollEl.value;
  if (!sc) return false;
  const r = sc.getBoundingClientRect();
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
}

function isOverSelectedRowAtPoint(cx: number, cy: number) {
  const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
  const row = el?.closest('.row[data-path]') as HTMLElement | null;
  if (!row) return false;
  const id = row.dataset.path!;
  return selected.value.has(id);
}

function onPlaneScroll() {
  if (!marqueeActive.value) return;
  const sc = detailsScrollEl.value!;
  const dy = sc.scrollTop - lastScrollTopForDrag;
  if (dy) {
    driver.adjustForScroll(dy);                 // existing
    lastScrollTopForDrag = sc.scrollTop;
  }
}

function onSurfacePointerMove(ev: PointerEvent) {
  lastClientX = ev.clientX; lastClientY = ev.clientY;   // keep coords
  driver.pointerMove(ev);
}

function onSurfacePointerUp(ev: PointerEvent) {
  const wasMarquee = marqueeActive.value; // snapshot before driver clears it

  if (wasMarquee) {
    const sc = detailsScrollEl.value!;
    const dy = sc.scrollTop - lastScrollTopForDrag;
    if (dy) {
      driver.adjustForScroll(dy);
      lastScrollTopForDrag = sc.scrollTop;
      driver.recomputeNow('plane:flush-before-up'); // optional
    }
  }

  driver.pointerUp(ev);
  window.removeEventListener('pointerup', onSurfacePointerUp);

  // Only treat as a "click" if no marquee was shown
  if (!wasMarquee) {
    const inside = isInsideScrollRect(ev.clientX, ev.clientY);
    const overSelected = isOverSelectedRowAtPoint(ev.clientX, ev.clientY);
    if (inside && !overSelected) {
      engine.replaceSelection([], { reason: 'plane:click-up-outside' });
    }
  }
}

async function applyExternalCwd(path: string, opts?: { mode?: 'push' | 'replace'; focus?: boolean }) {
  if (!path) return
  
  // Apply and load
  cwd.value = path
  await loadDir(path)
}


function onSurfaceClick(ev: MouseEvent) {
  if (squelchNextPlaneClick) return;
  const t = ev.target as HTMLElement | null;
  if (!t?.closest('.row[data-path]')) {
    engine.replaceSelection([], { reason: 'plane:clear' });
  }
}

/* -----------------------------------------------
   Data / sorting / UI (unchanged)
------------------------------------------------ */
void loadIconPack()

function iconText(e: any) {
  return iconFor({ kind: e?.Kind, ext: e?.Ext, iconKey: e?.IconKey }, 32)
}
function iconIsImg(e: any) {
  const v = iconFor({ kind: e?.Kind, ext: e?.Ext, iconKey: e?.IconKey }, 32)
  return typeof v === 'string' && v.startsWith('data:image/')
}
function iconSrc(e: any) {
  return iconFor({ kind: e?.Kind, ext: e?.Ext, iconKey: e?.IconKey }, 32)
}

function sizeParts(bytes?: number | null): { num: string; unit: string } {
  if (bytes == null || bytes < 0) return { num: '', unit: '' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  const num = i === 0
    ? Math.round(n).toString()
    : (n < 10 ? n.toFixed(1) : Math.round(n).toString())
  return { num, unit: units[i] }
}

const hour12Pref = new Intl.DateTimeFormat().resolvedOptions().hour12 ?? false
const FMT_DATE = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
const FMT_TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: hour12Pref })
function modParts(ms?: number | null): { date: string; time: string } {
  if (ms == null || ms <= 0) return { date: '', time: '' }
  const d = new Date(ms)
  return { date: FMT_DATE.format(d), time: FMT_TIME.format(d) }
}
async function loadDir(path?: string) {
  const p = String(path ?? cwd.value ?? '')
  if (!p) {
    entries.value = []
    return
  }
  loading.value = true
  error.value = ''

  try {
    // Centralized lazy-consent logic lives in fsListDirSmart now
    const res = await fsListDirSmart('items', props.sourceId, p)

    let list = Array.isArray((res as any).entries) ? (res as any).entries : []
    if (!merged.value.showHidden) {
      list = list.filter((e: any) => !String(e?.Name || '').startsWith('.'))
    }

    entries.value = list.sort((a: any, b: any) =>
      String(a?.Name ?? '').localeCompare(
        String(b?.Name ?? ''),
        undefined,
        { numeric: true, sensitivity: 'base' },
      )
    )

    const lnks = entries.value
      .filter(e =>
        e?.Kind === 'link' &&
        e?.Ext === '.lnk' &&
        (!e.IconKey || !String(e.IconKey).startsWith('link:'))
      )
      .map(e => e.FullPath)

    if (lnks.length) {
      try {
        const r = await shortcutsProbe(lnks)
        const arr = (r?.results ?? []) as Array<{ path: string; IconKey: string }>
        if (arr.length) {
          const map = new Map(arr.map(x => [x.path, x.IconKey]))
          for (const e of entries.value) {
            const k = map.get(e.FullPath)
            if (k) e.IconKey = k
          }
        }
      } catch {
        // ignore
      }
    }

    const n = await ensureIconsFor(
      entries.value.map(e => ({ iconKey: e.IconKey })),
      32
    )
    if (n > 0) iconsTick.value++

  } catch (e: any) {
    error.value = String(e?.message ?? e ?? 'Error')
    entries.value = []
  } finally {
    loading.value = false
  }
}


async function openEntry(FullPath: string) {
  if (!FullPath) return

  try {
    const v = await fsValidate(FullPath)
    const isDir = !!v?.isDir

    if (isDir) {
      // Widget-level rule: folders → nav
      props.runAction?.({ type: 'nav', to: FullPath })
    } else {
      // Widget-level rule: files → open
      props.runAction?.({ type: 'open', path: FullPath })
    }
  } catch (err) {
    console.error('[items] openEntry failed:', err)
  }
}


watch(
  detailsScrollEl,
  (el, _prev, onCleanup) => {
    if (!el || !detailsRootEl.value) return

    //measureScrollbarWidth()

    // ⚡ PERFORMANCE: Debounce to only measure after resize settles
    let timeoutId: number | undefined
    
    const debouncedMeasure = () => {
      clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        measureScrollbarWidth()
      }, 150) // Wait 150ms after last resize
    }

    const ro = new ResizeObserver(debouncedMeasure)
    ro.observe(el)
    
    onCleanup(() => {
      ro.disconnect()
      clearTimeout(timeoutId)
    })
  },
  { flush: 'post' }
)

// persist on change (optional)
watch(colW, (w) => {
  emit('updateConfig', {
    ...props.config,
    view: {
      ...props.config?.view,
      // Save the ratios going forward
      detailWeights: { ...normalizeWeights(w) },
      // (Optional) you can drop detailCols entirely once you no longer need backward compat
    }
  })
}, { deep: true })


watch(
  () => [props.config?.view?.sortKey, props.config?.view?.sortDir],
  ([k, d]) => {
    if (k && ['name', 'kind', 'ext', 'size', 'modified'].includes(k as string)) sortKey.value = k as SortKey
    if (d && (d === 'asc' || d === 'desc')) sortDir.value = d
  }
)

// Helper: which pair does this handle separate?
function pairForHandle(col: ResCol): [ResCol, ResCol] {
  if (col === 'name') return ['name', 'ext']
  if (col === 'ext')  return ['ext',  'size']
  if (col === 'size') return ['size', 'mod']
  // 'mod' has no right-side handle
  return ['mod', 'mod']
}

watch(
  () => merged.value.rpath,
  async (rp) => {
    if (!rp) return
    // initialize cwd + load entries
    cwd.value = rp
    await loadDir(rp)
    // (cwd watcher already emits 'cwd-changed' to host)
  },
  { immediate: true }
)

// Helper: current header cell widths (px)
function measureHeaderColsPx() {
  const root = headerEl.value?.querySelector<HTMLElement>('.details-header-inner')
  if (!root) return { name: 0, ext: 0, size: 0, mod: 0 }
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)?.getBoundingClientRect().width || 0
  return {
    name: q('.th-name'),
    ext:  q('.th-ext'),
    size: q('.th-size'),
    mod:  q('.th-mod'),
  }
}

let resizing: null | {
  left: ResCol
  right: ResCol
  startX: number
  // px at drag start
  startLeftPx: number
  startRightPx: number
  pairPx: number
  // weights at drag start
  startLeftW: number
  startRightW: number
  pairW: number
} = null

function startResize(col: ResCol, ev: PointerEvent) {
  const [left, right] = pairForHandle(col)
  if (left === 'mod' && right === 'mod') return

  const px = measureHeaderColsPx()

  const startLeftPx  = px[left]
  const startRightPx = px[right]
  const pairPx = Math.max(1, startLeftPx + startRightPx) // avoid div-by-zero

  const startLeftW  = colW.value[left]
  const startRightW = colW.value[right]
  const pairW = Math.max(0.0001, startLeftW + startRightW)

  const target = ev.currentTarget as HTMLElement
  target.setPointerCapture?.(ev.pointerId)

  resizing = {
    left, right, startX: ev.clientX,
    startLeftPx, startRightPx, pairPx,
    startLeftW, startRightW, pairW
  }
  isResizing.value = true
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd, { once: true })
  ev.preventDefault()
  ev.stopPropagation()
}

function onResizeMove(ev: PointerEvent) {
  if (!resizing) return
  const dx = ev.clientX - resizing.startX

  // pixel mins for the pair
  const minBy: Record<ResCol, number> = {
    name: NAME_MIN, ext: EXT_MIN, size: SIZE_MIN, mod: MIN_MOD_PX
  }

  // desired new left px, clamped so both columns respect their mins
  const minLeft  = minBy[resizing.left]
  const minRight = minBy[resizing.right]
  const maxLeft  = Math.max(minLeft, resizing.pairPx - minRight)
  const newLeftPx = Math.min(Math.max(resizing.startLeftPx + dx, minLeft), maxLeft)

  // Convert px back to weights using the pair’s px↔weight ratio captured at drag start
  const k = resizing.pairW / resizing.pairPx // weight per pixel within the pair at drag-start
  const newLeftW  = newLeftPx * k
  const newRightW = resizing.pairW - newLeftW

  colW.value = {
    ...colW.value,
    [resizing.left]:  newLeftW,
    [resizing.right]: newRightW,
  } as DetailWeights
}

function onResizeEnd() {
  window.removeEventListener('pointermove', onResizeMove)
  isResizing.value = false
  // Optional: normalize so the saved numbers are tidy
  if (colW.value) colW.value = normalizeWeights(colW.value)
  resizing = null
}

// swap your onHeaderClickSafe with this:
function onHeaderClickFiltered(nextKey: SortKey, ev: MouseEvent) {
  // if the click started on a resizer (or inside it), ignore
  const t = ev.target as HTMLElement | null
  if (t && t.closest('.resize-handle')) return
  onHeaderClick(nextKey)
}

function sizeLabel(e: any) {
  const p = sizeParts(e?.Size)
  if (!p.num) return ''
  return `${p.num} ${p.unit}`
}
function modLabel(e: any) {
  const p = modParts(e?.ModifiedAt)
  if (!p.date && !p.time) return ''
  return `${p.date} ${p.time}`
}

function onHeaderClick(nextKey: SortKey) {
  if (sortKey.value === nextKey) sortDir.value = (sortDir.value === 'asc' ? 'desc' : 'asc')
  else { sortKey.value = nextKey; sortDir.value = 'asc' }
}

const hostVars = computed(() => ({
  '--items-border':     props.theme?.border    || 'var(--border, #555)',
  '--items-fg':         props.theme?.fg        || 'var(--fg, #eee)',
  '--items-bg':         props.theme?.bg        || 'var(--surface-2, transparent)',
  '--items-header-sep': props.theme?.headerSep || 'rgba(255,255,255,.22)',
}) as Record<string, string>)

/* -----------------------------------------------
   Drag & drop (unchanged; suppress when marqueeing)
------------------------------------------------ */
// Normalizes directory paths for comparison (same logic as TabContent)
function normalizeDir(p: string | null | undefined): string {
  if (!p) return ''
  // Normalize to backslashes and trim trailing separators, then lowercase
  return p.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

const isDragging = ref(false)
const isDropActive = ref(false)

function onItemDragStart(e: any, event: DragEvent) {
  if (!event.dataTransfer) return;
  if (marqueeActive.value) { event.preventDefault(); return; } // ← suppress when marqueeing

  isDragging.value = true;

  try {
    const paths = (selected.value.size > 0 ? [...selected.value] : [e.FullPath]);

    const payload = createGexPayload(
      'gex/file-refs',
      paths.map(p => ({
        path: p,
        name: entries.value.find(x => x.FullPath === p)?.Name ?? '',
        size: entries.value.find(x => x.FullPath === p)?.Size ?? 0,
        mimeType: guessMimeType(p),
        isDirectory: entries.value.find(x => x.FullPath === p)?.Kind === 'dir',
      })),
      { widgetType: 'items', widgetId: props.sourceId }
    );

    setGexPayload(event.dataTransfer, payload);

    event.dataTransfer.effectAllowed = 'copyMove';

    const preview = createDragPreview({
      label: (selected.value.size > 1 ? `${paths.length} items` : e.Name),
      icon: e.Kind === 'dir' ? '📁' : '📄',
      count: paths.length
    });
    event.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => preview.remove(), 0);
  } catch (err) {
    console.error('[Items] drag failed:', err);
  }
}


function onItemDragEnd() {
  isDragging.value = false;
}

/**
 * Root drag-over handler: detect our DnD payload and highlight the pane.
 * We only react to gexplorer payloads and ignore our own widget as source.
 */
function onRootDragOver(ev: DragEvent) {
  const dt = ev.dataTransfer
  if (!dt) return

  const has = hasGexPayload(dt)

  // Optional debug:
  // console.log('[Items] dragover', { types: Array.from(dt.types || []), has })

  if (!has) return

  ev.preventDefault()
  dt.dropEffect = 'move'
  isDropActive.value = true
}

function onRootDragLeave(ev: DragEvent) {
  const current = ev.currentTarget as HTMLElement | null;
  const related = ev.relatedTarget as HTMLElement | null;

  if (current && related && current.contains(related)) return;

  isDropActive.value = false;
}

async function onRootDrop(ev: DragEvent) {
  const payload = extractGexPayload(ev)
  isDropActive.value = false

  if (!payload || payload.type !== 'gex/file-refs') return

  const srcId = (payload as any).source?.widgetId
  if (srcId === props.sourceId) {
    // Dropping back onto the same pane → ignore
    return
  }

  ev.preventDefault()
  ev.stopPropagation()

  try {
    // 1) Run the DnD auth layer (same as before)
    const auth = await authorizeFileRefs('items', props.sourceId, payload)
    if (!auth?.ok) {
      console.warn('[Items] Drop not authorized:', auth?.reason)
      return
    }

    const refs = payload.data || []
    if (!refs.length) return

    const target = cwd.value || merged.value.rpath || ''
    if (!target) {
      console.warn('[Items] Drop ignored: no cwd')
      return
    }

    const destNorm = normalizeDir(target)
    const sources: string[] = []

    for (const r of refs as any[]) {
      const p = String(r?.path ?? '')
      if (!p) continue
      // simple dirname
      const m = p.match(/^(.*[\\/])[^\\/]+$/)
      const parentNorm = normalizeDir(m ? m[1] : '')
      if (parentNorm === destNorm) {
        // already in this folder → no-op
        continue
      }
      sources.push(p)
    }

    if (!sources.length) {
      console.debug('[Items] drop: all refs already in target; nothing to copy')
      return
    }

    // 2) Kick off the fs.copy job via the fs API
    //    This will:
    //      - ensure widget hash
    //      - ensure consent (ticketFor -> ensureConsent)
    //      - enqueue a queued fs.copy job
    const items = sources.map(from => ({ from, to: target }))

    // Optional: listen to global queue updates for this job
    const jobPromise = fsMove(items, 'items', props.sourceId)

    // If you want per-widget events:
    const off = onFsQueueUpdate(job => {
      // Narrow to our job if you want; here we just echo all updates.
      if (job.op.kind === 'fs.move') {
        emit('event', {
          type: 'fs-job:update',
          payload: {
            jobId: job.id,
            state: job.state,
            progress: job.progress,
            error: job.error,
          },
        })

        if (
          job.state === 'succeeded' ||
          job.state === 'failed' ||
          job.state === 'cancelled'
        ) {
          off()
          emit('event', {
            type: 'fs-job:finished',
            payload: {
              jobId: job.id,
              state: job.state,
              error: job.error,
            },
          })
        }
      }
    })

    // Also emit a started event immediately if you like
    emit('event', {
      type: 'fs-job:started',
      payload: {
        kind: 'fs.move',   // 🔁 was 'fs.copy'
        target,
        items,
      },
    })

    jobPromise
    .then(async job => {
      console.log('[Items] fsMove done:', {
        state: job.state,
        error: job.error,
        op: job.op,
      })

      if (job.state === 'succeeded') {
        // 🔄 1) Refresh *this* pane’s cwd
        const path = cwd.value || merged.value.rpath || ''
        if (path) {
          await loadDir(path)
        }
        console.log('srcId:', srcId)
        // 🔔 2) Ask the *source* widget to refresh itself too
        //      (srcId is captured from outer scope)
        if (srcId && srcId !== props.sourceId) {
        console.log('trying')
          sendWidgetMessage({
            from: props.sourceId,
            to: srcId,
            topic: 'fs:refresh-after-drop',
            payload: {
              kind: 'fs.move',
              target: path,                 // dest folder after drop
            },
          })
        }
      }
    })
    .catch(err => {
      console.error('[Items] fsMove crashed:', err)
    })


  } catch (err) {
    console.error('[Items] drop failed:', err)
  }
}


function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
    flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', opus: 'audio/opus',
    mp4: 'video/mp4', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain', json: 'application/json', pdf: 'application/pdf'
  }
  return map[ext] || 'application/octet-stream'
}

/**
 * Get the directory portion of a path.
 */
function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const idx = Math.max(
    normalized.lastIndexOf('\\'),
    normalized.lastIndexOf('/')
  )
  return idx < 0 ? '' : normalized.slice(0, idx)
}

/**
 * Join path segments.
 */
function joinPath(parent: string, name: string): string {
  const sep = parent.includes('\\') ? '\\' : '/'
  return parent.replace(/[\\/]+$/, '') + sep + name
}

/* -----------------------------------------------
   Edit helpers
------------------------------------------------ */
function updateColumns(delta: number) {
  if (!props.editMode) return
  const current = merged.value.columns
  const next = Math.max(1, Math.min(8, current + delta))
  emit('updateConfig', { ...props.config, view: { ...props.config?.view, columns: next } })
}

function cycleItemSize() {
  if (!props.editMode) return
  const sizes = ['sm', 'md', 'lg']
  const i = sizes.indexOf(merged.value.itemSize)
  emit('updateConfig', { ...props.config, view: { ...props.config?.view, itemSize: sizes[(i + 1) % sizes.length] } })
}

function cycleLayout() {
  if (!props.editMode) return
  const layouts = ['list', 'grid', 'details']
  const i = layouts.indexOf(merged.value.layout)
  emit('updateConfig', { ...props.config, view: { ...props.config?.view, layout: layouts[(i + 1) % layouts.length] } })
}

/**
 * Handle rename commit - perform the actual file rename.
 */
async function handleRenameCommit(oldPath: string, newName: string): Promise<void> {
  const parentDir = dirname(oldPath)
  const newPath = joinPath(parentDir, newName)
  
  console.debug('[items] Renaming:', { oldPath, newPath, parentDir, newName })
  
  try {
    // Use fsRename for same-directory rename operations
    await fsRename(oldPath, newPath, 'items', props.sourceId)
    
    console.debug('[items] Rename successful')
    
    // Refresh the current directory
    await loadDir(cwd.value)
    
  } catch (err) {
    console.error('[items] Rename failed:', err)
    // TODO: Show error notification to user
  }
}

/**
 * Start rename mode for a specific item.
 */
function startItemRename(itemPath: string): void {
  console.log('[items] startItemRename called with:', itemPath)
  
  startRename(itemPath, {
    widgetId: props.sourceId,  // 👈 ADD THIS LINE
    selectBasename: true,
    onCommit: async (newName: string) => {
      console.log('[items] Rename commit:', { oldPath: itemPath, newName })
      await handleRenameCommit(itemPath, newName)
    },
    onCancel: () => {
      console.log('[items] Rename cancelled for:', itemPath)
    }
  })
}

onMounted(async () => {
  console.log('[items] mount, sourceId =', props.sourceId)

  offWidgetMsg.value = onWidgetMessage(props.sourceId, (msg) => {
    const current = cwd.value || merged.value.rpath || ''
    console.log('[items] onWidgetMessage', {
      sourceId: props.sourceId,
      topic: msg.topic,
      payload: msg.payload,
      current,
      cwd: cwd.value,
      rpath: merged.value.rpath,
    })

    if (!current) return

    if (msg.topic === 'fs:refresh-after-drop') {
      const target = String(msg.payload?.target || '')
      if (target && normalizeDir(target) !== normalizeDir(current)) {
        console.log('[items] fs:refresh-after-drop → reloading', current)
        loadDir(current)
      }
    }

    if (msg.topic === 'fs:changed') {
      const root = String(msg.payload?.root || '')
      console.log('[items] fs:changed candidate', {
        rootNorm: normalizeDir(root),
        currentNorm: normalizeDir(current),
      })
      if (root && normalizeDir(root) === normalizeDir(current)) {
        console.log('[items] fs:changed → reloading', current)
        loadDir(current)
      }
    }
  })

  await nextTick()
  requestAnimationFrame(() => {
    measureScrollbarWidth()
  })
})

// Listen for refresh and rename messages from context menu
const offRefresh = onWidgetMessage(props.sourceId, async (msg) => {
  if (msg.topic === 'items:refresh') {
    console.debug('[items] Refreshing from context menu, current cwd:', cwd.value)
    await loadDir(cwd.value)
  }
  
  // NEW: Handle rename requests
  if (msg.topic === 'items:startRename') {
    const path = msg.payload?.path
    if (path) {
      console.debug('[items] Starting rename for:', path)
      startItemRename(path)
    }
  }
})

onBeforeUnmount(() => {
  try {
    if (typeof offRefresh === 'function') offRefresh()
  } catch (e) {
    console.warn('[items] offRefresh cleanup failed', e)
  }

  try {
    offWidgetMsg.value?.()
    offWidgetMsg.value = null
  } catch {}

  try {
    engine.destroy()
  } catch {}
})

function getNavState() { return { canGoBack: false, canGoForward: false, cwd: cwd.value } }

defineExpose({ applyExternalCwd, getNavState })
</script>

<template>
  <div
  class="items-root"
  v-context-menu="contextMenuOptions"
  :style="hostVars"
    :class="{
      dragging: isDragging,
      'drag-selecting': marqueeActive,
      'drop-active': isDropActive,
    }"
    @dragover="onRootDragOver"
    @dragleave="onRootDragLeave"
    @drop="onRootDrop"
  >
    <!-- Edit mode toolbar -->
    <div
      v-if="editMode"
      class="edit-toolbar"
      @pointerdown.stop
    >
    <!-- Validate if deprecated -->
      <div class="edit-group">
        <span class="edit-label">Layout:</span>
        <button class="edit-btn" @click.stop="cycleLayout" :title="`Current: ${merged.layout}`">
          {{ merged.layout === 'list' ? '☰' : merged.layout === 'grid' ? '▦' : '▤' }}
        </button>
      </div>

      <div v-if="merged.layout === 'grid'" class="edit-group">
        <span class="edit-label">Columns:</span>
        <button class="edit-btn" @click.stop="updateColumns(-1)" :disabled="merged.columns <= 1">−</button>
        <span class="edit-value">{{ merged.columns }}</span>
        <button class="edit-btn" @click.stop="updateColumns(1)" :disabled="merged.columns >= 8">+</button>
      </div>

      <div class="edit-group">
        <span class="edit-label">Size:</span>
        <button class="edit-btn" @click.stop="cycleItemSize" :title="`Current: ${merged.itemSize}`">
          {{ merged.itemSize.toUpperCase() }}
        </button>
      </div>
    </div>

    <!-- Make the scroller focusable + capture keyboard -->
    <div
      class="items-scroll-container"
      :class="{ 'is-details': merged.layout === 'details' }"
      ref="scrollEl"
      tabindex="0"
      @keydown="onKeyDown"
      @pointerdown.self="() => { scrollEl?.value?.focus?.({ preventScroll: true }); }"
    >
      <div v-if="loading" class="msg">Loading…</div>
      <div v-else-if="error" class="err">{{ error }}</div>
      <div v-else-if="!merged.rpath" class="msg">(no path)</div>

      <!-- DETAILS VIEW -->

      <div
        v-else-if="merged.layout === 'details'"
        class="details-root"
        :data-icons="iconsTick"
        :style="{ '--cols': detailsCols, '--hdrH': headerH + 'px' }"
        ref="detailsRootEl"
      >
        <!-- Header OUTSIDE the scroll container -->
        <div class="details-header" ref="headerEl">
          <div class="details-header-inner">
            <button class="th th-name" @click="onHeaderClickFiltered('name', $event)">
              <span class="th-label">Name</span>
              <span v-if="sortKey==='name'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              <span class="resize-handle"
                    @pointerdown.stop.prevent="startResize('name', $event)" />
            </button>

            <button class="th th-ext" @click="onHeaderClickFiltered('ext', $event)">
              <span class="th-label">Ext</span>
              <span v-if="sortKey==='ext'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              <span class="resize-handle"
                    @pointerdown.stop.prevent="startResize('ext', $event)" />
            </button>

            <button class="th th-size" @click="onHeaderClickFiltered('size', $event)">
              <span class="th-label">Size</span>
              <span v-if="sortKey==='size'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              <span class="resize-handle"
                    @pointerdown.stop.prevent="startResize('size', $event)" />
            </button>

            <button class="th th-mod" @click="onHeaderClickFiltered('modified', $event)">
              <span class="th-label">Modified</span>
              <span v-if="sortKey==='modified'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </button>
          </div>
        </div>

        <!-- Rows scroller (the interactive plane) -->
        <div
          class="details-scroll"
          ref="detailsScrollEl"
          tabindex="0"
          @pointerdown="onSurfacePointerDown"
          @pointermove="onSurfacePointerMove"
          @pointerup="onSurfacePointerUp"
          @click.capture="onSurfaceClick"
          @scroll.passive="onPlaneScroll"
        >
          <!-- gutters live inside here to match header inner -->
          <div class="details-pad" ref="padEl">
            <div class="details-grid">
              <button
                class="row"
                :key="e.FullPath"
                :data-path="e.FullPath"
                v-for="(e, i) in sortedEntries"
                :class="{ selected: selected.has(e.FullPath) }"
                draggable="true"
                @pointerdown.stop="(ev) => engine.rowDownId(e.FullPath, modsFromEvent(ev))"
                @pointermove.stop="(ev) => engine.rowMove?.(ev.clientX, ev.clientY)"
                @click.stop.prevent="() => engine.rowUpId(e.FullPath)"
                @dblclick.stop.prevent="() => { openEntry(e.FullPath) }"
                @dragstart="(ev) => { engine.dragStart(); onItemDragStart(e, ev as DragEvent) }"
                @dragend="() => { onItemDragEnd(); engine.dragEnd() }"
              >
                <div class="td td-name" :title="e.Name || e.FullPath">
                  <span class="icon">
                    <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
                    <span v-else>{{ iconText(e) }}</span>
                  </span>
                  <span 
                    class="name"
                    :data-rename-id="e.FullPath"
                    :data-rename-value="e.Name"
                    :data-widget-id="props.sourceId"
                  >
                    {{ e.Name || e.FullPath }}
                  </span>
                </div>

                <div class="td td-ext" :title="e.Ext || ''">{{ e.Ext || '' }}</div>

                <div class="td td-size" :title="sizeLabel(e)">
                  <span class="num">{{ sizeParts(e?.Size).num }}</span>
                  <span class="unit">{{ sizeParts(e?.Size).unit }}</span>
                </div>

                <div class="td td-mod" :title="modLabel(e)">
                  <span class="date">{{ modLabel(e).split(' ')[0] }}</span>
                  <span class="time">{{ modParts(e?.ModifiedAt).time }}</span>
                </div>
              </button>
            </div>
            
          </div>
          
          <div
            v-if="marqueeRect"
            class="marquee"
            :style="{
              left:  marqueeRect.x + 'px',
              top:   marqueeRect.y + 'px',
              width: marqueeRect.w + 'px',
              height: marqueeRect.h + 'px'
            }"
          />
        </div>
        
      </div>

      <!-- LIST VIEW -->
      <div v-else-if="merged.layout === 'list'" class="list-root" :data-icons="iconsTick">
          <button
            class="row"
            :data-path="e.FullPath"
            v-for="(e, i) in sortedEntries"
            :class="{ selected: selectedMap[e.FullPath] }"
            draggable="true"
            @pointerdown.stop="(ev) => engine.rowDownId(e.FullPath, modsFromEvent(ev))"
            @pointermove.stop="(ev) => engine.rowMove?.(ev.clientX, ev.clientY)"
            @click.stop.prevent="() => engine.rowUpId(e.FullPath)"
            @dblclick.stop.prevent="() => { openEntry(e.FullPath) }"
            @dragstart="(ev) => { engine.dragStart(); onItemDragStart(e, ev as DragEvent) }"
            @dragend="() => { onItemDragEnd(); engine.dragEnd() }"
          >
          <div class="icon">
            <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
            <span v-else>{{ iconText(e) }}</span>
          </div>
          <div 
            class="name"
            :data-rename-id="e.FullPath"
            :data-rename-value="e.Name"
            :data-widget-id="props.sourceId"
          >
            {{ e.Name || e.FullPath }}
          </div>
        </button>
      </div>

      <!-- GRID VIEW -->
      <div
        v-else-if="merged.layout === 'grid'"
        class="grid-root"
        :data-icons="iconsTick"
        :style="{
          display: 'grid',
          gap: S.gap + 'px',
          padding: S.gap + 'px',
          gridTemplateColumns: `repeat(${Math.max(1, merged.columns)}, minmax(0, 1fr))`
        }"
      >
        <button
          class="row"
          :data-path="e.FullPath"
          v-for="(e, i) in sortedEntries"
          :class="{ selected: selectedMap[e.FullPath] }"
          draggable="true"
          @pointerdown.stop="(ev) => engine.rowDownId(e.FullPath, modsFromEvent(ev))"
          @pointermove.stop="(ev) => engine.rowMove?.(ev.clientX, ev.clientY)"
          @click.stop.prevent="() => engine.rowUpId(e.FullPath)"
          @dblclick.stop.prevent="() => { openEntry(e.FullPath) }"
          @dragstart="(ev) => { engine.dragStart(); onItemDragStart(e, ev as DragEvent) }"
          @dragend="() => { onItemDragEnd(); engine.dragEnd() }"
        >
          <div class="icon">
            <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
            <span v-else>{{ iconText(e) }}</span>
          </div>
          <div 
            class="name"
            :data-rename-id="e.FullPath"
            :data-rename-value="e.Name"
            :data-widget-id="props.sourceId"
          >
            {{ e.Name || e.FullPath }}
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.items-root.drop-active {
  outline: 2px dashed rgba(255, 255, 255, 0.4);
  outline-offset: -2px;
}
/* Details list rows */
.row {
  content-visibility: auto;
  /* Approximate row height; adjust to match your actual row */
  contain-intrinsic-size: 32px;
}
/* ================= THEME / ROOT ================= */
.items-root{
  font-size:var(--font-md);
  color:var(--items-fg);
  --local-font-sm:calc(1em * .85);
  --local-font-md:1em;
  --local-font-lg:calc(1em * 1.15);
  --local-spacing:var(--space-sm);
  --local-radius:var(--radius-md);

  /* gutters for marquee space inside the scroller */
  --items-gutter-left: 5%;
  --items-gutter-right: 5%;
  --items-pad-block: 6px;

  /* column separator color */
  --items-col-sep: color-mix(in oklab, var(--fg, #fff) 12%, transparent);

  height:100%;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  box-sizing:border-box;
  position:relative;
}

/* Scroller: focusable, with left/right gutters */
.items-scroll-container{
  flex:1;
  overflow-y:auto;
  overflow-x:hidden;
  position:relative;
  padding-block: var(--items-pad-block, 6px);
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
  z-index:1;
  outline:none;
  border-top: 1px solid var(--items-header-sep);
  border-bottom: 1px solid var(--items-header-sep);
  border-radius: var(--local-radius);
}
.items-scroll-container:hover{ overscroll-behavior:contain; }

.items-scroll-container.is-details{
  overflow: hidden;            /* stop the outer one from scrolling */
  padding: 0;                  /* remove side/top/bottom padding that was shrinking the inner scroller */
  border-top: 0;               /* optional: keep or drop these borders here */
  border-bottom: 0;            /* you can draw them on .details-pad if you like */
}

/* The scrollport: full height, stable end gutter only */
.details-scroll{
  position: relative;   /* the absolute marquee anchors here */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

/* ADD: the inner pad holds the side gutters + header spacing */
.details-pad{
  position: relative;
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
}

.marquee{
  position: absolute;
  box-sizing: border-box;    /* already present */
  pointer-events: none;
  z-index: 2;
  border: 1px solid var(--accent,#4ea1ff);
  background: color-mix(in oklab, var(--accent,#4ea1ff) 18%, transparent);
  border-radius: 4px;
}

.items-root.dragging{ user-select:none; }

.drag-selecting { user-select: none; }
/* ================ EDIT TOOLBAR ================ */
.edit-toolbar{
  display:flex; gap:var(--space-md); padding:var(--space-sm);
  background:var(--surface-1,#1a1a1a); border-bottom:1px solid var(--border,#555);
  align-items:center; flex-shrink:0; font-size:var(--font-sm);
  position:sticky; top:0; z-index:5; pointer-events:auto;
}
.edit-label{ font-size:var(--local-font-sm);opacity:.7;font-weight:500; }
.edit-value{ font-size:var(--local-font-md);font-weight:600;min-width:20px;text-align:center; }
.edit-btn{
  padding:var(--space-xs) var(--space-sm); border-radius:var(--radius-sm);
  border:1px solid var(--border,#555); background:var(--surface-2,#222); color:var(--fg,#eee);
  cursor:pointer; font-size:var(--local-font-sm); transition:all .15s ease; min-width:28px;text-align:center;
}

/* ================ GENERIC ROW (List/Grid base) ================ */
.row{
  border:1px solid var(--items-border); background:var(--items-bg); color:inherit;
  border-radius:var(--local-radius);
  display:flex; flex-direction:row; gap:var(--local-spacing); align-items:center;
  min-height:calc(var(--base-font-size) * 2.4); padding:var(--space-xs) var(--space-sm);
  box-sizing:border-box; font-size:var(--local-font-md);
}
.row:focus, .row:focus-visible { outline: none !important; }
.row[draggable="true"]{ cursor:grab; }
.row[draggable="true"]:active{ cursor:grabbing; }
.row.selected { box-shadow: inset 0 0 0 2px var(--accent,#4ea1ff) !important; }

/* Base icon size for LIST/GRID (scoped to those layouts only) */
.list-root .icon,
.grid-root .icon{
  width:calc(var(--base-font-size) * 1.4);
  height:calc(var(--base-font-size) * 1.4);
  flex:0 0 calc(var(--base-font-size) * 1.4);
  display:flex; align-items:center; justify-content:center;
}
.list-root .icon img,
.grid-root .icon img{ width:100%; height:100%; object-fit:contain; }

.name{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ================ DETAILS VIEW ONLY ================ */
.details-root{
  --padX: var(--space-sm);
  --padY: var(--space-xs);
  --gap:  var(--space-xs);
  --iconW: calc(1em * 1.4);
  --hdrH: 36px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;                 /* makes inner scroller size correctly */
}

/* Header with outer gutters only */
.details-header{
  position: sticky;
  top: 0;
  z-index: 4;
  height: var(--hdrH);

  /* same gutters as rows, PLUS measured scrollbar width on the right */
  padding-inline: var(--items-gutter-left, 5%)
                  calc(var(--items-gutter-right, 5%) + var(--sbw, 0px));

  background: transparent;
  border-radius: var(--local-radius);
  box-sizing: border-box;
}

.details-header::before{ display:none; }

/* Grid lives inside */
.details-header-inner{
  position: relative;
  height: var(--hdrH);
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;
  padding: 0 var(--padX);
  min-width: 0;
  background: var(--items-header-bg, var(--surface-2,#222));
  border-radius: var(--local-radius);
  overflow: visible;
}

/* Separators between header cells */
.details-header-inner > .th + .th{
  border-left: 1px solid var(--items-col-sep);
  padding-left: var(--space-xs);
}

/* Header cells - NOW WITH BACKGROUND */
.th{
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--padY) 0;        /* side padding comes from header-inner */
  background: transparent;
  border: 0;
  color: inherit;
  font-weight: 600;
  min-width: 0;                  /* labels can ellipsize */
}

.th .th-label{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.th-size,.th-mod{ justify-content:flex-end; text-align:right; }



/* Column separators */
:root, :host{ --items-col-sep: color-mix(in oklab, var(--fg,#fff) 18%, transparent); }
.details-grid   .row > .td + .td{ border-left: 1px solid var(--items-col-sep); padding-left: var(--space-xs); }

/* Resizer handles (not on last column) */
/* Resize handle stays on top and on the actual track edge */
.resize-handle{
  position:absolute; top:0; right:-6px; width:12px; height:100%;
  cursor:col-resize; z-index:2;
}
.resize-handle::after{
  content:""; position:absolute; top:0; bottom:0; left:50%;
  transform:translateX(-0.5px);
  width:1px; background: color-mix(in oklab, var(--fg,#fff) 28%, transparent);
}
.th:hover .resize-handle::after{
  background: color-mix(in oklab, var(--accent,#4ea1ff) 55%, transparent);
}

/* ----- INTERACTIVE PLANE (rows + marquee) lives BELOW the header ----- */
/* Rows (unchanged, just here for context) */
.details-grid{ display: grid; gap: var(--space-xs); }
.details-grid .row{
  display:grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items:center;
  border:1px solid var(--items-border);
  background: var(--items-bg);
  border-radius: var(--local-radius);
  min-height: calc(var(--base-font-size) * 2.4);
  padding: var(--padY) var(--padX);
  box-sizing:border-box;
  cursor:pointer;
  font-size: var(--local-font-md);
}

/* Cells */
.td-name{ display:inline-flex; align-items:center; gap:var(--space-sm); min-width:0; }
.td-ext, .td-size, .td-mod{
  opacity:.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:var(--local-font-sm);
}

/* Numeric alignment */
.td-size, .td-mod{ font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1; }
.td-size{ display:flex; justify-content:flex-end; gap:var(--space-xs); }
.td-mod{ display:flex; justify-content:flex-end; gap:var(--space-sm); }

/* Details icon size (scoped!) */
.details-grid .row > .td + .td{ border-left: 1px solid var(--items-col-sep); padding-left: var(--space-xs); }

/* icon sizing scoped to details */
.details-grid .td-name .icon{
  width:var(--iconW);
  height:var(--iconW);
  flex:0 0 var(--iconW);
  display:flex; align-items:center; justify-content:center; text-align:center;
}
.details-grid .td-name .icon img{
  width:100%; height:100%; object-fit:contain;
}

/* ================ LIST / GRID CONTAINERS ================ */
.list-root{ display:grid; gap:var(--space-xs); }

/* ================ Messages ================ */
.msg,.err{ padding:var(--space-md); font-size:var(--local-font-md); }
.err{ color:#f77; }

</style>