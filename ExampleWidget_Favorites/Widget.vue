<script setup lang="ts">
import { ref, computed, nextTick } from '/runtime/vue.js'
import { useScrollHints, useSnapResize } from '/src/widgets/list-kit'
import { createDragTrigger } from '/src/widgets/utils/click-drag.ts'

import type {
  FavoritesConfig,
} from '/src/widgets/contracts/favorites'

import { useFavoritesData } from './useFavoritesData'
import { useDragVisuals } from './useDragVisuals'
import { useFolderMenus } from './useFolderMenus'
import { useFavoritesDialog } from './useFavoritesDialog'
import { useFavoritesSortable } from './useFavoritesSortable'

import { rowId, type HostAction } from "./favorites.model"

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

// Use the sourceId as our bus instance identifier
let _instanceSeq = 0
function makeInstanceId(base: string) {
    _instanceSeq++
    return `${base}::${Date.now()}_${_instanceSeq}`
}
const instanceId = makeInstanceId(props.sourceId)

const emit = defineEmits<{
  (e: 'updateConfig', config: FavoritesConfig | any): void
  (e: 'event', payload: any): void
}>()

// --- Config plumbing ---------------------------------------------------------
const cfg = computed(() => {
    const data = (props.config as any)?.data ?? {}
    const view = (props.config as any)?.view ?? {}
    return { data, view }
})

const editMode = computed(() => !!props.editMode)
const group = computed(() => String((cfg.value.view as any)?.group ?? (cfg.value.data as any)?.group ?? 'main'))
const isSidebar = computed(() => props.placement?.context === 'sidebar')
const layout = computed(() =>
  (cfg.value.view?.layout as 'list' | 'toolbar' | undefined) ??
  (isSidebar.value ? 'list' : 'toolbar')
)
const dense = computed(() => !!cfg.value.view?.dense)
const showIcons = computed(() => cfg.value.view?.showIcons !== false)
const showLabels = computed(() => cfg.value.data?.showLabels !== false)

const hostVars = computed(() => ({
  '--fav-bg': props.theme?.bg         || 'var(--surface-1, #141414)',
  '--fav-fg': props.theme?.fg         || 'var(--fg, #eee)',
  '--fav-border': props.theme?.border || 'rgba(255,255,255,.14)',
}))

// --- DOM Refs ----------------------------------------------------------------
const rootEl = ref<HTMLElement | null>(null)
const sidebarStripEl = ref<HTMLElement | null>(null)
const toolbarEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

// Row element map (shared across composables)
const rowEls = new Map<string, HTMLElement>()

// --- Data Layer (useFavoritesData) -------------------------------------------
const {
  loading,
  error,
  favorites,
  fullTree,
  rootRows,
  refreshFavorites,
  refreshRootFolders,
  broadcastFavoritesChanged,
  findFolderNodeById,
  isRootFolder,
} = useFavoritesData({
  sourceId: props.sourceId,
  configData: () => cfg.value.data,
  groupValue: () => group.value,
  instanceId,
})

// Used only for the "empty" message gate in the template
const visibleFavorites = computed(() => favorites.value)

// Base root rows helper (for sortable)
function baseRootRows() {
  return rootRows.value.slice()
}

const displayRootRows = computed(() => baseRootRows())

// --- Navigation --------------------------------------------------------------
function openFavorite(fav: { path: string; label?: string }, event?: MouseEvent) {
  // If a drag just ended, swallow this click
  if (sortable.isDragJustEnded()) {
    sortable.resetDragJustEnded()
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

// --- Folder Menus (useFolderMenus) -------------------------------------------
const {
  openMenus,
  menuContainers,
  getDropTargetFolderId,
  isFolderMenuOpen,
  openFolderDropdown,
  openFolderDropdownFromDrag,
  closeFolderMenu,
  handleFolderMenuClick,
  refreshOpenMenusFromTree,
  setMenuContainerRef,
  setMenuRowRef,
} = useFolderMenus({
  isSidebar: () => isSidebar.value,
  findFolderNodeById,
  isRootFolder,
  openFavorite,
  rowEls,
})

const dropTargetFolderId = computed(() => getDropTargetFolderId(dragVisuals.lastDropIntent.value))

// Intercept backdrop clicks to handle drag-just-ended swallowing
function handleMenuBackdropClick() {
  console.log('[DEBUG] handleMenuBackdropClick called', { 
    dragJustEnded: sortable.isDragJustEnded(),
    openMenusCount: openMenus.value.length,
    timestamp: performance.now()
  })
  
  // Swallow the first click after a drag/drop so the menu doesn't close
  if (sortable.isDragJustEnded()) {
    sortable.resetDragJustEnded()
    console.log('[DEBUG] Swallowed backdrop click (dragJustEnded was true)')
    return
  }
  
  console.log('[DEBUG] Closing folder menu from backdrop click')
  closeFolderMenu()
}

// Keep menus in sync when root folders refresh
async function refreshRootFoldersWithMenuSync() {
  await refreshRootFolders()
  refreshOpenMenusFromTree()
}

// --- Dialog (useFavoritesDialog) ---------------------------------------------
const {
  showAddDialog,
  saving,
  newPath,
  newLabel,
  addMode,
  newParentId,
  folderOptions,
  addDialogTitle,
  addButtonLabel,
  openAddDialog,
  closeAddDialog,
  confirmAddFavorite,
  handleRemoveFolder,
  handleRemoveFavorite,
} = useFavoritesDialog({
  refreshFavorites,
  refreshRootFolders: refreshRootFoldersWithMenuSync,
  broadcastFavoritesChanged,
})

// --- Drag Visuals (useDragVisuals) -------------------------------------------
const dragVisuals = useDragVisuals({
  activeContainer: () => layout.value === 'list' ? listEl.value : toolbarEl.value,
  activeLayout: () => layout.value === 'list' ? 'list' : layout.value === 'toolbar' ? 'toolbar' : null,
  rowEls,
  findFolderNodeById,
  openFolderDropdownFromDrag,
})

// --- Sortable (useFavoritesSortable) -----------------------------------------
const sortable = useFavoritesSortable({
  layout: () => layout.value,
  listEl,
  toolbarEl,
  baseRootRows,
  openMenus,
  rowEls,
  menuContainers,
  lastDropIntent: dragVisuals.lastDropIntent,
  refreshFavorites,
  refreshRootFolders: refreshRootFoldersWithMenuSync,
  broadcastFavoritesChanged,
  setupGhostForRow: dragVisuals.setupGhostForRow,
  updateGhostPosition: dragVisuals.updateGhostPosition,
  updateInsertBar: dragVisuals.updateInsertBar,
  handleDragHover: dragVisuals.handleDragHover,
  teardownDragVisuals: dragVisuals.teardownDragVisuals,
  clearHoverTimer: dragVisuals.clearHoverTimer,
})

// --- Scroll Hints ------------------------------------------------------------
const {
  hasOverflow: listHasOverflow,
  atStart: listAtTop,
  atEnd: listAtBottom,
  scrollByPage: listScrollByPage,
} = useScrollHints({
  scrollEl: sidebarStripEl,
  axis: 'y',
  deps: () => displayRootRows.value.length,
  minPageStep: 60,
})

const {
  hasOverflow: toolbarHasOverflow,
  atStart: toolbarAtStart,
  atEnd: toolbarAtEnd,
  scrollByPage: toolbarScrollByPage,
} = useScrollHints({
  scrollEl: toolbarEl,
  axis: 'x',
  deps: () => displayRootRows.value.length,
  minPageStep: 80,
  wheel: 'transpose',
})

// --- Snap Resize (sidebar only) ----------------------------------------------
const { style: sidebarListStyle, onResizeDown: onSidebarListResizeDown } =
  useSnapResize({
    targetEl: sidebarStripEl,
    containerEl: rootEl,
    itemCount: computed(() => displayRootRows.value.length),
    stepPx: 26,
    minSteps: 2,
    maxSteps: 20,
    paddingPx: 16,
  })

const onSidebarHandlePointerDown = createDragTrigger(
  (e) => {
    // Drag -> resize
    onSidebarListResizeDown(e)
  },
  {
    thresholdPx: 4,
    gate: { includeDefaultInteractive: false },
    suppressClickAfterDrag: true,
  },
)

function onSidebarHandleClick() {
  // Click -> scroll down (only when it makes sense)
  if (listHasOverflow.value && !listAtBottom.value) {
    listScrollByPage(1)
  }
}

</script>


<template>
  <div
    class="favorites-root"
    ref="rootEl" 
    :class="{
      'sidebar-mode': isSidebar,
      'toolbar-mode': !isSidebar && layout === 'toolbar',
      'edit-mode': !!editMode,
    }"
    :style="hostVars"
  >
    <!-- Add button: sidebar as full row, toolbar as inline pill -->
    <template v-if="isSidebar">
      <button
        type="button"
        class="add-favorite-btn"
        @click="openAddDialog"
      >
        <span class="add-icon">+</span>
        <span class="add-label">Add favorite</span>
      </button>

      <!-- Error message -->
      <div v-if="error" class="fav-msg error">{{ error }}</div>

      <!-- Loading message -->
      <div v-if="loading" class="fav-msg">Loading...</div>

      <!-- Empty state -->
      <div
        v-if="!loading && !error && !visibleFavorites.length"
        class="fav-msg empty"
      >
        No favorites yet
      </div>

      <!-- Vertical list mode with scroll hints -->
      <div
        v-if="displayRootRows.length"
        class="favorites-list-shell"
      >
        <!-- Top hint (scroll up) -->
        <button
          v-if="listHasOverflow && !listAtTop"
          type="button"
          class="fav-list-top-hint"
          @click="listScrollByPage(-1)"
          title="Scroll up"
        >
          <span class="chev">▲</span>
        </button>

        <!-- Scrollable list wrapper -->
        <div
          class="favorites-list-wrapper"
          ref="sidebarStripEl"
          :style="sidebarListStyle"
        >
          <ul class="favorites-list" :class="{ dense }" ref="listEl">
            <li
              v-for="row in displayRootRows"
              :key="row.kind === 'folder' ? row.node.id : row.entry.path"
              class="fav-row"
              :class="{ 'folder-row': row.kind === 'folder' }"
              :ref="el => sortable.setRowRef(row, el as HTMLElement | null)"
            >
              <!-- Folder row -->
              <button
                v-if="row.kind === 'folder'"
                type="button"
                class="fav-btn folder-btn"
                :class="{ 'menu-open': isFolderMenuOpen(row.node.id) }"
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
                @click="openFolderDropdown(row.node, $event)"
              >
                <span v-if="showIcons" class="fav-icon">📁</span>
                <span v-if="showLabels" class="fav-label">{{ row.node.label }}</span>
              </button>

              <!-- Item row -->
              <button
                v-else
                type="button"
                class="fav-btn"
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
                @click="openFavorite(row.entry, $event)"
                :title="row.entry.label || row.entry.path"
              >
                <span v-if="showIcons" class="fav-icon">★</span>
                <span v-if="showLabels" class="fav-label">
                  {{ row.entry.label || row.entry.path }}
                </span>
              </button>

              <!-- Actions (delete) -->
              <div class="fav-row-actions">
                <button
                  v-if="row.kind === 'folder'"
                  type="button"
                  class="icon-btn danger"
                  @pointerdown.stop
                  @click.stop="handleRemoveFolder(row.node.id)"
                  title="Delete folder and nested favorites"
                >
                  ✕
                </button>
                <button
                  v-else
                  type="button"
                  class="icon-btn danger"
                  @pointerdown.stop
                  @click.stop="handleRemoveFavorite(row.entry.path)"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Bottom resize handle (drag to resize or click to scroll) -->
        <div
          class="fav-list-resize-handle"
          @pointerdown="onSidebarHandlePointerDown"
          @click.stop="onSidebarHandleClick"
        >
          <div class="handle-line"></div>
        </div>
      </div>
    </template>

    <!-- Toolbar mode -->
    <template v-else>
      <div class="favorites-toolbar-container">
        <!-- LEFT gutter: stable controls that do NOT overlap scroll content -->
        <div class="fav-toolbar-gutter left">
          <button
            type="button"
            class="fav-edge-tab left fav-edge-add"
            @click.stop="openAddDialog"
            title="Add favorite or folder"
            :disabled="editMode"
          >
            +
          </button>

          <button
            type="button"
            class="fav-edge-tab left"
            title="Scroll left"
            :disabled="editMode || !toolbarHasOverflow || toolbarAtStart"
            @click.stop="toolbarScrollByPage(-1)"
          >
            ◀
          </button>
        </div>

        <!-- CENTER: scrollable content -->
        <div class="favorites-toolbar-wrapper">
          <div
            class="favorites-toolbar"
            :class="{ dense }"
            ref="toolbarEl"
          >
            <template
              v-for="row in displayRootRows"
              :key="row.kind === 'folder' ? row.node.id : row.entry.path"
            >
              <!-- Folder pill with dropdown -->
              <div
                v-if="row.kind === 'folder'"
                class="toolbar-folder-wrapper toolbar-sortable-item"
                :ref="el => sortable.setRowRef(row, el as HTMLElement | null)"
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
              >
                <button
                  type="button"
                  class="fav-pill folder-pill"
                  :class="{ 'menu-open': isFolderMenuOpen(row.node.id) }"
                  @click="openFolderDropdown(row.node, $event)"
                  :title="row.node.label"
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
                :ref="el => sortable.setRowRef(row, el as HTMLElement | null)"
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
              >
                <button
                  type="button"
                  class="fav-pill"
                  @click="openFavorite(row.entry, $event)"
                  :title="row.entry.label || row.entry.path"
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
        </div>

        <!-- RIGHT gutter: stable scroll (never overlaps X) -->
        <div class="fav-toolbar-gutter right">
          <button
            type="button"
            class="fav-edge-tab right"
            title="Scroll right"
            :disabled="editMode || !toolbarHasOverflow || toolbarAtEnd"
            @click.stop="toolbarScrollByPage(1)"
          >
            ▶
          </button>
        </div>
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

  <!-- Folders menu overlay (stacked menus) -->
<teleport to="body">
  <div
    v-if="openMenus.length"
    class="fav-menu-backdrop"
    @click.self="handleMenuBackdropClick"
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
      :ref="el => setMenuContainerRef(menu, el as HTMLElement | null)"
    >

      <div class="fav-menu-title">
        {{ menu.label || 'Folder' }}
      </div>

      <div
        v-if="!menu.rows.length"
        class="fav-menu-empty"
        :class="{
          'is-drop-target':
            dropTargetFolderId === ('folder:' + (menu.folderId ?? '')),
        }"
      >
        No entries
      </div>


      <ul v-else class="fav-menu-list">
        <li
          v-for="row in menu.rows"
          :key="row.id"
          class="fav-menu-row"
          :class="{ 'is-folder': row.type === 'folder' }"
          :ref="el => setMenuRowRef(row, el as HTMLElement | null)"
        >
          <button
            type="button"
            class="fav-menu-btn"
            @pointerdown.stop="sortable.startMenuRowDrag(row, $event as PointerEvent)"
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

          <!-- NEW: inline delete actions -->
          <div class="fav-menu-row-actions">
            <!-- Delete folder -->
            <button
              v-if="row.type === 'folder'"
              type="button"
              class="icon-btn danger fav-menu-delete-btn"
              @pointerdown.stop
              @click.stop="handleRemoveFolder(row.id)"
              title="Delete folder and nested favorites"
            >
              ✕
            </button>

            <!-- Delete item -->
            <button
              v-else
              type="button"
              class="icon-btn danger fav-menu-delete-btn"
              @pointerdown.stop
              @click.stop="row.path && handleRemoveFavorite(row.path)"
              title="Remove favorite"
            >
              ✕
            </button>
          </div>
        </li>
      </ul>

    </div>
  </div>
</teleport>


  </div>
</template>

<style scoped src="./Widget.css"></style>
