<script setup lang="ts">
// widgets/media-library/Widget.vue — GEM Video Club
//
// The widget's frame: navigation (shelves / showroom, search, genres, back and home), the opened
// title, and the player. The library's work lives in composables sharing one context
// (context.ts): useLibraryScan (folders and scans), useCovers (artwork), useMetadataEdits (the
// user's edits), useTmdbMatching (optional TMDB metadata), usePreviewMedia (scene stills and the
// preview stream), useWatchProgress (Resume, Continue watching, watched marks).
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MediaImage, WidgetMenuItemMessage, WidgetSdk } from 'gexplorer/widgets'
import { LibraryDetail, MediaShelf, type LibraryItem } from '../../shared/library-ui'
import { createLibraryContext, errorText, type DetailMode, type DisplayMode, type LibraryMode } from './context'
import { sampleMovies } from './fixtures'
import { flattenLibraryExtras, nextEpisode, shelvesFor, SORT_MODES, type SortMode } from './media'
import PlayerOverlay from './PlayerOverlay.vue'
import { videoMime } from './scanner'
import SettingsMenu from './SettingsMenu.vue'
import StoreFloor from './StoreFloor.vue'
import { TMDB_SECRET_HOSTS, tmdbReviewsUrl } from './tmdb'
import { useCovers, type CoverPreference } from './useCovers'
import { sourceLabel, useLibraryScan } from './useLibraryScan'
import { useMetadataEdits } from './useMetadataEdits'
import { usePreviewMedia } from './usePreviewMedia'
import { useTmdbMatching } from './useTmdbMatching'
import { useWatchProgress } from './useWatchProgress'
import { useBackgroundPlayback } from './useBackgroundPlayback'

type MediaLibraryConfig = {
  data?: { selectedId?: string; sources?: string[]; customCovers?: Record<string,CoverPreference> }
  /** libraryMode / detailMode: before displayMode (2026-10-25), read once to pick it. */
  view?: { atmosphere?: boolean; displayMode?: DisplayMode; sortMode?: SortMode; backgroundSound?: boolean; libraryMode?: string; detailMode?: string }
}
const props = defineProps<{
  sourceId?: string
  config?: MediaLibraryConfig
  placement?: { context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'; size?: { width?: number; height?: number } }
}>()
const emit = defineEmits<{ (e:'event', value:{ type:string; payload:unknown }):void }>()
const sdk = inject<WidgetSdk>('widgetSdk')

const ctx = createLibraryContext(sdk, props.sourceId ?? 'default', props.config?.data?.sources ?? [])
const covers = useCovers(ctx)
const edits = useMetadataEdits(ctx)
const tmdb = useTmdbMatching(ctx, covers, edits)
const previews = usePreviewMedia(ctx)
const scan = useLibraryScan(ctx, covers, edits, tmdb)
const watchProgress = useWatchProgress(ctx)
const background = useBackgroundPlayback(ctx, (item, positionMs, durationMs, final) => watchProgress.note(item, positionMs, durationMs, final))
const { items:scannedMovies, sources, life } = ctx

/** Preparing playback longer than this is abandoned (the overlay never traps the user). */
const PLAY_START_TIMEOUT_MS = 15000

/** Shelves at the head of the showroom aisle (their own items, in their own order). */
const FEATURED_SHELVES = ['continue','recent','collections']

function displayModeOf(view: MediaLibraryConfig['view']): DisplayMode {
  if (view?.displayMode === 'video-club' || view?.displayMode === 'classic') return view.displayMode
  return view?.libraryMode === 'shelf' && view?.detailMode === 'classic' ? 'classic' : 'video-club'
}

function sortModeOf(view: MediaLibraryConfig['view']): SortMode {
  return SORT_MODES.some(mode => mode.id === view?.sortMode) ? view!.sortMode! : 'title'
}

const query = ref('')
const selectedId = ref(props.config?.data?.selectedId || sampleMovies[0].id)
const displayMode = life?.persistRef<DisplayMode>('media-library.display-mode', displayModeOf(props.config?.view))
  ?? ref<DisplayMode>(displayModeOf(props.config?.view))
const sortMode = life?.persistRef<SortMode>('media-library.sort-mode', sortModeOf(props.config?.view))
  ?? ref<SortMode>(sortModeOf(props.config?.view))
const libraryMode = computed<LibraryMode>(() => displayMode.value === 'classic' ? 'shelf' : 'store')
const detailMode = computed<DetailMode>(() => displayMode.value === 'classic' ? 'classic' : 'movie-store')
const searchInput = ref<HTMLInputElement | null>(null)
const genreJump = ref('')
const shelfFocusId = ref<string | null>(null)
const storeShelfId = ref<string | null>(null)
const storeShelfHistory = ref<string[]>([])
const openId = ref<string | null>(null)
const flipped = ref(false)
const activePreview = ref<number | null>(null)
const browse = ref<HTMLElement | null>(null)
const player = ref<{ item:LibraryItem; url:string; mimeType?:string; startAt:number; autoplay:boolean } | null>(null)
const playerView = ref<InstanceType<typeof PlayerOverlay> | null>(null)
/** The sound goes on while the library is off screen (default on). */
const keepPlaying = computed(() => props.config?.view?.backgroundSound !== false)
/** The player's <video> now (the background sound follows it). */
let playerVideo: HTMLVideoElement | null = null
const playerLoading = ref(false)
const coverFocusDraft = ref<{ item:LibraryItem; image:MediaImage } | null>(null)
let playRevision = 0

const scansRealFolders = computed(() => sources.value.length > 0 && !!sdk?.openListing)
const libraryItems = computed(() => scansRealFolders.value ? scannedMovies.value.map(watchProgress.apply) : sampleMovies)
const shelves = computed(() => shelvesFor(libraryItems.value, query.value, sortMode.value))
const genres = computed(() => Array.from(new Set(libraryItems.value.map(item => item.primaryGenre))).sort())
const completeShelves = computed(() => shelvesFor(libraryItems.value, '', sortMode.value))
const genreShelves = computed(() => completeShelves.value.filter(shelf => genres.value.includes(shelf.title)))
const featuredShelves = computed(() => completeShelves.value.filter(shelf => FEATURED_SHELVES.includes(shelf.id)))
const storeFocusedShelf = computed(() => query.value.trim()
  ? shelves.value[0] ?? null
  : completeShelves.value.find(shelf => shelf.id === storeShelfId.value) ?? null)
const canNavigateBack = computed(() => !!query.value.trim()
  || (libraryMode.value === 'store' ? !!storeShelfId.value : !!shelfFocusId.value))
const openItem = computed(() => libraryItems.value.find(item => item.id === openId.value) ?? null)
const playerNext = computed(() => player.value ? nextEpisode(libraryItems.value, player.value.item) : undefined)
const openPreviewFrames = computed(() => openItem.value?.path ? previews.frames.value[openItem.value.path] : undefined)
const tmdbPanel = computed(() => ({
  available:!!sdk?.secrets,
  secretSet:tmdb.secret.value.set,
  secretHint:tmdb.secret.value.hint,
  hosts:tmdb.secret.value.hosts ?? TMDB_SECRET_HOSTS,
  busy:tmdb.secretBusy.value,
  state:tmdb.state.value,
  progress:tmdb.progress.value,
  message:tmdb.message.value,
  canMatch:tmdb.canMatch(),
}))

watch(() => props.config?.data?.sources, value => {
  const next = [...(value ?? [])]
  if (JSON.stringify(next) === JSON.stringify(sources.value)) return
  sources.value = next
  void scan.scan(true)
})
watch(scannedMovies, (list: LibraryItem[]) => {
  if (list.length && !list.some(item => item.id === selectedId.value)) selectedId.value = list[0].id
})
watch(() => props.config?.view?.displayMode, value => { if (value) displayMode.value = displayModeOf(props.config?.view) })
watch(() => props.config?.view?.sortMode, value => { if (value) sortMode.value = sortModeOf(props.config?.view) })

/**
 * Saves this placement's data. Covers are not part of it any more (the 'custom-covers'
 * document holds them): an older copy left in the settings is dropped here.
 */
function saveConfig(data: MediaLibraryConfig['data'] = {}) {
  const { customCovers:_legacy, ...previous } = props.config?.data ?? {}
  emit('event', { type:'update:config', payload:{ ...props.config, data:{ ...previous, sources:sources.value, ...data } } })
}

/** Saves view settings of this placement (the host merges the patch). */
function saveView(patch: NonNullable<MediaLibraryConfig['view']>) {
  if (sdk?.setView) void sdk.setView(patch)
  else emit('event', { type:'update:config', payload:{ ...props.config, view:{ ...props.config?.view, ...patch } } })
}

// ── Navigation ──────────────────────────────────────────────────────────────

async function scrollBrowseTop() {
  await nextTick()
  browse.value?.scrollTo({ top:0, behavior:'smooth' })
}

async function revealShelf(shelfId: string) {
  query.value = ''
  shelfFocusId.value = shelfId
  genreJump.value = genreShelves.value.some(shelf => shelf.id === shelfId) ? shelfId : ''
  await nextTick()
  browse.value?.querySelector<HTMLElement>(`[data-shelf-id="${shelfId}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' })
}

async function focusStoreShelf(shelfId: string) {
  if (storeShelfId.value && storeShelfId.value !== shelfId) storeShelfHistory.value.push(storeShelfId.value)
  storeShelfId.value = shelfId
  genreJump.value = genreShelves.value.some(shelf => shelf.id === shelfId) ? shelfId : ''
  await scrollBrowseTop()
}

async function backFromStoreShelf() {
  storeShelfId.value = storeShelfHistory.value.pop() ?? null
  genreJump.value = storeShelfId.value && genreShelves.value.some(shelf => shelf.id === storeShelfId.value) ? storeShelfId.value : ''
  await scrollBrowseTop()
}

async function showStoreFloor() {
  storeShelfId.value = null
  storeShelfHistory.value = []
  genreJump.value = ''
  await scrollBrowseTop()
}

async function returnHome() {
  if (openId.value) closeDetail()
  query.value = ''
  genreJump.value = ''
  shelfFocusId.value = null
  if (libraryMode.value === 'store') await showStoreFloor()
  else await scrollBrowseTop()
}

async function navigateBack() {
  if (query.value.trim()) {
    query.value = ''
    await scrollBrowseTop()
  } else if (libraryMode.value === 'store' && storeShelfId.value) {
    await backFromStoreShelf()
  } else if (libraryMode.value === 'shelf' && shelfFocusId.value) {
    shelfFocusId.value = null
    genreJump.value = ''
    await scrollBrowseTop()
  }
}

async function jumpToGenre() {
  if (!genreJump.value) return
  query.value = ''
  if (libraryMode.value === 'store') {
    await focusStoreShelf(genreJump.value)
    return
  }
  shelfFocusId.value = genreJump.value
  await nextTick()
  browse.value?.querySelector<HTMLElement>(`[data-shelf-id="${genreJump.value}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' })
}

function setDisplayMode(mode: DisplayMode) {
  displayMode.value = mode
  shelfFocusId.value = null
  storeShelfId.value = null
  storeShelfHistory.value = []
  genreJump.value = ''
  saveView({ displayMode:mode })
}

function setKeepPlaying(on: boolean) {
  saveView({ backgroundSound:on })
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode
  saveView({ sortMode:mode })
}

// ── The opened title ────────────────────────────────────────────────────────

function open(item: LibraryItem) {
  if (item.targetShelfId) {
    if (libraryMode.value === 'store') void focusStoreShelf(item.targetShelfId)
    else void revealShelf(item.targetShelfId)
    return
  }
  selectedId.value = item.id
  openId.value = item.id
  flipped.value = false
  activePreview.value = null
  previews.resetStream()
  saveConfig({ selectedId:item.id })
  void covers.ensureOpenArtwork(item)
  void previews.ensureFrames(item)
  void previews.ensureStream(item, id => openItem.value?.id === id)
  previews.ensureExtraThumbs(item)
}

function closeDetail() {
  openId.value = null
  flipped.value = false
  activePreview.value = null
  previews.resetStream()
}

function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index > 0 ? path.slice(0, index) : path
}

// The file itself, selected in a GExplorer pane (sdk.reveal: a click here is the user's own gesture).
function showMediaFile(item: LibraryItem) {
  if (item.path) void sdk?.reveal?.(item.path)
}

function openTmdbReviews(item: LibraryItem) {
  const url = tmdbReviewsUrl(item)
  if (url) void sdk?.openUrl?.(url, { title:`${item.title} reviews on TMDB` })
}

function updateTitle(value: string) {
  if (openItem.value) void edits.update([openItem.value], { title:value })
}

function updateSynopsis(value: string) {
  if (openItem.value) void edits.update([openItem.value], { synopsis:value })
}

function updateGenres(value: string[]) {
  if (openItem.value) void edits.updateGenres(openItem.value, value)
}

async function manageArtwork(item: LibraryItem) {
  const ui = sdk?.ui?.()
  if (!item.path || !ui) return
  const result = await ui.messageBox({
    title:`Artwork for ${item.title}`,
    message:'Choose where this title’s artwork should come from.',
    detail:'A movie frame opens playback so you can seek to the exact image before saving it.',
    buttons:[
      { label:'Cancel', cancel:true },
      { label:item.tmdbPosterPath ? 'Use TMDB artwork' : 'Query TMDB', id:'tmdb' },
      { label:'Choose image', id:'image' },
      { label:'Choose movie frame', id:'frame', default:true },
    ],
  })
  if (result.button === 'image') await covers.chooseFile(item, directoryOf(item.path))
  else if (result.button === 'frame') {
    await play(item)
    ctx.snack('cover-frame', 'Seek to the frame you want, then choose “Use current frame as cover”.', 6500)
  } else if (result.button === 'tmdb') {
    if (item.tmdbPosterPath) await covers.useTmdbPoster(item)
    else {
      if (!tmdb.secret.value.set) await tmdb.promptSecret()
      if (tmdb.secret.value.set) await tmdb.matchOne(item, true)
    }
  }
}

// ── Player ──────────────────────────────────────────────────────────────────

let releasePlayerQuiet: (() => void) | null = null

/**
 * Plays a title, from where the user stopped unless `fromStart`. `startAt` (seconds) and `paused`:
 * the movie the library was playing when it left the screen.
 */
async function play(item: LibraryItem, options: { fromStart?: boolean; startAt?: number; paused?: boolean } = {}) {
  emit('event', { type:'media-library:play', payload:{ id:item.id, title:item.title } })
  if (!item.path) {
    ctx.snack('sample', `${item.title} is sample media in this design milestone.`, 3500)
    return
  }
  if (!sdk?.mintStreamHttp) {
    void sdk?.openPath?.(item.path)
    return
  }
  const revision = ++playRevision
  player.value = null
  playerLoading.value = true
  if (!releasePlayerQuiet) releasePlayerQuiet = sdk.ui?.().quietMode?.() ?? null
  let timer: number | undefined
  try {
    const stream = await Promise.race([
      sdk.mintStreamHttp(item.path, videoMime(item.mimeType ?? '')),
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('GEM Shell did not prepare the stream in time.')), PLAY_START_TIMEOUT_MS) }),
    ])
    if (revision !== playRevision) return   // closed (or another title started) meanwhile
    const startAt = options.startAt ?? (options.fromStart ? 0 : item.resumeSeconds ?? 0)
    player.value = { item, url:stream.url, mimeType:stream.mimeType, startAt, autoplay:!options.paused }
  } catch (error) {
    if (revision !== playRevision) return
    background.release()
    releasePlayerQuiet?.()
    releasePlayerQuiet = null
    ctx.snack('play', `Could not play ${item.title}: ${errorText(error)}`, 5000)
  } finally {
    window.clearTimeout(timer)
    if (revision === playRevision) playerLoading.value = false
  }
}

/** Closes the player. `keepSound`: the widget is leaving the screen (handOff decided about the sound). */
function closePlayer(keepSound = false) {
  if (!keepSound) background.release()
  playerVideo = null
  void watchProgress.flush()
  playRevision += 1
  playerLoading.value = false
  cancelCoverFocus()
  player.value = null
  releasePlayerQuiet?.()
  releasePlayerQuiet = null
}

async function captureFrame(timeMs: number) {
  const item = player.value?.item
  if (!item?.path || !sdk?.mediaVideoFramesCreate || covers.coverBusy.value) return
  covers.coverBusy.value = true
  try {
    const result = await sdk.mediaVideoFramesCreate({ path:item.path, timesMs:[timeMs] }, { width:1280, fit:'contain', format:'jpeg', storage:'persistent' })
    const frame = result.frames[0]
    if (!frame?.image) throw new Error(frame?.message || frame?.error || 'The current frame could not be decoded.')
    coverFocusDraft.value = { item, image:frame.image }
  } catch (error) {
    ctx.snack('cover', `Could not capture this frame: ${errorText(error)}`, 6500)
  } finally {
    covers.coverBusy.value = false
  }
}

async function saveCoverFocus(focus: { x:number; y:number }) {
  const draft = coverFocusDraft.value
  if (!draft || covers.coverBusy.value) return
  covers.coverBusy.value = true
  try {
    await covers.replace(draft.item, draft.image, focus)
    coverFocusDraft.value = null
    ctx.snack('cover', `Current frame saved as the cover for ${draft.item.title}.`, 3500)
  } catch (error) {
    ctx.snack('cover', `Could not save this cover: ${errorText(error)}`, 6500)
  } finally {
    covers.coverBusy.value = false
  }
}

function cancelCoverFocus() {
  const draft = coverFocusDraft.value
  coverFocusDraft.value = null
  if (draft) covers.deleteAsset(draft.image.assetId)
}

function playerVideoChanged(element: HTMLVideoElement | null) {
  playerVideo = element
  if (element && player.value) background.follow(element, player.value.item, player.value.url, keepPlaying.value)
}

watch(keepPlaying, on => {
  if (!playerVideo || !player.value) return
  if (on) background.follow(playerVideo, player.value.item, player.value.url, true)
  else background.release()
})

function playerProgress(item: LibraryItem, positionMs: number, durationMs: number, final: boolean) {
  watchProgress.note(item, positionMs, durationMs, final)
}

function playNextEpisode() {
  const next = playerNext.value
  if (next) void play(next)
}

function choosePlayerCover() {
  const item = player.value?.item
  if (item?.path) void covers.chooseFile(item, directoryOf(item.path))
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Scans the folders again; connected to TMDB, the titles found since are matched too. */
async function scanAndMatch() {
  if (await scan.scan(true) && tmdb.secret.value.set) await tmdb.matchNew()
}

async function addSource() {
  if (!await scan.addSource()) return
  saveConfig()
  void scanAndMatch()
}

async function removeSource(path: string) {
  await scan.removeSource(path)
  saveConfig()
  void scan.scan(true)
}

// ── Menus and commands (entry.ts menuContexts / menus / commands) ───────────

function itemById(id: string): LibraryItem | undefined {
  return flattenLibraryExtras(libraryItems.value).find(item => item.id === id)
}

/** Right-click on a case: the title's menu (its file is the subject: other widgets' actions work on it). */
function onCaseMenu(item: LibraryItem, event: MouseEvent) {
  if (item.targetShelfId) return   // a series card leads to its shelf: nothing to act on
  selectedId.value = item.id
  void sdk?.ui?.().contextMenu(event, { context:'media.title', ref:item.id, selection:item.path ? [item.path] : [], widgetConfig:props.config })
}

/** Right-click elsewhere in the library: its own menu (scan, match, add a folder). */
function onLibraryMenu(event: MouseEvent) {
  event.preventDefault()
  void sdk?.ui?.().contextMenu(event, { context:'media.library', widgetConfig:props.config })
}

async function onMenuItem(m: WidgetMenuItemMessage) {
  const item = m.ref ? itemById(m.ref) : undefined
  switch (m.itemId) {
    case 'play': if (item) await play(item); break
    case 'play-from-start': if (item) await play(item, { fromStart:true }); break
    case 'details': if (item) open(item); break
    case 'show-file': if (item) showMediaFile(item); break
    case 'artwork': if (item) await manageArtwork(item); break
    case 'match':
      if (!item?.path) break
      if (!tmdb.secret.value.set) await tmdb.promptSecret()
      if (tmdb.secret.value.set) await tmdb.matchOne(item)
      break
    case 'watched': if (item) await watchProgress.setWatched([item], true); break
    case 'unwatched': if (item) await watchProgress.setWatched([item], false); break
    case 'scan': if (sources.value.length) await scanAndMatch(); break
    case 'match-all': await tmdb.matchAll(); break
    case 'add-folder': await addSource(); break
    default: console.warn('[Media Library] unknown menu item', m.itemId)
  }
}

/** One of entry.ts's commands (the host calls it while the library has the user's focus). */
function onCommand(id: string) {
  const target = openItem.value ?? libraryItems.value.find(item => item.id === selectedId.value)
  switch (id) {
    case 'find':
      searchInput.value?.focus()
      searchInput.value?.select()
      break
    case 'play': if (target && !player.value && !playerLoading.value) void play(target); break
    case 'flip': if (openItem.value && !player.value) flipped.value = !flipped.value; break
    case 'watched': if (target?.path) void watchProgress.setWatched([target], !target.watched); break
    case 'rescan': if (sources.value.length) void scanAndMatch(); break
  }
}

defineExpose({ onMenuItem, onCommand })

function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (coverFocusDraft.value) cancelCoverFocus()
  else if (player.value || playerLoading.value) closePlayer()
  else if (openId.value) closeDetail()
  else if (canNavigateBack.value) void navigateBack()
  else return   // nothing to close here: Escape goes on to the shell
  event.stopPropagation()
}

onMounted(async () => {
  await Promise.all([
    scan.loadSources(), scan.loadHistory(), covers.load(props.config?.data?.customCovers),
    tmdb.load(), edits.load(), tmdb.refreshSecret(), watchProgress.load(),
  ])
  // The movie playing when the library left the screen (its sound may have gone on meanwhile).
  // Live: its sound is still going; the video starts where the sound is and takes it back.
  const back = background.takeBack()
  if (back?.item.path) void play(back.item, {
    startAt:back.live ? back.positionMs / 1000 + .3 : Math.max(0, back.positionMs / 1000 - 2),
    paused:!back.playing,
  })
  void scan.scan()
})
onBeforeUnmount(() => {
  ctx.nextRevision()
  const playing = player.value
  const snapshot = playerView.value?.snapshot() ?? null
  if (playing && snapshot) background.handOff(playing.item, playing.url, snapshot, keepPlaying.value)
  closePlayer(!!(playing && snapshot))
})
</script>

<template>
  <section
    class="media-library gem-library-surface"
    :class="{ sidebar: placement?.context === 'sidebar', atmosphere: config?.view?.atmosphere !== false }"
    aria-label="GEM Video Club"
    @keydown="keydown"
  >
    <header class="media-library-topbar">
      <nav class="media-library-navigation" aria-label="Library navigation">
        <button type="button" :disabled="!canNavigateBack" aria-label="Go back" title="Back" @click="navigateBack"><span aria-hidden="true">←</span></button>
        <button type="button" aria-label="Go to library home" title="Home" @click="returnHome"><span aria-hidden="true">⌂</span></button>
        <span class="media-library-brand-logo" aria-label="GEM Video Club"><i>GEM</i><b>VIDEO CLUB</b></span>
      </nav>
      <div class="media-library-search" role="search"><span aria-hidden="true">⌕</span><input ref="searchInput" v-model="query" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" :spellcheck="false" placeholder="Find a movie or genre" aria-label="Find a movie or genre" /><button v-if="query" type="button" aria-label="Clear search" @click="query = ''">×</button></div>
      <div class="media-library-tools">
        <label class="media-library-genres">
          <span aria-hidden="true">▦</span>
          <select v-model="genreJump" aria-label="Jump to a genre" @change="jumpToGenre">
            <option value="">Genres</option>
            <option v-for="genre in genres" :key="genre" :value="genre.toLocaleLowerCase().split(' ').join('-')">{{ genre }}</option>
          </select>
        </label>
        <label class="media-library-genres media-library-sort" title="Sort titles">
          <span aria-hidden="true">⇅</span>
          <select :value="sortMode" aria-label="Sort titles" @change="setSortMode(($event.target as HTMLSelectElement).value as SortMode)">
            <option v-for="mode in SORT_MODES" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
          </select>
        </label>
        <SettingsMenu
          :display-mode="displayMode"
          :keep-playing="keepPlaying"
          :sources="sources"
          :can-add-source="!!sdk?.ui"
          :can-scan="!!sdk?.openListing"
          :scan-state="scan.state.value"
          :scan-warnings="scan.warnings.value"
          :scan-truncated="scan.truncated.value"
          :scanned-count="scannedMovies.length"
          :artwork-progress="covers.artworkProgress.value"
          :tmdb-artwork-progress="covers.tmdbArtworkProgress.value"
          :tmdb="tmdbPanel"
          @display-mode="setDisplayMode"
          @keep-playing="setKeepPlaying"
          @add-source="addSource"
          @remove-source="removeSource"
          @scan="scanAndMatch"
          @tmdb-connect="tmdb.promptSecret"
          @tmdb-forget="tmdb.forgetSecret"
          @tmdb-match="tmdb.matchAll()"
        />
      </div>
    </header>

    <main ref="browse" class="media-library-browse" @wheel.stop @contextmenu="onLibraryMenu">
      <div v-if="scan.state.value === 'scanning' && !libraryItems.length" class="media-library-empty media-library-scanning"><span>◌</span><strong>Stocking the shelves</strong><p>{{ scan.progress.value?.phase === 'metadata' ? 'Reading movie details' : `Searching ${sourceLabel(scan.progress.value?.current || '')}` }} · {{ scan.progress.value?.videos ?? 0 }} found</p></div>
      <div v-else-if="!shelves.length" class="media-library-empty"><span>⌕</span><strong>{{ query ? 'No movie found' : scan.state.value === 'error' ? 'Could not scan the library' : 'No videos found' }}</strong><p>{{ query ? 'Try a title, year, or genre.' : scan.error.value || 'Add another folder or scan again.' }}</p><button v-if="query" type="button" @click="query = ''">Clear search</button><button v-else-if="sources.length" type="button" @click="scanAndMatch">Scan again</button></div>
      <StoreFloor
        v-if="libraryMode === 'store'"
        :shelves="genreShelves"
        :featured="featuredShelves"
        :sort="sortMode"
        :items="libraryItems"
        :active-shelf="storeFocusedShelf"
        :selected-id="selectedId"
        @select-shelf="focusStoreShelf"
        @open="open"
        @menu="onCaseMenu"
      />
      <MediaShelf
        v-else
        v-for="shelf in shelves"
        :key="shelf.id"
        :shelf-id="shelf.id"
        :title="shelf.title"
        :note="shelf.note"
        :items="shelf.items"
        :selected-id="selectedId"
        @open="open"
        @menu="onCaseMenu"
      />
    </main>

    <LibraryDetail
      v-if="openItem"
      :item="openItem"
      :detail-mode="detailMode"
      :flipped="flipped"
      :active-preview="activePreview"
      :preview-stream-url="previews.stream.value?.itemId === openItem.id ? previews.stream.value.url : null"
      :preview-image-srcs="openPreviewFrames?.images"
      :preview-frames-loading="openPreviewFrames?.loading"
      :preview-frames-message="openPreviewFrames?.message"
      :can-show-in-folder="!!sdk?.reveal"
      :extra-thumbs="previews.extraThumbs.value"
      :can-open-externally="!!sdk?.openPath"
      @close="closeDetail"
      @flip="flipped = !flipped"
      @preview="activePreview = $event"
      @play="play(openItem)"
      @play-from-start="play(openItem, { fromStart:true })"
      @play-extra="play"
      @show-in-folder="showMediaFile(openItem)"
      @open-external="openItem?.path && sdk?.openPath?.(openItem.path)"
      @show-extra-in-folder="showMediaFile"
      @edit-artwork="manageArtwork(openItem)"
      @open-tmdb="openTmdbReviews(openItem)"
      @update-title="updateTitle"
      @update-synopsis="updateSynopsis"
      @update-genres="updateGenres"
    />

    <PlayerOverlay
      v-if="player || playerLoading"
      ref="playerView"
      :item="player?.item ?? null"
      :url="player?.url ?? null"
      :loading="playerLoading"
      :cover-busy="covers.coverBusy.value"
      :focus-image="coverFocusDraft?.image.url ?? null"
      :start-at="player?.startAt"
      :autoplay="player?.autoplay ?? true"
      :next-title="playerNext ? (playerNext.seriesTitle ? `${playerNext.seriesTitle} · ${playerNext.title}` : playerNext.title) : null"
      @close="closePlayer"
      @capture="captureFrame"
      @choose-image="choosePlayerCover"
      @focus-save="saveCoverFocus"
      @focus-cancel="cancelCoverFocus"
      @progress="playerProgress"
      @play-next="playNextEpisode"
      @video="playerVideoChanged"
    />
  </section>
</template>

<style src="./media-library.css"></style>
