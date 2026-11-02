<script setup lang="ts">
// A Classic shelf of the Video Club (2026-10-31, library-ui 2.0.0): the shared MediaShelf, plus what only movies
// have: a series shelf's season filter (it was inside MediaShelf before) and the watched / progress marks on the cases.
import { computed, ref, watch } from 'vue'
import { MediaShelf } from '@shared/library-ui'
import CaseMarks from './CaseMarks.vue'
import type { MovieItem } from './movie-types'
import { itemsForSeason, seasonLabel, seasonsFor, type SeasonFilter } from './seasons'

const props = defineProps<{
  title: string
  shelfId: string
  note?: string
  items: MovieItem[]
  selectedId?: string
}>()
const emit = defineEmits<{ (e: 'open', item: MovieItem): void; (e: 'menu', item: MovieItem, event: MouseEvent): void }>()
const shelf = ref<{ resetPosition: () => Promise<void> } | null>(null)
const season = ref<SeasonFilter>('all')
const isSeriesShelf = computed(() => props.shelfId.startsWith('series-'))
const seasons = computed(() => isSeriesShelf.value ? seasonsFor(props.items) : [])
const visibleItems = computed(() => itemsForSeason(props.items,season.value))
const visibleNote = computed(() => season.value === 'all'
  ? props.note
  : `${seasonLabel(season.value)} · ${visibleItems.value.length} ${visibleItems.value.length === 1 ? 'episode' : 'episodes'}`)

watch(() => props.shelfId, () => { season.value = 'all' })
watch(seasons, options => {
  if (season.value !== 'all' && !options.includes(season.value)) season.value = 'all'
})
</script>

<template>
  <MediaShelf
    ref="shelf"
    :title="title"
    :shelf-id="shelfId"
    :note="visibleNote"
    :items="visibleItems"
    :selected-id="selectedId"
    @open="emit('open', $event)"
    @menu="(item, event) => emit('menu', item, event)"
  >
    <template v-if="isSeriesShelf && seasons.length" #tools>
      <label class="glu-season-filter">
        <span>Season</span>
        <select v-model="season" :aria-label="`Filter ${title} by season`" @change="shelf?.resetPosition()">
          <option value="all">All seasons</option>
          <option v-for="option in seasons" :key="option" :value="option">{{ seasonLabel(option) }}</option>
        </select>
      </label>
    </template>
    <template #marks="{ item }"><CaseMarks :item="item" /></template>
  </MediaShelf>
</template>
