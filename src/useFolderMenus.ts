// /src/widgets/favorites/useFolderMenus.ts
import { ref, computed } from '/runtime/vue.js'
import type { FavoriteTreeNode, FavoriteEntry } from '/src/widgets/contracts/favorites'
import type { OpenMenu, MenuRow } from './favorites.model'
import { buildMenuRows, menuRowId } from './favorites.model'

export type UseFolderMenusOptions = {
  isSidebar: () => boolean
  findFolderNodeById: (id: string | null) => FavoriteTreeNode | null
  isRootFolder: (folderId: string) => boolean
  openFavorite: (fav: FavoriteEntry, event?: MouseEvent) => void
  rowEls: Map<string, HTMLElement>
}

export function useFolderMenus(opts: UseFolderMenusOptions) {
  const {
    isSidebar,
    findFolderNodeById,
    isRootFolder,
    openFavorite,
    rowEls,
  } = opts

  // Map from folderId -> menu container element (for empty-folder drops)
  const menuContainers = new Map<string, HTMLElement>()

  // Stack of open menus (supports nested cascading)
  const openMenus = ref<OpenMenu[]>([])

  /**
   * Computed: the folder ID that's currently being targeted for a drop (if any)
   */
  function getDropTargetFolderId(lastDropIntent: any): string | null {
    const intent = lastDropIntent
    if (!intent || intent.placement !== 'inside' || !intent.targetId) {
      return null
    }
    const id = String(intent.targetId)
    return id.startsWith('folder:') ? id : null
  }

  /**
   * Helper to check if a folder menu is currently open
   */
  function isFolderMenuOpen(folderId: string): boolean {
    return openMenus.value.some(m => m.folderId === folderId)
  }

  /**
   * Open a folder dropdown (user click on folder pill)
   */
  function openFolderDropdown(folder: FavoriteTreeNode, event: MouseEvent) {
    const anchor = event.currentTarget as HTMLElement | null
    const rect = anchor?.getBoundingClientRect()

    const top = rect ? rect.bottom + 4 : 80

    let left: number
    if (rect) {
      if (isSidebar()) {
        // Sidebar: shift menu so only ~half of it covers the sidebar
        left = rect.left + rect.width / 2
      } else {
        // Toolbar / grid: keep existing behavior
        left = rect.left
      }
    } else {
      left = 80
    }

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

  /**
   * Open a folder dropdown from drag hover (auto-expand on hover)
   */
  function openFolderDropdownFromDrag(folder: FavoriteTreeNode, anchor: HTMLElement | null) {
    const rect = anchor?.getBoundingClientRect()
    const rows = buildMenuRows(folder.children)

    // Case 1: root-level folder (same behavior as before)
    if (isRootFolder(folder.id)) {
      const top = rect ? rect.bottom + 4 : 80
      const left = rect ? rect.left : 80

      const existingRoot = openMenus.value[0]
      if (existingRoot && existingRoot.folderId === folder.id) {
        // Already open as root → do nothing
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
      return
    }

    // Case 2: nested folder inside an existing menu
    // Find which menu level contains this folder as a row
    const level = openMenus.value.findIndex(menu =>
      menu.rows.some(r => r.type === 'folder' && r.id === folder.id),
    )

    if (level === -1) {
      // Fallback: treat it like a root-level open if we somehow didn't find it
      const top = rect ? rect.bottom + 4 : 80
      const left = rect ? rect.left : 80
      openMenus.value = [
        {
          folderId: folder.id,
          label: folder.label,
          rows,
          top,
          left,
        },
      ]
      return
    }

    const parentMenu = openMenus.value[level]
    const top = rect ? rect.top : parentMenu?.top ?? 80
    const left = rect ? rect.right + 8 : (parentMenu?.left ?? 80) + 220

    const next = openMenus.value.slice(0, level + 1)
    next[level + 1] = {
      folderId: folder.id,
      label: folder.label,
      rows,
      top,
      left,
    }

    openMenus.value = next
  }

  /**
   * Close all folder menus
   */
  function closeFolderMenu() {
    openMenus.value = []
  }

  /**
   * Handle click on a menu row (either folder or item)
   */
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

  /**
   * Keep open menus in sync with tree changes (after moves/deletes)
   */
  function refreshOpenMenusFromTree() {
    console.log('[DEBUG] refreshOpenMenusFromTree called', {
      openMenusCount: openMenus.value.length,
      menuFolderIds: openMenus.value.map(m => m.folderId),
      timestamp: performance.now()
    })

    if (!openMenus.value.length) return

    const next: OpenMenu[] = []

    for (const menu of openMenus.value) {
      // Menus tied to a folderId need to be rebuilt
      if (!menu.folderId) {
        next.push(menu)
        continue
      }

      const folder = findFolderNodeById(menu.folderId)
      if (!folder) {
        // Folder no longer exists → drop that menu level
        console.log('[DEBUG] Folder no longer exists, dropping menu:', menu.folderId)
        continue
      }

      next.push({
        ...menu,
        label: folder.label,
        rows: buildMenuRows(folder.children),
        // keep top/left so the menu doesn't jump
      })
    }

    console.log('[DEBUG] refreshOpenMenusFromTree complete', {
      oldCount: openMenus.value.length,
      newCount: next.length
    })

    openMenus.value = next
  }

  /**
   * Set a menu container ref (for hit-testing empty folders)
   */
  function setMenuContainerRef(menu: OpenMenu, el: HTMLElement | null) {
    const folderId = menu.folderId
    if (!folderId) return

    if (el) {
      menuContainers.set(folderId, el)
    } else {
      menuContainers.delete(folderId)
    }
  }

  /**
   * Set a menu row ref (for drag hit-testing)
   */
  function setMenuRowRef(row: MenuRow, el: HTMLElement | null) {
    const id = menuRowId(row)
    if (!id) return

    if (el) {
      rowEls.set(id, el)
    } else {
      rowEls.delete(id)
    }
  }

  return {
    // State
    openMenus,
    menuContainers,

    // Computed helpers
    getDropTargetFolderId,
    isFolderMenuOpen,

    // Methods
    openFolderDropdown,
    openFolderDropdownFromDrag,
    closeFolderMenu,
    handleFolderMenuClick,
    refreshOpenMenusFromTree,
    setMenuContainerRef,
    setMenuRowRef,
  }
}
