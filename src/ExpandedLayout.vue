<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { createTipDirective } from 'gexplorer/widgets'
import type { Track } from './usePlayerState'

const vTip = createTipDirective({ force: true })

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
  dndState: any
  
  // UI
  layoutClass: string
  showQueue: boolean
  renaming: boolean
  draftQueueName: string
  
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
  (e: 'row-dblclick', track: Track): void
  (e: 'row-click', index: number): void
  (e: 'start-row-drag', index: number, event: MouseEvent): void
  (e: 'remove-at', index: number): void
  (e: 'drag-enter', event: DragEvent): void
  (e: 'drag-over', event: DragEvent): void
  (e: 'drag-leave', event: DragEvent): void
  (e: 'drop', event: DragEvent): void
}>()

const rowHeight = ref(0)         // px per row
const maxRows = ref(8)           // default visible rows
const headerOffset = ref(34)          // header/padding allowance, tweak if needed
const hasOverflow = ref(false)
const atTop = ref(true)
const atBottom = ref(true)

const renameOverlayPos = ref<{ left: number; top: number; width: number } | null>(null)

const controlsEl = ref<HTMLElement | null>(null)
const queueEl = ref<HTMLElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const volBtnEl = ref<HTMLElement | null>(null)

const showVolPop = ref(false)
const volPopStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
const isPressing = ref(false)
const draggingOver = ref(false)

let scrollScheduled = false
function onQueueScroll() {
  // rAF-throttled overflow calc
  if (scrollScheduled) return
  scrollScheduled = true
  requestAnimationFrame(() => {
    scrollScheduled = false
    updateOverflowState()
  })
}


const playTooltip = computed(() => {
  const head = props.isPlaying ? 'Pause' : 'Play'
  const name = props.current?.name
  const timeLine = `${fmtTime(props.currentTime)} / ${fmtTime(props.duration || 0)}`
  return name ? `${head}\n${name}\n${timeLine}` : head
})

const queueStyle = computed(() => ({
  maxHeight: rowHeight.value
    ? `${Math.max(3, maxRows.value) * rowHeight.value + headerOffset.value}px`
    : undefined
}))

const seekTooltip = computed(() =>
  fmtTime(props.currentTime) + ' / ' + fmtTime(props.duration || 0)
)
watch(() => props.displayQueue.length, () => requestAnimationFrame(updateOverflowState))
watch(() => props.showQueue, v => { if (v) nextTick(() => { measureQueueMetrics(); updateOverflowState() }) })

watch(
  [() => props.displayQueue.length, () => props.showQueue, rowHeight, maxRows],
  () => nextTick(() => {
        measureQueueMetrics()
        updateOverflowState()
    })
)

function updateOverflowState() {
  const el = queueEl.value
  if (!el) return
  const eps = Math.max(2, Math.round(rowHeight.value * 0.5)) // forgiving epsilon
  const sh = Math.ceil(el.scrollHeight)
  const ch = Math.ceil(el.clientHeight)
  const st = Math.ceil(el.scrollTop)

  hasOverflow.value = sh - ch > 2
  atTop.value = st <= eps
  atBottom.value = sh - (st + ch) <= eps
}

function onBeginRenameDblClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()

  // measure the widget container
  const container = (el.closest('.player-root') as HTMLElement)?.getBoundingClientRect()
  const containerLeft = container?.left ?? 0
  const containerWidth = container?.width ?? Math.min(420, window.innerWidth)

  // desired width = title width + padding, but clamp to container
  const desired = Math.max(220, Math.min(r.width + 120, containerWidth - 24))

  // keep overlay within container bounds
  const left = Math.min(
    r.left,
    containerLeft + containerWidth - desired - 12
  )

  renameOverlayPos.value = { left, top: r.top, width: desired }
  emit('begin-rename')
}

function measureQueueMetrics() {
  // header height
  const header = queueEl.value?.querySelector('.row.header') as HTMLElement | null
  const hh = Math.round(header?.getBoundingClientRect().height || 30)
  headerOffset.value = hh

  // first row height
  const sample = queueEl.value?.querySelector('.row.item') as HTMLElement | null
  const rh = Math.round(sample?.getBoundingClientRect().height || 32)
  rowHeight.value = Math.max(28, rh)
}


function fmtTime(sec: number) {
  if (!isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function toggleVolPop() {
  if (showVolPop.value) {
    showVolPop.value = false
    return
  }
  const btn = volBtnEl.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  volPopStyle.value = {
    left: `${Math.round(r.left + r.width / 2)}px`,
    top: `${Math.round(r.bottom + 8)}px`
  }
  showVolPop.value = true
}

function closeVolPop() {
  showVolPop.value = false
}

function onDocClick(e: MouseEvent) {
  if (!showVolPop.value) return
  const t = e.target as HTMLElement
  if (!t.closest('.vol-pop') && !volBtnEl.value?.contains(t)) {
    closeVolPop()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeVolPop()
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  if (t.closest('.queue')) isPressing.value = true
}

function onPointerUp() {
  isPressing.value = false
}

function volInput(e: Event) {
  emit('vol-input', parseFloat((e.target as HTMLInputElement).value))
}

const onRowClick = (index: number, event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('.icon-btn')) return
  const track = props.displayQueue[index]
  const realIndex = props.queue.findIndex(t => t.id === track.id)
  console.log('[ExpandedLayout] Display index:', index, 'Real index:', realIndex)
  emit('row-click', realIndex)
}

let resizeStartY = 0
let startRows = 0
function onStartResize(e: MouseEvent) {
  e.preventDefault()
  resizeStartY = e.clientY
  startRows = maxRows.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd, { once: true })
}

function onResizeMove(e: MouseEvent) {
  if (!rowHeight.value) return
  const dy = e.clientY - resizeStartY
  const deltaRows = Math.round(dy / rowHeight.value)
  maxRows.value = Math.max(3, startRows + deltaRows)
  nextTick(updateOverflowState)
}

function onResizeEnd() {
  window.removeEventListener('mousemove', onResizeMove)
}

onMounted(() => {
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('blur', onPointerUp)
  document.addEventListener('click', onDocClick, true)

  nextTick(() => {
    const sample = queueEl.value?.querySelector('.row.item') as HTMLElement | null
    rowHeight.value = Math.max(28, Math.round(sample?.getBoundingClientRect().height || 32))
    measureQueueMetrics()

  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('blur', onPointerUp)
  document.removeEventListener('click', onDocClick, true)
  queueEl.value?.removeEventListener('scroll', updateOverflowState)
})

defineExpose({ controlsEl, queueEl, nameInput, onDocClick, onKeydown })
</script>

<template>
  <div
    class="player-root"
    :class="[layoutClass, { 'drag-over': draggingOver, dragging: dndState.isDragging, pressing: isPressing }]"
    @pointerdown="onPointerDown"
    @dragenter="emit('drag-enter', $event)"
    @dragover="emit('drag-over', $event)"
    @dragleave="emit('drag-leave', $event)"
    @drop="emit('drop', $event)"
  >
    <!-- Controls -->
    <div class="controls" :class="layoutClass" ref="controlsEl">
      <!-- Row 1 -->
      <div class="row-1">
        <div class="transport-group">
          <!-- Speed controls (wide/medium only) -->
          <button
            v-if="layoutClass === 'wide' || layoutClass === 'medium'"
            class="btn speed"
            :title="`Slower (Current: ${playbackRateLabel})`"
            @click="emit('adjust-speed', -0.25)"
          >
            ◀◀
          </button>
          
          <!-- Transport -->
          <button
            v-if="layoutClass !== 'micro'"
            class="btn prev"
            :class="{ narrow: layoutClass === 'narrow' || layoutClass === 'ultra' }"
            title="Previous"
            :disabled="!canPrev"
            @click="emit('prev')"
          >
            ◀
          </button>
          
          <button
            class="btn primary play"
            :class="{ loading: isLoading }"
            v-tip="playTooltip"
            :disabled="!hasTracks"
            @click="emit('toggle-play')"
          >
            <span v-if="isLoading">⏳</span>
            <span v-else-if="isPlaying">⏸</span>
            <span v-else>▶</span>
          </button>
          
          <button
            v-if="layoutClass !== 'micro'"
            class="btn next"
            :class="{ narrow: layoutClass === 'narrow' || layoutClass === 'ultra' }"
            title="Next"
            :disabled="!canNext"
            @click="emit('next')"
          >
            ▶
          </button>
          
          <!-- Speed controls (wide/medium only) -->
          <button
            v-if="layoutClass === 'wide' || layoutClass === 'medium'"
            class="btn speed"
            :title="`Faster (Current: ${playbackRateLabel})`"
            @click="emit('adjust-speed', 0.25)"
          >
            ▶▶
          </button>
        </div>
        
        <!-- Modes (narrow only) -->
        <div v-if="layoutClass === 'narrow'" class="modes-group">
          <button class="btn" :class="{ active: shuffle }" title="Shuffle" @click="emit('toggle-shuffle')">
            🔀
          </button>
          <button class="btn" :class="{ active: repeat !== 'off' }" title="Repeat" @click="emit('toggle-repeat')">
            <span v-if="repeat === 'off'">🔁</span>
            <span v-else-if="repeat === 'all'">🔂</span>
            <span v-else>🔂1</span>
          </button>
        </div>
        
        <!-- Add button (ultra/micro) -->
        <button
          v-if="layoutClass === 'ultra' || layoutClass === 'micro'"
          class="btn add-right"
          title="Add files…"
          @click="emit('click-pick')"
        >
          +
        </button>
        
        <!-- Volume button -->
        <button
          ref="volBtnEl"
          class="btn vol-btn"
          :class="{ active: volume === 0 }"
          :title="`Volume: ${Math.round(volume * 100)}%`"
          @click.stop="toggleVolPop"
        >
          {{ volumeIcon }}
        </button>
      </div>
      
      <!-- Row 2 -->
      <div class="row-2" style="height: 38px;">
        <!-- Modes (wide/medium only) -->
        <div v-if="layoutClass === 'wide' || layoutClass === 'medium'" class="modes-group">
          <button class="btn" :class="{ active: shuffle }" title="Shuffle" @click="emit('toggle-shuffle')">
            🔀
          </button>
          <button class="btn" :class="{ active: repeat !== 'off' }" title="Repeat" @click="emit('toggle-repeat')">
            <span v-if="repeat === 'off'">🔁</span>
            <span v-else-if="repeat === 'all'">🔂</span>
            <span v-else>🔂1</span>
          </button>
          <button class="btn" title="Add files…" @click="emit('click-pick')">+</button>
        </div>
        
        <!-- Add button (narrow only) -->
        <button
          v-if="layoutClass === 'narrow'"
          class="btn add-left"
          title="Add files…"
          @click="emit('click-pick')"
        >
          +
        </button>
        
        <!-- Timeline -->
        <div class="timeline">
          <span v-if="layoutClass === 'wide'" class="mono time-label">{{ fmtTime(currentTime) }}</span>
          
          <div class="seek-wrap" v-tip="seekTooltip">
            <input
              class="seek"
              type="range"
              min="0"
              max="1"
              step="0.001"
              :value="duration ? currentTime / duration : 0"
              :disabled="!hasTracks || !duration"
              @input="emit('seek', $event)"
            />
          </div>
          
          <span v-if="layoutClass === 'wide'" class="mono time-label">-{{ fmtTime(Math.max(0, (duration || 0) - currentTime)) }}</span>
        </div>
      </div>
    </div>

    <!-- Volume popover -->
    <div v-if="showVolPop" class="vol-pop fixed" :style="volPopStyle" @click.stop>
      <input
        class="vol-vertical"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="volume"
        @input="volInput"
      />
    </div>

    <!-- Queue Header -->
    <div v-if="queue.length" class="queue-header">
      <div class="qh-left">
        <template v-if="!renaming">
          <strong class="qh-title" @dblclick="onBeginRenameDblClick" title="Double-click to rename">
            {{ queueName }}
          </strong>
        </template>
        <template v-else>
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
                <button class="icon-btn" title="Save" @mousedown.prevent @click="emit('commit-rename')">✓</button>
                <button class="icon-btn" title="Cancel" @mousedown.prevent @click="emit('cancel-rename')">✕</button>
            </div>
            </div>
        </template>
        <span class="count">{{ queue.length }}</span>
      </div>
      <div class="qh-actions">
        <button class="icon-btn" title="Save playlist" @click="emit('save-playlist')">💾</button>
      </div>
    </div>

    <!-- Queue Toggle (with top arrows flanking the button) -->
    <div v-if="queue.length" class="queue-collapse-tab">
    <span class="queue-top-hint" v-if="showQueue && hasOverflow && !atTop">
        <svg width="24" height="10" viewBox="0 0 24 10">
        <path d="M3,8 L12,2 L21,8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
    </span>

    <button
        class="tab-btn"
        :aria-expanded="showQueue"
        @click="emit('toggle-queue')"
        :title="showQueue ? 'Hide list' : 'Show list'">
        <span v-if="showQueue">▴</span><span v-else>▾</span>
    </button>

    <span class="queue-top-hint" v-if="showQueue && hasOverflow && !atTop">
        <svg width="24" height="10" viewBox="0 0 24 10">
        <path d="M3,8 L12,2 L21,8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
    </span>
    </div>
    
    <!-- Queue List -->
    <div
    v-if="queue.length && showQueue"
    class="queue"
    ref="queueEl"
    :style="queueStyle"
    @scroll="onQueueScroll"
    >
    <div class="row header">
        <span>#</span><span>Title</span><span class="dur">Length</span><span class="act"></span>
    </div>

    <div
        v-for="(t, i) in displayQueue"
        :key="t.id"
        :data-track-id="t.id"
        class="row item"
        :class="{
        skipped: t.missing,
        'is-dragging': dndState.isDragging && dndState.draggingId === t.id,
        current: t.id === queue[currentIndex]?.id,
        selected: t.id === queue[selectedIndex]?.id
        }"
        @dblclick="emit('row-dblclick', t)"
        @click="onRowClick(i, $event)"
        @pointerdown="emit('start-row-drag', i, $event)"
    >
        <span class="idx">{{ i + 1 }}</span>

        <span class="title" :title="t.name">
        <template v-if="t.id === queue[currentIndex]?.id">
            <span
            :ref="setMarqueeBox"
            class="marquee"
            :data-dir="marqueeDir"
            :class="{ run: marqueeOn && resizePhase !== 'active', suspend: resizePhase === 'active' }"
            >
            <span class="marquee-track">
                <span :ref="setMarqueeCopy" class="copy real">{{ t.name }}</span>
                <span class="copy twin" aria-hidden="true">{{ t.name }}</span>
            </span>
            </span>
        </template>
        <template v-else>
            {{ t.name }}
        </template>
        <em v-if="t.missing" class="skip-tag"> (skipped)</em>
        </span>

        <span class="dur mono" v-if="!t.missing && t.id === queue[currentIndex]?.id && duration">
        {{ fmtTime(duration) }}
        </span>
        <span class="dur mono" v-else>—</span>

        <span class="act">
        <button
            class="icon-btn"
            title="Remove"
            @click.stop="emit('remove-at', queue.findIndex(track => track.id === t.id))"
        >
            ✕
        </button>
        </span>
    </div>
    </div>

    <!-- Bottom resize/overflow indicator -->
    <div
    v-if="queue.length && showQueue"
    class="queue-resize-handle"
    @mousedown="onStartResize"
    title="Drag to resize list height"
    >
    <!-- down chevron when more below; line when at end -->
    <svg v-if="hasOverflow && !atBottom" width="24" height="10" viewBox="0 0 24 10">
        <path d="M3,2 L12,8 L21,2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <div v-else class="handle-line"></div>
    </div>
    <!-- Empty State -->
    <div v-if="queue.length === 0" class="empty">
      <p>Drop audio files here or</p>
      <button class="btn" @click="emit('click-pick')">Add files…</button>
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
  height: 100%;
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
  display: flex;                   /* <- switch to flex */
  flex-direction: column;
  row-gap: 8px;                    /* same spacing as before */
  height: calc(var(--control-row-h) * 2 + 8px);  /* 2 rows + gap */
  min-height: calc(var(--control-row-h) * 2 + 8px);
  padding: 6px 8px;
  background: var(--surface-1, #1a1a1a);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
  box-sizing: border-box;
}
.controls .row-1,
.controls .row-2 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 var(--control-row-h);  /* <- hard height per row */
  min-height: var(--control-row-h);
  height: var(--control-row-h);
}
.controls .row-1 > *,
.controls .row-2 > * { margin-top: 0; margin-bottom: 0; }
.row-1 .vol-btn { margin-left: auto; }

.transport-group, .modes-group { display: flex; gap: 8px; align-items: center; }
.transport-group { gap: 6px; }
.transport-group::after { content: ''; width: 1px; margin: 0 3px; }

/* Timeline never collapses */
.timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: var(--control-row-h);
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

/* ====================== VOLUME POPOVER ====================== */
.vol-pop.fixed {
  position: fixed; transform: translateX(-50%); padding: 8px;
  background: var(--surface-1, #1a1a1a); border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px); box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3); z-index: 9999;
}
.vol-vertical { writing-mode: vertical-rl; direction: ltr; height: 120px; }

/* ====================== QUEUE HEADER ====================== */
.queue-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 8px; padding: 6px 8px;
  border: 1px solid var(--border, #555); border-radius: var(--radius-sm, 6px);
  background: var(--surface-1, #1a1a1a);
}
.qh-left { display: flex; align-items: baseline; gap: 8px; }
.qh-title { cursor: text; }
.qh-input { height: 24px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--border, #555);
  background: var(--surface-2, #222); color: var(--fg, #eee);
}
.qh-actions { display: flex; gap: 6px; }
.count { opacity: 0.7; font-size: 12px; }
.icon-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--border, #555);
  display: grid; place-items: center; background: var(--surface-2, #222); color: var(--fg, #eee);
  cursor: pointer; transition: all 0.12s ease;
}
.icon-btn:hover { background: var(--surface-3, #333); border-color: var(--accent, #4ea1ff); }

/* ====================== QUEUE TOGGLE + TOP HINT ====================== */
.queue-collapse-tab {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin: 2px 0 6px;
}
.tab-btn {
  min-width: 44px; height: 14px; padding: 0 8px; line-height: 14px;
  border: 1px solid var(--border, #555); border-top: none; border-radius: 0 0 10px 10px;
  background: var(--surface-1, #1a1a1a); color: var(--fg, #eee);
  display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.12s ease;
}
.tab-btn:hover { background: var(--surface-3, #333); border-color: var(--accent, #4ea1ff); }
.queue-top-hint { width: 24px; height: 12px; display: grid; place-items: center; pointer-events: none; opacity: .7; }
.queue-top-hint svg { display: block; }

/* ====================== QUEUE LIST ====================== */
.queue {
  overflow-y: auto; overflow-x: hidden; contain: layout paint;
  scrollbar-width: none;
}
.queue::-webkit-scrollbar { width: 0; height: 0; }

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
  position: sticky; top: 0; background: var(--surface-2, #222);
  font-weight: 600; border-top: none; box-shadow: none; z-index: 5;
}
.row.item { cursor: grab; }
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

/* “X” remove only on hover/selection */
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
.player-root.ultra .queue .row,
.player-root.micro .queue .row { grid-template-columns: 1fr; }
.player-root.ultra .queue .idx,
.player-root.ultra .queue .dur,
.player-root.ultra .queue .act,
.player-root.micro .queue .idx,
.player-root.micro .queue .dur,
.player-root.micro .queue .act { display: none; }
.player-root.ultra .queue .row.header,
.player-root.micro .queue .row.header { grid-template-columns: 1fr; }
.player-root.ultra .queue .row.header > :first-child,
.player-root.micro .queue .row.header > :first-child { display: none; }
.player-root.ultra .queue .row.header .dur,
.player-root.ultra .queue .row.header .act,
.player-root.micro .queue .row.header .dur,
.player-root.micro .queue .row.header .act { display: none; }

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

/* ====================== BOTTOM HANDLE ====================== */
.queue-resize-handle {
  height: 18px; margin-top: 6px; cursor: ns-resize;
  background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.10), transparent);
  border-radius: 6px; display: grid; place-items: center;
}
.queue-resize-handle svg { opacity: .7; }
.queue-resize-handle .handle-line {
  width: 36px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.28);
}

</style>