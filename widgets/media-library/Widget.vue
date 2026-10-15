<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MediaImage, SecretStatus, WidgetSdk } from 'gexplorer/widgets'
import { LibraryDetail, MediaShelf, type LibraryItem } from '../../shared/library-ui'
import { posterAtlases, sampleMovies } from './fixtures'
import { createScannedLibrary, shelvesFor } from './media'
import { scanVideoSources, videoMime, type ScanProgress } from './scanner'
import {
  applyPersistedTmdbMetadata, enrichWithTmdb, persistedTmdbMetadata,
  TMDB_SECRET_HOSTS, TMDB_SECRET_NAME, tmdbImageUrl,
  type PersistedTmdbMetadata, type TmdbProgress,
} from './tmdb'

type LibraryMode = 'shelf' | 'rack'
type SavedCover = { assetId:string; url:string; x?:number; y?:number }
type CoverPreference = string | SavedCover
type SavedCoverStore = { version:1; covers:Record<string,CoverPreference> }
type TmdbMetadataStore = { version:1; records:Record<string,PersistedTmdbMetadata> }
type PreviewFrameState = { images:string[]; loading:boolean; message:string }
type CoverFocusDraft = { item:LibraryItem; image:MediaImage; x:number; y:number }
type MediaLibraryConfig = {
  data?: { selectedId?: string; sources?: string[]; customCovers?: Record<string,CoverPreference> }
  view?: { atmosphere?: boolean; libraryMode?: LibraryMode }
}
const props = defineProps<{
  sourceId?: string
  config?: MediaLibraryConfig
  placement?: { context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'; size?: { width?: number; height?: number } }
  runAction?: (action: { type: 'open'; path: string }) => void
}>()
const emit = defineEmits<{ (e:'event', value:{ type:string; payload:unknown }):void }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const query = ref('')
const selectedId = ref(props.config?.data?.selectedId || sampleMovies[0].id)
const sources = ref<string[]>([...(props.config?.data?.sources ?? [])])
const customCovers = ref<Record<string,CoverPreference>>({ ...(props.config?.data?.customCovers ?? {}) })
const tmdbMetadata = ref<Record<string,PersistedTmdbMetadata>>({})
const tmdbSecret = ref<SecretStatus>({ set:false })
const tmdbSecretBusy = ref(false)
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
const libraryMode = ref<LibraryMode>(props.config?.view?.libraryMode ?? 'shelf')
const genreJump = ref('')
const openId = ref<string | null>(null)
const flipped = ref(false)
const activePreview = ref<number | null>(null)
const previewStream = ref<{ itemId:string; url:string } | null>(null)
const previewFrames = ref<Record<string,PreviewFrameState>>({})
const browse = ref<HTMLElement | null>(null)
const libraryMenu = ref<HTMLDetailsElement | null>(null)
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
let sidecarMediaPaths = new Set<string>()
const remoteArtworkPaths = new Set<string>()
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

watch(() => props.config?.data?.sources, value => {
  const next = [...(value ?? [])]
  if (JSON.stringify(next) === JSON.stringify(sources.value)) return
  sources.value = next
  void scanSources()
})
watch(() => props.config?.view?.libraryMode, value => { if (value) libraryMode.value = value })
function saveConfig(data: MediaLibraryConfig['data'], view: MediaLibraryConfig['view']) {
  const existingData = { ...props.config?.data } as MediaLibraryConfig['data'] & { tmdbToken?: string }
  // Remove credentials saved by early development builds while preserving the
  // user's media folders, selection, and custom-cover preferences.
  delete existingData.tmdbToken
  emit('event', { type:'update:config', payload:{ ...props.config, data:{ ...existingData, sources:sources.value, customCovers:customCovers.value, ...data }, view:{ ...props.config?.view, ...view } } })
}

function open(item: LibraryItem) {
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
  } else if (item.path) props.runAction?.({ type:'open', path:item.path })
  else void sdk?.ui?.().snack({ id:'media-library-sample', dedupe:'replace', text:`${item.title} is sample media in this design milestone.`, timeoutMs:3500 })
  emit('event', { type:'media-library:play', payload:{ id:item.id, title:item.title } })
}
function setLibraryMode(mode: LibraryMode) {
  libraryMode.value = mode
  saveConfig({ sources:sources.value }, { libraryMode:mode })
  libraryMenu.value?.removeAttribute('open')
}
async function addSource() {
  const ui = sdk?.ui?.()
  if (!ui) return
  const path = await ui.pickFolder({ title:'Add a media source', startIn:sources.value[sources.value.length - 1], access:'read' })
  if (!path || sources.value.includes(path)) return
  sources.value = [...sources.value, path]
  saveConfig({ sources:sources.value }, { libraryMode:libraryMode.value })
  libraryMenu.value?.removeAttribute('open')
  void scanSources()
  void ui.snack({ id:'media-library-source', dedupe:'replace', text:`Added ${sourceLabel(path)}. Looking for videos now.`, timeoutMs:3200 })
}
function removeSource(path: string) {
  sources.value = sources.value.filter(source => source !== path)
  saveConfig({ sources:sources.value }, { libraryMode:libraryMode.value })
  void scanSources()
}
async function scanSources() {
  const revision = ++scanRevision
  artworkProgress.value = null
  tmdbArtworkProgress.value = null
  sidecarMediaPaths = new Set<string>()
  remoteArtworkPaths.clear()
  scannedMovies.value = []
  scanWarnings.value = []
  scanTruncated.value = false
  scanError.value = ''
  if (!sources.value.length || !sdk?.openListing) { scanState.value = 'idle'; return }
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
    sidecarMediaPaths = new Set(result.videos.filter(video => video.coverPath).map(video => video.path))
    const coverUrls = new Map<string,string>()
    scannedMovies.value = createScannedLibrary(result.videos, posterAtlases, coverUrls).map(item => {
      const enriched = item.path ? applyPersistedTmdbMetadata(item,tmdbMetadata.value[item.path]) : item
      const artwork = item.path ? savedCoverArtwork(customCovers.value[item.path]) : undefined
      if (item.path && enriched.tmdbPosterPath && !sidecarMediaPaths.has(item.path) && !artwork) remoteArtworkPaths.add(item.path)
      return artwork ? { ...enriched, artwork } : enriched
    })
    scanWarnings.value = result.warnings
    scanTruncated.value = result.truncated
    scanState.value = 'ready'
    if (scannedMovies.value.length && !scannedMovies.value.some(item => item.id === selectedId.value)) selectedId.value = scannedMovies.value[0].id
    void hydrateArtwork(result.videos, revision)
    void hydrateTmdbArtwork(scannedMovies.value,revision)
  } catch (error) {
    if (revision !== scanRevision) return
    scanError.value = error instanceof Error ? error.message : String(error)
    scanState.value = 'error'
  }
}

async function hydrateArtwork(videos: Awaited<ReturnType<typeof scanVideoSources>>['videos'], revision: number) {
  if (!sdk?.mediaImageCreate || !videos.length) return
  const pending = videos.filter(video => !customCovers.value[video.path] && !remoteArtworkPaths.has(video.path))
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
}

async function hydrateTmdbArtwork(items: LibraryItem[], revision: number) {
  if (!sdk?.mediaImageCreate || revision !== scanRevision) return { imported:0, failed:0 }
  type Job = { id:string; path?:string; kind:'poster'|'still'; url:string; width:number; height:number }
  const jobs:Job[] = []
  for (const item of items) {
    const poster = tmdbImageUrl(item.tmdbPosterPath,'w500')
    if (poster && item.path && !customCovers.value[item.path] && !sidecarMediaPaths.has(item.path)) {
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

  async function worker() {
    while (cursor < jobs.length && revision === scanRevision) {
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
            : item.path && !customCovers.value[item.path] && !sidecarMediaPaths.has(item.path)
              ? { ...item, artwork:{ src:image.url, x:50, y:50, mode:'cover' as const } }
              : item)
        imported += 1
      } catch (error) {
        failed += 1
        console.warn(`[Media Library] Could not import TMDB ${job.kind}:`, error)
      } finally {
        if (revision === scanRevision && tmdbArtworkProgress.value) tmdbArtworkProgress.value = {
          completed:Math.min(tmdbArtworkProgress.value.completed + 1,tmdbArtworkProgress.value.total),
          total:tmdbArtworkProgress.value.total,
        }
      }
    }
  }

  await Promise.all(Array.from({ length:Math.min(3,jobs.length) }, () => worker()))
  if (revision === scanRevision) tmdbArtworkProgress.value = null
  return { imported, failed }
}

function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index > 0 ? path.slice(0,index) : path
}

async function replaceCustomCover(item: LibraryItem, image: MediaImage, focus = { x:50, y:50 }) {
  if (!item.path) return
  const previous = savedCoverAssetId(customCovers.value[item.path])
  customCovers.value = { ...customCovers.value, [item.path]:{ assetId:image.assetId, url:image.url, x:focus.x, y:focus.y } }
  scannedMovies.value = scannedMovies.value.map(candidate => candidate.path === item.path
    ? { ...candidate, artwork:{ src:image.url, x:focus.x, y:focus.y, mode:'cover' as const } }
    : candidate)
  await persistCustomCovers()
  saveConfig({ sources:sources.value, customCovers:customCovers.value }, { libraryMode:libraryMode.value })
  if (previous && previous !== image.assetId && sdk?.mediaImageDelete) {
    const stillUsed = Object.entries(customCovers.value).some(([path,value]) => path !== item.path && savedCoverAssetId(value) === previous)
    if (!stillUsed) void sdk.mediaImageDelete(previous).catch(() => {})
  }
}

async function chooseCoverFile() {
  const item = player.value?.item
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
    actions:props.runAction ? [{ label:'Open with default app', onClick:() => props.runAction?.({ type:'open', path:item.path! }) }] : undefined,
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
    const result = await enrichWithTmdb(sdk,scannedMovies.value,progress => { tmdbProgress.value = progress })
    if (revision !== scanRevision) return
    scannedMovies.value = result.items
    const records = { ...tmdbMetadata.value }
    for (const item of result.items) {
      const metadata = persistedTmdbMetadata(item)
      if (item.path && metadata) records[item.path] = metadata
    }
    tmdbMetadata.value = records
    await persistTmdbMetadata()
    const artwork = await hydrateTmdbArtwork(result.items,revision)
    if (revision !== scanRevision) return
    tmdbState.value = 'ready'
    tmdbMessage.value = `${result.matched} matched${result.unmatched ? ` · ${result.unmatched} unmatched` : ''}${artwork.imported ? ` · ${artwork.imported} images` : ''}${artwork.failed ? ` · ${artwork.failed} image failures` : ''}`
    void sdk.ui?.().snack({ id:'media-library-tmdb', dedupe:'replace', text:`TMDB metadata matched ${result.matched} ${result.matched === 1 ? 'title' : 'titles'}.`, timeoutMs:4000 })
  } catch (error) {
    tmdbState.value = 'error'
    tmdbMessage.value = error instanceof Error ? error.message : String(error)
    void sdk.ui?.().snack({ id:'media-library-tmdb', dedupe:'replace', text:tmdbMessage.value, timeoutMs:6000 })
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
  await nextTick()
  const target = browse.value?.querySelector<HTMLElement>(`[data-shelf-id="${genreJump.value}"]`)
  target?.scrollIntoView({ behavior:'smooth', block:'start' })
}
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (coverFocusDraft.value) cancelCoverFocus()
  else if (player.value) closePlayer()
  else if (openId.value) closeDetail()
  event.stopPropagation()
}
onMounted(async () => {
  document.addEventListener('pointerdown', outsideMenu, true)
  await Promise.all([loadCustomCovers(),loadTmdbMetadata(),refreshTmdbSecret()])
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
    aria-label="Media Library"
    @keydown="keydown"
  >
    <header class="media-library-topbar">
      <div class="media-library-brand"><span aria-hidden="true">◆</span><div><strong>Video Store</strong><small>{{ collectionLabel }}</small></div></div>
      <label class="media-library-search"><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="Find a movie or genre" aria-label="Find a movie or genre" /><button v-if="query" type="button" aria-label="Clear search" @click="query = ''">×</button></label>
      <div class="media-library-tools">
        <label class="media-library-genres">
          <span aria-hidden="true">▦</span>
          <select v-model="genreJump" aria-label="Jump to a genre" @change="jumpToGenre">
            <option value="">Genres</option>
            <option v-for="genre in genres" :key="genre" :value="genre.toLocaleLowerCase().split(' ').join('-')">{{ genre }}</option>
          </select>
        </label>
        <details ref="libraryMenu" class="media-library-menu">
          <summary aria-label="Open library menu" title="Library menu"><span aria-hidden="true">☰</span></summary>
          <div class="media-library-menu-panel">
            <p class="media-library-menu-label">Display</p>
            <div class="media-library-mode" role="group" aria-label="Library display mode">
              <button type="button" :class="{ active:libraryMode === 'shelf' }" @click="setLibraryMode('shelf')"><span aria-hidden="true">▰</span>Shelves</button>
              <button type="button" :class="{ active:libraryMode === 'rack' }" @click="setLibraryMode('rack')"><span aria-hidden="true">▥</span>Case rack</button>
            </div>
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
            <button v-if="sources.length && sdk?.openListing" class="media-library-rescan" type="button" :disabled="scanState === 'scanning'" @click="scanSources"><span aria-hidden="true">↻</span>{{ scanState === 'scanning' ? 'Scanning…' : 'Scan again' }}</button>
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
          </div>
        </details>
      </div>
    </header>

    <main ref="browse" class="media-library-browse">
      <div v-if="scanState === 'scanning' && !libraryItems.length" class="media-library-empty media-library-scanning"><span>◌</span><strong>Stocking the shelves</strong><p>{{ scanProgress?.phase === 'metadata' ? 'Reading movie details' : `Searching ${sourceLabel(scanProgress?.current || '')}` }} · {{ scanProgress?.videos ?? 0 }} found</p></div>
      <div v-else-if="!shelves.length" class="media-library-empty"><span>⌕</span><strong>{{ query ? 'No movie found' : scanState === 'error' ? 'Could not scan the library' : 'No videos found' }}</strong><p>{{ query ? 'Try a title, year, or genre.' : scanError || 'Add another folder or scan again.' }}</p><button v-if="query" type="button" @click="query = ''">Clear search</button><button v-else-if="sources.length" type="button" @click="scanSources">Scan again</button></div>
      <MediaShelf
        v-for="shelf in shelves"
        :key="shelf.id"
        :shelf-id="shelf.id"
        :title="shelf.title"
        :note="shelf.note"
        :items="shelf.items"
        :selected-id="selectedId"
        :display-mode="libraryMode"
        @open="open"
      />
    </main>

    <LibraryDetail
      v-if="openItem"
      :item="openItem"
      :flipped="flipped"
      :active-preview="activePreview"
      :preview-stream-url="previewStream?.itemId === openItem.id ? previewStream.url : null"
      :preview-image-srcs="openPreviewFrames?.images"
      :preview-frames-loading="openPreviewFrames?.loading"
      :preview-frames-message="openPreviewFrames?.message"
      @close="closeDetail"
      @flip="flipped = !flipped"
      @preview="preview"
      @play="play(openItem)"
    />

    <section v-if="player || playerLoading" class="media-library-player" aria-label="Video player">
      <header>
        <button type="button" @click="closePlayer"><span aria-hidden="true">‹</span> Back to store</button>
        <strong>{{ player?.item.title || 'Preparing movie…' }}</strong>
        <div class="media-library-player-actions">
          <button v-if="player?.item.path && runAction" type="button" @click="runAction({ type:'open', path:player.item.path })">Open externally</button>
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
        <button type="button" :disabled="coverBusy || !sdk?.mediaImageCreate" @click="chooseCoverFile">Choose an image file…</button>
        <span>Playback speed</span>
        <div><button v-for="rate in [.75,1,1.25,1.5,2]" :key="rate" type="button" @click="setPlaybackRate(rate)">{{ rate }}×</button></div>
      </div>
    </section>
  </section>
</template>

<style src="./media-library.css"></style>
