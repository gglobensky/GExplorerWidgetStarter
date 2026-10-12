<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getCurrentPath, getDrives, subscribeDrives, iconFor, ensureIconsFor } from 'gexplorer/widgets'
import type { FavoriteTreeNode, HostAction, WidgetMenuItemMessage, WidgetSdk } from 'gexplorer/widgets'
import TreePanel from './TreePanel.vue'
import { key, label, newMemory, newState, within, type Root, type RootSource, type TreeMemory } from './tree'

type Config = { data?: { folders?: { path: string; label: string }[] }; view?: Record<string, unknown> }
const props = defineProps<{ config?: Config; sourceId?: string; runAction?: (action: HostAction) => void; placement?: { context: string } }>()
const emit = defineEmits<{ (e: 'event', event: { type: 'update:config'; payload: Config }): void }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const life = sdk?.lifecycle?.()
const memory = life?.persistRef<TreeMemory>('treeview.memory.v1', newMemory) ?? ref(newMemory())
const panel = ref<InstanceType<typeof TreePanel> | null>(null)
const drives = ref(getDrives()), favorites = ref<Root[]>([]), temporary = ref<Root[]>([])
const error = ref(''), busy = ref(false), iconTick = ref(0)
const iconKeys = new Map<string, string>()
const initialPath = getCurrentPath()
const available = computed(() => !life || life.visibility.value !== 'collapsed')
const roots = computed<Root[]>(() => {
  const folders: Root[] = [...drives.value.map(d => ({ id: `drive:${key(d.root)}`, label: d.name || d.root, path: d.root, group: 'Files', kind: 'folder' as const })),
    ...(props.config?.data?.folders || []).map(f => ({ id: `folder:${key(f.path)}`, label: f.label, path: f.path, group: 'Files', kind: 'folder' as const })), ...temporary.value]
  return [...folders.filter((r, i) => folders.findIndex(f => key(f.path) === key(r.path)) === i), ...favorites.value]
})
function report(message: string) { error.value = message }
const source: RootSource = {
  open(path) {
    if (!sdk?.openListing) throw new Error('Folder listing access is unavailable. Check the widget’s Read permission.')
    const source = sdk.openListing(path, { filter: { kinds: ['dir'] }, sort: { key: 'name', dir: 'asc', foldersFirst: true } })
    // Keep the source's own methods and receiver intact; prepare icons only for requested rows.
    const rows = source.rows.bind(source)
    source.rows = async (...args) => {
      const entries = await rows(...args)
      for (const entry of entries) iconKeys.set(key(entry.FullPath), entry.IconKey)
      void ensureIconsFor(entries.map(e => ({ iconKey: e.IconKey, kind: e.Kind, ext: e.Ext })), 18).then(() => { if (!disposed) iconTick.value++ }).catch(() => {})
      return entries
    }
    return source
  },
  navigate(path) {
    if (!props.runAction) { report('Navigation is not available in this host.'); throw new Error('Navigation unavailable') }
    props.runAction({ type: 'nav', to: path })
  },
}
function folderIcon(path: string) { void iconTick.value; return iconFor({ iconKey: iconKeys.get(key(path)), kind: 'dir' }, 18) }
let favoriteRequest = 0, disposed = false
async function refreshRoots() {
  const request = ++favoriteRequest
  try {
    const data = await sdk?.getGlobalFavorites?.() || []
    if (disposed || request !== favoriteRequest) return
    const result: Root[] = []
    const visit = (nodes: FavoriteTreeNode[], group = 'Favorites') => {
      for (const node of nodes) {
        if (node.entry) result.push({ id: `favorite:${node.entry.id}`, label: node.entry.label || node.label || label(node.entry.path), path: node.entry.path, group, kind: 'favorite' })
        if (node.children?.length) visit(node.children, group === 'Favorites' ? `Favorites · ${node.label}` : `${group} / ${node.label}`)
      }
    }
    visit(data); favorites.value = result
  } catch (err) { if (!disposed) report(err instanceof Error ? err.message : 'Favorites could not be loaded.') }
}
async function addFolder() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (!sdk?.ui) throw new Error('The host folder picker is unavailable.')
    const path = await sdk.ui().pickFolder({ title: 'Add a Tree View root', access: 'read' })
    if (!path || disposed) return
    const existing = roots.value.find(r => r.kind === 'folder' && key(r.path) === key(path))
    if (existing) { panel.value?.choose(existing); return }
    const root: Root = { id: `folder:${key(path)}`, label: label(path), path, group: 'Files', kind: 'folder' }
    temporary.value.push(root)
    emit('event', { type: 'update:config', payload: { ...props.config, data: { ...props.config?.data, folders: [...(props.config?.data?.folders || []), { path, label: root.label }] } } })
    panel.value?.choose(root)
  } catch (err) { report(err instanceof Error ? err.message : 'The folder could not be added.') }
  finally { busy.value = false }
}
async function favorite(root: Root) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (!sdk?.fsValidate) throw new Error('The host cannot identify whether this favorite is a folder.')
    const result = await sdk.fsValidate(root.path)
    if (disposed) return
    if (!result.ok || !result.exists) throw new Error(result.error || 'This favorite is unavailable.')
    if (!result.isDir) { props.runAction?.({ type: 'open', path: root.path }); return }
    let owner = roots.value.filter(r => r.kind === 'folder' && within(root.path, r.path)).sort((a, b) => b.path.length - a.path.length)[0]
    if (!owner) {
      owner = { ...root, id: `focused:${key(root.path)}`, group: 'Files', kind: 'folder' }
      temporary.value.push(owner)
    }
    panel.value?.choose(owner)
    await nextTick()
    if (disposed) return
    panel.value?.focusFolder(root.path)
    const state = memory.value.roots[owner.id] ??= newState()
    state.selected = root.path
    source.navigate(root.path)
  } catch (err) { report(err instanceof Error ? err.message : 'The favorite could not be opened.') }
  finally { busy.value = false }
}
function menu(event: MouseEvent, path: string) {
  void sdk?.ui?.().contextMenu(event, { context: 'treeview.folder', ref: path, selection: [path], path, entries: [{ FullPath: path, Kind: 'dir' }], widgetConfig: props.config }).catch(err => report(String(err)))
}
function onMenuItem(message: WidgetMenuItemMessage) { panel.value?.command(message.itemId, message.ref || '') }
defineExpose({ onMenuItem })
let offDrives: (() => void) | undefined
onMounted(() => { offDrives = subscribeDrives(value => drives.value = value); void refreshRoots() })
onBeforeUnmount(() => { disposed = true; favoriteRequest++; offDrives?.() })
</script>

<template>
  <div class="tv-widget">
    <div v-if="error" class="tv-error" role="status"><span>{{ error }}</span><button aria-label="Dismiss message" @click="error = ''">×</button></div>
    <TreePanel v-if="available" ref="panel" :roots="roots" :source="source" :memory="memory" :icon="folderIcon" :initial-path="initialPath" @add="addFolder" @refresh-roots="refreshRoots" @favorite="favorite" @menu="menu" />
  </div>
</template>
<style scoped>
.tv-widget { display:flex; flex:1 1 auto; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden; }
.tv-widget :deep(.tv-panel) { flex:1 1 auto; min-height:0; }
.tv-error { display:flex; gap:8px; padding:8px; color:#e7c098; background:#302b25; font:12px system-ui; }
.tv-error span { flex:1; }
.tv-error button { background:none; border:0; color:inherit; cursor:pointer; }
</style>
