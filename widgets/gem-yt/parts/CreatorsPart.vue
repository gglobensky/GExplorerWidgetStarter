<script setup lang="ts">
// GEM YT 0.4.0 (2026-11-24): Creators, a GEM part. Every channel you follow as a tile: its banner, avatar and name,
// subscribers, latest upload and posting rhythm (its upload bars, Overdue / Quiet), its topics and your tags, and ＋ to
// tag it. A grid that only draws the tiles in view (the SDK's useVirtualFlow: 200+ channels scroll like 20); the
// spacing is the hub grid's. Which channels and in what order is the bar's (Tag, Show, Order, the search: Widget.vue).
// Says which tiles are in view (range), so Widget.vue asks their pictures and reads the channels it doesn't know yet.
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { createListFlow, lanesFor, useVirtualFlow, type WidgetSdk } from 'gexplorer/widgets'
import { agoShort, compact } from '../core/items'
import type { Tag } from '../core/tags'
import type { CreatorCard } from './cards'
import { openTagMenu, type TagMenu } from './tagMenu'
import { hubGap } from './hubGrid'

const props = defineProps<{ cards: CreatorCard[]; tags: Tag[]; now: number; empty?: string }>()
const emit = defineEmits<{
  open: [id: string]
  range: [ids: string[]]
  toggleTag: [tagId: string, channelId: string]
  newTag: [channelId: string]
  showTag: [tagId: string]
  showTopic: [term: string]
}>()

const sdk = inject<WidgetSdk>('widgetSdk')
const ui = (sdk as any)?.ui?.()
/** The space between tiles: the hub grid's gap, 12 at most (0.4.1: the hub's own gap is for its widgets, too wide
 *  between small tiles). Later: the theme's spacing variables. */
const gap = hubGap(sdk, 0, 12, 10)
const CELL = 240

const scrollEl = ref<HTMLElement | null>(null)
const sizerEl = shallowRef<HTMLElement | null>(null)
const rowsEl = shallowRef<HTMLElement | null>(null)
const bindSizer = (el: any) => { sizerEl.value = (el as HTMLElement) ?? null }
const bindRows = (el: any) => { rowsEl.value = (el as HTMLElement) ?? null }
const width = ref(0)
let sizeObs: ResizeObserver | null = null
watch(scrollEl, el => {
  sizeObs?.disconnect()
  sizeObs = null
  if (!el || typeof ResizeObserver === 'undefined') return
  width.value = el.clientWidth
  sizeObs = new ResizeObserver(() => { width.value = el.clientWidth })
  sizeObs.observe(el)
}, { flush: 'post' })

const lanes = computed(() => lanesFor(Math.max(0, width.value - 2 * gap), CELL, gap))
const flow = createListFlow({ order: () => 'rows', lanes: () => lanes.value })
let range: [number, number] = [0, 0]
const tellRange = () => emit('range', props.cards.slice(range[0], range[1]).map(c => c.id))
const vflow = useVirtualFlow({
  scrollEl, sizerEl, rowsEl, flow,
  count: () => props.cards.length,
  gap: () => gap,
  contentOffset: () => gap,
  overscan: 2,
  // Runs at once, inside useVirtualFlow: must not touch `vflow`
  onRange: (first, end) => { range = [first, end]; tellRange() },
})
// The same range, other channels in it (the bar changed the list)
watch(() => props.cards.map(c => c.id).join('|'), tellRange)

const shown = computed(() => vflow.items.value.map(i => props.cards[i]).filter(Boolean))
const cellsStyle = computed(() => ({
  gap: `${gap}px`, padding: `0 ${gap}px`, gridTemplateColumns: `repeat(${lanes.value}, minmax(0, 1fr))`,
  transform: `translateY(${vflow.lines.offsetY.value}px)`,
}))
const rootStyle = computed(() => ({ height: `${vflow.lines.totalHeight.value + gap}px` }))

/** Back to the top (the bar's order changed). */
function toTop() { scrollEl.value?.scrollTo({ top: 0 }) }
defineExpose({ toTop })

const caption = (c: CreatorCard) => [c.subscribers !== undefined ? `${compact(c.subscribers)} subscribers` : '', c.latest !== undefined ? agoShort(c.latest, props.now) : '', c.rate ?? '']
  .filter(Boolean).join(' · ')

// ＋: the tag picker (parts/tagMenu.ts: shared with the Channel part)
let menu: TagMenu | null = null
function pickTags(c: CreatorCard, ev: MouseEvent) {
  menu?.close()
  menu = openTagMenu(ui, ev.currentTarget as HTMLElement, c, () => props.tags, {
    toggle: tagId => emit('toggleTag', tagId, c.id),
    add: () => emit('newTag', c.id),
    closed: () => { menu = null },
  })
}
watch(() => props.tags, () => menu?.update?.(), { deep: true })

function onKey(ev: KeyboardEvent, c: CreatorCard) {
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); emit('open', c.id) }
}

onBeforeUnmount(() => { sizeObs?.disconnect(); menu?.close() })
</script>

<template>
  <div ref="scrollEl" class="creators" role="list" aria-label="Your creators">
    <p v-if="!cards.length" class="empty">{{ empty ?? 'No channel here.' }}</p>
    <div class="content" :style="rootStyle">
      <div :ref="bindRows" class="cells" :style="cellsStyle">
        <article v-for="c in shown" :key="c.id" class="tile" :class="{ dim: c.dim && !c.ghost, ghost: c.ghost }" role="listitem" tabindex="0"
                 :title="`${c.name}: open its videos`" @click="emit('open', c.id)" @keydown="onKey($event, c)">
          <div class="banner" :class="{ coming: c.bannerComing && !c.banner }"
               :style="c.banner ? { backgroundImage: `url(&quot;${c.banner}&quot;)` } : undefined">
            <span v-if="c.flag" class="flag" :class="{ quiet: c.dim }" :title="c.ghost ? 'No video for two years and more' : undefined">{{ c.ghost ? `👻 ${c.flag}` : c.flag }}</span>
          </div>
          <div class="head">
            <span class="avatar" :class="{ none: !c.avatar }">
              <img v-if="c.avatar" :src="c.avatar" alt="" draggable="false" />
              <template v-else>{{ c.name.slice(0, 1) }}</template>
            </span>
            <span class="who">
              <span class="name">{{ c.name }}</span>
              <span class="line">{{ caption(c) || (c.reading ? 'Reading…' : c.handle ?? '') }}</span>
            </span>
          </div>
          <div class="bars" :aria-label="c.bars?.length ? 'Videos a week, the last 12 weeks' : undefined">
            <i v-for="(b, i) in c.bars ?? []" :key="i" :class="{ unknown: b === null }" :style="{ height: `${b === null ? 12 : Math.max(6, b * 100)}%` }"></i>
          </div>
          <div class="chips" @click.stop>
            <button v-for="t in c.tags" :key="t.id" class="chip tag" :title="`Show the channels tagged ${t.name}`" @click="emit('showTag', t.id)">{{ t.name }}</button>
            <button v-for="t in c.topics" :key="t" class="chip topic" :title="`Show the channels about ${t}`" @click="emit('showTopic', t)">{{ t }}</button>
            <button class="chip add" :title="`Tag ${c.name}`" :aria-label="`Tag ${c.name}`" @click="pickTags(c, $event)">＋</button>
          </div>
        </article>
      </div>
    </div>
    <!-- One hidden tile: its height is a line's (useVirtualFlow) -->
    <article :ref="bindSizer" class="tile sizer" aria-hidden="true" :style="{ width: `${CELL}px` }">
      <div class="banner"></div><div class="head"><span class="avatar"></span><span class="who"><span class="name">X</span><span class="line">X</span></span></div>
      <div class="bars"></div><div class="chips"><span class="chip">X</span></div>
    </article>
  </div>
</template>

<style scoped>
.creators { position: relative; height: 100%; min-height: 0; overflow: auto; color: #e9eaee; background: #0e0f12; }
.content { position: relative; }
.cells { display: grid; will-change: transform; }
.empty { margin: 18% auto 0; max-width: 420px; text-align: center; opacity: .75; font-size: 13px; }
.tile { position: relative; display: grid; grid-template-rows: 80px auto auto minmax(0, 1fr); height: 196px; overflow: hidden; border: 1px solid #ffffff1a; border-radius: 10px;
  background: #16171b; cursor: pointer; outline: none; transition: border-color .12s, transform .12s; }
.tile:hover, .tile:focus-visible { border-color: color-mix(in srgb, var(--glu-accent, #ff4545) 70%, transparent); }
.tile:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--glu-accent, #ff4545) 45%, transparent); }
/* 0.4.1: quiet: a dusty tile (faded, specks of dust, a film over it) */
.tile.dim > * { filter: grayscale(.8) sepia(.3) brightness(.78); }
.tile.dim::after { content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none; border-radius: inherit;
  background: radial-gradient(circle at 18% 30%, #d8c9a83a 0 1px, transparent 1.6px) 0 0 / 23px 19px,
    radial-gradient(circle at 70% 60%, #d8c9a82e 0 1px, transparent 1.5px) 0 0 / 31px 27px,
    radial-gradient(circle at 40% 80%, #d8c9a824 0 .8px, transparent 1.3px) 0 0 / 17px 13px,
    linear-gradient(160deg, #c9b89a14, #00000000 40%, #c9b89a1c); }
/* 0.4.1: inactive (two years and more): a ghost of a tile */
.tile.ghost { border-style: dashed; border-color: #cfd6e655; background: #16171b66; }
.tile.ghost > * { opacity: .5; filter: grayscale(1) blur(.2px); }
.tile.ghost .banner { background: radial-gradient(ellipse at 50% 120%, #dfe6f533, transparent 70%), linear-gradient(#2a2d35, #16171b); }
.tile.ghost .flag { opacity: 1; filter: none; }
.tile.ghost:hover > * { opacity: .8; filter: grayscale(.6); }
.sizer { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
.banner { position: relative; background: linear-gradient(120deg, #3a1c22, #1b1d24 55%, #20262f) center / cover no-repeat; }
.banner.coming { background: linear-gradient(100deg, #1d1f25 30%, #2a2c33 50%, #1d1f25 70%) 0 0 / 300% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -150% 0; } }
.flag { position: absolute; top: 6px; right: 6px; padding: 1px 6px; border-radius: 4px; color: #fff; background: #c2410ccc; font-size: 10px; font-weight: 700; }
.flag.quiet { background: #3f4451cc; }
/* above the banner (it's positioned: without this it covers the avatar's top) */
.head { position: relative; z-index: 1; display: flex; gap: 9px; align-items: flex-end; min-width: 0; margin-top: -22px; padding: 0 10px; }
.avatar { flex: 0 0 auto; display: grid; place-items: center; width: 52px; height: 52px; overflow: hidden; border: 3px solid #16171b; border-radius: 50%;
  background: #2a2c33; color: #c9ccd2; font-size: 20px; font-weight: 700; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.who { display: grid; min-width: 0; padding-bottom: 2px; }
.name { overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.line { overflow: hidden; color: #a6a9b1; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.bars { display: flex; gap: 2px; align-items: flex-end; height: 28px; margin: 8px 12px 0; }
.bars i { flex: 1 1 0; min-width: 2px; border-radius: 2px 2px 0 0; background: color-mix(in srgb, var(--glu-accent, #ff4545) 75%, transparent); }
.bars i.unknown { background: #ffffff14; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start; min-height: 0; overflow: hidden; padding: 8px 10px 8px; }
.chip { max-width: 100%; overflow: hidden; padding: 1px 8px; border: 1px solid #ffffff2a; border-radius: 999px; color: #d8d9de; background: #ffffff0d;
  font-size: 10px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.chip:hover { border-color: #ffffff66; }
.chip.tag { border-color: color-mix(in srgb, var(--glu-accent, #ff4545) 60%, transparent); color: #fff; background: color-mix(in srgb, var(--glu-accent, #ff4545) 28%, transparent); }
.chip.topic { color: #b9c3d6; }
.chip.add { padding: 1px 7px; border-style: dashed; }
</style>
