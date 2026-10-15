<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import TreePanel from './TreePanel.vue'
import type { Root, RootSource, TreeMemory } from './tree'

const props = defineProps<{
  roots: Root[]
  source: RootSource
  memory: TreeMemory
  icon?: (path: string) => string
  initialPath?: string | null
  widgetId?: string
  setPanel: (panel: InstanceType<typeof TreePanel> | null) => void
  close: () => void
  createFolder: (path: string) => void | Promise<void>
  refreshRoots: () => void | Promise<void>
  favorite: (root: Root) => void | Promise<void>
  menu: (event: MouseEvent, path: string, layout: 'tree' | 'columns') => void
  clipboard: (operation: 'copy' | 'cut' | 'paste', path: string) => void | Promise<void>
}>()
const panel = ref<InstanceType<typeof TreePanel> | null>(null)

async function openFavorite(root: Root) {
  await props.favorite(root)
  props.close()
}
onMounted(() => props.setPanel(panel.value))
onBeforeUnmount(() => props.setPanel(null))
</script>

<template>
  <div class="tv-toolbar-popover">
    <TreePanel
      ref="panel"
      :roots="roots"
      :source="source"
      :memory="memory"
      :icon="icon"
      :initial-path="initialPath"
      :widget-id="widgetId"
      context="toolbar"
      @navigate="close"
      @add="createFolder"
      @refresh-roots="refreshRoots"
      @favorite="openFavorite"
      @menu="menu"
      @clipboard="clipboard"
    />
  </div>
</template>

<style scoped>
.tv-toolbar-popover { display:flex; width:min(340px, calc(100vw - 24px)); height:min(390px, calc(100vh - 24px)); min-height:220px; overflow:hidden; }
.tv-toolbar-popover :deep(.tv-panel) { flex:1 1 auto; min-width:0; min-height:0; }
</style>
