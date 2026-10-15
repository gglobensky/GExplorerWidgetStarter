<!--
    The player's card in the operations tray (entry.ts `jobs.playback`), shown while
    the playback job runs and no Local Player is on screen. The host frames it (title,
    Open, Stop) and gives it this widget's SDK, bound to the same instance: the same
    lifecycle cells (the queue) and the same audio element (acquireElement with the
    same key returns the one the job holds). It follows the track by itself (the
    widget isn't there to tell it): the element's events, and the rack's
    'rack:playlistindex' when it moves on in the queue.
-->
<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import type { Track } from './usePlayerState'

const sdk = inject<WidgetSdk>('widgetSdk')
if (!sdk?.audio || !sdk.lifecycle) throw new Error('[local-player] card: widgetSdk is not available')

const life = sdk.lifecycle()
const audio = sdk.audio()
const queue = life.persistRef<Track[]>('queue', [])
const currentIndex = life.cell<number>('currentIndex', -1)
const sel = { category: 'music' as const, key: 'local-player' }
const music = audio.acquireElement({ category: 'music', key: 'primary', suspendPolicy: 'continue' })

const playing = ref(!music.paused)
const time = ref(music.currentTime || 0)
const duration = ref(Number.isFinite(music.duration) ? music.duration : 0)

const title = computed(() => queue.value[currentIndex.value]?.name || 'Nothing playing')
const progress = computed(() => duration.value > 0 ? Math.min(100, (time.value / duration.value) * 100) : 0)

function sync() {
  playing.value = !music.paused
  time.value = music.currentTime || 0
  duration.value = Number.isFinite(music.duration) ? music.duration : 0
}

// The rack moved on in the queue: by item id (the rack's list skips tracks without a URL).
function onRackIndex(e: Event) {
  const d = (e as CustomEvent<{ index?: number; item?: { id?: string } | null }>).detail
  const id = d?.item?.id
  const real = id ? queue.value.findIndex(t => t.id === id) : -1
  if (real >= 0) currentIndex.value = real
}

async function toggle() {
  if (music.paused) { try { await music.play() } catch { /* the element says why */ } }
  else music.pause()
}

function move(step: 'next' | 'prev') {
  void audio.playlists[step](sel, music).then((idx: number) => {
    const item = idx >= 0 ? audio.playlists.get(sel)?.items[idx] : null
    const real = item ? queue.value.findIndex(t => t.id === item.id) : -1
    if (real >= 0) currentIndex.value = real
  })
}

const EVENTS = ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended'] as const

onMounted(() => {
  for (const ev of EVENTS) music.addEventListener(ev, sync)
  music.addEventListener('rack:playlistindex', onRackIndex as EventListener)
  sync()
})

onBeforeUnmount(() => {
  for (const ev of EVENTS) music.removeEventListener(ev, sync)
  music.removeEventListener('rack:playlistindex', onRackIndex as EventListener)
})
</script>

<template>
  <div class="pc">
    <div class="pc-track" :title="title">{{ title }}</div>
    <div class="pc-row">
      <button class="pc-btn" aria-label="Previous track" title="Previous" @click="move('prev')">⏮</button>
      <button class="pc-btn pc-btn--main" :aria-label="playing ? 'Pause' : 'Play'" :title="playing ? 'Pause' : 'Play'" @click="toggle">
        {{ playing ? '⏸' : '▶' }}
      </button>
      <button class="pc-btn" aria-label="Next track" title="Next" @click="move('next')">⏭</button>
      <span class="pc-state">{{ playing ? 'Playing' : 'Paused' }}</span>
    </div>
    <div class="pc-bar" aria-hidden="true"><div class="pc-fill" :style="{ width: progress + '%' }"></div></div>
  </div>
</template>

<style scoped>
.pc { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pc-track { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .9; }
.pc-row { display: flex; align-items: center; gap: 4px; }
.pc-btn {
  width: 26px; height: 22px; padding: 0;
  border: 1px solid var(--border, #555); border-radius: 4px;
  background: transparent; color: var(--fg, #eee);
  font-size: 11px; line-height: 1; cursor: pointer;
}
.pc-btn:hover, .pc-btn:focus-visible { background: var(--surface-3, #333); border-color: var(--accent, #4ea1ff); }
.pc-btn--main { width: 32px; }
.pc-state { margin-left: auto; font-size: 11px; opacity: .6; }
.pc-bar { height: 3px; border-radius: 2px; background: var(--gex-op-bar-bg, rgba(255,255,255,.12)); overflow: hidden; }
.pc-fill { height: 100%; background: var(--accent, #4ea1ff); transition: width 200ms linear; }
@media (prefers-reduced-motion: reduce) { .pc-fill { transition: none; } }
</style>
