<script setup lang="ts" generic="T extends LibraryItem">
// The store detail (2.2.0, 2026-11-01): an item opened in the shop, the Video Club's movie-store page made shared.
// The box as big as the widget allows in the middle, big buttons on its left, a rating box (and more) on its right;
// a click on the box turns it over. Its colours come from the box's art (--store-base, --store-accent,
// --store-text), sampled once per item. What the widget puts in:
//   - slot `controls`: the left column's buttons (<button class="primary">, <button>: icon in <span>, words in <b>);
//   - slot `front`: over the front's art (a plain box's printed title);
//   - slot `back`: the back of the box (glu-sd-backdrop, glu-sd-tile, glu-sd-back-copy are styled for it);
//   - slot `stage`: over the box, front or back (edit buttons, editors: glu-sd-edit-tools, glu-sd-editor);
//   - slot `side`: the right column (glu-sd-rating: a <button> or a <div class="static">);
//   - slot `behind`: behind the box, in its frame (a disc sliding out);
//   - slot `overlay`: over the whole page (a picture shown big).
// The Game Shop uses it (0.5.0); the Video Club keeps its own LibraryDetail for now and can move onto it.
import { computed, ref, watch } from 'vue'
import ArtworkFrame from './ArtworkFrame.vue'
import type { LibraryItem } from './types'

const props = withDefaults(defineProps<{
  item: T
  /** Above the page, in the middle ("From Action"). */
  kicker?: string
  /** The box turned over (the widget keeps it, e.g. to turn it back when another item opens). */
  flipped?: boolean
  /** The box's shape: 2/3 (a DVD, a big box). */
  ratio?: number
}>(), { flipped: false, ratio: 2 / 3 })
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:flipped', value: boolean): void
}>()
defineSlots<{
  controls?: () => any
  front?: () => any
  back?: () => any
  stage?: () => any
  side?: () => any
  behind?: () => any
  overlay?: () => any
}>()

type Palette = { base: string; accent: string; text: string }
const palette = ref<Palette>({ base: '#29343a', accent: '#b97645', text: '#f8f1e6' })
let revision = 0
/**
 * 2.5.1 (Guillaume saw a colour flicker on opening): each art's colours, kept once sampled; the title's colours are
 * only used when the art can't be read in time (FALLBACK_MS) or at all, instead of first, for one frame or more.
 */
const sampled = new Map<string, Palette>()
const FALLBACK_MS = 220
let fallbackTimer: ReturnType<typeof setTimeout> | undefined
const style = computed(() => ({
  '--store-base': palette.value.base,
  '--store-accent': palette.value.accent,
  '--store-text': palette.value.text,
  '--glu-sd-ratio': String(props.ratio),
}))

function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/** The page's colours from the box's art (a title-derived pair until it loads, or when it can't be read). */
function samplePalette() {
  const run = ++revision
  if (fallbackTimer) clearTimeout(fallbackTimer)
  const h = hash(props.item.path || props.item.id)
  const hue = h % 360
  const fallback: Palette = { base: `hsl(${hue} 28% 22%)`, accent: `hsl(${(hue + 37 + ((h >>> 8) % 56)) % 360} 48% 53%)`, text: '#fff8ea' }
  // 2.10.0: a plain box's colours from its icon (transparent pixels don't count)
  const src = props.item.artwork.mode === 'placeholder' ? props.item.artwork.icon?.src ?? '' : props.item.artwork.src
  if (!src) { palette.value = fallback; return }
  const known = sampled.get(src)
  if (known) { palette.value = known; return }
  fallbackTimer = setTimeout(() => { if (run === revision) palette.value = fallback }, FALLBACK_MS)
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onerror = () => { if (run === revision) { if (fallbackTimer) clearTimeout(fallbackTimer); palette.value = fallback } }
  image.onload = () => {
    if (run !== revision) return
    if (fallbackTimer) clearTimeout(fallbackTimer)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 24
      canvas.height = 24
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0, 24, 24)
      const px = context.getImageData(0, 0, 24, 24).data
      let r = 0, g = 0, b = 0, n = 0
      for (let o = 0; o < px.length; o += 4) {
        if (px[o + 3] < 80) continue
        r += px[o]; g += px[o + 1]; b += px[o + 2]; n += 1
      }
      if (!n) { palette.value = fallback; return }
      r /= n; g /= n; b /= n
      const base = [channel(r * .62), channel(g * .62), channel(b * .62)]
      const accent = [channel(r * 1.24 + 24), channel(g * 1.24 + 24), channel(b * 1.24 + 24)]
      const luminance = (.2126 * base[0] + .7152 * base[1] + .0722 * base[2]) / 255
      const next: Palette = { base: `rgb(${base.join(' ')})`, accent: `rgb(${accent.join(' ')})`, text: luminance > .58 ? '#15120f' : '#fff8ea' }
      if (sampled.size > 300) sampled.clear()
      sampled.set(src, next)
      palette.value = next
    } catch {
      // art that can't be read: the title's colours
      palette.value = fallback
    }
  }
  image.src = src
}
watch(() => [props.item.id, props.item.artwork.src, props.item.artwork.icon?.src] as const, samplePalette, { immediate: true })

function flip() { emit('update:flipped', !props.flipped) }
</script>

<template>
  <article class="glu-sd" :style="style" :aria-label="`${item.title} details`" @keydown.esc.stop="emit('close')">
    <header class="glu-sd-header">
      <button type="button" class="glu-sd-back-button" aria-label="Back" title="Back" @click="emit('close')"><span aria-hidden="true">←</span></button>
      <span>{{ kicker }}</span>
      <span aria-hidden="true"></span>
    </header>
    <div class="glu-sd-body">
      <aside class="glu-sd-controls" aria-label="Controls"><slot name="controls" /></aside>
      <div class="glu-sd-wrap">
        <slot name="behind" />
        <div class="glu-sd-stage">
          <button
            type="button"
            class="glu-sd-case"
            :class="{ flipped }"
            :aria-label="flipped ? `Show the front of ${item.title}` : `Turn ${item.title} over`"
            :aria-pressed="flipped"
            @click="flip"
          >
            <span class="glu-sd-face glu-sd-front">
              <ArtworkFrame :artwork="item.artwork" :alt="`${item.title} front`" />
              <slot name="front" />
            </span>
            <span class="glu-sd-face glu-sd-back"><slot name="back" /></span>
          </button>
          <slot name="stage" />
        </div>
      </div>
      <aside class="glu-sd-side"><slot name="side" /></aside>
    </div>
    <slot name="overlay" />
  </article>
</template>
