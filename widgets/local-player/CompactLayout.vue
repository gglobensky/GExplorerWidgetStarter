<script setup lang="ts">
import type { TooltipOptions } from 'gexplorer/widgets'
import { useVolumePopover } from './useVolumePopover'

const props = defineProps<{
  current: any
  hasTracks: boolean
  isPlaying: boolean
  volume: number
  volumeIcon: string
  layoutClass?: string   // the width class; the compact strip doesn't style by it (Widget.vue doesn't pass it)
  playTooltip: TooltipOptions | string   // a text, or the tooltip's options (v-gex-tooltip takes both)
  isDropActive: boolean
}>()

const emit = defineEmits<{
  (e: 'click-pick'): void
  (e: 'vol-input', value: number): void
  (e: 'toggle-mute'): void
}>()

// 🔊: the slider in the shell's popover (useVolumePopover.ts), as in the expanded layout
const volPop = useVolumePopover({
  volume: () => props.volume,
  onInput: (v) => emit('vol-input', v),
  onMute: () => emit('toggle-mute'),
})
</script>

<template>
  <div 
    class="compact"
    :class="[layoutClass, { 'drag-over': isDropActive }]"
  >
    <!-- Title strip with volume button at right -->
    <div class="compact-title" v-gex-tooltip="playTooltip">
      <span class="title-text">{{ current?.name || 'No track' }}</span>
      <button
        class="btn vol-in-title"
        :class="{ active: volume === 0 || volPop.open.value }"
        v-gex-tooltip="{ content: `Volume: ${Math.round(volume * 100)}%`, detail: 'Click to open volume slider' }"
        :aria-expanded="volPop.open.value ? 'true' : 'false'"
        @click.stop="volPop.toggle"
      >
        {{ volumeIcon }}
      </button>
    </div>

    <!-- Single-row controls -->
    <div class="compact-controls">
      <!-- The play-pause command (entry.ts): a click runs it as Space does; the tooltip shows its keys -->
      <button class="btn" v-gex-command="{ id: 'play-pause', content: isPlaying ? 'Pause' : 'Play', detail: current?.name }" :disabled="!hasTracks">
        <span v-if="isPlaying">⏸</span><span v-else>▶</span>
      </button>
      <button class="btn" v-gex-tooltip="'Add files to the queue'" @click="emit('click-pick')">+</button>
    </div>
  </div>
</template>

<style scoped>
.compact {
  --lp-px: var(--gex-px, 1px);   /* one px at 100 % Text size (ExpandedLayout.vue says why) */
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* 1.0.7 (2026-11-14): never wider than the widget's box (its right edge was cut off): every part may shrink */
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  /* 1.0.8: a little room on the sides (Guillaume: in a hub's grid, next to another widget, the right border was hidden
     under it at any text size; the box the grid gives seems a few px wider than its cell) */
  padding: 0 3px;
}

.compact-title {
  position: relative;
  text-align: center;
  font-weight: 600;
  padding: 2px calc(var(--lp-px) * 36);
  box-sizing: border-box;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--gex-bg, #1a1a1a);
  border: 1px solid var(--gex-border, #555);
  border-radius: var(--radius-sm, 6px);
}

.compact-title .vol-in-title {
  position: absolute;
  right: 6px;
  /* CHANGED (2026-11-14): inside the strip whatever the text size (a fixed height went past its top and bottom) */
  top: 2px;
  bottom: 2px;
  height: auto;
  padding: 0 6px;
}

.compact-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-sm, 8px);
  align-items: stretch;
  justify-items: stretch;
}

.btn {
  font-family: inherit; font-size: inherit;   /* a <button> doesn't inherit the text size by itself */
  height: calc(var(--lp-px) * 28);
  box-sizing: border-box;
  min-width: 0;
  padding: 0 8px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--gex-border, #555);
  background: var(--gex-surface, #222);
  color: var(--gex-fg, #eee);
  cursor: pointer;
  transition: all 0.12s ease;
}

.btn:hover:not(:disabled) {
  background: var(--gex-surface-2, #333);
  border-color: var(--gex-accent, #4ea1ff);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.active {
  border-color: var(--gex-accent, #4ea1ff);
  box-shadow: 0 0 0 1px var(--gex-accent, #4ea1ff) inset;
}
</style>