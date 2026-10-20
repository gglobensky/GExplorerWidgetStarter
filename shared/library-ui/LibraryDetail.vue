<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ArtworkFrame from './ArtworkFrame.vue'
import { formatCue, formatRuntime, formatYear, type LibraryItem } from './types'

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
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'flip'): void
  (e: 'play'): void
  (e: 'show-in-folder'): void
  (e: 'edit-artwork'): void
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
const ejecting = ref(false)
const storePalette = ref({ base:'#29343a', accent:'#b97645', text:'#f8f1e6' })
let previewStart = 0
let previewEnd = 0
let previewTimer: number | undefined
let ejectTimer: number | undefined
let paletteRevision = 0
const PREVIEW_SECONDS = 8

const backdropSource = computed(() => props.previewImageSrcs?.find(Boolean) || props.item.previewImageSrc || '')
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
  const layouts = [
    { left:5, top:8, width:39 },
    { left:57, top:7, width:36 },
    { left:9, top:34, width:31 },
    { left:64, top:35, width:29 },
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
  }, 140)
}

function previewSeeked(event: Event, index: number) {
  const video = event.currentTarget as HTMLVideoElement
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

function stopPreview(event: Event) {
  window.clearTimeout(previewTimer)
  pendingPreview.value = null
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  video?.pause()
  previewReady.value = false
  previewProgress.value = 0
  emit('preview', null)
}

function beginSynopsisEdit() {
  synopsisDraft.value = props.item.synopsis
  editingSynopsis.value = true
}

function saveSynopsis() {
  emit('update-synopsis',synopsisDraft.value.trim())
  editingSynopsis.value = false
}

function beginGenresEdit() {
  genresDraft.value = props.item.genres.join(', ')
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
  window.clearTimeout(previewTimer)
  pendingPreview.value = null
  previewReady.value = false
  previewProgress.value = 0
  emit('preview', null)
  console.warn(`[Media Library] ${previewError.value}: ${props.item.title} (media error ${code ?? 'unknown'})`)
}

watch(() => [props.item.id, props.previewStreamUrl] as const, () => {
  window.clearTimeout(previewTimer)
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
  paletteRevision += 1
})
</script>

<template>
  <article class="glu-detail" :class="{ 'movie-store':detailMode === 'movie-store', ejecting }" :style="storeStyle" :aria-label="`${item.title} details`">
    <header class="glu-detail-header">
      <button type="button" class="glu-back" @click="emit('close')"><span aria-hidden="true">‹</span> Back to shelves</button>
      <span>From {{ item.primaryGenre }}</span>
      <button type="button" class="glu-detail-close" aria-label="Return to shelves" @click="emit('close')">×</button>
    </header>
    <div class="glu-detail-body">
      <aside v-if="detailMode === 'movie-store'" class="glu-store-controls" aria-label="Media controls">
        <button type="button" class="primary" :disabled="ejecting" @click="playMedia"><span aria-hidden="true">▶</span><b>{{ item.progress ? 'Resume' : 'Play' }}</b></button>
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
                  @pointerleave.stop="stopPreview($event)"
                  @click.stop
                >
                  <small>{{ activePreview === index ? (previewReady ? 'Playing' : 'Loading…') : cue.label }}</small>
                  <i v-if="activePreview === index" :style="{ transform:`scaleX(${activeProgress(index)})` }" aria-hidden="true"></i>
                </span>
                <span class="glu-store-back-copy">
                  <small>{{ item.genres.join(' · ') }}</small>
                  <strong>{{ item.title }}</strong>
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
              crossorigin="anonymous"
              :src="previewStreamUrl"
              :class="{ ready:previewReady }"
              muted
              playsinline
              preload="metadata"
              controlslist="nodownload"
              @loadedmetadata="preparePreview($event, activeStorePreview.cue.seconds, activeStorePreview.index)"
              @seeked="previewSeeked($event, activeStorePreview.index)"
              @timeupdate="updatePreviewProgress($event,activeStorePreview.index)"
              @error="previewFailed"
              @contextmenu.prevent
            ></video>
            <small>{{ previewReady ? 'Playing' : 'Loading…' }}</small>
            <i :style="{ transform:`scaleX(${activeProgress(activeStorePreview.index)})` }"></i>
          </span>
        </div>
        <button v-if="item.path" type="button" class="glu-artwork-edit" title="Change artwork" aria-label="Change artwork" @click="emit('edit-artwork')">✎</button>
        <button type="button" class="glu-turn" @click="emit('flip')">{{ flipped ? 'Show front' : 'Turn case over' }}</button>
      </div>

      <div class="glu-detail-copy">
        <p class="glu-eyebrow">{{ item.seriesTitle ? `${item.seriesTitle} · Season ${item.seasonNumber}` : item.primaryGenre }} · {{ formatYear(item.year) }}</p>
        <h1>{{ item.title }}</h1>
        <p class="glu-meta">{{ formatRuntime(item.runtimeMinutes) }} <span>•</span> {{ item.rating }} <template v-if="item.tmdbRating"><span>•</span> ★ {{ item.tmdbRating.toFixed(1) }}</template> <span v-if="item.resolution">•</span> {{ item.resolution }} <span>•</span> {{ item.genres.join(', ') }} <button v-if="item.path" type="button" class="glu-edit-icon" title="Edit genres locally" aria-label="Edit genres locally" @click="beginGenresEdit">✎</button></p>
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
          <button type="button" class="primary" @click="playMedia">{{ item.progress ? '▶ Resume' : item.mediaKind === 'episode' ? '▶ Play episode' : '▶ Play movie' }}</button>
          <button v-if="item.path && canShowInFolder" type="button" @click="emit('show-in-folder')">Show media file</button>
        </div>

        <section v-if="detailMode !== 'movie-store'" class="glu-previews" aria-label="Scene previews">
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
              @pointerleave="stopPreview($event)"
              @focus="queuePreview(index)"
              @blur="stopPreview($event)"
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
                crossorigin="anonymous"
                :src="previewStreamUrl"
                :class="{ ready:previewReady }"
                muted
                playsinline
                preload="metadata"
                controlslist="nodownload"
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
