<script setup lang="ts">
// The ⚙ menu of a shop's top bar (2.4.0, 2026-11-01): the Video Club's settings menu made shared. A button that opens a
// panel with tabs ("Display", "Library"); a click outside or a choice closes it. The widget writes each tab's content
// in the default slot ({ tab, close }) with the shared classes:
//   glu-menu-label (a small caps heading), glu-menu-heading (a heading with a count), glu-menu-note (a warm note),
//   glu-choices (big buttons: <button :class="{ active }"><span>icon</span><b>name</b><small>what it does</small>),
//   glu-toggle (a radio or checkbox with a line under it), glu-menu-list (folders: <li><span><b/><small/></span><button>×),
//   glu-menu-empty, glu-menu-add (the dashed "＋ Add…" button), glu-menu-quiet (a quiet full-width button),
//   glu-menu-actions (buttons side by side), glu-menu-status.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  tabs: Array<{ id: string; label: string; icon?: string }>
  /** The button's tooltip ("Game Shop settings"). */
  label?: string
}>(), { label: 'Settings' })
defineSlots<{ default?: (props: { tab: string; close: () => void }) => any }>()

const menu = ref<HTMLDetailsElement | null>(null)
const tab = ref(props.tabs[0]?.id ?? '')

function close() { menu.value?.removeAttribute('open') }
/** Opens it at a tab (a widget's "Add a folder…" elsewhere can lead here). */
function open(at?: string) {
  if (at && props.tabs.some(t => t.id === at)) tab.value = at
  menu.value?.setAttribute('open', '')
}
function closeOutside(event: PointerEvent) {
  if (menu.value?.open && event.target instanceof Node && !menu.value.contains(event.target)) close()
}
onMounted(() => document.addEventListener('pointerdown', closeOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside, true))
defineExpose({ close, open })
</script>

<template>
  <details ref="menu" class="glu-menu" @keydown.esc.stop="close">
    <summary :aria-label="label" :title="label"><span aria-hidden="true">⚙</span></summary>
    <div class="glu-menu-panel">
      <div v-if="tabs.length > 1" class="glu-menu-tabs" role="tablist" :aria-label="`${label}: sections`" :style="{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ active: tab === t.id }" @click="tab = t.id">
          <span v-if="t.icon" aria-hidden="true">{{ t.icon }}</span>{{ t.label }}
        </button>
      </div>
      <section class="glu-menu-tab-panel" role="tabpanel" :aria-label="tabs.find(t => t.id === tab)?.label">
        <slot :tab="tab" :close="close" />
      </section>
    </div>
  </details>
</template>
