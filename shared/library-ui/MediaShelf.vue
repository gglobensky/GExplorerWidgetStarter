<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import LibraryCase from './LibraryCase.vue'
import { itemsForSeason, seasonLabel, seasonsFor, type SeasonFilter } from './seasons'
import type { LibraryItem } from './types'

const props = defineProps<{
  title: string
  shelfId: string
  note?: string
  items: LibraryItem[]
  selectedId?: string
}>()
const emit = defineEmits<{ (e: 'open', item: LibraryItem): void; (e: 'menu', item: LibraryItem, event: MouseEvent): void }>()
const rail = ref<HTMLElement | null>(null)
const letter = ref('')
const season = ref<SeasonFilter>('all')
const isSeriesShelf = computed(() => props.shelfId.startsWith('series-'))
const seasons = computed(() => isSeriesShelf.value ? seasonsFor(props.items) : [])
const visibleItems = computed(() => itemsForSeason(props.items,season.value))
const visibleNote = computed(() => season.value === 'all'
  ? props.note
  : `${seasonLabel(season.value)} · ${visibleItems.value.length} ${visibleItems.value.length === 1 ? 'episode' : 'episodes'}`)
const {
  hasOverflow:overflow,
  atStart,
  atEnd,
  scrollByPage:page,
} = useScrollHints({
  scrollEl:rail,
  axis:'x',
  deps:() => `${season.value}:${visibleItems.value.map(item => item.id).join('|')}`,
  eps:2,
  wheel:'transpose',
  pageRatio:.78,
  minPageStep:180,
})

function titleInitial(item: LibraryItem) {
  const sortable = item.title.replace(/^(the|a|an)\s+/i, '')
  const first = sortable.charAt(0).toLocaleUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

const letters = computed(() => Array.from(new Set(visibleItems.value.map(titleInitial))).sort())

watch(() => props.shelfId, () => { season.value = 'all' })
watch(seasons, options => {
  if (season.value !== 'all' && !options.includes(season.value)) season.value = 'all'
})

async function changeSeason() {
  letter.value = ''
  await nextTick()
  rail.value?.scrollTo({ left:0, behavior:'smooth' })
}

function jumpToLetter() {
  const el = rail.value
  if (!el || !letter.value) return
  const target = el.querySelector<HTMLElement>(`[data-title-initial="${letter.value}"]`)
  if (target) el.scrollTo({ left:Math.max(0, target.offsetLeft - 7), behavior:'smooth' })
}
</script>

<template>
  <section class="glu-shelf" :data-shelf-id="shelfId" :aria-label="title">
    <header class="glu-shelf-heading">
      <div><h2>{{ title }}</h2><p v-if="visibleNote">{{ visibleNote }}</p></div>
      <div class="glu-shelf-tools">
        <label v-if="isSeriesShelf && seasons.length" class="glu-season-filter">
          <span>Season</span>
          <select v-model="season" :aria-label="`Filter ${title} by season`" @change="changeSeason">
            <option value="all">All seasons</option>
            <option v-for="option in seasons" :key="option" :value="option">{{ seasonLabel(option) }}</option>
          </select>
        </label>
        <label class="glu-alpha-jump">
          <span>A–Z</span>
          <select v-model="letter" :aria-label="`Jump through ${title} by title`" @change="jumpToLetter">
            <option value="">All</option>
            <option v-for="initial in letters" :key="initial" :value="initial">{{ initial }}</option>
          </select>
        </label>
        <div v-if="overflow" class="glu-shelf-paging">
          <button type="button" :disabled="atStart" :aria-label="`Scroll ${title} left`" @click="page(-1)">‹</button>
          <button type="button" :disabled="atEnd" :aria-label="`Scroll ${title} right`" @click="page(1)">›</button>
        </div>
      </div>
    </header>
    <div class="glu-shelf-stage">
      <div ref="rail" class="glu-shelf-rail">
        <LibraryCase
          v-for="item in visibleItems"
          :key="item.id"
          :item="item"
          :selected="selectedId === item.id"
          :data-title-initial="titleInitial(item)"
          @open="emit('open', $event)"
          @menu="(item, event) => emit('menu', item, event)"
        />
      </div>
      <div class="glu-shelf-edge" aria-hidden="true"></div>
    </div>
  </section>
</template>
