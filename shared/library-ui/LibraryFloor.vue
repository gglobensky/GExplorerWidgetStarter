<script setup lang="ts" generic="T extends LibraryItem">
// The store floor (2.0.0, 2026-10-31; the Video Club's showroom before): an aisle of racks that scrolls sideways,
// featured racks at its head, and a rack's department (its boxes on shelves that wrap) once the user steps closer.
// Generic over the item. What the widget says and adds:
//   - slot `intro`: the floor's heading (the Video Club's wordmark);
//   - slot `focus-tools`: beside the department's title (the Video Club's season filter);
//   - slot `marks`: on each box of a department (see LibraryCase);
//   - rowsFor(shelf, maxRows) / countFor(shelf): a rack's rows (at most maxRows: what its height holds) and count
//     (default: its items in rows of RACK_CAPACITY);
//   - rowCount(row) / setCount(n) / setUnit / itemsNoun: the words of the counts;
//   - 3.6.0, a department's shelves (shelfLabels.ts): tagFor(item) a label on the shelf's edge under each box,
//     pickFor(item) a staff-pick card on a few, rowStrip(items) a strip at each shelf's left end.
// The department shows activeItems (default: the shelf's items) and activeNote (default: its note): a widget
// filtering them passes the filtered ones.
// A rack is reached from the widget's own top-bar list (the Video Club's "Genres", 2.4.0: the shop opens that rack's
// department, as a click on it does). jumpTo(shelfId) on the floor's ref centres a rack in the aisle and lights it.
// Platform sections (PC, consoles) will come here with the Game Library's emulation (plan 2026-10-31).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import ArtworkFrame from './ArtworkFrame.vue'
import LibraryCase from './LibraryCase.vue'
import type { LibraryCaseVariant, LibraryFloorRow, LibraryItem, LibraryShelf } from './types'

const props = withDefaults(defineProps<{
  /** Genre racks. */
  shelves: LibraryShelf<T>[]
  /** Racks at the head of the aisle (Continue watching, New arrivals, Collections): their own items, in their order. */
  featured?: LibraryShelf<T>[]
  activeShelf?: LibraryShelf<T> | null
  /** The department's boxes when the widget filters them (default: the active shelf's items). */
  activeItems?: T[]
  /** The department's note when the widget changes it (default: the active shelf's note). */
  activeNote?: string
  selectedId?: string
  variant?: LibraryCaseVariant
  /** The line under each box's title in a department (see LibraryCase). */
  caption?: (item: T) => string
  /**
   * A genre rack's rows (default: its items, RACK_CAPACITY per row). maxRows (2.8.0): as many as the rack's height
   * holds (3 to 10, measured): rows past it would be cut off.
   */
  rowsFor?: (shelf: LibraryShelf<T>, maxRows: number) => LibraryFloorRow<T>[]
  /** A genre rack's count (default: its items). */
  countFor?: (shelf: LibraryShelf<T>) => number
  /** A row label's count (default "3 titles"). */
  rowCount?: (row: LibraryFloorRow<T>) => string
  /** A set's count in a department (default "3 titles"). */
  setCount?: (count: number) => string
  /** The unit of a featured set's row (passed to rowCount; the Video Club's Collections: 'movie'). */
  setUnit?: string
  /** What a rack's boxes are, for screen readers ("Browse Comedy, 12 titles"). */
  itemsNoun?: string
  /** 3.6.0: a department box's label on the shelf's edge ("37 h played"); undefined: none. */
  tagFor?: (item: T) => string | undefined
  /** 3.6.0: a department box's staff-pick card (lines split by \n); undefined: none. */
  pickFor?: (item: T) => string | undefined
  /** 3.6.0: the strip at a department shelf's left end ("A – D"); undefined: none. */
  rowStrip?: (items: T[]) => string | undefined
}>(), { variant: 'dvd', itemsNoun: 'titles' })
const emit = defineEmits<{
  (e:'select-shelf', shelfId:string):void
  (e:'open', item:T):void
  (e:'menu', item:T, event:MouseEvent):void
}>()
defineSlots<{
  intro?: () => any
  'focus-tools'?: () => any
  marks?: (props: { item: T }) => any
}>()
/** The rows a rack shows at least, and at most (2.6.0: as many as its height holds, Guillaume). */
const FEATURED_ROWS = 3
const MAX_ROWS = 10
const RACK_CAPACITY = 6
/** How many rows the racks' height holds (measured; FEATURED_ROWS until it is). */
const fitRows = ref(FEATURED_ROWS)

const root = ref<HTMLElement | null>(null)
const rackScroller = ref<HTMLElement | null>(null)
const columns = ref(6)
let observer: ResizeObserver | null = null

const titles = (count: number) => `${count} ${count === 1 ? 'title' : 'titles'}`
const rowCountText = (row: LibraryFloorRow<T>) => props.rowCount ? props.rowCount(row) : titles(row.total)
const setCountText = (count: number) => props.setCount ? props.setCount(count) : titles(count)
const departmentItems = computed(() => props.activeItems ?? props.activeShelf?.items ?? [])
const departmentNote = computed(() => props.activeNote ?? props.activeShelf?.note)
function chunk(items: T[]): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += columns.value) result.push(items.slice(index,index + columns.value))
  return result
}
/** The department's shelves: one per set where the shelf has sets (Collections), else its items in rows. */
const sections = computed(() => {
  const shelf = props.activeShelf
  if (shelf?.groups?.length) return shelf.groups.map(group => ({ id:group.id, label:group.title, count:group.items.length, rows:chunk(group.items) }))
  return [{ id:shelf?.id ?? 'shelf', label:'', count:0, rows:chunk(departmentItems.value) }]
})
function featuredRows(shelf: LibraryShelf<T>): LibraryFloorRow<T>[] {
  // Sets (Collections): one row each, never two sets on a row.
  if (shelf.groups?.length) return shelf.groups.slice(0, fitRows.value).map(group => ({
    id:group.id, label:group.title, unit:props.setUnit, total:group.items.length, items:group.items.slice(0, RACK_CAPACITY),
  }))
  const rows: LibraryFloorRow<T>[] = []
  for (let index = 0; index < shelf.items.length && rows.length < fitRows.value; index += RACK_CAPACITY) {
    const items = shelf.items.slice(index, index + RACK_CAPACITY)
    const last = rows.length === fitRows.value - 1
    rows.push({ id:`${shelf.id}-${rows.length}`, total:last ? shelf.items.length - index : items.length, items })
  }
  return rows
}
// ── A big department, windowed (2.7.0, 2.7.1) ──
// "All games" with 800 boxes drew every box at once (and their pictures): sluggish (Guillaume). A department with no
// sets and more than WINDOW_FROM rows draws only the rows in view. Every row is the same height: one hidden sizer row
// measures it. 2.7.1: the rows in view come from where the rows' wrapper sits on screen against the visible part of
// its scroller (both read with getBoundingClientRect on every scroll frame), not from a scrollTop and a measured
// offset: 2.7.0 drew the rows a viewport above where they belonged (an empty screen once the scroll stopped).
const WINDOW_FROM = 8
const OVERSCAN = 2
const focusRows = ref<HTMLElement | null>(null)
const focusBlock = ref<HTMLElement | null>(null)
const sizerRow = ref<HTMLElement | null>(null)
const windowed = computed(() => !!props.activeShelf && sections.value.length === 1 && !sections.value[0].label && sections.value[0].rows.length > WINDOW_FROM)
const windowRows = computed(() => (windowed.value ? sections.value[0].rows : []))
/** One row's height plus the gap under it; 0 until measured. */
const rowPitch = ref(0)
const rowGap = ref(20)
const windowStart = ref(0)
const windowEnd = ref(Math.min(6, WINDOW_FROM))
const windowIndices = computed(() => {
  const count = windowRows.value.length
  const out: number[] = []
  for (let i = Math.min(windowStart.value, count); i < Math.min(windowEnd.value, count); i++) out.push(i)
  return out
})
/** The nearest parent that scrolls vertically (its visible part is the view); none: the window. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const y = getComputedStyle(node).overflowY
    if (y === 'auto' || y === 'scroll' || y === 'overlay') return node
    node = node.parentElement
  }
  return null
}
function updateWindow() {
  const wrapper = focusRows.value
  if (!windowed.value || !wrapper) return
  const sizer = sizerRow.value
  if (sizer?.offsetHeight) {
    rowGap.value = parseFloat(getComputedStyle(focusBlock.value ?? wrapper).rowGap) || 0
    rowPitch.value = sizer.offsetHeight + rowGap.value
  }
  const pitch = rowPitch.value
  if (!pitch) return
  const count = windowRows.value.length
  const box = wrapper.getBoundingClientRect()
  const scroller = scrollerOf(wrapper)
  const view = scroller?.getBoundingClientRect()
  const viewTop = Math.max(view ? view.top : 0, 0)
  const viewBottom = Math.min(view ? view.bottom : window.innerHeight, window.innerHeight)
  // The zoom-in animation scales the floor for a moment: rects are in screen px, rows in layout px
  const scale = wrapper.offsetHeight ? box.height / wrapper.offsetHeight || 1 : 1
  const top = (viewTop - box.top) / scale
  const bottom = (viewBottom - box.top) / scale
  const start = Math.max(0, Math.min(count, Math.floor(top / pitch) - OVERSCAN))
  const end = Math.max(start, Math.min(count, Math.ceil(bottom / pitch) + OVERSCAN))
  if (start !== windowStart.value) windowStart.value = start
  if (end !== windowEnd.value) windowEnd.value = end
}
let windowFrame = 0
function queueWindow() {
  if (windowFrame) return
  windowFrame = requestAnimationFrame(() => { windowFrame = 0; updateWindow() })
}
// Scroll events don't bubble but they can be caught on the way down: any scroller moving the rows counts
const onAnyScroll = () => { if (windowed.value) queueWindow() }
watch(windowed, on => { if (on) { windowStart.value = 0; windowEnd.value = 6; void nextTick(updateWindow) } }, { immediate: true })
watch(() => windowRows.value.length, () => { if (windowed.value) void nextTick(updateWindow) })
/** The rows wrapper's full height and the drawn block's place in it. */
const windowStyle = computed(() => {
  const count = windowRows.value.length
  const pitch = rowPitch.value
  return { position: 'relative' as const, height: pitch ? `${Math.max(0, count * pitch - rowGap.value)}px` : 'auto' }
})
const windowBlockStyle = computed(() => ({ transform: `translateY(${windowStart.value * rowPitch.value}px)` }))

const featuredShelves = computed(() => props.featured ?? [])
const racks = computed(() => [
  ...featuredShelves.value.map(shelf => ({ shelf, featured:true })),
  ...props.shelves.map(shelf => ({ shelf, featured:false })),
])
const rackRows = computed(() => new Map([
  ...featuredShelves.value.map(shelf => [shelf.id,featuredRows(shelf)] as const),
  ...props.shelves.map(shelf => [shelf.id,props.rowsFor ? props.rowsFor(shelf, fitRows.value) : featuredRows(shelf)] as const),
]))
/**
 * 3.7.1: some row of the aisle has a label (the Video Club's series and sets): then every row keeps its room, so the
 * shelves of every rack are level (Guillaume: "Continue watching" sat higher than the genres).
 */
const rowsLabelled = computed(() => [...rackRows.value.values()].some(rows => rows.some(row => !!row.label)))
const rackCounts = computed(() => new Map([
  ...featuredShelves.value.map(shelf => [shelf.id,shelf.items.length] as const),
  ...props.shelves.map(shelf => [shelf.id,props.countFor ? props.countFor(shelf) : shelf.items.length] as const),
]))
const {
  hasOverflow: racksHaveOverflow,
  atStart: racksAtStart,
  atEnd: racksAtEnd,
  scrollByPage: scrollRacksByPage,
} = useScrollHints({
  scrollEl:rackScroller,
  axis:'x',
  deps:() => `${props.activeShelf?.id ?? 'showroom'}:${props.shelves.map(shelf => shelf.id).join('|')}`,
  eps:2,
  wheel:'transpose',
  pageRatio:.88,
  minPageStep:240,
})

// ── Jumping to a rack ──
const spotlight = ref<string | null>(null)
let spotlightTimer: ReturnType<typeof setTimeout> | undefined
/** Scrolls the aisle until the rack is in the middle, lights it, and gives it the keyboard focus. */
function jumpTo(shelfId: string) {
  const scroller = rackScroller.value
  const rack = scroller?.querySelector<HTMLElement>(`[data-shelf-id="${CSS.escape(shelfId)}"]`)
  if (!scroller || !rack) return
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const left = rack.offsetLeft - (scroller.clientWidth - rack.offsetWidth) / 2
  scroller.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' })
  rack.focus({ preventScroll: true })
  spotlight.value = shelfId
  if (spotlightTimer) clearTimeout(spotlightTimer)
  spotlightTimer = setTimeout(() => { spotlight.value = null }, 1400)
}

function measure() {
  const width = root.value?.clientWidth ?? 0
  columns.value = width >= 940 ? 6 : width >= 790 ? 5 : width >= 620 ? 4 : width >= 420 ? 3 : 2
  measureRows()
  if (windowed.value) queueWindow()
}

/** 2.6.0: the rows one rack's shelves hold at its height (a tall widget shows more than three). */
function measureRows() {
  const shelves = rackScroller.value?.querySelector<HTMLElement>('.glu-floor-rack-shelves')
  // 2.8.0: the tallest row (a Video Club series row has its title over it): none is cut off
  const tallest = Math.max(0, ...[...(shelves?.querySelectorAll<HTMLElement>('.glu-floor-rack-shelf') ?? [])].map(el => el.offsetHeight))
  if (!shelves || !tallest) return
  const gap = parseFloat(getComputedStyle(shelves).rowGap) || 0
  const fits = Math.floor((shelves.clientHeight + gap) / (tallest + gap))
  const next = Math.max(FEATURED_ROWS, Math.min(MAX_ROWS, fits))
  if (next !== fitRows.value) fitRows.value = next
}
// The racks change (a scan, a sort, the floor reopened): measured again once drawn
watch(() => [props.activeShelf?.id, props.shelves.length, featuredShelves.value.length], () => { void nextTick(measureRows) })

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  measure()
  document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
  window.addEventListener('resize', onAnyScroll, { passive: true })
  root.value?.addEventListener('animationend', onAnyScroll)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (spotlightTimer) clearTimeout(spotlightTimer)
  if (windowFrame) cancelAnimationFrame(windowFrame)
  document.removeEventListener('scroll', onAnyScroll, { capture: true })
  window.removeEventListener('resize', onAnyScroll)
  root.value?.removeEventListener('animationend', onAnyScroll)
})
defineExpose({ jumpTo })
</script>

<template>
  <section ref="root" class="glu-floor" :class="{ focused:activeShelf }">
    <template v-if="!activeShelf">
      <header v-if="$slots.intro" class="glu-floor-intro"><slot name="intro" /></header>
      <div class="glu-floor-aisle">
        <button
          v-if="racksHaveOverflow"
          class="glu-floor-aisle-arrow previous"
          type="button"
          :disabled="racksAtStart"
          aria-label="Scroll showroom left"
          @click="scrollRacksByPage(-1)"
        >‹</button>
        <div ref="rackScroller" class="glu-floor-rack-grid">
          <button
            v-for="{ shelf, featured } in racks"
            :key="shelf.id"
            type="button"
            class="glu-floor-rack"
            :class="{ featured, spotlight: spotlight === shelf.id }"
            :data-shelf-id="shelf.id"
            :aria-label="`Browse ${shelf.title}, ${rackCounts.get(shelf.id) ?? 0} ${itemsNoun}`"
            @click="emit('select-shelf',shelf.id)"
          >
            <span class="glu-floor-rack-sign"><strong>{{ shelf.title }}</strong><small>{{ titles(rackCounts.get(shelf.id) ?? 0) }}</small></span>
            <span class="glu-floor-rack-shelves">
              <span v-for="row in rackRows.get(shelf.id) ?? []" :key="row.id" class="glu-floor-rack-shelf">
                <span v-if="row.label" class="glu-floor-rack-row-label"><b>{{ row.label }}</b><small>{{ rowCountText(row) }}</small></span>
                <span v-else-if="rowsLabelled" class="glu-floor-rack-row-label" aria-hidden="true"></span>
                <span class="glu-floor-rack-bay">
                  <span v-for="item in row.items" :key="item.id" class="glu-floor-mini-case">
                    <ArtworkFrame :artwork="item.artwork" :alt="`${item.title} artwork`" />
                  </span>
                  <span v-if="row.total > row.items.length" class="glu-floor-rack-more">+{{ row.total - row.items.length }} more</span>
                  <!-- 3.1.0: a skinned shelf shows what doesn't fit as spines packed at its end (drawn by the skin's CSS only) -->
                  <span v-if="row.total > row.items.length" class="glu-floor-rack-spines" aria-hidden="true"><i v-for="n in Math.min(6, row.total - row.items.length)" :key="n"></i></span>
                </span>
                <span class="glu-floor-rack-edge" aria-hidden="true"><b v-if="row.total > row.items.length">+{{ row.total - row.items.length }}</b></span>
              </span>
              <!-- 3.3.1: a unit shows all its shelves, the empty ones too (skinned only: classic draws rows) -->
              <span v-for="n in Math.max(0, fitRows - (rackRows.get(shelf.id)?.length ?? 0))" :key="`empty-${n}`" class="glu-floor-rack-shelf empty" aria-hidden="true">
                <span v-if="rowsLabelled" class="glu-floor-rack-row-label"></span>
                <span class="glu-floor-rack-bay"></span>
                <span class="glu-floor-rack-edge"></span>
              </span>
            </span>
            <span class="glu-floor-rack-action">{{ featured ? 'Browse' : 'Enter department' }} <b aria-hidden="true">›</b></span>
          </button>
        </div>
        <button
          v-if="racksHaveOverflow"
          class="glu-floor-aisle-arrow next"
          type="button"
          :disabled="racksAtEnd"
          aria-label="Scroll showroom right"
          @click="scrollRacksByPage(1)"
        >›</button>
      </div>
    </template>

    <template v-else>
      <header class="glu-floor-focus-heading">
        <div><h2>{{ activeShelf.title }}</h2><p>{{ departmentNote }}</p></div>
        <slot name="focus-tools" />
      </header>
      <!-- 2.7.0: a big department draws only the rows in view -->
      <div v-if="windowed" ref="focusRows" class="glu-floor-focus-window" :style="windowStyle">
        <div ref="focusBlock" class="glu-floor-focus-rows" :style="windowBlockStyle">
          <div v-for="index in windowIndices" :key="`row-${index}`" class="glu-floor-focus-row">
            <div class="glu-floor-focus-cases">
              <LibraryCase
                v-for="item in windowRows[index]"
                :key="item.id"
                :item="item"
                :variant="variant"
                :caption="caption"
                :selected="selectedId === item.id"
                :tag="tagFor?.(item)"
                :pick="pickFor?.(item)"
                @open="emit('open',$event)"
                @menu="(item, event) => emit('menu', item, event)"
              >
                <template v-if="$slots.marks" #marks="{ item: boxed }"><slot name="marks" :item="boxed" /></template>
              </LibraryCase>
            </div>
            <div class="glu-floor-focus-edge" aria-hidden="true"><span v-if="rowStrip?.(windowRows[index])" class="glu-floor-strip">{{ rowStrip?.(windowRows[index]) }}</span></div>
          </div>
        </div>
        <div v-if="windowRows[0]" ref="sizerRow" class="glu-floor-focus-row glu-floor-focus-sizer" aria-hidden="true" inert>
          <div class="glu-floor-focus-cases">
            <LibraryCase :item="windowRows[0][0]" :variant="variant" :caption="caption" />
          </div>
          <div class="glu-floor-focus-edge"></div>
        </div>
      </div>
      <div v-else class="glu-floor-focus-rows">
        <template v-for="section in sections" :key="section.id">
        <h3 v-if="section.label" class="glu-floor-focus-set"><b>{{ section.label }}</b><small>{{ setCountText(section.count) }}</small></h3>
        <div v-for="(row,index) in section.rows" :key="`${section.id}-${index}`" class="glu-floor-focus-row">
          <div class="glu-floor-focus-cases">
            <LibraryCase
              v-for="item in row"
              :key="item.id"
              :item="item"
              :variant="variant"
          :caption="caption"
              :selected="selectedId === item.id"
              :tag="tagFor?.(item)"
              :pick="pickFor?.(item)"
              @open="emit('open',$event)"
              @menu="(item, event) => emit('menu', item, event)"
            >
              <template v-if="$slots.marks" #marks="{ item: boxed }"><slot name="marks" :item="boxed" /></template>
            </LibraryCase>
          </div>
          <div class="glu-floor-focus-edge" aria-hidden="true"><span v-if="rowStrip?.(row)" class="glu-floor-strip">{{ rowStrip?.(row) }}</span></div>
        </div>
        </template>
      </div>
    </template>
  </section>
</template>
