<script setup lang="ts">
/* -----------------------------------------------
   Imports
------------------------------------------------ */
import { ref, computed, watch, onMounted, onBeforeUnmount } from '/runtime/vue.js'
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

// Show box only after a tiny movement to avoid accidental drags
const DRAG_THRESHOLD_PX = 6

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

// Autoscroll velocity (px/s) and rAF
const vX = ref(0)
const vY = ref(0)
let rafId = 0
let lastTs = 0

const marqueeStyle = computed(() => {
  if (!marquee.value.visible) return {}
  const m = marquee.value
  return {
    position: 'absolute',
    left: `${m.x}px`,
    top: `${m.y}px`,
    width: `${m.w}px`,
    height: `${m.h}px`,
  }
})

function startAutoScroll() {
  if (rafId) return
  lastTs = 0
  rafId = requestAnimationFrame(tick)
}

function stopAutoScroll() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  lastTs = 0
  vX.value = 0
  vY.value = 0
}

function tick(ts: number) {
  const el = scrollEl.value
  if (!el || !marquee.value.visible) {
    stopAutoScroll()
    return
  }
  if (!lastTs) lastTs = ts
  const dt = Math.min(0.04, (ts - lastTs) / 1000) // clamp to 40ms
  lastTs = ts

  if (vX.value || vY.value) {
    el.scrollLeft += vX.value * dt
    el.scrollTop  += vY.value * dt
    // keep rect in sync after programmatic scroll
    recalcFromClient(lastClientX.value, lastClientY.value)
  }
  rafId = requestAnimationFrame(tick)
}

/** Recompute marquee rectangle from client coords (→ content space) */
function recalcFromClient(cx: number, cy: number) {
  const el = scrollEl.value!
  const r = el.getBoundingClientRect()

  const curX = cx - r.left + el.scrollLeft
  const curY = cy - r.top  + el.scrollTop
  const { startX: sx, startY: sy } = marquee.value

  const x = Math.min(sx, curX)
  const y = Math.min(sy, curY)
  const w = Math.abs(curX - sx)
  const h = Math.abs(curY - sy)

  marquee.value = { ...marquee.value, x, y, w, h }
  updateSelectionByMarquee()
}

/** Update autoscroll velocity based on pointer distance OUTSIDE the rect.
 *  - No scroll while inside.
 *  - Quadratic growth, capped at MAX_SPEED.
 */
function updateVelFromPointer(cx: number, cy: number) {
  const el = scrollEl.value!
  const r = el.getBoundingClientRect()

  // Helper: map distance -> 0..1 curve (quadratic)
  const ease = (d: number) => {
    const clamped = Math.min(Math.max(d, 0), MAX_DIST_PX)
    const x = clamped / MAX_DIST_PX
    return x * x
  }

  let vx = 0
  let vy = 0

  // Vertical (only when outside)
  if (cy < r.top) {
    const dist = r.top - cy
    vy = -MAX_SPEED * ease(dist)
  } else if (cy > r.bottom) {
    const dist = cy - r.bottom
    vy =  MAX_SPEED * ease(dist)
  }

  // Horizontal (only when outside)
  if (cx < r.left) {
    const dist = r.left - cx
    vx = -MAX_SPEED * ease(dist)
  } else if (cx > r.right) {
    const dist = cx - r.right
    vx =  MAX_SPEED * ease(dist)
  }

  vX.value = vx
  vY.value = vy

  if (vx || vy) startAutoScroll()
}

/** Keep rect glued to pointer on native wheel scroll too */
function onSurfaceScroll() {
  if (!marquee.value.visible) return
  recalcFromClient(lastClientX.value, lastClientY.value)
}

function onSurfacePointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return

  const el = scrollEl.value!
  const onRow = !!(ev.target as HTMLElement).closest('.row')

  // Plain click on empty (no modifiers) → prepare to clear on pointerup
  pendingEmptyClick = !onRow && !ev.shiftKey && !ev.altKey

  // Allow Shift/Alt to force marquee even if starting on a row
  if (onRow && !(ev.shiftKey || ev.altKey)) return

  // Record press position (client space) for threshold check
  pressClientX.value = ev.clientX
  pressClientY.value = ev.clientY
  lastClientX.value  = ev.clientX
  lastClientY.value  = ev.clientY

  // Initialize content-space start (marquee hidden until we pass threshold)
  const r = el.getBoundingClientRect()
  const sx = ev.clientX - r.left + el.scrollLeft
  const sy = ev.clientY - r.top  + el.scrollTop
  marquee.value = { visible: false, startX: sx, startY: sy, x: sx, y: sy, w: 0, h: 0 }

  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)

  el.addEventListener('scroll', onSurfaceScroll, { passive: true })
  window.addEventListener('pointermove', onSurfacePointerMove)
  window.addEventListener('pointerup', onSurfacePointerUp, { once: true })

  // No scrolling until we actually leave the rect — velocities will be 0 while inside.
  updateVelFromPointer(ev.clientX, ev.clientY)
  startAutoScroll()
  ev.preventDefault()
}

function onSurfacePointerMove(ev: PointerEvent) {
  lastClientX.value = ev.clientX
  lastClientY.value = ev.clientY

  // Show the marquee only after a small movement (from the press point)
  if (!marquee.value.visible) {
    const moved = Math.hypot(
      ev.clientX - pressClientX.value,
      ev.clientY - pressClientY.value
    )
    if (moved >= DRAG_THRESHOLD_PX) {
      marquee.value.visible = true
    }
  }

  updateVelFromPointer(ev.clientX, ev.clientY)
  recalcFromClient(ev.clientX, ev.clientY)
}

function onSurfacePointerUp() {
  const el = scrollEl.value
  if (el) el.removeEventListener('scroll', onSurfaceScroll)

  window.removeEventListener('pointermove', onSurfacePointerMove)

  // If it was a pure click on empty (no drag), clear selection
  if (!marquee.value.visible && pendingEmptyClick) {
    selected.value = new Set()
  }
  pendingEmptyClick = false

  marquee.value.visible = false
  stopAutoScroll()
}

/** Rectangle intersection test against rows (operate in content space) */
function updateSelectionByMarquee() {
  const el = scrollEl.value!
  const { x, y, w, h } = marquee.value
  const rect = { left: x, top: y, right: x + w, bottom: y + h }

  const r = el.getBoundingClientRect()
  const next = new Set<string>()

  el.querySelectorAll<HTMLElement>('.row[data-path]').forEach(row => {
    const rr = row.getBoundingClientRect()
    const left   = rr.left - r.left + el.scrollLeft
    const top    = rr.top  - r.top  + el.scrollTop
    const right  = left + rr.width
    const bottom = top  + rr.height

    const hit = !(right < rect.left || left > rect.right || bottom < rect.top || top > rect.bottom)
    if (hit) next.add(row.dataset.path!)
  })

  selected.value = next
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
onBeforeUnmount(() => stopAutoScroll())

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
</script>


<template>
  <div class="items-root" :style="hostVars" :class="{ dragging: isDragging, marqueeing: marqueeing }">
    <!-- Edit mode toolbar -->
    <div v-if="editMode" class="edit-toolbar">
      <div class="edit-group">
        <span class="edit-label">Layout:</span>
        <button class="edit-btn" @click="cycleLayout" :title="`Current: ${merged.layout}`">
          {{ merged.layout === 'list' ? '☰' : merged.layout === 'grid' ? '▦' : '▤' }}
        </button>
      </div>

      <div v-if="merged.layout === 'grid'" class="edit-group">
        <span class="edit-label">Columns:</span>
        <button class="edit-btn" @click="updateColumns(-1)" :disabled="merged.columns <= 1">−</button>
        <span class="edit-value">{{ merged.columns }}</span>
        <button class="edit-btn" @click="updateColumns(1)" :disabled="merged.columns >= 8">+</button>
      </div>

      <div class="edit-group">
        <span class="edit-label">Size:</span>
        <button class="edit-btn" @click="cycleItemSize" :title="`Current: ${merged.itemSize}`">
          {{ merged.itemSize.toUpperCase() }}
        </button>
      </div>
    </div>

    <div class="items-scroll-container"
         @pointerdown="onSurfacePointerDown"
         ref="scrollEl">
      <div v-if="loading" class="msg">Loading…</div>
      <div v-else-if="error" class="err">{{ error }}</div>
      <div v-else-if="!merged.rpath" class="msg">(no path)</div>

      <!-- DETAILS VIEW -->
      <div v-else-if="merged.layout === 'details'" class="details-root" :data-icons="iconsTick">
        <!-- header -->
        <div class="details-header">
          <button class="th th-name" @click="onHeaderClick('name')">
            Name <span v-if="sortKey==='name'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
          <button class="th th-ext" @click="onHeaderClick('ext')">
            Ext <span v-if="sortKey==='ext'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
          <button class="th th-size" @click="onHeaderClick('size')">
            Size <span v-if="sortKey==='size'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
          <button class="th th-mod" @click="onHeaderClick('modified')">
            Modified <span v-if="sortKey==='modified'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
        </div>

        <!-- rows -->
        <div class="details-body">
          <button
            v-for="e in sortedEntries"
            :key="e.FullPath"
            class="drow row"
            :data-path="e.FullPath"
            :class="{ selected: selected.has(e.FullPath) }"
            draggable="true"
            @click.stop="openEntry(e.FullPath)"
            @dragstart="onItemDragStart(e, $event)"
            @dragend="onItemDragEnd"
          >
            <div class="td td-name">
              <span class="icon">
                <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
                <span v-else>{{ iconText(e) }}</span>
              </span>
              <span class="name">{{ e.Name || e.FullPath }}</span>
            </div>
            <div class="td td-ext">{{ e.Ext || '' }}</div>
            <div class="td td-size">
              <span class="num">{{ sizeParts(e?.Size).num }}</span>
              <span class="unit">{{ sizeParts(e?.Size).unit }}</span>
            </div>
            <div class="td td-mod">
              <span class="date">{{ modParts(e?.ModifiedAt).date }}</span>
              <span class="time">{{ modParts(e?.ModifiedAt).time }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- LIST VIEW -->
      <div v-else-if="merged.layout === 'list'" class="list-root" :data-icons="iconsTick">
        <button
          v-for="e in sortedEntries"
          :key="e.FullPath"
          class="row"
          :data-path="e.FullPath"
          :class="{ selected: selected.has(e.FullPath) }"
          draggable="true"
          @click.stop="openEntry(e.FullPath)"
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
      <div v-else-if="merged.layout === 'grid'"
           class="grid-root"
           :data-icons="iconsTick"
           :style="{
             display: 'grid',
             gap: S.gap + 'px',
             padding: S.gap + 'px',
             gridTemplateColumns: `repeat(${Math.max(1, merged.columns)}, minmax(0, 1fr))`
           }">
        <button
          v-for="e in sortedEntries"
          :key="e.FullPath"
          class="row"
          :data-path="e.FullPath"
          :class="{ selected: selected.has(e.FullPath) }"
          draggable="true"
          @click.stop="openEntry(e.FullPath)"
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

      <!-- Marquee overlay (render once, works in all layouts) -->
      <div v-if="marquee.visible" class="marquee" :style="marqueeStyle"></div>
    </div>
  </div>
</template>

<style scoped>
/* ========== THEME ========== */
.items-root {
  font-size: var(--font-md);
  color: var(--items-fg);
  --local-font-sm: calc(1em * 0.85);
  --local-font-md: 1em;
  --local-font-lg: calc(1em * 1.15);
  --local-spacing: var(--space-sm);
  --local-radius: var(--radius-md);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.items-root.dragging,
.items-root.marqueeing {
  user-select: none;
}

/* Scroll surface anchors the marquee */
.items-scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  position: relative; /* anchor for .marquee absolute positioning */
}
.items-scroll-container:hover { overscroll-behavior: contain; }

/* Marquee overlay */
.marquee {
  border: 1px solid var(--accent, #4ea1ff);
  background: color-mix(in oklab, var(--accent, #4ea1ff) 18%, transparent);
  pointer-events: none;
  border-radius: 4px;
}

/* Selection visual */
.row.selected {
  outline: 2px solid var(--accent, #4ea1ff);
  outline-offset: -2px;
}

/* ========== Toolbar ========== */
.edit-toolbar {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-sm);
  background: var(--surface-1, #1a1a1a);
  border-bottom: 1px solid var(--border, #555);
  flex-shrink: 0;
  align-items: center;
  font-size: var(--font-sm);
}
.edit-label { font-size: var(--local-font-sm); opacity: 0.7; font-weight: 500; }
.edit-value { font-size: var(--local-font-md); font-weight: 600; min-width: 20px; text-align: center; }
.edit-btn {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  cursor: pointer;
  font-size: var(--local-font-sm);
  transition: all 0.15s ease;
  min-width: 28px;
  text-align: center;
}

/* ========== Base row visuals (list/grid) ========== */
.row {
  cursor: pointer;
  border: 1px solid var(--items-border);
  background: var(--items-bg);
  color: inherit;
  border-radius: var(--local-radius);
  display: flex;
  flex-direction: row;
  gap: var(--local-spacing);
  align-items: center;
  min-height: calc(var(--base-font-size) * 2.4);
  padding: var(--space-xs) var(--space-sm);
  box-sizing: border-box;
  font-size: var(--local-font-md);
}
.row[draggable="true"] { cursor: grab; }
.row[draggable="true"]:active { cursor: grabbing; }

.icon {
  width: calc(var(--base-font-size) * 1.4);
  height: calc(var(--base-font-size) * 1.4);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon img { display: block; width: 100%; height: 100%; object-fit: contain; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: inherit; }

/* ========== Details view ========== */
.details-root {
  --cols: 1fr minmax(90px,120px) minmax(110px,140px) minmax(180px,220px);
  --padX: var(--space-sm);
  --padY: var(--space-xs);
  --iconW: calc(var(--base-font-size) * 1.4);
  --gap: var(--space-xs);
  display: grid;
  gap: var(--space-xs);
  padding: var(--padY);
  font-size: var(--local-font-md);
}

/* header */
.details-header {
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;
  border: 1px solid var(--items-border);
  background: var(--items-bg);
  border-radius: var(--local-radius);
  min-height: calc(var(--base-font-size) * 2.4);
  padding: var(--padY) var(--padX);
  box-sizing: border-box;
  position: relative;
}
.th {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  line-height: 1;
  background: transparent;
  color: inherit;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font-weight: 600;
  font-size: var(--local-font-md);
}

/* rows (grid alignment with header) */
.details-body { display: grid; gap: var(--space-xs); }
.drow {
  display: grid;                            /* grid row, not flex */
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;
  border: 1px solid var(--items-border);
  background: var(--items-bg);
  border-radius: var(--local-radius);
  min-height: calc(var(--base-font-size) * 2.4);
  padding: var(--padY) var(--padX);
  box-sizing: border-box;
  cursor: pointer;
  font-size: var(--local-font-md);
}
.td-name { display: inline-flex; align-items: center; gap: var(--space-sm); min-width: 0; }
.td-name .icon { width: var(--iconW); flex: 0 0 var(--iconW); text-align: center; }
.td-ext, .td-size, .td-mod {
  opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--local-font-sm);
}
/* Tabular numbers for numeric cells */
.td-size, .td-mod { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
.td-size { display: flex; justify-content: flex-end; gap: var(--space-xs); }
.td-mod  { display: flex; justify-content: flex-end; gap: var(--space-sm); }

/* Messages */
.msg, .err { padding: var(--space-md); font-size: var(--local-font-md); }
.err { color: #f77; }
</style>
