<script setup lang="ts">
// GEM YT 0.9.0 (2026-11-24, GEM YT 1.0): a channel's videos as their own page (they opened on the racks before). Its
// head: the banner, the avatar, the name, subscribers · latest · rhythm, Overdue / Quiet, its tags; ‹ Back, its page on
// YouTube. Then its videos as Feed's cards, all of them, and More videos at the end (GEM Shell scrolls the channel's
// page on YouTube for older ones). A video plays in the watch page's tiles.
// 0.9.4 (2026-11-25): Latest | Popular (YouTube's own list of the channel's most watched).
import { computed } from 'vue'
import { agoShort, compact as compactNum } from '../core/items'
import type { CreatorCard, FeedSection } from './cards'
import FeedPart from './FeedPart.vue'

const props = defineProps<{
  card: CreatorCard | null
  section: FeedSection
  now: number
  /** "Back to Feed" */
  backLabel: string
  more: { label: string; busy?: boolean } | null
  /** 0.9.4: the orders offered (Latest, Popular) and the one shown */
  sorts?: Array<{ id: string; label: string }>
  sort?: string
}>()
const emit = defineEmits<{ back: []; play: [id: string]; more: []; openPage: []; sort: [id: any] }>()

const caption = computed(() => {
  const c = props.card
  if (!c) return ''
  return [c.subscribers !== undefined ? `${compactNum(c.subscribers)} subscribers` : '', c.latest !== undefined ? `latest ${agoShort(c.latest, props.now)}` : '', c.rate ?? '']
    .filter(Boolean).join(' · ')
})
</script>

<template>
  <div class="cv">
    <header class="head" :class="{ dim: card?.dim, ghost: card?.ghost }" :style="card?.banner ? { backgroundImage: `url(&quot;${card.banner}&quot;)` } : undefined">
      <div class="shade">
        <button class="back" :title="backLabel" @click="emit('back')">‹</button>
        <span class="avatar"><img v-if="card?.avatar" :src="card.avatar" alt="" draggable="false" /><span v-else>{{ card?.name?.[0] ?? '?' }}</span></span>
        <div class="who">
          <h2 :title="card?.name">{{ card?.name ?? 'This channel' }}</h2>
          <span v-if="caption" class="line">{{ caption }}</span>
          <span v-if="card?.flag || card?.tags.length" class="chips">
            <span v-if="card?.flag" class="chip flag">{{ card.ghost ? `👻 ${card.flag}` : card.flag }}</span>
            <span v-for="t in card?.tags ?? []" :key="t.id" class="chip">{{ t.name }}</span>
          </span>
        </div>
        <button v-if="card?.handle" class="page" title="Its page on YouTube (in GEM YT’s Standard mode)" @click="emit('openPage')">Its page ↗</button>
      </div>
    </header>
    <nav v-if="(sorts?.length ?? 0) > 1" class="sorts" aria-label="Order">
      <button v-for="s in sorts" :key="s.id" class="sort" :class="{ on: s.id === sort }" :aria-pressed="s.id === sort" @click="emit('sort', s.id)">{{ s.label }}</button>
    </nav>
    <FeedPart class="list" :key="sort" :sections="[section]" all :more="more" @play="emit('play', $event)" @more="emit('more')" />
  </div>
</template>

<style scoped>
.cv { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.head { flex: 0 0 auto; margin: 0 6px; overflow: hidden; border-radius: 10px; background: var(--gex-surface, #16171b) center / cover no-repeat; }
.shade { display: flex; gap: 12px; align-items: center; min-height: 84px; padding: 10px 14px; box-sizing: border-box;
  background: linear-gradient(90deg, #000000b8, #00000066 55%, #00000033); color: #fff; }
.ghost .shade { filter: grayscale(.8); }
.back { flex: 0 0 auto; width: 30px; height: 30px; padding: 0; border: 1px solid #ffffff40; border-radius: 50%; color: #fff; background: #00000066; font-size: 18px; line-height: 1; cursor: pointer; }
.back:hover { border-color: #ffffffaa; }
.avatar { flex: 0 0 auto; display: grid; place-items: center; width: 56px; height: 56px; overflow: hidden; border: 2px solid #ffffff30; border-radius: 50%; background: #2a2c33; font-size: 22px; font-weight: 800; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.who { display: grid; gap: 3px; min-width: 0; flex: 1 1 auto; }
.who h2 { margin: 0; overflow: hidden; font-size: 18px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px #000; }
.line { color: #ffffffcc; font-size: 12px; text-shadow: 0 1px 2px #000; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { padding: 1px 7px; border: 1px solid #ffffff40; border-radius: 9px; background: #00000059; font-size: 11px; }
.chip.flag { border-color: #f0a46b; color: #f8c79f; }
.page { flex: 0 0 auto; height: 28px; padding: 0 12px; border: 1px solid #ffffff40; border-radius: 14px; color: #fff; background: #00000066; font-size: 12px; cursor: pointer; }
.page:hover { border-color: #ffffffaa; }
.list { flex: 1 1 auto; min-height: 0; }
.sorts { flex: 0 0 auto; display: flex; gap: 6px; padding: 8px 10px 2px; }
.sort { height: 26px; padding: 0 12px; border: 1px solid var(--gex-border, #ffffff26); border-radius: 13px; color: var(--gex-fg, #e8e8ea);
  background: var(--gex-surface-2, #ffffff0d); font-size: 12px; cursor: pointer; }
.sort:hover { border-color: var(--gex-accent, #6aa0ff); }
.sort.on { border-color: var(--gex-accent, #6aa0ff); color: var(--gex-accent-fg, #fff); background: var(--gex-accent, #6aa0ff); }
</style>
