<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { startRename } from 'gexplorer/widgets'
import ArtworkFrame from './ArtworkFrame.vue'
import { extraDisplayName, formatCue, formatRuntime, formatYear, type LibraryItem } from './types'

const props = defineProps<{
  item: LibraryItem
  detailMode?: 'classic' | 'movie-store'
  flipped: boolean
  activePreview: number | null
  previewStreamUrl?: string | null
  previewImageSrcs?: string[]
  previewFramesLoading?: boolean
  previewFramesMessage?: string
  canShowInFolder?: boolean
  /** Thumbnails of the extras, by media path. */
  extraThumbs?: Record<string, string>
  /** The file can be opened with the system's default app. */
  canOpenExternally?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'flip'): void
  (e: 'play'): void
  (e: 'play-from-start'): void
  (e: 'play-extra', item: LibraryItem): void
  (e: 'show-in-folder'): void
  /** Open the file with the system's default app (another player). */
  (e: 'open-external'): void
  (e: 'show-extra-in-folder', item: LibraryItem): void
  (e: 'edit-artwork'): void
  (e: 'open-tmdb'): void
  (e: 'update-title', value: string): void
  (e: 'update-synopsis', value: string): void
  (e: 'update-genres', value: string[]): void
  (e: 'preview', index: number | null): void
}>()

const previewReady = ref(false)
const previewProgress = ref(0)
const previewError = ref('')
const pendingPreview = ref<number | null>(null)
const editingSynopsis = ref(false)
const synopsisDraft = ref('')
const editingGenres = ref(false)
const genresDraft = ref('')
const storeTitle = ref<HTMLElement | null>(null)
const ejecting = ref(false)
const storePalette = ref({ base:'#29343a', accent:'#b97645', text:'#f8f1e6' })
let previewStart = 0
let previewEnd = 0
let previewTimer: number | undefined
let ejectTimer: number | undefined
let stallTimer: number | undefined
let paletteRevision = 0
const PREVIEW_SECONDS = 8
/** Hover must rest this long before a decoder is started (sweeping across tiles starts none). */
const PREVIEW_HOVER_MS = 220
/** A preview not playing by then is abandoned for this title: slow seeks or heavy codecs stop retrying. */
const PREVIEW_STALL_MS = 6000

// One live preview decoder at a time, released explicitly. A <video> removed from the page keeps
// decoding and holding its stream connection until garbage collection; rapid hovers on a heavy
// file used to pile them up (GPU and the stream server's connections) and freeze the UI.
let liveVideo: HTMLVideoElement | null = null

function releaseVideo(video: HTMLVideoElement) {
  try {
    video.pause()
    video.removeAttribute('src')
    video.load()
  } catch {
    // Already torn down.
  }
}

function bindPreviewVideo(element: unknown) {
  const video = element instanceof HTMLVideoElement ? element : null
  if (video === liveVideo) return   // function refs run again on every re-render
  if (liveVideo) releaseVideo(liveVideo)
  liveVideo = video
  window.clearTimeout(stallTimer)
  if (video) stallTimer = window.setTimeout(previewStalled, PREVIEW_STALL_MS)
}

function previewStalled() {
  if (previewReady.value || !liveVideo) return
  previewError.value = 'Motion preview is too slow for this file'
  console.warn(`[Media Library] ${previewError.value}: ${props.item.title}`)
  stopAllPreview()
}

function stopAllPreview() {
  window.clearTimeout(previewTimer)
  window.clearTimeout(stallTimer)
  pendingPreview.value = null
  if (liveVideo) releaseVideo(liveVideo)
  previewReady.value = false
  previewProgress.value = 0
  emit('preview', null)
}

const resumeLabel = computed(() => props.item.resumeSeconds ? `Resume at ${formatPosition(props.item.resumeSeconds)}` : '')
const backdropSource = computed(() => props.previewImageSrcs?.find(Boolean) || props.item.previewImageSrc || '')
const tmdbRatingPercent = computed(() => `${Math.max(0,Math.min(100,(props.item.tmdbRating ?? 0) * 10))}%`)
const hasTmdbPage = computed(() => Number.isInteger(props.item.tmdbId) && Number(props.item.tmdbId) > 0 && !!props.item.tmdbType)
const activeStorePreview = computed(() => {
  const index = props.activePreview
  if (index === null) return null
  const cue = props.item.previews[index]
  return cue ? { cue, index } : null
})
const storeStyle = computed(() => ({
  '--store-base':storePalette.value.base,
  '--store-accent':storePalette.value.accent,
  '--store-text':storePalette.value.text,
}))
const storeBackdropStyle = computed(() => backdropSource.value
  ? { backgroundImage:`linear-gradient(180deg,#06080a3d,#06080a9e), url(${JSON.stringify(backdropSource.value)})` }
  : undefined)

/** An extra's file name, without its folder and extension. */
function fileName(extra: LibraryItem) {
  return (extra.path?.split(/[\\/]/).pop() ?? extra.title).replace(/\.[^.]+$/, '')
}

function formatPosition(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash,16777619)
  }
  return hash >>> 0
}

function fallbackPalette() {
  const hash = stableHash(props.item.path || props.item.id)
  const hue = hash % 360
  const accent = (hue + 37 + ((hash >>> 8) % 56)) % 360
  return { base:`hsl(${hue} 28% 22%)`, accent:`hsl(${accent} 48% 53%)`, text:'#fff8ea' }
}

function channel(value: number) {
  return Math.max(0,Math.min(255,Math.round(value)))
}

function loadArtworkPalette() {
  const revision = ++paletteRevision
  storePalette.value = fallbackPalette()
  const src = props.item.artwork.src
  if (!src) return
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => {
    if (revision !== paletteRevision) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 24
      canvas.height = 24
      const context = canvas.getContext('2d',{ willReadFrequently:true })
      if (!context) return
      context.drawImage(image,0,0,24,24)
      const pixels = context.getImageData(0,0,24,24).data
      let red = 0
      let green = 0
      let blue = 0
      let weight = 0
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] < 80) continue
        red += pixels[offset]
        green += pixels[offset + 1]
        blue += pixels[offset + 2]
        weight += 1
      }
      if (!weight) return
      red /= weight
      green /= weight
      blue /= weight
      const base = [channel(red * .62),channel(green * .62),channel(blue * .62)]
      const accent = [channel(red * 1.24 + 24),channel(green * 1.24 + 24),channel(blue * 1.24 + 24)]
      const luminance = (.2126 * base[0] + .7152 * base[1] + .0722 * base[2]) / 255
      storePalette.value = {
        base:`rgb(${base.join(' ')})`,
        accent:`rgb(${accent.join(' ')})`,
        text:luminance > .58 ? '#15120f' : '#fff8ea',
      }
    } catch {
      // Some remote artwork cannot be sampled; the title-derived palette remains stable.
    }
  }
  image.src = src
}

function storePreviewStyle(index: number) {
  // Scene tiles stay in the top half: the description box (bottom 6%, at most 42% high) starts
  // at 52% at the highest. Tile height = width × 10/16 × 2/3 of the case height.
  const layouts = [
    { left:5, top:6, width:38 },
    { left:57, top:5, width:35 },
    { left:9, top:28, width:30 },
    { left:63, top:29, width:29 },
  ]
  const layout = layouts[index % layouts.length]
  const hash = stableHash(`${props.item.path || props.item.id}:${index}`)
  const scene = props.previewImageSrcs?.[index] || props.item.previewImageSrc
  const image = scene || (!props.item.path ? props.item.artwork.src : '')
  return {
    left:`${layout.left + (hash % 5) - 2}%`,
    top:`${layout.top + ((hash >>> 4) % 5) - 2}%`,
    width:`${layout.width + ((hash >>> 8) % 5) - 2}%`,
    transform:`rotate(${((hash >>> 12) % 13) - 6}deg)`,
    backgroundImage:image ? `url(${JSON.stringify(image)})` : undefined,
    backgroundSize:scene ? 'contain' : 'cover',
  }
}

function playMedia() {
  if (ejecting.value) return
  if (props.detailMode !== 'movie-store' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    emit('play')
    return
  }
  ejecting.value = true
  window.clearTimeout(ejectTimer)
  ejectTimer = window.setTimeout(() => {
    ejecting.value = false
    emit('play')
  },680)
}

function cueTime(video: HTMLVideoElement, seconds: number) {
  return Number.isFinite(video.duration) ? Math.min(seconds, Math.max(0, video.duration - .25)) : seconds
}

function previewBackground(index: number) {
  const src = props.previewImageSrcs?.[index] || props.item.previewImageSrc || props.item.artwork.src
  return src ? { backgroundImage:`url(${src})` } : undefined
}

function preparePreview(event: Event, seconds: number, index: number) {
  const video = event.currentTarget as HTMLVideoElement
  const target = cueTime(video, seconds)
  previewStart = target
  previewEnd = Number.isFinite(video.duration) ? Math.min(video.duration - .05,target + PREVIEW_SECONDS) : target + PREVIEW_SECONDS
  previewProgress.value = 0
  const alreadyDecoded = Math.abs(video.currentTime - target) < .1 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  if (alreadyDecoded) {
    previewSeeked(event,index)
    return
  }
  try { video.currentTime = target } catch { /* wait for a seekable range */ }
}

function previewStyle(tone: string, index: number) {
  return {
    '--preview-tone':tone,
    '--preview-progress':activeProgress(index),
  }
}

function activeProgress(index: number) {
  return props.activePreview === index ? String(previewProgress.value) : '0'
}

function queuePreview(index: number) {
  if ((props.item.path && !props.previewStreamUrl) || previewError.value) return
  pendingPreview.value = index
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    if (pendingPreview.value === index) {
      if (!props.item.path) previewReady.value = true
      emit('preview', index)
    }
  }, PREVIEW_HOVER_MS)
}

function previewSeeked(event: Event, index: number) {
  const video = event.currentTarget as HTMLVideoElement
  if (video !== liveVideo) return
  window.clearTimeout(stallTimer)
  previewReady.value = true
  void video.play().catch(() => { /* hover playback depends on codec support */ })
}

function updatePreviewProgress(event: Event, index: number) {
  if (props.activePreview !== index || !previewReady.value) return
  const video = event.currentTarget as HTMLVideoElement
  const span = Math.max(.1,previewEnd-previewStart)
  if (video.currentTime >= previewEnd) {
    previewProgress.value = 0
    try { video.currentTime = previewStart } catch { return }
    return
  }
  previewProgress.value = Math.max(0,Math.min(1,(video.currentTime-previewStart)/span))
}

function stopPreview() {
  stopAllPreview()
}

function beginSynopsisEdit() {
  synopsisDraft.value = props.item.synopsis
  editingGenres.value = false
  editingSynopsis.value = true
}

async function beginTitleRename() {
  if (!props.item.path || !storeTitle.value) return
  editingGenres.value = false
  editingSynopsis.value = false
  try {
    await startRename(storeTitle.value, {
      value:props.item.title,
      selectAll:true,
      maxWidth:280,
      validate:value => value.trim() ? null : 'A title is needed.',
      onCommit:value => {
        const title = value.trim()
        if (title && title !== props.item.title) emit('update-title',title)
      },
    })
  } catch (error) {
    console.warn('[Media Library] Could not start inline title editing:',error)
  }
}

function saveSynopsis() {
  emit('update-synopsis',synopsisDraft.value.trim())
  editingSynopsis.value = false
}

function beginGenresEdit() {
  genresDraft.value = props.item.genres.join(', ')
  editingSynopsis.value = false
  editingGenres.value = true
}

function saveGenres() {
  const genres = genresDraft.value.split(',').map(genre => genre.trim()).filter((genre,index,all) => !!genre && all.findIndex(candidate => candidate.toLocaleLowerCase() === genre.toLocaleLowerCase()) === index)
  if (!genres.length) return
  emit('update-genres',genres)
  editingGenres.value = false
}

function previewFailed(event: Event) {
  const code = (event.currentTarget as HTMLVideoElement).error?.code
  previewError.value = code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
    ? 'Motion preview unavailable for this codec'
    : code === MediaError.MEDIA_ERR_NETWORK
      ? 'Preview stream could not be read'
      : 'Preview could not be loaded'
  stopAllPreview()
  console.warn(`[Media Library] ${previewError.value}: ${props.item.title} (media error ${code ?? 'unknown'})`)
}

watch(() => [props.item.id, props.previewStreamUrl] as const, () => {
  window.clearTimeout(previewTimer)
  window.clearTimeout(stallTimer)
  if (liveVideo) releaseVideo(liveVideo)
  previewReady.value = false
  previewProgress.value = 0
  previewError.value = ''
  pendingPreview.value = null
  editingSynopsis.value = false
  editingGenres.value = false
  ejecting.value = false
  window.clearTimeout(ejectTimer)
  loadArtworkPalette()
}, { immediate:true })

onBeforeUnmount(() => {
  window.clearTimeout(previewTimer)
  window.clearTimeout(ejectTimer)
  window.clearTimeout(stallTimer)
  if (liveVideo) releaseVideo(liveVideo)
  liveVideo = null
  paletteRevision += 1
})
</script>

<template>
  <article class="glu-detail" :class="{ 'movie-store':detailMode === 'movie-store', ejecting }" :style="storeStyle" :aria-label="`${item.title} details`">
    <header class="glu-detail-header">
      <button type="button" class="glu-back-icon" aria-label="Back" title="Back" @click="emit('close')"><span aria-hidden="true">←</span></button>
      <span>From {{ item.primaryGenre }}</span>
      <span aria-hidden="true"></span>
    </header>
    <div class="glu-detail-body">
      <aside v-if="detailMode === 'movie-store'" class="glu-store-controls" aria-label="Media controls">
        <button type="button" class="primary" :disabled="ejecting" :title="resumeLabel || undefined" @click="playMedia"><span aria-hidden="true">▶</span><b>{{ item.resumeSeconds ? 'Resume' : item.watched ? 'Watch again' : 'Play' }}</b></button>
        <button v-if="item.resumeSeconds" type="button" @click="emit('play-from-start')"><span aria-hidden="true">⏮</span><b>Start over</b></button>
        <button v-if="item.path && canOpenExternally" type="button" title="Open with your default video app" @click="emit('open-external')"><span aria-hidden="true">⧉</span><b>Default app</b></button>
        <button v-if="item.path && canShowInFolder" type="button" @click="emit('show-in-folder')"><span aria-hidden="true">⌖</span><b>Show media file</b></button>
      </aside>
      <div class="glu-detail-case-wrap">
        <span v-if="detailMode === 'movie-store'" class="glu-dvd-disc" aria-hidden="true"><i></i></span>
        <div class="glu-detail-case-stage">
          <button
            type="button"
            class="glu-detail-case"
            :class="{ flipped }"
            :aria-label="flipped ? `Show the front of ${item.title}` : `Turn ${item.title} over for its synopsis`"
            @click="emit('flip')"
          >
            <span class="glu-detail-face glu-detail-front">
              <ArtworkFrame :artwork="item.artwork" :alt="`${item.title} front artwork`" />
              <span class="glu-detail-title"><strong>{{ item.title }}</strong><small>A GEM VIDEO SELECTION</small></span>
            </span>
            <span class="glu-detail-face glu-detail-back">
              <template v-if="detailMode === 'movie-store'">
                <span v-if="backdropSource" class="glu-store-backdrop" :style="storeBackdropStyle" aria-hidden="true"></span>
                <span
                  v-for="(cue, index) in item.previews"
                  :key="`back-${cue.seconds}`"
                  class="glu-store-back-preview"
                  :class="{ playing:activePreview === index }"
                  :style="storePreviewStyle(index)"
                  role="img"
                  :aria-label="`${cue.label} preview at ${formatCue(cue.seconds)}`"
                  @pointerenter.stop="queuePreview(index)"
                  @pointerleave.stop="stopPreview()"
                  @click.stop
                >
                  <small>{{ activePreview === index ? (previewReady ? 'Playing' : 'Loading…') : cue.label }}</small>
                  <i v-if="activePreview === index" :style="{ transform:`scaleX(${activeProgress(index)})` }" aria-hidden="true"></i>
                </span>
                <span class="glu-store-back-copy">
                  <small>{{ item.genres.join(' · ') }}</small>
                  <strong ref="storeTitle" data-rename-row>{{ item.title }}</strong>
                  <span>{{ item.synopsis }}</span>
                  <b>{{ formatYear(item.year) }} · {{ formatRuntime(item.runtimeMinutes) }} · {{ item.rating }}</b>
                </span>
              </template>
              <template v-else>
                <span class="glu-back-kicker">{{ item.genres.join(' · ') }}</span>
                <strong>{{ item.title }}</strong>
                <span>{{ item.synopsis }}</span>
                <small>{{ formatYear(item.year) }} · {{ formatRuntime(item.runtimeMinutes) }} · {{ item.rating }}</small>
                <i aria-hidden="true"></i>
              </template>
            </span>
          </button>
          <span
            v-if="detailMode === 'movie-store' && flipped && item.path && previewStreamUrl && !previewError && activeStorePreview"
            :key="`store-player-${item.id}:${activeStorePreview.index}`"
            class="glu-store-preview-player"
            :style="storePreviewStyle(activeStorePreview.index)"
            aria-hidden="true"
          >
            <video
              :ref="bindPreviewVideo"
              crossorigin="anonymous"
              :src="previewStreamUrl"
              :class="{ ready:previewReady }"
              muted
              playsinline
              preload="metadata"
              controlslist="nodownload"
              disablepictureinpicture
              @loadedmetadata="preparePreview($event, activeStorePreview.cue.seconds, activeStorePreview.index)"
              @seeked="previewSeeked($event, activeStorePreview.index)"
              @timeupdate="updatePreviewProgress($event,activeStorePreview.index)"
              @error="previewFailed"
              @contextmenu.prevent
            ></video>
            <small>{{ previewReady ? 'Playing' : 'Loading…' }}</small>
            <i :style="{ transform:`scaleX(${activeProgress(activeStorePreview.index)})` }"></i>
          </span>
          <div v-if="detailMode === 'movie-store' && flipped && item.path" class="glu-store-edit-tools" aria-label="Edit case details" @click.stop>
            <button type="button" title="Rename title" aria-label="Rename title" @click="beginTitleRename">T</button>
            <button type="button" title="Edit genres locally" aria-label="Edit genres locally" @click="beginGenresEdit">G</button>
            <button type="button" title="Edit synopsis locally" aria-label="Edit synopsis locally" @click="beginSynopsisEdit">¶</button>
          </div>
          <form v-if="detailMode === 'movie-store' && flipped && editingGenres" class="glu-store-editor" aria-label="Edit genres" @click.stop @submit.prevent="saveGenres">
            <label for="glu-store-genres">Genres</label>
            <input id="glu-store-genres" v-model="genresDraft" autofocus aria-label="Genres separated by commas" @keydown.escape.prevent="editingGenres = false" />
            <div><button type="submit" class="primary">Save</button><button type="button" @click="editingGenres = false">Cancel</button></div>
          </form>
          <form v-if="detailMode === 'movie-store' && flipped && editingSynopsis" class="glu-store-editor glu-store-synopsis-editor" aria-label="Edit synopsis" @click.stop @submit.prevent="saveSynopsis">
            <label for="glu-store-synopsis">Synopsis</label>
            <textarea id="glu-store-synopsis" v-model="synopsisDraft" rows="6" autofocus aria-label="Local media description" @keydown.escape.prevent="editingSynopsis = false"></textarea>
            <div><button type="submit" class="primary">Save</button><button type="button" @click="editingSynopsis = false">Cancel</button></div>
          </form>
        </div>
        <button v-if="item.path" type="button" class="glu-artwork-edit" title="Change artwork" aria-label="Change artwork" @click="emit('edit-artwork')">✎</button>
        <button v-if="detailMode !== 'movie-store'" type="button" class="glu-turn" @click="emit('flip')">{{ flipped ? 'Show front' : 'Turn case over' }}</button>
      </div>

      <aside v-if="detailMode === 'movie-store'" class="glu-store-rating" aria-label="TMDB rating">
        <button v-if="hasTmdbPage" type="button" title="Read reviews on TMDB" @click="emit('open-tmdb')">
          <span class="glu-rating-stars" aria-hidden="true"><i :style="{ width:tmdbRatingPercent }">★★★★★</i>★★★★★</span>
          <strong>{{ item.tmdbRating ? item.tmdbRating.toFixed(1) : '—' }}<small>/10</small></strong>
          <span>TMDB rating</span>
          <em>Read reviews ↗</em>
        </button>
        <div v-else class="glu-store-rating-static">
          <span class="glu-rating-stars" aria-hidden="true">★★★★★</span>
          <strong>Not rated</strong>
          <small>Match this title with TMDB to see its rating.</small>
        </div>
        <section v-if="item.extras?.length" class="glu-store-extras-panel" aria-label="Extras">
          <header><span>Extras</span><small>{{ item.extras.length }}</small></header>
          <div class="glu-store-extra-tiles">
            <div v-for="extra in item.extras" :key="extra.id" class="glu-store-extra">
              <span class="glu-store-extra-caption" :title="fileName(extra)">{{ extraDisplayName(extra, item.title) }}</span>
              <div
                class="glu-store-extra-chip"
                :class="{ bare:!extraThumbs?.[extra.path ?? ''] }"
                :style="extraThumbs?.[extra.path ?? ''] ? { backgroundImage:`url(${JSON.stringify(extraThumbs[extra.path ?? ''])})` } : undefined"
              >
                <button type="button" class="glu-store-extra-play" :aria-label="`Play ${extraDisplayName(extra, item.title)}`" :title="`Play ${fileName(extra)}`" @click="emit('play-extra', extra)">
                  <span class="glu-store-extra-icon" aria-hidden="true">▶</span>
                  <small>{{ formatRuntime(extra.runtimeMinutes) }}</small>
                </button>
                <button v-if="extra.path && canShowInFolder" type="button" class="glu-store-extra-find" :aria-label="`Show ${extraDisplayName(extra, item.title)} in GExplorer`" title="Show in GExplorer" @click="emit('show-extra-in-folder', extra)"><span aria-hidden="true">⌖</span><b>Find</b></button>
              </div>
            </div>
          </div>
        </section>
      </aside>

      <div v-if="detailMode !== 'movie-store'" class="glu-detail-copy">
        <p class="glu-eyebrow">{{ item.seriesTitle ? `${item.seriesTitle} · Season ${item.seasonNumber}` : item.primaryGenre }} · {{ formatYear(item.year) }}</p>
        <h1>{{ item.title }}</h1>
        <p class="glu-meta">{{ formatRuntime(item.runtimeMinutes) }} <span>•</span> {{ item.rating }} <template v-if="item.tmdbRating"><span>•</span> ★ {{ item.tmdbRating.toFixed(1) }}</template> <template v-if="item.watched"><span>•</span> ✓ Watched</template> <span v-if="item.resolution">•</span> {{ item.resolution }} <span>•</span> {{ item.genres.join(', ') }} <button v-if="item.path" type="button" class="glu-edit-icon" title="Edit genres locally" aria-label="Edit genres locally" @click="beginGenresEdit">✎</button></p>
        <div v-if="editingGenres" class="glu-local-editor glu-genre-editor">
          <input v-model="genresDraft" aria-label="Genres separated by commas" @keydown.enter.prevent="saveGenres" @keydown.escape.prevent="editingGenres = false" />
          <button type="button" class="primary" @click="saveGenres">Save</button><button type="button" @click="editingGenres = false">Cancel</button>
        </div>
        <div v-if="!editingSynopsis" class="glu-synopsis-row">
          <p class="glu-synopsis">{{ item.synopsis }}</p>
          <button v-if="item.path" type="button" class="glu-edit-icon" title="Edit description locally" aria-label="Edit description locally" @click="beginSynopsisEdit">✎</button>
        </div>
        <div v-else class="glu-local-editor glu-synopsis-editor">
          <textarea v-model="synopsisDraft" rows="5" aria-label="Local media description" @keydown.escape.prevent="editingSynopsis = false"></textarea>
          <div><button type="button" class="primary" @click="saveSynopsis">Save</button><button type="button" @click="editingSynopsis = false">Cancel</button></div>
        </div>
        <p v-if="item.metadataSource === 'tmdb'" class="glu-metadata-credit">{{ item.localMetadataOverride ? 'Base metadata supplied by TMDB · local edits applied.' : 'Metadata supplied by TMDB.' }}</p>
        <div class="glu-actions">
          <button type="button" class="primary" :title="resumeLabel || undefined" @click="playMedia">{{ item.resumeSeconds ? `▶ ${resumeLabel}` : item.mediaKind === 'episode' ? '▶ Play episode' : '▶ Play movie' }}</button>
          <button v-if="item.resumeSeconds" type="button" @click="emit('play-from-start')">⏮ Start over</button>
          <button v-if="item.path && canOpenExternally" type="button" title="Open with your default video app" @click="emit('open-external')">⧉ Open in default app</button>
          <button v-if="item.path && canShowInFolder" type="button" @click="emit('show-in-folder')">Show media file</button>
        </div>

        <section v-if="item.extras?.length" class="glu-extras" aria-label="Movie extras">
          <div class="glu-extras-heading"><h2>Extras</h2><span>{{ item.extras.length }} {{ item.extras.length === 1 ? 'video' : 'videos' }} found beside this movie</span></div>
          <div class="glu-extra-list">
            <article v-for="extra in item.extras" :key="extra.id" class="glu-extra">
              <div><strong>{{ extra.title }}</strong><small>{{ formatRuntime(extra.runtimeMinutes) }}<template v-if="extra.resolution"> · {{ extra.resolution }}</template></small></div>
              <div class="glu-extra-actions"><button type="button" class="primary" @click="emit('play-extra',extra)">▶ Play</button><button v-if="extra.path && canShowInFolder" type="button" @click="emit('show-extra-in-folder',extra)">Show file</button></div>
            </article>
          </div>
        </section>

        <section class="glu-previews" aria-label="Scene previews">
          <div class="glu-preview-heading"><h2>Look inside</h2><span>{{ previewError || previewFramesMessage || (previewFramesLoading ? 'Preparing scene stills…' : item.path ? 'Hover or focus to play' : 'Artwork preview') }}</span></div>
          <div class="glu-preview-grid">
            <button
              v-for="(cue, index) in item.previews"
              :key="cue.seconds"
              type="button"
              class="glu-preview"
              :class="{ playing: activePreview === index }"
              :style="previewStyle(cue.tone,index)"
              :aria-label="`Preview ${cue.label} at ${formatCue(cue.seconds)}`"
              @pointerenter="queuePreview(index)"
              @pointerleave="stopPreview()"
              @focus="queuePreview(index)"
              @blur="stopPreview()"
            >
              <ArtworkFrame v-if="!item.path" :artwork="item.artwork" :alt="`${item.title}, ${cue.label}`" wide />
              <span
                v-else
                class="glu-preview-frame"
                :class="{ loading:previewFramesLoading && !(previewImageSrcs?.[index] || item.previewImageSrc || item.artwork.src) }"
                :style="previewBackground(index)"
                role="img"
                :aria-label="`${cue.label} frame from ${item.title}`"
              ></span>
              <video
                v-if="item.path && previewStreamUrl && activePreview === index && !previewError"
                :key="`${item.id}:${index}`"
                :ref="bindPreviewVideo"
                crossorigin="anonymous"
                :src="previewStreamUrl"
                :class="{ ready:previewReady }"
                muted
                playsinline
                preload="metadata"
                controlslist="nodownload"
                disablepictureinpicture
                @loadedmetadata="preparePreview($event, cue.seconds, index)"
                @seeked="previewSeeked($event, index)"
                @timeupdate="updatePreviewProgress($event,index)"
                @error="previewFailed"
                @contextmenu.prevent
              ></video>
              <span class="glu-preview-vignette" aria-hidden="true"></span>
              <span class="glu-preview-label"><b>{{ activePreview === index ? (previewReady ? (item.path ? 'Playing' : 'Preview motion') : 'Loading…') : cue.label }}</b><small>{{ formatCue(cue.seconds) }}</small></span>
              <i v-if="activePreview === index" aria-hidden="true"></i>
            </button>
          </div>
        </section>
      </div>
    </div>
  </article>
</template>
