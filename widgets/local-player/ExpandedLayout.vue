<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { GexScrollAreaRef, TooltipOptions } from 'gexplorer/widgets'
import type { Track } from './usePlayerState'
import { reasonText } from './usePlaylist'
import { useVolumePopover } from './useVolumePopover'

/**
 * A track's tooltip: its name, then its length (the playing one: the element's); a greyed
 * one says why it can't play and that playing it tries again.
 */
function rowTip(t: Track) {
  const isCurrent = t.id === props.queue[props.currentIndex]?.id
  const secs = isCurrent && props.duration ? props.duration : t.duration
  const lines: string[] = []
  if (secs) lines.push(fmtTime(secs))
  if (t.missing) lines.push(`Can't be played: ${reasonText(t.missingReason)}`, 'Double-click to try again')
  return lines.length ? { content: t.name, detail: lines.join('\n') } : t.name
}

const props = defineProps<{
  // State
  queue: Track[]
  displayQueue: Track[]
  currentIndex: number
  selectedIndex: number
  current: any
  hasTracks: boolean
  canPrev: boolean
  canNext: boolean
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  volume: number
  repeat: 'off' | 'one' | 'all'
  shuffle: boolean
  queueName: string
  volumeIcon: string
  playbackRate: number
  playbackRateLabel: string
  sortableState: any
  
  // UI
  layoutClass: string
  showQueue: boolean
  renaming: boolean
  draftQueueName: string
  isDropActive: boolean
  
  // Marquee
  marqueeOn: boolean
  marqueeDir: string
  resizePhase?: string
  
  // Refs
  setMarqueeBox: (el: Element | null) => void
  setMarqueeCopy: (el: Element | null) => void
}>()

const emit = defineEmits<{
  (e: 'toggle-play'): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'seek', event: Event): void
  (e: 'adjust-speed', delta: number): void
  (e: 'toggle-shuffle'): void
  (e: 'toggle-repeat'): void
  (e: 'click-pick'): void
  (e: 'toggle-mute'): void
  (e: 'vol-input', value: number): void
  (e: 'toggle-queue'): void
  (e: 'begin-rename'): void
  (e: 'cancel-rename'): void
  (e: 'commit-rename'): void
  (e: 'update:draft-queue-name', value: string): void
  (e: 'save-playlist'): void
  (e: 'clear-queue'): void
  (e: 'row-dblclick', track: Track): void
  (e: 'row-click', index: number): void
  (e: 'start-row-drag', index: number, event: MouseEvent): void
  (e: 'remove-at', index: number): void
  (e: 'row-menu', track: Track, event: MouseEvent): void
}>()

const renameOverlayPos = ref<{ left: number; top: number; width: number } | null>(null)

const controlsEl = ref<HTMLElement | null>(null)
// The list scrolls in the shell's scroll area (2026-10-23): its strips, its minimum (two rows),
// the place keeps the player tall enough for it. queueEl: its scrolling element (drag reorder).
const queueArea = ref<GexScrollAreaRef | null>(null)
const queueEl = computed(() => queueArea.value?.el ?? null)
const nameInput = ref<HTMLInputElement | null>(null)
// 🔊: the slider in the shell's popover (useVolumePopover.ts)
const volPop = useVolumePopover({
  volume: () => props.volume,
  onInput: (v) => emit('vol-input', v),
  onMute: () => emit('toggle-mute'),
})

const isPressing = ref(false)

// Narrow classes: two fixed control rows (transport, then the rest) instead of clipping.
const compact = computed(() => ['narrow', 'ultra', 'micro'].includes(props.layoutClass))

const playTooltip = computed((): TooltipOptions => {
  const head = props.isPlaying ? 'Pause' : 'Play'
  const name = props.current?.name
  const timeLine = `${fmtTime(props.currentTime)} / ${fmtTime(props.duration || 0)}`
  return name
    ? { content: head, detail: `${name}\n${timeLine}` }
    : { content: head }
})

const seekTooltip = computed((): TooltipOptions => ({
  content: fmtTime(props.currentTime) + ' / ' + fmtTime(props.duration || 0),
}))

// ✎: the rename box over the queue's head, as wide as the player allows.
const queueHeadEl = ref<HTMLElement | null>(null)

function onBeginRename() {
  const el = queueHeadEl.value
  if (!el) return
  const r = el.getBoundingClientRect()

  // measure the widget container
  const container = (el.closest('.player-root') as HTMLElement)?.getBoundingClientRect()
  const containerLeft = container?.left ?? 0
  const containerWidth = container?.width ?? Math.min(420, window.innerWidth)

  // desired width = the head's width, at least 220, clamped to the container
  const desired = Math.max(220, Math.min(r.width, containerWidth - 24))

  // keep overlay within container bounds
  const left = Math.max(containerLeft + 4, Math.min(r.left, containerLeft + containerWidth - desired - 12))

  renameOverlayPos.value = { left, top: r.top, width: desired }
  emit('begin-rename')
}

function fmtTime(sec: number) {
  if (!isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  if (t.closest('.queue-area')) isPressing.value = true
}

function onPointerUp() {
  isPressing.value = false
}

const onRowClick = (index: number, event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('.icon-btn')) return
  const track = props.displayQueue[index]
  const realIndex = props.queue.findIndex(t => t.id === track.id)
  console.log('[ExpandedLayout] Display index:', index, 'Real index:', realIndex)
  emit('row-click', realIndex)
}

onMounted(() => {
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('blur', onPointerUp)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('blur', onPointerUp)
})

defineExpose({ controlsEl, queueEl, nameInput })
</script>

<template>
  <div
    class="player-root"
    :class="[layoutClass, { 'drag-over': isDropActive, dragging: sortableState.isDragging, pressing: isPressing }]"
    @pointerdown="onPointerDown"
  >
    <!-- Controls -->
    <div class="controls" :class="layoutClass" ref="controlsEl">
      <!-- Row 1 -->
      <div class="row-1">
        <!-- Adding files: the ➕ under the queue's name (and the empty queue's button), every layout -->

        <!-- Transport controls -->
        <div class="transport-group">
          <button
            class="btn transport-btn narrow"
            type="button"
            :disabled="!canPrev"
            v-gex-tooltip="'Previous track'"
            @click="emit('prev')"
          >
            ⏮
          </button>
          <button
            class="btn transport-btn primary"
            :class="{ loading: isLoading }"
            type="button"
            :disabled="!hasTracks"
            v-gex-tooltip="playTooltip"
            @click="emit('toggle-play')"
          >
            {{ isPlaying ? '⏸' : '▶' }}
          </button>
          <button
            class="btn transport-btn narrow"
            type="button"
            :disabled="!canNext"
            v-gex-tooltip="'Next track'"
            @click="emit('next')"
          >
            ⏭
          </button>
        </div>

        <!-- The rest: on row 1 in wide / medium; its own row in the narrow classes (CSS) -->
        <div class="aux-group">
        <!-- Playback Rate -->
        <button
          v-if="layoutClass !== 'micro'"
          class="btn narrow"
          type="button"
          v-gex-tooltip="{ content: 'Playback speed', detail: 'Left-click to increase · Right-click to decrease' }"
          @click="emit('adjust-speed', 0.1)"
          @contextmenu.prevent.stop="emit('adjust-speed', -0.1)"
        >
          {{ playbackRateLabel }}
        </button>

        <!-- Shuffle -->
        <button
          class="btn narrow"
          :class="{ active: shuffle }"
          type="button"
          v-gex-tooltip="{ content: shuffle ? 'Shuffle: On' : 'Shuffle: Off', detail: 'Randomises playback order' }"
          @click="emit('toggle-shuffle')"
        >
          🔀
        </button>

        <!-- Repeat -->
        <button
          class="btn narrow"
          :class="{ active: repeat !== 'off' }"
          type="button"
          v-gex-tooltip="{ content: repeat === 'off' ? 'Repeat: Off' : repeat === 'all' ? 'Repeat: All' : 'Repeat: One', detail: 'Click to cycle: Off → All → One' }"
          @click="emit('toggle-repeat')"
        >
          {{ repeat === 'one' ? '🔂' : '🔁' }}
        </button>

        <!-- Volume (with popover) -->
        <button
          class="btn vol-btn narrow"
          :class="{ active: volPop.open.value }"
          type="button"
          :aria-expanded="volPop.open.value ? 'true' : 'false'"
          v-gex-tooltip="{ content: `Volume: ${Math.round(volume * 100)}%`, detail: 'Click to open volume slider' }"
          @click="volPop.toggle"
        >
          {{ volumeIcon }}
        </button>
        </div>
      </div>

      <!-- Row 2: Seek bar + time -->
      <div class="row-2 timeline">
        <span v-if="layoutClass !== 'micro'" class="mono time-label">{{ fmtTime(currentTime) }}</span>
        
        <div class="seek-wrap">
          <input
            class="seek"
            type="range"
            min="0"
            max="1"
            step="0.001"
            v-gex-tooltip="seekTooltip"
            :value="duration ? currentTime / duration : 0"
            :disabled="!hasTracks || !duration"
            @input="emit('seek', $event)"
          />
        </div>
        
        <span v-if="layoutClass === 'wide'" class="mono time-label">-{{ fmtTime(Math.max(0, (duration || 0) - currentTime)) }}</span>
      </div>
    </div>

    <!-- Queue head (2026-10-09): the shared fold header — double-click folds / unfolds the
         list, ✎ renames; a long name scrolls instead of pushing anything out. -->
    <div v-if="queue.length" ref="queueHeadEl" class="queue-head">
      <gex-fold-header
        :label="queueName"
        :status="String(queue.length)"
        :folded="!showQueue"
        :hint="showQueue ? 'Double-click to fold the list' : 'Double-click to show the list'"
        @update:folded="emit('toggle-queue')"
      >
        <template #actions>
          <button class="icon-btn qh-edit" type="button" v-gex-tooltip="'Rename the playlist'" @click.stop="onBeginRename">✎</button>
        </template>
      </gex-fold-header>
      <div
        v-if="renaming && renameOverlayPos"
        class="rename-overlay"
        :style="{
            left: renameOverlayPos.left + 'px',
            top: renameOverlayPos.top + 'px',
            width: renameOverlayPos.width + 'px'
        }"
      >
        <input
            ref="nameInput"
            class="qh-input big"
            :value="draftQueueName"
            @input="emit('update:draft-queue-name', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('commit-rename')"
            @keydown.esc.prevent="emit('cancel-rename')"
            @blur="emit('commit-rename')"
        />
        <div class="ro-actions">
            <button class="icon-btn" v-gex-tooltip="'Save name'" @mousedown.prevent @click="emit('commit-rename')">✓</button>
            <button class="icon-btn" v-gex-tooltip="'Cancel rename'" @mousedown.prevent @click="emit('cancel-rename')">✕</button>
        </div>
      </div>
    </div>

    <!-- Under the head: 🗑 on the left, ➕ 💾 on the right -->
    <div v-if="queue.length" class="queue-tools">
      <div class="qt-side qt-left">
        <button class="icon-btn" type="button" v-gex-tooltip="'Clear the queue'" @click="emit('clear-queue')">🗑</button>
      </div>
      <div class="qt-side qt-right">
        <button class="icon-btn" type="button" v-gex-tooltip="{ content: 'Add to the queue', detail: 'Audio files and playlists' }" @click.stop.prevent="emit('click-pick')">➕</button>
        <button class="icon-btn" type="button" v-gex-tooltip="{ content: 'Save playlist to file', detail: 'M3U8: opens in other players too' }" @click="emit('save-playlist')">💾</button>
      </div>
    </div>

    <!-- Queue List: the column header stays put, the rows scroll (at least two shown) -->
    <gex-scroll-area
    v-if="queue.length && showQueue"
    ref="queueArea"
    class="queue-area"
    :min-rows="2"
    >
    <template #head>
        <div class="row header">
            <span>#</span><span>Title</span><span class="dur">Length</span><span class="act"></span>
        </div>
    </template>

    <div
        v-for="(t, i) in displayQueue"
        :key="t.id"
        :data-track-id="t.id"
        class="row item"
        :class="{
        skipped: t.missing,
        'is-dragging': sortableState.isDragging && sortableState.draggingId === t.id,
        current: t.id === queue[currentIndex]?.id,
        selected: t.id === queue[selectedIndex]?.id
        }"
        @dblclick="emit('row-dblclick', t)"
        @click="onRowClick(i, $event)"
        @contextmenu="emit('row-menu', t, $event)"
        @pointerdown="emit('start-row-drag', i, $event)"
    >
        <span class="idx">{{ i + 1 }}</span>

        <span class="title" v-gex-tooltip="rowTip(t)">
        <template v-if="t.id === queue[currentIndex]?.id">
            <span
            :ref="setMarqueeBox"
            class="marquee"
            :class="{ run: marqueeOn, suspend: resizePhase === 'active' }"
            :data-dir="marqueeDir"
            >
            <span class="marquee-track">
                <span :ref="setMarqueeCopy" class="copy">{{ t.name }}</span>
                <span class="copy" aria-hidden="true">{{ t.name }}</span>
            </span>
            </span>
        </template>
        <template v-else>
            {{ t.name }}
        </template>
        <span v-if="t.missing" class="skip-tag">[missing]</span>
        </span>

        <!-- Narrowest lists (no ✕ column): a ✕ over the title's end, on hover / selection -->
        <button
            v-if="['ultra', 'micro'].includes(layoutClass)"
            class="icon-btn row-x"
            type="button"
            v-gex-tooltip="{ content: 'Remove from queue', detail: 'Or select it and press Delete' }"
            @click.stop="emit('remove-at', i)"
            @pointerdown.stop
        >
            ✕
        </button>

        <span class="dur">
          {{
            t.id === queue[currentIndex]?.id
              ? fmtTime(duration || 0)
              : (t.duration ? fmtTime(t.duration) : '—')
          }}
        </span>

        <span class="act">
        <button
            class="icon-btn"
            type="button"
            v-gex-tooltip="'Remove from queue'"
            @click.stop="emit('remove-at', i)"
        >
            ✕
        </button>
        </span>
    </div>
    </gex-scroll-area>
    <!-- Empty State -->
    <div v-if="queue.length === 0" class="empty">
      <p>Drop audio files here or</p>
      <button class="btn" type="button" @click.stop.prevent="emit('click-pick')">Add files…</button>
    </div>
  </div>
</template>

<style scoped>
:root { --control-row-h: 38px; --btn-h: 32px; }

/* in ExpandedLayout.vue <style scoped> */
.empty {
  margin: 8px auto 0;   /* instead of just 'auto' */
  text-align: center;
  opacity: 0.85;
}

/* ====================== ROOT ====================== */
.player-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-sm, 8px);
  box-sizing: border-box;
}
.player-root.drag-over { outline: 2px dashed var(--accent, #4ea1ff); outline-offset: -2px; }
.player-root.dragging, .player-root.dragging * { user-select: none; }

/* ====================== CONTROLS (FLEX HARD LOCK) ====================== */
.controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}
.row-1 {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--btn-h);
}
.row-2 {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--btn-h);
}

.transport-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.seek-wrap {
  height: var(--btn-h);
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 48px;
}
.seek { width: 100%; height: 4px; }
.time-label { opacity: 0.8; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Secondary buttons (speed, shuffle, repeat, volume); wide / medium: at the row's right end */
.aux-group { display: flex; align-items: center; gap: 8px; min-width: 0; }
.controls.wide .aux-group,
.controls.medium .aux-group { margin-left: auto; }
.player-root.micro .aux-group .btn { padding: 0 4px; min-width: 0; }

/* Narrow classes: two fixed rows, transport centred, the rest spread below */
.controls.narrow .row-1,
.controls.ultra .row-1,
.controls.micro .row-1 { flex-wrap: wrap; height: auto; row-gap: 6px; }
.controls.narrow .transport-group,
.controls.ultra .transport-group,
.controls.micro .transport-group { flex: 1 0 100%; justify-content: center; }
.controls.narrow .aux-group,
.controls.ultra .aux-group,
.controls.micro .aux-group { flex: 1 0 100%; justify-content: space-between; gap: 4px; }

/* Layout tweaks (no height changes) */
.controls.wide .row-2,
.controls.medium .row-2 { justify-content: space-between; }
.controls.narrow .row-1 { justify-content: space-between; }
.controls.narrow .row-2 { gap: 8px; }
.controls.ultra .row-1, .controls.micro .row-1 { gap: 4px; }

.player-root.ultra .transport-group,
.player-root.micro .transport-group { gap: 4px; }

/* Buttons always same height; width may vary by layout */
.btn {
  height: var(--btn-h);
  line-height: calc(var(--btn-h) - 2px);
  padding: 0 8px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  cursor: pointer;
  transition: all 0.12s ease;
}
.player-root.ultra .btn, .player-root.micro .btn { height: var(--btn-h); }
.btn:hover:not(:disabled) { background: var(--surface-3, #333); border-color: var(--accent, #4ea1ff); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { border-color: var(--accent, #4ea1ff); box-shadow: 0 0 0 1px var(--accent, #4ea1ff) inset; }
.btn.active { color: var(--accent, #4ea1ff); }
.btn.narrow { padding: 0 6px; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
.btn.loading { animation: pulse 0.6s ease-in-out infinite; }

/* Ultra/Micro compact widths for Add/Vol */
.player-root.ultra .btn.add-left,
.player-root.ultra .btn.add-right,
.player-root.micro .btn.add-left,
.player-root.micro .btn.add-right,
.player-root.ultra .vol-btn,
.player-root.micro .vol-btn {
  min-width: 26px; width: 26px; padding: 0; text-align: center;
}

/* ====================== QUEUE HEAD (gex-fold-header, restyled) ====================== */
.queue-head { margin-top: 8px; min-width: 0; }
.queue-head .gex-fold-header {
  height: 28px; padding: 0 4px 0 8px; font-size: 13px; font-weight: 600; letter-spacing: 0;
  opacity: 1; border: 1px solid var(--border, #555); border-radius: var(--radius-sm, 6px);
  background: var(--surface-1, #1a1a1a);
}
.queue-head .gex-fold-header.folded { border-bottom-color: var(--border, #555); }
.queue-head .gex-fold-header:hover { background: var(--surface-3, #333); }
.qh-input { height: 24px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--border, #555);
  background: var(--surface-2, #222); color: var(--fg, #eee);
}
.icon-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--border, #555);
  display: grid; place-items: center; background: var(--surface-2, #222); color: var(--fg, #eee);
  cursor: pointer; transition: all 0.12s ease;
}
.icon-btn:hover { background: var(--surface-3, #333); border-color: var(--accent, #4ea1ff); }

/* ====================== QUEUE TOOLS ====================== */
/* 🗑 | ➕ 💾 under the head */
.queue-tools {
  display: flex; justify-content: space-between; align-items: center;
  margin: 4px 0 6px; min-width: 0;
}
.qt-side { display: flex; gap: 6px; min-width: 0; }

/* ====================== QUEUE LIST ====================== */
.queue-area { flex: 0 1 auto; }
.queue-area :deep(.gsa-view) { contain: layout paint; overflow-anchor: none; }

.row {
  display: grid;
  grid-template-columns: 36px 1fr 70px 40px;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  background: var(--surface-2, #222);
  transition: border-color 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
}
.row.header {
  background: var(--surface-2, #222);
  font-weight: 600; border-top: none; box-shadow: none;
}
.row.item { cursor: grab; position: relative; }

/* ✕ over the title's end (ultra / micro: no ✕ column) */
.row-x {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  opacity: 0; pointer-events: none; transition: opacity .12s ease;
  box-shadow: -10px 0 10px var(--surface-2, #222);
}
.row.item:hover .row-x,
.row.item.selected .row-x { opacity: 1; pointer-events: auto; }
.row.item:active { cursor: grabbing; }
.row.item.selected { outline: 2px solid var(--accent, #4ea1ff); outline-offset: -2px; }
.row.item.current {
  position: relative; background: linear-gradient(90deg, rgba(78,161,255,0.10), transparent 60%);
  box-shadow: inset 0 0 0 1px rgba(78,161,255,0.28);
}
.row.item.current::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 3px;
  background: var(--accent, #4ea1ff); border-radius: 2px;
}
.row.item.current .title { font-weight: 600; color: #d9ecff; }
.row.item.is-dragging { border: 2px solid var(--accent, #4ea1ff); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28); opacity: 1; z-index: 10; }

/* "X" remove only on hover/selection */
.row.item .act .icon-btn { opacity: 0; pointer-events: none; transition: opacity .12s ease; }
.row.item:hover .act .icon-btn,
.row.item.selected .act .icon-btn { opacity: 1; pointer-events: auto; }

.player-root.pressing .row.item:hover { background: rgba(78, 161, 255, 0.12); outline: 1px solid var(--accent, #4ea1ff); outline-offset: -1px; }

.idx { opacity: 0.6; }
.title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: block; min-width: 0; }
.dur { text-align: right; opacity: 0.8; }
.act { display: flex; justify-content: flex-end; }

.row.skipped { opacity: 0.7; filter: grayscale(0.2); }
.skip-tag { opacity: 0.75; font-style: normal; }

/* Narrowest list: only Title */
.player-root.ultra .queue-area .row,
.player-root.micro .queue-area .row { grid-template-columns: 1fr; }
.player-root.ultra .queue-area .idx,
.player-root.ultra .queue-area .dur,
.player-root.ultra .queue-area .act,
.player-root.micro .queue-area .idx,
.player-root.micro .queue-area .dur,
.player-root.micro .queue-area .act { display: none; }
.player-root.ultra .queue-area .row.header,
.player-root.micro .queue-area .row.header { grid-template-columns: 1fr; }
.player-root.ultra .queue-area .row.header > :first-child,
.player-root.micro .queue-area .row.header > :first-child { display: none; }
.player-root.ultra .queue-area .row.header .dur,
.player-root.ultra .queue-area .row.header .act,
.player-root.micro .queue-area .row.header .dur,
.player-root.micro .queue-area .row.header .act { display: none; }

/* Allow timeline to be narrower so nothing overflows */
.player-root.ultra .timeline .seek,
.player-root.micro .timeline .seek { min-width: 48px; }

.add-left, .add-right { margin-right: auto; }

/* ====================== MARQUEE ====================== */
.marquee {
  position: relative; display: block; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
}
.marquee .marquee-track { display: flex; will-change: transform; transform: translate3d(0,0,0); gap: var(--gap, 28px); }
.marquee .copy[aria-hidden="true"] { visibility: hidden; }
.marquee.run .copy[aria-hidden="true"] { visibility: visible; }
.marquee .copy { flex: 0 0 auto; min-width: max-content; }
.marquee.run[data-dir="left"]  .marquee-track { animation: slide-left  var(--marquee-dur, 12s) linear infinite both; }
.marquee.run[data-dir="right"] .marquee-track { flex-direction: row-reverse; animation: slide-right var(--marquee-dur, 12s) linear infinite both; }
@keyframes slide-left  { from { transform: translate3d(0,0,0); } to { transform: translate3d(calc(-1 * var(--travel, 300px)),0,0); } }
@keyframes slide-right { from { transform: translate3d(var(--travel, 300px),0,0); } to { transform: translate3d(0,0,0); } }
.marquee:hover .marquee-track, .marquee:focus-within .marquee-track { animation-play-state: paused; }
.marquee.suspend .marquee-track { animation: none !important; transform: translate3d(0,0,0) !important; }
.marquee.run .marquee-track { animation-play-state: running !important; }

/* ====================== RENAME OVERLAY ====================== */
.rename-overlay {
  max-width: 92vw; position: fixed; z-index: 10000;
  background: var(--surface-1, #1a1a1a); border: 1px solid var(--accent, #4ea1ff);
  border-radius: 8px; padding: 8px; box-shadow: 0 10px 28px rgba(0,0,0,0.35);
  display: flex; align-items: center; gap: 8px;
}
.rename-overlay .qh-input.big { width: 100%; height: 28px; }
.rename-overlay .ro-actions { display: flex; gap: 6px; }

</style>