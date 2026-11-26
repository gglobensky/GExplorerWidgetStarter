<script setup lang="ts">
// GEM YT 0.18.0 (2026-11-26, plan-2026-11-25-gem-yt-compact.md, step 4): GEM YT in the toolbar, a 36 px strip. The page
// plays out of view (a 1 px holder: its sound keeps it running); ▣ and ☰ open a panel under the strip with the video or
// the list (ToolbarPanel.vue: the page moved over it, GEM Shell's surface.moveTo).
const props = defineProps<{
  title: string
  avatar?: string
  initial: string
  watching: boolean
  playing: boolean
  muted: boolean
  canNext: boolean
  /** play / pause and mute work in this GEM Shell */
  canMedia: boolean
  /** the panel that's open, if any */
  panel: 'video' | 'list' | null
}>()
const emit = defineEmits<{
  toggle: []
  next: []
  mute: []
  expand: [view: 'video' | 'list', anchor: HTMLElement]
}>()
function expand(view: 'video' | 'list', e: MouseEvent) { emit('expand', view, e.currentTarget as HTMLElement) }
</script>

<template>
  <div class="tb-strip">
    <span class="avatar"><img v-if="avatar" :src="avatar" alt="" draggable="false" /><template v-else>{{ initial }}</template></span>
    <!-- 0.21.0: GEM Shell's marquee: a long title scrolls -->
    <gex-marquee class="title" :text="props.title" :tip="true" />
    <button class="btn" :disabled="!watching || !canMedia" v-gex-tooltip="playing ? 'Pause' : 'Play'" @click="emit('toggle')">{{ playing ? '⏸' : '▶' }}</button>
    <button class="btn" :disabled="!canNext" v-gex-tooltip="{ content: 'Next video', detail: 'What YouTube plays next (your queue first)' }" @click="emit('next')">⏭</button>
    <button class="btn" v-gex-tooltip="muted ? 'Sound on' : 'Mute'" @click="emit('mute')">{{ muted ? '🔇' : '🔊' }}</button>
    <button class="btn" :class="{ on: panel === 'video' }" :aria-pressed="panel === 'video'"
            v-gex-tooltip="{ content: watching ? 'Show the video' : 'Show YouTube', detail: 'A panel under the toolbar; closing it keeps the sound playing' }"
            @click="expand('video', $event)">▣</button>
    <button class="btn" :class="{ on: panel === 'list' }" :aria-pressed="panel === 'list'" :disabled="!watching"
            v-gex-tooltip="{ content: 'Up next and your queue', detail: 'Pick what plays next; the video keeps playing' }"
            @click="expand('list', $event)">☰</button>
  </div>
</template>

<style scoped>
.tb-strip { display: flex; align-items: center; gap: 3px; height: 100%; min-width: 0; padding: 0 4px; color: var(--gex-fg, #e9eaee); }
.avatar { flex: 0 0 auto; display: grid; place-items: center; width: 24px; height: 24px; overflow: hidden; border-radius: 50%;
  background: var(--gex-surface, #16171b); font-size: 11px; font-weight: 700; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.title { flex: 1 1 auto; min-width: 0; margin: 0 3px; overflow: hidden; font-size: 12px; font-weight: 600; }
.btn { flex: 0 0 auto; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; color: inherit; background: transparent; font-size: 13px; cursor: pointer; }
.btn:hover:not(:disabled) { background: var(--gex-hover, #ffffff14); }
.btn:disabled { opacity: .35; cursor: default; }
.btn.on { color: var(--gex-accent-fg, #fff); background: var(--gex-accent, #ff4545); }
</style>
