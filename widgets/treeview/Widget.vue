<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getDrives, iconFor, ensureIconsFor, startRename } from 'gexplorer/widgets'
import type { DriveStats, FavoriteTreeNode, WidgetMenuItemMessage, WidgetSdk } from 'gexplorer/widgets'
import TreePanel from './TreePanel.vue'
import TreeToolbar from './TreeToolbar.vue'
import { key, label, newMemory, newState, within, type Root, type RootSource, type TreeMemory } from './tree'

type Config = { data?: { folders?: { path: string; label: string }[] }; view?: Record<string, unknown> }
const props = defineProps<{ config?: Config; sourceId?: string; placement?: { context: string } }>()
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
    return { id: `drive:${key(d.root)}`, label: d.display || d.root, path: d.root, group: 'Files', kind: 'folder' as const, capacity }
  }),
    ...(props.config?.data?.folders || []).map(f => ({ id: `folder:${key(f.path)}`, label: f.label, path: f.path, group: 'Files', kind: 'folder' as const })), ...temporary.value]
  return [...folders.filter((r, i) => folders.findIndex(f => key(f.path) === key(r.path)) === i), ...favorites.value]
})
function report(message: string) { error.value = message }
const source: RootSource = {
  open(path, options) {
    if (!sdk?.openListing) throw new Error('Folder listing access is unavailable. Check the widget’s Read permission.')
    // Folders and folder links (junctions, directory symlinks); file links stay out
    const source = sdk.openListing(path, { filter: { kinds: ['dir', 'dirLink'] }, sort: { key: 'name', dir: 'asc', foldersFirst: true }, consent: options?.consent })
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
    if (!sdk?.navigate) { report('Navigation is not available in this host.'); throw new Error('Navigation unavailable') }
    void sdk.navigate(path).then(r => { if (!r.ok && r.reason !== 'no-gesture') report(`Could not go to ${path} (${r.reason}).`) })
  },
  async linkTarget(path) {
    if (!sdk?.fsLinkTarget) return null
    try {
      const r = await sdk.fsLinkTarget(path)
      return r.isLink ? { target: r.target, targetExists: r.targetExists } : null
    } catch { return null }
  },
}
function folderIcon(path: string) { void iconTick.value; return iconFor({ iconKey: iconKeys.get(key(path)), kind: 'dir' }, 18) }
let favoriteRequest = 0, disposed = false
let driveStatsRequest = 0
async function refreshDriveStats() {
  const request = ++driveStatsRequest
  // Only drives with media: an empty DVD drive has no capacity to read
  const paths = drives.value.filter(drive => drive.media === 'present').map(drive => drive.root)
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
        // A tree grows from one folder (2026-10-22): favorites opening folders side by side, a page (home:,
        // sys:) or a widget location (media://) aren't roots. A drive letter (C:) is one letter: a folder.
        if (node.kind === 'item') { if (node.locations.length === 1 && !/^[a-z][a-z0-9-]+:/i.test(node.locations[0])) result.push({ id: `favorite:${node.id}`, label: node.label || label(node.locations[0]), path: node.locations[0], group, kind: 'favorite' }) }
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
    // 0.5.4: the host picks the free name ("New folder", "New folder (2)"...: sdk.fsNewFolder)
    if (!sdk?.fsNewFolder) throw new Error('Folder creation is unavailable in this host.')
    const createdPath = await sdk.fsNewFolder(parentPath)
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
/** The folder that contains <path> ('' for a root). */
function parentPathOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  if (i < 0) return ''
  const parent = trimmed.slice(0, i)
  return /^[a-z]:$/i.test(parent) ? parent + '\\' : parent
}
/** Rename (0.5.4, the menu and F2): the folder in place, as after New folder. Not a root of the tree. */
async function renameFolder(path: string) {
  if (!path || busy.value) return
  const parentPath = parentPathOf(path)
  if (!parentPath || roots.value.some(r => key(r.path) === key(path))) { report('A root of the tree can\'t be renamed here.'); return }
  error.value = ''
  const visible = await panel.value?.showCreated(path)
  if (!visible || disposed) { report('The folder could not be shown to rename it. Refresh and try again.'); return }
  await startRename(path, {
    selectAll: true,
    validate: validFolderName,
    onCommit: async (newName: string) => {
      const newPath = joinPath(parentPath, newName.trim())
      if (newPath === path) return
      if (!sdk?.fsRename) throw new Error('Rename is unavailable in this host.')
      try {
        const result = await sdk.fsRename(path, newPath)
        if (!result.ok) throw new Error(result.error || 'Rename failed.')
        await panel.value?.showCreated(newPath)
      } catch (err) {
        report(err instanceof Error ? err.message : 'The folder could not be renamed.')
      }
    },
    ...(props.sourceId ? { widgetId: props.sourceId } : {}),
  })
}
async function favorite(root: Root) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (!sdk?.fsValidate) throw new Error('The host cannot identify whether this favorite is a folder.')
    const result = await sdk.fsValidate(root.path)
    if (disposed) return
    if (!result.ok || !result.exists) throw new Error(result.error || 'This favorite is unavailable.')
    if (!result.isDir) { void sdk?.openPath?.(root.path); return }
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
function menu(event: MouseEvent, path: string, layout: 'tree' | 'columns', states: string[] = []) {
  const context = layout === 'columns' ? 'treeview.column-folder' : 'treeview.folder'
  // states (0.5.0): narrow / unfocused / this-focused (TreePanel.menuStatesFor; entry.ts menuStates)
  void ui?.contextMenu(event, { context, ref: path, selection: [path], path, entries: [{ FullPath: path, Kind: 'dir' }], widgetConfig: props.config, states }).catch(err => report(String(err)))
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
  else if (message.itemId === 'rename') void renameFolder(message.ref || '')
  else panel.value?.command(message.itemId, message.ref || '')
}
/** entry.ts commands (0.5.2): the focused folder's copy / cut / paste. */
function onCommand(id: string) {
  const path = panel.value?.commandTarget() || ''
  if (!path) return
  if (id === 'copy' || id === 'cut' || id === 'paste') void clipboard(id, path)
  else if (id === 'rename') void renameFolder(path)
}
defineExpose({ onMenuItem, onCommand })
// Favorites changed anywhere (this widget, the Favorites widget, the shell): the host tells us.
sdk?.onHostChange?.('favorites', () => void refreshFavorites())
// The drive list changed (a drive, a disc, a label, the system-partitions setting)
sdk?.onHostChange?.('drives', () => { drives.value = getDrives(); void refreshDriveStats() })
// Cut folders look faded (0.5.3), as in Explorer: what the OS clipboard holds as cut (any app) below the
// tree's roots (`under`: a read limited to folders needs no Clipboard grant), read again when it changes
// or the roots do. Past CUT_READ_MAX paths, the rest just don't fade.
const cutKeys = ref<Set<string>>(new Set())
const CUT_READ_MAX = 2000
let cutRev = 0
async function readCut() {
  const rev = ++cutRev
  if (!sdk?.clipboardGetFiles) return
  try {
    const under = [...new Set(roots.value.filter(r => r.kind !== 'unavailable' && r.path).map(r => r.path))].slice(0, 16)
    if (!under.length) { if (cutKeys.value.size) cutKeys.value = new Set(); return }
    const s = await sdk.clipboardGetFiles({ under, pathsLimit: CUT_READ_MAX })
    if (rev !== cutRev || disposed) return
    const next = s.operation === 'cut' ? new Set(s.paths.map(key)) : new Set<string>()
    if (next.size || cutKeys.value.size) cutKeys.value = next
  } catch (err) {
    console.warn('[treeview] the clipboard could not be read (cut folders not faded)', err)
    if (rev === cutRev && cutKeys.value.size) cutKeys.value = new Set()
  }
}
function isCut(path: string): boolean { return cutKeys.value.size > 0 && cutKeys.value.has(key(path)) }
sdk?.onHostChange?.('clipboard', () => { void readCut() })
watch(() => roots.value.map(r => r.path).join('\n'), () => { void readCut() }, { immediate: true })
onMounted(() => { void refreshRoots() })
onBeforeUnmount(() => { disposed = true; favoriteRequest++; driveStatsRequest++ })
</script>

<template>
  <div class="tv-widget">
    <div v-if="error" key="error" class="tv-error" role="status"><span>{{ error }}</span><button aria-label="Dismiss message" @click="error = ''">×</button></div>
    <TreeToolbar v-if="available && placement?.context === 'toolbar'" key="toolbar" :roots="roots" :source="source" :memory="memory" :ui="ui" :icon="folderIcon" :initial-path="initialPath" :widget-id="sourceId" :set-panel="setPanel" :create-folder="createFolder" :refresh-roots="refreshRoots" :favorite="favorite" :menu="menu" :clipboard="clipboard" />
    <TreePanel v-else-if="available" key="panel" ref="panel" :roots="roots" :source="source" :memory="memory" :icon="folderIcon" :initial-path="initialPath" :context="placement?.context" :widget-id="sourceId" :cut="isCut" @add="createFolder" @refresh-roots="refreshRoots" @favorite="favorite" @menu="menu" @clipboard="clipboard" />
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
