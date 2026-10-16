// /src/widgets/favorites/useFavoritesData.ts
import { ref, watch, onMounted, inject } from 'vue'
import {
  FavoriteEntry,
  FavoriteTreeNode,
  type WidgetSdk,
} from 'gexplorer/widgets'
import {
  buildRootRows,
  type RootRow,
} from './favorites.model'

export type UseFavoritesDataOptions = {
  sourceId: string
  configData: () => any
  groupValue: () => string
}

export function useFavoritesData(opts: UseFavoritesDataOptions) {
  const { sourceId, configData, groupValue } = opts

  // The user's favorites come through the widget's SDK ('Favorites' cap in entry.ts).
  const sdk = inject<WidgetSdk>('widgetSdk')
  const getFavorites = sdk?.getFavorites
  const getGlobalFavorites = sdk?.getGlobalFavorites
  if (!getFavorites || !getGlobalFavorites)
    console.error("[favorites] the SDK has no favorites: declare the 'Favorites' capability in entry.ts")

  // Core state
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Flat favorites (items); service is the source of truth for item order
  const favorites = ref<FavoriteEntry[]>([])
  
  // Tree for folders + nested items
  const fullTree = ref<FavoriteTreeNode[]>([])
  
  // Mixed root rows: folders + root-level items, in tree order
  const rootRows = ref<RootRow[]>([])

  /**
   * Load flat favorites list from service
   */
  async function refreshFavorites() {
    loading.value = true
    error.value = null

    try {
      if (!getFavorites) throw new Error("no 'Favorites' capability")
      const svc = await getFavorites(sourceId)
      if (Array.isArray(svc)) {
        favorites.value = svc
      } else {
        const fromCfg = configData()?.entries
        favorites.value = Array.isArray(fromCfg) ? fromCfg : []
      }

      // Rebuild rootRows if we already have a tree
      if (fullTree.value.length) {
        rootRows.value = buildRootRows(fullTree.value, favorites.value)
      }
    } catch (e: any) {
      console.error('[favorites] getFavorites failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')

      const fromCfg = configData()?.entries
      favorites.value = Array.isArray(fromCfg) ? fromCfg : []

      if (fullTree.value.length) {
        rootRows.value = buildRootRows(fullTree.value, favorites.value)
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Load tree structure and build rootRows from it
   */
  async function refreshRootFolders() {
    try {
      if (!getGlobalFavorites) throw new Error("no 'Favorites' capability")
      const tree = await getGlobalFavorites()
      fullTree.value = tree
      rootRows.value = buildRootRows(tree, favorites.value)
    } catch (e) {
      console.error('[favorites] refreshRootFolders failed', e)
      fullTree.value = []
      rootRows.value = []
    }
  }

  /**
   * Find a folder node by ID in the tree
   *
   * TODO(types): return FavoriteTreeFolder | null (narrowed on kind === 'folder') and type
   * useFolderMenus' findFolderNodeById / openFolderDropdownFromDrag with it: useFolderMenus.ts
   * reads .children on a plain FavoriteTreeNode in four places, a type error since the starter's
   * types match the shell's favorites tree (2026-10-15). Runtime is fine: only folders get there.
   */
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

  /**
   * Check if a folder is at root level (not nested)
   */
  function isRootFolder(folderId: string): boolean {
    return fullTree.value.some(
      n => n.kind === 'folder' && n.id === folderId,
    )
  }

  // Any change, from this widget, another widget or the shell: the host tells us
  // (the 'favorites' host topic; released by the host when the widget unmounts).
  sdk?.onHostChange?.('favorites', () => {
    void refreshFavorites()
    void refreshRootFolders()
  })

  onMounted(async () => {
    await refreshFavorites()
    await refreshRootFolders()
  })

  // Watch for config group changes
  watch(groupValue, () => {
    void refreshFavorites()
    void refreshRootFolders()
  })

  return {
    // State
    loading,
    error,
    favorites,
    fullTree,
    rootRows,

    // Methods
    refreshFavorites,
    refreshRootFolders,
    findFolderNodeById,
    isRootFolder,
  }
}
