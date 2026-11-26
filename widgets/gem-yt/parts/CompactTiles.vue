<script setup lang="ts">
// GEM YT 0.16.0 (2026-11-25, plan-2026-11-25-gem-yt-compact.md): the watch page in the sidebar, a bare player. Inside the
// surface's element, like WatchTiles: our page shows wherever YouTube's parts aren't.
//   - a title row (what's playing; ⧉ picture in picture);
//   - the video, 16:9 across the full width;
//   - the list under it: YouTube's own Up next | Queue (page regions: a click plays in the same page, its ⋮ menus work);
//   - ⤢ the list takes all the space (the video hidden: it plays on, you hear it); ⤡ the video back at its size.
// 0.17.0: a handle under the video sets its height (it snaps to the height with no black bars at 16:9; a double click
// goes there). 0.20.0: the height, the tab and ⤢ kept per copy (Widget.vue saves them: `saved` in, `save` out).

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CompactSaved } from './compactState'
import ListTabs from './ListTabs.vue'
import { listPart, type ListTab } from './listTabs'

const props = defineProps<{
  nowLine: string
  /** 0.21.1: the title and channel (scrolls), and the clock or Paused / Ended (stays) */
  nowWhat?: string
  nowState?: string
  /** YouTube's queue ("3 / 12"), or null when there's none */
  queue?: string | null
  /** picture in picture: on / off; null: this GEM Shell can't */
  pip?: boolean | null
  /** 0.17.1: YouTube's player has a next video */
  canNext?: boolean
  /** 0.19.0: the bar above folded (null / absent: no toggle) */
  barFolded?: boolean | null
  /** 0.20.0: what this copy kept: the video's height (null: the default), the list's tab, ⤢ */
  saved?: CompactSaved | null
}>()
const emit = defineEmits<{
  regions: [place: Record<string, { x: number; y: number; width: number; height: number }>]
  pip: []
  next: []
  'fold-bar': []
  save: [state: CompactSaved]
}>()

const HEAD = 26
/** 0.17.0: the handle's band between the video and the tabs */
const GRIP = 10
const SNAP = 12

const root = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
let obs: ResizeObserver | null = null
watch(root, el => {
  obs?.disconnect()
  if (!el) return
  const measure = () => { size.value = { w: el.clientWidth, h: el.clientHeight } }
  measure()
  obs = new ResizeObserver(measure)
  obs.observe(el)
}, { flush: 'post' })
onBeforeUnmount(() => obs?.disconnect())

// 0.21.0: and Description (YouTube's description: the channel, Subscribe, likes), as in the hub's tiles
const tab = ref<ListTab>(props.saved?.tab ?? 'upNext')
/** the list takes all the space (the video hidden, still playing) */
const full = ref(props.saved?.full === true)
const hasQueue = computed(() => !!props.queue)
watch(hasQueue, q => { if (!q && tab.value === 'queue') tab.value = 'upNext' })

/** 0.17.0: the height the handle set (null: the default) */
const userH = ref<number | null>(typeof props.saved?.videoH === 'number' ? props.saved.videoH : null)
const limits = computed(() => {
  const { w, h } = size.value
  return { min: 68, max: Math.max(68, Math.floor(h - HEAD * 2 - GRIP - 68)), fit: Math.round(w * 9 / 16) }
})
const box = computed(() => {
  const { w, h } = size.value
  if (w < 120 || h < 120) return null
  const { min, max } = limits.value
  const want = userH.value ?? Math.min(w * 9 / 16, (h - HEAD * 2) * 0.62)
  const videoH = full.value ? 0 : Math.round(Math.min(max, Math.max(min, want)))
  const video = { x: 0, y: HEAD, width: Math.floor(w), height: videoH }
  const tabsY = HEAD + (videoH ? videoH + GRIP : 0)
  const list = { x: 0, y: tabsY + HEAD, width: Math.floor(w), height: Math.floor(h - tabsY - HEAD) }
  return { video, tabsY, list }
})

const place = computed(() => {
  const b = box.value
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {}
  if (!b) return out
  if (b.video.height >= 68) out.player = b.video
  const part = listPart(tab.value, hasQueue.value)
  if (b.list.height >= 68) out[part] = b.list
  return out
})
let sentKey = ''
// 0.17.0: while the handle is dragged, the regions go out at most every 60 ms (and once more when it's let go)
let dragging = false
let sendTimer: ReturnType<typeof setTimeout> | null = null
function send() {
  const v = place.value
  const k = JSON.stringify(v)
  if (k === sentKey) return
  sentKey = k
  emit('regions', v)
}
watch(place, () => {
  if (!dragging) { send(); return }
  if (!sendTimer) sendTimer = setTimeout(() => { sendTimer = null; send() }, 60)
}, { immediate: true })
onBeforeUnmount(() => { if (sendTimer) clearTimeout(sendTimer) })

// 0.17.0: the handle
/** 0.20.0: kept by the copy (after a drag, not during it) */
function keep() { emit('save', { videoH: userH.value, tab: tab.value, full: full.value }) }
watch([tab, full], keep)
function setH(v: number | null) {
  userH.value = v
}
let startY = 0
let startH = 0
function gripDown(e: PointerEvent) {
  const b = box.value
  if (!b || e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging = true
  startY = e.clientY
  startH = b.video.height
}
function gripMove(e: PointerEvent) {
  if (!dragging) return
  const { min, max, fit } = limits.value
  let v = Math.round(Math.min(max, Math.max(min, startH + e.clientY - startY)))
  if (Math.abs(v - fit) <= SNAP && fit <= max) v = fit
  setH(v)
}
function gripUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already */ }
  if (sendTimer) { clearTimeout(sendTimer); sendTimer = null }
  send()
  keep()
}
function gripFit() {
  const { max, fit } = limits.value
  setH(Math.min(max, fit))
  keep()
}
function gripKey(e: KeyboardEvent) {
  const b = box.value
  if (!b || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  const { min, max } = limits.value
  setH(Math.min(max, Math.max(min, b.video.height + (e.key === 'ArrowDown' ? 10 : -10))))
  keep()
}
</script>

<template>
  <div ref="root" class="tiles">
    <div class="head" :style="{ height: `${HEAD}px` }">
      <gex-marquee class="now" :text="(full ? '▶ ' : '') + (nowWhat || nowLine || 'YouTube')" :tip="true" />
      <span v-if="nowState" class="state">{{ nowState }}</span>
      <button v-if="canNext" class="btn" v-gex-tooltip="{ content: 'Next video', detail: 'What YouTube plays next (your queue first)' }" @click="emit('next')">⏭</button>
      <button v-if="pip !== null && pip !== undefined" class="btn" :class="{ on: pip }" :aria-pressed="!!pip"
              :title="pip ? 'Bring the video back from its floating window' : 'Picture in picture: the video in a floating window'"
              @click="emit('pip')">⧉</button>
      <button v-if="barFolded !== null && barFolded !== undefined" class="btn" :class="{ on: barFolded }" :aria-pressed="!!barFolded"
              v-gex-tooltip="barFolded ? { content: 'Show the bar', detail: 'Back, reload, Tiles, GEM YT…' } : { content: 'Fold the bar away', detail: 'More room for the video; this button brings it back' }"
              @click="emit('fold-bar')">{{ barFolded ? '▾' : '▴' }}</button>
    </div>
    <div v-if="box && box.video.height" class="grip" :style="{ top: `${HEAD + box.video.height}px`, height: `${GRIP}px` }"
         role="separator" aria-orientation="horizontal" tabindex="0" :aria-valuenow="box.video.height"
         v-gex-tooltip="{ content: 'Size the video', detail: 'Drag up or down. Double-click: fit the video exactly, with no black bars.' }"
         @pointerdown="gripDown" @pointermove="gripMove" @pointerup="gripUp" @pointercancel="gripUp"
         @dblclick="gripFit" @keydown="gripKey"><span class="pill"></span></div>
    <div v-if="box" class="head list-head" :style="{ top: `${box.tabsY}px`, height: `${HEAD}px` }">
      <ListTabs :tab="tab" :queue="queue" @select="tab = $event" />
      <span class="spacer"></span>
      <button class="btn" :title="full ? 'The video back at its size' : 'The list takes all the space (the video keeps playing)'"
              @click="full = !full">{{ full ? '⤡' : '⤢' }}</button>
    </div>
  </div>
</template>

<style scoped>
.tiles { position: absolute; inset: 0; overflow: hidden; background: var(--gex-bg, #0e0f12); color: var(--gex-fg, #e9eaee); }
.head { position: absolute; left: 0; right: 0; top: 0; display: flex; gap: 6px; align-items: center; min-width: 0; padding: 0 2px 0 4px; overflow: hidden; }
.now { flex: 1 1 auto; min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; }
.state { flex: 0 0 auto; color: var(--gex-fg-muted, #a6a9b1); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.spacer { flex: 1 1 auto; }
.grip { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; cursor: ns-resize; touch-action: none; outline: none; }
.pill { width: 36px; height: 4px; border-radius: 2px; background: var(--gex-border, #ffffff2e); transition: background .12s, width .12s; }
.grip:hover .pill, .grip:focus-visible .pill { width: 48px; background: var(--gex-accent, #ff4545); }
.btn { flex: 0 0 auto; height: 22px; min-width: 26px; padding: 0 6px; border: 1px solid var(--gex-border, #ffffff1f); border-radius: 11px;
  color: var(--gex-fg, #e9eaee); background: transparent; font-size: 12px; cursor: pointer; }
.btn:hover, .btn.on { border-color: var(--gex-accent, #ff4545); }
.btn.on { color: var(--gex-accent-fg, #fff); background: var(--gex-accent, #ff4545); }
</style>
