<script setup lang="ts">
/* -----------------------------------------------
   Imports
------------------------------------------------ */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from '/runtime/vue.js'
import { fsListDir, fsValidate, fsListDirWithAuth, shortcutsProbe } from '/src/bridge/ipc.ts'
import { loadIconPack, iconFor, ensureIconsFor } from '/src/icons/index.ts'
import { ensureConsent } from '/src/consent/service'
import { createGexPayload, setGexPayload, createDragPreview } from 'gexplorer/widgets'

/* -----------------------------------------------
   Types
------------------------------------------------ */
type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

const props = defineProps<{
  sourceId: string
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    size: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean
}>()

const emit = defineEmits<{ (e: 'updateConfig', config: any): void }>()

// put this near your other constants
const MIN_MOD_PX = 150; // min width for "Modified" col
const SELECTION_FPS = 30;
const SELECTION_MS  = Math.round(1000 / SELECTION_FPS);
// Show box only after a tiny movement to avoid accidental drags
const DRAG_THRESHOLD_PX = 6
// ADD near other constants:
const HEADER_GUARD_PX = 6; // prevents marquee from entering header/its visual cover

/* -----------------------------------------------
   Selection marquee with rAF autoscroll
   Rules:
   - Do NOT scroll while pointer is inside the scroll rect.
   - When pointer is outside, scroll speed grows with distance
     (quadratic), capped at MAX_SPEED.
   - Speed tuned ~1.75× previous value.
   - Click on empty space (no drag) clears selection.
------------------------------------------------ */
const scrollEl = ref<HTMLElement | null>(null)
const selected = ref<Set<string>>(new Set())
const headerH = ref(36)
const detailsScrollEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement|null>(null)
const padEl    = ref<HTMLElement|null>(null)
const sbw = ref(0)

let rafId = 0;
let lastTs = 0;
let lastSelTs = 0;
let lastScrollTop = -1;
let needsUpdate = false;  // set by pointer/scroll

function planeEl(): HTMLElement {
  return (merged.value.layout === 'details' && detailsScrollEl.value)
    ? detailsScrollEl.value
    : (scrollEl.value as HTMLElement)
}

// --- Column widths now include NAME so each divider moves the column under it ---
type DetailCols = { name: number; ext: number; size: number; mod: number }
const defaultCols: DetailCols = { name: 420, ext: 110, size: 130, mod: 220 }

// read saved widths if you have them in config.view.detailCols
const colW = ref<DetailCols>({
  name: props.config?.view?.detailCols?.name ?? defaultCols.name,
  ext:  props.config?.view?.detailCols?.ext  ?? defaultCols.ext,
  size: props.config?.view?.detailCols?.size ?? defaultCols.size,
  mod:  props.config?.view?.detailCols?.mod  ?? defaultCols.mod,
})

// computed CSS value for details grid
const detailsCols = computed(() =>
  `${Math.max(140, colW.value.name)}px ` +
  `${Math.max(70,  colW.value.ext)}px ` +
  `${Math.max(90,  colW.value.size)}px ` +
  `minmax(${MIN_MOD_PX}px, 1fr)` // ← anchored at the right, absorbs leftover
)

const anchorIndex = ref<number | null>(null)   // selection anchor for Shift-range
const focusIndex  = ref<number | null>(null)    // keyboard "caret" row

// Autoscroll tuning
const BASE_SPEED = 2400               // previous “feel”
const SPEED_MULT   = 1.75             // requested 1.75× faster
const MAX_SPEED    = BASE_SPEED * SPEED_MULT // 4200 px/s
const MAX_DIST_PX  = 240              // distance outside edge to reach MAX_SPEED

// Marquee state (kept in content space)
type Marquee = { visible: boolean; startX: number; startY: number; x: number; y: number; w: number; h: number }
const marquee = ref<Marquee>({ visible: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0 })
const marqueeing = computed(() => marquee.value.visible)

// Press & last pointer positions (client space)
const pressClientX = ref(0)
const pressClientY = ref(0)
const lastClientX  = ref(0)
const lastClientY  = ref(0)

// “Click on empty” bookkeeping
let pendingEmptyClick = false

// =========================
// Click / Double-click (Windows-like)
// =========================
function ensureRaf() {
  if (!rafId) { lastTs = 0; rafId = requestAnimationFrame(rafLoop); }
}
function cancelRaf() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0; lastTs = 0; lastSelTs = 0;
  vX.value = 0; vY.value = 0;
}

// 1) Don't cancel rAF just because the marquee isn't visible yet
function rafLoop(ts: number) {
  const el = planeEl();
  if (!el) { cancelRaf(); return; }              // ← keep this
  // (removed the "!marquee.value.visible" early return)

  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.04, (ts - lastTs) / 1000);
  lastTs = ts;

  if (vY.value) {
    const maxTop  = Math.max(0, el.scrollHeight - el.clientHeight);
    const nextTop = Math.min(maxTop, Math.max(0, el.scrollTop + vY.value * dt));
    el.scrollTop = nextTop;
    if ((nextTop === 0 && vY.value < 0) || (nextTop === maxTop && vY.value > 0)) vY.value = 0;
  }

  const scrolled = (el.scrollTop !== lastScrollTop);
  const due = (ts - lastSelTs) >= SELECTION_MS;
  if ((due || scrolled || needsUpdate) && marquee.value.visible) {  // ← only update selection if visible
    recalcFromClient(lastClientX.value, lastClientY.value);
    lastSelTs = ts;
    lastScrollTop = el.scrollTop;
    needsUpdate = false;
  }

  rafId = requestAnimationFrame(rafLoop);
}

function padPadding() {
  const pad = padEl.value
  if (!pad) return { left: 0, top: 0, right: 0, bottom: 0 }
  const cs = getComputedStyle(pad)
  return {
    left:   parseFloat(cs.paddingLeft)   || 0,
    top:    parseFloat(cs.paddingTop)    || 0,
    right:  parseFloat(cs.paddingRight)  || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  }
}

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
  const el = detailsScrollEl.value
  const host = detailsRootEl.value
  if (!el || !host) return
  const width = el.offsetWidth - el.clientWidth
  sbw.value = width
  host.style.setProperty('--sbw', `${width}px`)
}

function selectOnly(idx: number) {
  const path = sortedEntries.value[idx]?.FullPath
  if (!path) return
  selected.value = new Set([path])
  focusIndex.value = idx
  anchorIndex.value = idx
}

function toggleSelect(idx: number) {
  const path = sortedEntries.value[idx]?.FullPath
  if (!path) return
  
  const next = new Set(selected.value)
  if (next.has(path)) next.delete(path); else next.add(path)
  selected.value = next
  focusIndex.value = idx
  anchorIndex.value = idx
}

function rangeSelect(toIdx: number) {
  const arr = sortedEntries.value
  if (!arr.length) return
  const fromIdx = anchorIndex.value ?? (focusIndex.value ?? toIdx)
  const [a, b] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
  const next = new Set<string>()
  for (let i = a; i <= b; i++) next.add(arr[i].FullPath)
  selected.value = next
  focusIndex.value = toIdx
}

function pathIndexByPath(path: string) {
  return sortedEntries.value.findIndex(e => e.FullPath === path)
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

function ensureFocusIndex() {
  // prefer the first selected row; else 0 if list not empty
  if (focusIndex.value != null) return
  const sel = [...selected.value]
  if (sel.length) {
    const i = pathIndexByPath(sel[0])
    if (i >= 0) { focusIndex.value = i; anchorIndex.value = i; return }
  }
  focusIndex.value = sortedEntries.value.length ? 0 : null
  anchorIndex.value = focusIndex.value
}

// --- Handlers used by the template ---
function onSurfaceScroll() {
  if (!marquee.value.visible) return;
  needsUpdate = true; // let rAF do the recalc at 30fps
}

function onRowClick(ev: MouseEvent, idx: number) {
  console.log('rowclick')
  ensureFocusIndex()
  const isCtrl = ev.ctrlKey || ev.metaKey
  if (ev.shiftKey) {
    // extend from anchor
    rangeSelect(idx)
  } else if (isCtrl) {
    // toggle this item
    toggleSelect(idx)
  } else {
    // single select
    selectOnly(idx)
  }
  refocusScrollerAfterEvent(ev)
}

function onRowDblClick(e: { FullPath: string }, idx: number, ev?: MouseEvent) {
  selectOnly(idx)
  refocusScrollerAfterEvent(ev)
  openEntry(e.FullPath)
}

// =========================
// Keyboard navigation
// =========================
function clampIndex(i: number) {
  const max = Math.max(0, sortedEntries.value.length - 1)
  return Math.min(Math.max(i, 0), max)
}

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

  ensureFocusIndex()
  const current = focusIndex.value ?? 0

  let next = current
  const isCtrl = ev.ctrlKey || ev.metaKey
  const isShift = ev.shiftKey

  switch (ev.key) {
    case 'ArrowDown': next = clampIndex(current + 1); break
    case 'ArrowUp':   next = clampIndex(current - 1); break
    case 'Home':      next = 0; break
    case 'End':       next = Math.max(0, sortedEntries.value.length - 1); break
    default: return // let other keys bubble
  }

  // Prevent page from scrolling
  ev.preventDefault()
  ev.stopPropagation()

  if (isShift) {
    // extend range from anchor
    if (anchorIndex.value == null) anchorIndex.value = current
    rangeSelect(next)
  } else if (isCtrl) {
    // toggle behavior as you asked (move and toggle)
    toggleSelect(next)
  } else {
    // single select
    selectOnly(next)
  }

  scrollRowIntoView(next)
}

// Autoscroll velocity (px/s) and rAF
const vX = ref(0)
const vY = ref(0)

const marqueeStyle = computed(() => {
  if (!marquee.value.visible) return {}
  const m = marquee.value
  return {
    position: 'absolute',
    left:  `${m.x}px`,
    top:   `${m.y}px`,
    width: `${m.w}px`,
    height:`${m.h}px`,
  }
})


/** Update autoscroll velocity based on pointer distance OUTSIDE the rect.
 *  - No scroll while inside.
 *  - Quadratic growth, capped at MAX_SPEED.
 */
function updateVelFromPointer(cx: number, cy: number) {
  const scroller = planeEl()
  const r = scroller.getBoundingClientRect()
  const ease = (d: number) => {
    const x = Math.min(Math.max(d, 0), MAX_DIST_PX) / MAX_DIST_PX
    return x * x
  }

  vX.value = 0
  if (cy < r.top)         vY.value = -MAX_SPEED * ease(r.top - cy)
  else if (cy > r.bottom) vY.value =  MAX_SPEED * ease(cy - r.bottom)
  else                    vY.value =  0

  if (vY.value) ensureRaf()
}


/** Keep rect glued to pointer on native wheel scroll too */
function recalcFromClient(cx: number, cy: number) {
  const scroller = planeEl()
  const pad = padEl.value ?? scroller
  const rPad = pad.getBoundingClientRect()

    // Keep everything in the pad's padding-box coordinate space
  let curX = (cx - rPad.left) - pad.clientLeft
  let curY = (cy - rPad.top)  - pad.clientTop

  // Clamp inside scrollable content. scrollWidth/Height already include padding.
  const maxX = Math.max(0, pad.scrollWidth)
  const maxY = Math.max(0, pad.scrollHeight)
  curX = Math.min(Math.max(0, curX), maxX)
  curY = Math.min(Math.max(0, curY), maxY)

  const { startX: sx, startY: sy } = marquee.value
  const x = Math.min(sx, curX)
  const y = Math.min(sy, curY)
  const w = Math.abs(curX - sx)
  const h = Math.abs(curY - sy)

  marquee.value = { ...marquee.value, x, y, w, h }
  updateSelectionByMarquee()
}

function onSurfacePointerDown(ev: PointerEvent) {
  if (merged.value.layout !== 'details' || ev.button !== 0) return

  // NEW: if the press starts on a row/draggable, let it handle drag & clicks.
  const t = ev.target as HTMLElement | null
  const onRowOrDraggable = !!t?.closest('.row[data-path], [draggable="true"]')
  if (onRowOrDraggable) {
    pendingEmptyClick = false     // not an “empty plane” click
    return                        // ← critical: don't start marquee / don't preventDefault
  }

  const scroller = planeEl()
  const pad = padEl.value ?? scroller
  const rPad = pad.getBoundingClientRect()

  const clickedRow = !!t?.closest('.row[data-path]')
  const hasMods = ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey
  pendingEmptyClick = !clickedRow && !hasMods

  pressClientX.value = ev.clientX
  pressClientY.value = ev.clientY
  lastClientX.value  = ev.clientX
  lastClientY.value  = ev.clientY

  const sx = (ev.clientX - rPad.left) - pad.clientLeft
  const sy = (ev.clientY - rPad.top)  - pad.clientTop

  marquee.value = {
    visible: false,
    startX: Math.max(0, sx),
    startY: Math.max(0, sy),
    x: sx, y: sy, w: 0, h: 0
  }

  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  detailsScrollEl.value!.addEventListener('scroll', onSurfaceScroll, { passive: true })
  window.addEventListener('pointermove', onSurfacePointerMove)
  window.addEventListener('pointerup', onSurfacePointerUp, { once: true })

  updateVelFromPointer(ev.clientX, ev.clientY)
  ensureRaf()
  ev.preventDefault()
}

function onSurfacePointerMove(ev: PointerEvent) {
  lastClientX.value = ev.clientX
  lastClientY.value = ev.clientY

  if (!marquee.value.visible) {
    const moved = Math.hypot(ev.clientX - pressClientX.value, ev.clientY - pressClientY.value)
    if (moved >= DRAG_THRESHOLD_PX) {
      marquee.value.visible = true
      pendingEmptyClick = false   // NEW: once it’s a drag, don’t treat it like a click
      ensureRaf()
    }
  }

  updateVelFromPointer(ev.clientX, ev.clientY)
  needsUpdate = true
}

function onSurfacePointerUp() {
  const el = planeEl()
  if (el) el.removeEventListener('scroll', onSurfaceScroll)
  window.removeEventListener('pointermove', onSurfacePointerMove)

  if (!marquee.value.visible && pendingEmptyClick) selected.value = new Set()
  pendingEmptyClick = false

  marquee.value.visible = false
  cancelRaf()
}


function updateSelectionByMarquee() {
  const scroller = planeEl()
  const pad = padEl.value ?? scroller
  const rPad = pad.getBoundingClientRect()

  const { x, y, w, h } = marquee.value
  const rect = { left: x, top: y, right: x + w, bottom: y + h }

  const next = new Set<string>()
  pad.querySelectorAll<HTMLElement>('.row[data-path]').forEach(row => {
    const rr = row.getBoundingClientRect()

    // Row position in the SAME padding-box space
    const left  = (rr.left - rPad.left) - pad.clientLeft
    const top   = (rr.top  - rPad.top)  - pad.clientTop
    const right  = left + rr.width
    const bottom = top  + rr.height

    const hit = !(right < rect.left || left > rect.right || bottom < rect.top || top > rect.bottom)
    if (hit) next.add(row.dataset.path!)
  })

  selected.value = next
}



function scrollerContentWidth(): number {
  const el = planeEl()
  if (!el) return 0
  const cs = getComputedStyle(el)
  const pl = parseFloat(cs.paddingLeft) || 0
  const pr = parseFloat(cs.paddingRight) || 0
  return el.clientWidth - pl - pr
}

/* -----------------------------------------------
   Data / sorting / UI (unchanged)
------------------------------------------------ */
type SortKey = 'name' | 'kind' | 'ext' | 'size' | 'modified'
type SortDir = 'asc' | 'desc'

const sortKey = ref<SortKey>((props.config?.view?.sortKey as SortKey) || 'name')
const sortDir = ref<SortDir>((props.config?.view?.sortDir as SortDir) || 'asc')

const iconsTick = ref(0)
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

function sizeTokens(Size?: string) {
  const s = (Size || 'md').toLowerCase()
  if (s === 'sm') return { padY: 8, padX: 10, radius: 8, gap: 6, font: 0.95, title: 600 }
  if (s === 'lg') return { padY: 14, padX: 14, radius: 12, gap: 10, font: 1.05, title: 650 }
  return { padY: 10, padX: 12, radius: 10, gap: 8, font: 1.0, title: 600 }
}

const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

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
  navigateMode: String(cfg.value.view.navigateMode ?? 'internal').toLowerCase(),
}))

const cwd = ref<string>('')

const entries = ref<Array<{
  Name: string; FullPath: string; Kind?: string; Ext?: string; Size?: number; ModifiedAt?: number; IconKey?: string
}>>([])

const detailsRootEl = ref<HTMLElement|null>(null)
const loading = ref(false)
const error = ref('')

async function loadDir(path: string) {
  if (!path) { entries.value = []; return }
  loading.value = true
  error.value = ''

  try {
    let res = await fsListDir(path)

    if (!res?.ok) {
      const raw = String(res?.error || '')
      const msg = raw.toLowerCase()
      const accessDenied =
        msg.includes('access denied') ||
        msg.includes('unauthorized') ||
        msg.includes('e_access_denied') ||
        /access.*denied/.test(msg) ||
        /denied/.test(msg)

      if (accessDenied) {
        const granted = await ensureConsent('items', props.sourceId, path, ['Read', 'Metadata'], { afterDenied: true })
        if (!granted) throw new Error('Permission not granted')

        res = await fsListDirWithAuth('items', props.sourceId, path)
        if (!res?.ok) throw new Error(res?.error || 'list failed after consent')
      } else {
        throw new Error(res?.error || 'list failed')
      }
    }

    let list = Array.isArray((res as any).entries) ? (res as any).entries : []
    if (!merged.value.showHidden) list = list.filter((e: any) => !String(e?.Name || '').startsWith('.'))

    entries.value = list.sort((a: any, b: any) =>
      String(a?.Name ?? '').localeCompare(String(b?.Name ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    )

    const lnks = entries.value
      .filter(e => e?.Kind === 'link' && e?.Ext === '.lnk' && (!e.IconKey || !String(e.IconKey).startsWith('link:')))
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
      } catch { /* ignore */ }
    }

    const n = await ensureIconsFor(entries.value.map(e => ({ iconKey: e.IconKey })), 32)
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
    const preferTab =
      merged.value.navigateMode === 'tab' ||
      (merged.value.navigateMode !== 'internal' && typeof props.runAction === 'function')

    if (isDir) {
      if (preferTab) props.runAction?.({ type: 'nav', to: FullPath })
      else { cwd.value = FullPath; await loadDir(cwd.value) }
      return
    }
    props.runAction?.({ type: 'open', path: FullPath })
  } catch (err) {
    console.error('[items] openEntry failed:', err)
  }
}

watch(
  detailsScrollEl,
  (el, _prev, onCleanup) => {
    if (!el || !detailsRootEl.value) return

    // Measure once, right now (post-flush so DOM exists)
    measureScrollbarWidth()

    // Keep up to date if the scroller’s box changes
    const ro = new ResizeObserver(() => measureScrollbarWidth())
    ro.observe(el)
    onCleanup(() => ro.disconnect())
  },
  { flush: 'post' }
)

// persist on change (optional)
watch(colW, (w) => {
  emit('updateConfig', {
    ...props.config,
    view: { ...props.config?.view, detailCols: { ...w } }
  })
}, { deep: true })

watch(
  () => merged.value.rpath,
  (next) => { if (next && next !== cwd.value) { cwd.value = next; loadDir(next) } },
  { immediate: true }
)

watch(
  () => [props.config?.view?.sortKey, props.config?.view?.sortDir],
  ([k, d]) => {
    if (k && ['name', 'kind', 'ext', 'size', 'modified'].includes(k as string)) sortKey.value = k as SortKey
    if (d && (d === 'asc' || d === 'desc')) sortDir.value = d
  }
)

const S = computed(() => sizeTokens(merged.value.itemSize))

const sortedEntries = computed(() => {
  const data = entries.value.slice()
  const k = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  const cmp = (a: string, b: string) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })

  data.sort((A, B) => {
    if (k === 'name')     return cmp(A?.Name || '', B?.Name || '') * dir
    if (k === 'ext')      { const c = cmp(A?.Ext || '', B?.Ext || ''); return (c || cmp(A?.Name || '', B?.Name || '')) * dir }
    if (k === 'size')     { const sa = (A?.Size ?? 0), sb = (B?.Size ?? 0); const c = sa === sb ? 0 : (sa < sb ? -1 : 1); return (c || cmp(A?.Name || '', B?.Name || '')) * dir }
    if (k === 'modified') { const ta = A?.ModifiedAt ? +new Date(A.ModifiedAt) : 0; const tb = B?.ModifiedAt ? +new Date(B.ModifiedAt) : 0; const c = ta === tb ? 0 : (ta < tb ? -1 : 1); return (c || cmp(A?.Name || '', B?.Name || '')) * dir }
    return 0
  })
  return data
})

// ----- Resizer drag -----
type ResCol = keyof DetailCols
let resizing: { col: ResCol; startX: number; startW: number } | null = null
const isResizing = ref(false)


function startResize(col: ResCol, ev: PointerEvent) {
  const target = ev.currentTarget as HTMLElement
  target.setPointerCapture?.(ev.pointerId)
  resizing = { col, startX: ev.clientX, startW: colW.value[col] }
  isResizing.value = true
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd, { once: true })
  ev.preventDefault()
  ev.stopPropagation() // don't let header click fire
}

function onResizeMove(ev: PointerEvent) {
  if (!resizing) return
  const dx = ev.clientX - resizing.startX
  const next = Math.round(resizing.startW + dx)

  const minByCol: Record<ResCol, number> = { name: 140, ext: 70, size: 90, mod: 150 }
  const containerW = scrollerContentWidth()

  const otherSum = (Object.entries(colW.value) as [ResCol, number][])
    .filter(([k]) => k !== resizing!.col)
    .reduce((s, [, v]) => s + v, 0)
      
  const hardMax = Math.max(minByCol[resizing.col], contentGridWidth() - otherSum)
  colW.value = { ...colW.value, [resizing.col]: Math.min(Math.max(next, minByCol[resizing.col]), hardMax) }
}


function onResizeEnd() {
  window.removeEventListener('pointermove', onResizeMove)
  isResizing.value = false
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
const isDragging = ref(false)

function onItemDragStart(e: any, event: DragEvent) {
  if (!event.dataTransfer) return
  if (marquee.value.visible) { event.preventDefault(); return }

  isDragging.value = true
  try {
    const paths = (selected.value.size > 0 ? [...selected.value] : [e.FullPath])

    const payload = createGexPayload(
      'gex/file-refs',
      paths.map(p => ({
        path: p,
        name: (p === e.FullPath ? e.Name : (entries.value.find(x => x.FullPath === p)?.Name || p)),
        size: (p === e.FullPath ? e.Size : (entries.value.find(x => x.FullPath === p)?.Size)),
        mimeType: guessMimeType((p === e.FullPath ? e.Name : (entries.value.find(x => x.FullPath === p)?.Name || ''))),
        isDirectory: (p === e.FullPath ? e.Kind === 'dir' : entries.value.find(x => x.FullPath === p)?.Kind === 'dir')
      })),
      { widgetType: 'items', widgetId: props.sourceId }
    )

    setGexPayload(event.dataTransfer, payload)

    const preview = createDragPreview({
      label: (selected.value.size > 1 ? `${paths.length} items` : e.Name),
      icon: e.Kind === 'dir' ? '📁' : '📄',
      count: paths.length
    })
    event.dataTransfer.setDragImage(preview, 0, 0)
    setTimeout(() => preview.remove(), 0)
  } catch (err) {
    console.error('[Items] drag failed:', err)
  }
}

function onItemDragEnd() { isDragging.value = false }

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

/* -----------------------------------------------
   Lifecycle: tidy up rAF if the component unmounts
------------------------------------------------ */
onBeforeUnmount(() => cancelRaf())

/* -----------------------------------------------
   Edit helpers (unchanged)
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

onMounted(async () => {
  const ro = new ResizeObserver(() => measureScrollbarWidth())
  detailsScrollEl.value && ro.observe(detailsScrollEl.value)
  // optional: re-measure on font/theme changes after icons load in
  window.addEventListener('resize', measureScrollbarWidth)

  await nextTick();                          // wait for Vue to paint this tick
  requestAnimationFrame(() => {              // then wait for the browser to layout
    measureScrollbarWidth();
  });
})
onBeforeUnmount(() => window.removeEventListener('resize', measureScrollbarWidth))
</script>

<template>
  <div class="items-root" :style="hostVars" :class="{ dragging: isDragging, marqueeing: marqueeing }">
    <!-- Edit mode toolbar -->
    <div
      v-if="editMode"
      class="edit-toolbar"
      @pointerdown.stop
    >
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
          @keydown="onKeyDown"
          @scroll="onSurfaceScroll"
          @pointerdown="onSurfacePointerDown"
        >
          <!-- gutters live inside here to match header inner -->
          <div class="details-pad" ref="padEl">
            <div class="details-grid">
              <button
                v-for="(e, i) in sortedEntries"
                :key="e.FullPath"
                class="row"
                :data-path="e.FullPath"
                :class="{ selected: selected.has(e.FullPath) }"
                draggable="true"
                @pointerdown="onRowClick($event, i)"
                @dblclick.stop.prevent="onRowDblClick(e, i, $event)"
                @dragstart="onItemDragStart(e, $event)"
                @dragend="onItemDragEnd"
              >
                <div class="td td-name" :title="e.Name || e.FullPath">
                  <span class="icon">
                    <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
                    <span v-else>{{ iconText(e) }}</span>
                  </span>
                  <span class="name">{{ e.Name || e.FullPath }}</span>
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

            <!-- Marquee lives in the content plane -->
            <div v-if="marquee.visible" class="marquee" :style="marqueeStyle"></div>
          </div>
        </div>
      </div>

      <!-- LIST VIEW -->
      <div v-else-if="merged.layout === 'list'" class="list-root" :data-icons="iconsTick">
        <button
          v-for="(e,i) in sortedEntries"
          :key="e.FullPath"
          class="row"
          :data-path="e.FullPath"
          :class="{ selected: selected.has(e.FullPath) }"
          draggable="true"
          @pointerdown="onRowClick($event, i)"
          @dblclick.stop.prevent="onRowDblClick(e, i)"
          @dragstart="onItemDragStart(e, $event)"
          @dragend="onItemDragEnd"
        >
          <div class="icon">
            <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
            <span v-else>{{ iconText(e) }}</span>
          </div>
          <div class="name">{{ e.Name || e.FullPath }}</div>
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
          v-for="(e,i) in sortedEntries"
          :key="e.FullPath"
          class="row"
          :data-path="e.FullPath"
          :class="{ selected: selected.has(e.FullPath) }"
          draggable="true"
          @pointerdown="onRowClick($event, i)"
          @dblclick.stop.prevent="onRowDblClick(e, i)"
          @dragstart="onItemDragStart(e, $event)"
          @dragend="onItemDragEnd"
        >
          <div class="icon">
            <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
            <span v-else>{{ iconText(e) }}</span>
          </div>
          <div class="name">{{ e.Name || e.FullPath }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.details-viewport{
  position: relative;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  /* put scrollbar at widget edge and prevent layout shift */
  scrollbar-gutter: stable both-edges;

  /* gutters and header spacing */
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
}

/* ADD: full-width scroll; no side padding here */
.details-scroll{
  position: relative;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable; /* prevents content width jitter */
}

/* ADD: the inner pad holds the side gutters + header spacing */
.details-pad{
  position: relative;
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
}

/* ================ MARQUEE ================ */
.marquee{
  position:absolute;
  border:1px solid var(--accent,#4ea1ff);
  background:color-mix(in oklab, var(--accent,#4ea1ff) 18%, transparent);
  pointer-events:none;
  border-radius:4px;
  z-index:2;
  will-change: transform;
}

.items-root.dragging{ user-select:none; }

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
.row:focus, .row:focus-visible{ outline: none !important; box-shadow: none !important; }
.row[draggable="true"]{ cursor:grab; }
.row[draggable="true"]:active{ cursor:grabbing; }
.row.selected{ outline:none; box-shadow: inset 0 0 0 2px var(--accent,#4ea1ff); }

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
  /* grid column template is passed via --cols */
  --padX: var(--space-sm);
  --padY: var(--space-xs);
  --gap:  var(--space-xs);
  --sbw: 0px;
  /* Details icon size derived from font size (1em of the row) */
  --iconW: calc(1em * 1.4);

  /* Fixed header height token (keeps JS simple) */
  --hdrH: 36px;

  position:relative;
  display:flex;
  flex-direction:column;
  height:100%;
}

/* Header with outer gutters only */
.details-header{
  position: sticky;
  top: 0;
  height: var(--hdrH);
  z-index: 3;
  background: transparent;
  
  /* same gutter model as rows, plus --sbw only here */
  padding-inline: var(--items-gutter-left, 5%) calc(var(--items-gutter-right, 5%) + var(--sbw, 0px));
}

.details-header::before{ display:none; }

/* Grid lives inside */
.details-header-inner{
  height: 100%;
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;
  padding: 0 var(--padX);
  margin-inline: 0;                           /* was margin-inline: var(--items-gutter-*) */

  /* keep original styling */
  background: var(--items-header-bg, var(--surface-2,#222));
  border-radius: var(--local-radius);
  box-sizing: border-box;
}

.details-header-inner > .th + .th{ border-left: 1px solid var(--items-col-sep); }

/* Header cells */
.th{
  position: relative;
  display: inline-flex; align-items: center; gap: var(--space-xs);

  background: transparent; border: 0; color: inherit; cursor: pointer; font-weight: 600;
}
.th-size,.th-mod{ justify-content:flex-end; text-align:right; }

/* Column separators */
:root, :host{ --items-col-sep: color-mix(in oklab, var(--fg,#fff) 18%, transparent); }
.details-grid   .row > .td + .td{ border-left: 1px solid var(--items-col-sep); padding-left: var(--space-xs); }

/* Resizer handles (not on last column) */
.resize-handle{
  position:absolute; top:0; right:-6px; width:12px; height:100%; cursor:col-resize;
}
.resize-handle::after{
  content:""; position:absolute; top:0; bottom:0; left:50%;
  transform:translateX(-0.5px);
  width:1px; background: color-mix(in oklab, var(--fg,#fff) 28%, transparent);
}
.th:hover .resize-handle::after{ background: color-mix(in oklab, var(--accent,#4ea1ff) 55%, transparent); }

/* ----- INTERACTIVE PLANE (rows + marquee) lives BELOW the header ----- */
.details-grid{
  display: grid;
  gap: var(--space-xs);
}

/* Details rows align with header grid */
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
.details-grid .row > .td + .td{
  border-left: 1px solid var(--items-col-sep);
  padding-left: var(--space-xs);
}

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
