<script setup lang="ts">
// widgets/media-library/PlayerOverlay.vue
//
// The embedded player over the library: playback through the Shell's byte-range stream, the
// right-click menu (cover from the current frame or a file, playback speed), and the focal-point
// editor for a captured frame. Exactly one decoder: released when the player closes or the
// stream changes (a removed <video> otherwise decodes until garbage collection).
// Reports where playback is (every 5 s, and on pause / end / close) for Resume and Continue
// watching; starts at `startAt`; at the end of an episode, offers the next one.
// With `videoHandle` (GEM Shell's video rack, useParkedPlayback.ts) the <video> is the shell's,
// shown through <gex-video-surface>: never released here (the widget closes it, or the shell
// parks it while the widget is off screen), only its listeners come and go.
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import type { MediaTracks, VideoHandle, WidgetSdk } from 'gexplorer/widgets'
import { audioTrackLabel, subtitleTrackLabel } from './track-labels'
import type { LibraryItem } from '../../shared/library-ui'
import { trace } from './context'

const props = defineProps<{
  item: LibraryItem | null
  url: string | null
  loading: boolean
  coverBusy: boolean
  /** A captured frame waiting for its focal point (its image URL), or null. */
  focusImage: string | null
  /** Where playback starts, in seconds (Resume). */
  startAt?: number
  /** The next episode's title, offered when this one ends. */
  nextTitle?: string | null
  /** Starts playing at once (default); false: opens paused at startAt (it was paused when the library left the screen). */
  autoplay?: boolean
  /** The shell's video for this title (sdk.video()); none: a <video> of this component. */
  videoHandle?: VideoHandle | null
}>()
const emit = defineEmits<{
  (e:'close'):void
  (e:'capture', timeMs:number):void
  (e:'choose-image'):void
  (e:'focus-save', focus:{ x:number; y:number }):void
  (e:'focus-cancel'):void
  /** Where playback is in `item`; final: it paused, ended or closed. */
  (e:'progress', item:LibraryItem, positionMs:number, durationMs:number, final:boolean):void
  (e:'play-next'):void
  /** The <video> now playing (null: released): the widget's background sound follows it. */
  (e:'video', element:HTMLVideoElement | null):void
}>()

const sdk = inject<WidgetSdk>('widgetSdk')
const coverMenu = ref<{ x:number; y:number } | null>(null)
const focus = ref({ x:50, y:50 })
const upNext = ref<number | null>(null)   // seconds left before the next episode starts
const UP_NEXT_SECONDS = 10
const REPORT_EVERY_MS = 5000
let video: HTMLVideoElement | null = null
/** The bound <video> is this component's (released with it), not the shell's. */
let ownsVideo = false
/** Removes the listeners put on the bound <video>. */
let unlisten: (() => void) | null = null
/** The resume position was applied to this stream (a track switch reloads it: not again). */
let startApplied = false
/** The shell's tracks for this video (audio and subtitles), and the choice. */
const tracks = ref<MediaTracks | null>(null)
const audioTrack = ref<number | null>(null)
const subtitleTrack = ref<number | null>(null)
/** GEM Shell converts it and the next seconds aren't ready yet (the start, a seek, a track switch). */
const converting = ref(false)
let offTracks: (() => void) | null = null
/** The item the bound <video> plays (the props may already name the next one when it is released). */
let videoItem: LibraryItem | null = null
let lastReport = 0
let upNextTimer: number | undefined

function report(final: boolean) {
  if (!video || !videoItem || !Number.isFinite(video.currentTime) || video.readyState === HTMLMediaElement.HAVE_NOTHING) return
  const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0
  lastReport = Date.now()
  emit('progress', videoItem, video.currentTime * 1000, durationMs, final)
}

/** Also fired by releasing a stream: only the current element's pause is reported. */
function paused(event: Event) {
  if (event.currentTarget === video) report(true)
}

function timeUpdate() {
  if (Date.now() - lastReport >= REPORT_EVERY_MS) report(false)
}

function metadataLoaded() {
  if (startApplied) return
  startApplied = true
  const start = props.startAt ?? 0
  if (video && start > 0 && Number.isFinite(video.duration) && start < video.duration - 5) {
    try { video.currentTime = start } catch { /* not seekable yet: plays from the start */ }
  }
}

function ended() {
  report(true)
  if (props.nextTitle) startUpNext()
}

function startUpNext() {
  window.clearInterval(upNextTimer)
  upNext.value = UP_NEXT_SECONDS
  upNextTimer = window.setInterval(() => {
    if (upNext.value === null) return
    upNext.value -= 1
    if (upNext.value <= 0) playNext()
  }, 1000)
}

function cancelUpNext() {
  window.clearInterval(upNextTimer)
  upNext.value = null
}

function playNext() {
  cancelUpNext()
  emit('play-next')
}

function releaseVideo(target: HTMLVideoElement) {
  try {
    target.pause()
    target.removeAttribute('src')
    target.load()
  } catch {
    // Already torn down.
  }
}

function listen(target: HTMLVideoElement): () => void {
  const pairs: Array<[string, (event: Event) => void]> = [
    ['error', () => { trace('player: error', { code:target.error?.code, message:target.error?.message }); playbackError() }],
    ['loadedmetadata', metadataLoaded],
    ['timeupdate', timeUpdate],
    ['pause', paused],
    ['ended', ended],
  ]
  for (const name of ['loadstart','loadedmetadata','canplay','canplaythrough','playing','waiting','seeking','seeked','emptied','pause']) pairs.push([name, updateConverting])
  for (const name of ['loadstart','loadedmetadata','canplay','playing','waiting','stalled','suspend','emptied']) {
    pairs.push([name, () => trace(`player: ${name}`, name === 'loadedmetadata' ? { width:target.videoWidth, height:target.videoHeight, duration:target.duration } : undefined)])
  }
  for (const [name, fn] of pairs) target.addEventListener(name, fn)
  return () => { for (const [name, fn] of pairs) target.removeEventListener(name, fn) }
}

/** Binds the <video> playing now (null: none). `owned`: this component's, released when it goes. */
function bindVideo(element: unknown, owned = true) {
  const next = element instanceof HTMLVideoElement ? element : null
  if (next === video) return
  if (video) {
    report(true)
    unlisten?.()
    unlisten = null
    if (ownsVideo) releaseVideo(video)
  }
  video = next
  ownsVideo = owned
  if (next) {
    trace(owned ? 'player: video element created' : 'player: showing GEM Shell\'s video')
    unlisten = listen(next)
  }
  videoItem = next ? props.item : null
  startApplied = false
  updateConverting()
  lastReport = Date.now()
  if (next) cancelUpNext()
  emit('video', next)
}

/** The shell's video for `url`: its attributes, its listeners, and the stream when it is a new one. */
function bindHandle() {
  const handle = props.videoHandle
  if (!handle) { if (video && !ownsVideo) bindVideo(null, false); return }
  if (!handle.alive || !props.url || props.loading) { bindVideo(null, false); return }
  const el = handle.element
  el.controls = true
  el.setAttribute('controlslist', 'nodownload')
  // Picture-in-picture: GEM Shell's video can follow the user off the Video Club (it outlives our DOM)
  if ('pictureInPicture' in handle) el.removeAttribute('disablepictureinpicture')
  else el.setAttribute('disablepictureinpicture', '')
  if (props.item?.title) el.setAttribute('aria-label', props.item.title)
  const fresh = el.src !== props.url   // src: the URL set (GEM Shell may play it converted underneath)
  if (fresh && video === el) bindVideo(null, false)   // a new title on the same element: report the old one first
  bindVideo(el, false)
  if (fresh) startApplied = false
  if (fresh) {
    el.crossOrigin = 'anonymous'
    el.autoplay = props.autoplay !== false
    el.src = props.url
  }
}

watch(() => [props.videoHandle, props.url, props.loading] as const, bindHandle, { immediate:true })

function syncTracks() {
  const handle = props.videoHandle
  tracks.value = handle?.tracks ?? null
  audioTrack.value = handle?.audioTrack ?? null
  subtitleTrack.value = handle?.subtitleTrack ?? null
  updateConverting()
}

watch(() => props.videoHandle, handle => {
  offTracks?.()
  offTracks = handle?.onTracksChange?.(syncTracks) ?? null
  syncTracks()
}, { immediate:true })

function updateConverting() {
  const handle = props.videoHandle
  converting.value = !!video && !!handle?.conversion && video === handle.element && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
}

function chooseAudio(event: Event) {
  const index = Number((event.target as HTMLSelectElement).value)
  if (Number.isInteger(index)) props.videoHandle?.selectAudioTrack?.(index)
}

function chooseSubtitle(event: Event) {
  const index = Number((event.target as HTMLSelectElement).value)
  props.videoHandle?.selectSubtitleTrack?.(Number.isInteger(index) && index >= 0 ? index : null)
}

/** The template's own <video> (a stable function: an inline one would rebind on every render). */
function bindOwnVideo(element: unknown) {
  bindVideo(element, true)
}

watch(() => props.focusImage, image => {
  if (!image) return
  focus.value = { x:50, y:50 }
  video?.pause()
  coverMenu.value = null
})

/** The file in another app: GEM Shell's Open with list under the button (2026-10-26), else the default app. */
function openElsewhere(event: MouseEvent) {
  const path = props.item?.path
  if (!path) return
  const ui = sdk?.ui?.()
  if (ui?.openWith && event.currentTarget instanceof HTMLElement) void ui.openWith(path, event.currentTarget)
  else void sdk?.openPath?.(path)
}

function capture() {
  if (!video || props.coverBusy) return
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !Number.isFinite(video.currentTime)) {
    void sdk?.ui?.().snack({ id:'media-library-cover', dedupe:'replace', text:'Wait until the movie picture is visible, then try again.', timeoutMs:5000 })
    return
  }
  emit('capture', Math.max(0, Math.round(video.currentTime * 1000)))
}

function chooseImage() {
  coverMenu.value = null
  emit('choose-image')
}

function playbackError() {
  const path = props.item?.path
  if (!path) return
  void sdk?.ui?.().snack({
    id:'media-library-codec', dedupe:'replace',
    text:'This video format or codec is not supported by the embedded player.', timeoutMs:6000,
    actions:sdk?.openPath ? [{ label:'Open with default app', onClick:() => { void sdk.openPath!(path) } }] : undefined,
  })
}

function openCoverMenu(event: MouseEvent) {
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).closest('.media-library-player')?.getBoundingClientRect()
  if (!bounds) return
  coverMenu.value = {
    x:Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 190)),
    y:Math.max(56, Math.min(event.clientY - bounds.top, bounds.height - 190)),
  }
}

function setPlaybackRate(rate: number) {
  if (video) video.playbackRate = rate
  coverMenu.value = null
}

function closeMenuOutside(event: PointerEvent) {
  if (coverMenu.value && event.target instanceof Element && !event.target.closest('.media-library-player-cover-menu')) coverMenu.value = null
}

function setFocus(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  focus.value = {
    x:Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
    y:Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
  }
}

function dragFocus(event: PointerEvent) {
  if (event.buttons === 1) setFocus(event)
}

function moveFocus(event: KeyboardEvent) {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 3
  const { x, y } = focus.value
  focus.value = {
    x:event.key === 'ArrowLeft' ? Math.max(0, x - step) : event.key === 'ArrowRight' ? Math.min(100, x + step) : x,
    y:event.key === 'ArrowUp' ? Math.max(0, y - step) : event.key === 'ArrowDown' ? Math.min(100, y + step) : y,
  }
}

function saveFocus() {
  emit('focus-save', { x:Math.round(focus.value.x), y:Math.round(focus.value.y) })
}

/** Where playback is now, for the widget leaving the screen (null: nothing loaded). */
function snapshot(): { positionMs:number; durationMs:number; paused:boolean; volume:number; muted:boolean } | null {
  if (!video || !Number.isFinite(video.currentTime) || video.readyState === HTMLMediaElement.HAVE_NOTHING) return null
  return {
    positionMs:video.currentTime * 1000,
    durationMs:Number.isFinite(video.duration) ? video.duration * 1000 : 0,
    paused:video.paused || video.ended,
    volume:video.volume,
    muted:video.muted,
  }
}

defineExpose({ snapshot })

onBeforeUnmount(() => {
  offTracks?.()
  offTracks = null
  cancelUpNext()
  if (video) {
    report(true)
    unlisten?.()
    unlisten = null
    if (ownsVideo) releaseVideo(video)
  }
  video = null
})
</script>

<template>
  <section class="media-library-player" aria-label="Video player" @pointerdown.capture="closeMenuOutside">
    <header>
      <button type="button" class="glu-back-icon" aria-label="Back" title="Back" @click="emit('close')"><span aria-hidden="true">←</span></button>
      <strong>{{ item?.title || 'Preparing movie…' }}</strong>
      <div class="media-library-player-actions">
        <template v-if="tracks && url">
          <label class="media-library-track" :class="{ off:tracks.audio.length < 2 }" :title="tracks.audio.length < 2 ? 'This movie has one audio track' : 'Audio track'">
            <span aria-hidden="true">♪</span>
            <select :disabled="tracks.audio.length < 2" :value="audioTrack ?? 0" aria-label="Audio track" @change="chooseAudio">
              <option v-for="(track, index) in tracks.audio" :key="index" :value="index">{{ audioTrackLabel(track, index) }}</option>
            </select>
          </label>
          <label class="media-library-track" :class="{ off:!tracks.subtitles.length }" :title="tracks.subtitles.length ? 'Subtitles' : 'This movie has no subtitles'">
            <span aria-hidden="true">CC</span>
            <select :disabled="!tracks.subtitles.length" :value="subtitleTrack ?? -1" aria-label="Subtitles" @change="chooseSubtitle">
              <option :value="-1">Subtitles off</option>
              <option v-for="(track, index) in tracks.subtitles" :key="index" :value="index" :disabled="!track.vtt && !track.image">{{ subtitleTrackLabel(track, index) }}</option>
            </select>
          </label>
        </template>
        <button v-if="url && item?.path && sdk?.mediaVideoFramesCreate" type="button" :disabled="coverBusy" @click="capture">Use current frame as cover</button>
        <button v-if="url && item?.path && sdk?.mediaImageCreate" type="button" :disabled="coverBusy" @click="chooseImage">Choose image…</button>
        <button v-if="item?.path && (sdk?.openPath || sdk?.ui?.().openWith)" type="button" @click="openElsewhere($event)">{{ sdk?.ui?.().openWith ? 'Open with…' : 'Open externally' }}</button>
      </div>
    </header>
    <div v-if="loading || !url" class="media-library-player-loading"><span>◌</span>Preparing playback…</div>
    <gex-video-surface v-else-if="videoHandle" class="media-library-player-surface" :video="videoHandle" @contextmenu="openCoverMenu" />
    <video
      v-else
      :key="url"
      :ref="bindOwnVideo"
      crossorigin="anonymous"
      :src="url"
      :aria-label="item?.title"
      controls
      :autoplay="autoplay !== false"
      controlslist="nodownload"
      disablepictureinpicture
      @contextmenu="openCoverMenu"
    ></video>
    <!-- After the loading / surface / video chain (v-if / v-else-if / v-else must stay adjacent) -->
    <div v-if="converting && url && !loading" class="media-library-converting" role="status" aria-live="polite"><span aria-hidden="true">◌</span><strong>Converting…</strong><small>GEM Shell is preparing this part of the video.</small></div>
    <div v-if="upNext !== null && nextTitle" class="media-library-up-next" role="status" aria-live="polite">
      <small>Up next</small>
      <strong>{{ nextTitle }}</strong>
      <div><button type="button" class="primary" @click="playNext">Play now · {{ upNext }}</button><button type="button" @click="cancelUpNext">Cancel</button></div>
    </div>
    <div v-if="focusImage" class="media-library-cover-editor" role="dialog" aria-modal="true" aria-label="Choose the cover area">
      <div class="media-library-cover-editor-panel">
        <header><div><strong>Choose the cover area</strong><small>Click or drag to keep the important part visible on the case.</small></div></header>
        <div class="media-library-cover-editor-body">
          <div
            class="media-library-cover-frame"
            role="application"
            tabindex="0"
            aria-label="Choose the focal point. Arrow keys move it; hold Shift for larger steps."
            @pointerdown.prevent="setFocus"
            @pointermove="dragFocus"
            @keydown="moveFocus"
          >
            <img :src="focusImage" alt="Extracted movie frame" draggable="false" />
            <span class="media-library-cover-focus" :style="{ left:`${focus.x}%`, top:`${focus.y}%` }" aria-hidden="true"></span>
          </div>
          <div class="media-library-cover-sample"><span :style="{ backgroundImage:`url(${focusImage})`, backgroundPosition:`${focus.x}% ${focus.y}%` }"></span><small>Case preview</small></div>
        </div>
        <footer><button type="button" :disabled="coverBusy" @click="emit('focus-cancel')">Cancel</button><button type="button" class="primary" :disabled="coverBusy" @click="saveFocus">{{ coverBusy ? 'Saving…' : 'Use this area' }}</button></footer>
      </div>
    </div>
    <div v-if="coverMenu && url" class="media-library-player-cover-menu" :style="{ left:`${coverMenu.x}px`, top:`${coverMenu.y}px` }">
      <p>Use artwork from a file or the exact frame currently on screen.</p>
      <button type="button" :disabled="coverBusy || !sdk?.mediaVideoFramesCreate" @click="capture">{{ coverBusy ? 'Saving cover…' : 'Use current frame as cover' }}</button>
      <button type="button" :disabled="coverBusy || !sdk?.mediaImageCreate" @click="chooseImage">Choose an image file…</button>
      <span>Playback speed</span>
      <div><button v-for="rate in [.75,1,1.25,1.5,2]" :key="rate" type="button" @click="setPlaybackRate(rate)">{{ rate }}×</button></div>
    </div>
  </section>
</template>
