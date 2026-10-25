<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MediaImage, WidgetSdk, WidgetSecrets } from 'gexplorer/widgets'
import { LibraryDetail, MediaShelf, type LibraryItem } from '../../shared/library-ui'
import { posterAtlases, sampleMovies } from './fixtures'
import { bundleMovieExtras, createScannedLibrary, flattenLibraryExtras, preferredCoverSource, shelvesFor } from './media'
import StoreFloor from './StoreFloor.vue'
import { applyMetadataOverride, loadMetadataOverrides, saveMetadataOverrides, type MediaMetadataOverride } from './metadata-overrides'
import { loadScanHistory, mediaPathKey, mergeScanHistory, saveScanHistory } from './scan-history'
import { scanVideoSources, videoMime, type ScannedVideo, type ScanProgress } from './scanner'
import { loadMediaSources, saveMediaSources } from './sources'
import {
  applyPersistedTmdbMetadata, diagnoseTmdbItem, enrichWithTmdb, persistedTmdbMetadata, restorePersistedTmdbMetadata,
  TMDB_SECRET_HOSTS, TMDB_SECRET_NAME, tmdbImageUrl, tmdbReviewsUrl,
  type PersistedTmdbMetadata, type TmdbProgress,
} from './tmdb'

type LibraryMode = 'shelf' | 'store'
type DetailMode = 'classic' | 'movie-store'
type SavedCover = { assetId:string; url:string; x?:number; y?:number }
type CoverPreference = string | SavedCover
type SavedCoverStore = { version:1; covers:Record<string,CoverPreference> }
type TmdbMetadataStore = { version:1; records:Record<string,PersistedTmdbMetadata> }
type ScanShelf = { sourceKey:string; videos:ScannedVideo[]; items:LibraryItem[]; warnings:string[]; truncated:boolean }
type PreviewFrameState = { images:string[]; loading:boolean; message:string }
type CoverFocusDraft = { item:LibraryItem; image:MediaImage; x:number; y:number }
type MediaLibraryConfig = {
  data?: { selectedId?: string; sources?: string[]; customCovers?: Record<string,CoverPreference> }
  view?: { atmosphere?: boolean; libraryMode?: string; detailMode?: DetailMode }
}
const props = defineProps<{
  sourceId?: string
  config?: MediaLibraryConfig
  placement?: { context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'; size?: { width?: number; height?: number } }
}>()
const emit = defineEmits<{ (e:'event', value:{ type:string; payload:unknown }):void }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const life = sdk?.lifecycle?.()
const scanShelf = life?.persistRef<ScanShelf | null>('media-library.scan-shelf',null) ?? ref<ScanShelf | null>(null)
const query = ref('')
const selectedId = ref(props.config?.data?.selectedId || sampleMovies[0].id)
const sources = ref<string[]>([...(props.config?.data?.sources ?? [])])
const customCovers = ref<Record<string,CoverPreference>>({ ...(props.config?.data?.customCovers ?? {}) })
const tmdbMetadata = ref<Record<string,PersistedTmdbMetadata>>({})
const metadataOverrides = ref<Record<string,MediaMetadataOverride>>({})
const tmdbSecret = ref<Awaited<ReturnType<WidgetSecrets['status']>>>({ set:false })
const tmdbSecretBusy = ref(false)
const tmdbQueryBusy = ref(false)
const tmdbState = ref<'idle'|'matching'|'ready'|'error'>('idle')
const tmdbProgress = ref<TmdbProgress | null>(null)
const tmdbArtworkProgress = ref<{ completed:number; total:number } | null>(null)
const tmdbMessage = ref('')
const scannedMovies = ref<LibraryItem[]>([])
const scanState = ref<'idle' | 'scanning' | 'ready' | 'error'>('idle')
const scanProgress = ref<ScanProgress | null>(null)
const scanWarnings = ref<string[]>([])
const scanTruncated = ref(false)
const scanError = ref('')
function normalizeLibraryMode(mode: string | undefined): LibraryMode {
  return mode === 'store' ? 'store' : 'shelf'
}
const libraryMode = life?.persistRef<LibraryMode>('media-library.library-mode',normalizeLibraryMode(props.config?.view?.libraryMode))
  ?? ref<LibraryMode>(normalizeLibraryMode(props.config?.view?.libraryMode))
if (libraryMode.value !== 'shelf' && libraryMode.value !== 'store') libraryMode.value = 'shelf'
const detailMode = life?.persistRef<DetailMode>('media-library.detail-mode',props.config?.view?.detailMode ?? 'movie-store')
  ?? ref<DetailMode>(props.config?.view?.detailMode ?? 'movie-store')
const genreJump = ref('')
const shelfFocusId = ref<string | null>(null)
const storeShelfId = ref<string | null>(null)
const storeShelfHistory = ref<string[]>([])
const openId = ref<string | null>(null)
const flipped = ref(false)
const activePreview = ref<number | null>(null)
const previewStream = ref<{ itemId:string; url:string } | null>(null)
const previewFrames = ref<Record<string,PreviewFrameState>>({})
const browse = ref<HTMLElement | null>(null)
const libraryMenu = ref<HTMLDetailsElement | null>(null)
const libraryMenuTab = ref<'display'|'library'>('display')
const player = ref<{ item:LibraryItem; url:string; mimeType?:string } | null>(null)
const playerElement = ref<HTMLVideoElement | null>(null)
const playerLoading = ref(false)
const playerCoverMenu = ref<{ x:number; y:number } | null>(null)
const coverFocusDraft = ref<CoverFocusDraft | null>(null)
const coverBusy = ref(false)
const artworkProgress = ref<{ completed:number; total:number } | null>(null)
const scansRealFolders = computed(() => sources.value.length > 0 && !!sdk?.openListing)
const libraryItems = computed(() => scansRealFolders.value ? scannedMovies.value : sampleMovies)
const shelves = computed(() => shelvesFor(libraryItems.value, query.value))
const genres = computed(() => Array.from(new Set(libraryItems.value.map(item => item.primaryGenre))).sort())
const completeShelves = computed(() => shelvesFor(libraryItems.value))
const genreShelves = computed(() => completeShelves.value.filter(shelf => genres.value.includes(shelf.title)))
const storeFocusedShelf = computed(() => query.value.trim()
  ? shelves.value[0] ?? null
  : completeShelves.value.find(shelf => shelf.id === storeShelfId.value) ?? null)
const canNavigateBack = computed(() => !!query.value.trim()
  || (libraryMode.value === 'store' ? !!storeShelfId.value : !!shelfFocusId.value))
const openItem = computed(() => libraryItems.value.find(item => item.id === openId.value) ?? null)
const openPreviewFrames = computed(() => openItem.value?.path ? previewFrames.value[openItem.value.path] : undefined)
const collectionLabel = computed(() => scansRealFolders.value
  ? scanState.value === 'scanning'
    ? `${scanProgress.value?.videos ?? 0} found · scanning`
    : `${libraryItems.value.length} ${libraryItems.value.some(item => item.mediaKind === 'episode') ? 'titles' : libraryItems.value.length === 1 ? 'movie' : 'movies'} · local collection`
  : `${sampleMovies.length} movies · sample collection`)
let scanRevision = 0
let previewRevision = 0
const COVER_STORE = 'custom-covers'
const TMDB_METADATA_STORE = 'tmdb-metadata'
const artworkRequests = new Set<string>()
const previewFrameRequests = new Map<string,Promise<void>>()
const remoteArtworkPaths = new Set<string>()
let knownMediaPaths = new Set<string>()
let releasePlayerQuiet: (() => void) | null = null

function savedCoverUrl(value: CoverPreference | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.url
}

function savedCoverAssetId(value: CoverPreference | undefined): string | undefined {
  return typeof value === 'string' ? undefined : value?.assetId
}

function savedCoverArtwork(value: CoverPreference | undefined) {
  const src = savedCoverUrl(value)
  return src ? { src, x:typeof value === 'string' ? 50 : value?.x ?? 50, y:typeof value === 'string' ? 50 : value?.y ?? 50, mode:'cover' as const } : undefined
}

function sourceKey() {
  return sources.value.map(path => path.replace(/[\\/]+$/,'').toLocaleLowerCase()).join('\n')
}

function copyItems(items: LibraryItem[]): LibraryItem[] {
  return items.map(item => ({
    ...item,
    genres:[...item.genres],
    previews:item.previews.map(cue => ({ ...cue })),
    artwork:{ ...item.artwork },
    extras:item.extras ? copyItems(item.extras) : undefined,
  }))
}

function syncScanShelfItems() {
  const cached = scanShelf.value
  if (cached?.sourceKey === sourceKey()) scanShelf.value = { ...cached, items:copyItems(scannedMovies.value) }
}

async function loadCustomCovers() {
  if (!sdk?.configRead) return
  try {
    const saved = await sdk.configRead<SavedCoverStore>(COVER_STORE)
    if (saved?.version === 1 && saved.covers && typeof saved.covers === 'object') {
      customCovers.value = { ...customCovers.value, ...saved.covers }
    } else if (Object.keys(customCovers.value).length && sdk.configWrite) {
      await sdk.configWrite(COVER_STORE, { version:1, covers:customCovers.value } satisfies SavedCoverStore)
    }
  } catch (error) {
    console.warn('[Media Library] Could not load saved custom covers:', error)
  }
}

async function persistCustomCovers() {
  if (!sdk?.configWrite) return
  await sdk.configWrite(COVER_STORE, { version:1, covers:customCovers.value } satisfies SavedCoverStore)
}

async function loadTmdbMetadata() {
  if (!sdk?.configRead) return
  try {
    const saved = await sdk.configRead<TmdbMetadataStore>(TMDB_METADATA_STORE)
    if (saved?.version === 1 && saved.records && typeof saved.records === 'object') tmdbMetadata.value = saved.records
  } catch (error) {
    console.warn('[Media Library] Could not load saved TMDB metadata:', error)
  }
}

async function persistTmdbMetadata() {
  if (!sdk?.configWrite) return
  await sdk.configWrite(TMDB_METADATA_STORE, { version:1, records:tmdbMetadata.value } satisfies TmdbMetadataStore)
}

async function loadLocalMetadata() {
  try {
    metadataOverrides.value = await loadMetadataOverrides(sdk)
  } catch (error) {
    console.warn('[Media Library] Could not load local metadata edits:',error)
  }
}

async function updateLocalMetadata(item: LibraryItem, patch: MediaMetadataOverride) {
  await updateLocalMetadataItems([item],patch)
}

async function updateLocalMetadataItems(items: LibraryItem[], patch: MediaMetadataOverride) {
  const paths = new Set(items.flatMap(item => item.path ? [item.path] : []))
  if (!paths.size) return
  const next = { ...metadataOverrides.value }
  for (const path of paths) next[path] = { ...next[path], ...patch }
  metadataOverrides.value = next
  scannedMovies.value = scannedMovies.value.map(candidate => candidate.path && paths.has(candidate.path)
    ? applyMetadataOverride(candidate,next[candidate.path])
    : candidate)
  syncScanShelfItems()
  try {
    await saveMetadataOverrides(sdk,next)
  } catch (error) {
    console.warn('[Media Library] Could not save local metadata edits:',error)
    void sdk?.ui?.().snack({ id:'media-library-metadata', dedupe:'replace', text:'The local media edits could not be saved.', timeoutMs:6000 })
  }
}

async function loadSources() {
  try {
    sources.value = await loadMediaSources(sdk,props.sourceId ?? 'default',sources.value)
  } catch (error) {
    console.warn('[Media Library] Could not load saved media sources:',error)
  }
}

async function persistSources() {
  try {
    await saveMediaSources(sdk,props.sourceId ?? 'default',sources.value)
  } catch (error) {
    console.warn('[Media Library] Could not save media sources:',error)
    void sdk?.ui?.().snack({ id:'media-library-sources', dedupe:'replace', text:'The media folder list could not be saved.', timeoutMs:6000 })
  }
}

async function loadKnownMedia() {
  try {
    knownMediaPaths = new Set(await loadScanHistory(sdk,props.sourceId ?? 'default'))
  } catch (error) {
    console.warn('[Media Library] Could not load scan history:',error)
  }
}

async function persistKnownMedia(paths: string[]) {
  try {
    await saveScanHistory(sdk,props.sourceId ?? 'default',paths)
  } catch (error) {
    console.warn('[Media Library] Could not save scan history:',error)
  }
}

watch(() => props.config?.data?.sources, value => {
  const next = [...(value ?? [])]
  if (JSON.stringify(next) === JSON.stringify(sources.value)) return
  sources.value = next
  void scanSources(true)
})
watch(() => props.config?.view?.libraryMode, value => { if (value) libraryMode.value = normalizeLibraryMode(value) })
watch(() => props.config?.view?.detailMode, value => { if (value) detailMode.value = value })
function saveConfig(data: MediaLibraryConfig['data'], view: MediaLibraryConfig['view']) {
  emit('event', { type:'update:config', payload:{ ...props.config, data:{ ...props.config?.data, sources:sources.value, customCovers:customCovers.value, ...data }, view:{ ...props.config?.view, libraryMode:libraryMode.value, detailMode:detailMode.value, ...view } } })
}

async function revealShelf(shelfId: string) {
  query.value = ''
  shelfFocusId.value = shelfId
  genreJump.value = genreShelves.value.some(shelf => shelf.id === shelfId) ? shelfId : ''
  await nextTick()
  browse.value?.querySelector<HTMLElement>(`[data-shelf-id="${shelfId}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' })
}

function open(item: LibraryItem) {
  if (item.targetShelfId) {
    if (libraryMode.value === 'store') {
      void focusStoreShelf(item.targetShelfId)
      return
    }
    void revealShelf(item.targetShelfId)
    return
  }
  selectedId.value = item.id
  openId.value = item.id
  flipped.value = false
  activePreview.value = null
  previewStream.value = null
  previewRevision += 1
  saveConfig({ selectedId:item.id, sources:sources.value }, { libraryMode:libraryMode.value })
  void ensureOpenArtwork(item)
  void ensurePreviewFrames(item)
  void ensurePreviewStream(item)
}

async function ensureOpenArtwork(item: LibraryItem) {
  if (!item.path || item.artwork.src || !sdk?.mediaImageCreate || artworkRequests.has(item.path)) return
  artworkRequests.add(item.path)
  try {
    const image = await sdk.mediaImageCreate({ type:'thumbnail', path:item.path, size:768 }, { width:600, height:900, fit:'cover', format:'jpeg', storage:'cache' })
    if (customCovers.value[item.path]) return
    scannedMovies.value = scannedMovies.value.map(candidate => candidate.path === item.path && !candidate.artwork.src
      ? { ...candidate, artwork:{ src:image.url, x:50, y:50, mode:'cover' as const } }
      : candidate)
  } catch {
    // Keep the neutral frame when Windows or the platform has no thumbnail.
  } finally {
    artworkRequests.delete(item.path)
    syncScanShelfItems()
  }
}
function closeDetail() {
  openId.value = null
  flipped.value = false
  activePreview.value = null
  previewStream.value = null
  previewRevision += 1
}
async function play(item: LibraryItem) {
  if (item.path && sdk?.mintStreamHttp) {
    playerLoading.value = true
    if (!releasePlayerQuiet) releasePlayerQuiet = sdk.ui?.().quietMode?.() ?? null
    try {
      const stream = await sdk.mintStreamHttp(item.path, videoMime(item.mimeType ?? ''))
      player.value = { item, url:stream.url, mimeType:stream.mimeType }
    } catch (error) {
      releasePlayerQuiet?.()
      releasePlayerQuiet = null
      void sdk.ui?.().snack({ id:'media-library-play', dedupe:'replace', text:`Could not play ${item.title}: ${error instanceof Error ? error.message : String(error)}`, timeoutMs:5000 })
    } finally {
      playerLoading.value = false
    }
  } else if (item.path) void sdk?.openPath?.(item.path)
  else void sdk?.ui?.().snack({ id:'media-library-sample', dedupe:'replace', text:`${item.title} is sample media in this design milestone.`, timeoutMs:3500 })
  emit('event', { type:'media-library:play', payload:{ id:item.id, title:item.title } })
}
function setLibraryMode(mode: LibraryMode) {
  libraryMode.value = mode
  shelfFocusId.value = null
  storeShelfId.value = null
  storeShelfHistory.value = []
  genreJump.value = ''
  saveConfig({ sources:sources.value }, { libraryMode:mode })
  libraryMenu.value?.removeAttribute('open')
}

async function focusStoreShelf(shelfId: string) {
  if (storeShelfId.value && storeShelfId.value !== shelfId) storeShelfHistory.value.push(storeShelfId.value)
  storeShelfId.value = shelfId
  genreJump.value = genreShelves.value.some(shelf => shelf.id === shelfId) ? shelfId : ''
  await nextTick()
  browse.value?.scrollTo({ top:0, behavior:'smooth' })
}

async function backFromStoreShelf() {
  storeShelfId.value = storeShelfHistory.value.pop() ?? null
  genreJump.value = storeShelfId.value && genreShelves.value.some(shelf => shelf.id === storeShelfId.value) ? storeShelfId.value : ''
  await nextTick()
  browse.value?.scrollTo({ top:0, behavior:'smooth' })
}
async function showStoreFloor() {
  storeShelfId.value = null
  storeShelfHistory.value = []
  genreJump.value = ''
  await nextTick()
  browse.value?.scrollTo({ top:0, behavior:'smooth' })
}
async function returnHome() {
  if (openId.value) closeDetail()
  query.value = ''
  genreJump.value = ''
  shelfFocusId.value = null
  if (libraryMode.value === 'store') {
    await showStoreFloor()
    return
  }
  await nextTick()
  browse.value?.scrollTo({ top:0, behavior:'smooth' })
}
async function navigateBack() {
  if (query.value.trim()) {
    query.value = ''
    await nextTick()
    browse.value?.scrollTo({ top:0, behavior:'smooth' })
    return
  }
  if (libraryMode.value === 'store' && storeShelfId.value) {
    await backFromStoreShelf()
    return
  }
  if (libraryMode.value === 'shelf' && shelfFocusId.value) {
    shelfFocusId.value = null
    genreJump.value = ''
    await nextTick()
    browse.value?.scrollTo({ top:0, behavior:'smooth' })
  }
}
function setDetailMode(mode: DetailMode) {
  detailMode.value = mode
  saveConfig({ sources:sources.value }, { detailMode:mode })
  libraryMenu.value?.removeAttribute('open')
}
async function addSource() {
  const ui = sdk?.ui?.()
  if (!ui) return
  const path = await ui.pickFolder({ title:'Add a media source', startIn:sources.value[sources.value.length - 1], access:'read' })
  if (!path || sources.value.includes(path)) return
  sources.value = [...sources.value, path]
  await persistSources()
  saveConfig({ sources:sources.value }, { libraryMode:libraryMode.value })
  libraryMenu.value?.removeAttribute('open')
  void scanSources(true)
  void ui.snack({ id:'media-library-source', dedupe:'replace', text:`Added ${sourceLabel(path)}. Looking for videos now.`, timeoutMs:3200 })
}
async function removeSource(path: string) {
  sources.value = sources.value.filter(source => source !== path)
  await persistSources()
  saveConfig({ sources:sources.value }, { libraryMode:libraryMode.value })
  void scanSources(true)
}
async function scanSources(force = false) {
  const revision = ++scanRevision
  artworkProgress.value = null
  tmdbArtworkProgress.value = null
  remoteArtworkPaths.clear()
  scanWarnings.value = []
  scanTruncated.value = false
  scanError.value = ''
  if (!sources.value.length || !sdk?.openListing) {
    scannedMovies.value = []
    scanShelf.value = null
    scanState.value = 'idle'
    return
  }
  const key = sourceKey()
  const cached = scanShelf.value
  if (!force && cached?.sourceKey === key) {
    scannedMovies.value = copyItems(cached.items).map(item => {
      const overridden = item.path ? applyMetadataOverride(item,metadataOverrides.value[item.path]) : item
      const artwork = item.path ? savedCoverArtwork(customCovers.value[item.path]) : undefined
      return artwork ? { ...overridden, artwork } : overridden
    })
    scanWarnings.value = [...cached.warnings]
    scanTruncated.value = cached.truncated
    scanState.value = 'ready'
    scanProgress.value = null
    if (scannedMovies.value.some(item => item.metadataSource === 'tmdb')) {
      tmdbState.value = 'ready'
      tmdbMessage.value = 'Restored the current library from the lifecycle cache.'
    }
    void hydratePreferredArtwork(cached.videos,revision)
    return
  }
  scannedMovies.value = []
  scanState.value = 'scanning'
  scanProgress.value = { phase:'folders', folders:0, videos:0, current:sources.value[0] }
  try {
    const result = await scanVideoSources(
      sdk,
      sources.value,
      `${props.sourceId ?? 'media-library'}:scan:${revision}`,
      progress => { if (revision === scanRevision) scanProgress.value = progress },
      () => revision !== scanRevision,
    )
    if (revision !== scanRevision) return
    const discovered = new Set(result.videos
      .map(video => mediaPathKey(video.path))
      .filter(path => !knownMediaPaths.has(path)))
    const coverUrls = new Map<string,string>()
    const restored = restorePersistedTmdbMetadata(
      createScannedLibrary(result.videos, posterAtlases, coverUrls),
      tmdbMetadata.value,
    )
    scannedMovies.value = bundleMovieExtras(restored.items.map(item => {
      const artwork = item.path ? savedCoverArtwork(customCovers.value[item.path]) : undefined
      const local = item.path ? applyMetadataOverride(item,metadataOverrides.value[item.path]) : item
      const withArrival = local.path ? { ...local, newArrival:discovered.has(mediaPathKey(local.path)) } : local
      return artwork ? { ...withArrival, artwork } : withArrival
    }))
    if (restored.restored) {
      tmdbState.value = 'ready'
      tmdbMessage.value = `${restored.restored} TMDB ${restored.restored === 1 ? 'match' : 'matches'} restored from cache.`
    } else if (tmdbState.value === 'ready') {
      tmdbState.value = 'idle'
      tmdbMessage.value = ''
    }
    const updatedHistory = mergeScanHistory(
      knownMediaPaths,
      result.videos.map(video => video.path),
      !result.truncated && !result.warnings.length,
    )
    knownMediaPaths = new Set(updatedHistory)
    await persistKnownMedia(updatedHistory)
    if (revision !== scanRevision) return
    scanWarnings.value = result.warnings
    scanTruncated.value = result.truncated
    scanState.value = 'ready'
    scanShelf.value = {
      sourceKey:key,
      videos:result.videos.map(video => ({ ...video, probe:video.probe ? { ...video.probe } : undefined })),
      items:copyItems(scannedMovies.value),
      warnings:[...result.warnings],
      truncated:result.truncated,
    }
    if (scannedMovies.value.length && !scannedMovies.value.some(item => item.id === selectedId.value)) selectedId.value = scannedMovies.value[0].id
    void hydratePreferredArtwork(result.videos, revision)
  } catch (error) {
    if (revision !== scanRevision) return
    scanError.value = error instanceof Error ? error.message : String(error)
    scanState.value = 'error'
  }
}

async function hydratePreferredArtwork(
  videos: Awaited<ReturnType<typeof scanVideoSources>>['videos'],
  revision: number,
) {
  await hydrateTmdbArtwork(scannedMovies.value,revision)
  if (revision === scanRevision) await hydrateArtwork(videos,revision)
}

async function hydrateArtwork(videos: Awaited<ReturnType<typeof scanVideoSources>>['videos'], revision: number) {
  if (!sdk?.mediaImageCreate || !videos.length) return
  const pending = videos.filter(video => {
    const source = preferredCoverSource({
      custom:!!customCovers.value[video.path],
      tmdb:remoteArtworkPaths.has(video.path),
      sidecar:!!video.coverPath,
    })
    return source === 'sidecar' || source === 'thumbnail'
  })
  if (!pending.length) return
  artworkProgress.value = { completed:0, total:pending.length }
  const shared = new Map<string,Promise<MediaImage>>()
  let cursor = 0

  async function createFor(video: (typeof videos)[number]): Promise<MediaImage> {
    const key = video.coverPath ? `file:${video.coverPath}` : `thumbnail:${video.path}`
    let task = shared.get(key)
    if (!task) {
      task = video.coverPath
        ? sdk!.mediaImageCreate!({ type:'file', path:video.coverPath }, { width:600, height:900, fit:'cover', format:'jpeg', storage:'cache' })
            .catch(() => sdk!.mediaImageCreate!({ type:'thumbnail', path:video.path, size:768 }, { width:600, height:900, fit:'cover', format:'jpeg', storage:'cache' }))
        : sdk!.mediaImageCreate!({ type:'thumbnail', path:video.path, size:768 }, { width:600, height:900, fit:'cover', format:'jpeg', storage:'cache' })
      shared.set(key, task)
    }
    return task
  }

  async function worker() {
    while (cursor < pending.length && revision === scanRevision) {
      const video = pending[cursor++]
      try {
        const image = await createFor(video)
        if (revision !== scanRevision || customCovers.value[video.path] || remoteArtworkPaths.has(video.path)) continue
        scannedMovies.value = scannedMovies.value.map(item => item.path === video.path
          ? { ...item, artwork:{ src:image.url, x:50, y:50, mode:'cover' as const } }
          : item)
      } catch {
        // A codec or platform without a thumbnail keeps the neutral placeholder.
      } finally {
        if (revision === scanRevision && artworkProgress.value) artworkProgress.value = {
          completed:Math.min(artworkProgress.value.completed + 1, artworkProgress.value.total),
          total:artworkProgress.value.total,
        }
      }
    }
  }

  await Promise.all(Array.from({ length:Math.min(3, pending.length) }, () => worker()))
  if (revision === scanRevision) artworkProgress.value = null
  syncScanShelfItems()
}

async function hydrateTmdbArtwork(items: LibraryItem[], revision: number) {
  if (!sdk?.mediaImageCreate || revision !== scanRevision) return { imported:0, failed:0 }
  type Job = { id:string; path?:string; kind:'poster'|'still'; url:string; width:number; height:number }
  const jobs:Job[] = []
  for (const item of items) {
    const poster = tmdbImageUrl(item.tmdbPosterPath,'w500')
    if (poster && item.path && preferredCoverSource({ custom:!!customCovers.value[item.path], tmdb:true }) === 'tmdb') {
      jobs.push({ id:item.id, path:item.path, kind:'poster', url:poster, width:600, height:900 })
    }
    const still = tmdbImageUrl(item.tmdbStillPath,'w780')
    if (still) jobs.push({ id:item.id, path:item.path, kind:'still', url:still, width:640, height:360 })
  }
  if (!jobs.length) return { imported:0, failed:0 }
  tmdbArtworkProgress.value = { completed:0, total:jobs.length }
  const shared = new Map<string,Promise<MediaImage>>()
  let cursor = 0
  let imported = 0
  let failed = 0
  let networkDenied = false

  async function worker(limit = Number.POSITIVE_INFINITY) {
    let processed = 0
    while (cursor < jobs.length && revision === scanRevision && processed < limit) {
      processed += 1
      const job = jobs[cursor++]
      try {
        const key = `${job.url}|${job.width}x${job.height}`
        let task = shared.get(key)
        if (!task) {
          task = sdk!.mediaImageCreate!({ type:'url', url:job.url }, {
            width:job.width, height:job.height, fit:'cover', format:'jpeg', storage:'cache',
          })
          shared.set(key,task)
        }
        const image = await task
        if (revision !== scanRevision) return
        if (job.kind === 'poster' && job.path) remoteArtworkPaths.add(job.path)
        scannedMovies.value = scannedMovies.value.map(item => item.id !== job.id ? item
          : job.kind === 'still'
            ? { ...item, previewImageSrc:image.url }
            : item.path && preferredCoverSource({ custom:!!customCovers.value[item.path], tmdb:true }) === 'tmdb'
              ? { ...item, artwork:{ src:image.url, x:50, y:50, mode:'cover' as const } }
              : item)
        imported += 1
      } catch (error) {
        failed += 1
        if (/network permission|not granted|declined|E_NEEDS_NETWORK/i.test(error instanceof Error ? error.message : String(error))) networkDenied = true
        console.warn(`[Media Library] Could not import TMDB ${job.kind}:`, error)
      } finally {
        if (revision === scanRevision && tmdbArtworkProgress.value) tmdbArtworkProgress.value = {
          completed:Math.min(tmdbArtworkProgress.value.completed + 1,tmdbArtworkProgress.value.total),
          total:tmdbArtworkProgress.value.total,
        }
      }
    }
  }

  // Let the first image-host request finish its consent flow before issuing other
  // image URLs. Otherwise each exact URL can queue a separate permission question.
  await worker(1)
  if (!networkDenied) await Promise.all(Array.from({ length:Math.min(3,jobs.length-cursor) }, () => worker()))
  if (revision === scanRevision) tmdbArtworkProgress.value = null
  syncScanShelfItems()
  return { imported, failed }
}

function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index > 0 ? path.slice(0,index) : path
}

// The file itself, selected in a GExplorer pane (sdk.reveal: a click here is the user's own gesture).
function showMediaFile(item: LibraryItem) {
  if (item.path) void sdk?.reveal?.(item.path)
}

function updateSynopsis(value: string) {
  if (openItem.value) void updateLocalMetadata(openItem.value,{ synopsis:value })
}

function updateTitle(value: string) {
  if (openItem.value) void updateLocalMetadata(openItem.value,{ title:value })
}

function openTmdbReviews(item: LibraryItem) {
  const url = tmdbReviewsUrl(item)
  if (url) void sdk?.openUrl?.(url,{ title:`${item.title} reviews on TMDB` })
}

async function updateGenres(value: string[]) {
  const item = openItem.value
  if (!item) return
  const seriesItems = item.seriesTitle
    ? scannedMovies.value.filter(candidate => candidate.seriesTitle === item.seriesTitle && candidate.path)
    : []
  if (seriesItems.length < 2 || !sdk?.ui) {
    await updateLocalMetadata(item,{ genres:value })
    return
  }
  const result = await sdk.ui().messageBox({
    title:'Apply genres to the whole series?',
    message:`${item.seriesTitle} has ${seriesItems.length} local episodes.`,
    detail:`Use ${value.join(', ')} for this episode only, or for every episode in the series.`,
    buttons:[
      { label:'Cancel', cancel:true },
      { label:'This episode', id:'episode' },
      { label:'Whole series', id:'series', default:true },
    ],
  })
  if (result.button === 'series') await updateLocalMetadataItems(seriesItems,{ genres:value })
  else if (result.button === 'episode') await updateLocalMetadata(item,{ genres:value })
}

async function replaceCustomCover(item: LibraryItem, image: MediaImage, focus = { x:50, y:50 }) {
  if (!item.path) return
  const previous = savedCoverAssetId(customCovers.value[item.path])
  customCovers.value = { ...customCovers.value, [item.path]:{ assetId:image.assetId, url:image.url, x:focus.x, y:focus.y } }
  scannedMovies.value = scannedMovies.value.map(candidate => candidate.path === item.path
    ? { ...candidate, artwork:{ src:image.url, x:focus.x, y:focus.y, mode:'cover' as const } }
    : candidate)
  syncScanShelfItems()
  await persistCustomCovers()
  saveConfig({ sources:sources.value, customCovers:customCovers.value }, { libraryMode:libraryMode.value })
  if (previous && previous !== image.assetId && sdk?.mediaImageDelete) {
    const stillUsed = Object.entries(customCovers.value).some(([path,value]) => path !== item.path && savedCoverAssetId(value) === previous)
    if (!stillUsed) void sdk.mediaImageDelete(previous).catch(() => {})
  }
}

async function removeCustomArtwork(item: LibraryItem) {
  if (!item.path || !customCovers.value[item.path]) return
  const path = item.path
  const previous = savedCoverAssetId(customCovers.value[path])
  const next = { ...customCovers.value }
  delete next[path]
  customCovers.value = next
  scannedMovies.value = scannedMovies.value.map(candidate => candidate.path === path
    ? { ...candidate, artwork:{ src:'', x:0, y:0, mode:'placeholder' as const } }
    : candidate)
  await persistCustomCovers()
  saveConfig({ sources:sources.value, customCovers:customCovers.value }, { libraryMode:libraryMode.value })
  if (previous && sdk?.mediaImageDelete) {
    const stillUsed = Object.values(customCovers.value).some(value => savedCoverAssetId(value) === previous)
    if (!stillUsed) void sdk.mediaImageDelete(previous).catch(() => {})
  }
  const refreshed = scannedMovies.value.find(candidate => candidate.path === path)
  if (refreshed?.tmdbPosterPath) await hydrateTmdbArtwork([refreshed],scanRevision)
  else {
    const video = scanShelf.value?.videos.find(candidate => candidate.path === path)
    if (video) await hydrateArtwork([video],scanRevision)
  }
  syncScanShelfItems()
}

async function useTmdbArtwork(item: LibraryItem) {
  if (!item.path || !item.tmdbPosterPath) return
  if (customCovers.value[item.path]) {
    await removeCustomArtwork(item)
    return
  }
  const path = item.path
  scannedMovies.value = scannedMovies.value.map(candidate => candidate.path === path
    ? { ...candidate, artwork:{ src:'', x:0, y:0, mode:'placeholder' as const } }
    : candidate)
  const refreshed = scannedMovies.value.find(candidate => candidate.path === path)
  if (refreshed) await hydrateTmdbArtwork([refreshed],scanRevision)
  syncScanShelfItems()
}

async function chooseCoverFile(target?: LibraryItem) {
  const item = target ?? player.value?.item
  const ui = sdk?.ui?.()
  if (!item?.path || !ui?.openFiles || !sdk?.mediaImageCreate || coverBusy.value) return
  const paths = await ui.openFiles({
    title:`Choose cover for ${item.title}`,
    startIn:directoryOf(item.path),
    multiple:false,
    acceptLabel:'Use as cover',
    access:'read',
    filters:[{ label:'Images', extensions:['jpg','jpeg','png','gif','bmp','tif','tiff'] }],
  })
  if (!paths?.[0]) return
  coverBusy.value = true
  try {
    const image = await sdk.mediaImageCreate({ type:'file', path:paths[0] }, { width:600, height:900, fit:'cover', format:'jpeg', storage:'persistent' })
    await replaceCustomCover(item,image)
    playerCoverMenu.value = null
    void ui.snack({ id:'media-library-cover', dedupe:'replace', text:`Cover updated for ${item.title}.`, timeoutMs:3200 })
  } catch (error) {
    void ui.snack({ id:'media-library-cover', dedupe:'replace', text:`Could not use that cover: ${error instanceof Error ? error.message : String(error)}`, timeoutMs:6000 })
  } finally {
    coverBusy.value = false
  }
}

async function manageArtwork(item: LibraryItem) {
  const ui = sdk?.ui?.()
  if (!item.path || !ui) return
  const tmdbLabel = item.tmdbPosterPath ? 'Use TMDB artwork' : 'Query TMDB'
  const result = await ui.messageBox({
    title:`Artwork for ${item.title}`,
    message:'Choose where this title’s artwork should come from.',
    detail:'A movie frame opens playback so you can seek to the exact image before saving it.',
    buttons:[
      { label:'Cancel', cancel:true },
      { label:tmdbLabel, id:'tmdb' },
      { label:'Choose image', id:'image' },
      { label:'Choose movie frame', id:'frame', default:true },
    ],
  })
  if (result.button === 'image') await chooseCoverFile(item)
  else if (result.button === 'frame') {
    await play(item)
    void ui.snack({ id:'media-library-cover-frame', dedupe:'replace', text:'Seek to the frame you want, then choose “Use current frame as cover”.', timeoutMs:6500 })
  } else if (result.button === 'tmdb') {
    if (item.tmdbPosterPath) await useTmdbArtwork(item)
    else {
      if (!tmdbSecret.value.set) await promptTmdbSecret()
      if (tmdbSecret.value.set) await queryTmdb(item,true)
    }
  }
}

async function captureCurrentFrame() {
  const item = player.value?.item
  const video = playerElement.value
  const ui = sdk?.ui?.()
  if (!item?.path || !video || !sdk?.mediaVideoFramesCreate || coverBusy.value) return
  coverBusy.value = true
  try {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !Number.isFinite(video.currentTime)) throw new Error('Wait until the movie picture is visible, then try again.')
    const result = await sdk.mediaVideoFramesCreate(
      { path:item.path, timesMs:[Math.max(0,Math.round(video.currentTime * 1000))] },
      { width:1280, fit:'contain', format:'jpeg', storage:'persistent' },
    )
    const frame = result.frames[0]
    if (!frame?.image) throw new Error(frame?.message || frame?.error || 'The current frame could not be decoded.')
    video.pause()
    coverFocusDraft.value = { item, image:frame.image, x:50, y:50 }
    playerCoverMenu.value = null
  } catch (error) {
    void ui?.snack({ id:'media-library-cover', dedupe:'replace', text:`Could not capture this frame: ${error instanceof Error ? error.message : String(error)}`, timeoutMs:6500 })
  } finally {
    coverBusy.value = false
  }
}

function setCoverFocus(event: PointerEvent) {
  const draft = coverFocusDraft.value
  if (!draft) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  draft.x = Math.max(0,Math.min(100,((event.clientX-bounds.left)/bounds.width)*100))
  draft.y = Math.max(0,Math.min(100,((event.clientY-bounds.top)/bounds.height)*100))
}

function dragCoverFocus(event: PointerEvent) {
  if (event.buttons === 1) setCoverFocus(event)
}

function moveCoverFocus(event: KeyboardEvent) {
  const draft = coverFocusDraft.value
  if (!draft || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 3
  if (event.key === 'ArrowLeft') draft.x = Math.max(0,draft.x-step)
  if (event.key === 'ArrowRight') draft.x = Math.min(100,draft.x+step)
  if (event.key === 'ArrowUp') draft.y = Math.max(0,draft.y-step)
  if (event.key === 'ArrowDown') draft.y = Math.min(100,draft.y+step)
}

async function saveCoverFocus() {
  const draft = coverFocusDraft.value
  if (!draft || coverBusy.value) return
  coverBusy.value = true
  try {
    await replaceCustomCover(draft.item,draft.image,{ x:Math.round(draft.x), y:Math.round(draft.y) })
    coverFocusDraft.value = null
    void sdk?.ui?.().snack({ id:'media-library-cover', dedupe:'replace', text:`Current frame saved as the cover for ${draft.item.title}.`, timeoutMs:3500 })
  } catch (error) {
    void sdk?.ui?.().snack({ id:'media-library-cover', dedupe:'replace', text:`Could not save this cover: ${error instanceof Error ? error.message : String(error)}`, timeoutMs:6500 })
  } finally {
    coverBusy.value = false
  }
}

function cancelCoverFocus() {
  const draft = coverFocusDraft.value
  coverFocusDraft.value = null
  if (draft && sdk?.mediaImageDelete) void sdk.mediaImageDelete(draft.image.assetId).catch(() => {})
}
function playerError() {
  const item = player.value?.item
  if (!item?.path) return
  void sdk?.ui?.().snack({
    id:'media-library-codec', dedupe:'replace',
    text:'This video format or codec is not supported by the embedded player.', timeoutMs:6000,
    actions:sdk?.openPath ? [{ label:'Open with default app', onClick:() => { void sdk.openPath!(item.path!) } }] : undefined,
  })
}
function closePlayer() {
  playerElement.value?.pause()
  cancelCoverFocus()
  player.value = null
  playerCoverMenu.value = null
  releasePlayerQuiet?.()
  releasePlayerQuiet = null
}
async function ensurePreviewStream(item: LibraryItem) {
  if (!item?.path || !sdk?.mintStreamHttp || previewStream.value?.itemId === item.id) return
  const revision = ++previewRevision
  try {
    const stream = await sdk.mintStreamHttp(item.path, videoMime(item.mimeType ?? ''))
    if (revision === previewRevision && openItem.value?.id === item.id) previewStream.value = { itemId:item.id, url:stream.url }
  } catch {
    // Unsupported codecs keep the artwork motion instead of interrupting browsing.
  }
}

function ensurePreviewFrames(item: LibraryItem): Promise<void> {
  if (!item.path || !sdk?.mediaVideoFramesCreate || !item.previews.length) return Promise.resolve()
  const path = item.path
  const existing = previewFrames.value[path]
  if (existing && !existing.loading && existing.images.some(Boolean)) return Promise.resolve()
  const pending = previewFrameRequests.get(path)
  if (pending) return pending

  const timesMs = item.previews.map(cue => Math.max(0,Math.round(cue.seconds * 1000)))
  previewFrames.value = {
    ...previewFrames.value,
    [path]:{ images:existing?.images ?? [], loading:true, message:'' },
  }
  const task = sdk.mediaVideoFramesCreate(
    { path, timesMs },
    { width:640, height:360, fit:'cover', format:'jpeg', storage:'cache' },
  ).then(result => {
    const images = timesMs.map(time => result.frames.find(frame => frame.requestedMs === time)?.image?.url ?? '')
    const count = images.filter(Boolean).length
    const failures = result.frames.filter(frame => !frame.image)
    if (failures.length) console.warn(`[Media Library] ${failures.length} scene frame(s) unavailable for ${item.title}:`, failures)
    previewFrames.value = {
      ...previewFrames.value,
      [path]:{
        images,
        loading:false,
        message:count === timesMs.length ? 'Hover or focus to play' : count ? `${count} of ${timesMs.length} scene stills ready · hover to play` : 'Scene stills unavailable · hover to play',
      },
    }
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    previewFrames.value = {
      ...previewFrames.value,
      [path]:{ images:existing?.images ?? [], loading:false, message:'Scene stills unavailable · hover to play' },
    }
    console.warn(`[Media Library] Could not prepare scene stills for ${item.title}:`, error)
    if ((error as { code?:string })?.code === 'E_UNSUPPORTED') {
      void sdk.ui?.().snack({ id:'media-library-ffmpeg', dedupe:'replace', text:message, timeoutMs:7000 })
    }
  }).finally(() => {
    previewFrameRequests.delete(path)
  })
  previewFrameRequests.set(path,task)
  return task
}
function preview(index: number | null) {
  activePreview.value = index
}

async function matchTmdb() {
  if (!sdk?.networkFetch || !tmdbSecret.value.set || !scannedMovies.value.length || tmdbState.value === 'matching') return
  const revision = scanRevision
  tmdbState.value = 'matching'
  tmdbMessage.value = ''
  try {
    const matchItems = flattenLibraryExtras(scannedMovies.value).map(item => {
      const withoutLocalFlag = item.localMetadataOverride ? { ...item, localMetadataOverride:false } : item
      return item.path ? applyPersistedTmdbMetadata(withoutLocalFlag,tmdbMetadata.value[item.path]) : withoutLocalFlag
    })
    const result = await enrichWithTmdb(sdk,matchItems,progress => { tmdbProgress.value = progress })
    if (revision !== scanRevision) return
    const records = { ...tmdbMetadata.value }
    for (const item of result.items) {
      const metadata = persistedTmdbMetadata(item)
      if (item.path && metadata) records[item.path] = metadata
    }
    scannedMovies.value = bundleMovieExtras(result.items.map(item => item.path ? applyMetadataOverride(item,metadataOverrides.value[item.path]) : item))
    tmdbMetadata.value = records
    await persistTmdbMetadata()
    const artwork = await hydrateTmdbArtwork(result.items,revision)
    if (revision !== scanRevision) return
    tmdbState.value = 'ready'
    tmdbMessage.value = `${result.matched} matched${result.unmatched ? ` · ${result.unmatched} unmatched` : ''}${artwork.imported ? ` · ${artwork.imported} images` : ''}${artwork.failed ? ` · ${artwork.failed} image failures` : ''}`
    syncScanShelfItems()
    void sdk.ui?.().snack({ id:'media-library-tmdb', dedupe:'replace', text:`TMDB metadata matched ${result.matched} ${result.matched === 1 ? 'title' : 'titles'}.`, timeoutMs:4000 })
  } catch (error) {
    tmdbState.value = 'error'
    tmdbMessage.value = error instanceof Error ? error.message : String(error)
    void sdk.ui?.().snack({ id:'media-library-tmdb', dedupe:'replace', text:tmdbMessage.value, timeoutMs:6000 })
  }
}

async function queryTmdb(item: LibraryItem, preferArtwork = false) {
  if (!sdk?.networkFetch || !tmdbSecret.value.set || tmdbQueryBusy.value) return
  const revision = scanRevision
  tmdbQueryBusy.value = true
  try {
    const attempts = await diagnoseTmdbItem(sdk,item)
    const matched = attempts.find(attempt => attempt.chosen)
    const label = matched?.chosen?.title || matched?.chosen?.name
    if (matched) {
      const current = scannedMovies.value.find(candidate => candidate.path && candidate.path === item.path) ?? item
      const withoutLocalFlag = current.localMetadataOverride ? { ...current, localMetadataOverride:false } : current
      const base = current.path ? applyPersistedTmdbMetadata(withoutLocalFlag,tmdbMetadata.value[current.path]) : withoutLocalFlag
      const result = await enrichWithTmdb(sdk,[base])
      if (revision !== scanRevision) return
      const providerItem = result.items[0]
      const metadata = persistedTmdbMetadata(providerItem)
      if (result.matched && providerItem && current.path && metadata) {
        tmdbMetadata.value = { ...tmdbMetadata.value, [current.path]:metadata }
        const applied = applyMetadataOverride(providerItem,metadataOverrides.value[current.path])
        scannedMovies.value = scannedMovies.value.map(candidate => candidate.path === current.path ? applied : candidate)
        await persistTmdbMetadata()
        await hydrateTmdbArtwork([providerItem],revision)
        if (preferArtwork && providerItem.tmdbPosterPath) await useTmdbArtwork(applied)
        syncScanShelfItems()
        tmdbState.value = 'ready'
        tmdbMessage.value = `Applied ${label || 'the TMDB match'} (${matched.validation.resultYear || 'year unknown'})${preferArtwork && providerItem.tmdbPosterPath ? ' with its TMDB artwork' : ''}. The diagnostic was logged to the console.`
      } else {
        tmdbMessage.value = `The diagnostic found ${label || 'a candidate'}, but the enrichment pass rejected it. Both queries were logged to the console.`
      }
    } else {
      tmdbMessage.value = `Debug query returned no acceptable match across ${attempts.length} ${attempts.length === 1 ? 'query' : 'queries'}. Request parameters and response bodies were logged to the console.`
    }
    void sdk.ui?.().snack({ id:'media-library-tmdb-debug', dedupe:'replace', text:tmdbMessage.value, timeoutMs:7000 })
  } catch (error) {
    tmdbMessage.value = error instanceof Error ? error.message : String(error)
    void sdk.ui?.().snack({ id:'media-library-tmdb-debug', dedupe:'replace', text:`TMDB debug query failed: ${tmdbMessage.value}`, timeoutMs:7000 })
  } finally {
    tmdbQueryBusy.value = false
  }
}

async function refreshTmdbSecret() {
  if (!sdk?.secrets) { tmdbSecret.value = { set:false }; return }
  try {
    tmdbSecret.value = await sdk.secrets().status(TMDB_SECRET_NAME)
  } catch (error) {
    tmdbSecret.value = { set:false }
    console.warn('[Media Library] Could not read TMDB secret status:',error)
  }
}

async function promptTmdbSecret() {
  if (!sdk?.secrets || tmdbSecretBusy.value) return
  tmdbSecretBusy.value = true
  tmdbMessage.value = ''
  try {
    const result = await sdk.secrets().prompt({
      name:TMDB_SECRET_NAME,
      label:'TMDB API Read Access Token',
      hosts:[...TMDB_SECRET_HOSTS],
    })
    if (result.saved) {
      await refreshTmdbSecret()
      tmdbState.value = 'idle'
      tmdbMessage.value = 'TMDB token saved securely by GEM Shell.'
    }
  } catch (error) {
    tmdbState.value = 'error'
    tmdbMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    tmdbSecretBusy.value = false
  }
}

async function forgetTmdbToken() {
  if (!sdk?.secrets || tmdbSecretBusy.value) return
  tmdbSecretBusy.value = true
  try {
    await sdk.secrets().delete(TMDB_SECRET_NAME)
    await refreshTmdbSecret()
    tmdbState.value = 'idle'
    tmdbMessage.value = 'TMDB token removed.'
  } catch (error) {
    tmdbState.value = 'error'
    tmdbMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    tmdbSecretBusy.value = false
  }
}

function openPlayerCoverMenu(event: MouseEvent) {
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).closest('.media-library-player')?.getBoundingClientRect()
  if (!bounds) return
  playerCoverMenu.value = {
    x:Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 190)),
    y:Math.max(56, Math.min(event.clientY - bounds.top, bounds.height - 190)),
  }
}
function setPlaybackRate(rate: number) {
  if (playerElement.value) playerElement.value.playbackRate = rate
  playerCoverMenu.value = null
}
function outsideMenu(event: PointerEvent) {
  if (libraryMenu.value?.open && event.target instanceof Node && !libraryMenu.value.contains(event.target)) libraryMenu.value.removeAttribute('open')
  if (playerCoverMenu.value && event.target instanceof Element && !event.target.closest('.media-library-player-cover-menu')) playerCoverMenu.value = null
}
function sourceLabel(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
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
  const target = browse.value?.querySelector<HTMLElement>(`[data-shelf-id="${genreJump.value}"]`)
  target?.scrollIntoView({ behavior:'smooth', block:'start' })
}
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (coverFocusDraft.value) cancelCoverFocus()
  else if (player.value) closePlayer()
  else if (openId.value) closeDetail()
  else if (canNavigateBack.value) void navigateBack()
  else return   // CHANGED (2026-10-23): nothing to close here: Escape goes on to the shell
  event.stopPropagation()
}
onMounted(async () => {
  document.addEventListener('pointerdown', outsideMenu, true)
  await Promise.all([loadSources(),loadKnownMedia(),loadCustomCovers(),loadTmdbMetadata(),loadLocalMetadata(),refreshTmdbSecret()])
  void scanSources()
})
onBeforeUnmount(() => {
  scanRevision += 1
  closePlayer()
  document.removeEventListener('pointerdown', outsideMenu, true)
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
      <div class="media-library-search" role="search"><span aria-hidden="true">⌕</span><input v-model="query" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" :spellcheck="false" placeholder="Find a movie or genre" aria-label="Find a movie or genre" /><button v-if="query" type="button" aria-label="Clear search" @click="query = ''">×</button></div>
      <div class="media-library-tools">
        <label class="media-library-genres">
          <span aria-hidden="true">▦</span>
          <select v-model="genreJump" aria-label="Jump to a genre" @change="jumpToGenre">
            <option value="">Genres</option>
            <option v-for="genre in genres" :key="genre" :value="genre.toLocaleLowerCase().split(' ').join('-')">{{ genre }}</option>
          </select>
        </label>
        <details ref="libraryMenu" class="media-library-menu">
          <summary aria-label="Open media library settings" title="Media library settings"><span aria-hidden="true">⚙</span></summary>
          <div class="media-library-menu-panel">
            <div class="media-library-menu-tabs" role="tablist" aria-label="Settings sections">
              <button type="button" role="tab" :aria-selected="libraryMenuTab === 'display'" :class="{ active:libraryMenuTab === 'display' }" @click="libraryMenuTab = 'display'"><span aria-hidden="true">◫</span>Display</button>
              <button type="button" role="tab" :aria-selected="libraryMenuTab === 'library'" :class="{ active:libraryMenuTab === 'library' }" @click="libraryMenuTab = 'library'"><span aria-hidden="true">▦</span>Library</button>
            </div>
            <section v-if="libraryMenuTab === 'display'" class="media-library-menu-tab-panel" role="tabpanel" aria-label="Display settings">
              <p class="media-library-menu-label">Library view</p>
              <div class="media-library-mode media-library-display-mode" role="group" aria-label="Library display mode">
                <button type="button" :class="{ active:libraryMode === 'shelf' }" @click="setLibraryMode('shelf')"><span aria-hidden="true">▰</span>Shelves</button>
                <button type="button" :class="{ active:libraryMode === 'store' }" @click="setLibraryMode('store')"><span aria-hidden="true">⌂</span>Showroom</button>
              </div>
              <p class="media-library-menu-label media-library-detail-label">Focused title</p>
              <div class="media-library-mode" role="group" aria-label="Focused title display mode">
                <button type="button" :class="{ active:detailMode === 'classic' }" @click="setDetailMode('classic')"><span aria-hidden="true">▤</span>Classic</button>
                <button type="button" :class="{ active:detailMode === 'movie-store' }" @click="setDetailMode('movie-store')"><span aria-hidden="true">◉</span>Movie store</button>
              </div>
            </section>
            <section v-else class="media-library-menu-tab-panel" role="tabpanel" aria-label="Media library settings">
              <div class="media-library-source-heading"><p class="media-library-menu-label">Media sources</p><small>{{ sources.length }}</small></div>
              <ul v-if="sources.length" class="media-library-sources">
                <li v-for="source in sources" :key="source" :title="source"><span><b>{{ sourceLabel(source) }}</b><small>{{ source }}</small></span><button type="button" :aria-label="`Remove ${sourceLabel(source)}`" @click="removeSource(source)">×</button></li>
              </ul>
              <p v-else class="media-library-no-sources">No folders selected yet.</p>
              <p v-if="scanWarnings.length" class="media-library-scan-note" :title="scanWarnings.join('\n')">{{ scanWarnings.length }} folder {{ scanWarnings.length === 1 ? 'warning' : 'warnings' }}</p>
              <p v-if="scanTruncated" class="media-library-scan-note">Scan limit reached; showing the first {{ scannedMovies.length }} videos.</p>
              <p v-if="artworkProgress" class="media-library-scan-note">Preparing artwork {{ artworkProgress.completed }}/{{ artworkProgress.total }}…</p>
              <p v-if="tmdbArtworkProgress" class="media-library-scan-note">Importing TMDB artwork {{ tmdbArtworkProgress.completed }}/{{ tmdbArtworkProgress.total }}…</p>
              <button class="media-library-add-source" type="button" :disabled="!sdk?.ui" @click="addSource"><span aria-hidden="true">＋</span>Add media folder</button>
              <button v-if="sources.length && sdk?.openListing" class="media-library-rescan" type="button" :disabled="scanState === 'scanning'" @click="scanSources(true)"><span aria-hidden="true">↻</span>{{ scanState === 'scanning' ? 'Scanning…' : 'Scan again' }}</button>
              <div class="media-library-source-heading media-library-tmdb-heading"><p class="media-library-menu-label">TMDB metadata</p><small>{{ tmdbState === 'ready' ? '✓' : tmdbState === 'matching' ? '…' : 'β' }}</small></div>
              <div class="media-library-tmdb-secret" :class="{ connected:tmdbSecret.set }">
                <span>{{ tmdbSecret.set ? `Token saved ${tmdbSecret.hint ?? ''}` : 'No API token saved' }}</span>
                <small>{{ tmdbSecret.set ? `Sent only to ${(tmdbSecret.hosts ?? [...TMDB_SECRET_HOSTS]).join(', ')}` : 'Enter it through GEM Shell’s protected field.' }}</small>
              </div>
              <p class="media-library-tmdb-privacy">Stored OS-protected by GEM Shell. This widget never receives the token.</p>
              <div class="media-library-tmdb-actions">
                <button type="button" :disabled="!sdk?.secrets || tmdbSecretBusy || tmdbState === 'matching'" @click="promptTmdbSecret">{{ tmdbSecretBusy ? 'Please wait…' : tmdbSecret.set ? 'Replace token' : 'Connect TMDB' }}</button>
                <button v-if="tmdbSecret.set" type="button" :disabled="tmdbSecretBusy || tmdbState === 'matching'" @click="forgetTmdbToken">Forget token</button>
                <button class="media-library-tmdb-match" type="button" :disabled="!sdk?.networkFetch || !tmdbSecret.set || !scannedMovies.length || tmdbState === 'matching'" @click="matchTmdb">
                  {{ tmdbState === 'matching' ? `Matching ${tmdbProgress?.completed ?? 0}/${tmdbProgress?.total ?? scannedMovies.length}…` : tmdbState === 'ready' ? 'Refresh matches' : 'Match with TMDB' }}
                </button>
              </div>
              <p v-if="tmdbMessage" class="media-library-tmdb-status" :class="{ error:tmdbState === 'error' }">{{ tmdbMessage }}</p>
              <p class="media-library-tmdb-credit"><b>TMDB</b> This product uses the TMDB API but is not endorsed or certified by TMDB. Posters and episode stills are cached by GEM Shell.</p>
            </section>
          </div>
        </details>
      </div>
    </header>

    <main ref="browse" class="media-library-browse" @wheel.stop>
      <div v-if="scanState === 'scanning' && !libraryItems.length" class="media-library-empty media-library-scanning"><span>◌</span><strong>Stocking the shelves</strong><p>{{ scanProgress?.phase === 'metadata' ? 'Reading movie details' : `Searching ${sourceLabel(scanProgress?.current || '')}` }} · {{ scanProgress?.videos ?? 0 }} found</p></div>
      <div v-else-if="!shelves.length" class="media-library-empty"><span>⌕</span><strong>{{ query ? 'No movie found' : scanState === 'error' ? 'Could not scan the library' : 'No videos found' }}</strong><p>{{ query ? 'Try a title, year, or genre.' : scanError || 'Add another folder or scan again.' }}</p><button v-if="query" type="button" @click="query = ''">Clear search</button><button v-else-if="sources.length" type="button" @click="scanSources(true)">Scan again</button></div>
      <StoreFloor
        v-if="libraryMode === 'store'"
        :shelves="genreShelves"
        :items="libraryItems"
        :active-shelf="storeFocusedShelf"
        :selected-id="selectedId"
        @select-shelf="focusStoreShelf"
        @open="open"
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
      />
    </main>

    <LibraryDetail
      v-if="openItem"
      :item="openItem"
      :detail-mode="detailMode"
      :flipped="flipped"
      :active-preview="activePreview"
      :preview-stream-url="previewStream?.itemId === openItem.id ? previewStream.url : null"
      :preview-image-srcs="openPreviewFrames?.images"
      :preview-frames-loading="openPreviewFrames?.loading"
      :preview-frames-message="openPreviewFrames?.message"
      :can-show-in-folder="!!sdk?.reveal"
      @close="closeDetail"
      @flip="flipped = !flipped"
      @preview="preview"
      @play="play(openItem)"
      @play-extra="play"
      @show-in-folder="showMediaFile(openItem)"
      @show-extra-in-folder="showMediaFile"
      @edit-artwork="manageArtwork(openItem)"
      @open-tmdb="openTmdbReviews(openItem)"
      @update-title="updateTitle"
      @update-synopsis="updateSynopsis"
      @update-genres="updateGenres"
    />

    <section v-if="player || playerLoading" class="media-library-player" aria-label="Video player">
      <header>
        <button type="button" @click="closePlayer"><span aria-hidden="true">‹</span> Back to store</button>
        <strong>{{ player?.item.title || 'Preparing movie…' }}</strong>
        <div class="media-library-player-actions">
          <button v-if="player?.item.path && sdk?.mediaVideoFramesCreate" type="button" :disabled="coverBusy" @click="captureCurrentFrame">Use current frame as cover</button>
          <button v-if="player?.item.path && sdk?.mediaImageCreate" type="button" :disabled="coverBusy" @click="chooseCoverFile()">Choose image…</button>
          <button v-if="player?.item.path && sdk?.openPath" type="button" @click="sdk.openPath(player.item.path)">Open externally</button>
        </div>
      </header>
      <div v-if="playerLoading" class="media-library-player-loading"><span>◌</span>Preparing playback…</div>
      <video v-else-if="player" :key="player.url" ref="playerElement" crossorigin="anonymous" :src="player.url" :aria-label="player.item.title" controls autoplay controlslist="nodownload" @contextmenu="openPlayerCoverMenu" @error="playerError"></video>
      <div v-if="coverFocusDraft" class="media-library-cover-editor" role="dialog" aria-modal="true" aria-label="Choose the cover area">
        <div class="media-library-cover-editor-panel">
          <header><div><strong>Choose the cover area</strong><small>Click or drag to keep the important part visible on the case.</small></div></header>
          <div class="media-library-cover-editor-body">
            <div
              class="media-library-cover-frame"
              role="application"
              tabindex="0"
              aria-label="Choose the focal point. Arrow keys move it; hold Shift for larger steps."
              @pointerdown.prevent="setCoverFocus"
              @pointermove="dragCoverFocus"
              @keydown="moveCoverFocus"
            >
              <img :src="coverFocusDraft.image.url" alt="Extracted movie frame" draggable="false" />
              <span class="media-library-cover-focus" :style="{ left:`${coverFocusDraft.x}%`, top:`${coverFocusDraft.y}%` }" aria-hidden="true"></span>
            </div>
            <div class="media-library-cover-sample"><span :style="{ backgroundImage:`url(${coverFocusDraft.image.url})`, backgroundPosition:`${coverFocusDraft.x}% ${coverFocusDraft.y}%` }"></span><small>Case preview</small></div>
          </div>
          <footer><button type="button" :disabled="coverBusy" @click="cancelCoverFocus">Cancel</button><button type="button" class="primary" :disabled="coverBusy" @click="saveCoverFocus">{{ coverBusy ? 'Saving…' : 'Use this area' }}</button></footer>
        </div>
      </div>
      <div v-if="playerCoverMenu && player" class="media-library-player-cover-menu" :style="{ left:`${playerCoverMenu.x}px`, top:`${playerCoverMenu.y}px` }">
        <p>Use artwork from a file or the exact frame currently on screen.</p>
        <button type="button" :disabled="coverBusy || !sdk?.mediaVideoFramesCreate" @click="captureCurrentFrame">{{ coverBusy ? 'Saving cover…' : 'Use current frame as cover' }}</button>
        <button type="button" :disabled="coverBusy || !sdk?.mediaImageCreate" @click="chooseCoverFile()">Choose an image file…</button>
        <span>Playback speed</span>
        <div><button v-for="rate in [.75,1,1.25,1.5,2]" :key="rate" type="button" @click="setPlaybackRate(rate)">{{ rate }}×</button></div>
      </div>
    </section>
  </section>
</template>

<style src="./media-library.css"></style>
