// /src/widgets/favorites/useFavoritesDialog.ts
import { ref, computed, inject } from '/runtime/vue.js'
import {
  getCurrentPath,
  FavoriteTreeNode,
  type WidgetSdk
} from 'gexplorer/widgets'
import { guessLabelFromPath } from './favorites.model'

export type UseFavoritesDialogOptions = {
  refreshFavorites: () => Promise<void>
  refreshRootFolders: () => Promise<void>
  broadcastFavoritesChanged: (reason: 'add' | 'remove' | 'move' | 'folder-add' | 'folder-remove' | 'other') => void
}

export type FolderOption = { id: string; label: string; depth: number }

export function useFavoritesDialog(opts: UseFavoritesDialogOptions) {
  // The user's favorites come through the widget's SDK ('Favorites' cap in entry.ts).
  const sdk = inject<WidgetSdk>('widgetSdk')
  const need = <K extends keyof WidgetSdk>(k: K): NonNullable<WidgetSdk[K]> => {
    const f = sdk?.[k]
    if (!f) throw new Error(`the SDK has no ${String(k)}: declare the 'Favorites' capability in entry.ts`)
    return f as NonNullable<WidgetSdk[K]>
  }
  const {
    refreshFavorites,
    refreshRootFolders,
    broadcastFavoritesChanged,
  } = opts

  // Dialog state
  const showAddDialog = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  // Form fields
  const newPath = ref('')
  const newLabel = ref('')
  const addMode = ref<'item' | 'folder'>('item')
  const newParentId = ref<string>('') // '' = root, otherwise a folder id

  // Folder options for parent dropdown
  const folderOptions = ref<FolderOption[]>([])

  // Computed labels
  const addDialogTitle = computed(() =>
    addMode.value === 'folder' ? 'Add folder' : 'Add favorite'
  )

  const addButtonLabel = computed(() =>
    addMode.value === 'folder' ? 'Create' : 'Add'
  )

  /**
   * Build folder options for the parent dropdown
   */
  async function refreshFolderOptions() {
    try {
      const tree = await need('getGlobalFavorites')()

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

  /**
   * Open the add dialog (prefills with current path)
   */
  function openAddDialog() {
    const base = getCurrentPath().trim()
    addMode.value = 'item'
    newPath.value = base
    newLabel.value = guessLabelFromPath(base)
    newParentId.value = '' // root by default

    void refreshFolderOptions()
    showAddDialog.value = true
  }

  /**
   * Close the add dialog
   */
  function closeAddDialog() {
    showAddDialog.value = false
  }

  /**
   * Confirm and execute add favorite/folder
   */
  async function confirmAddFavorite() {
    const path = newPath.value.trim()
    const label = newLabel.value.trim()
    const parentId = newParentId.value || null

    saving.value = true
    error.value = null

    try {
      if (addMode.value === 'folder') {
        if (!label) return
        await need('addFolder')(label, parentId)
        await refreshFolderOptions()
        await refreshRootFolders()
      } else {
        if (!path) return
        await need('addFavorite')(path, label || undefined, parentId)
        await refreshRootFolders()
      }

      await refreshFavorites()

      // Notify other favorites widgets
      broadcastFavoritesChanged(addMode.value === 'folder' ? 'folder-add' : 'add')

      closeAddDialog()
    } catch (e: any) {
      console.error('[favorites] addFavorite/addFolder failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
    } finally {
      saving.value = false
    }
  }

  /**
   * Remove a folder and all its nested contents
   */
  async function handleRemoveFolder(folderId: string) {
    const ok = window.confirm(
      'Delete this folder and ALL nested favorites inside it? This cannot be undone.'
    )
    if (!ok) return

    error.value = null
    try {
      await need('removeFolder')(folderId)

      // Reload tree + flat favorites so UI is fully in sync
      await refreshRootFolders()
      await refreshFavorites()

      // Notify other favorites widgets
      broadcastFavoritesChanged('folder-remove')
    } catch (e: any) {
      console.error('[favorites] removeFolder failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
    }
  }

  /**
   * Remove a favorite item
   */
  async function handleRemoveFavorite(path: string) {
    error.value = null
    try {
      await need('removeFavorite')(path)

      // Reload tree + flat favorites so UI is fully in sync
      await refreshRootFolders()
      await refreshFavorites()

      broadcastFavoritesChanged('remove')
    } catch (e: any) {
      console.error('[favorites] removeFavorite failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
    }
  }

  return {
    // Dialog state
    showAddDialog,
    saving,
    error,

    // Form fields
    newPath,
    newLabel,
    addMode,
    newParentId,

    // Folder options
    folderOptions,

    // Computed
    addDialogTitle,
    addButtonLabel,

    // Methods
    openAddDialog,
    closeAddDialog,
    confirmAddFavorite,
    handleRemoveFolder,
    handleRemoveFavorite,
    refreshFolderOptions,
  }
}
