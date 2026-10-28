<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { iconFor } from 'gexplorer/widgets'
import type { ListingEntry, ListingSortKey, ListingSortDir } from 'gexplorer/widgets'
import { COLUMN_LABELS, COMPACT_PX, DEFAULT_SHOWN, fitColumns, type DetailCol, type DetailWeights, type OptionalCol } from './detailColumns'

/* -----------------------------------------------
   Types
------------------------------------------------ */
type SortKey = ListingSortKey
type SortDir = ListingSortDir
type ResCol = DetailCol

/* -----------------------------------------------
   Props
   Rows are virtual (L3b): Widget.vue hands in the visible item `indices`
   (useVirtualList), `rowAt` / `isSelected` lookups, and the geometry
   (`totalHeight`, `offsetY`). Unloaded rows render as placeholders; one
   hidden sizer row gives the row height (rows must stay one line).
------------------------------------------------ */
const props = defineProps<{
  indices:          number[]
  rowAt:            (index: number) => ListingEntry | undefined
  isSelected:       (index: number) => boolean
  iconKeyOf:        (entry: ListingEntry) => string
  /** A folder shortcut that opens outside GEM Shell: badged. */
  opensElsewhere?: (entry: ListingEntry) => boolean
  totalHeight:      number
  offsetY:          number
  bindSizer:        (el: any) => void
  bindRows:         (el: any) => void
  iconsTick:        number
  sourceId:         string
  sortKey:          SortKey
  sortDir:          SortDir
  initialWeights:   DetailWeights
  /** The columns chosen in the header's menu, most recent first (as many show as fit). */
  shownColumns?:    OptionalCol[]
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
  (e: 'rowDown', payload: { index: number; ev: PointerEvent }): void
  (e: 'rowMove', payload: { x: number; y: number }): void
  (e: 'rowUp', payload: { index: number }): void
  (e: 'dblclick', payload: { index: number }): void
  (e: 'headerClick', key: SortKey): void
  (e: 'surfacePointerDown', event: PointerEvent): void
  (e: 'surfacePointerMove', event: PointerEvent): void
  (e: 'surfacePointerUp', event: PointerEvent): void
  (e: 'surfaceClick', event: MouseEvent): void
  (e: 'planeScroll', event: Event): void
  (e: 'weightsChanged', weights: DetailWeights): void
  /** Right-click on the header: Widget.vue shows the columns menu. */
  (e: 'headerMenu', event: MouseEvent): void
}>()

/* -----------------------------------------------
   Constants
------------------------------------------------ */
const headerH = 36

/* -----------------------------------------------
   Refs
------------------------------------------------ */
const detailsRootEl  = ref<HTMLElement | null>(null)
const detailsScrollEl = ref<HTMLElement | null>(null)
const headerEl       = ref<HTMLElement | null>(null)
const padEl          = ref<HTMLElement | null>(null)
const sbw            = ref(0)
/** The rows' box, measured: padding beside the rows, the width a row has, a row's own padding + borders, its column gap. */
const padL           = ref(0)
const padR           = ref(0)
const rowWidth       = ref(0)
const rowChrome      = ref(18)
const rowGap         = ref(6)

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
// One set of pixel widths for the header and the rows (detailColumns.ts): they can no longer drift
// apart, and below the comfortable widths the columns shrink, then hide, instead of overflowing.
const fit = computed(() => fitColumns(
  rowWidth.value,
  count => rowChrome.value + rowGap.value * Math.max(0, count - 1),
  colW.value,
  props.shownColumns ?? DEFAULT_SHOWN,
))
const shown = computed(() => {
  const set = new Set(fit.value.visible)
  return { ext: set.has('ext'), size: set.has('size'), mod: set.has('mod') }
})
const detailsCols = computed(() => rowWidth.value > 0
  ? fit.value.visible.map(col => `${fit.value.widths[col] ?? 0}px`).join(' ')
  // Not measured yet (first frame): the old fluid tracks.
  : fit.value.visible.map(col => `minmax(${COMPACT_PX[col]}px, ${colW.value[col]}fr)`).join(' '))
/** The next shown column after `col` (a resize handle moves the border between the two). */
function nextShown(col: DetailCol): DetailCol | null {
  const order = fit.value.visible
  const index = order.indexOf(col)
  return index >= 0 && index < order.length - 1 ? order[index + 1] : null
}

/* -----------------------------------------------
   VFS State Style Helpers
   Completely agnostic — works for any VFS scheme.
   The items widget never knows about gexchange,
   cut states, or any specific scheme. It just asks
   "what style should this entry have?" via the
   injected getEntryStyle function.
------------------------------------------------ */

// Returns inline CSS style object for a row based on its VFS state.
// Runs for every row on every render: no logging here (W1 removed two
// console.log calls per row).
function entryStyle(e: any): Record<string, string> {
  const s = props.getEntryStyle?.(e)
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
   W1: icons come from the host's shared icon cache. Widget.vue calls
   ensureIconsFor() with each entry's IconKey (from fs:listDir) and bumps
   iconsTick; iconFor() then returns the cached system icon (data URL), or a
   pack icon / emoji until it has arrived. Reading iconsTick on the root
   element makes the rows re-render when icons land. (entry.Icon, read before,
   was never set by anything.)
------------------------------------------------ */
function iconOf(e: ListingEntry): string {
  return iconFor({ iconKey: props.iconKeyOf(e), kind: e.Kind, ext: e.Ext })
}
function iconIsImg(e: any): boolean {
  const icon = iconOf(e)
  return icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')
}
function iconSrc(e: any): string { return iconOf(e) }
function iconText(e: any): string { return iconOf(e) }

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
function keyOf(i: number): string {
  return props.rowAt(i)?.Name ?? `\u0000placeholder:${i}`
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
  const next = nextShown(col)
  return next ? [col, next] : [col, col]
}

function measureHeaderColsPx() {
  const root = headerEl.value?.querySelector<HTMLElement>('.details-header-inner')
  if (!root) return { name: 0, ext: 0, size: 0, mod: 0 }
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)?.getBoundingClientRect().width || 0
  return { name: q('.th-name'), ext: q('.th-ext'), size: q('.th-size'), mod: q('.th-mod') }
}

function startResize(col: ResCol, ev: PointerEvent) {
  const [left, right] = pairForHandle(col)
  if (left === right) return
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
  const minLeft  = COMPACT_PX[resizing.left], minRight = COMPACT_PX[resizing.right]
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
   Measuring the rows' box (2026-10-27)
   The header lines up with the rows by construction: same left padding, same
   right padding plus the scrollbar's width (always, the old "no compensation
   near the minimum width" case was the narrow-pane misalignment), same
   border, same pixel tracks.
------------------------------------------------ */
function px(value: string): number { return parseFloat(value) || 0 }

function measure() {
  const scroll = detailsScrollEl.value, pad = padEl.value
  if (!scroll || !pad) return
  const padStyle = getComputedStyle(pad)
  padL.value = px(padStyle.paddingLeft)
  padR.value = px(padStyle.paddingRight)
  rowWidth.value = Math.max(0, pad.clientWidth - padL.value - padR.value)
  sbw.value = Math.max(0, scroll.offsetWidth - scroll.clientWidth)
  const sample = pad.querySelector<HTMLElement>('.row.sizer')
  if (sample) {
    const rowStyle = getComputedStyle(sample)
    rowChrome.value = px(rowStyle.paddingLeft) + px(rowStyle.paddingRight) + px(rowStyle.borderLeftWidth) + px(rowStyle.borderRightWidth)
    rowGap.value = px(rowStyle.columnGap)
  }
}

let observer: ResizeObserver | null = null

/* -----------------------------------------------
   Event Handlers
------------------------------------------------ */

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
onMounted(() => {
  requestAnimationFrame(measure)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure())
    if (detailsScrollEl.value) observer.observe(detailsScrollEl.value)
    if (padEl.value) observer.observe(padEl.value)
  }
})
onBeforeUnmount(() => { observer?.disconnect(); observer = null })
watch(colW, (w) => { emit('weightsChanged', w) }, { deep: true })
// Another folder's saved widths (the host gives each folder its own view).
watch(() => props.initialWeights, (w) => {
  if (isResizing.value || !w) return
  if ((Object.keys(w) as DetailCol[]).some(col => Math.abs((w[col] ?? 0) - (colW.value[col] ?? 0)) > 0.01)) colW.value = { ...w }
})
// fit: what the header's menu ticks (the columns on screen) and how many it has room for.
defineExpose({ detailsScrollEl, detailsRootEl, headerEl, padEl, fit })
</script>

<template>
  <div
    class="details-root"
    :data-icons="iconsTick"
    :class="{ 'date-only': fit.dateOnly }"
    :style="{ '--cols': detailsCols, '--hdrH': headerH + 'px', '--sbw': sbw + 'px', '--padL': padL + 'px', '--padR': padR + 'px' }"
    ref="detailsRootEl"
  >
    <!-- Header OUTSIDE the scroll container -->
    <div class="details-header" ref="headerEl">
      <div class="details-header-inner" @contextmenu.prevent.stop="(ev) => emit('headerMenu', ev)">
        <button
          v-for="col in fit.visible"
          :key="col"
          :class="['th', `th-${col}`]"
          :title="col === 'name' ? 'Right-click to choose the columns' : undefined"
          @click="onHeaderClickFiltered(col === 'mod' ? 'modified' : col, $event)"
        >
          <span class="th-label">{{ COLUMN_LABELS[col] }}</span>
          <span v-if="sortKey === (col === 'mod' ? 'modified' : col)" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          <span v-if="nextShown(col)" class="resize-handle" @pointerdown.stop.prevent="startResize(col, $event)" />
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

      <div class="details-pad" ref="padEl" :style="{ height: totalHeight + 'px' }">
        <div class="details-grid" :ref="bindRows" :style="{ transform: `translateY(${offsetY}px)` }">
          <template v-for="i in indices" :key="keyOf(i)">
            <button
              v-if="rowAt(i)"
              class="row"
              :data-path="rowAt(i)!.FullPath"
              :data-index="i"
              :data-kind="rowAt(i)!.Kind"
              :class="{
                selected:             isSelected(i),
                'folder-drop-target': rowAt(i)!.FullPath === props.folderDropTarget,
                'vfs-ghost':          rowAt(i)!.Meta?.blobState === 'ghost',
                'vfs-fetching':       rowAt(i)!.Meta?.blobState === 'fetching',
                'vfs-unseeded':       rowAt(i)!.Meta?.blobState === 'unseeded',
              }"
              :style="entryStyle(rowAt(i)!)"
              @pointerdown.stop="(ev) => emit('rowDown', { index: i, ev })"
              @pointermove.stop="(ev) => emit('rowMove', { x: ev.clientX, y: ev.clientY })"
              @click.stop.prevent="() => emit('rowUp', { index: i })"
              @dblclick.stop.prevent="() => emit('dblclick', { index: i })"
            >
              <!-- Name cell -->
              <div class="td td-name" :title="rowAt(i)!.Name">
                <span class="icon">
                  <img v-if="iconIsImg(rowAt(i)!)" :src="iconSrc(rowAt(i)!)" alt="" />
                  <span v-else>{{ iconText(rowAt(i)!) }}</span>
                  <span v-if="opensElsewhere?.(rowAt(i)!)" class="lnk-elsewhere" title="Opens in the system's file manager, not GEM Shell">↗</span>
                </span>

                <!-- VFS state badge — only rendered when provider declares one.
                     Completely agnostic: any VFS scheme can show a badge here
                     by returning badge/badgeTitle/animated from getEntryStyle. -->
                <span
                  v-if="entryBadge(rowAt(i)!)"
                  class="vfs-badge"
                  :class="{ 'vfs-badge--animated': entryBadge(rowAt(i)!)?.animated }"
                  :title="entryBadge(rowAt(i)!)?.title"
                >{{ entryBadge(rowAt(i)!)?.text }}</span>

                <span
                  class="name"
                  :class="{ 'vfs-dim-name': entryDimName(rowAt(i)!) }"
                  :data-rename-id="rowAt(i)!.FullPath"
                  :data-rename-value="rowAt(i)!.Name"
                  :data-widget-id="sourceId"
                >{{ rowAt(i)!.Name }}</span>
              </div>

              <div v-if="shown.ext" class="td td-ext"  :title="rowAt(i)!.Ext">{{ rowAt(i)!.Ext }}</div>
              <div v-if="shown.size" class="td td-size" :title="sizeLabel(rowAt(i)!)">
                <span class="num">{{ sizeParts(rowAt(i)!.Size).num }}</span>
                <span class="unit">{{ sizeParts(rowAt(i)!.Size).unit }}</span>
              </div>
              <div v-if="shown.mod" class="td td-mod" :title="modLabel(rowAt(i)!)">
                <span class="date">{{ modParts(rowAt(i)!.ModifiedAt).date }}</span>
                <span class="time">{{ modParts(rowAt(i)!.ModifiedAt).time }}</span>
              </div>
            </button>
            <div v-else class="row placeholder" :data-index="i" aria-hidden="true">
              <div class="td td-name"><span class="icon" /><span class="name">&nbsp;</span></div>
              <div v-if="shown.ext" class="td td-ext" /><div v-if="shown.size" class="td td-size" /><div v-if="shown.mod" class="td td-mod" />
            </div>
          </template>
        </div>

        <!-- Row-height probe for useVirtualList (same classes as a row, never visible) -->
        <div class="details-grid sizer-grid" aria-hidden="true">
          <div class="row sizer" :ref="bindSizer">
            <div class="td td-name"><span class="icon" /><span class="name">X</span></div>
            <div v-if="shown.ext" class="td td-ext">X</div><div v-if="shown.size" class="td td-size">X</div><div v-if="shown.mod" class="td td-mod">X</div>
          </div>
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
  /* The rows' measured padding (their % gutters resolve against a narrower box: the scrollbar). */
  padding-inline: var(--padL, var(--items-gutter-left, 5%))
                  calc(var(--padR, var(--items-gutter-right, 5%)) + var(--sbw, 0px));
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
  border: 1px solid transparent;   /* as wide as a row: rows have a 1px border */
  border-radius: var(--local-radius);
  box-sizing: border-box;
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
}

.details-grid { will-change: transform; }

/* Sizer: an out-of-flow copy of a row, measured by useVirtualList. */
.sizer-grid {
  position: absolute;
  top: 0;
  left: var(--items-gutter-left, 5%);
  right: var(--items-gutter-right, 5%);
  visibility: hidden;
  pointer-events: none;
}

.placeholder { opacity: 0.35; }

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
  position: relative;
  width: var(--iconW); height: var(--iconW); flex: 0 0 var(--iconW);
  display: flex; align-items: center; justify-content: center; text-align: center;
}

/* A folder shortcut that opens outside GEM Shell (shortcuts:probe opensElsewhere, 2026-10-18) */
.lnk-elsewhere {
  position: absolute;
  right: -3px;
  bottom: -3px;
  font-size: 0.6em;
  line-height: 1;
  padding: 1px 2px;
  border-radius: 3px;
  background: var(--items-bg, #111);
  color: var(--accent, #4ea1ff);
  pointer-events: auto;
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
/* Modified too narrow for the time: the date only (the tooltip has both). */
.date-only .td-mod .time { display: none; }
.td-size .num, .td-mod .date { overflow: hidden; text-overflow: ellipsis; }

.marquee {
  position: absolute; box-sizing: border-box; pointer-events: none; z-index: 2;
  border: 1px solid var(--accent, #4ea1ff);
  background: color-mix(in oklab, var(--accent, #4ea1ff) 18%, transparent);
  border-radius: 4px;
}
</style>