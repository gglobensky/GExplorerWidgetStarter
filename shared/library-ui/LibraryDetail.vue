<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import ArtworkFrame from './ArtworkFrame.vue'
import { formatCue, formatRuntime, formatYear, type LibraryItem } from './types'

const props = defineProps<{
  item: LibraryItem
  flipped: boolean
  activePreview: number | null
  previewStreamUrl?: string | null
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'flip'): void
  (e: 'play'): void
  (e: 'preview', index: number | null): void
}>()

const previewReady = ref<boolean[]>([])
const mountedPreviews = ref(0)
const previewError = ref('')
const previewGrid = ref<HTMLElement | null>(null)
let pendingPreviewCount = 0
let previewTimer: number | undefined

function cueTime(video: HTMLVideoElement, seconds: number) {
  return Number.isFinite(video.duration) ? Math.min(seconds, Math.max(0, video.duration - .25)) : seconds
}

function preparePreview(event: Event, seconds: number, index: number) {
  const video = event.currentTarget as HTMLVideoElement
  const target = cueTime(video, seconds)
  try { video.currentTime = target } catch { /* wait for metadata */ }
  if (Math.abs(video.currentTime - target) < .1) previewSeeked(event, index)
}

function scheduleNextPreview(count: number) {
  pendingPreviewCount = Math.max(pendingPreviewCount, count)
  if (props.activePreview !== null || previewError.value) return
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    mountedPreviews.value = Math.min(props.item.previews.length, Math.max(mountedPreviews.value, pendingPreviewCount))
    pendingPreviewCount = 0
  }, 180)
}

function previewSeeked(event: Event, index: number) {
  const video = event.currentTarget as HTMLVideoElement
  video.pause()
  if (!previewReady.value[index]) {
    const next = previewReady.value.slice()
    next[index] = true
    previewReady.value = next
    scheduleNextPreview(index + 2)
  }
  if (props.activePreview === index) void video.play().catch(() => { /* hover playback depends on codec support */ })
}

function activatePreview(event: Event, index: number, seconds: number) {
  if (previewError.value || !previewReady.value[index]) return
  window.clearTimeout(previewTimer)
  pendingPreviewCount = Math.max(pendingPreviewCount, mountedPreviews.value + 1)
  previewGrid.value?.querySelectorAll('video').forEach(video => video.pause())
  emit('preview', index)
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  if (!video) return
  const target = cueTime(video, seconds)
  if (Math.abs(video.currentTime - target) > .4) {
    try { video.currentTime = target } catch { /* seek again when ready */ }
  } else void video.play().catch(() => { /* hover playback depends on codec support */ })
}

function stopPreview(event: Event, seconds: number) {
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  if (video) {
    video.pause()
    try { video.currentTime = cueTime(video,seconds) } catch { /* retain the last decoded frame */ }
  }
  emit('preview', null)
  if (pendingPreviewCount) scheduleNextPreview(pendingPreviewCount)
}

function previewFailed(event: Event) {
  const code = (event.currentTarget as HTMLVideoElement).error?.code
  previewError.value = code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'Preview unavailable for this codec' : 'Preview could not be loaded'
  window.clearTimeout(previewTimer)
  console.warn(`[Media Library] ${previewError.value}: ${props.item.title} (media error ${code ?? 'unknown'})`)
}

watch(() => [props.item.id, props.previewStreamUrl] as const, () => {
  window.clearTimeout(previewTimer)
  previewReady.value = props.item.previews.map(() => false)
  previewError.value = ''
  pendingPreviewCount = 0
  mountedPreviews.value = props.previewStreamUrl && props.item.path ? 1 : 0
}, { immediate:true })

onBeforeUnmount(() => {
  window.clearTimeout(previewTimer)
  previewGrid.value?.querySelectorAll('video').forEach(video => video.pause())
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
          <div class="glu-preview-heading"><h2>Look inside</h2><span>{{ previewError || (item.path ? 'Hover or focus to play' : 'Artwork preview') }}</span></div>
          <div ref="previewGrid" class="glu-preview-grid">
            <button
              v-for="(cue, index) in item.previews"
              :key="cue.seconds"
              type="button"
              class="glu-preview"
              :class="{ playing: activePreview === index }"
              :style="{ '--preview-tone': cue.tone }"
              :aria-label="`Preview ${cue.label} at ${formatCue(cue.seconds)}`"
              @pointerenter="activatePreview($event, index, cue.seconds)"
              @pointerleave="stopPreview($event, cue.seconds)"
              @focus="activatePreview($event, index, cue.seconds)"
              @blur="stopPreview($event, cue.seconds)"
            >
              <ArtworkFrame v-if="!item.path" :artwork="item.artwork" :alt="`${item.title}, ${cue.label}`" wide />
              <span
                v-else
                class="glu-preview-frame"
                :class="{ loading:!previewReady[index] }"
                role="img"
                :aria-label="`${cue.label} frame from ${item.title}`"
              ></span>
              <video
                v-if="item.path && previewStreamUrl && index < mountedPreviews && !previewError"
                :src="previewStreamUrl"
                :class="{ ready:previewReady[index] }"
                muted
                playsinline
                preload="metadata"
                controlslist="nodownload"
                @loadedmetadata="preparePreview($event, cue.seconds, index)"
                @seeked="previewSeeked($event, index)"
                @error="previewFailed"
                @contextmenu.prevent
              ></video>
              <span class="glu-preview-vignette" aria-hidden="true"></span>
              <span class="glu-preview-label"><b>{{ activePreview === index ? (item.path ? 'Playing' : 'Preview motion') : previewError ? 'Unavailable' : cue.label }}</b><small>{{ formatCue(cue.seconds) }}</small></span>
              <i v-if="activePreview === index" aria-hidden="true"></i>
            </button>
          </div>
        </section>
      </div>
    </div>
  </article>
</template>
