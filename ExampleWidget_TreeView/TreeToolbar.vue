<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WidgetUi } from 'gexplorer/widgets'
import TreePopover from './TreePopover.vue'
import TreePanel from './TreePanel.vue'
import { newState, type Root, type RootSource, type TreeMemory } from './tree'

const props = defineProps<{
  roots: Root[]
  source: RootSource
  memory: TreeMemory
  ui?: WidgetUi
  icon?: (path: string) => string
  initialPath?: string | null
  widgetId?: string
  setPanel: (panel: InstanceType<typeof TreePanel> | null) => void
  createFolder: (path: string) => void | Promise<void>
  refreshRoots: () => void | Promise<void>
  favorite: (root: Root) => void | Promise<void>
  menu: (event: MouseEvent, path: string, layout: 'tree' | 'columns') => void
  clipboard: (operation: 'copy' | 'cut' | 'paste', path: string) => void | Promise<void>
}>()

const anchor = ref<HTMLElement | null>(null)
const open = ref(false)
const folderRoots = computed(() => props.roots.filter(root => root.kind === 'folder'))
const currentIndex = computed(() => Math.max(0, folderRoots.value.findIndex(root => root.id === props.memory.active)))
const current = computed(() => folderRoots.value[currentIndex.value])
let popover: ReturnType<WidgetUi['openPopover']> | null = null

function select(index: number) {
  const root = folderRoots.value[index]
  if (!root) return
  props.memory.roots[root.id] ??= newState()
  props.memory.active = root.id
  props.memory.recent = [root.id, ...props.memory.recent.filter(id => id !== root.id)].slice(0, 8)
}
function step(delta: number) {
  close()
  select(currentIndex.value + delta)
}
function contentProps() {
  return {
    roots: props.roots,
    source: props.source,
    memory: props.memory,
    icon: props.icon,
    initialPath: props.initialPath,
    widgetId: props.widgetId,
    setPanel: props.setPanel,
    createFolder: props.createFolder,
    refreshRoots: props.refreshRoots,
    favorite: props.favorite,
    menu: props.menu,
    clipboard: props.clipboard,
    close,
  }
}
function close() { popover?.close(); popover = null; open.value = false }
function toggle() {
  if (popover) { close(); return }
  if (!anchor.value || !props.ui || !current.value) return
  select(currentIndex.value)
  open.value = true
  popover = props.ui.openPopover({
    anchor: anchor.value,
    component: TreePopover,
    props: contentProps(),
    placement: 'below',
    maxWidth: 360,
    maxHeight: 420,
    onClose: () => { popover = null; open.value = false },
  })
}
watch(() => [props.roots, props.memory.active], () => popover?.update(contentProps()))
onBeforeUnmount(close)
</script>

<template>
  <div class="tv-toolbar" aria-label="Tree View roots">
    <button class="tv-toolbar-edge" :disabled="currentIndex <= 0" aria-label="Previous root" @click="step(-1)">{{ currentIndex <= 0 ? '│' : '‹' }}</button>
    <button ref="anchor" class="tv-toolbar-root" :disabled="!current" :aria-expanded="open" v-gex-tooltip="{ content: current?.label || 'Tree View', detail: current ? `${current.path} · Open folder tree` : 'No folder roots are available.' }" @click="toggle"><span>▱</span><strong>{{ current?.label || 'No roots' }}</strong><span>⌄</span></button>
    <button class="tv-toolbar-edge" :disabled="currentIndex >= folderRoots.length - 1" aria-label="Next root" @click="step(1)">{{ currentIndex >= folderRoots.length - 1 ? '│' : '›' }}</button>
  </div>
</template>

<style scoped>
.tv-toolbar { display:flex; flex:1 1 auto; width:100%; height:100%; min-width:150px; min-height:32px; overflow:hidden; color:var(--fg, #dce4eb); font:12px system-ui; }
.tv-toolbar button { border:0; background:transparent; color:inherit; cursor:pointer; }
.tv-toolbar button:hover:not(:disabled) { background:color-mix(in srgb, currentColor 9%, transparent); }
.tv-toolbar button:disabled { color:color-mix(in srgb, currentColor 34%, transparent); cursor:default; }
.tv-toolbar-edge { flex:0 0 28px; font-size:16px; }
.tv-toolbar-root { display:flex; align-items:center; justify-content:center; gap:7px; flex:1 1 auto; min-width:0; padding:0 8px; }
.tv-toolbar-root strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:550; }
</style>
