<script setup lang="ts">
import type { TooltipOptions } from 'gexplorer/widgets'
import { useVolumePopover } from './useVolumePopover'

const props = defineProps<{
  current: any
  hasTracks: boolean
  isPlaying: boolean
  volume: number
  volumeIcon: string
  layoutClass: string
  playTooltip: TooltipOptions
  isDropActive: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-play'): void
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
      <button class="btn" v-gex-tooltip="playTooltip" :disabled="!hasTracks" @click="emit('toggle-play')">
        <span v-if="isPlaying">⏸</span><span v-else>▶</span>
      </button>
      <button class="btn" v-gex-tooltip="'Add files to the queue'" @click="emit('click-pick')">+</button>
    </div>
  </div>
</template>

<style scoped>
.compact {
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compact-title {
  position: relative;
  text-align: center;
  font-weight: 600;
  padding: 2px 36px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--surface-1, #1a1a1a);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
}

.compact-title .vol-in-title {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  height: 22px;
  padding: 0 6px;
}

.compact-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm, 8px);
  align-items: stretch;
  justify-items: stretch;
}

.btn {
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  cursor: pointer;
  transition: all 0.12s ease;
}

.btn:hover:not(:disabled) {
  background: var(--surface-3, #333);
  border-color: var(--accent, #4ea1ff);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.active {
  border-color: var(--accent, #4ea1ff);
  box-shadow: 0 0 0 1px var(--accent, #4ea1ff) inset;
}
</style>