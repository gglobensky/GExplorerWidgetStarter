<script setup lang="ts">
// GEM YT 0.4.0 (2026-11-24): Discover, a GEM part. The channels YouTube keeps suggesting (your home page's videos from
// channels you don't follow, noted each time GEM YT reads it: core/discover.ts), the most often suggested first. Each:
// its avatar and name, how often and when it came up, the videos it came up with (a click plays one), Open the channel
// (its page, in Standard mode: follow it there) and Hide. The spacing is the hub grid's.
import { inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { agoShort, compact } from '../core/items'
import type { DiscoverCard } from './cards'
import { hubGap } from './hubGrid'

defineProps<{ cards: DiscoverCard[]; now: number; hidden: number; learning?: boolean; pictureOf: (url: string | undefined) => string | undefined }>()
const emit = defineEmits<{ open: [id: string]; hide: [id: string]; hideBy: [by: { id: string; name: string }]; play: [videoId: string]; unhide: []; refresh: [] }>()

const sdk = inject<WidgetSdk>('widgetSdk')
const gap = hubGap(sdk, 0, 40, 10)
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)
/** 0.13.0: why it's here: featured by your channels, suggested on your home page, or both */
function why(c: DiscoverCard, now: number): string {
  const parts: string[] = []
  const by = (c.featuredBy ?? []).map(b => b.name)
  if (by.length) parts.push(`Featured by ${by.slice(0, 2).join(' and ')}${by.length > 2 ? ` and ${by.length - 2} more` : ''}`)
  // 0.13.3: the same shape for both reasons: who brought it
  if (c.count > 0) parts.push(`Suggested by YouTube ${times(c.count)} · last ${agoShort(c.last, now)}`)
  return parts.join(' · ')
}
/** 0.13.3: Hide: at once for a channel only YouTube suggests; with featured ones, GEM Shell's menu (this one, or all a creator features) */
function hideMenu(e: MouseEvent, c: DiscoverCard) {
  const by = c.featuredBy ?? []
  const ui = (sdk as any)?.ui?.()
  if (!by.length || !ui?.openMenu) { emit('hide', c.id); return }
  ui.openMenu({
    at: e.currentTarget as HTMLElement, label: 'Hide',
    items: [
      { id: 'one', label: `Hide ${c.name}`, tooltip: 'Don’t show this channel again' },
      { type: 'separator' },
      ...by.map(b => ({ id: `by:${b.id}`, label: `Hide all featured by ${b.name}`, tooltip: `Now and later: the channels ${b.name} features` })),
    ],
    onPick: (row: { id: string }) => {
      if (row.id === 'one') emit('hide', c.id)
      else { const b = by.find(x => `by:${x.id}` === row.id); if (b) emit('hideBy', b) }
    },
  })
}
/** Under 10K subscribers: a hidden gem */
const GEM_UNDER = 10_000
</script>

<template>
  <div class="discover" :style="{ padding: `${gap}px` }">
    <div class="intro">
      <p>
        Channels you don’t follow yet: the ones your channels feature, and the ones YouTube keeps suggesting on your
        home page. GEM YT notes them as it reads your home page, and reads your channels’ featured channels slowly in
        the background.
      </p>
      <span class="spacer"></span>
      <template v-if="hidden">
        <span class="hint">{{ hidden }} hidden</span>
        <button class="btn" title="Show the channels you hid again" @click="emit('unhide')">Show them</button>
      </template>
      <button class="btn" :disabled="learning" title="Read your home page again for more suggestions" @click="emit('refresh')">
        {{ learning ? 'Reading your home page…' : '⟳ Look for more' }}
      </button>
    </div>
    <p v-if="!cards.length" class="empty">
      {{ learning ? 'Reading your home page…' : 'No suggestion yet: GEM YT learns them as it reads your home page (⟳ Look for more).' }}
    </p>
    <div class="cards" :style="{ gap: `${gap}px` }" role="list" aria-label="Suggested channels">
      <article v-for="c in cards" :key="c.id" class="card" role="listitem">
        <div class="head">
          <span class="avatar" :class="{ none: !pictureOf(c.avatar) }">
            <img v-if="pictureOf(c.avatar)" :src="pictureOf(c.avatar)" alt="" draggable="false" />
            <template v-else>{{ c.name.slice(0, 1) }}</template>
          </span>
          <span class="who">
            <span class="name">{{ c.name }}</span>
            <span class="line" :title="c.featuredBy?.length ? `Featured by ${c.featuredBy.map(b => b.name).join(', ')}` : undefined">{{ why(c, now) }}</span>
            <span v-if="c.subscribers !== undefined" class="line subs">
              {{ compact(c.subscribers) }} subscribers<span v-if="c.subscribers < GEM_UNDER" class="gem" title="A hidden gem: under 10K subscribers"> · 💎 hidden gem</span>
            </span>
          </span>
        </div>
        <div v-if="c.tags?.length" class="tags">
          <span v-for="t in c.tags" :key="t.name" class="chip tag" :title="`Your tag on ${t.from}, who features it`">{{ t.name }}</span>
        </div>
        <div v-if="c.videos.length" class="videos">
          <button v-for="v in c.videos" :key="v.id" class="video" :title="`Play ${v.title}`" @click="emit('play', v.id)">
            <span class="thumb" :style="pictureOf(v.thumbnail) ? { backgroundImage: `url(&quot;${pictureOf(v.thumbnail)}&quot;)` } : undefined"></span>
            <span class="title">{{ v.title }}</span>
          </button>
        </div>
        <div class="actions">
          <button class="btn primary" :title="`${c.name}’s page on YouTube: follow it there`" @click="emit('open', c.id)">Open the channel</button>
          <button class="btn" :title="c.featuredBy?.length ? 'Hide it, or all a creator features' : 'Don’t suggest it again'" @click="hideMenu($event, c)">{{ c.featuredBy?.length ? 'Hide ▾' : 'Hide' }}</button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.discover { height: 100%; min-height: 0; overflow: auto; color: #e9eaee; background: #0e0f12; }
.intro { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.intro p { flex: 1 1 320px; margin: 0; color: #a6a9b1; font-size: 12px; }
.spacer { flex: 0 1 auto; }
.hint { color: #a6a9b1; font-size: 11px; }
.empty { margin: 12% auto 0; max-width: 420px; text-align: center; opacity: .75; font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.card { display: grid; gap: 8px; padding: 10px; border: 1px solid #ffffff1a; border-radius: 10px; background: #16171b; }
.head { display: flex; gap: 9px; align-items: center; min-width: 0; }
.avatar { flex: 0 0 auto; display: grid; place-items: center; width: 44px; height: 44px; overflow: hidden; border-radius: 50%; background: #2a2c33; color: #c9ccd2; font-size: 18px; font-weight: 700; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.who { display: grid; min-width: 0; }
.name { overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.line { color: #a6a9b1; font-size: 11px; }
.line.subs { display: block; }
.gem { color: #7fd1e8; }
.videos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.video { display: grid; gap: 3px; padding: 0; border: 0; color: inherit; background: none; text-align: left; cursor: pointer; }
.thumb { aspect-ratio: 16 / 9; border-radius: 5px; background: #23252b center / cover no-repeat; }
.video:hover .thumb { outline: 2px solid color-mix(in srgb, var(--glu-accent, #ff4545) 70%, transparent); }
.title { display: -webkit-box; overflow: hidden; color: #c9ccd2; font-size: 10px; line-height: 1.25; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.actions { display: flex; gap: 6px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.chip.tag { padding: 1px 7px; border: 1px solid color-mix(in srgb, var(--glu-accent, #ff4545) 60%, transparent); border-radius: 10px; color: #fff; background: color-mix(in srgb, var(--glu-accent, #ff4545) 28%, transparent); font-size: 10px; }
.btn { height: 26px; padding: 0 10px; border: 1px solid #ffffff2e; border-radius: 6px; color: #e9eaee; background: #0b1117c9; font-size: 11px; cursor: pointer; white-space: nowrap; }
.btn:hover:not(:disabled) { border-color: #ffffff55; background: #18212b; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.primary { border-color: color-mix(in srgb, var(--glu-accent, #ff4545) 55%, transparent); }
</style>
