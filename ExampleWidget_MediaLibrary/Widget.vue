<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { LibraryDetail, MediaShelf, type LibraryItem } from '../shared/library-ui'
import { posterAtlases, sampleMovies } from './fixtures'
import { createScannedLibrary, shelvesFor } from './media'
import { scanVideoSources, videoMime, type ScanProgress } from './scanner'
import { enrichWithTmdb, type TmdbProgress } from './tmdb'

type LibraryMode = 'shelf' | 'rack'
type MediaLibraryConfig = {
  data?: { selectedId?: string; sources?: string[]; customCovers?: Record<string,string> }
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
const customCovers = ref<Record<string,string>>({ ...(props.config?.data?.customCovers ?? {}) })
// Tokens remain in memory for the life of this widget instance. Ordinary widget
// config is persisted as plain JSON and must not be used for API credentials.
const tmdbToken = ref('')
const tmdbState = ref<'idle'|'matching'|'ready'|'error'>('idle')
const tmdbProgress = ref<TmdbProgress | null>(null)
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
const browse = ref<HTMLElement | null>(null)
const libraryMenu = ref<HTMLDetailsElement | null>(null)
const player = ref<{ item:LibraryItem; url:string; mimeType?:string } | null>(null)
const playerElement = ref<HTMLVideoElement | null>(null)
const playerLoading = ref(false)
const playerCoverMenu = ref<{ x:number; y:number } | null>(null)
const scansRealFolders = computed(() => sources.value.length > 0 && !!sdk?.openListing)
const libraryItems = computed(() => scansRealFolders.value ? scannedMovies.value : sampleMovies)
const shelves = computed(() => shelvesFor(libraryItems.value, query.value))
const genres = computed(() => Array.from(new Set(libraryItems.value.map(item => item.primaryGenre))).sort())
const openItem = computed(() => libraryItems.value.find(item => item.id === openId.value) ?? null)
const collectionLabel = computed(() => scansRealFolders.value
  ? scanState.value === 'scanning'
    ? `${scanProgress.value?.videos ?? 0} found · scanning`
    : `${libraryItems.value.length} ${libraryItems.value.some(item => item.mediaKind === 'episode') ? 'titles' : libraryItems.value.length === 1 ? 'movie' : 'movies'} · local collection`
  : `${sampleMovies.length} movies · sample collection`)
let scanRevision = 0
let previewRevision = 0

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
  void ensurePreviewStream(item)
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
    try {
      const stream = await sdk.mintStreamHttp(item.path, videoMime(item.mimeType ?? ''))
      player.value = { item, url:stream.url, mimeType:stream.mimeType }
    } catch (error) {
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
    const coverUrls = new Map<string,string>()
    scannedMovies.value = createScannedLibrary(result.videos, posterAtlases, coverUrls).map(item => {
      const custom = item.path ? customCovers.value[item.path] : undefined
      const src = custom?.startsWith('data:') ? custom : custom ? coverUrls.get(custom) : undefined
      return src ? { ...item, artwork:{ src, x:0, y:0, mode:'cover' as const } } : item
    })
    scanWarnings.value = result.warnings
    scanTruncated.value = result.truncated
    scanState.value = 'ready'
    if (scannedMovies.value.length && !scannedMovies.value.some(item => item.id === selectedId.value)) selectedId.value = scannedMovies.value[0].id
  } catch (error) {
    if (revision !== scanRevision) return
    scanError.value = error instanceof Error ? error.message : String(error)
    scanState.value = 'error'
  }
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
  player.value = null
  playerCoverMenu.value = null
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
function preview(index: number | null) {
  activePreview.value = index
}

async function matchTmdb() {
  if (!sdk?.networkFetch || !tmdbToken.value.trim() || !scannedMovies.value.length || tmdbState.value === 'matching') return
  tmdbState.value = 'matching'
  tmdbMessage.value = ''
  try {
    const result = await enrichWithTmdb(sdk,scannedMovies.value,tmdbToken.value,progress => { tmdbProgress.value = progress })
    scannedMovies.value = result.items
    tmdbState.value = 'ready'
    tmdbMessage.value = `${result.matched} matched${result.unmatched ? ` · ${result.unmatched} unmatched` : ''}`
    void sdk.ui?.().snack({ id:'media-library-tmdb', dedupe:'replace', text:`TMDB metadata matched ${result.matched} ${result.matched === 1 ? 'title' : 'titles'}.`, timeoutMs:4000 })
  } catch (error) {
    tmdbState.value = 'error'
    tmdbMessage.value = error instanceof Error ? error.message : String(error)
    void sdk.ui?.().snack({ id:'media-library-tmdb', dedupe:'replace', text:tmdbMessage.value, timeoutMs:6000 })
  }
}

function forgetTmdbToken() {
  tmdbToken.value = ''
  tmdbState.value = 'idle'
  tmdbMessage.value = ''
}

function openPlayerCoverMenu(event: MouseEvent) {
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).closest('.media-library-player')?.getBoundingClientRect()
  if (!bounds) return
  playerCoverMenu.value = {
    x:Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 190)),
    y:Math.max(56, Math.min(event.clientY - bounds.top, bounds.height - 122)),
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
  if (player.value) closePlayer()
  else if (openId.value) closeDetail()
  event.stopPropagation()
}
onMounted(() => {
  document.addEventListener('pointerdown', outsideMenu, true)
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
            <button class="media-library-add-source" type="button" :disabled="!sdk?.ui" @click="addSource"><span aria-hidden="true">＋</span>Add media folder</button>
            <button v-if="sources.length && sdk?.openListing" class="media-library-rescan" type="button" :disabled="scanState === 'scanning'" @click="scanSources"><span aria-hidden="true">↻</span>{{ scanState === 'scanning' ? 'Scanning…' : 'Scan again' }}</button>
            <div class="media-library-source-heading media-library-tmdb-heading"><p class="media-library-menu-label">TMDB metadata</p><small>{{ tmdbState === 'ready' ? '✓' : tmdbState === 'matching' ? '…' : 'β' }}</small></div>
            <label class="media-library-tmdb-token">
              <span>API Read Access Token</span>
              <input v-model="tmdbToken" type="password" autocomplete="off" spellcheck="false" placeholder="Bearer token" />
            </label>
            <p class="media-library-tmdb-privacy">Kept in memory only and forgotten when this widget closes.</p>
            <div class="media-library-tmdb-actions">
              <button type="button" :disabled="!sdk?.networkFetch || !tmdbToken.trim() || !scannedMovies.length || tmdbState === 'matching'" @click="matchTmdb">
                {{ tmdbState === 'matching' ? `Matching ${tmdbProgress?.completed ?? 0}/${tmdbProgress?.total ?? scannedMovies.length}…` : tmdbState === 'ready' ? 'Refresh matches' : 'Match with TMDB' }}
              </button>
              <button v-if="tmdbToken" type="button" :disabled="tmdbState === 'matching'" @click="forgetTmdbToken">Forget token</button>
            </div>
            <p v-if="tmdbMessage" class="media-library-tmdb-status" :class="{ error:tmdbState === 'error' }">{{ tmdbMessage }}</p>
            <p class="media-library-tmdb-credit"><b>TMDB</b> This product uses the TMDB API but is not endorsed or certified by TMDB. Poster display awaits Shell image support.</p>
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
      <video v-else-if="player" :key="player.url" ref="playerElement" :src="player.url" :aria-label="player.item.title" controls autoplay controlslist="nodownload" data-gex-suppress-tooltips @contextmenu="openPlayerCoverMenu" @error="playerError"></video>
      <div v-if="playerCoverMenu && player" class="media-library-player-cover-menu" :style="{ left:`${playerCoverMenu.x}px`, top:`${playerCoverMenu.y}px` }">
        <p>Custom covers need Shell thumbnail support.</p>
        <span>Playback speed</span>
        <div><button v-for="rate in [.75,1,1.25,1.5,2]" :key="rate" type="button" @click="setPlaybackRate(rate)">{{ rate }}×</button></div>
      </div>
    </section>
  </section>
</template>

<style src="./media-library.css"></style>
