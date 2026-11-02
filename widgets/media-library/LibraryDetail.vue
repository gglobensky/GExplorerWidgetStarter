<script setup lang="ts">
// widgets/media-library/LibraryDetail.vue
//
// A title, opened. Two looks:
//   - movie-store (the Video Club look): library-ui's StoreDetail (0.11.0, 2026-11-01; the Game Shop's page, made from
//     this one), with what only movies add: the scene previews that play on the back, the extras under the rating,
//     the disc that slides out on Play, the ✎ artwork button, renaming the title (T).
//   - classic: the details page (glu-detail), the Video Club's own.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { startRename } from 'gexplorer/widgets'
import { ArtworkFrame, StoreDetail, formatYear } from '@shared/library-ui'
import { extraDisplayName, formatCue, formatRuntime, type MovieItem } from './movie-types'

const props = defineProps<{
  item: MovieItem
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
  /** NEW (2026-10-26): the host offers a choice of programs (sdk.ui().openWith): the button says "Open with…". */
  openWithChoice?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'flip'): void
  (e: 'play'): void
  (e: 'play-from-start'): void
  (e: 'play-extra', item: MovieItem): void
  (e: 'show-in-folder'): void
  /** Open the file in another app: the default one, or (openWithChoice) a list under <anchor>, the button. */
  (e: 'open-external', anchor?: HTMLElement): void
  (e: 'show-extra-in-folder', item: MovieItem): void
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
let previewStart = 0
let previewEnd = 0
let previewTimer: number | undefined
let ejectTimer: number | undefined
let stallTimer: number | undefined
// Extras under the rating box (movie-store mode): as many square chips as the column holds, then
// pages (‹ 1/3 ›). A page never holds fewer than one; chips still shrink if even one does not fit.
// The extras panel: its column is StoreDetail's right column (glu-sd-side), in the page's body row.
const extrasPanel = ref<HTMLElement | null>(null)
const extrasPage = ref(0)
const extrasPerPage = ref(3)
let extrasObserver: ResizeObserver | undefined
const extrasPages = computed(() => Math.max(1, Math.ceil((props.item.extras?.length ?? 0) / extrasPerPage.value)))
const pagedExtras = computed(() => (props.item.extras ?? []).slice(extrasPage.value * extrasPerPage.value, (extrasPage.value + 1) * extrasPerPage.value))
const EXTRA_GAP = 12
const EXTRA_CAPTION = 17
const EXTRAS_HEADER = 23
const RATING_GAP = 14

function measureExtras() {
  const aside = extrasPanel.value?.closest('.glu-sd-side') as HTMLElement | null | undefined
  const row = aside?.parentElement
  if (!aside || !row) return
  const rating = aside.querySelector<HTMLElement>(':scope > .glu-sd-rating')
  const room = row.clientHeight - (rating?.offsetHeight ?? 0) - RATING_GAP - EXTRAS_HEADER
  // A chip is as tall as the column is wide (square), its name above it.
  const tile = Math.max(56, aside.clientWidth) + EXTRA_CAPTION + EXTRA_GAP
  const fit = Math.max(1, Math.floor((room + EXTRA_GAP) / tile))
  if (fit !== extrasPerPage.value) extrasPerPage.value = fit
}
function turnExtras(step: number) {
  extrasPage.value = (extrasPage.value + step + extrasPages.value) % extrasPages.value
}
let lastExtrasWheel = 0
/** The wheel over the chips turns the pages (one per notch, not a page per pixel of a touchpad). */
function onExtrasWheel(event: WheelEvent) {
  if (extrasPages.value <= 1 || Math.abs(event.deltaY) < 4) return
  event.preventDefault()
  const now = Date.now()
  if (now - lastExtrasWheel < 280) return
  lastExtrasWheel = now
  turnExtras(event.deltaY > 0 ? 1 : -1)
}
watch(extrasPanel, element => {
  extrasObserver?.disconnect()
  extrasObserver = undefined
  const aside = (element as HTMLElement | null)?.closest('.glu-sd-side') as HTMLElement | null | undefined
  if (!aside || typeof ResizeObserver === 'undefined') return
  extrasObserver = new ResizeObserver(() => measureExtras())
  extrasObserver.observe(aside.parentElement ?? aside)
  measureExtras()
})
watch(() => props.item.id, () => { extrasPage.value = 0 })
watch(extrasPages, count => { if (extrasPage.value >= count) extrasPage.value = count - 1 })

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
const storeBackdropStyle = computed(() => backdropSource.value
  ? { backgroundImage:`linear-gradient(180deg,#06080a3d,#06080a9e), url(${JSON.stringify(backdropSource.value)})` }
  : undefined)

/** An extra's file name, without its folder and extension. */
function fileName(extra: MovieItem) {
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
}, { immediate:true })

onBeforeUnmount(() => {
  extrasObserver?.disconnect()
  window.clearTimeout(previewTimer)
  window.clearTimeout(ejectTimer)
  window.clearTimeout(stallTimer)
  if (liveVideo) releaseVideo(liveVideo)
  liveVideo = null
})
</script>

<template>
  <StoreDetail
    v-if="detailMode === 'movie-store'"
    class="vc-store-detail"
    :class="{ ejecting }"
    :item="item"
    :kicker="`From ${item.primaryGenre}`"
    :flipped="flipped"
    @update:flipped="emit('flip')"
    @close="emit('close')"
  >
    <template #controls>
      <button type="button" class="primary" :disabled="ejecting" :title="resumeLabel || undefined" @click="playMedia"><span aria-hidden="true">▶</span><b>{{ item.resumeSeconds ? 'Resume' : item.watched ? 'Watch again' : 'Play' }}</b></button>
      <button v-if="item.resumeSeconds" type="button" @click="emit('play-from-start')"><span aria-hidden="true">⏮</span><b>Start over</b></button>
      <button v-if="item.path && canOpenExternally" type="button" :title="openWithChoice ? 'Open it in another app' : 'Open with your default video app'" @click="emit('open-external', $event.currentTarget as HTMLElement)"><span aria-hidden="true">⧉</span><b>{{ openWithChoice ? 'Open with…' : 'Default app' }}</b></button>
      <button v-if="item.path && canShowInFolder" type="button" @click="emit('show-in-folder')"><span aria-hidden="true">⌖</span><b>Show media file</b></button>
    </template>

    <template #behind>
      <span class="glu-dvd-disc" aria-hidden="true"><i></i></span>
      <button v-if="item.path" type="button" class="glu-artwork-edit" title="Change artwork" aria-label="Change artwork" @click="emit('edit-artwork')">✎</button>
    </template>

    <template #front>
      <span class="glu-detail-title"><strong>{{ item.title }}</strong><small>A GEM VIDEO SELECTION</small></span>
    </template>

    <template #back>
      <span v-if="backdropSource" class="glu-sd-backdrop" :style="storeBackdropStyle" aria-hidden="true"></span>
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
      <span class="glu-sd-back-copy">
        <small>{{ item.genres.join(' · ') }}</small>
        <strong ref="storeTitle" data-rename-row>{{ item.title }}</strong>
        <span>{{ item.synopsis }}</span>
        <b>{{ formatYear(item.year) }} · {{ formatRuntime(item.runtimeMinutes) }} · {{ item.rating }}</b>
      </span>
    </template>

    <template #stage>
      <span
        v-if="flipped && item.path && previewStreamUrl && !previewError && activeStorePreview"
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
      <div v-if="flipped && item.path" class="glu-sd-edit-tools" aria-label="Edit case details" @click.stop>
        <button type="button" title="Rename title" aria-label="Rename title" @click="beginTitleRename">T</button>
        <button type="button" title="Edit genres locally" aria-label="Edit genres locally" @click="beginGenresEdit">G</button>
        <button type="button" title="Edit synopsis locally" aria-label="Edit synopsis locally" @click="beginSynopsisEdit">¶</button>
      </div>
      <form v-if="flipped && editingGenres" class="glu-sd-editor" aria-label="Edit genres" @click.stop @submit.prevent="saveGenres">
        <label for="glu-store-genres">Genres, separated by commas</label>
        <input id="glu-store-genres" v-model="genresDraft" autofocus @keydown.esc.stop.prevent="editingGenres = false" />
        <div><button type="button" @click="editingGenres = false">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>
      <form v-if="flipped && editingSynopsis" class="glu-sd-editor tall" aria-label="Edit synopsis" @click.stop @submit.prevent="saveSynopsis">
        <label for="glu-store-synopsis">Synopsis</label>
        <textarea id="glu-store-synopsis" v-model="synopsisDraft" rows="6" autofocus aria-label="Local media description" @keydown.esc.stop.prevent="editingSynopsis = false"></textarea>
        <div><button type="button" @click="editingSynopsis = false">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>
    </template>

    <template #side>
      <button v-if="hasTmdbPage" type="button" class="glu-sd-rating" title="Read reviews on TMDB" @click="emit('open-tmdb')">
        <span class="glu-sd-stars" aria-hidden="true"><i :style="{ width:tmdbRatingPercent }">★★★★★</i>★★★★★</span>
        <strong>{{ item.tmdbRating ? item.tmdbRating.toFixed(1) : '—' }}<small>/10</small></strong>
        <span>TMDB rating</span>
        <em>Read reviews ↗</em>
      </button>
      <div v-else class="glu-sd-rating static">
        <span class="glu-sd-stars" aria-hidden="true">★★★★★</span>
        <strong>Not rated</strong>
        <small>Match this title with TMDB to see its rating.</small>
      </div>
      <section v-if="item.extras?.length" ref="extrasPanel" class="glu-store-extras-panel" aria-label="Extras">
        <header>
          <span>Extras</span>
          <span v-if="extrasPages > 1" class="glu-store-extras-pager">
            <button type="button" aria-label="Previous extras" title="Previous" @click="turnExtras(-1)">‹</button>
            <small :aria-label="`Page ${extrasPage + 1} of ${extrasPages}, ${item.extras.length} extras`">{{ extrasPage + 1 }}/{{ extrasPages }}</small>
            <button type="button" aria-label="More extras" title="More" @click="turnExtras(1)">›</button>
          </span>
          <small v-else>{{ item.extras.length }}</small>
        </header>
        <div class="glu-store-extra-tiles" @wheel="onExtrasWheel">
          <div v-for="extra in pagedExtras" :key="extra.id" class="glu-store-extra">
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
    </template>
  </StoreDetail>

  <article v-else class="glu-detail" :aria-label="`${item.title} details`">
    <header class="glu-detail-header">
      <button type="button" class="glu-back-icon" aria-label="Back" title="Back" @click="emit('close')"><span aria-hidden="true">←</span></button>
      <span>From {{ item.primaryGenre }}</span>
      <span aria-hidden="true"></span>
    </header>
    <div class="glu-detail-body">
      <div class="glu-detail-case-wrap">
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
              <span class="glu-back-kicker">{{ item.genres.join(' · ') }}</span>
              <strong>{{ item.title }}</strong>
              <span>{{ item.synopsis }}</span>
              <small>{{ formatYear(item.year) }} · {{ formatRuntime(item.runtimeMinutes) }} · {{ item.rating }}</small>
              <i aria-hidden="true"></i>
            </span>
          </button>
        </div>
        <button v-if="item.path" type="button" class="glu-artwork-edit" title="Change artwork" aria-label="Change artwork" @click="emit('edit-artwork')">✎</button>
        <button type="button" class="glu-turn" @click="emit('flip')">{{ flipped ? 'Show front' : 'Turn case over' }}</button>
      </div>
      <div class="glu-detail-copy">
        <p class="glu-eyebrow">{{ item.seriesTitle ? `${item.seriesTitle} · Season ${item.seasonNumber}` : item.primaryGenre }} · {{ formatYear(item.year) }}</p>
        <h1>{{ item.title }}</h1>
        <p class="glu-meta">{{ formatRuntime(item.runtimeMinutes) }} <span>•</span> {{ item.rating }} <template v-if="item.tmdbRating"><span>•</span> ★ {{ item.tmdbRating.toFixed(1) }}</template> <template v-if="item.watched"><span>•</span> ✓ Watched</template> <span v-if="item.resolution">•</span> {{ item.resolution }} <span>•</span> {{ item.genres.join(', ') }} <button v-if="item.path" type="button" class="glu-edit-icon" title="Edit genres locally" aria-label="Edit genres locally" @click="beginGenresEdit">✎</button></p>
        <div v-if="editingGenres" class="glu-local-editor glu-genre-editor">
          <input v-model="genresDraft" aria-label="Genres separated by commas" @keydown.enter.prevent="saveGenres" @keydown.escape.stop.prevent="editingGenres = false" />
          <button type="button" class="primary" @click="saveGenres">Save</button><button type="button" @click="editingGenres = false">Cancel</button>
        </div>
        <div v-if="!editingSynopsis" class="glu-synopsis-row">
          <p class="glu-synopsis">{{ item.synopsis }}</p>
          <button v-if="item.path" type="button" class="glu-edit-icon" title="Edit description locally" aria-label="Edit description locally" @click="beginSynopsisEdit">✎</button>
        </div>
        <div v-else class="glu-local-editor glu-synopsis-editor">
          <textarea v-model="synopsisDraft" rows="5" aria-label="Local media description" @keydown.escape.stop.prevent="editingSynopsis = false"></textarea>
          <div><button type="button" class="primary" @click="saveSynopsis">Save</button><button type="button" @click="editingSynopsis = false">Cancel</button></div>
        </div>
        <p v-if="item.metadataSource === 'tmdb'" class="glu-metadata-credit">{{ item.localMetadataOverride ? 'Base metadata supplied by TMDB · local edits applied.' : 'Metadata supplied by TMDB.' }}</p>
        <div class="glu-actions">
          <button type="button" class="primary" :title="resumeLabel || undefined" @click="playMedia">{{ item.resumeSeconds ? `▶ ${resumeLabel}` : item.mediaKind === 'episode' ? '▶ Play episode' : '▶ Play movie' }}</button>
          <button v-if="item.resumeSeconds" type="button" @click="emit('play-from-start')">⏮ Start over</button>
          <button v-if="item.path && canOpenExternally" type="button" :title="openWithChoice ? 'Open it in another app' : 'Open with your default video app'" @click="emit('open-external', $event.currentTarget as HTMLElement)">⧉ {{ openWithChoice ? 'Open with…' : 'Open in default app' }}</button>
          <button v-if="item.path && canShowInFolder" type="button" @click="emit('show-in-folder')">Show media file</button>
        </div>

        <section v-if="item.extras?.length" class="glu-extras" aria-label="Movie extras">
          <div class="glu-extras-heading"><h2>Extras</h2><span>{{ item.extras.length }} {{ item.extras.length === 1 ? 'video' : 'videos' }} found {{ item.seriesTitle ? `with ${item.seriesTitle}` : 'beside this movie' }}</span></div>
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
