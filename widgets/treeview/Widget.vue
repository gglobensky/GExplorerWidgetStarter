<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getDrives, subscribeDrives, iconFor, ensureIconsFor, startRename } from 'gexplorer/widgets'
import type { DriveStats, FavoriteTreeNode, HostAction, WidgetMenuItemMessage, WidgetSdk } from 'gexplorer/widgets'
import TreePanel from './TreePanel.vue'
import TreeToolbar from './TreeToolbar.vue'
import { key, label, newMemory, newState, within, type Root, type RootSource, type TreeMemory } from './tree'

type Config = { data?: { folders?: { path: string; label: string }[] }; view?: Record<string, unknown> }
const props = defineProps<{ config?: Config; sourceId?: string; runAction?: (action: HostAction) => void; placement?: { context: string } }>()
const emit = defineEmits<{ (e: 'event', event: { type: 'update:config'; payload: Config }): void }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const ui = sdk?.ui?.()
const life = sdk?.lifecycle?.()
const memory = life?.persistRef<TreeMemory>('treeview.memory.v1', newMemory) ?? ref(newMemory())
const panel = ref<InstanceType<typeof TreePanel> | null>(null)
function setPanel(value: InstanceType<typeof TreePanel> | null) { panel.value = value }
const drives = ref(getDrives()), driveStats = ref<Record<string, DriveStats>>({}), favorites = ref<Root[]>([]), temporary = ref<Root[]>([])
const error = ref(''), busy = ref(false), iconTick = ref(0)
const iconKeys = new Map<string, string>()
// The folder you're browsing when the tree opens ('Location' cap)
const initialPath = sdk?.getCurrentPath?.() || null
const available = computed(() => !life || life.visibility.value !== 'collapsed')
const roots = computed<Root[]>(() => {
  const folders: Root[] = [...drives.value.map(d => {
    const capacity = driveStats.value[key(d.root)]
    return { id: `drive:${key(d.root)}`, label: d.name || d.root, path: d.root, group: 'Files', kind: 'folder' as const, capacity }
  }),
    ...(props.config?.data?.folders || []).map(f => ({ id: `folder:${key(f.path)}`, label: f.label, path: f.path, group: 'Files', kind: 'folder' as const })), ...temporary.value]
  return [...folders.filter((r, i) => folders.findIndex(f => key(f.path) === key(r.path)) === i), ...favorites.value]
})
function report(message: string) { error.value = message }
const source: RootSource = {
  open(path, options) {
    if (!sdk?.openListing) throw new Error('Folder listing access is unavailable. Check the widget’s Read permission.')
    const source = sdk.openListing(path, { filter: { kinds: ['dir'] }, sort: { key: 'name', dir: 'asc', foldersFirst: true }, consent: options?.consent })
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
let driveStatsRequest = 0
async function refreshDriveStats() {
  const request = ++driveStatsRequest
  const paths = drives.value.map(drive => drive.root)
  if (!paths.length || !sdk?.fsDriveStats) { driveStats.value = {}; return }
  try {
    const stats = await sdk.fsDriveStats(paths)
    if (disposed || request !== driveStatsRequest) return
    driveStats.value = Object.fromEntries(stats.map(item => [key(item.root), item]))
  } catch { if (!disposed && request === driveStatsRequest) driveStats.value = {} }
}
async function refreshRoots() {
  void refreshDriveStats()
  await refreshFavorites()
}
async function refreshFavorites() {
  const request = ++favoriteRequest
  try {
    const data = await sdk?.getGlobalFavorites?.() || []
    if (disposed || request !== favoriteRequest) return
    const result: Root[] = []
    const visit = (nodes: FavoriteTreeNode[], group = 'Favorites') => {
      for (const node of nodes) {
        if (node.kind === 'item') result.push({ id: `favorite:${node.id}`, label: node.label || label(node.path), path: node.path, group, kind: 'favorite' })
        else if (node.children.length) visit(node.children, group === 'Favorites' ? `Favorites · ${node.label}` : `${group} / ${node.label}`)
      }
    }
    visit(data); favorites.value = result
  } catch (err) { if (!disposed) report(err instanceof Error ? err.message : 'Favorites could not be loaded.') }
}
function joinPath(parent: string, name: string) {
  const separator = parent.includes('\\') && !parent.includes('/') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${separator}${name}`
}
function validFolderName(value: string) {
  if (!value.trim()) return 'Enter a folder name.'
  if (/[\\/:*?"<>|]/.test(value)) return 'A folder name cannot contain \\ / : * ? " < > or |.'
  if (/[. ]$/.test(value)) return 'A folder name cannot end with a period or space.'
  return null
}
async function createFolder(parentPath: string) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (!sdk?.fsMkdir || !sdk.fsValidate) throw new Error('Folder creation is unavailable in this host.')
    let createdPath = ''
    for (let index = 1; index <= 1000; index++) {
      const name = index === 1 ? 'New folder' : `New folder (${index})`
      const candidate = joinPath(parentPath, name)
      try {
        await sdk.fsMkdir(candidate)
        const created = await sdk.fsValidate(candidate)
        if (!created.ok || !created.exists || !created.isDir) throw new Error(created.error || 'The host did not create the folder.')
        createdPath = candidate
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!/already exists|exists|duplicate/i.test(message)) throw err
      }
    }
    if (!createdPath) throw new Error('Could not find an available name for the new folder.')
    const visible = await panel.value?.showCreated(createdPath)
    if (!visible || disposed) {
      report('The folder was created, but its rename field could not be opened. Refresh to see it.')
      return
    }
    const renameOptions = {
      selectAll: true,
      validate: validFolderName,
      onCommit: async (newName: string) => {
        const newPath = joinPath(parentPath, newName.trim())
        if (!sdk?.fsRename) throw new Error('Rename is unavailable in this host.')
        try {
          const result = await sdk.fsRename(createdPath, newPath)
          if (!result.ok) throw new Error(result.error || 'Rename failed.')
          await panel.value?.showCreated(newPath)
        } catch (err) {
          report(err instanceof Error ? err.message : 'The folder could not be renamed.')
        }
      },
      ...(props.sourceId ? { widgetId: props.sourceId } : {}),
    }
    await startRename(createdPath, renameOptions)
  } catch (err) { report(err instanceof Error ? err.message : 'The folder could not be created.') }
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
function menu(event: MouseEvent, path: string, layout: 'tree' | 'columns') {
  const context = layout === 'columns' ? 'treeview.column-folder' : 'treeview.folder'
  void ui?.contextMenu(event, { context, ref: path, selection: [path], path, entries: [{ FullPath: path, Kind: 'dir' }], widgetConfig: props.config }).catch(err => report(String(err)))
}
async function clipboard(operation: 'copy' | 'cut' | 'paste', path: string) {
  if (!path) return
  error.value = ''
  try {
    if (operation === 'copy') {
      if (!sdk?.clipboardCopyFiles) throw new Error('OS clipboard access is unavailable.')
      await sdk.clipboardCopyFiles([path])
    } else if (operation === 'cut') {
      if (!sdk?.clipboardCutFiles) throw new Error('OS clipboard access is unavailable.')
      await sdk.clipboardCutFiles([path])
    } else {
      if (!sdk?.fsPasteClipboard) throw new Error('Paste access is unavailable.')
      await sdk.fsPasteClipboard(path)
      panel.value?.command('refresh', path)
    }
  } catch (err) { report(err instanceof Error ? err.message : `${operation} failed.`) }
}
function onMenuItem(message: WidgetMenuItemMessage) {
  if (message.itemId === 'copy' || message.itemId === 'cut' || message.itemId === 'paste') void clipboard(message.itemId, message.ref || '')
  else panel.value?.command(message.itemId, message.ref || '')
}
defineExpose({ onMenuItem })
// Favorites changed anywhere (this widget, the Favorites widget, the shell): the host tells us.
sdk?.onHostChange?.('favorites', () => void refreshFavorites())
// TEMP (2026-10-15, location topic test): remove after testing
sdk?.onHostChange?.('location', e => console.log('[treeview] location', e.locator, e.cause, e.own ? 'own' : '', e.rev))
sdk?.onHostChange?.('clipboard', e => console.log('[treeview] clipboard changed', e.rev))
let offDrives: (() => void) | undefined
onMounted(() => { offDrives = subscribeDrives(value => { drives.value = value; void refreshDriveStats() }); void refreshRoots() })
onBeforeUnmount(() => { disposed = true; favoriteRequest++; driveStatsRequest++; offDrives?.() })
</script>

<template>
  <div class="tv-widget">
    <div v-if="error" key="error" class="tv-error" role="status"><span>{{ error }}</span><button aria-label="Dismiss message" @click="error = ''">×</button></div>
    <TreeToolbar v-if="available && placement?.context === 'toolbar'" key="toolbar" :roots="roots" :source="source" :memory="memory" :ui="ui" :icon="folderIcon" :initial-path="initialPath" :widget-id="sourceId" :set-panel="setPanel" :create-folder="createFolder" :refresh-roots="refreshRoots" :favorite="favorite" :menu="menu" :clipboard="clipboard" />
    <TreePanel v-else-if="available" key="panel" ref="panel" :roots="roots" :source="source" :memory="memory" :icon="folderIcon" :initial-path="initialPath" :context="placement?.context" :widget-id="sourceId" @add="createFolder" @refresh-roots="refreshRoots" @favorite="favorite" @menu="menu" @clipboard="clipboard" />
  </div>
</template>
<style scoped>
.tv-widget { display:flex; flex:1 1 auto; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden; }
.tv-widget :deep(.tv-panel) { flex:1 1 auto; min-height:0; }
.tv-widget:has(.tv-toolbar) { min-height:32px; }
.tv-error { display:flex; gap:8px; padding:8px; color:#e7c098; background:#302b25; font:12px system-ui; }
.tv-error span { flex:1; }
.tv-error button { background:none; border:0; color:inherit; cursor:pointer; }
</style>
