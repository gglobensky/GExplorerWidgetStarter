<script setup lang="ts">
import { computed, inject, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import Masthead from './components/Masthead.vue'
import EditionPage from './components/EditionPage.vue'
import CompactEdition from './components/CompactEdition.vue'
import SourceManager from './components/SourceManager.vue'
import { dedupeAndSort, normalizeFeedItems } from './classification'
import { discoverSources, fetchFeed } from './feeds'
import { editionNumber, generateSudoku, localDateKey } from './daily'
import { openPublication } from './open-publication'
import { loadSources, saveSources, sourceId } from './source-store'
import { createOpml, parseOpml } from './opml'
import { starterSource } from './starter-catalog'
import { loadDailyFeature } from './features/adapter'
import { LICHESS_DAILY, type LichessDailyPuzzle } from './features/providers/lichess'
import type { BugleItem, BugleSource, SourceCandidate, SourceDisplay, SourceSection } from './model'
import './bugle.css'

type Placement = {
  context: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'dialog'
  size?: { width?: number; height?: number; cols?: number; rows?: number }
  phase?: 'active' | 'idle'
}

const props = defineProps<{
  sourceId?: string
  config?: { data?: Record<string, unknown>; view?: { page?: number }; [key: string]: unknown }
  theme?: Record<string, string>
  placement?: Placement
}>()

const sdk = inject<WidgetSdk>('widgetSdk')
const settings = sdk?.settings?.()
const lifecycle = sdk?.lifecycle?.()
const ui = sdk?.ui?.()
const sources = ref<BugleSource[]>([])
const items = lifecycle?.persistRef<BugleItem[]>('bugle.items.v1', []) ?? ref<BugleItem[]>([])
const loading = ref(false)
const errors = ref<string[]>([])
const chessLoading = ref(false)
const chessError = ref('')
const now = ref(Date.now())
const pageIndex = ref(Math.max(0, Math.min(3, Number(props.config?.view?.page) || 0)))
const turn = ref('')
const reducedMotion = ref(true)
const cleanups: Array<() => void> = []
let refreshGeneration = 0
let sourceManager: { close(): void } | null = null
let turnCommitTimer: ReturnType<typeof setTimeout> | undefined
let turnFinishTimer: ReturnType<typeof setTimeout> | undefined
let stopRefreshTimer: (() => void) | undefined

const dateKey = computed(() => localDateKey(now.value))
const sudoku = computed(() => generateSudoku(dateKey.value))
const savedPuzzle = lifecycle?.persistRef<{ date: string; values: number[] }>('bugle.sudoku.v1', () => ({
  date: dateKey.value,
  values: [...sudoku.value.puzzle],
})) ?? ref({ date: dateKey.value, values: [...sudoku.value.puzzle] })
const sudokuProgress = computed({
  get: () => {
    if (savedPuzzle.value.date !== dateKey.value || savedPuzzle.value.values.length !== 81) {
      savedPuzzle.value = { date: dateKey.value, values: [...sudoku.value.puzzle] }
    }
    return savedPuzzle.value.values
  },
  set: (values: number[]) => { savedPuzzle.value = { date: dateKey.value, values } },
})
const chessCache = lifecycle?.persistRef<{ date: string; puzzle?: LichessDailyPuzzle }>('bugle.chess.v1', { date: '' })
  ?? ref<{ date: string; puzzle?: LichessDailyPuzzle }>({ date: '' })
const chessPuzzle = computed(() => chessCache.value.date === dateKey.value ? chessCache.value.puzzle : undefined)
const savedChessProgress = lifecycle?.persistRef<{ id: string; index: number }>('bugle.chess.progress.v1', { id: '', index: 0 })
  ?? ref({ id: '', index: 0 })
const chessProgress = computed({
  get: () => {
    const id = chessPuzzle.value?.id ?? ''
    if (savedChessProgress.value.id !== id) savedChessProgress.value = { id, index: 0 }
    return savedChessProgress.value.index
  },
  set: (index: number) => { savedChessProgress.value = { id: chessPuzzle.value?.id ?? '', index } },
})

const context = computed(() => props.placement?.context ?? 'grid')
const width = computed(() => props.placement?.size?.width ?? 0)
const height = computed(() => props.placement?.size?.height ?? 0)
const compact = computed(() => context.value !== 'grid' || (!!width.value && width.value < 390) || (!!height.value && height.value < 185))
const compactContext = computed<'sidebar' | 'toolbar' | 'grid'>(() => context.value === 'toolbar' ? 'toolbar' : context.value === 'sidebar' ? 'sidebar' : 'grid')
const showDiversions = computed(() => settings?.values.showDiversions !== false)
const showDailyChess = computed(() => settings?.values.dailyChess === true)
const refreshing = computed(() => loading.value || chessLoading.value)
const animatePages = computed(() => settings?.values.pageAnimation !== false && !reducedMotion.value)
const pageKinds = computed<Array<'front' | 'sections' | 'diversions' | 'colophon'>>(() => showDiversions.value
  ? ['front', 'sections', 'diversions', 'colophon']
  : ['front', 'sections', 'colophon'])
const currentPage = computed(() => pageKinds.value[Math.min(pageIndex.value, pageKinds.value.length - 1)] ?? 'front')
const pageLabel = computed(() => currentPage.value === 'front'
  ? 'Front page'
  : currentPage.value === 'sections'
    ? 'Sections'
    : currentPage.value === 'diversions'
      ? 'Diversions'
      : 'Colophon')
const enabledSources = computed(() => sources.value.filter(source => source.enabled))
const dateLabel = computed(() => new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now.value))
const hostStyle = computed(() => ({
  '--bugle-host-fg': props.theme?.fg || 'var(--fg, #201c16)',
  '--bugle-host-bg': props.theme?.bg || 'var(--surface-1, #f1ead8)',
  '--bugle-host-border': props.theme?.border || 'var(--border, #766c59)',
}))

function needNetwork(): NonNullable<WidgetSdk['networkFetch']> {
  if (!sdk?.networkFetch) throw new Error('Network access is unavailable. Enable the Bugle’s Network capability in GEM Shell.')
  return sdk.networkFetch
}

async function persistSources(next: BugleSource[]): Promise<BugleSource[]> {
  await saveSources(next, sdk?.configWrite)
  sources.value = next
  return [...next]
}

async function discover(address: string): Promise<SourceCandidate[]> {
  return discoverSources(needNetwork(), address)
}

async function addSource(candidate: SourceCandidate, section: SourceSection, display: SourceDisplay): Promise<BugleSource[]> {
  const url = candidate.feed.feedUrl
  if (sources.value.some(source => source.feedUrl === url)) throw new Error('That feed is already in the press room.')
  const source: BugleSource = {
    id: sourceId(url),
    feedUrl: url,
    ...(candidate.feed.siteUrl ? { siteUrl: candidate.feed.siteUrl } : {}),
    title: candidate.feed.title,
    ...(candidate.feed.description ? { description: candidate.feed.description } : {}),
    ...(candidate.feed.language ? { language: candidate.feed.language } : {}),
    section,
    display,
    enabled: true,
    addedAt: Date.now(),
    lastFetchedAt: Date.now(),
    lastCheckedAt: Date.now(),
    lastItemCount: candidate.feed.items.length,
  }
  const next = await persistSources([...sources.value, source])
  items.value = dedupeAndSort([...items.value, ...normalizeFeedItems(source, candidate.feed.items)])
  return next
}

async function addStarterSource(id: string): Promise<BugleSource[]> {
  const starter = starterSource(id)
  if (!starter) throw new Error('That starter source is no longer available.')
  if (sources.value.some(source => source.feedUrl === starter.feedUrl)) throw new Error('That feed is already in the press room.')
  const feed = await fetchFeed(needNetwork(), starter.feedUrl)
  return addSource({ feed: { ...feed, title: starter.title, siteUrl: starter.siteUrl } }, starter.section, starter.display)
}

async function updateSource(id: string, patch: { title: string; section: SourceSection; display: SourceDisplay }): Promise<BugleSource[]> {
  const title = patch.title.trim().slice(0, 180)
  if (!title) throw new Error('Give the publication a name.')
  return persistSources(sources.value.map(source => source.id === id
    ? { ...source, title, customTitle: true, section: patch.section, display: patch.display }
    : source))
}

async function toggleSource(id: string): Promise<BugleSource[]> {
  const next = await persistSources(sources.value.map(source => source.id === id ? { ...source, enabled: !source.enabled } : source))
  void refresh()
  return next
}

async function removeSource(id: string): Promise<BugleSource[]> {
  const next = await persistSources(sources.value.filter(source => source.id !== id))
  items.value = items.value.filter(item => item.sourceId !== id)
  return next
}

async function refresh(): Promise<BugleSource[]> {
  const token = ++refreshGeneration
  if (!enabledSources.value.length) {
    items.value = []
    errors.value = []
    loading.value = false
    return [...sources.value]
  }
  loading.value = true
  errors.value = []
  const collected: BugleItem[] = []
  const failures: string[] = []
  const nextSources = [...sources.value]
  try {
    const fetchText = needNetwork()
    for (const source of enabledSources.value) {
      if (token !== refreshGeneration) return [...sources.value]
      try {
        const feed = await fetchFeed(fetchText, source.feedUrl)
        const checkedAt = Date.now()
        const current: BugleSource = {
          ...source,
          title: source.customTitle ? source.title : feed.title || source.title,
          siteUrl: feed.siteUrl ?? source.siteUrl,
          lastFetchedAt: checkedAt,
          lastCheckedAt: checkedAt,
          lastItemCount: feed.items.length,
          lastError: undefined,
        }
        collected.push(...normalizeFeedItems(current, feed.items))
        const index = nextSources.findIndex(value => value.id === source.id)
        if (index >= 0) nextSources[index] = current
      } catch (cause) {
        const message = (cause instanceof Error ? cause.message : 'Could not be read.').slice(0, 300)
        failures.push(`${source.title}: ${message}`)
        const index = nextSources.findIndex(value => value.id === source.id)
        if (index >= 0) nextSources[index] = { ...source, lastCheckedAt: Date.now(), lastError: message }
      }
    }
    if (token !== refreshGeneration) return [...sources.value]
    items.value = dedupeAndSort(collected)
    errors.value = failures
    sources.value = nextSources
    try { await saveSources(nextSources, sdk?.configWrite) } catch (cause) { console.warn('[gem-bugle] source metadata not saved', cause) }
  } catch (cause) {
    if (token === refreshGeneration) errors.value = [cause instanceof Error ? cause.message : 'The edition could not be refreshed.']
  } finally {
    if (token === refreshGeneration) loading.value = false
  }
  return [...sources.value]
}

async function loadChess(force = false): Promise<void> {
  if (!showDailyChess.value) return
  if (!force && chessPuzzle.value) return
  chessLoading.value = true
  chessError.value = ''
  try {
    const puzzle = await loadDailyFeature(LICHESS_DAILY, needNetwork(), dateKey.value)
    chessCache.value = { date: dateKey.value, puzzle }
  } catch (cause) {
    chessError.value = cause instanceof Error ? cause.message : 'The daily chess puzzle could not be fetched.'
  } finally {
    chessLoading.value = false
  }
}

async function refreshAll(): Promise<void> {
  await refresh()
  if (showDailyChess.value) await loadChess(true)
}

function uniqueSourceId(url: string, occupied: Set<string>): string {
  const base = sourceId(url)
  let id = base
  let suffix = 2
  while (occupied.has(id)) id = `${base}-${suffix++}`
  occupied.add(id)
  return id
}

async function importOpml(): Promise<{ sources: BugleSource[]; added: number; skipped: number } | null> {
  if (!ui?.openFiles || !sdk?.fsReadText) throw new Error('OPML import needs the Bugle’s Read capability in GEM Shell.')
  const [path] = await ui.openFiles({
    title: 'Import Bugle subscriptions',
    acceptLabel: 'Import',
    access: 'read',
    filters: [{ label: 'OPML subscription lists', extensions: ['opml', 'xml'] }],
  }) ?? []
  if (!path) return null
  const { text } = await sdk.fsReadText(path, { maxBytes: 2 * 1024 * 1024 })
  const subscriptions = parseOpml(text)
  const existing = new Set(sources.value.map(source => source.feedUrl))
  const occupiedIds = new Set(sources.value.map(source => source.id))
  const imported: BugleSource[] = []
  let skipped = 0
  for (const subscription of subscriptions) {
    if (existing.has(subscription.feedUrl)) {
      skipped++
      continue
    }
    existing.add(subscription.feedUrl)
    imported.push({
      id: uniqueSourceId(subscription.feedUrl, occupiedIds),
      feedUrl: subscription.feedUrl,
      ...(subscription.siteUrl ? { siteUrl: subscription.siteUrl } : {}),
      title: subscription.title,
      customTitle: true,
      section: subscription.section,
      display: 'summary',
      enabled: true,
      addedAt: Date.now(),
    })
  }
  const next = imported.length ? await persistSources([...sources.value, ...imported]) : [...sources.value]
  if (imported.length) void refresh()
  return { sources: next, added: imported.length, skipped }
}

async function exportOpml(): Promise<boolean> {
  if (!ui?.saveFile || !sdk?.fsWriteText) throw new Error('OPML export needs the Bugle’s Write capability in GEM Shell.')
  const path = await ui.saveFile({
    title: 'Export Bugle subscriptions',
    suggestedName: 'gem-bugle-subscriptions.opml',
    filters: [{ label: 'OPML subscription list', extensions: ['opml'] }],
  })
  if (!path) return false
  await sdk.fsWriteText(path, createOpml(sources.value), { overwrite: true })
  return true
}

function openSources(anchor: HTMLElement): void {
  if (!ui?.openPopover) return
  sourceManager?.close()
  sourceManager = ui.openPopover({
    anchor,
    component: markRaw(SourceManager),
    placement: 'center',
    title: 'Sources',
    maxWidth: 720,
    maxHeight: 720,
    props: {
      sources: [...sources.value],
      addStarter: addStarterSource,
      discover,
      add: addSource,
      update: updateSource,
      toggle: toggleSource,
      remove: removeSource,
      refresh,
      importOpml,
      exportOpml,
    },
    onClose: () => { sourceManager = null },
  })
}

function openItem(item: BugleItem): void {
  void openPublication(sdk, item.url, item.title)
}

function openChessPuzzle(): void {
  const puzzle = chessPuzzle.value
  if (puzzle) void openPublication(sdk, puzzle.sourceUrl, 'Daily chess puzzle on Lichess')
}

function setPage(next: number): void {
  const target = Math.max(0, Math.min(pageKinds.value.length - 1, next))
  if (target === pageIndex.value) return
  const commit = () => {
    pageIndex.value = target
    void sdk?.setView?.({ page: target })
  }
  clearTimeout(turnCommitTimer)
  clearTimeout(turnFinishTimer)
  if (!animatePages.value) {
    turn.value = ''
    commit()
    return
  }
  turn.value = target > pageIndex.value ? 'turn-next-out' : 'turn-prev-out'
  turnCommitTimer = setTimeout(() => {
    commit()
    turn.value = target > pageIndex.value ? 'turn-next-in' : 'turn-prev-in'
    turnFinishTimer = setTimeout(() => { turn.value = '' }, 240)
  }, 180)
}

function restartRefreshTimer(): void {
  stopRefreshTimer?.()
  const minutes = Math.max(10, Number(settings?.values.refreshMinutes) || 30)
  if (lifecycle) stopRefreshTimer = lifecycle.keepInterval(() => void refresh(), minutes * 60_000)
  else {
    const timer = setInterval(() => void refresh(), minutes * 60_000)
    stopRefreshTimer = () => clearInterval(timer)
  }
}

onMounted(async () => {
  reducedMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
  sources.value = await loadSources(sdk?.configRead)
  await refresh()
  await settings?.ready
  if (showDailyChess.value) await loadChess()
  restartRefreshTimer()
  if (lifecycle) {
    cleanups.push(
      lifecycle.keepInterval(() => { now.value = Date.now() }, 60_000),
      lifecycle.onResume(() => {
        now.value = Date.now()
        void refreshAll()
      }),
    )
  }
  if (settings) {
    cleanups.push(
      settings.onAction('refreshNow', async () => {
        await refreshAll()
        return { message: errors.value.length ? errors.value[0] : `Fetched ${items.value.length} stories.` }
      }),
      settings.onChange((_values, key) => {
        if (key === 'refreshMinutes' || key === null) restartRefreshTimer()
        if (!showDiversions.value && currentPage.value === 'diversions') setPage(0)
        if ((key === 'dailyChess' || key === null) && showDailyChess.value) void loadChess()
        if (key === 'dailyChess' && !showDailyChess.value) chessError.value = ''
      }),
    )
  }
})

onBeforeUnmount(() => {
  refreshGeneration++
  sourceManager?.close()
  stopRefreshTimer?.()
  clearTimeout(turnCommitTimer)
  clearTimeout(turnFinishTimer)
  for (const stop of cleanups.splice(0)) stop()
})
</script>

<template>
  <article class="bugle" :class="{ 'bugle-compact': compact, 'bugle-toolbar': context === 'toolbar' }" :style="hostStyle">
    <CompactEdition
      v-if="compact"
      :context="compactContext"
      :items="items"
      :source-count="sources.length"
      :refreshing="refreshing"
      :date-label="dateLabel"
      @open="openItem"
      @sources="openSources"
      @refresh="refreshAll"
    />
    <template v-else>
      <Masthead
        :date-label="dateLabel"
        :edition="editionNumber(dateKey)"
        :source-count="sources.length"
        :refreshing="refreshing"
        @sources="openSources"
        @refresh="refreshAll"
      />
      <div class="paper-stage" :class="turn">
        <EditionPage
          :page="currentPage"
          :items="items"
          :sources="sources"
          :sudoku="sudoku"
          :sudoku-progress="sudokuProgress"
          :chess-puzzle="chessPuzzle"
          :chess-progress="chessProgress"
          :chess-enabled="showDailyChess"
          :chess-loading="chessLoading"
          :chess-error="chessError"
          :errors="errors"
          @open="openItem"
          @sources="openSources"
          @update:sudoku-progress="sudokuProgress = $event"
          @update:chess-progress="chessProgress = $event"
          @open-chess="openChessPuzzle"
        />
      </div>
      <nav class="page-nav" aria-label="Bugle pages">
        <button type="button" :disabled="pageIndex <= 0" aria-label="Previous page" @click="setPage(pageIndex - 1)">‹</button>
        <span>{{ pageLabel }} · {{ pageIndex + 1 }} of {{ pageKinds.length }}</span>
        <button type="button" :disabled="pageIndex >= pageKinds.length - 1" aria-label="Next page" @click="setPage(pageIndex + 1)">›</button>
      </nav>
    </template>
  </article>
</template>
