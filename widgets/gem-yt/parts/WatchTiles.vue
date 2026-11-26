<script setup lang="ts">
// GEM YT 1.0, part 1 (2026-11-24): the watch page in tiles. Drawn INSIDE the surface's element (our page shows wherever
// YouTube's parts aren't: GEM Shell S2), over the whole view. Each tile: a head of ours (its tabs, ⟩ to fold a panel),
// then its part: one of YouTube's (a region of the ONE page: placed by GEM Shell where this says, `regions`) or ours
// (Channel). Placed with GEM Shell's gridPlace: a folded panel is a strip along its edge, the tiles beside it take its
// room; a panel too narrow folds by itself (opening it takes its room back). Splitters between tiles move whole cells
// (0.5.2: the hub grid's, in its steps); the layout is the copy's (update:layout). 0.5.2: a panel folds and opens with a
// tab like GEM Shell's side panels' flaps (0.5.3: on its inner edge, toward the video, in the gap; the panel's own
// content starts after it); YouTube's own queue as a part (an empty queue: how to add one). 0.7.0 (part 3): the votes
// in the Player's head (Return YouTube Dislike: likes, ~dislikes, the ratio; a click: its site, the credit); 💬 Comment
// when the comments aren't shown (folded, another tab, too small): YouTube's comments placed over the video's lower
// part while open (their top is the box to write in); the Channel part short in a low tile. 0.7.1: the box anchored to
// the widget's bottom; 💬 in the comments' own tile when it's open (too small: its bottom right; another tab: its head).
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { gridPlace, type WidgetSdk } from 'gexplorer/widgets'
import {
  PAGE_PARTS, PART_ICONS, PART_LABELS, attachPart, closePart, detachPart, moveSplitter, reopenPart, splittersOf, tileName, withTile,
  type PartId, type Splitter, type Tile, type WatchLayout,
} from '../core/watchLayout'
import type { Tag } from '../core/tags'
import type { CreatorCard } from './cards'
import ChannelPart from './ChannelPart.vue'
import { compact as compactNum } from '../core/items'
import { likeShare, type Votes } from '../core/votes'
import { hubGap } from './hubGrid'

const props = defineProps<{
  /** 0.14.0: picture in picture: on / off; null: this GEM Shell can't */
  pip?: boolean | null
  /** 0.19.0: the bar above folded (null / absent: no toggle) */
  barFolded?: boolean | null
  layout: WatchLayout
  nowLine: string
  /** 0.21.1: the title and channel (scrolls), and the clock or Paused / Ended (stays) */
  nowWhat?: string
  nowState?: string
  card: CreatorCard | null
  playing: { name?: string | null; handle?: string | null }
  tags: Tag[]
  now: number
  /** 0.5.2: YouTube's queue as the page says it ("1 / 3"; null: no queue) */
  queue?: string | null
  /** 0.7.0: the video's votes (Return YouTube Dislike); null: none (off, not known) */
  votes?: Votes | null
  /** 0.7.0: the quick comment box is open */
  quick?: boolean
  /** 0.8.0: the playing creator is encouraged (null: not known) */
  encouraged?: boolean | null
}>()
const emit = defineEmits<{
  'update:layout': [layout: WatchLayout]
  regions: [place: Record<string, { x: number; y: number; width: number; height: number }>]
  open: [id: string]
  openHandle: [handle: string]
  toggleTag: [tagId: string, channelId: string]
  newTag: [channelId: string]
  showTag: [tagId: string]
  quick: [open: boolean]
  credit: []
  encourage: [at: HTMLElement]
  pip: []
  'fold-bar': []
}>()

const HEAD = 26
const STRIP = 34
/** 0.5.3: a panel's fold tab: on its inner edge, over the gap (what's wider than the gap comes off the panel's side) */
const TAB_W = 14
const TAB_H = 52
const sdk = inject<WidgetSdk>('widgetSdk')
const gap = hubGap(sdk, 4, 12, 8)

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

type Placed = { tile: Tile; x: number; y: number; w: number; h: number; state: 'full' | 'compact' | 'folded'; by?: 'user' | 'layout' }
/** 0.5.3: how much of a left / right panel its tab takes (beyond the gap) */
const inset = Math.max(0, TAB_W - gap)
const placed = computed<Placed[]>(() => {
  const { w, h } = size.value
  if (w < 40 || h < 40) return []
  const COLS = props.layout.cols, ROWS = props.layout.rows
  const rowHeight = Math.max(1, (h - gap * (ROWS - 1)) / ROWS)
  const panels: Record<string, { edge: 'left' | 'right' | 'top' | 'bottom'; folded?: boolean; opened?: boolean; min: number; compact: number }> = {}
  for (const t of props.layout.tiles)
    // 0.11.1: folded under 200 px (Up next's thumbnails need about that; 150 cut them)
    if (t.panel) panels[t.id] = { ...t.panel, min: 200, compact: 300 }
  const m = gridPlace(props.layout.tiles.map(t => ({ id: t.id, rect: t.rect })), COLS, { width: w, rowHeight, gap }, panels, { strip: STRIP })
  return props.layout.tiles.map(t => {
    const p = m.get(t.id)!
    // 0.5.3: a left / right panel's content starts after its tab (on its inner edge)
    const edge = t.panel?.edge
    const cut = edge === 'right' || edge === 'left' ? Math.min(inset, Math.max(0, p.width - 20)) : 0
    return { tile: t, x: edge === 'right' ? p.x + cut : p.x, y: p.y, w: p.width - cut, h: p.height, state: p.state, by: p.foldedBy }
  })
})
/** 0.5.3: the panels' fold tabs, on their inner edge (toward the video), centred on them */
const foldTabs = computed(() => placed.value.filter(p => p.tile.panel && (p.tile.panel.edge === 'left' || p.tile.panel.edge === 'right')).map(p => {
  const right = p.tile.panel!.edge === 'right'
  const h = Math.min(TAB_H, Math.max(24, p.h - 8))
  return { p, right, x: right ? p.x - TAB_W : p.x + p.w, y: Math.round(p.y + (p.h - h) / 2), h }
}))
/** YouTube's queue shown only when there is one (an empty one: how to add one) */
const queueEmpty = computed(() => !props.queue)

/** YouTube's parts shown, where GEM Shell places them: the body under each open tile's head (too small: none). */
const basePlace = computed(() => {
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {}
  for (const p of placed.value) {
    if (p.state === 'folded' || !PAGE_PARTS.has(p.tile.active)) continue
    if (p.tile.active === 'queue' && queueEmpty.value) continue
    const width = Math.floor(p.w), height = Math.floor(p.h - HEAD)
    if (width >= 120 && height >= 68) out[p.tile.active] = { x: Math.round(p.x), y: Math.round(p.y + HEAD), width, height }
  }
  return out
})
// ── 0.7.0: quick comment ────────────────────────────────────────────────────────────────────────────────────
/** The comments aren't shown in a tile (folded, another tab, too small): 💬 Comment offered */
const commentsHidden = computed(() => !basePlace.value.comments && props.layout.tiles.some(t => t.parts.includes('comments')))
/**
 * 0.7.1: where 💬 Comment is. The comments' tile open but too small: its body's bottom right; open on another tab
 * (Description): its head's right end; folded (or none open): the Player's head (in its flow, not positioned here).
 */
/** 0.11.2: the wheel scrolls tabs that don't fit */
function tabsWheel(e: WheelEvent) { const el = e.currentTarget as HTMLElement; if (el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY || e.deltaX }
const QUICK_W = 104, QUICK_H = 24, QUICK_ICON = 28
/** 0.11.2: room for the tabs and the button's words in a head (about 90 px a tab); else 💬 alone (its tooltip says the rest) */
const headRoom = (t: Tile, w: number) => w >= 120 + t.parts.length * 90
const quickButton = computed(() => {
  if (!commentsHidden.value) return null
  const p = placed.value.find(x => x.tile.parts.includes('comments') && x.state !== 'folded')
  if (!p) return null
  if (p.tile.active === 'comments') {
    const w = p.w >= 200 ? QUICK_W : QUICK_ICON
    return { tile: p.tile.id, x: Math.round(p.x + p.w - w - 8), y: Math.round(p.y + p.h - QUICK_H - 8), w, icon: w === QUICK_ICON }
  }
  // 0.11.2: in a head, icon only when the tabs need the room (Guillaume: it covered the Channel tab when narrow)
  const w = headRoom(p.tile, p.w) ? QUICK_W : QUICK_ICON
  return { tile: p.tile.id, x: Math.round(p.x + p.w - w - 4), y: Math.round(p.y + (HEAD - QUICK_H) / 2), w, icon: w === QUICK_ICON }
})
/** 0.7.1: anchored to the widget's bottom, over the video's width (at most 720 px, centred), clear of 💬's button */
const quickRect = computed(() => {
  if (!props.quick || !commentsHidden.value) return null
  const v = basePlace.value.player
  if (!v) return null
  const bottom = size.value.h
  const height = Math.floor(Math.min(230, Math.max(150, (bottom - v.y) * 0.45), bottom - v.y))
  const y = bottom - height
  let width = Math.floor(Math.min(720, v.width - 24))
  let x = Math.round(v.x + (v.width - width) / 2)
  const b = quickButton.value
  if (b && b.y + QUICK_H > y && b.x < x + width) {
    const right = Math.min(x + width, b.x - 8)
    width = Math.floor(right - Math.max(v.x + 8, Math.min(x, right - 120)))
    x = right - width
  }
  if (width < 120 || height < 68) return null
  return { x, y, width, height }
})
const place = computed(() => (quickRect.value ? { ...basePlace.value, comments: quickRect.value } : basePlace.value))
// The comments back in their tile (or no room over the video): the quick box closes
watch(commentsHidden, hidden => { if (!hidden && props.quick) emit('quick', false) })
const share = computed(() => likeShare(props.votes))
const votesTip = computed(() => {
  const v = props.votes
  if (!v) return ''
  return `${v.likes.toLocaleString()} likes, about ${v.dislikes.toLocaleString()} dislikes${share.value !== null ? ` (${Math.round(share.value * 100)}% like it)` : ''}. ` +
    'Dislikes are an estimate by Return YouTube Dislike (archived counts and its users’ votes): click for returnyoutubedislike.com.'
})
let sentKey = ''
watch(place, v => {
  const k = JSON.stringify(v)
  if (k === sentKey) return
  sentKey = k
  emit('regions', v)
}, { immediate: true })

// ── Tabs, folding ─────────────────────────────────────────────────────────────────────────────────────────────
const setLayout = (l: WatchLayout) => emit('update:layout', l)

// 0.12.0 (2026-11-25): the tile menu (right-click a tab, or a tile's head): Detach, Attach to ▸, Close, ＋ Part ▸
const TAB_TIP = 'Right-click: Detach, Attach to…, Close, ＋ Part'
function tileMenu(e: MouseEvent, t: Tile, part: PartId = t.active) {
  const ui = (sdk as any)?.ui?.()
  if (!ui?.openMenu) return
  e.preventDefault()
  const l = props.layout
  const others = l.tiles.filter(x => x.id !== t.id)
  const closed = l.closed ?? []
  const alone = t.parts.length === 1
  const items = [
    { type: 'header', label: PART_LABELS[part] },
    { id: 'detach', label: 'Detach', icon: '⧉', disabled: alone ? 'It’s alone in its tile' : !detachPart(l, t.id, part) ? 'No room to split this tile' : false,
      tooltip: 'Its own tile: this one split in two' },
    { id: 'attach', label: 'Attach to', icon: '⇥', disabled: others.length ? false : 'No other tile',
      children: others.map(x => ({ id: `to:${x.id}`, label: tileName(x),
        disabled: alone && !attachPart(l, t.id, part, x.id) ? 'Its tile has no neighbour to take its place' : false })) },
    { id: 'close', label: 'Close', icon: '✕', danger: false,
      disabled: part === 'player' ? 'The video stays' : alone && !closePart(l, t.id, part) ? 'Its tile has no neighbour to take its place' : false,
      tooltip: '＋ Part brings it back' },
    { type: 'separator' },
    { id: 'add', label: '＋ Part', disabled: closed.length ? false : 'Every part is shown',
      children: closed.map(c => ({ id: `add:${c}`, label: PART_LABELS[c], icon: PART_ICONS[c], detail: `In ${tileName(t)}` })) },
  ]
  ui.openMenu({
    at: e, items, label: `${PART_LABELS[part]} tile`,
    onPick: (row: { id: string }) => {
      const id = row.id
      const next = id === 'detach' ? detachPart(l, t.id, part)
        : id === 'close' ? closePart(l, t.id, part)
        : id.startsWith('to:') ? attachPart(l, t.id, part, id.slice(3))
        : id.startsWith('add:') ? reopenPart(l, id.slice(4) as PartId, t.id)
        : undefined
      if (next === undefined) return
      if (next) setLayout(next)
      else void ui.snack?.({ text: 'GEM YT can’t arrange the tiles that way (no neighbour fits that tile’s place).' })
    },
  })
}
function showPart(t: Tile, part: PartId) {
  if (t.active !== part) setLayout(withTile(props.layout, t.id, x => ({ ...x, active: part })))
}
function fold(t: Tile) {
  setLayout(withTile(props.layout, t.id, x => ({ ...x, panel: { ...x.panel!, folded: true, opened: false } })))
}
/** A strip clicked: folded by you, unfolded; folded by the room, opened anyway (its neighbours give it its min). */
function unfold(p: Placed) {
  setLayout(withTile(props.layout, p.tile.id, x => ({ ...x, panel: { ...x.panel!, folded: false, opened: p.by === 'layout' } })))
}
const stripLabel = (t: Tile) => t.parts.map(id => PART_LABELS[id]).join(' · ')

// ── Splitters (between open tiles) ───────────────────────────────────────────────────────────────────────────
const splitters = computed(() => {
  const byId = new Map(placed.value.map(p => [p.tile.id, p]))
  const out: Array<{ s: Splitter; x: number; y: number; w: number; h: number }> = []
  for (const s of splittersOf(props.layout)) {
    const ps = [...s.before, ...s.after].map(id => byId.get(id)).filter((p): p is Placed => !!p)
    if (ps.length < 2 || ps.some(p => p.state === 'folded')) continue
    const first = byId.get(s.before[0])!
    if (s.axis === 'cols') {
      const y0 = Math.min(...ps.map(p => p.y)), y1 = Math.max(...ps.map(p => p.y + p.h))
      out.push({ s, x: first.x + first.w, y: y0, w: gap, h: y1 - y0 })
    } else {
      const x0 = Math.min(...ps.map(p => p.x)), x1 = Math.max(...ps.map(p => p.x + p.w))
      out.push({ s, x: x0, y: first.y + first.h, w: x1 - x0, h: gap })
    }
  }
  return out
})
function dragSplit(ev: PointerEvent, s: Splitter) {
  const el = root.value
  if (!el || ev.button !== 0) return
  ev.preventDefault()
  const box = el.getBoundingClientRect()
  const left = box.left
  const width = box.width
  const cell = s.axis === 'cols' ? (width + gap) / props.layout.cols : (box.height + gap) / props.layout.rows
  let layout = props.layout
  let current = s
  const move = (e: PointerEvent) => {
    const px = s.axis === 'cols' ? e.clientX - left : e.clientY - box.top
    const next = moveSplitter(layout, current, Math.round((px + gap / 2) / cell))
    if (next === layout) return
    layout = next
    current = splittersOf(layout).find(x => x.axis === s.axis && x.before.join() === s.before.join()) ?? current
    setLayout(layout)
  }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <div ref="root" class="tiles">
    <template v-for="p in placed" :key="p.tile.id">
      <!-- A folded panel: its strip (click: open) -->
      <button v-if="p.state === 'folded'" class="strip" :class="p.tile.panel?.edge === 'top' || p.tile.panel?.edge === 'bottom' ? 'across' : 'down'"
              :style="{ left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` }"
              :title="`${stripLabel(p.tile)}${p.by === 'layout' ? ' (folded: no room)' : ''}: open`" @click="unfold(p)">
        <span class="strip-icon">{{ p.tile.parts.includes('channel') && card?.avatar ? '' : PART_ICONS[p.tile.active] }}<img v-if="p.tile.parts.includes('channel') && card?.avatar" :src="card.avatar" alt="" /></span>
        <span class="strip-label">{{ stripLabel(p.tile) }}</span>
      </button>
      <template v-else>
        <div class="head" :class="{ compact: p.state === 'compact' }" :style="{ left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${HEAD}px` }"
             @contextmenu="tileMenu($event, p.tile)">
          <!-- 0.21.0: the player alone in its tile: its title only (the "Player" tab is for tiles holding several parts; a
               right-click on the head still opens the tile menu) -->
          <div v-if="!(p.tile.parts.length === 1 && p.tile.parts[0] === 'player' && nowLine)" class="tabs" role="tablist" @wheel.passive="tabsWheel" :style="quickButton && quickButton.tile === p.tile.id && p.tile.active !== 'comments' ? { marginRight: `${quickButton.w + 8}px` } : undefined">
            <button v-for="part in p.tile.parts" :key="part" class="tab" :class="{ on: part === p.tile.active, only: p.tile.parts.length === 1 }"
                    role="tab" :aria-selected="part === p.tile.active" :title="TAB_TIP" @click="showPart(p.tile, part)"
                    @contextmenu.stop="tileMenu($event, p.tile, part)">{{ PART_LABELS[part] }}<span v-if="part === 'queue' && queue" class="count">{{ queue }}</span></button>
          </div>
          <template v-if="p.tile.parts.includes('player') && nowLine">
            <gex-marquee class="now" :text="nowWhat || nowLine" :tip="true" />
            <span v-if="nowState" class="state">{{ nowState }}</span>
          </template>
          <template v-if="p.tile.parts.includes('player')">
            <button v-if="votes" class="votes" :class="{ compact: p.state === 'compact' || p.w < 520 }" :title="votesTip" @click="emit('credit')">
              <span>👍 {{ compactNum(votes.likes) }}</span>
              <i v-if="share !== null" class="ratio" aria-hidden="true"><b :style="{ width: `${Math.round(share * 100)}%` }"></b></i>
              <span>👎 ~{{ compactNum(votes.dislikes) }}</span>
            </button>
            <button v-if="commentsHidden && !quickButton" class="quick" :class="{ on: quick }" :aria-pressed="!!quick"
                    :title="quick ? 'Close the comments over the video' : 'Write a comment: YouTube’s comments over the video, while you want them'"
                    @click="emit('quick', !quick)">{{ quick ? '✕ Comment' : '💬 Comment' }}</button>
            <button v-if="pip !== null && pip !== undefined" class="quick pip" :class="{ on: pip }" :aria-pressed="!!pip"
                    :title="pip ? 'Bring the video back from its floating window' : 'Picture in picture: the video in a floating window, over everything, while you do something else'"
                    @click="emit('pip')">⧉</button>
            <button v-if="barFolded !== null && barFolded !== undefined" class="quick" :class="{ on: barFolded }" :aria-pressed="!!barFolded"
                    v-gex-tooltip="barFolded ? { content: 'Show the bar', detail: 'Back, reload, Tiles, GEM YT…' } : { content: 'Fold the bar away', detail: 'More room for the video; this button brings it back' }"
                    @click="emit('fold-bar')">{{ barFolded ? '▾' : '▴' }}</button>
          </template>
          <button v-if="p.tile.panel && p.tile.panel.edge !== 'left' && p.tile.panel.edge !== 'right'" class="fold" :title="`Fold ${stripLabel(p.tile)}`" @click="fold(p.tile)">{{ p.tile.panel.edge === 'top' ? '︿' : '﹀' }}</button>
        </div>
        <!-- Our parts in their tile; YouTube's are placed there by GEM Shell (nothing of ours under them) -->
        <div v-if="!PAGE_PARTS.has(p.tile.active)" class="body"
             :style="{ left: `${p.x}px`, top: `${p.y + HEAD}px`, width: `${p.w}px`, height: `${Math.max(0, p.h - HEAD)}px` }">
          <ChannelPart v-if="p.tile.active === 'channel'" :card="card" :playing="playing" :tags="tags" :now="now" :compact="p.state === 'compact'" :short="p.h - HEAD < 110" :tiny="p.h - HEAD < 64" :tall="p.h - HEAD >= 190" :encouraged="encouraged"
                       @open="emit('open', $event)" @open-handle="emit('openHandle', $event)" @toggle-tag="(t: string, c: string) => emit('toggleTag', t, c)"
                       @new-tag="emit('newTag', $event)" @show-tag="emit('showTag', $event)" @encourage="emit('encourage', $event)" />
        </div>
        <div v-else-if="p.tile.active === 'queue' && queueEmpty" class="body small"
             :style="{ left: `${p.x}px`, top: `${p.y + HEAD}px`, width: `${p.w}px`, height: `${Math.max(0, p.h - HEAD)}px` }">
          No queue yet. On any video, ⋮ › Add to queue: the videos play one after the other.
        </div>
        <div v-else-if="!place[p.tile.active]" class="body small" :style="{ left: `${p.x}px`, top: `${p.y + HEAD}px`, width: `${p.w}px`, height: `${Math.max(0, p.h - HEAD)}px` }">
          Too small to show {{ PART_LABELS[p.tile.active] }}
        </div>
      </template>
    </template>
    <!-- 0.7.1: 💬 Comment in the comments' tile (too small: its body's bottom right; another tab: its head) -->
    <button v-if="quickButton" class="quick placed" :class="{ on: quick }" :aria-pressed="!!quick"
            :style="{ left: `${quickButton.x}px`, top: `${quickButton.y}px`, width: `${quickButton.w}px`, height: `${QUICK_H}px` }"
            :title="quick ? 'Close the comments' : 'Write a comment: YouTube’s comments over the bottom of the video, while you want them'"
            :aria-label="quick ? 'Close the comments' : 'Comment'"
            @click="emit('quick', !quick)">{{ quickButton.icon ? (quick ? '✕' : '💬') : quick ? '✕ Comment' : '💬 Comment' }}</button>
    <!-- 0.5.2: the panels' fold tabs (like GEM Shell's side panels' flaps) -->
    <button v-for="t in foldTabs" :key="`tab-${t.p.tile.id}`" class="fold-tab" :class="t.right ? 'right' : 'left'"
            :style="{ left: `${t.x}px`, top: `${t.y}px`, width: `${TAB_W}px`, height: `${t.h}px` }"
            :title="t.p.state === 'folded' ? `Open ${stripLabel(t.p.tile)}` : `Fold ${stripLabel(t.p.tile)}`"
            :aria-label="t.p.state === 'folded' ? `Open ${stripLabel(t.p.tile)}` : `Fold ${stripLabel(t.p.tile)}`"
            @click="t.p.state === 'folded' ? unfold(t.p) : fold(t.p.tile)">{{ (t.p.state === 'folded') === t.right ? '‹' : '›' }}</button>
    <div v-for="sp in splitters" :key="sp.s.id" class="split" :class="sp.s.axis"
         :style="{ left: `${sp.x}px`, top: `${sp.y}px`, width: `${sp.w}px`, height: `${sp.h}px` }"
         :title="sp.s.axis === 'cols' ? 'Drag: wider / narrower' : 'Drag: taller / shorter'" @pointerdown="dragSplit($event, sp.s)"></div>
  </div>
</template>

<style scoped>
.tiles { position: absolute; inset: 0; overflow: hidden; background: var(--gex-bg, #0e0f12); color: var(--gex-fg, #e9eaee); }
.head { position: absolute; display: flex; gap: 6px; align-items: center; min-width: 0; padding: 0 2px 0 4px; overflow: hidden; }
.tabs { display: flex; flex: 0 1 auto; gap: 2px; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
/* 0.11.2: tabs that don't fit scroll (the wheel), never hidden */
.tab { flex: 0 0 auto; height: 22px; padding: 0 9px; border: 0; border-radius: 6px 6px 0 0; color: var(--gex-fg-muted, #a6a9b1); background: transparent;
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
.tab:hover { color: var(--gex-fg, #e9eaee); }
.tab.on { color: var(--gex-fg, #e9eaee); background: var(--gex-surface, #16171b); box-shadow: inset 0 -2px 0 var(--gex-accent, #ff4545); }
.tab.only { cursor: default; background: transparent; box-shadow: none; }
.compact .tab { padding: 0 6px; letter-spacing: 0; }
.now { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--gex-fg, #e9eaee); font-size: 12px; font-weight: 600; }
.state { flex: 0 0 auto; color: var(--gex-fg-muted, #a6a9b1); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.votes { flex: 0 0 auto; display: flex; gap: 8px; align-items: center; height: 22px; padding: 0 12px; margin-right: 2px; border: 1px solid var(--gex-border, #ffffff1f); border-radius: 11px;
  color: var(--gex-fg, #e9eaee); background: var(--gex-surface, #16171b); font-size: 11px; font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; }
.votes:hover { border-color: var(--gex-accent, #ff4545); }
.ratio { position: relative; display: block; width: 44px; height: 4px; overflow: hidden; border-radius: 2px; background: color-mix(in srgb, var(--gex-fg-muted, #a6a9b1) 45%, transparent); }
.ratio b { position: absolute; inset: 0 auto 0 0; background: var(--gex-fg, #e9eaee); }
.votes.compact .ratio { display: none; }
.quick { flex: 0 0 auto; height: 22px; padding: 0 9px; border: 1px solid var(--gex-border, #ffffff1f); border-radius: 11px; color: var(--gex-fg, #e9eaee);
  background: var(--gex-surface, #16171b); font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.quick.placed { position: absolute; z-index: 3; padding: 0; border-radius: 12px; }
.quick:hover, .quick.on { border-color: var(--gex-accent, #ff4545); }
.quick.on { color: var(--gex-accent-fg, #fff); background: var(--gex-accent, #ff4545); }
.fold { flex: 0 0 auto; margin-left: auto; width: 24px; height: 22px; border: 0; border-radius: 5px; color: var(--gex-fg-muted, #a6a9b1); background: transparent; font-size: 14px; cursor: pointer; }
.fold:hover, .strip:hover { color: var(--gex-fg, #e9eaee); background: var(--gex-surface, #16171b); }
.body { position: absolute; box-sizing: border-box; padding: 10px; border-radius: 0 0 8px 8px; background: var(--gex-surface, #16171b); overflow: hidden; }
.body.small { display: grid; place-items: center; color: var(--gex-fg-muted, #a6a9b1); font-size: 11px; text-align: center; }
.strip { position: absolute; display: flex; gap: 8px; align-items: center; padding: 8px 0; overflow: hidden; border: 1px solid var(--gex-border, #ffffff1f); border-radius: 8px;
  color: var(--gex-fg-muted, #a6a9b1); background: transparent; cursor: pointer; }
.strip.down { flex-direction: column; }
.strip.across { padding: 0 8px; }
.strip-icon { display: grid; place-items: center; width: 22px; height: 22px; overflow: hidden; border-radius: 50%; font-size: 13px; }
.strip-icon img { width: 100%; height: 100%; object-fit: cover; }
.strip-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
.strip.down .strip-label { writing-mode: vertical-rl; }
.count { margin-left: 6px; padding: 0 5px; border-radius: 8px; color: var(--gex-accent-fg, #fff); background: var(--gex-accent, #ff4545); font-size: 10px; letter-spacing: 0; }
.fold-tab { position: absolute; z-index: 3; display: grid; place-items: center; padding: 0; border: 1px solid var(--gex-border, #ffffff26);
  color: var(--gex-fg-muted, #a6a9b1); background: var(--gex-surface, #16171b); font-size: 14px; line-height: 1; cursor: pointer; }
.fold-tab.right { border-right: 0; border-radius: 7px 0 0 7px; }
.fold-tab.left { border-left: 0; border-radius: 0 7px 7px 0; }
.fold-tab:hover { color: var(--gex-accent-fg, #fff); background: var(--gex-accent, #ff4545); border-color: var(--gex-accent, #ff4545); }
.split { position: absolute; z-index: 2; }
.split.cols { cursor: col-resize; }
.split.rows { cursor: row-resize; }
.split::after { content: ''; position: absolute; border-radius: 2px; background: var(--gex-accent, #ff4545); opacity: 0; transition: opacity .12s; }
.split.cols::after { left: calc(50% - 1px); top: 0; bottom: 0; width: 2px; }
.split.rows::after { top: calc(50% - 1px); left: 0; right: 0; height: 2px; }
.split:hover::after { opacity: 1; }
</style>
