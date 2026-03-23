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
  entries:          any[]
  selected:         Set<string>
  iconsTick:        number
  sourceId:         string
  sortKey:          SortKey
  sortDir:          SortDir
  initialWeights:   DetailWeights
  folderDropTarget?: string | null
  marqueeRect:      { x: number; y: number; w: number; h: number } | null
  // VFS state styles — injected by the app via SDK, not by the widget itself.
  // The function accepts an entry and returns a style object (or null).
  // Completely agnostic — works for any VFS scheme that declares stateStyles.
  getEntryStyle?:   ((entry: any) => any | null) | null
}>()

/* -----------------------------------------------
   Emits
------------------------------------------------ */
const emit = defineEmits<{
  (e: 'rowDown', payload: { id: string; mods: any }): void
  (e: 'rowMove', payload: { x: number; y: number }): void
  (e: 'rowUp', payload: { id: string }): void
  (e: 'dblclick', payload: { id: string; entry: any }): void
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
const detailsRootEl  = ref<HTMLElement | null>(null)
const detailsScrollEl = ref<HTMLElement | null>(null)
const headerEl       = ref<HTMLElement | null>(null)
const padEl          = ref<HTMLElement | null>(null)
const sbw            = ref(0)

const colW = ref<DetailWeights>({ ...props.initialWeights })
const isResizing = ref(false)
let resizing: null | {
  left: ResCol; right: ResCol; startX: number
  startLeftPx: number; startRightPx: number; pairPx: number
  startLeftW: number; startRightW: number; pairW: number
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
   VFS State Style Helpers
   Completely agnostic — works for any VFS scheme.
   The items widget never knows about gexchange,
   cut states, or any specific scheme. It just asks
   "what style should this entry have?" via the
   injected getEntryStyle function.
------------------------------------------------ */

// Returns inline CSS style object for a row based on its VFS state.
function entryStyle(e: any): Record<string, string> {
  console.log('[entryStyle] called, hasGetEntryStyle:', !!props.getEntryStyle)
  const s = props.getEntryStyle?.(e)
  console.log('[entryStyle] result:', s)
  
  if (!s) return {}
  const style: Record<string, string> = {}
  if (s.opacity  != null) style.opacity    = String(s.opacity)
  if (s.cursor)           style.cursor     = s.cursor
  if (s.background)       style.background = s.background
  return style
}

// Returns badge data for a row — shown as a small icon next to the filename.
// null = no badge (local files, physical files, etc.)
function entryBadge(e: any): { text: string; title: string; animated: boolean } | null {
  const s = props.getEntryStyle?.(e)
  if (!s?.badge) return null
  return {
    text:     s.badge,
    title:    s.badgeTitle ?? '',
    animated: s.animated   ?? false,
  }
}

// Returns true if the filename should be rendered dim+italic.
function entryDimName(e: any): boolean {
  return !!(props.getEntryStyle?.(e)?.dimName)
}

/* -----------------------------------------------
   Icon Helpers
------------------------------------------------ */
function iconIsImg(e: any): boolean {
  const icon = e?.Icon || ''
  return icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')
}
function iconSrc(e: any): string { return e?.Icon || '' }
function iconText(e: any): string { return e?.Icon || (e?.Kind === 'dir' ? '📁' : '📄') }

/* -----------------------------------------------
   Formatters
------------------------------------------------ */
function sizeParts(bytes?: number | null): { num: string; unit: string } {
  if (bytes == null || bytes < 0) return { num: '', unit: '' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let n = bytes, i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  const num = i === 0 ? Math.round(n).toString()
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
  return p.num ? `${p.num} ${p.unit}` : ''
}
function modLabel(e: any) {
  const p = modParts(e?.ModifiedAt)
  return p.date && p.time ? `${p.date} ${p.time}` : ''
}

/* -----------------------------------------------
   Helpers
------------------------------------------------ */
function modsFromEvent(e: PointerEvent | MouseEvent | KeyboardEvent) {
  return { ctrl: e.ctrlKey || false, meta: (e as any).metaKey || false, shift: e.shiftKey || false, alt: e.altKey || false }
}

function normalizeWeights(o: DetailWeights): DetailWeights {
  const sum = Math.max(1, o.name + o.ext + o.size + o.mod)
  const scale = 100 / sum
  return { name: o.name * scale, ext: o.ext * scale, size: o.size * scale, mod: o.mod * scale }
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
  return { name: q('.th-name'), ext: q('.th-ext'), size: q('.th-size'), mod: q('.th-mod') }
}

function startResize(col: ResCol, ev: PointerEvent) {
  const [left, right] = pairForHandle(col)
  if (left === 'mod' && right === 'mod') return
  const px = measureHeaderColsPx()
  const startLeftPx  = px[left], startRightPx = px[right]
  const pairPx = Math.max(1, startLeftPx + startRightPx)
  const startLeftW   = colW.value[left], startRightW = colW.value[right]
  const pairW = Math.max(0.0001, startLeftW + startRightW)
  const target = ev.currentTarget as HTMLElement
  target.setPointerCapture?.(ev.pointerId)
  resizing = { left, right, startX: ev.clientX, startLeftPx, startRightPx, pairPx, startLeftW, startRightW, pairW }
  isResizing.value = true
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd, { once: true })
  ev.preventDefault(); ev.stopPropagation()
}

function onResizeMove(ev: PointerEvent) {
  if (!resizing) return
  const dx = ev.clientX - resizing.startX
  const minBy: Record<ResCol, number> = { name: NAME_MIN, ext: EXT_MIN, size: SIZE_MIN, mod: MIN_MOD_PX }
  const minLeft  = minBy[resizing.left], minRight = minBy[resizing.right]
  const maxLeft  = Math.max(minLeft, resizing.pairPx - minRight)
  const newLeftPx = Math.min(Math.max(resizing.startLeftPx + dx, minLeft), maxLeft)
  const k = resizing.pairW / resizing.pairPx
  const newLeftW = newLeftPx * k, newRightW = resizing.pairW - newLeftW
  colW.value = { ...colW.value, [resizing.left]: newLeftW, [resizing.right]: newRightW } as DetailWeights
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
  const el = detailsScrollEl.value, host = detailsRootEl.value
  if (!el || !host) return
  const raw = Math.max(0, el.offsetWidth - el.clientWidth)
  const minSum = NAME_MIN + EXT_MIN + SIZE_MIN + MIN_MOD_PX
  const gap = 6 * 3, padX = 8 * 2
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
    return pad.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
  }
  return 0
}

/* -----------------------------------------------
   Event Handlers
------------------------------------------------ */
function handleRowDown(id: string, event: PointerEvent) { emit('rowDown', { id, mods: modsFromEvent(event) }) }
function handleRowMove(x: number, y: number)            { emit('rowMove', { x, y }) }
function handleRowUp(id: string)                        { emit('rowUp', { id }) }
function handleDblClick(id: string, entry: any)         { emit('dblclick', { id, entry })}
function handleDragStart(entry: any, event: DragEvent)  { emit('dragstart', { entry, event }) }
function handleDragEnd()                                { emit('dragend') }

function onHeaderClickFiltered(nextKey: SortKey, ev: MouseEvent) {
  const t = ev.target as HTMLElement | null
  if (t && t.closest('.resize-handle')) return
  emit('headerClick', nextKey)
}

function onSurfacePointerDown(ev: PointerEvent) { emit('surfacePointerDown', ev) }
function onSurfacePointerMove(ev: PointerEvent) { emit('surfacePointerMove', ev) }
function onSurfacePointerUp(ev: PointerEvent)   { emit('surfacePointerUp', ev) }
function onSurfaceClick(ev: MouseEvent)         { emit('surfaceClick', ev) }

/* -----------------------------------------------
   Lifecycle
------------------------------------------------ */
onMounted(() => { requestAnimationFrame(() => { measureScrollbarWidth() }) })
onMounted(() => {
    console.log('[ItemsDetailsLayout] mounted, hasGetEntryStyle:', !!props.getEntryStyle)
})
watch(colW, (w) => { emit('weightsChanged', w) }, { deep: true })
defineExpose({ detailsScrollEl, detailsRootEl, headerEl, padEl })
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

    <!-- Rows scroller -->
    <div
      class="details-scroll"
      ref="detailsScrollEl"
      tabindex="0"
      @pointerdown="onSurfacePointerDown"
      @pointermove="onSurfacePointerMove"
      @pointerup="onSurfacePointerUp"
      @click.capture="onSurfaceClick"
      @scroll.passive="(ev) => emit('planeScroll', ev)"
    >
      <div
        v-if="marqueeRect"
        class="marquee"
        :style="{ left: marqueeRect.x + 'px', top: marqueeRect.y + 'px', width: marqueeRect.w + 'px', height: marqueeRect.h + 'px' }"
      />

      <div class="details-pad" ref="padEl">
        <div class="details-grid">
          <button
            class="row"
            :key="e.FullPath"
            :data-path="e.FullPath"
            v-for="(e, i) in entries"
            :class="{
              selected:             selected.has(e.FullPath),
              'folder-drop-target': e.FullPath === props.folderDropTarget,
              'vfs-ghost':          e.Meta?.blobState === 'ghost',
              'vfs-fetching':       e.Meta?.blobState === 'fetching',
              'vfs-unseeded':       e.Meta?.blobState === 'unseeded',
            }"
            :style="entryStyle(e)"
            @pointerdown.stop="(ev) => handleRowDown(e.FullPath, ev)"
            @pointermove.stop="(ev) => handleRowMove(ev.clientX, ev.clientY)"
            @click.stop.prevent="() => handleRowUp(e.FullPath)"
            @dblclick.stop.prevent="() => handleDblClick(e.FullPath, e)"
          >
            <!-- Name cell -->
            <div class="td td-name" :title="e.Name || e.FullPath">
              <span class="icon">
                <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
                <span v-else>{{ iconText(e) }}</span>
              </span>

              <!-- VFS state badge — only rendered when provider declares one.
                   Completely agnostic: any VFS scheme can show a badge here
                   by returning badge/badgeTitle/animated from getEntryStyle. -->
              <span
                v-if="entryBadge(e)"
                class="vfs-badge"
                :class="{ 'vfs-badge--animated': entryBadge(e)?.animated }"
                :title="entryBadge(e)?.title"
              >{{ entryBadge(e)?.text }}</span>

              <span
                class="name"
                :class="{ 'vfs-dim-name': entryDimName(e) }"
                :data-rename-id="e.FullPath"
                :data-rename-value="e.Name"
                :data-widget-id="sourceId"
              >{{ e.Name || e.FullPath }}</span>
            </div>

            <div class="td td-ext"  :title="e.Ext || ''">{{ e.Ext || '' }}</div>
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
    </div>
  </div>
</template>

<style scoped>
.row.folder-drop-target {
  box-shadow: inset 0 0 0 2px var(--accent, #4ea1ff),
              inset 0 0 0 4px color-mix(in oklab, var(--accent, #4ea1ff) 25%, transparent) !important;
  background: color-mix(in oklab, var(--accent, #4ea1ff) 10%, transparent) !important;
}

/* ── VFS state CSS hooks ──────────────────────────────────────────────────────
   Opacity and cursor come from :style binding (entryStyle), not here.
   These classes exist as hooks for theming and devtools inspection.
   The cut operation will use the same pattern when it's implemented:
   a system VFS provider returns { opacity: 0.45 } for blobState='cut'.    */
.row.vfs-ghost    {}
.row.vfs-fetching {}
.row.vfs-unseeded {}

/* ── VFS state badge ──────────────────────────────────────────────────────── */
.vfs-badge {
  display:         inline-flex;
  align-items:     center;
  justify-content: center;
  width:           15px;
  height:          15px;
  border-radius:   3px;
  font-size:       9px;
  font-weight:     600;
  flex-shrink:     0;
  margin-right:    3px;
  background:      color-mix(in oklab, var(--accent, #4ea1ff) 15%, transparent);
  color:           var(--accent, #4ea1ff);
  user-select:     none;
  cursor:          default;
}

.vfs-badge--animated {
  animation: vfs-spin 1.2s linear infinite;
}

@keyframes vfs-spin { to { transform: rotate(360deg); } }

/* ── Dim name (ghost / unseeded) ─────────────────────────────────────────── */
.vfs-dim-name {
  font-style: italic;
  color:      color-mix(in oklab, currentColor 60%, transparent);
}

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
  color: inherit;
}

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

.details-header-inner > .th + .th {
  border-left: 1px solid var(--items-col-sep);
  padding-left: var(--space-xs);
}

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

.th .th-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-size, .th-mod { justify-content: flex-end; text-align: right; }

.resize-handle {
  position: absolute; top: 0; right: -6px; width: 12px; height: 100%;
  cursor: col-resize; z-index: 2;
}

.resize-handle::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
  transform: translateX(-0.5px); width: 1px;
  background: color-mix(in oklab, var(--fg, #fff) 28%, transparent);
}

.th:hover .resize-handle::after {
  background: color-mix(in oklab, var(--accent, #4ea1ff) 55%, transparent);
}

.details-scroll {
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  flex: 1;
  min-height: 0;
}

.details-pad {
  position: relative;
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
}

.details-grid { display: grid; gap: var(--space-xs); }

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
  text-align: var(--items-row-text-align, left);
  content-visibility: auto;
  contain-intrinsic-size: 32px;
}

.row:focus, .row:focus-visible { outline: none !important; }
.row { cursor: grab; }
.row:active { cursor: grabbing; }
.row.selected { box-shadow: inset 0 0 0 2px var(--accent, #4ea1ff) !important; }

.td-name { display: flex; align-items: center; gap: var(--space-sm); min-width: 0; }

.td-ext, .td-size, .td-mod {
  opacity: 0.9; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-size: var(--local-font-sm);
}

.details-grid .row > .td + .td {
  border-left: 1px solid var(--items-col-sep);
  padding-left: var(--space-xs);
}

.details-grid .td-name .icon {
  width: var(--iconW); height: var(--iconW); flex: 0 0 var(--iconW);
  display: flex; align-items: center; justify-content: center; text-align: center;
}

.details-grid .td-name .icon img { width: 100%; height: 100%; object-fit: contain; }

.details-grid .td-name .name {
  flex: 1 1 auto; min-width: 0; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-align: var(--items-name-text-align, left);
}

.td-size, .td-mod { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
.td-size { display: flex; justify-content: flex-end; gap: var(--space-xs); }
.td-mod  { display: flex; justify-content: flex-end; gap: var(--space-sm); }

.marquee {
  position: absolute; box-sizing: border-box; pointer-events: none; z-index: 2;
  border: 1px solid var(--accent, #4ea1ff);
  background: color-mix(in oklab, var(--accent, #4ea1ff) 18%, transparent);
  border-radius: 4px;
}
</style>