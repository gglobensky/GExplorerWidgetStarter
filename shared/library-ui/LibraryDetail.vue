<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import ArtworkFrame from './ArtworkFrame.vue'
import { formatCue, formatRuntime, formatYear, type LibraryItem } from './types'

const props = defineProps<{
  item: LibraryItem
  flipped: boolean
  activePreview: number | null
  previewStreamUrl?: string | null
  previewImageSrcs?: string[]
  previewFramesLoading?: boolean
  previewFramesMessage?: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'flip'): void
  (e: 'play'): void
  (e: 'preview', index: number | null): void
}>()

const previewReady = ref(false)
const previewProgress = ref(0)
const previewError = ref('')
const pendingPreview = ref<number | null>(null)
let previewStart = 0
let previewEnd = 0
let previewTimer: number | undefined
const PREVIEW_SECONDS = 8

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
  try { video.currentTime = target } catch { /* wait for metadata */ }
  if (Math.abs(video.currentTime - target) < .1) previewSeeked(event,index)
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
  if (!props.item.path || !props.previewStreamUrl || previewError.value) return
  pendingPreview.value = index
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    if (pendingPreview.value === index) emit('preview', index)
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
}, { immediate:true })

onBeforeUnmount(() => {
  window.clearTimeout(previewTimer)
})
</script>

<template>
  <article class="glu-detail" :aria-label="`${item.title} details`">
    <header class="glu-detail-header">
      <button type="button" class="glu-back" @click="emit('close')"><span aria-hidden="true">‹</span> Back to shelves</button>
      <span>From {{ item.primaryGenre }}</span>
      <button type="button" class="glu-detail-close" aria-label="Return to shelves" @click="emit('close')">×</button>
    </header>
    <div class="glu-detail-body">
      <div class="glu-detail-case-wrap">
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
        <button type="button" class="glu-turn" @click="emit('flip')">{{ flipped ? 'Show front' : 'Turn case over' }}</button>
      </div>

      <div class="glu-detail-copy">
        <p class="glu-eyebrow">{{ item.seriesTitle ? `${item.seriesTitle} · Season ${item.seasonNumber}` : item.primaryGenre }} · {{ formatYear(item.year) }}</p>
        <h1>{{ item.title }}</h1>
        <p class="glu-meta">{{ formatRuntime(item.runtimeMinutes) }} <span>•</span> {{ item.rating }} <template v-if="item.tmdbRating"><span>•</span> ★ {{ item.tmdbRating.toFixed(1) }}</template> <span v-if="item.resolution">•</span> {{ item.resolution }} <span>•</span> {{ item.genres.join(', ') }}</p>
        <p class="glu-synopsis">{{ item.synopsis }}</p>
        <p v-if="item.metadataSource === 'tmdb'" class="glu-metadata-credit">Metadata supplied by TMDB.</p>
        <div class="glu-actions">
          <button type="button" class="primary" @click="emit('play')">{{ item.progress ? '▶ Resume' : item.mediaKind === 'episode' ? '▶ Play episode' : '▶ Play movie' }}</button>
          <button type="button" @click="emit('flip')">Read the case</button>
        </div>

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
