<script setup lang="ts">
import { ref, computed, watch, onMounted } from '/runtime/vue.js'

/* -----------------------------------------------
   Types
------------------------------------------------ */
type SortKey = 'name' | 'kind' | 'ext' | 'size' | 'modified'
type SortDir = 'asc' | 'desc'
type ResCol = 'name' | 'ext' | 'size' | 'mod'
type DetailWeights = { name: number; ext: number; size: number; mod: number }

/* -----------------------------------------------
   Props
------------------------------------------------ */
const props = defineProps<{
  entries: any[]
  selected: Set<string>
  iconsTick: number
  sourceId: string
  sortKey: SortKey
  sortDir: SortDir
  initialWeights: DetailWeights
  marqueeRect: { x: number; y: number; w: number; h: number } | null
}>()

/* -----------------------------------------------
   Emits
------------------------------------------------ */
const emit = defineEmits<{
  (e: 'rowDown', payload: { id: string; mods: any }): void
  (e: 'rowMove', payload: { x: number; y: number }): void
  (e: 'rowUp', payload: { id: string }): void
  (e: 'dblclick', payload: { id: string }): void
  (e: 'dragstart', payload: { entry: any; event: DragEvent }): void
  (e: 'dragend'): void
  (e: 'headerClick', key: SortKey): void
  (e: 'surfacePointerDown', event: PointerEvent): void
  (e: 'surfacePointerMove', event: PointerEvent): void
  (e: 'surfacePointerUp', event: PointerEvent): void
  (e: 'surfaceClick', event: MouseEvent): void
  (e: 'planeScroll', event: Event): void
  (e: 'weightsChanged', weights: DetailWeights): void
}>()

/* -----------------------------------------------
   Constants
------------------------------------------------ */
const NAME_MIN = 140
const EXT_MIN  = 70
const SIZE_MIN = 90
const MIN_MOD_PX = 150
const headerH = 36

/* -----------------------------------------------
   Refs
------------------------------------------------ */
const detailsRootEl = ref<HTMLElement | null>(null)
const detailsScrollEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement | null>(null)
const padEl = ref<HTMLElement | null>(null)
const sbw = ref(0)

// Column weights (reactive)
const colW = ref<DetailWeights>({ ...props.initialWeights })

// Resize state
const isResizing = ref(false)
let resizing: null | {
  left: ResCol
  right: ResCol
  startX: number
  startLeftPx: number
  startRightPx: number
  pairPx: number
  startLeftW: number
  startRightW: number
  pairW: number
} = null

/* -----------------------------------------------
   Computed
------------------------------------------------ */
const detailsCols = computed(() =>
  `minmax(${NAME_MIN}px, ${colW.value.name}fr) ` +
  `minmax(${EXT_MIN}px, ${colW.value.ext}fr) ` +
  `minmax(${SIZE_MIN}px, ${colW.value.size}fr) ` +
  `minmax(${MIN_MOD_PX}px, ${colW.value.mod}fr)`
)

/* -----------------------------------------------
   Icon Helpers
------------------------------------------------ */
function iconIsImg(e: any): boolean {
  const icon = e?.Icon || ''
  return icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')
}

function iconSrc(e: any): string {
  return e?.Icon || ''
}

function iconText(e: any): string {
  return e?.Icon || (e?.Kind === 'dir' ? '📁' : '📄')
}

/* -----------------------------------------------
   Formatters
------------------------------------------------ */
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

/* -----------------------------------------------
   Helpers
------------------------------------------------ */
function modsFromEvent(e: PointerEvent | MouseEvent | KeyboardEvent) {
  return { 
    ctrl: e.ctrlKey || false, 
    meta: (e as any).metaKey || false, 
    shift: e.shiftKey || false, 
    alt: e.altKey || false 
  }
}

function normalizeWeights(o: DetailWeights): DetailWeights {
  const sum = Math.max(1, o.name + o.ext + o.size + o.mod)
  const scale = 100 / sum
  return {
    name: o.name * scale,
    ext: o.ext * scale,
    size: o.size * scale,
    mod: o.mod * scale,
  }
}

/* -----------------------------------------------
   Column Resize Logic
------------------------------------------------ */
function pairForHandle(col: ResCol): [ResCol, ResCol] {
  if (col === 'name') return ['name', 'ext']
  if (col === 'ext')  return ['ext',  'size']
  if (col === 'size') return ['size', 'mod']
  return ['mod', 'mod']
}

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

function startResize(col: ResCol, ev: PointerEvent) {
  const [left, right] = pairForHandle(col)
  if (left === 'mod' && right === 'mod') return

  const px = measureHeaderColsPx()

  const startLeftPx  = px[left]
  const startRightPx = px[right]
  const pairPx = Math.max(1, startLeftPx + startRightPx)

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

  const minBy: Record<ResCol, number> = {
    name: NAME_MIN, ext: EXT_MIN, size: SIZE_MIN, mod: MIN_MOD_PX
  }

  const minLeft  = minBy[resizing.left]
  const minRight = minBy[resizing.right]
  const maxLeft  = Math.max(minLeft, resizing.pairPx - minRight)
  const newLeftPx = Math.min(Math.max(resizing.startLeftPx + dx, minLeft), maxLeft)

  const k = resizing.pairW / resizing.pairPx
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
  if (colW.value) colW.value = normalizeWeights(colW.value)
  resizing = null
}

/* -----------------------------------------------
   Scrollbar Width Measurement
------------------------------------------------ */
function measureScrollbarWidth() {
  const el = detailsScrollEl.value
  const host = detailsRootEl.value
  if (!el || !host) return

  const raw = Math.max(0, el.offsetWidth - el.clientWidth)

  const minSum = NAME_MIN + EXT_MIN + SIZE_MIN + MIN_MOD_PX
  const gap = 6 * 3 // approximate
  const padX = 8 * 2
  const contentW = contentGridWidth()
  const atMinish = contentW <= (minSum + gap + padX + 1)

  const width = atMinish ? 0 : raw
  sbw.value = width
  host.style.setProperty('--sbw', `${width}px`)
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
  return 0
}

/* -----------------------------------------------
   Event Handlers
------------------------------------------------ */
function handleRowDown(id: string, event: PointerEvent) {
  emit('rowDown', { id, mods: modsFromEvent(event) })
}

function handleRowMove(x: number, y: number) {
  emit('rowMove', { x, y })
}

function handleRowUp(id: string) {
  emit('rowUp', { id })
}

function handleDblClick(id: string) {
  emit('dblclick', { id })
}

function handleDragStart(entry: any, event: DragEvent) {
  emit('dragstart', { entry, event })
}

function handleDragEnd() {
  emit('dragend')
}

function onHeaderClickFiltered(nextKey: SortKey, ev: MouseEvent) {
  const t = ev.target as HTMLElement | null
  if (t && t.closest('.resize-handle')) return
  emit('headerClick', nextKey)
}

/* -----------------------------------------------
   Lifecycle
------------------------------------------------ */
onMounted(() => {
  requestAnimationFrame(() => {
    measureScrollbarWidth()
  })
})

// Watch column weights and emit changes
watch(colW, (w) => {
  emit('weightsChanged', w)
}, { deep: true })

// Expose refs for parent (needed by marquee/selection engine)
defineExpose({
  detailsScrollEl,
  detailsRootEl,
  headerEl,
  padEl
})
</script>

<template>
  <div
    class="details-root"
    :data-icons="iconsTick"
    :style="{ '--cols': detailsCols, '--hdrH': headerH + 'px', '--sbw': sbw + 'px' }"
    ref="detailsRootEl"
  >
    <!-- Header OUTSIDE the scroll container -->
    <div class="details-header" ref="headerEl">
      <div class="details-header-inner">
        <button class="th th-name" @click="onHeaderClickFiltered('name', $event)">
          <span class="th-label">Name</span>
          <span v-if="sortKey === 'name'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          <span class="resize-handle" @pointerdown.stop.prevent="startResize('name', $event)" />
        </button>

        <button class="th th-ext" @click="onHeaderClickFiltered('ext', $event)">
          <span class="th-label">Ext</span>
          <span v-if="sortKey === 'ext'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          <span class="resize-handle" @pointerdown.stop.prevent="startResize('ext', $event)" />
        </button>

        <button class="th th-size" @click="onHeaderClickFiltered('size', $event)">
          <span class="th-label">Size</span>
          <span v-if="sortKey === 'size'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          <span class="resize-handle" @pointerdown.stop.prevent="startResize('size', $event)" />
        </button>

        <button class="th th-mod" @click="onHeaderClickFiltered('modified', $event)">
          <span class="th-label">Modified</span>
          <span v-if="sortKey === 'modified'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
        </button>
      </div>
    </div>

    <!-- Rows scroller (the interactive plane) -->
    <div
      class="details-scroll"
      ref="detailsScrollEl"
      tabindex="0"
      @pointerdown="(ev) => emit('surfacePointerDown', ev)"
      @pointermove="(ev) => emit('surfacePointerMove', ev)"
      @pointerup="(ev) => emit('surfacePointerUp', ev)"
      @click.capture="(ev) => emit('surfaceClick', ev)"
      @scroll.passive="(ev) => emit('planeScroll', ev)"
    >
      <!-- gutters live inside here to match header inner -->
      <div class="details-pad" ref="padEl">
        <div class="details-grid">
          <button
            class="row"
            :key="e.FullPath"
            :data-path="e.FullPath"
            v-for="(e, i) in entries"
            :class="{ selected: selected.has(e.FullPath) }"
            draggable="true"
            @pointerdown.stop="(ev) => handleRowDown(e.FullPath, ev)"
            @pointermove.stop="(ev) => handleRowMove(ev.clientX, ev.clientY)"
            @click.stop.prevent="() => handleRowUp(e.FullPath)"
            @dblclick.stop.prevent="() => handleDblClick(e.FullPath)"
            @dragstart="(ev) => handleDragStart(e, ev as DragEvent)"
            @dragend="() => handleDragEnd()"
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
                :data-widget-id="sourceId"
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
      
      <!-- Marquee overlay -->
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
</template>

<style scoped>
/* ================ DETAILS VIEW ================ */
.details-root {
  --padX: var(--space-sm);
  --padY: var(--space-xs);
  --gap:  var(--space-xs);
  --iconW: calc(1em * 1.4);
  --hdrH: 36px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: inherit; /* Inherit color from parent .items-root */
}

/* Header with outer gutters only */
.details-header {
  position: sticky;
  top: 0;
  z-index: 4;
  height: var(--hdrH);
  padding-inline: var(--items-gutter-left, 5%)
                  calc(var(--items-gutter-right, 5%) + var(--sbw, 0px));
  background: transparent;
  border-radius: var(--local-radius);
  box-sizing: border-box;
}

.details-header::before { display: none; }

/* Grid lives inside */
.details-header-inner {
  position: relative;
  height: var(--hdrH);
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;
  padding: 0 var(--padX);
  min-width: 0;
  background: var(--items-header-bg, var(--surface-2, #222));
  border-radius: var(--local-radius);
  overflow: visible;
}

/* Separators between header cells */
.details-header-inner > .th + .th {
  border-left: 1px solid var(--items-col-sep);
  padding-left: var(--space-xs);
}

/* Header cells */
.th {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--padY) 0;
  background: transparent;
  border: 0;
  color: inherit;
  font-weight: 600;
  min-width: 0;
  cursor: pointer;
}

.th .th-label { 
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap; 
}

.th-size, .th-mod { 
  justify-content: flex-end; 
  text-align: right; 
}

/* Resizer handles */
.resize-handle {
  position: absolute; 
  top: 0; 
  right: -6px; 
  width: 12px; 
  height: 100%;
  cursor: col-resize; 
  z-index: 2;
}

.resize-handle::after {
  content: ""; 
  position: absolute; 
  top: 0; 
  bottom: 0; 
  left: 50%;
  transform: translateX(-0.5px);
  width: 1px; 
  background: color-mix(in oklab, var(--fg, #fff) 28%, transparent);
}

.th:hover .resize-handle::after {
  background: color-mix(in oklab, var(--accent, #4ea1ff) 55%, transparent);
}

/* Scrollport */
.details-scroll {
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  flex: 1;
  min-height: 0;
}

/* Inner pad holds side gutters + header spacing */
.details-pad {
  position: relative;
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
}

/* Rows grid */
.details-grid { 
  display: grid; 
  gap: var(--space-xs); 
}

.details-grid .row {
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;
  border: 1px solid var(--items-border);
  background: var(--items-bg);
  color: inherit;
  border-radius: var(--local-radius);
  min-height: calc(var(--base-font-size) * 2.4);
  padding: var(--padY) var(--padX);
  box-sizing: border-box;
  cursor: pointer;
  font-size: var(--local-font-md);
  content-visibility: auto;
  contain-intrinsic-size: 32px;
}

.row:focus, 
.row:focus-visible { 
  outline: none !important; 
}

.row[draggable="true"] { 
  cursor: grab; 
}

.row[draggable="true"]:active { 
  cursor: grabbing; 
}

.row.selected { 
  box-shadow: inset 0 0 0 2px var(--accent, #4ea1ff) !important; 
}

/* Cells */
.td-name { 
  display: flex; 
  align-items: center; 
  gap: var(--space-sm); 
  min-width: 0; 
}

.td-ext, .td-size, .td-mod {
  opacity: 0.9; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  font-size: var(--local-font-sm);
}

/* Column separators */
.details-grid .row > .td + .td { 
  border-left: 1px solid var(--items-col-sep); 
  padding-left: var(--space-xs); 
}

/* Icon sizing */
.details-grid .td-name .icon {
  width: var(--iconW);
  height: var(--iconW);
  flex: 0 0 var(--iconW);
  display: flex; 
  align-items: center; 
  justify-content: center; 
  text-align: center;
}

.details-grid .td-name .icon img {
  width: 100%; 
  height: 100%; 
  object-fit: contain;
}

/* Name width */
.details-grid .td-name .name {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Numeric alignment */
.td-size, .td-mod { 
  font-variant-numeric: tabular-nums; 
  font-feature-settings: "tnum" 1; 
}

.td-size { 
  display: flex; 
  justify-content: flex-end; 
  gap: var(--space-xs); 
}

.td-mod { 
  display: flex; 
  justify-content: flex-end; 
  gap: var(--space-sm); 
}

/* Marquee */
.marquee {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 2;
  border: 1px solid var(--accent, #4ea1ff);
  background: color-mix(in oklab, var(--accent, #4ea1ff) 18%, transparent);
  border-radius: 4px;
}
</style>