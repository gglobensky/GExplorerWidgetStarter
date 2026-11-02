<script setup lang="ts">
// The Video Club's showroom (2026-10-31, library-ui 2.0.0): the shared store floor (LibraryFloor), plus what only
// the Video Club has: its wordmark, series grouped on the genre racks (showroomRowsFor), a series department's season
// filter, the watched / progress marks, and the words of its counts (movies, episodes).
import { computed, ref, watch } from 'vue'
import { LibraryFloor, staffPicks, titleRange, yearRange, type LibraryFloorRow } from '@shared/library-ui'
import { moviePickNote, moviePickScore, movieTag } from './shelf-labels'
import CaseMarks from './CaseMarks.vue'
import NeonSign from './NeonSign.vue'
import { showroomRowsFor, showroomTitleCount, type SortMode } from './media'
import type { MovieItem, MovieShelf } from './movie-types'
import { itemsForSeason, seasonLabel, seasonsFor, type SeasonFilter } from './seasons'

const props = defineProps<{
  /** Genre racks. */
  shelves: MovieShelf[]
  /** Racks at the head of the aisle (Continue watching, New arrivals, Collections): their own items, in their order. */
  featured?: MovieShelf[]
  items: MovieItem[]
  activeShelf?: MovieShelf | null
  selectedId?: string
  sort?: SortMode
}>()
const emit = defineEmits<{
  (e:'select-shelf', shelfId:string):void
  (e:'open', item:MovieItem):void
  (e:'menu', item:MovieItem, event:MouseEvent):void
}>()
/** As many boxes as a rack's row holds (LibraryFloor's RACK_CAPACITY). */
const RACK_CAPACITY = 6

const season = ref<SeasonFilter>('all')
const isActiveSeries = computed(() => props.activeShelf?.id.startsWith('series-') ?? false)
const seasonOptions = computed(() => isActiveSeries.value ? seasonsFor(props.activeShelf?.items ?? []) : [])
const visibleActiveItems = computed(() => itemsForSeason(props.activeShelf?.items ?? [],season.value))
const activeShelfNote = computed(() => season.value === 'all'
  ? props.activeShelf?.note
  : `${seasonLabel(season.value)} · ${visibleActiveItems.value.length} ${visibleActiveItems.value.length === 1 ? 'episode' : 'episodes'}`)
watch(() => props.activeShelf?.id, () => { season.value = 'all' })
watch(seasonOptions, options => {
  if (season.value !== 'all' && !options.includes(season.value)) season.value = 'all'
})

// As many rows as the rack's height holds (library-ui 2.8.0)
const rowsFor = (shelf: MovieShelf, maxRows: number) => showroomRowsFor(props.items,shelf.title,RACK_CAPACITY,props.sort,maxRows)
const countFor = (shelf: MovieShelf) => showroomTitleCount(props.items,shelf.title)
/** A row's count: a set of movies, or a series' episodes (rows without a unit). */
const rowCount = (row: LibraryFloorRow<MovieItem>) => `${row.total} ${row.unit === 'movie' ? (row.total === 1 ? 'movie' : 'movies') : (row.total === 1 ? 'episode' : 'episodes')}`
// 0.17.0 (library-ui 3.6.0): what's written on a department's shelves: a tag under each case, the shelf's range, a
// staff-pick card on the best rated (shelf-labels.ts)
const picks = computed(() => staffPicks(visibleActiveItems.value, moviePickScore, { min: 75 }))
const pickFor = (item: MovieItem) => (picks.value.has(item.id) ? moviePickNote(item) : undefined)
const rowStrip = (items: MovieItem[]) => (props.sort === 'release' ? yearRange(items) : !props.sort || props.sort === 'title' ? titleRange(items) : undefined)
const setCount = (count: number) => `${count} ${count === 1 ? 'movie' : 'movies'}`
</script>

<template>
  <LibraryFloor
    :shelves="shelves"
    :featured="featured"
    :active-shelf="activeShelf"
    :active-items="visibleActiveItems"
    :active-note="activeShelfNote"
    :selected-id="selectedId"
    :rows-for="rowsFor"
    :count-for="countFor"
    :row-count="rowCount"
    :set-count="setCount"
    set-unit="movie"
    :tag-for="movieTag"
    :pick-for="pickFor"
    :row-strip="isActiveSeries ? undefined : rowStrip"
    items-noun="media files"
    @select-shelf="emit('select-shelf', $event)"
    @open="emit('open', $event)"
    @menu="(item, event) => emit('menu', item, event)"
  >
    <template #intro>
      <p>Showroom</p>
      <h1 class="media-neon-heading"><NeonSign size="sign" /></h1>
      <span>Browse the aisle and step closer to a genre rack.</span>
    </template>
    <template v-if="isActiveSeries && seasonOptions.length" #focus-tools>
      <label class="media-store-season-filter">
        <span>Season</span>
        <select v-model="season" :aria-label="`Filter ${activeShelf?.title} by season`">
          <option value="all">All seasons</option>
          <option v-for="option in seasonOptions" :key="option" :value="option">{{ seasonLabel(option) }}</option>
        </select>
      </label>
    </template>
    <template #marks="{ item }"><CaseMarks :item="item" /></template>
  </LibraryFloor>
</template>
