<script setup lang="ts">
// GEM YT 1.0, part 2 (2026-11-24): Feed, a GEM page. What's new for you, in three sections: Since you were here (your
// channels' videos since your last visit, the ones you haven't watched), the latest from your channels (YouTube's
// subscriptions feed; the bar's Tag narrows both to a tag), and You may like (YouTube's recommendations, without your
// own channels: Discover learns from the same list). A video plays in the watch page's tiles; its channel's name opens
// its videos. Two rows of each at first ("Show all N"); the spacing is the hub grid's (12 px at most).
import { computed, inject, reactive } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { clock } from '../core/items'
import type { FeedSection, VideoCard } from './cards'
import { hubGap } from './hubGrid'

const props = defineProps<{
  sections: FeedSection[]
  /** 0.9.0 (a channel's page): every card at once, no "Show all" */
  all?: boolean
  /** 0.9.0: a "More videos" button after the sections (busy: being read) */
  more?: { label: string; busy?: boolean } | null
}>()
const emit = defineEmits<{ play: [id: string]; openChannel: [id: string]; shown: [sectionId: string, count: number]; refresh: []; more: [] }>()

const sdk = inject<WidgetSdk>('widgetSdk')
const gap = hubGap(sdk, 4, 12, 10)
const FIRST = 8
const open = reactive(new Set<string>())
function showAll(s: FeedSection) {
  open.add(s.id)
  emit('shown', s.id, s.cards.length)
}
const visible = computed(() => props.sections.map(s => ({ s, cards: props.all || open.has(s.id) ? s.cards : s.cards.slice(0, FIRST) })))
const badge = (c: VideoCard) => (c.live ? 'LIVE' : c.length ? clock(c.length) : '')
</script>

<template>
  <div class="feed" :style="{ padding: `${gap}px`, gap: `${gap * 2}px` }">
    <section v-for="{ s, cards } in visible" :key="s.id" class="section" :aria-label="s.title">
      <header class="head">
        <h2>{{ s.title }}</h2>
        <span v-if="s.note" class="note">{{ s.note }}</span>
        <span v-if="s.reading" class="note">Reading…</span>
      </header>
      <p v-if="!s.cards.length && !s.reading" class="empty">{{ s.empty }}</p>
      <div class="cards" :style="{ gap: `${gap}px` }">
        <article v-for="c in cards" :key="c.id" class="card">
          <button class="thumb" :class="{ coming: c.coming && !c.thumb }" :title="`Play ${c.title}`"
                  :style="c.thumb ? { backgroundImage: `url(&quot;${c.thumb}&quot;)` } : undefined" @click="emit('play', c.id)">
            <span v-if="badge(c)" class="badge" :class="{ live: c.live }">{{ badge(c) }}</span>
            <span v-if="c.watched" class="watched" :style="{ width: `${Math.min(100, c.watched)}%` }"></span>
          </button>
          <div class="meta">
            <span class="avatar"><img v-if="c.avatar" :src="c.avatar" alt="" draggable="false" /></span>
            <div class="text">
              <button class="title" :title="c.title" @click="emit('play', c.id)">{{ c.title }}</button>
              <button v-if="c.channelName && c.channelId" class="channel" :title="`${c.channelName}: its videos`" @click="emit('openChannel', c.channelId)">{{ c.channelName }}</button>
              <span v-else-if="c.channelName" class="channel plain">{{ c.channelName }}</span>
              <span v-if="c.line" class="line">{{ c.line }}</span>
            </div>
          </div>
        </article>
      </div>
      <button v-if="!all && !open.has(s.id) && s.cards.length > FIRST" class="more" @click="showAll(s)">Show all {{ s.cards.length }}</button>
    </section>
    <button v-if="more" class="more" :disabled="more.busy" @click="emit('more')">{{ more.busy ? 'Reading…' : more.label }}</button>
  </div>
</template>

<style scoped>
.feed { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; color: var(--gex-fg, #e9eaee); background: var(--gex-bg, #0e0f12); box-sizing: border-box; }
.section { display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.head h2 { margin: 0; font-size: 15px; font-weight: 800; }
.note { color: var(--gex-fg-muted, #a6a9b1); font-size: 11px; }
.empty { margin: 0; color: var(--gex-fg-muted, #a6a9b1); font-size: 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.card { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.thumb { position: relative; aspect-ratio: 16 / 9; padding: 0; overflow: hidden; border: 0; border-radius: 10px; background: var(--gex-surface, #16171b) center / cover no-repeat; cursor: pointer; }
.thumb.coming { background: linear-gradient(100deg, #1d1f25 30%, #2a2c33 50%, #1d1f25 70%) 0 0 / 300% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -150% 0; } }
.thumb:hover { outline: 2px solid color-mix(in srgb, var(--gex-accent, #ff4545) 70%, transparent); }
.badge { position: absolute; right: 6px; bottom: 6px; padding: 1px 5px; border-radius: 4px; color: #fff; background: #000000cc; font-size: 11px; font-weight: 700; }
.badge.live { background: #cc0000; }
.watched { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--gex-accent, #ff4545); }
.meta { display: flex; gap: 8px; min-width: 0; }
.avatar { flex: 0 0 auto; width: 32px; height: 32px; overflow: hidden; border-radius: 50%; background: var(--gex-surface, #16171b); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.text { display: grid; gap: 2px; min-width: 0; }
.title { display: -webkit-box; overflow: hidden; padding: 0; border: 0; color: inherit; background: none; font-size: 13px; font-weight: 700; line-height: 1.3; text-align: left;
  -webkit-box-orient: vertical; -webkit-line-clamp: 2; cursor: pointer; }
.channel { justify-self: start; max-width: 100%; overflow: hidden; padding: 0; border: 0; color: var(--gex-fg-muted, #a6a9b1); background: none; font-size: 12px; text-align: left;
  text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.channel:hover { color: var(--gex-fg, #e9eaee); text-decoration: underline; }
.channel.plain { cursor: default; }
.channel.plain:hover { color: var(--gex-fg-muted, #a6a9b1); text-decoration: none; }
.line { color: var(--gex-fg-muted, #a6a9b1); font-size: 11px; }
.more { align-self: center; height: 28px; padding: 0 14px; border: 1px solid var(--gex-border, #ffffff2e); border-radius: 14px; color: inherit; background: var(--gex-surface, #16171b); font-size: 12px; cursor: pointer; }
.more:hover { border-color: var(--gex-accent, #ff4545); }
.more:disabled { opacity: .6; cursor: default; }
</style>
