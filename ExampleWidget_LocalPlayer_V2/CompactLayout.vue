<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createTipDirective } from 'gexplorer/widgets'

const vTip = createTipDirective({ force: true })

const props = defineProps<{
  current: any
  hasTracks: boolean
  isPlaying: boolean
  volume: number
  volumeIcon: string
  playTooltip: string
}>()

const emit = defineEmits<{
  (e: 'toggle-play'): void
  (e: 'click-pick'): void
  (e: 'vol-input', value: number): void
}>()

const volBtnEl = ref<HTMLElement | null>(null)
const showVolPop = ref(false)
const volPopStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })

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

function volInput(e: Event) {
  emit('vol-input', parseFloat((e.target as HTMLInputElement).value))
}

onMounted(() => {
  // Capture phase so clicks inside nested portals don’t slip through
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKeydown)
})

// Expose for parent (optional, matches Expanded)
defineExpose({ onDocClick, onKeydown })
</script>

<template>
  <div class="compact">
    <!-- Title strip with volume button at right -->
    <div class="compact-title" :title="playTooltip">
      <span class="title-text">{{ current?.name || 'No track' }}</span>
      <button
        ref="volBtnEl"
        class="btn vol-in-title"
        :class="{ active: volume === 0 }"
        :title="`Volume: ${Math.round(volume * 100)}%`"
        :aria-expanded="showVolPop ? 'true' : 'false'"
        @click.stop="toggleVolPop"
      >
        {{ volumeIcon }}
      </button>
    </div>

    <!-- Fixed overlay popover -->
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

    <!-- Single-row controls -->
    <div class="compact-controls">
      <button class="btn" v-tip="playTooltip" :disabled="!hasTracks" @click="emit('toggle-play')">
        <span v-if="isPlaying">⏸</span><span v-else>▶</span>
      </button>
      <button class="btn" title="Add files…" @click="emit('click-pick')">+</button>
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

.vol-pop.fixed {
  position: fixed;
  transform: translateX(-50%);
  padding: 8px;
  background: var(--surface-1, #1a1a1a);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
  z-index: 9999;
}

.vol-vertical {
  writing-mode: vertical-rl;
  direction: ltr;
  height: 120px;
}
</style>
