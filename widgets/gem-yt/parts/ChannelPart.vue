<script setup lang="ts">
// GEM YT 1.0, part 1 (2026-11-24): Channel, a GEM part of the watch page. The creator of the video playing (GEM Shell
// S3: the page's "now" fields), as GEM YT knows it: its banner, avatar, subscribers, latest upload and rhythm (the
// 12-week bars, Overdue / Quiet), its topics and your tags (＋ to tag it). A channel you don't follow: its name, and
// a way to its page. Compact (a narrow panel): the avatar and the name, the bars, the tags. 0.7.0: short (a low tile,
// under ~110 px since 0.7.1): no banner and no chart, one block (avatar, name, subscribers · latest · rhythm), the tags in one row.
// 0.11.1: tiny (about one row high, under ~64 px): the avatar as tall as the tile allows, and the name; nothing else.
import { inject, onBeforeUnmount, watch } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { agoShort, compact as compactNum } from '../core/items'
import type { Tag } from '../core/tags'
import type { CreatorCard } from './cards'
import { openTagMenu, type TagMenu } from './tagMenu'

const props = defineProps<{
  card: CreatorCard | null
  /** the playing channel as the page says it (shown when it isn't one of yours) */
  playing: { name?: string | null; handle?: string | null }
  tags: Tag[]
  now: number
  compact?: boolean
  /** 0.7.0: a low tile (0.7.1: under ~110 px) */
  short?: boolean
  /** 0.7.1: tall enough for the banner (~190 px); between: the chart without the banner */
  tall?: boolean
  /** 0.11.1: about one row high (under ~64 px): the avatar and the name only */
  tiny?: boolean
  /** 0.8.0: the creator is encouraged (GEM Shell's switch: its ads play); null: not known here (no surface, older shell) */
  encouraged?: boolean | null
}>()
const emit = defineEmits<{ open: [id: string]; openHandle: [handle: string]; toggleTag: [tagId: string, channelId: string]; newTag: [channelId: string]; showTag: [tagId: string]; encourage: [at: HTMLElement] }>()

const sdk = inject<WidgetSdk>('widgetSdk')
const ui = (sdk as any)?.ui?.()
let menu: TagMenu | null = null
function pickTags(ev: MouseEvent) {
  const c = props.card
  if (!c) return
  menu?.close()
  menu = openTagMenu(ui, ev.currentTarget as HTMLElement, c, () => props.tags, {
    toggle: tagId => emit('toggleTag', tagId, c.id),
    add: () => emit('newTag', c.id),
    closed: () => { menu = null },
  })
}
watch(() => props.tags, () => menu?.update?.(), { deep: true })
onBeforeUnmount(() => menu?.close())

const caption = (c: CreatorCard) => [c.subscribers !== undefined ? `${compactNum(c.subscribers)} subscribers` : '', c.latest !== undefined ? `latest ${agoShort(c.latest, props.now)}` : '', c.rate ?? '']
  .filter(Boolean).join(' · ')
</script>

<template>
  <div class="channel" :class="{ compact, short: short || tiny, tall, tiny }">
    <template v-if="card">
      <div v-if="!compact && !short && tall" class="banner" :style="card.banner ? { backgroundImage: `url(&quot;${card.banner}&quot;)` } : undefined">
        <span v-if="card.flag" class="flag">{{ card.ghost ? `👻 ${card.flag}` : card.flag }}</span>
      </div>
      <div class="head">
        <span class="avatar"><img v-if="card.avatar" :src="card.avatar" alt="" draggable="false" /><template v-else>{{ card.name.slice(0, 1) }}</template></span>
        <span class="who">
          <button class="name" :title="`${card.name}: its videos`" @click="emit('open', card.id)">{{ card.name }}</button>
          <span v-if="!tiny" class="line" :title="caption(card)">{{ caption(card) }}</span>
          <span v-if="short && !tiny && card.flag" class="line flag-line">{{ card.ghost ? `👻 ${card.flag}` : card.flag }}</span>
        </span>
      </div>
      <div v-if="card.bars?.length && !short" class="bars" aria-label="Videos a week, the last 12 weeks">
        <i v-for="(b, i) in card.bars" :key="i" :class="{ unknown: b === null }" :style="{ height: `${b === null ? 12 : Math.max(6, b * 100)}%` }"></i>
      </div>
      <div v-if="!tiny" class="chips">
        <button v-if="encouraged != null" class="chip enc" :class="{ on: encouraged }" :aria-pressed="!!encouraged"
                :title="encouraged ? `${card.name} is encouraged: its ads play. Click to stop` : `Encourage ${card.name}: let its ads play, so it earns from your views`"
                @click="emit('encourage', $event.currentTarget as HTMLElement)">{{ encouraged ? '💛 Encouraged' : '💛 Encourage' }}</button>
        <button v-for="t in card.tags" :key="t.id" class="chip tag" :title="`Your channels tagged ${t.name}`" @click="emit('showTag', t.id)">{{ t.name }}</button>
        <span v-for="t in card.topics" :key="t" class="chip topic">{{ t }}</span>
        <button class="chip add" :title="`Tag ${card.name}`" :aria-label="`Tag ${card.name}`" @click="pickTags">＋</button>
      </div>
    </template>
    <div v-else-if="playing.name || playing.handle" class="stranger">
      <span class="name">{{ playing.name ?? playing.handle }}</span>
      <span class="line">Not one of your channels.</span>
      <button v-if="playing.handle" class="btn" @click="emit('openHandle', playing.handle!)">Open its page</button>
      <button v-if="encouraged != null" class="chip enc" :class="{ on: encouraged }" :aria-pressed="!!encouraged"
              :title="encouraged ? 'Encouraged: its ads play. Click to stop' : 'Let its ads play, so it earns from your views'"
              @click="emit('encourage', $event.currentTarget as HTMLElement)">{{ encouraged ? '💛 Encouraged' : '💛 Encourage' }}</button>
    </div>
    <p v-else class="empty">The channel of the video playing shows here.</p>
  </div>
</template>

<style scoped>
.channel { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; overflow: auto; color: var(--gex-fg, #e9eaee); }
.banner { position: relative; flex: 0 0 64px; min-height: 48px; border-radius: 8px; background: linear-gradient(120deg, #3a1c22, #1b1d24 55%, #20262f) center / cover no-repeat; }
.flag { position: absolute; top: 6px; right: 6px; padding: 1px 6px; border-radius: 4px; color: #fff; background: #c2410ccc; font-size: 10px; font-weight: 700; }
.head { display: flex; gap: 9px; align-items: center; min-width: 0; }
.avatar { flex: 0 0 auto; display: grid; place-items: center; width: 44px; height: 44px; overflow: hidden; border-radius: 50%; background: #2a2c33; color: #c9ccd2; font-size: 18px; font-weight: 700; }
.compact .avatar { width: 32px; height: 32px; font-size: 14px; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.who { display: grid; min-width: 0; }
.name { overflow: hidden; padding: 0; border: 0; color: inherit; background: none; font-size: 13px; font-weight: 700; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.name:hover { text-decoration: underline; }
.line { overflow: hidden; color: var(--gex-fg-muted, #a6a9b1); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.compact .line { white-space: normal; }
.bars { display: flex; flex: 0 0 28px; min-height: 28px; gap: 2px; align-items: flex-end; }
.bars i { flex: 1 1 0; min-width: 2px; border-radius: 2px 2px 0 0; background: color-mix(in srgb, var(--gex-accent, #ff4545) 75%, transparent); }
.bars i.unknown { background: #ffffff14; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { max-width: 100%; overflow: hidden; padding: 1px 8px; border: 1px solid #ffffff2a; border-radius: 999px; color: #d8d9de; background: #ffffff0d;
  font-size: 10px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.chip.tag { border-color: color-mix(in srgb, var(--gex-accent, #ff4545) 60%, transparent); color: #fff; background: color-mix(in srgb, var(--gex-accent, #ff4545) 28%, transparent); }
.chip.topic { color: #b9c3d6; cursor: default; }
.chip.add { padding: 1px 7px; border-style: dashed; }
/* 0.8.0: Encourage (0.8.1: at once, GEM Shell's snackbar says so with Undo) */
.chip.enc { border-color: #e8b33a73; color: #f3d48a; }
.chip.enc.on { border-color: #e8b33a; color: #1a1408; background: linear-gradient(135deg, #ffe9a3, #d4a73a); font-weight: 700; }
.stranger { display: grid; gap: 6px; justify-items: start; }
.btn { height: 26px; padding: 0 10px; border: 1px solid #ffffff2e; border-radius: 6px; color: inherit; background: #0b1117c9; font-size: 11px; cursor: pointer; }
/* 0.7.1: the room shared: the banner and the chart grow with the tile (not only its top filled) */
.tall .banner { flex: 1 1 64px; max-height: 128px; }
.channel:not(.short) .bars { flex: 1 1 28px; max-height: 120px; }
/* 0.7.0: a low tile: one block, the tags in one row that scrolls */
.short { gap: 6px; overflow: hidden; }
.short .avatar { width: 34px; height: 34px; font-size: 14px; }
.short .line { white-space: nowrap; }
.short .chips { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.short .chip { flex: 0 0 auto; }
.flag-line { color: #f0a46b; }
/* 0.11.1: about one row: the avatar as tall as the tile (18 to 40 px), the name beside it */
.tiny { justify-content: center; }
.tiny .head { height: 100%; max-height: 40px; min-height: 18px; }
.tiny .avatar { width: auto; height: 100%; aspect-ratio: 1 / 1; font-size: 11px; }
.empty { margin: 0; color: var(--gex-fg-muted, #a6a9b1); font-size: 12px; }
</style>
