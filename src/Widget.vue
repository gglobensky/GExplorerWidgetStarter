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
  onFsQueueUpdate,
} from '/src/widgets/fs'
import { sendWidgetMessage, onWidgetMessage } from '/src/widgets/instances'
import { loadIconPack, iconFor, ensureIconsFor } from '/src/icons/index.ts'
import { ensureConsent } from '/src/consent/service'
import { createSelectionEngine, type ItemsAdapter, type Mods } from '/src/widgets/selection/selection-engine'
import { createMarqueeDriver, type GeometryAdapter, type ScrollerAdapter, type Rect } from '/src/widgets/selection/marquee-driver';
import { PickerMode, FileFilter, PickerSurfaceAdapter } from '/src/widgets/pickers/api';

import { buildVfsInfo } from '/src/contextmenu/context'
import { startRename } from '/src/widgets/renameOverlay' 
import { getItemsLayoutService, type ViewConfig } from './layout-service'
import ItemsListLayout from './ItemsListLayout.vue'
import ItemsGridLayout from './ItemsGridLayout.vue'
import ItemsDetailsLayout from './ItemsDetailsLayout.vue'
import { useItemsSort, type SortKey, type SortDir } from './useItemsSort'
import { useItemsDragDrop } from './useItemsDragDrop'

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

// Refs to Details layout component and its internal elements
const detailsLayoutRef = ref<any>(null)
const headerH = ref(36)
const detailsScrollEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement|null>(null)
const padEl    = ref<HTMLElement|null>(null)
const sbw = ref(0)

// Sync refs from Details component when it mounts/updates
watch(detailsLayoutRef, (component) => {
  if (component && merged.value.layout === 'details') {
    detailsScrollEl.value = component.detailsScrollEl
    detailsRootEl.value = component.detailsRootEl
    headerEl.value = component.headerEl
    padEl.value = component.padEl
  }
}, { flush: 'post' })

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

// Entries ref (must be declared before useItemsSort)
const entries = ref<Array<{
  Name: string; FullPath: string; Kind?: string; Ext?: string; Size?: number; ModifiedAt?: number; IconKey?: string
}>>([])

// ---- Sort State (backend sorting) ----
const sortKey = ref<SortKey>((props.config?.view?.sortKey as any) || 'name')
const sortDir = ref<SortDir>((props.config?.view?.sortDir as any) || 'asc')

// When sort changes, reload from backend with new params
function onHeaderClick(nextKey: SortKey) {
  console.log('[Widget] onHeaderClick START:', { 
    nextKey, 
    currentKey: sortKey.value, 
    currentDir: sortDir.value 
  })
  
  if (sortKey.value === nextKey) {
    // Toggle direction
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    // New key, default to ascending
    sortKey.value = nextKey
    sortDir.value = 'asc'
  }
  
  console.log('[Widget] onHeaderClick AFTER UPDATE:', { 
    sortKey: sortKey.value, 
    sortDir: sortDir.value 
  })
  
  // Reload with new sort
  loadDir(cwd.value)
}




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
    const layout = merged.value.layout
    const sc = layout === 'details' ? detailsScrollEl.value! : scrollEl.value!
    return { x: 0, y: 0, w: sc.clientWidth, h: sc.clientHeight }
  },

  // Item rects in the same scroller-viewport space
  itemRects() {
    const layout = merged.value.layout
    const sc = layout === 'details' ? detailsScrollEl.value! : scrollEl.value!
    const scR = sc.getBoundingClientRect()
    const root = layout === 'details' ? (padEl.value ?? sc) : sc
    const rows = root.querySelectorAll<HTMLElement>('.row[data-path]')
    const arr: Array<{ id: string; rect: Rect }> = []
    
    rows.forEach(row => {
      const rr = row.getBoundingClientRect()
      arr.push({
        id: row.dataset.path!,
        rect: {
          x: rr.left - scR.left,
          y: rr.top - scR.top,
          w: rr.width,
          h: rr.height,
        },
      })
    })
    return arr
  },

  // Pointer in the same scroller-viewport space
  pointFromClient(clientX, clientY) {
    const layout = merged.value.layout
    const sc = layout === 'details' ? detailsScrollEl.value! : scrollEl.value!
    const scR = sc.getBoundingClientRect()
    
    // Work in container space - no padding adjustments needed
    return { x: clientX - scR.left, y: clientY - scR.top }
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
        const layout = merged.value.layout
        const st = (layout === 'details' ? detailsScrollEl.value : scrollEl.value)?.scrollTop ?? 0
        
        // No padding offset needed - working in container space
        marqueeRect.value = { 
          x: r.x, 
          y: r.y + st, 
          w: r.w, 
          h: r.h 
        }
        const hasSize = (r.w > 0 || r.h > 0)
        squelchNextPlaneClick = hasSize
        console.log('[Widget] rectChanged - marquee active:', {
          layout,
          rect: r,
          hasSize,
          squelchFlag: squelchNextPlaneClick
        })
      } else {
        console.log('[Widget] rectChanged - marquee ended, squelch flag:', squelchNextPlaneClick)
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
  const path = entries.value[idx]?.FullPath
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
  if (!entries.value.length) return
  
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

function onScrollContainerPointerDown(ev: PointerEvent) {
  const layout = merged.value.layout
  
  // For List/Grid, handle marquee on scroll container
  if (layout === 'list' || layout === 'grid') {
    onSurfacePointerDown(ev)
  } else {
    // For Details/other, just handle focus
    ;(ev.currentTarget as HTMLElement)?.focus?.({ preventScroll: true })
  }
}

function onSurfacePointerDown(ev: PointerEvent) {
  const layout = merged.value.layout
  
  console.log('[Widget] onSurfacePointerDown:', {
    layout,
    target: (ev.target as HTMLElement)?.tagName,
    currentTarget: (ev.currentTarget as HTMLElement)?.className
  })
  
  // Check if event is from Details internal scroll (via emit) or from outer container (List/Grid)
  const fromDetailsInternal = layout === 'details' && detailsScrollEl.value && ev.currentTarget === detailsScrollEl.value
  const fromOuterContainer = (layout === 'list' || layout === 'grid') && ev.currentTarget === scrollEl.value
  
  // Only handle if from appropriate source
  if (!fromDetailsInternal && !fromOuterContainer) {
    console.log('[Widget] onSurfacePointerDown - ignoring (wrong source)')
    return
  }
  if (ev.button !== 0) {
    console.log('[Widget] onSurfacePointerDown - ignoring (not left button)')
    return
  }
  
  const t = ev.target as HTMLElement | null
  const plane = layout === 'details' ? detailsScrollEl.value! : scrollEl.value!
  
  const isRow = !!t?.closest('.row[data-path], [draggable="true"]')
  const onScrollbar = isOnScrollbar(plane, ev)
  
  console.log('[Widget] onSurfacePointerDown - checks:', {
    isRow,
    onScrollbar,
    willStart: !isRow && !onScrollbar
  })
  
  if (isRow) {
    console.log('[Widget] onSurfacePointerDown - ignoring (row or draggable)')
    return
  }
  if (onScrollbar) {
    console.log('[Widget] onSurfacePointerDown - ignoring (scrollbar)')
    return
  }

  console.log('[Widget] onSurfacePointerDown - starting marquee')
  
  ;(ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId);

  // Ensure the widget owns focus on any left click in the canvas
  scrollEl.value?.focus({ preventScroll: true })

  lastClientX = ev.clientX; lastClientY = ev.clientY;
  lastScrollTopForDrag = plane.scrollTop
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
  if (!marqueeActive.value) return
  
  const layout = merged.value.layout
  const sc = layout === 'details' ? detailsScrollEl.value! : scrollEl.value!
  
  const dy = sc.scrollTop - lastScrollTopForDrag
  if (dy) {
    driver.adjustForScroll(dy)
    lastScrollTopForDrag = sc.scrollTop
  }
}

function onSurfacePointerMove(ev: PointerEvent) {
  const layout = merged.value.layout
  
  // In details mode, only handle from details-scroll (via emit), not outer container
  if (layout === 'details' && ev.currentTarget === scrollEl.value) {
    return
  }
  
  lastClientX = ev.clientX; lastClientY = ev.clientY;   // keep coords
  driver.pointerMove(ev);
}

function onSurfacePointerUp(ev: PointerEvent) {
  const layout = merged.value.layout
  
  // In details mode, only handle from details-scroll (via emit), not outer container
  if (layout === 'details' && ev.currentTarget === scrollEl.value) {
    console.log('[Widget] onSurfacePointerUp - ignoring (details mode, outer container)')
    return
  }
  
  const wasMarquee = marqueeActive.value

  console.log('[Widget] onSurfacePointerUp (before driver):', {
    layout: merged.value.layout,
    wasMarquee,
    squelchFlag: squelchNextPlaneClick,
    marqueeRect: marqueeRect.value,
    currentTarget: ev.currentTarget
  })

  if (wasMarquee) {
    const sc = layout === 'details' ? detailsScrollEl.value! : scrollEl.value!
    
    const dy = sc.scrollTop - lastScrollTopForDrag
    if (dy) {
      driver.adjustForScroll(dy)
      lastScrollTopForDrag = sc.scrollTop
      driver.recomputeNow('plane:flush-before-up')
    }
  }

  driver.pointerUp(ev);
  window.removeEventListener('pointerup', onSurfacePointerUp);

  console.log('[Widget] onSurfacePointerUp (after driver):', {
    layout: merged.value.layout,
    wasMarquee,
    squelchFlag: squelchNextPlaneClick,
    marqueeStillActive: marqueeActive.value
  })

  // Only treat as a "click" if no marquee was shown
  if (!wasMarquee) {
    const inside = isInsideScrollRect(ev.clientX, ev.clientY);
    const overSelected = isOverSelectedRowAtPoint(ev.clientX, ev.clientY);
    console.log('[Widget] onSurfacePointerUp - no marquee, checking for deselect:', {
      inside,
      overSelected,
      willDeselect: inside && !overSelected
    })
    if (inside && !overSelected) {
      engine.replaceSelection([], { reason: 'plane:click-up-outside' });
    }
  }
}

async function applyExternalCwd(path: string, opts?: { mode?: 'push' | 'replace'; focus?: boolean }) {
  if (!path) return

  engine.replaceSelection([], { reason: 'nav:external-cwd' })
  focusIndex.value = null
  anchorIndex.value = null

  cwd.value = path
  await loadDir(path)
}



function onSurfaceClick(ev: MouseEvent) {
  const layout = merged.value.layout
  
  // In details mode, only handle clicks from the details-scroll element (via emit)
  // Ignore clicks from the outer scroll container
  if (layout === 'details' && ev.currentTarget === scrollEl.value) {
    console.log('[Widget] onSurfaceClick - ignoring (details mode, outer container)')
    return
  }
  
  console.log('[Widget] onSurfaceClick:', {
    layout: merged.value.layout,
    squelchFlag: squelchNextPlaneClick,
    willSquelch: squelchNextPlaneClick,
    target: (ev.target as HTMLElement)?.tagName,
    currentTarget: ev.currentTarget
  })
  
  if (squelchNextPlaneClick) {
    console.log('[Widget] onSurfaceClick - SQUELCHED')
    squelchNextPlaneClick = false // Clear flag after squelching
    return
  }
  
  const t = ev.target as HTMLElement | null
  const isRow = !!t?.closest('.row[data-path]')
  console.log('[Widget] onSurfaceClick - checking target:', {
    isRow,
    willDeselect: !isRow
  })
  
  if (!isRow) {
    console.log('[Widget] onSurfaceClick - deselecting')
    engine.replaceSelection([], { reason: 'plane:clear' })
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
  
  console.log('[Widget] loadDir START:', { 
    path: p, 
    sortKey: sortKey.value, 
    sortDir: sortDir.value 
  })
  
  loading.value = true
  error.value = ''

  try {
    // Get current filter
    const filterExts = activeFilter.value?.exts?.length 
      ? activeFilter.value.exts 
      : undefined

    console.log('[Widget] Calling fsListDirSmart with:', {
      sortBy: sortKey.value,
      sortDir: sortDir.value,
      filterExts
    })

    // Call with backend sorting + filtering
    const res = await fsListDirSmart('items', props.sourceId, p, {
      sortBy: sortKey.value,     // Backend sorts for us!
      sortDir: sortDir.value,
      filterExts                 // Backend filters too
    })

    let list = Array.isArray((res as any).entries) ? (res as any).entries : []
    
    // Optional: Hide hidden files (if not done on backend)
    if (!merged.value.showHidden) {
      list = list.filter((e: any) => !String(e?.Name || '').startsWith('.'))
    }

    // No need to sort - already sorted by backend!
    entries.value = list

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

    // clear stale selection when navigating
    engine.replaceSelection([], { reason: 'nav:rpath-changed' })
    focusIndex.value = null
    anchorIndex.value = null

    cwd.value = rp
    await loadDir(rp)
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

const hostVars = computed(() => ({
  '--items-border':     props.theme?.border    || 'var(--border, #555)',
  '--items-fg':         props.theme?.fg        || 'var(--fg, #eee)',
  '--items-bg':         props.theme?.bg        || 'var(--surface-2, transparent)',
  '--items-header-sep': props.theme?.headerSep || 'rgba(255,255,255,.22)',
}) as Record<string, string>)
/* -----------------------------------------------
   Drag & drop composable
------------------------------------------------ */
const {
  isDragging,
  isDropActive,
  onItemDragStart,
  onItemDragEnd,
  onRootDragOver,
  onRootDragLeave,
  onRootDrop
} = useItemsDragDrop({
  sourceId: props.sourceId,
  entries,
  selected,
  cwd,
  merged,
  marqueeActive,
  loadDir,
  emit
})
/* -----------------------------------------------
   Drag & drop (unchanged; suppress when marqueeing)
------------------------------------------------ */
// Normalizes directory paths for comparison (same logic as TabContent)
function normalizeDir(p: string | null | undefined): string {
  if (!p) return ''
  // Normalize to backslashes and trim trailing separators, then lowercase
  return p.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase()
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
      @pointerdown="onScrollContainerPointerDown"
      @pointermove="onSurfacePointerMove"
      @pointerup="onSurfacePointerUp"
      @click.capture="onSurfaceClick"
      @scroll.passive="onPlaneScroll"
    >
      <!-- Marquee overlay for List/Grid (Details renders its own internally) -->
      <div
        v-if="(merged.layout === 'list' || merged.layout === 'grid') && marqueeRect && (marqueeRect.w > 0 || marqueeRect.h > 0)"
        class="marquee"
        :style="{
          left: marqueeRect.x + 'px',
          top: marqueeRect.y + 'px',
          width: marqueeRect.w + 'px',
          height: marqueeRect.h + 'px'
        }"
      />

      <div v-if="loading" class="msg">Loading…</div>
      <div v-else-if="error" class="err">{{ error }}</div>
      <div v-else-if="!merged.rpath" class="msg">(no path)</div>

      <!-- DETAILS VIEW -->
      <ItemsDetailsLayout
        v-else-if="merged.layout === 'details'"
        ref="detailsLayoutRef"
        :entries="entries"
        :selected="selected"
        :icons-tick="iconsTick"
        :source-id="props.sourceId"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :initial-weights="colW"
        :marquee-rect="marqueeRect"
        @row-down="({ id, mods }) => engine.rowDownId(id, mods)"
        @row-move="({ x, y }) => engine.rowMove?.(x, y)"
        @row-up="({ id }) => engine.rowUpId(id)"
        @dblclick="({ id }) => openEntry(id)"
        @dragstart="({ entry, event }) => { engine.dragStart(); onItemDragStart(entry, event) }"
        @dragend="() => { onItemDragEnd(); engine.dragEnd() }"
        @header-click="(key) => onHeaderClick(key)"
        @surface-pointer-down="onSurfacePointerDown"
        @surface-pointer-move="onSurfacePointerMove"
        @surface-pointer-up="onSurfacePointerUp"
        @surface-click="onSurfaceClick"
        @plane-scroll="onPlaneScroll"
        @weights-changed="(w) => colW = w"
      />

      <!-- LIST VIEW -->
      <ItemsListLayout
        v-else-if="merged.layout === 'list'"
        :entries="entries"
        :selected="selected"
        :icons-tick="iconsTick"
        :source-id="props.sourceId"
        :S="S"
        @row-down="({ id, mods }) => engine.rowDownId(id, mods)"
        @row-move="({ x, y }) => engine.rowMove?.(x, y)"
        @row-up="({ id }) => engine.rowUpId(id)"
        @dblclick="({ id }) => openEntry(id)"
        @dragstart="({ entry, event }) => { engine.dragStart(); onItemDragStart(entry, event) }"
        @dragend="() => { onItemDragEnd(); engine.dragEnd() }"
      />

      <!-- GRID VIEW -->
      <ItemsGridLayout
        v-else-if="merged.layout === 'grid'"
        :entries="entries"
        :selected="selected"
        :icons-tick="iconsTick"
        :source-id="props.sourceId"
        :columns="merged.columns"
        :S="S"
        @row-down="({ id, mods }) => engine.rowDownId(id, mods)"
        @row-move="({ x, y }) => engine.rowMove?.(x, y)"
        @row-up="({ id }) => engine.rowUpId(id)"
        @dblclick="({ id }) => openEntry(id)"
        @dragstart="({ entry, event }) => { engine.dragStart(); onItemDragStart(entry, event) }"
        @dragend="() => { onItemDragEnd(); engine.dragEnd() }"
      />
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

  /* Alignment hooks (app can override per-widget via CSS vars) */
  --items-row-text-align: left;
  --items-name-text-align: left;

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
  text-align: var(--items-row-text-align, left);
}
.row:focus, .row:focus-visible { outline: none !important; }
.row[draggable="true"]{ cursor:grab; }
.row[draggable="true"]:active{ cursor:grabbing; }
.row.selected { box-shadow: inset 0 0 0 2px var(--accent,#4ea1ff) !important; }

.name{ 
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; 
  text-align: var(--items-name-text-align, left);
}

/* ================ Messages ================ */
.msg,.err{ padding:var(--space-md); font-size:var(--local-font-md); }
.err{ color:#f77; }

</style>