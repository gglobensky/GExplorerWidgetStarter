<script setup lang="ts">
// The volume slider, in the shell's popover (sdk.ui().openPopover, 2026-10-23): never clipped
// by the player's place, closed by a click elsewhere, Esc, or the 🔊 button again.
// useVolumePopover.ts opens it and keeps `volume` current (handle.update).
const props = defineProps<{
  volume: number
  onInput: (value: number) => void
  onMute?: () => void
  close: () => void
}>()

function input(e: Event) {
  props.onInput(parseFloat((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="vol-pop">
    <input
      class="vol-vertical"
      type="range"
      min="0"
      max="1"
      step="0.01"
      aria-label="Volume"
      :value="volume"
      @input="input"
    />
    <span class="vol-pct">{{ Math.round(volume * 100) }}%</span>
    <button
      v-if="onMute"
      class="vol-mute"
      type="button"
      v-gex-tooltip="volume > 0 ? 'Mute' : 'Unmute'"
      @click="onMute()"
    >
      {{ volume > 0 ? '🔇' : '🔊' }}
    </button>
  </div>
</template>

<style scoped>
.vol-pop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
}
.vol-vertical { writing-mode: vertical-rl; direction: rtl; height: 120px; }
.vol-pct { font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0.8; min-width: 3.5ch; text-align: center; }
.vol-mute {
  width: 26px; height: 22px; padding: 0;
  border-radius: 4px; border: 1px solid var(--border, #555);
  background: var(--surface-1, #1a1a1a); color: var(--fg, #eee); cursor: pointer;
}
.vol-mute:hover { border-color: var(--accent, #4ea1ff); }
</style>
