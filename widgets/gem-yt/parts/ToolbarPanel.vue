<script setup lang="ts">
// GEM YT 0.18.0: the toolbar's panel (sdk.ui().openPopover from the strip's ▣ or ☰). A head (what's playing, the view
// switch, the list's tabs) and a body: GEM YT moves its page over the body (surface.moveTo) and places YouTube's own
// player or list there (page regions). Not watching a video: the whole page, to pick one.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ListTabs from './ListTabs.vue'
import type { ListTab } from './listTabs'

const props = defineProps<{
  view: 'video' | 'list'
  tab: ListTab
  watching: boolean
  title: string
  queue?: string | null
  onBody: (el: HTMLElement | null, width: number, height: number) => void
  onView: (v: 'video' | 'list') => void
  onTab: (t: ListTab) => void
  close?: () => void
}>()

const HEAD = 30
/** 0.18.1: GEM Shell's popovers are 640 px at most, their 1 px border included: a pixel more scrolled sideways */
const MAX = 636
const size = computed(() => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  if (props.view === 'list' && props.watching) return { w: Math.min(440, vw - 40), h: Math.min(560, MAX, vh - 120) }
  const w = Math.min(MAX, vw - 40)
  const h = props.watching ? Math.round(w * 9 / 16) + HEAD : Math.min(560, vh - 120)
  return { w, h: Math.min(h, MAX, vh - 120) }
})

const body = ref<HTMLElement | null>(null)
let obs: ResizeObserver | null = null
onMounted(() => {
  const el = body.value
  if (!el) return
  const report = () => props.onBody(el, el.clientWidth, el.clientHeight)
  obs = new ResizeObserver(report)
  obs.observe(el)
  report()
})
onBeforeUnmount(() => { obs?.disconnect(); props.onBody(null, 0, 0) })
</script>

<template>
  <div class="tb-panel" :style="{ width: `${size.w}px`, height: `${size.h}px` }">
    <div class="head" :style="{ height: `${HEAD}px` }">
      <template v-if="view === 'list' && watching">
        <ListTabs :tab="tab" :queue="queue" @select="onTab" />
      </template>
      <gex-marquee v-else class="now" :text="title" :tip="true" />
      <span class="spacer"></span>
      <button v-if="watching" class="btn" v-gex-tooltip="view === 'video' ? 'Up next and your queue, here' : 'The video, here'"
              @click="onView(view === 'video' ? 'list' : 'video')">{{ view === 'video' ? '☰' : '▣' }}</button>
      <button class="btn" v-gex-tooltip="'Close (the sound keeps playing)'" @click="close?.()">✕</button>
    </div>
    <div ref="body" class="body"></div>
  </div>
</template>

<style scoped>
.tb-panel { display: flex; flex-direction: column; overflow: hidden; color: var(--gex-fg, #e9eaee); background: var(--gex-bg, #0e0f12); }
.head { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; padding: 0 4px 0 8px; min-width: 0; }
.now { flex: 1 1 auto; min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; }
.spacer { flex: 1 1 auto; }
.btn { flex: 0 0 auto; width: 26px; height: 24px; padding: 0; border: 0; border-radius: 6px; color: inherit; background: transparent; font-size: 13px; cursor: pointer; }
.btn:hover { background: var(--gex-hover, #ffffff14); }
.body { position: relative; flex: 1 1 auto; min-height: 0; background: #000; }
</style>
