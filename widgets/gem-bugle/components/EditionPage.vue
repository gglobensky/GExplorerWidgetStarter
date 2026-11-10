<script setup lang="ts">
import { computed } from 'vue'
import ArticleCard from './ArticleCard.vue'
import SudokuCard from './SudokuCard.vue'
import ChessPuzzleCard from './ChessPuzzleCard.vue'
import { BUGLE_SECTIONS, sectionLabel, type BugleItem, type BugleSection, type BugleSource } from '../model'
import type { Sudoku } from '../daily'
import type { LichessDailyPuzzle } from '../features/providers/lichess'

const props = defineProps<{
  page: 'front' | 'sections' | 'diversions' | 'colophon'
  items: BugleItem[]
  sources: BugleSource[]
  sudoku: Sudoku
  sudokuProgress: number[]
  chessPuzzle?: LichessDailyPuzzle
  chessProgress: number
  chessEnabled: boolean
  chessLoading: boolean
  chessError?: string
  errors: string[]
}>()

const emit = defineEmits<{
  (event: 'open', item: BugleItem): void
  (event: 'sources', anchor: HTMLElement): void
  (event: 'update:sudokuProgress', value: number[]): void
  (event: 'update:chessProgress', value: number): void
  (event: 'openChess'): void
}>()

const lead = computed(() => props.items[0])
const briefs = computed(() => props.items.slice(1, 7))
const sectionGroups = computed(() => BUGLE_SECTIONS
  .map(section => ({ section, items: props.items.filter(item => item.section === section).slice(0, 5) }))
  .filter(group => group.items.length))

function openSources(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) emit('sources', event.currentTarget)
}

function sourceSection(source: BugleSource): string {
  return source.section === 'auto' ? 'Automatic desk' : sectionLabel(source.section as BugleSection)
}
</script>

<template>
  <main class="edition-page" :class="`edition-${page}`">
    <template v-if="page === 'front'">
      <div v-if="lead" class="front-grid">
        <ArticleCard :item="lead" lead @open="emit('open', $event)" />
        <section class="brief-column" aria-label="More headlines">
          <h2>Latest dispatches</h2>
          <ArticleCard v-for="item in briefs" :key="`${item.sourceId}:${item.id}`" :item="item" compact @open="emit('open', $event)" />
        </section>
      </div>
      <section v-else class="empty-edition">
        <span class="empty-ornament">☞</span>
        <h2>The presses are ready</h2>
        <p>Add a publication or paste an RSS, Atom, or JSON Feed address. The Bugle will discover its stories and arrange them into an edition.</p>
        <button type="button" @click="openSources">Add the first source</button>
      </section>
      <p v-if="errors.length" class="edition-notice">{{ errors[0] }}</p>
    </template>

    <template v-else-if="page === 'sections'">
      <div v-if="sectionGroups.length" class="section-columns">
        <section v-for="group in sectionGroups" :key="group.section" class="news-section">
          <h2>{{ sectionLabel(group.section) }}</h2>
          <ArticleCard v-for="item in group.items" :key="`${item.sourceId}:${item.id}`" :item="item" compact @open="emit('open', $event)" />
        </section>
      </div>
      <section v-else class="empty-edition compact-empty">
        <h2>No sections have gone to press</h2>
        <p>Add a source and its categories will appear here.</p>
      </section>
    </template>

    <template v-else-if="page === 'diversions'">
      <div class="diversions-grid">
        <SudokuCard :sudoku="sudoku" :model-value="sudokuProgress" @update:model-value="emit('update:sudokuProgress', $event)" />
        <div class="diversions-side">
          <ChessPuzzleCard
            v-if="chessPuzzle"
            :puzzle="chessPuzzle"
            :progress="chessProgress"
            @update:progress="emit('update:chessProgress', $event)"
            @open="emit('openChess')"
          />
          <section v-else class="diversions-copy">
            <span class="section-kicker">From the games desk</span>
            <h2>{{ chessEnabled ? 'The chess desk is checking the wire' : 'A puzzle made for this edition' }}</h2>
            <p v-if="chessLoading">Fetching today’s position from Lichess…</p>
            <p v-else-if="chessError">{{ chessError }}</p>
            <template v-else-if="!chessEnabled">
              <p>This Sudoku is generated locally from today’s date, works offline, and has exactly one solution.</p>
              <p>Daily chess is an optional network feature. Turn it on in the Bugle’s Diversions settings when you would like it on the back page.</p>
            </template>
          </section>
        </div>
      </div>
    </template>

    <template v-else>
      <section class="colophon">
        <span class="section-kicker">How this edition was made</span>
        <h2>Sources &amp; colophon</h2>
        <p>The GEM Bugle is a reader. Stories remain with their publishers; selecting a headline opens the original publication.</p>
        <div v-if="sources.length" class="source-ledger">
          <article v-for="source in sources" :key="source.id">
            <h3>{{ source.title }}</h3>
            <p>{{ sourceSection(source) }} · {{ source.display === 'summary' ? 'Headlines and feed excerpts' : 'Headlines only' }}</p>
            <p class="source-address">{{ source.siteUrl || source.feedUrl }}</p>
          </article>
        </div>
        <p v-else>No reader-added publications are in this edition.</p>
        <p class="colophon-note">Feed excerpts, author names, dates, and categories are shown as supplied by each publication. The Bugle strips feed markup and does not copy full articles.</p>
      </section>
    </template>
  </main>
</template>
