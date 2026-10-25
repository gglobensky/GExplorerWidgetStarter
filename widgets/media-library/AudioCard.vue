<!--
  The movie's card in the operations tray (entry.ts `jobs.background`), shown while the sound
  goes on and no Video Club is on screen. The host frames it (title, Open, Stop) and gives it
  this widget's SDK, bound to the same instance: the same lifecycle cells (what plays) and the
  same media element: GEM Shell's parked video (sdk.video().find, useParkedPlayback.ts) or, on
  older shells, the audio element the job holds (acquireElement with the same key).
-->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { BACKGROUND_AUDIO_KEY, SESSION_CELL, type PlaybackSession } from './useBackgroundPlayback'
import { MOVIE_VIDEO_KEY, PARKED_CELL, type ParkedSession } from './useParkedPlayback'

const sdk = inject<WidgetSdk>('widgetSdk')
if (!sdk?.lifecycle || (!sdk.video && !sdk.audio)) throw new Error('[media-library] card: widgetSdk is not available')

const parkedVideo = sdk.video?.().find(MOVIE_VIDEO_KEY) ?? null
const session = parkedVideo
  ? sdk.lifecycle().persistRef<ParkedSession | null>(PARKED_CELL, null)
  : sdk.lifecycle().persistRef<PlaybackSession | null>(SESSION_CELL, null)
/** What sounds: the shell's parked video, or (older shells) the job's audio element. */
const sound: { paused:boolean; currentTime:number; duration:number; play():Promise<void>; pause():void; addEventListener:HTMLMediaElement['addEventListener']; removeEventListener:HTMLMediaElement['removeEventListener'] } =
  parkedVideo?.element ?? sdk.audio!().acquireElement({ key:BACKGROUND_AUDIO_KEY, category:'custom', suspendPolicy:'continue' })

const playing = ref(!sound.paused)
const time = ref(sound.currentTime || 0)
const duration = ref(Number.isFinite(sound.duration) ? sound.duration : 0)
const title = computed(() => session.value?.item.seriesTitle ? `${session.value.item.seriesTitle} · ${session.value.item.title}` : session.value?.item.title || 'Movie')
const progress = computed(() => duration.value > 0 ? Math.min(100, (time.value / duration.value) * 100) : 0)

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}

function sync() {
  playing.value = !sound.paused
  time.value = sound.currentTime || 0
  duration.value = Number.isFinite(sound.duration) ? sound.duration : 0
}

async function toggle() {
  if (sound.paused) { try { await sound.play() } catch { /* the element says why */ } }
  else sound.pause()
}

function skip(seconds: number) {
  if (Number.isFinite(sound.currentTime)) sound.currentTime = Math.max(0, sound.currentTime + seconds)
}

const EVENTS = ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended'] as const
onMounted(() => {
  for (const ev of EVENTS) sound.addEventListener(ev, sync)
  sync()
})
onBeforeUnmount(() => {
  for (const ev of EVENTS) sound.removeEventListener(ev, sync)
})
</script>

<template>
  <div class="mlc">
    <div class="mlc-title" :title="title">{{ title }}</div>
    <div class="mlc-row">
      <button class="mlc-btn" aria-label="Back 10 seconds" title="Back 10 s" @click="skip(-10)">↺</button>
      <button class="mlc-btn mlc-main" :aria-label="playing ? 'Pause' : 'Play'" :title="playing ? 'Pause' : 'Play'" @click="toggle">{{ playing ? '⏸' : '▶' }}</button>
      <button class="mlc-btn" aria-label="Forward 30 seconds" title="Forward 30 s" @click="skip(30)">↻</button>
      <span class="mlc-time">{{ clock(time) }}<template v-if="duration"> / {{ clock(duration) }}</template></span>
    </div>
    <div class="mlc-bar" aria-hidden="true"><div class="mlc-fill" :style="{ width:progress + '%' }"></div></div>
    <small class="mlc-note">Sound only · open the Video Club to see the picture again</small>
  </div>
</template>

<style scoped>
.mlc { display:flex; flex-direction:column; gap:5px; min-width:0; }
.mlc-title { overflow:hidden; font-size:12px; opacity:.9; text-overflow:ellipsis; white-space:nowrap; }
.mlc-row { display:flex; align-items:center; gap:4px; }
.mlc-btn { width:26px; height:22px; padding:0; border:1px solid var(--border, #555); border-radius:4px; color:var(--fg, #eee); background:transparent; cursor:pointer; font-size:11px; line-height:1; }
.mlc-btn:hover, .mlc-btn:focus-visible { border-color:var(--accent, #4ea1ff); background:var(--surface-3, #333); }
.mlc-main { width:32px; }
.mlc-time { margin-left:auto; font-size:11px; font-variant-numeric:tabular-nums; opacity:.65; }
.mlc-bar { height:3px; overflow:hidden; border-radius:2px; background:var(--gex-op-bar-bg, rgba(255,255,255,.12)); }
.mlc-fill { height:100%; background:var(--accent, #4ea1ff); transition:width 200ms linear; }
.mlc-note { font-size:10px; opacity:.55; }
@media (prefers-reduced-motion: reduce) { .mlc-fill { transition:none; } }
</style>
