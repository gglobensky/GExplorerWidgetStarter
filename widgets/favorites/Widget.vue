<script setup lang="ts">
import { ref, computed, nextTick, inject, watch, onBeforeUnmount } from 'vue'
import type { WidgetSdk, WidgetMenuItemMessage } from 'gexplorer/widgets'
import { 
  useScrollHints, 
  useSnapResize,
  FavoritesConfig,
  createDragTrigger,
  startRename,
} from 'gexplorer/widgets'

import { useFavoritesData } from './useFavoritesData'
import { useDragVisuals } from './useDragVisuals'
import { useFolderMenus } from './useFolderMenus'
import { useFavoritesDialog } from './useFavoritesDialog'
import { useFavoritesSortable } from './useFavoritesSortable'
// 0.3.0 (GEM Shell E5c-2): the folder dropdowns are GEM Shell's popovers (one per level, hover sub-levels)
import { useFolderPopovers } from './useFolderPopovers'
import FolderMenu from './FolderMenu.vue'
import type { FolderMenuCtx } from './useFolderPopovers'

import { rowId, placeTooltip, guessLabelFromPath } from "./favorites.model"

const sdk = inject<WidgetSdk>('widgetSdk')
// 0.3.0: nothing is drawn in the host's overlay layer any more (the folder menus are GEM Shell's popovers, the drag
// ghost GEM Shell's): this widget draws inside its own box only (README "Drawing outside your box").

// Standard widget props shape (same pattern as Items)
const props = defineProps<{
  sourceId: string
  config?: FavoritesConfig | { data?: any; view?: any }
  theme?: Record<string, string>
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

// --- Config plumbing ---------------------------------------------------------
const cfg = computed(() => {
    const data = (props.config as any)?.data ?? {}
    const view = (props.config as any)?.view ?? {}
    return { data, view }
})

const editMode = computed(() => !!props.editMode)
const group = computed(() => String((cfg.value.view as any)?.group ?? (cfg.value.data as any)?.group ?? 'main'))
const isSidebar = computed(() => props.placement?.context === 'sidebar')
// Each place has its own layouts (entry.ts); only the grid offers a choice
const layout = computed(() => {
  if (isSidebar.value) return 'list'
  if (props.placement?.context === 'toolbar') return 'toolbar'
  return (cfg.value.view?.layout as 'list' | 'toolbar' | undefined) ?? 'toolbar'
})
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
  fullTree,
  rootRows,
  refresh,
  findFolderNodeById,
  isRootFolder,
} = useFavoritesData()

// Used only for the "empty" message gate in the template
const visibleFavorites = computed(() => rootRows.value)

// Base root rows helper (for sortable)
function baseRootRows() {
  return rootRows.value.slice()
}

const displayRootRows = computed(() => baseRootRows())

// --- Navigation --------------------------------------------------------------
// A favorite opens a place (CHANGED 2026-10-22): one location, or 2-4 folders side by side; the host
// decides where (sdk.navigate's rules: a pane, or asked: this whole tab / its tab).
function openFavorite(fav: { locations: string[]; label?: string }, event?: MouseEvent) {
  // If a drag just ended, swallow this click
  if (sortable.isDragJustEnded()) {
    sortable.resetDragJustEnded()
    event?.preventDefault()
    return
  }

  const locations = (fav.locations ?? []).map(l => l.trim()).filter(Boolean)
  if (!locations.length) return

  // Resolves once the shell opened it, or once the user answered its "where?" question (2026-10-28).
  if (sdk?.navigate) return sdk.navigate(locations.length === 1 ? locations[0] : locations)
  if (locations.length === 1) emit('event', { type: 'openPath', payload: locations[0] })
}

// --- Folder Menus (useFolderMenus) -------------------------------------------
const {
  openMenus,
  menuContainers,
  getDropTargetFolderId,
  isFolderMenuOpen,
  openFolderDropdown,
  openFolderDropdownFromDrag,
  openFolderLevelOnHover,
  closeLevelsAfter,
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

// 0.3.0: a click outside the menus closes them (GEM Shell's popover rule); a drop inside one is a click inside it.

// Open folder menus follow the tree whenever it's read again (2026-10-23: a sub-folder renamed in
// its dropdown kept its old name until reopened: the host's change refresh skipped the menus)
watch(fullTree, () => refreshOpenMenusFromTree())

// Keep open folder menus in step when the favorites are read again
async function refreshWithMenuSync() {
  await refresh()
  refreshOpenMenusFromTree()
}

// --- Dialog (useFavoritesDialog) ---------------------------------------------
// 0.2.0: FavoriteDialog.vue in the host's centred panel (ui.openPopover 'center'), New folder in its prompt
const {
  openAddDialog,
  openAddDialogWith,
  openEditDialog,
  newFolder,
  handleRemoveFolder,
  handleRemoveFavorite,
} = useFavoritesDialog({
  refresh: refreshWithMenuSync,
  anchor: rootEl,
})

/** How many folders a favorite opens (2-4: side by side, a count on its star). */
function paneCount(locations: string[] | undefined): number {
  return (locations ?? []).filter(l => l && l.trim()).length
}
/** A favorite's tooltip, saying it opens side by side. */
function favTip(label: string | undefined, locations: string[] | undefined): string {
  const n = paneCount(locations)
  return placeTooltip(label, locations) + (n > 1 ? `\n(opens ${n} folders side by side)` : '')
}

// --- Drag Visuals (useDragVisuals) -------------------------------------------
const dragVisuals = useDragVisuals({
  activeContainer: () => layout.value === 'list' ? listEl.value : toolbarEl.value,
  activeLayout: () => layout.value === 'list' ? 'list' : layout.value === 'toolbar' ? 'toolbar' : null,
  rowEls,
  findFolderNodeById,
  openFolderDropdownFromDrag,
  // 0.3.0: GEM Shell's ghost (ui.dragGhost), at the pointer anywhere in the window
  dragGhost: (o) => sdk?.ui?.().dragGhost?.(o) ?? null,
})

// --- Sortable (useFavoritesSortable) -----------------------------------------
const sortable = useFavoritesSortable({
  layout: () => layout.value,
  listEl,
  toolbarEl,
  rootRows,
  openMenus,
  rowEls,
  menuContainers,
  lastDropIntent: dragVisuals.lastDropIntent,
  refresh: refreshWithMenuSync,
  setupGhostForRow: dragVisuals.setupGhostForRow,
  updateGhostPosition: dragVisuals.updateGhostPosition,
  updateInsertBar: dragVisuals.updateInsertBar,
  handleDragHover: dragVisuals.handleDragHover,
  teardownDragVisuals: dragVisuals.teardownDragVisuals,
  clearHoverTimer: dragVisuals.clearHoverTimer,
})

// --- Folder popovers (0.3.0) -------------------------------------------------
const menuCtx: FolderMenuCtx = {
  openMenus,
  dropTargetFolderId,
  isDragging: () => !!sortable.sortableState.value.isDragging,
  paneCount,
  favTip,
  onRowClick: (row, e, level) => handleFolderMenuClick(row, e, level),
  onFolderHover: (row, el, level) => openFolderLevelOnHover(row, el, level),
  onItemHover: (level) => closeLevelsAfter(level),
  onDropdownMenu: (folderId, e) => onDropdownMenu(folderId, e),
  onFavoriteMenu: (id, e) => onFavoriteMenu(id, e),
  onFolderNodeMenu: (id, e) => onFolderNodeMenu(id, e),
  removeFolder: (id) => { void handleRemoveFolder(id) },
  removeFavorite: (id) => { void handleRemoveFavorite(id) },
  startMenuRowDrag: (row, folderId, e) => sortable.startMenuRowDrag(row, folderId, e),
  setMenuContainerRef: (menu, el) => setMenuContainerRef(menu, el),
  setMenuRowRef: (row, el) => setMenuRowRef(row, el),
}
const folderPopovers = useFolderPopovers({
  ui: () => sdk?.ui?.() as any,
  openMenus,
  isSidebar: () => isSidebar.value,
  component: FolderMenu,
  ctx: menuCtx,
})
onBeforeUnmount(() => folderPopovers.dispose())

/** 0.3.0: an element in the open folder menus (GEM Shell's popovers: their containers are known by folder). */
function inMenus(sel: string): HTMLElement | null {
  for (const el of menuContainers.values()) {
    const hit = el.querySelector<HTMLElement>(sel)
    if (hit) return hit
  }
  return null
}
const inMenuContainer = (el: Element) => [...menuContainers.values()].some(c => c.contains(el))

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

// --- Menu actions (entry.ts actions: other widgets' file menus, a tab's menu) -------------------
// 2026-10-22 (claude/places-navigation-design.md):
//   add          the selected folders, one favorite each (nothing selected: the folder shown)
//   addTogether  2-4 selected folders as one favorite (they open side by side)
//   addTab       the place a tab shows (a page, a folder, or a split's folders) as one favorite
//   configure    "Add to favorites…": the add dialog on those folders (or the folder shown, or the
//                tab's place) to name it, place it and edit its folders before adding
function placeName(locations: string[]): string {
  return locations.map(guessLabelFromPath).join(' + ')
}

/**
 * A place already a favorite, added without the dialog (0.2.0): the user is told which, and may add it
 * again (the snackbar's button is their choice: addFavorite opts.allowDuplicate).
 */
async function offerDuplicate(locations: string[], existingId: string, leftOut: string) {
  const ui = sdk?.ui?.()
  const existing = findItemById(existingId)
  const name = existing?.label || placeName(locations)
  const r = await ui?.snack({
    text: `"${name}" already opens ${locations.length > 1 ? 'these folders' : 'this folder'}.${leftOut}`,
    actions: [{ label: 'Add a second one', id: 'again' }],
  })
  if (r?.type !== 'action' || r.actionId !== 'again') return
  try {
    await sdk!.addFavorite!(locations, undefined, undefined, { allowDuplicate: true })
    void ui?.snack({ text: `Added "${placeName(locations)}" to favorites.` })
  } catch (e: any) { void ui?.snack({ text: `Not added to favorites: ${e?.message ?? e}` }) }
}

/** Favorite <id> in the tree, with the folder it is in ('' = the top level). */
function findItemById(id: string): { label: string; locations: string[]; parentId: string } | null {
  const walk = (nodes: typeof fullTree.value, parent: string): { label: string; locations: string[]; parentId: string } | null => {
    for (const n of nodes) {
      if (n.kind === 'item' && n.id === id) return { label: n.label, locations: n.locations, parentId: parent }
      if (n.kind === 'folder') { const r = walk(n.children, n.id); if (r) return r }
    }
    return null
  }
  return walk(fullTree.value, '')
}

async function onWidgetAction(msg: any) {
  const { actionId, args, tokens } = msg?.payload ?? {}
  const paths: string[] = (Array.isArray(args?.paths) ? args.paths : []).filter((p: unknown) => typeof p === 'string' && p)
  const skipped = Number(args?.skipped) || 0
  const ui = sdk?.ui?.()
  const say = (text: string) => { void ui?.snack({ text }) }
  const add = sdk?.addFavorite
  if (!add) { console.error("[favorites] the SDK has no addFavorite: declare the 'Favorites' capability in entry.ts"); return }
  const leftOut = skipped ? ` ${skipped} file${skipped === 1 ? ' was' : 's were'} left out.` : ''

  try {
    if (actionId === 'add') {
      const list = paths.length ? paths : (typeof tokens?.dir === 'string' && tokens.dir ? [tokens.dir] : [])
      if (!list.length) return
      if (list.length === 1) {
        const r = await add(list)
        if (r.added) say(`Added "${placeName(list)}" to favorites.${leftOut}`)
        else void offerDuplicate(list, r.id, leftOut)
        return
      }
      let added = 0
      for (const p of list) if ((await add([p])).added) added++
      const already = list.length - added
      say(`Added ${added} folder${added === 1 ? '' : 's'} to favorites${already ? ` (${already} already were)` : ''}.${leftOut}`)
      return
    }
    if (actionId === 'configure') {
      const list = paths.length ? paths : (typeof tokens?.dir === 'string' && tokens.dir ? [tokens.dir] : [])
      openAddDialogWith(list)
      if (skipped) say(`${skipped} file${skipped === 1 ? ' was' : 's were'} left out (a favorite opens folders).`)
      return
    }
    if (actionId === 'addTogether' || actionId === 'addTab') {
      if (!paths.length) return
      const r = await add(paths)
      if (r.added) say(`Added "${placeName(paths)}" to favorites.${leftOut}`)
      else void offerDuplicate(paths, r.id, leftOut)
      return
    }
    console.warn('[favorites] unknown action', actionId)
  } catch (e: any) {
    say(`Not added to favorites: ${e?.message ?? e}`)
  }
}

// --- Right-click on a favorite / a folder (entry.ts menuContexts + menus.items, 2026-10-23) ------
function onFavoriteMenu(id: string, e: MouseEvent) {
  void sdk?.ui?.().contextMenu(e, { context: 'favorites.item', ref: id, widgetConfig: props.config })
}

// The folder button the menu was opened on: Rename… edits its label in place (2026-10-23). This
// widget is shown in several places at once, so the element, not an id, says which copy.
let menuFolder: { id: string; el: HTMLElement } | null = null

/** Right-click on the bar or list itself, not on a favorite (0.2.0): Add favorite…, New folder…. */
function onBackgroundMenu(e: MouseEvent) {
  void sdk?.ui?.().contextMenu(e, { context: 'favorites.background', ref: 'top', widgetConfig: props.config })
}

/** Right-click on an open folder's dropdown, not on a row: that folder's menu. */
function onDropdownMenu(folderId: string | null, e: MouseEvent) {
  if (!folderId) return
  menuFolder = null
  void sdk?.ui?.().contextMenu(e, { context: 'favorites.folder', ref: folderId, widgetConfig: props.config })
}

function onFolderNodeMenu(id: string, e: MouseEvent) {
  menuFolder = e.currentTarget instanceof HTMLElement ? { id, el: e.currentTarget } : null
  void sdk?.ui?.().contextMenu(e, { context: 'favorites.folder', ref: id, widgetConfig: props.config })
}

/** The folder's button: the one its menu came from, else one in this view (its row or its dropdown). */
function folderButton(id: string): HTMLElement | null {
  if (menuFolder?.id === id && menuFolder.el.isConnected) return menuFolder.el
  const sel = `[data-fav-folder="${CSS.escape(id)}"]`
  return rootEl.value?.querySelector<HTMLElement>(sel) ?? inMenus(sel)
}

/** Rename a folder in place: a box over its label (the shell's rename overlay). */
async function renameFolderInPlace(id: string) {
  const ui = sdk?.ui?.()
  const current = findFolderNodeById(id)
  if (!ui || !current) return
  const save = async (name: string) => {
    try { await sdk?.renameFolder?.(id, name) }
    catch (err: any) { void ui.snack({ text: `Not renamed: ${err?.message ?? err}` }) }
  }
  const validate = (v: string) => v.trim() ? null : 'A name is needed.'
  const btn = folderButton(id)
  if (!btn) {
    // Not on screen in this view (a closed dropdown): ask instead
    const name = await ui.prompt('Name of the folder:', { value: current.label, validate })
    if (name !== null) await save(name)
    return
  }
  // Over the label (the icon when labels are hidden); the button is the row (its height)
  const label = btn.querySelector<HTMLElement>('.fav-label, .fav-menu-text') ?? btn
  await startRename(label, { value: current.label, validate, onCommit: save })
}

/** NEW (0.2.2): the element of favorite <id> on screen (list row, pill, open dropdown row), or null. */
function itemButton(id: string): HTMLElement | null {
  const sel = `[data-fav-item="${CSS.escape(id)}"]`
  return rootEl.value?.querySelector<HTMLElement>(sel) ?? inMenus(sel)
}

/** NEW (0.2.2): rename a favorite in place (its label), as a folder; a prompt when it isn't on screen. */
async function renameItemInPlace(id: string) {
  const ui = sdk?.ui?.()
  const current = findItemById(id)
  if (!ui || !current) return
  const save = async (name: string) => {
    try { await sdk?.updateFavorite?.(id, { label: name.trim() }) }
    catch (err: any) { void ui.snack({ text: `Not renamed: ${err?.message ?? err}` }) }
  }
  const validate = (v: string) => v.trim() ? null : 'A name is needed.'
  const value = current.label || current.locations.join(' + ')
  const btn = itemButton(id)
  if (!btn) {
    const name = await ui.prompt('Name of the favorite:', { value, validate })
    if (name !== null) await save(name)
    return
  }
  const label = btn.querySelector<HTMLElement>('.fav-label, .fav-menu-text') ?? btn
  await startRename(label, { value, validate, onCommit: save })
}

/** One of this widget's menu items was chosen (the host calls it). */
async function onMenuItem(m: WidgetMenuItemMessage) {
  const id = m.ref
  if (!id) return
  switch (m.itemId) {
    case 'edit':   await openEditDialog(id); break
    case 'remove': await handleRemoveFavorite(id); break
    case 'delete': await handleRemoveFolder(id); break
    case 'rename': await renameFolderInPlace(id); break
    case 'rename-item': await renameItemInPlace(id); break
    // 0.2.0: adding from the menus. Next to a favorite: in its folder; on a folder: inside it; elsewhere: the top level.
    case 'add-here': openAddDialog(findItemById(id)?.parentId ?? ''); break
    case 'new-folder-here': await newFolder(findItemById(id)?.parentId ?? ''); break
    case 'add-inside': closeFolderMenu(); openAddDialog(id); break
    case 'new-folder-inside': await newFolder(id); break
    case 'add': openAddDialog(''); break
    case 'new-folder': await newFolder(''); break
    default: console.warn('[favorites] unknown menu item', m.itemId)
  }
}

/**
 * Keys (entry.ts commands): F2 on the folder or favorite under the mouse (`when: 'hovered'`), else the focused
 * one (0.2.1 folders, 0.2.2 favorites too).
 */
function onCommand(id: string) {
  if (id !== 'rename') return
  const sel = '[data-fav-folder]:hover, [data-fav-item]:hover'
  const hovered = rootEl.value?.querySelector<HTMLElement>(sel) ?? inMenus(sel)
  const focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('[data-fav-folder], [data-fav-item]') ?? null
  const target = hovered ?? (focused && (rootEl.value?.contains(focused) || inMenuContainer(focused)) ? focused : null)
  if (target?.dataset.favFolder) void renameFolderInPlace(target.dataset.favFolder)
  else if (target?.dataset.favItem) void renameItemInPlace(target.dataset.favItem)
}

defineExpose({ onWidgetAction, onMenuItem, onCommand })

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
    @contextmenu.prevent="onBackgroundMenu"
  >
    <!-- Add button: sidebar as full row, toolbar as inline pill -->
    <template v-if="isSidebar">
      <button
        type="button"
        class="add-favorite-btn"
        title="Add a favorite or a folder"
        @click="openAddDialog()"
      >
        <span class="add-icon"><svg class="fav-add-star" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /><path class="fav-add-plus" d="M10 7.4v5.2M7.4 10h5.2" /></svg></span>
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
          class="fav-scroll-strip fav-scroll-strip--up"
          @click="listScrollByPage(-1)"
          title="Scroll up"
          aria-label="Scroll up"
        >
          <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 5l4-4 4 4" /></svg>
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
              :key="row.kind === 'folder' ? row.node.id : row.entry.id"
              class="fav-row"
              :data-fav-row-id="rowId(row)"
              :ref="el => sortable.setRowRef(row, el as HTMLElement | null)"
            >
              <!-- Folder row -->
              <button
                v-if="row.kind === 'folder'"
                type="button"
                class="fav-btn folder-btn"
                :class="{ 'menu-open': isFolderMenuOpen(row.node.id) }"
                :data-fav-folder="row.node.id"
                data-rename-row
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
                @click="openFolderDropdown(row.node, $event)"
                @contextmenu.prevent.stop="onFolderNodeMenu(row.node.id, $event)"
              >
                <span v-if="showIcons" class="fav-icon">📁</span>
                <span v-if="showLabels" class="fav-label">{{ row.node.label }}</span>
              </button>

              <!-- Item row -->
              <button
                v-else
                type="button"
                class="fav-btn"
                :data-fav-item="row.entry.id"
                data-rename-row
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
                @click="openFavorite(row.entry, $event)"
                @contextmenu.prevent.stop="onFavoriteMenu(row.entry.id, $event)"
                :title="favTip(row.entry.label, row.entry.locations)"
              >
                <span v-if="showIcons" class="fav-icon" :class="{ 'fav-icon--multi': paneCount(row.entry.locations) > 1 }">★<span v-if="paneCount(row.entry.locations) > 1" class="fav-pane-count">{{ paneCount(row.entry.locations) }}</span></span>
                <span v-if="showLabels" class="fav-label">
                  {{ row.entry.label || row.entry.locations.join(' + ') }}
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
                  @click.stop="handleRemoveFavorite(row.entry.id)"
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
            class="fav-edge-add"
            @click.stop="openAddDialog()"
            title="Add a favorite or a folder"
            aria-label="Add a favorite or a folder"
            :disabled="editMode"
          >
            <svg class="fav-add-star" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /><path class="fav-add-plus" d="M10 7.4v5.2M7.4 10h5.2" /></svg>
          </button>

          <!-- 0.2.0: thin strips, only when the favorites don't fit -->
          <button
            v-if="toolbarHasOverflow"
            type="button"
            class="fav-scroll-strip fav-scroll-strip--left"
            title="Scroll left"
            aria-label="Scroll left"
            :disabled="editMode || toolbarAtStart"
            @click.stop="toolbarScrollByPage(-1)"
          >
            <svg viewBox="0 0 6 10" aria-hidden="true"><path d="M5 1L1 5l4 4" /></svg>
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
              :key="row.kind === 'folder' ? row.node.id : row.entry.id"
            >
              <!-- Folder pill with dropdown -->
              <div
                v-if="row.kind === 'folder'"
                class="toolbar-folder-wrapper toolbar-sortable-item"
                :ref="el => sortable.setRowRef(row, el as HTMLElement | null)"
                :data-fav-row-id="rowId(row)"
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
              >
                <button
                  type="button"
                  class="fav-pill folder-pill"
                  :class="{ 'menu-open': isFolderMenuOpen(row.node.id) }"
                  :data-fav-folder="row.node.id"
                  data-rename-row
                  @click="openFolderDropdown(row.node, $event)"
                  @contextmenu.prevent.stop="onFolderNodeMenu(row.node.id, $event)"
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
                :data-fav-row-id="rowId(row)"
                @pointerdown.stop="sortable.startRowDrag(row, $event)"
              >
                <button
                  type="button"
                  class="fav-pill"
                  :data-fav-item="row.entry.id"
                  data-rename-row
                  @click="openFavorite(row.entry, $event)"
                  @contextmenu.prevent.stop="onFavoriteMenu(row.entry.id, $event)"
                  :title="favTip(row.entry.label, row.entry.locations)"
                >
                  <span v-if="showIcons" class="fav-icon" :class="{ 'fav-icon--multi': paneCount(row.entry.locations) > 1 }">★<span v-if="paneCount(row.entry.locations) > 1" class="fav-pane-count">{{ paneCount(row.entry.locations) }}</span></span>
                  <span v-if="showLabels" class="fav-label">
                    {{ row.entry.label || row.entry.locations.join(' + ') }}
                  </span>
                </button>

                <!-- Delete button -->
                <button
                  type="button"
                  class="icon-btn danger toolbar-delete-btn"
                  @pointerdown.stop
                  @click.stop="handleRemoveFavorite(row.entry.id)"
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
            v-if="toolbarHasOverflow"
            type="button"
            class="fav-scroll-strip fav-scroll-strip--right"
            title="Scroll right"
            aria-label="Scroll right"
            :disabled="editMode || toolbarAtEnd"
            @click.stop="toolbarScrollByPage(1)"
          >
            <svg viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4" /></svg>
          </button>
        </div>
      </div>

    </template>


  <!-- 0.3.0: the folder menus are GEM Shell's popovers (FolderMenu.vue, useFolderPopovers.ts) -->


  </div>
</template>

<style scoped src="./Widget.css"></style>