// /src/widgets/favorites/useFolderMenus.ts
//
// CHANGED 0.4.0 (2026-11-21, GEM Shell's menu API: PhotinoVue1 claude/plan-2026-11-21-menu-api.md): a folder's
// dropdown is ONE sdk.ui().openMenu, its sub-folders its submenus. GEM Shell draws every level, opens sub-folders on
// hover / → / while a drag lingers, gives the keyboard, the ✕, inline rename (F2) and dragging rows within and between
// levels. Here: the rows (read live from the tree), and what each gesture does to the favorites.
//   - A drag inside the menus: applyFavoritesMove (into a menu's empty space: into that folder).
//   - A row carried out of the menus: the bar shows where it goes (barIntentAt / showBarIntent) and takes the drop.
//   - The bar's own drag over an open menu: dragOver (useFavoritesSortable.ts asks it on every move).
// Before 0.4.0: FolderMenu.vue, useFolderPopovers.ts and this file's levels (a popover per level), and the raw
// pointer loop in useFavoritesSortable.ts.
import { inject, ref } from 'vue'
import type {
  DropIntent,
  FavoriteTreeFolder,
  FavoriteTreeNode,
  WidgetMenuEntry,
  WidgetMenuHandle,
  WidgetMenuRow,
  WidgetSdk,
} from 'gexplorer/widgets'

export type UseFolderMenusOptions = {
  isSidebar: () => boolean
  findFolderNodeById: (id: string | null) => FavoriteTreeFolder | null
  openFavorite: (fav: { locations: string[]; label?: string }) => void | Promise<unknown>
  paneCount: (locations: string[] | undefined) => number
  favTip: (label: string | undefined, locations: string[] | undefined) => string
  removeFolder: (id: string) => void
  removeFavorite: (id: string) => void
  renameFolder: (id: string, name: string) => Promise<void>
  renameFavorite: (id: string, name: string) => Promise<void>
  onFavoriteMenu: (id: string, e: MouseEvent) => void
  onFolderNodeMenu: (id: string, e: MouseEvent) => void
  /** Moves a node (row ids: folder:<id> / item:<id>), then reads the favorites again. */
  applyMove: (movedRowId: string, targetRowId: string, placement: 'before' | 'after' | 'inside') => Promise<void>
  /** Where a drop at (x, y) goes on the bar or the list (null: not on it). */
  barIntentAt: (x: number, y: number) => DropIntent | null
  /** The bar's insert mark for that drop (null: none). */
  showBarIntent: (intent: DropIntent | null) => void
}

/** Favorites' own dark frame (each menu keeps its look: the menu API's decisions). */
const MENU_STYLE = { background: 'rgba(10, 10, 10, 0.98)', borderColor: 'rgba(255, 255, 255, 0.14)', radius: 8, shadow: 'large' as const, padding: 4 }

/** folder:<id> / item:<id> (the bar's row ids too) and back. */
const keyOf = (rowId: string) => rowId.slice(rowId.indexOf(':') + 1)
const isFolderRow = (rowId: string) => rowId.startsWith('folder:')

export function useFolderMenus(opts: UseFolderMenusOptions) {
  const sdk = inject<WidgetSdk>('widgetSdk')

  /** The folder whose menu is open (its pill shows it), or null. */
  const openFolderId = ref<string | null>(null)
  let handle: WidgetMenuHandle | null = null

  /** A folder's children as menu rows (sub-folders as submenus): ids folder:<id> / item:<id>, as the bar's. */
  function rowsOf(nodes: FavoriteTreeNode[]): WidgetMenuEntry[] {
    return nodes.map(n => n.kind === 'folder'
      ? {
          id: `folder:${n.id}`, label: n.label || 'Folder', icon: '📁', children: rowsOf(n.children),
          removable: 'Remove folder and its favorites', renamable: true, draggable: true,
        }
      : {
          id: `item:${n.id}`, label: n.label || n.locations.join(' + '),
          // A favorite of several folders (side by side): their count on its star
          icon: opts.paneCount(n.locations) > 1 ? `★${opts.paneCount(n.locations)}` : '★',
          tooltip: opts.favTip(n.label, n.locations).slice(0, 300),
          removable: 'Remove favorite', renamable: true, draggable: true, data: n.locations,
        })
  }

  function isFolderMenuOpen(folderId: string): boolean {
    return openFolderId.value === folderId && !!handle?.open
  }

  function closeFolderMenu() {
    handle?.close()
  }

  /** Opens folder <folder>'s menu at <anchor> (its pill, or its row in the list); the same folder again: closes it. */
  function openFolderMenu(folder: FavoriteTreeFolder, anchor: HTMLElement | null) {
    if (!anchor) return
    if (handle?.open && openFolderId.value === folder.id) { handle.close(); return }
    handle?.close()
    const ui = sdk?.ui?.()
    if (!ui?.openMenu) {
      void ui?.snack({ text: 'Folder menus need a newer GEM Shell (the menu API).' })
      return
    }
    const folderId = folder.id
    const h = ui.openMenu({
      at: anchor,
      label: folder.label,
      placement: opts.isSidebar() ? 'right' : 'below',
      style: MENU_STYLE,
      // Read live: a favorite added, removed, renamed or moved shows at once
      items: () => rowsOf(opts.findFolderNodeById(folderId)?.children ?? []),
      onPick: (row: WidgetMenuRow) => {
        if (isFolderRow(row.id)) return
        const locations = Array.isArray(row.data) ? (row.data as string[]) : []
        if (locations.length) void opts.openFavorite({ locations, label: row.label })
      },
      onRemove: row => isFolderRow(row.id) ? opts.removeFolder(keyOf(row.id)) : opts.removeFavorite(keyOf(row.id)),
      onRename: (row, name) => isFolderRow(row.id) ? opts.renameFolder(keyOf(row.id), name) : opts.renameFavorite(keyOf(row.id), name),
      onRowMenu: (row, e) => isFolderRow(row.id) ? opts.onFolderNodeMenu(keyOf(row.id), e) : opts.onFavoriteMenu(keyOf(row.id), e),
      drag: {
        // Inside the menus: target null is this menu's own folder (its top level's empty space)
        onMove: (row, target, where) => opts.applyMove(row.id, target ? target.id : `folder:${folderId}`, target ? where : 'inside'),
        // Carried out of the menus: the bar shows where it goes, and takes it
        onDragMove: (_row, e, overMenu) => opts.showBarIntent(overMenu ? null : opts.barIntentAt(e.clientX, e.clientY)),
        onDragOut: (row, e) => {
          opts.showBarIntent(null)
          const intent = opts.barIntentAt(e.clientX, e.clientY)
          if (intent) void opts.applyMove(row.id, String(intent.targetId), intent.placement as 'before' | 'after' | 'inside')
        },
      },
      onClose: () => {
        if (handle !== h) return
        handle = null
        openFolderId.value = null
      },
    })
    if (!h) return
    handle = h
    openFolderId.value = folderId
  }

  /** A click on a folder's pill or row. */
  function openFolderDropdown(folder: FavoriteTreeFolder, event: MouseEvent) {
    openFolderMenu(folder, event.currentTarget as HTMLElement | null)
  }

  /** The bar's drag lingered on a folder's pill (useDragVisuals.ts): its menu opens, to drop inside. */
  function openFolderDropdownFromDrag(folder: FavoriteTreeFolder, anchor: HTMLElement | null) {
    if (isFolderMenuOpen(folder.id)) return
    openFolderMenu(folder, anchor)
  }

  /**
   * The bar's drag (of <draggedRowId>) at (x, y), over the open menu: where it goes there (target: a row id; the top
   * level's end: this menu's folder), or null when not over the menu; refused there: blocked.
   */
  function menuIntentAt(x: number, y: number, draggedRowId: string): { intent: DropIntent | null } | null {
    if (!handle?.open) return null
    const hit = handle.dragOver(x, y, draggedRowId)
    if (!hit) return null
    if (!hit.ok) return { intent: null }
    const targetId = hit.target ? hit.target.id : `folder:${openFolderId.value}`
    return { intent: { targetId, placement: hit.target ? hit.where : 'inside' } as DropIntent }
  }

  /** The bar's drag ended: the menu's marks go. */
  function menuDragEnd() {
    handle?.dragLeave()
  }

  /** The open menu's row the user is on (under the pointer, or the keyboard's): its id (folder:<id> / item:<id>), or null. */
  function focusedMenuRowId(): string | null {
    return handle?.open ? handle.focused()?.id ?? null : null
  }

  /** Renames row <rowId> in the open menu (false: not shown there). */
  function renameInMenu(rowId: string): boolean {
    return !!handle?.open && handle.rename(rowId)
  }

  return {
    openFolderId,
    isFolderMenuOpen,
    openFolderDropdown,
    openFolderDropdownFromDrag,
    closeFolderMenu,
    menuIntentAt,
    menuDragEnd,
    renameInMenu,
    focusedMenuRowId,
  }
}
