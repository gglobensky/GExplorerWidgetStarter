<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import {
  ArtworkFrame, itemsForSeason, LibraryCase, seasonLabel, seasonsFor,
  type LibraryItem, type LibraryShelf, type SeasonFilter,
} from '../../shared/library-ui'
import { showroomRowsFor, showroomTitleCount, type ShowroomRackRow, type SortMode } from './media'

const props = defineProps<{
  /** Genre racks. */
  shelves: LibraryShelf[]
  /** Racks at the head of the aisle (Continue watching, New arrivals, Collections): their own items, in their order. */
  featured?: LibraryShelf[]
  items: LibraryItem[]
  activeShelf?: LibraryShelf | null
  selectedId?: string
  sort?: SortMode
}>()
const emit = defineEmits<{
  (e:'select-shelf', shelfId:string):void
  (e:'open', item:LibraryItem):void
  (e:'menu', item:LibraryItem, event:MouseEvent):void
}>()
const FEATURED_ROWS = 3
const RACK_CAPACITY = 6

const root = ref<HTMLElement | null>(null)
const rackScroller = ref<HTMLElement | null>(null)
const columns = ref(6)
const season = ref<SeasonFilter>('all')
let observer: ResizeObserver | null = null

const isActiveSeries = computed(() => props.activeShelf?.id.startsWith('series-') ?? false)
const seasonOptions = computed(() => isActiveSeries.value ? seasonsFor(props.activeShelf?.items ?? []) : [])
const visibleActiveItems = computed(() => itemsForSeason(props.activeShelf?.items ?? [],season.value))
const activeShelfNote = computed(() => season.value === 'all'
  ? props.activeShelf?.note
  : `${seasonLabel(season.value)} · ${visibleActiveItems.value.length} ${visibleActiveItems.value.length === 1 ? 'episode' : 'episodes'}`)
const rows = computed(() => {
  const items = visibleActiveItems.value
  const result: LibraryItem[][] = []
  for (let index = 0; index < items.length; index += columns.value) result.push(items.slice(index,index + columns.value))
  return result
})
function featuredRows(shelf: LibraryShelf): ShowroomRackRow[] {
  const rows: ShowroomRackRow[] = []
  for (let index = 0; index < shelf.items.length && rows.length < FEATURED_ROWS; index += RACK_CAPACITY) {
    const items = shelf.items.slice(index, index + RACK_CAPACITY)
    const last = rows.length === FEATURED_ROWS - 1
    rows.push({ id:`${shelf.id}-${rows.length}`, total:last ? shelf.items.length - index : items.length, items })
  }
  return rows
}
const featuredShelves = computed(() => props.featured ?? [])
const racks = computed(() => [
  ...featuredShelves.value.map(shelf => ({ shelf, featured:true })),
  ...props.shelves.map(shelf => ({ shelf, featured:false })),
])
const showroomRows = computed(() => new Map([
  ...featuredShelves.value.map(shelf => [shelf.id,featuredRows(shelf)] as const),
  ...props.shelves.map(shelf => [shelf.id,showroomRowsFor(props.items,shelf.title,RACK_CAPACITY,props.sort)] as const),
]))
const showroomCounts = computed(() => new Map([
  ...featuredShelves.value.map(shelf => [shelf.id,shelf.items.length] as const),
  ...props.shelves.map(shelf => [shelf.id,showroomTitleCount(props.items,shelf.title)] as const),
]))
watch(() => props.activeShelf?.id, () => { season.value = 'all' })
watch(seasonOptions, options => {
  if (season.value !== 'all' && !options.includes(season.value)) season.value = 'all'
})
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

function measure() {
  const width = root.value?.clientWidth ?? 0
  columns.value = width >= 940 ? 6 : width >= 790 ? 5 : width >= 620 ? 4 : width >= 420 ? 3 : 2
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section ref="root" class="media-store-floor" :class="{ focused:activeShelf }">
    <template v-if="!activeShelf">
      <header class="media-store-floor-intro">
        <p>Showroom</p>
        <h1 class="media-video-club-wordmark"><span>GEM</span><strong>VIDEO CLUB</strong></h1>
        <span>Browse the aisle and step closer to a genre rack.</span>
      </header>
      <div class="media-store-aisle">
        <button
          v-if="racksHaveOverflow"
          class="media-store-aisle-arrow previous"
          type="button"
          :disabled="racksAtStart"
          aria-label="Scroll showroom left"
          @click="scrollRacksByPage(-1)"
        >‹</button>
        <div ref="rackScroller" class="media-store-rack-grid">
          <button
            v-for="{ shelf, featured } in racks"
            :key="shelf.id"
            type="button"
            class="media-store-rack"
            :class="{ featured }"
            :aria-label="`Browse ${shelf.title}, ${showroomCounts.get(shelf.id) ?? 0} media files`"
            @click="emit('select-shelf',shelf.id)"
          >
            <span class="media-store-rack-sign"><strong>{{ shelf.title }}</strong><small>{{ showroomCounts.get(shelf.id) ?? 0 }} {{ showroomCounts.get(shelf.id) === 1 ? 'title' : 'titles' }}</small></span>
            <span class="media-store-rack-shelves">
              <span v-for="row in showroomRows.get(shelf.id) ?? []" :key="row.id" class="media-store-rack-shelf">
                <span v-if="row.label" class="media-store-rack-row-label"><b>{{ row.label }}</b><small>{{ row.total }} {{ row.total === 1 ? 'episode' : 'episodes' }}</small></span>
                <span class="media-store-rack-bay">
                  <span v-for="item in row.items" :key="item.id" class="media-store-mini-case">
                    <ArtworkFrame :artwork="item.artwork" :alt="`${item.title} artwork`" />
                  </span>
                  <span v-if="row.total > row.items.length" class="media-store-rack-more">+{{ row.total - row.items.length }} more</span>
                </span>
                <span class="media-store-rack-edge" aria-hidden="true"></span>
              </span>
            </span>
            <span class="media-store-rack-action">{{ featured ? 'Browse' : 'Enter department' }} <b aria-hidden="true">›</b></span>
          </button>
        </div>
        <button
          v-if="racksHaveOverflow"
          class="media-store-aisle-arrow next"
          type="button"
          :disabled="racksAtEnd"
          aria-label="Scroll showroom right"
          @click="scrollRacksByPage(1)"
        >›</button>
      </div>
    </template>

    <template v-else>
      <header class="media-store-focus-heading">
        <div><h2>{{ activeShelf.title }}</h2><p>{{ activeShelfNote }}</p></div>
        <label v-if="isActiveSeries && seasonOptions.length" class="media-store-season-filter">
          <span>Season</span>
          <select v-model="season" :aria-label="`Filter ${activeShelf.title} by season`">
            <option value="all">All seasons</option>
            <option v-for="option in seasonOptions" :key="option" :value="option">{{ seasonLabel(option) }}</option>
          </select>
        </label>
      </header>
      <div class="media-store-focus-rows">
        <div v-for="(row,index) in rows" :key="`${activeShelf.id}-${index}`" class="media-store-focus-row">
          <div class="media-store-focus-cases">
            <LibraryCase
              v-for="item in row"
              :key="item.id"
              :item="item"
              :selected="selectedId === item.id"
              @open="emit('open',$event)"
              @menu="(item, event) => emit('menu', item, event)"
            />
          </div>
          <div class="media-store-focus-edge" aria-hidden="true"></div>
        </div>
      </div>
    </template>
  </section>
</template>
