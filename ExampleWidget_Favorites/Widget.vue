<script setup lang="ts">
import { ref, computed, onMounted, watch } from '/runtime/vue.js'
import { createSortable, type SortableHandle } from '/src/widgets/sortable/index'
import type {
  FavoriteEntry,
  FavoritesConfig,
  FavoriteTreeNode,
} from '@/widgets/contracts/favorites'
import {
  getFavorites,
  getFavoritesTree,
  addFavorite,
  addFolder,
  removeFavorite,
  removeFolder,
  reorderRootNodes,
} from '/src/widgets/favorites/service'
import { getCurrentPath } from '/src/widgets/nav/index'

type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

type MenuRow = {
  id: string
  type: 'folder' | 'item'
  label: string
  depth: number
  path?: string
}

type OpenMenu = {
  folderId: string | null
  label: string
  rows: MenuRow[]
  top: number
  left: number
}

// A "root row" in the sidebar list: either a folder node or a root-level item favorite
type RootRow =
  | { kind: 'folder'; node: FavoriteTreeNode }
  | { kind: 'item';   entry: FavoriteEntry }

// Standard widget props shape (same pattern as Items)
const props = defineProps<{
  sourceId: string
  config?: FavoritesConfig | { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'
    size?: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'updateConfig', config: FavoritesConfig | any): void
  (e: 'event', payload: any): void
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)

// ---- Config plumbing ----
const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

// group still exists in config, but service ignores it for now
const group      = computed(() => (cfg.value.data as any).group ?? 'default')
const showLabels = computed(() => cfg.value.data.showLabels !== false)
const maxVisible = computed(() => cfg.value.data.maxVisible ?? 24)

const isSidebar  = computed(() => props.placement?.context === 'sidebar')
const layout     = computed(() =>
  cfg.value.view.layout ?? (isSidebar.value ? 'list' : 'toolbar')
)
const dense      = computed(() => !!cfg.value.view.dense)
const showIcons  = computed(() => cfg.value.view?.showIcons !== false)

// Flat favorites (items); service is still the source of truth for item order
const favorites = ref<FavoriteEntry[]>([])

// Tree for folders + nested items
const fullTree = ref<FavoriteTreeNode[]>([])

// Mixed root rows: folders + root-level items, in tree order
const rootRows = ref<RootRow[]>([])

// --------------------------------------------------------------
// Helpers to build roots / base list
// --------------------------------------------------------------
function buildRootRows(
  tree: FavoriteTreeNode[],
  flatItems: FavoriteEntry[]
): RootRow[] {
  const byPath = new Map<string, FavoriteEntry>()
  for (const f of flatItems) {
    if (f.path) byPath.set(f.path, f)
  }

  const rows: RootRow[] = []

  for (const n of tree) {
    if (n.kind === 'folder') {
      rows.push({ kind: 'folder', node: n })
    } else if (n.kind === 'item') {
      const path = (n as any).path as string | undefined
      if (!path) continue
      const entry = byPath.get(path) ?? ({
        path,
        label: (n as any).label,
      } as FavoriteEntry)
      rows.push({ kind: 'item', entry })
    }
  }

  return rows
}

/**
 * Root-visible favorites for toolbar / flat list:
 * - If we have a tree, hide items that live inside folders.
 * - If we don't have a tree yet, show all favorites.
 */
function baseList(): FavoriteEntry[] {
  const tree = fullTree.value
  if (!tree.length) {
    return favorites.value
  }

  const nestedPaths = new Set<string>()

  const walk = (nodes: FavoriteTreeNode[], insideFolder: boolean) => {
    for (const n of nodes) {
      if (n.kind === 'item') {
        if (insideFolder && (n as any).path) {
          nestedPaths.add((n as any).path)
        }
      } else if (n.kind === 'folder') {
        const children = (n as any).children || []
        if (Array.isArray(children) && children.length) {
          walk(children, true)
        }
      }
    }
  }

  walk(tree, false)

  return favorites.value.filter(f => !nestedPaths.has(f.path))
}

// --------------------------------------------------------------
// SORTABLE: single mixed list (folders + root items)
// --------------------------------------------------------------
const listEl = ref<HTMLElement | null>(null)
const toolbarEl = ref<HTMLElement | null>(null)
let sortable: SortableHandle<RootRow> | null = null
const sortableVersion = ref(0)
let wasDragging = false
let dragJustEnded = false

function baseRootRows(): RootRow[] {
  return rootRows.value.slice()
}

const sortableState = computed(() => {
  sortableVersion.value
  return sortable
    ? sortable.getState()
    : { isDragging: false, draggingId: null, hoverIdx: null }
})

const displayRootRows = computed(() => {
  sortableVersion.value
  return sortable ? (sortable.getDisplayList() as RootRow[]) : baseRootRows()
})

function ensureSortable() {
  const items = baseRootRows()
  const containerEl = layout.value === 'list' ? listEl.value : toolbarEl.value
  
  if (!items.length || !containerEl) {
    sortable = null
    return
  }

  const orientation = layout.value === 'list' ? 'vertical' : 'horizontal'
  const rowSelector = layout.value === 'list' ? '.fav-row' : '.toolbar-sortable-item'

  if (!sortable) {
    sortable = createSortable<RootRow>(items, {
      identity: (row) =>
        row.kind === 'folder'
          ? `folder:${row.node.id}`
          : `item:${row.entry.path}`,
      orientation,
      dragThresholdPx: 4,
      onUpdate: onSortableUpdate,
      scrollContainer: () => containerEl,
      rowSelector,
      containerClassOnDrag: 'gex-dragging',
      autoScroll: { marginPx: 32, maxSpeedPxPerSec: 700 },
    })
  } else {
    sortable.setOrderedList(items)
    sortable.setOrientation?.(orientation)
  }
}

function onSortableUpdate() {
  if (!sortable) return

  sortableVersion.value++

  const { isDragging } = sortable.getState()

  if (!wasDragging && isDragging) {
    document.body.style.cursor = 'grabbing'
  }

  if (wasDragging && !isDragging) {
    document.body.style.cursor = ''

    const committed = sortable.getOrderedList() as RootRow[]
    const cur = baseRootRows()

    const same =
      committed.length === cur.length &&
      committed.every((r, i) => {
        const a = r
        const b = cur[i]
        if (a.kind !== b.kind) return false
        if (a.kind === 'folder') return a.node.id === b.node.id
        return a.entry.path === b.entry.path
      })

    if (!same) {
      // Update local row ordering
      rootRows.value = committed

      // Persist root node order (folders + items)
      const nodeIds = committed.map(row => 
        row.kind === 'folder' 
          ? row.node.id
          : row.entry.path
      )
      
      void reorderRootNodes(props.sourceId, nodeIds).catch(e => {
        console.error('[favorites] reorderRootNodes failed:', e)
      })
    }

    // Next click after a drag should NOT open anything
    dragJustEnded = true
  }

  wasDragging = isDragging
}

function setRowRef(row: RootRow, el: HTMLElement | null) {
  sortable?.registerRef(row, el)
}

function startRowDrag(displayIndex: number, event: PointerEvent) {
  ensureSortable()
  sortable?.startDrag(displayIndex, event)
  event.preventDefault()
}

// Clamp for toolbar visual max (uses root-visible items)
const visibleFavorites = computed(() =>
  baseList().slice(0, Math.max(1, maxVisible.value))
)

// Keep sortable in sync when rootRows change
watch(
  () =>
    rootRows.value
      .map(r =>
        r.kind === 'folder'
          ? `folder:${r.node.id}`
          : `item:${r.entry.path}`
      )
      .join('|'),
  () => ensureSortable()
)

// --------------------------------------------------------------
// ADD / EDIT DIALOG STATE (with folders)
// --------------------------------------------------------------
const showAddDialog = ref(false)
const newPath  = ref('')
const newLabel = ref('')

// 'item' = normal favorite, 'folder' = folder node
const addMode = ref<'item' | 'folder'>('item')

// '' = root, otherwise a folder id
const newParentId = ref<string>('')

type FolderOption = { id: string; label: string; depth: number }
const folderOptions = ref<FolderOption[]>([])

const addDialogTitle = computed(() =>
  addMode.value === 'folder' ? 'Add folder' : 'Add favorite'
)

const addButtonLabel = computed(() =>
  addMode.value === 'folder' ? 'Create' : 'Add'
)

function guessLabelFromPath(path: string): string {
  const p = (path || '').replace(/[\\/]+$/, '')
  if (!p) return ''
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

async function refreshFolderOptions() {
  try {
    const tree = await getFavoritesTree()
    const opts: FolderOption[] = []

    const walk = (nodes: FavoriteTreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind === 'folder') {
          opts.push({ id: n.id, label: n.label, depth })
          walk(n.children, depth + 1)
        }
      }
    }

    walk(tree, 0)
    folderOptions.value = opts
  } catch (e) {
    console.error('[favorites] refreshFolderOptions failed:', e)
    // keep previous options if something goes wrong
  }
}

// Load tree and build rootRows from it
async function refreshRootFolders() {
  try {
    const tree = await getFavoritesTree(props.sourceId)
    fullTree.value = tree
    rootRows.value = buildRootRows(tree, favorites.value)
  } catch (e) {
    console.error('[favorites] refreshRootFolders failed', e)
    fullTree.value = []
    rootRows.value = []
  }
}

function openAddDialog() {
  const base = getCurrentPath().trim()
  addMode.value = 'item'
  newPath.value = base
  newLabel.value = guessLabelFromPath(base)
  newParentId.value = '' // root by default

  void refreshFolderOptions()
  showAddDialog.value = true
}

function closeAddDialog() {
  showAddDialog.value = false
}

// --------------------------------------------------------------
// FOLDER MENU (overlay)
// --------------------------------------------------------------
const openMenus = ref<OpenMenu[]>([])

// Helper to check if a folder menu is currently open
function isFolderMenuOpen(folderId: string): boolean {
  return openMenus.value.some(m => m.folderId === folderId)
}

function openFolderDropdown(folder: FavoriteTreeNode, event: MouseEvent) {
  // Swallow click right after a drag (folder or item)
  if (dragJustEnded) {
    dragJustEnded = false
    event.preventDefault()
    return
  }

  const anchor = event.currentTarget as HTMLElement | null
  const rect = anchor?.getBoundingClientRect()

  const top = rect ? rect.bottom + 4 : 80
  const left = rect ? rect.left : 80

  const rows = buildMenuRows(folder.children)

  // Toggle if same folder already open as root
  const existingRoot = openMenus.value[0]
  if (existingRoot && existingRoot.folderId === folder.id) {
    closeFolderMenu()
    return
  }

  openMenus.value = [
    {
      folderId: folder.id,
      label: folder.label,
      rows,
      top,
      left,
    },
  ]
}

function closeFolderMenu() {
  openMenus.value = []
}

function handleFolderMenuClick(row: MenuRow, event: MouseEvent, level: number) {
  if (row.type === 'folder') {
    const folder = findFolderNodeById(row.id)
    if (!folder) return

    const anchor = event.currentTarget as HTMLElement | null
    const rect = anchor?.getBoundingClientRect()

    const parentMenu = openMenus.value[level]
    const top = rect ? rect.top : parentMenu?.top ?? 80
    const left = rect ? rect.right + 8 : (parentMenu?.left ?? 80) + 220

    const rows = buildMenuRows(folder.children)

    const next = openMenus.value.slice(0, level + 1)
    next[level + 1] = {
      folderId: folder.id,
      label: folder.label,
      rows,
      top,
      left,
    }
    openMenus.value = next
    return
  }

  // Leaf item
  if (!row.path) return
  openFavorite({ path: row.path, label: row.label }, event)
  closeFolderMenu()
}

// --------------------------------------------------------------
// LOAD FROM SERVICE
// --------------------------------------------------------------
async function refreshFavorites() {
  loading.value = true
  error.value = null

  try {
    const svc = await getFavorites(props.sourceId)
    if (Array.isArray(svc)) {
      favorites.value = svc
    } else {
      const fromCfg = (cfg.value.data as any)?.entries
      favorites.value = Array.isArray(fromCfg) ? fromCfg : []
    }

    if (fullTree.value.length) {
      rootRows.value = buildRootRows(fullTree.value, favorites.value)
    }
  } catch (e: any) {
    console.error('[favorites] getFavorites failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')

    const fromCfg = (cfg.value.data as any)?.entries
    favorites.value = Array.isArray(fromCfg) ? fromCfg : []

    if (fullTree.value.length) {
      rootRows.value = buildRootRows(fullTree.value, favorites.value)
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  console.log('[Widget] sourceId on mount:', props.sourceId)
  void refreshFavorites()
  void refreshRootFolders()
})

watch(group, () => {
  void refreshFavorites()
  void refreshRootFolders()
})

const hostVars = computed(() => ({
  '--fav-bg': props.theme?.bg         || 'var(--surface-1, #141414)',
  '--fav-fg': props.theme?.fg         || 'var(--fg, #eee)',
  '--fav-border': props.theme?.border || 'rgba(255,255,255,.14)',
}))

// --------------------------------------------------------------
// NAV
// --------------------------------------------------------------
function openFavorite(fav: FavoriteEntry, event?: MouseEvent) {
  // If a drag just ended, swallow this click
  if (dragJustEnded) {
    dragJustEnded = false
    event?.preventDefault()
    return
  }

  const path = fav.path?.trim()
  if (!path) return

  if (props.runAction) {
    props.runAction({ type: 'nav', to: path, sourceId: props.sourceId })
  } else {
    emit('event', { type: 'openPath', payload: path })
  }
}

// --------------------------------------------------------------
// EDITING HELPERS
// --------------------------------------------------------------
function buildMenuRows(nodes: FavoriteTreeNode[]): MenuRow[] {
  const rows: MenuRow[] = []
  for (const n of nodes) {
    if (n.kind === 'folder') {
      rows.push({
        id: n.id,
        type: 'folder',
        label: n.label,
        depth: 0, // one level per dropdown → depth 0 inside each
      })
    } else {
      rows.push({
        id: n.id,
        type: 'item',
        label: n.label,
        depth: 0,
        path: (n as any).path,
      })
    }
  }
  return rows
}

function findFolderNodeById(id: string | null): FavoriteTreeNode | null {
  if (!id) return null
  const stack: FavoriteTreeNode[] = [...fullTree.value]

  while (stack.length) {
    const node = stack.pop()!
    if (node.kind === 'folder') {
      if (node.id === id) return node
      for (const child of node.children) {
        if (child.kind === 'folder') stack.push(child)
      }
    }
  }

  return null
}

async function confirmAddFavorite() {
  const path = newPath.value.trim()
  const label = newLabel.value.trim()
  const parentId = newParentId.value || null

  saving.value = true
  error.value = null
  try {
    if (addMode.value === 'folder') {
      if (!label) return
      await addFolder(label, parentId)
      await refreshFolderOptions()
      await refreshRootFolders()
    } else {
      if (!path) return
      await addFavorite(path, label || undefined, parentId)
      await refreshRootFolders()
    }
    await refreshFavorites()
    closeAddDialog()
  } catch (e: any) {
    console.error('[favorites] addFavorite/addFolder failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  } finally {
    saving.value = false
  }
}

async function handleRemoveFolder(folderId: string) {
  const ok = window.confirm(
    'Delete this folder and ALL nested favorites inside it? This cannot be undone.'
  )
  if (!ok) return

  error.value = null
  try {
    await removeFolder(folderId)

    // Reload tree + flat favorites so UI is fully in sync
    await refreshRootFolders()
    await refreshFavorites()
  } catch (e: any) {
    console.error('[favorites] removeFolder failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  }
}

async function handleRemoveFavorite(path: string) {
  error.value = null
  try {
    await removeFavorite(path)
    favorites.value = favorites.value.filter(
      f => f.path.toLowerCase() !== path.toLowerCase()
    )
    if (fullTree.value.length) {
      rootRows.value = buildRootRows(fullTree.value, favorites.value)
    }
  } catch (e: any) {
    console.error('[favorites] removeFavorite failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  }
}
</script>


<template>
  <div
    class="favorites-root"
    :class="{
      'sidebar-mode': isSidebar,
      'toolbar-mode': !isSidebar && layout === 'toolbar',
    }"
    :style="hostVars"
  >
    <!-- Add button: sidebar as full row, toolbar as inline pill -->
    <template v-if="isSidebar">
      <button
        type="button"
        class="add-favorite-btn"
        title="Add favorite or folder"
        @click="openAddDialog"
      >
        <span class="add-icon">+</span>
        <span class="add-label">Add favorite</span>
      </button>
    </template>



    <div v-if="loading" class="fav-msg">Loading…</div>
    <div v-else-if="error" class="fav-msg error">{{ error }}</div>
    <div
      v-else-if="!visibleFavorites.length && !rootRows.length"
      class="fav-msg empty"
    >
      (No favorites yet)
    </div>
    <template v-else>
      <!-- LIST layout (sidebar) -->
      <ul
        v-if="layout === 'list'"
        class="favorites-list"
        :class="{ dense }"
        ref="listEl"
      >
        <li
          v-for="(row, index) in displayRootRows"
          :key="row.kind === 'folder'
            ? 'folder:' + row.node.id
            : 'item:' + row.entry.path"
          class="fav-row"
          :class="{
            'folder-row': row.kind === 'folder',
            'item-row': row.kind === 'item',
            'is-dragging':
              sortableState.isDragging &&
              sortableState.draggingId === (
                row.kind === 'folder'
                  ? 'folder:' + row.node.id
                  : 'item:' + row.entry.path
              )
          }"
          :ref="el => setRowRef(row, el as HTMLElement | null)"
          @pointerdown.stop="startRowDrag(index, $event)"
        >
          <!-- Folder row -->
          <template v-if="row.kind === 'folder'">
            <button
              type="button"
              class="fav-btn folder-btn"
              @click="openFolderDropdown(row.node, $event)"
              :title="row.node.label"
            >
              <span class="fav-icon">📁</span>
              <span v-if="showLabels" class="fav-label">
                {{ row.node.label }}
              </span>
            </button>

            <div class="fav-row-actions">
              <button
                type="button"
                class="icon-btn danger"
                @pointerdown.stop
                @click.stop="handleRemoveFolder(row.node.id)"
                title="Delete folder and nested favorites"
              >
                ✕
              </button>
            </div>
          </template>

          <!-- Item row -->
          <template v-else>
            <button
              type="button"
              class="fav-btn"
              @click="openFavorite(row.entry, $event)"
              :title="row.entry.label || row.entry.path"
            >
              <span v-if="showIcons" class="fav-icon">★</span>
              <span v-if="showLabels" class="fav-label">
                {{ row.entry.label || row.entry.path }}
              </span>
            </button>

            <div class="fav-row-actions">
              <button
                type="button"
                class="icon-btn danger"
                @pointerdown.stop
                @click.stop="handleRemoveFavorite(row.entry.path)"
                title="Remove"
              >
                ✕
              </button>
            </div>
          </template>
        </li>
      </ul>



<!-- TOOLBAR layout (enhanced with folders & dropdowns) -->
      <div v-else ref="toolbarEl" class="favorites-toolbar" :class="{ dense }">
        <!-- Add button at start of toolbar -->
        <button
          type="button"
          class="add-favorite-pill"
          title="Add favorite or folder"
          @click="openAddDialog"
        >
          <span class="add-icon">+</span>
        </button>
        
        <!-- Each root row: either a folder dropdown or an item pill -->
        <template v-for="(row, idx) in displayRootRows" :key="idx">
          <!-- Folder with dropdown -->
          <div
            v-if="row.kind === 'folder'"
            class="toolbar-folder-wrapper toolbar-sortable-item"
            :ref="el => setRowRef(row, el)"
          >
            <button
              type="button"
              class="fav-pill folder-pill"
              :class="{ 'menu-open': isFolderMenuOpen(row.node.id) }"
              @click="openFolderDropdown(row.node, $event)"
              :title="row.node.label"
              @pointerdown="(e) => startRowDrag(idx, e)"
            >
              <span class="fav-icon">📁</span>
              <span v-if="showLabels" class="fav-label">{{ row.node.label }}</span>
              <span class="dropdown-arrow">▼</span>
            </button>
            
            <!-- Delete button -->
            <button
              type="button"
              class="icon-btn danger toolbar-delete-btn"
              @pointerdown.stop
              @click.stop="handleRemoveFolder(row.node.id)"
              title="Delete folder and nested favorites"
            >
              ✕
            </button>
          </div>

          <!-- Regular item pill -->
          <div
            v-else
            class="toolbar-item-wrapper toolbar-sortable-item"
            :ref="el => setRowRef(row, el)"
          >
            <button
              type="button"
              class="fav-pill"
              @click="openFavorite(row.entry, $event)"
              :title="row.entry.label || row.entry.path"
              @pointerdown="(e) => startRowDrag(idx, e)"
            >
              <span v-if="showIcons" class="fav-icon">★</span>
              <span v-if="showLabels" class="fav-label">
                {{ row.entry.label || row.entry.path }}
              </span>
            </button>
            
            <!-- Delete button -->
            <button
              type="button"
              class="icon-btn danger toolbar-delete-btn"
              @pointerdown.stop
              @click.stop="handleRemoveFavorite(row.entry.path)"
              title="Remove"
            >
              ✕
            </button>
          </div>
        </template>
      </div>

    </template>

    <!-- Add favorite / folder popup (global modal) -->
    <teleport to="body">
      <div
        v-if="showAddDialog"
        class="fav-dialog-backdrop"
      >
        <div class="fav-dialog">
          <div class="fav-dialog-title">{{ addDialogTitle }}</div>

          <div class="fav-type-toggle">
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: addMode === 'item' }"
              @click="addMode = 'item'"
            >
              Favorite
            </button>
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: addMode === 'folder' }"
              @click="addMode = 'folder'"
            >
              Folder
            </button>
          </div>

          <label class="fav-dialog-field">
            <span class="field-label">Location</span>
            <select
              v-model="newParentId"
              class="fav-input"
            >
              <option value="">Root</option>
              <option
                v-for="opt in folderOptions"
                :key="opt.id"
                :value="opt.id"
              >
                {{ '  '.repeat(opt.depth) + opt.label }}
              </option>
            </select>
          </label>

          <label
            v-if="addMode === 'item'"
            class="fav-dialog-field"
          >
            <span class="field-label">Path</span>
            <input
              v-model="newPath"
              type="text"
              class="fav-input"
              placeholder="C:\\Users\\you\\Downloads or home:/games"
            />
          </label>

          <label class="fav-dialog-field">
            <span class="field-label">Label</span>
            <input
              v-model="newLabel"
              type="text"
              class="fav-input"
              :placeholder="addMode === 'folder' ? 'New folder' : 'Downloads'"
            />
          </label>

          <div class="fav-dialog-buttons">
            <button
              type="button"
              class="btn"
              @click="closeAddDialog"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn primary"
              :disabled="
                saving ||
                (addMode === 'item'
                  ? !newPath.trim()
                  : !newLabel.trim())
              "
              @click="confirmAddFavorite"
            >
              {{ addButtonLabel }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Folders menu overlay -->
    <!-- Folders menu overlay (stacked menus) -->
<teleport to="body">
  <div
    v-if="openMenus.length"
    class="fav-menu-backdrop"
    @click.self="closeFolderMenu"
  >
    <div
      v-for="(menu, level) in openMenus"
      :key="menu.folderId ?? 'root-' + level"
      class="fav-menu"
      :style="{
        top: menu.top + 'px',
        left: menu.left + 'px',
      }"
      @click.stop
    >
      <div class="fav-menu-title">
        {{ menu.label || 'Folder' }}
      </div>

      <div v-if="!menu.rows.length" class="fav-menu-empty">
        No entries
      </div>

      <ul v-else class="fav-menu-list">
        <li
          v-for="row in menu.rows"
          :key="row.id"
          class="fav-menu-row"
          :class="{ 'is-folder': row.type === 'folder' }"
        >
          <button
            type="button"
            class="fav-menu-btn"
            @click="handleFolderMenuClick(row, $event, level)"
          >
            <span class="fav-menu-label">
              <span
                class="fav-menu-indent"
                :style="{ width: row.depth * 12 + 'px' }"
              />
              <span class="fav-menu-icon">
                <span v-if="row.type === 'folder'">📁</span>
                <span v-else>★</span>
              </span>
              <span class="fav-menu-text">
                {{ row.label }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</teleport>


  </div>
</template>

<style scoped>
.fav-row.is-dragging {
  opacity: 0.7;
}

/* Root container */
.favorites-root {
  position: relative;
  background: var(--fav-bg);
  color: var(--fav-fg);
  border-radius: 8px;
  padding: 6px 8px;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Slightly tighter padding when docked in sidebar */
.favorites-root.sidebar-mode {
  padding: 4px 6px;
}

/* Slightly tighter padding & font-size when used in a toolbar row */
.favorites-root.toolbar-mode .add-favorite-pill,
.favorites-root.toolbar-mode .fav-pill {
  padding: 2px 5px;
  font-size: 0.85em;
  padding-block: 1px;    /* <= this is where you “buy back” those last few px */
}

.favorites-root.toolbar-mode {
  height: 100%;
  display: flex;
  align-items: stretch;
  padding-block: 0;      /* <— kill any top/bottom padding */
  margin-block: 0;       /* safety: no vertical margin in toolbar mode */
}

/* Make the internal toolbar container hug the row height */
.favorites-root.toolbar-mode .favorites-toolbar {
  height: 100%;
  display: flex;
  align-items: center;
  padding-block: 0;      /* absolutely no vertical padding here */
  margin-block: 0;
}

.favorites-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.75em; /* instead of 11px */
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.9;
}

.favorites-title {
  font-weight: 600;
}

.header-actions {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

/* Add favorite button - Sidebar style (full row) */
.add-favorite-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 5px; /* Less left padding to align + with icons */
  margin-bottom: 4px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 0.9em; /* instead of 13px */
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-favorite-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.5);
}

.add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 14px;
  font-weight: 600;
  opacity: 0.8;
}

.add-label {
  opacity: 0.9;
}

/* Add favorite button - Toolbar style (inline pill) */
.add-favorite-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 0.9em; /* base; toolbar-mode overrides to 0.85em */
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
  height: fit-content;
  box-sizing: border-box;
}

.add-favorite-pill:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.5);
}

.fav-msg {
  font-size: 13px;
  opacity: 0.8;
  padding: 4px 2px;
}

.fav-msg.error {
  color: #ff8a8a;
}

.fav-msg.empty {
  opacity: 0.6;
  font-style: italic;
}

/* Vertical list mode */
.favorites-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.favorites-list.dense {
  gap: 0;
}

.fav-row {
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Common button styling for entries */
.fav-btn,
.fav-pill {
  border-radius: 6px;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  font-size: 0.9em; /* inherit + scale with widget text size */
  cursor: pointer;
  box-sizing: border-box;
}

/* Remove borders in toolbar mode to match drives widget */
.favorites-toolbar .fav-pill {
  border: none;
}

.fav-btn {
  width: 100%;
  text-align: left;
}

.fav-pill {
  white-space: nowrap;
}

.fav-btn:hover,
.fav-pill:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* Folder row styling (optional subtle tweak) */
.folder-row .folder-btn {
  font-weight: 500;
}

/* Actions (delete) - Show on hover in normal mode, always in edit mode */
.fav-row-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

/* Show on hover */
.fav-row:hover .fav-row-actions {
  opacity: 1;
}

/* Always visible in edit mode */
.favorites-root.edit-mode .fav-row-actions {
  opacity: 1;
}

.icon-btn {
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 0.8em; /* instead of 11px */
  cursor: pointer;
  background: transparent;
  color: inherit;
  opacity: 0.7;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  opacity: 1;
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(255, 128, 128, 0.16);
}

/* Horizontal toolbar layout - ENHANCED */
.favorites-toolbar {
  display: flex;
  flex-wrap: nowrap; /* Changed from wrap - single row */
  align-items: center; /* Vertical centering */
  gap: 6px;
  overflow-x: auto;
  overflow-y: visible; /* Allow dropdowns to extend below */
  height: 100%; /* Fill parent height for vertical centering */
  padding: 0 4px; /* Small horizontal padding */
}

.favorites-toolbar.dense {
  gap: 3px;
}

/* Folder wrapper for positioning dropdown */
.toolbar-folder-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
/* Toolbar item/folder wrappers for sortable */
.toolbar-item-wrapper,
.toolbar-folder-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Delete button in toolbar - hidden by default, show on hover or in edit mode */
.toolbar-delete-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
  font-size: 10px;
  padding: 1px 3px;
}

/* Show on hover */
.toolbar-item-wrapper:hover .toolbar-delete-btn,
.toolbar-folder-wrapper:hover .toolbar-delete-btn {
  opacity: 0.7;
}

/* Always visible in edit mode */
.favorites-root.edit-mode .toolbar-delete-btn {
  opacity: 0.7;
}

.toolbar-delete-btn:hover {
  opacity: 1 !important;
}

/* Enhanced pill styling with better visual hierarchy */
.fav-pill {
  white-space: nowrap;
  height: fit-content; /* Auto-size to content */
  transition: all 0.15s ease;
  position: relative;
}

.fav-pill.folder-pill {
  padding-right: 8px; /* Extra space for dropdown arrow */
}

.dropdown-arrow {
  font-size: 9px;
  opacity: 0.6;
  margin-left: 2px;
  transition: transform 0.2s ease;
}

.folder-pill:hover .dropdown-arrow {
  opacity: 1;
}

/* When folder menu is open */
.folder-pill.menu-open .dropdown-arrow {
  transform: rotate(180deg);
}

/* Toolbar-specific menu positioning (opens downward) */
.favorites-toolbar .fav-menu {
  top: calc(100% + 4px); /* Position below the button */
  left: 0;
  transform-origin: top left;
}

/* Better hover states for toolbar */
.favorites-toolbar .fav-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.favorites-toolbar .fav-pill:active {
  transform: translateY(0);
}

.fav-icon {
  flex: 0 0 auto;
  width: 16px;
  text-align: center;
  font-size: 12px;
  opacity: 0.9;
}

.fav-label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

/* Add favorite / folder popup */
.fav-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: radial-gradient(
    circle at top,
    rgba(0, 0, 0, 0.4),
    rgba(0, 0, 0, 0.8)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.fav-dialog {
  background: rgba(12, 12, 12, 0.96);
  border-radius: 8px;
  border: 1px solid var(--fav-border);
  padding: 8px 10px;
  min-width: 260px;
  max-width: 340px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}

.fav-dialog-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.fav-type-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.btn-toggle {
  flex: 1 1 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
}

.btn-toggle.active {
  background: rgba(255, 255, 255, 0.24);
}

.btn-toggle:not(.active):hover {
  background: rgba(255, 255, 255, 0.12);
}

.fav-dialog-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}

.field-label {
  font-size: 11px;
  opacity: 0.8;
}

.fav-dialog .fav-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
  font-size: 12px;
  padding: 3px 6px;
  box-sizing: border-box;
}

.fav-dialog .fav-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.4);
}

.fav-dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}

.btn {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 11px;
  padding: 2px 10px;
  cursor: pointer;
}

.btn.primary {
  background: rgba(255, 255, 255, 0.16);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.24);
}

/* Folders menu overlay */
.fav-menu-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto; /* so outside clicks are captured */
  z-index: 10001;
}

.fav-menu {
  position: absolute;
  pointer-events: auto;
  min-width: 220px;
  max-width: 320px;
  max-height: 420px;
  overflow: auto;
  background: rgba(10, 10, 10, 0.98);
  border-radius: 8px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.7);
  padding: 6px 0;
}

.fav-menu-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.8;
  padding: 0 10px 4px;
}

.fav-menu-empty {
  font-size: 12px;
  opacity: 0.8;
  padding: 4px 10px 8px;
  font-style: italic;
}

.fav-menu-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fav-menu-row {
  margin: 0;
  padding: 0;
}

.fav-menu-btn {
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  box-sizing: border-box;
}

.fav-menu-btn:disabled {
  cursor: default;
  opacity: 0.8;
}

.fav-menu-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.fav-menu-label {
  display: inline-flex;
  align-items: center;
}

.fav-menu-indent {
  display: inline-block;
  flex: 0 0 auto;
}

.fav-menu-icon {
  display: inline-block;
  width: 18px;
  text-align: center;
  margin-right: 4px;
}

.fav-menu-text {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>