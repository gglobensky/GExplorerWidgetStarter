<script setup lang="ts">
// Preview-only overlay. Production must use the future host-owned popover API.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import TreePanel from '../TreePanel.vue'
import type { Root, RootSource, TreeMemory } from '../tree'
const props = defineProps<{ roots: Root[]; source: RootSource; memory: TreeMemory }>()
const emit = defineEmits<{ (e: 'menu', event: MouseEvent, path: string): void; (e: 'favorite', root: Root): void }>()
const strip = ref<HTMLElement | null>(null), element = ref<HTMLElement | null>(null), open = ref(false)
const panel = ref<InstanceType<typeof TreePanel> | null>(null)
const current = ref(0)
let syncingRoot = false
const { atStart, atEnd, scrollByPage } = useScrollHints({ scrollEl: strip, axis: 'x', wheel: 'transpose', pageRatio: 1, minPageStep: 1, deps: () => props.roots.length })
function scroll() { current.value = Math.round((strip.value?.scrollLeft || 0) / (strip.value?.clientWidth || 1)); if (open.value && !syncingRoot) open.value = false; syncingRoot = false }
async function toggle(root: Root) {
  if (open.value) { open.value = false; return }
  open.value = true
  await nextTick()
  panel.value?.choose(root)
}
function outside(event: Event) { if (!(event.target as Element)?.closest?.('.preview-menu') && !element.value?.contains(event.target as Node)) open.value = false }
function escape(event: KeyboardEvent) { if (event.key === 'Escape' && open.value) { open.value = false; strip.value?.querySelectorAll('button')[current.value]?.focus() } }
watch(() => props.memory.active, id => {
  const index = props.roots.filter(r => r.kind === 'folder').findIndex(r => r.id === id)
  if (strip.value && index >= 0 && index !== current.value) { syncingRoot = true; current.value = index; strip.value.scrollLeft = index * strip.value.clientWidth }
})
onMounted(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('click', outside, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('click', outside, true) })
defineExpose({ command: (id: string, path: string) => panel.value?.command(id, path), choose: (root: Root) => panel.value?.choose(root), focusFolder: (path: string) => panel.value?.focusFolder(path) })
</script>
<template>
  <div ref="element" class="preview-toolbar" @keydown="escape">
    <button :disabled="atStart" aria-label="Previous root" @click="scrollByPage(-1)">{{ atStart ? '│' : '‹' }}</button>
    <div ref="strip" class="preview-root-strip" @scroll="scroll"><button v-for="root in roots.filter(r => r.kind === 'folder')" :key="root.id" :aria-expanded="open && memory.active === root.id" @click="toggle(root)">▱ &nbsp; {{ root.label }} <span>⌄</span></button></div>
    <button :disabled="atEnd" aria-label="Next root" @click="scrollByPage(1)">{{ atEnd ? '│' : '›' }}</button>
    <div v-if="open" class="preview-dropdown"><TreePanel ref="panel" :roots="roots" :source="source" :memory="memory" @navigate="open = false" @menu="(event, path) => emit('menu', event, path)" @favorite="emit('favorite', $event)" /></div>
  </div>
</template>
<style scoped>
.preview-toolbar { display:flex; width:244px; height:34px; position:relative; background:#192129; border:1px solid #34414d; border-radius:5px; }
.preview-toolbar>button { width:28px; flex:none; }
button { border:0; background:transparent; color:#dce4eb; cursor:pointer; font:13px system-ui; }
button:disabled { color:#50616e; cursor:default; }
.preview-root-strip { display:flex; flex:1; overflow-x:auto; scrollbar-width:none; scroll-snap-type:x mandatory; }
.preview-root-strip>button { flex:0 0 100%; scroll-snap-align:start; white-space:nowrap; }
.preview-root-strip span { margin-left:8px; }
.preview-dropdown { position:absolute; top:39px; left:0; width:min(340px, calc(100vw - 44px)); height:390px; border:1px solid #425563; border-radius:5px; box-shadow:0 16px 45px #0008; overflow:hidden; z-index:10; }
</style>
