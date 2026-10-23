// /src/widgets/favorites/useFavoritesData.ts
//
// The favorites tree (the shell's, through the SDK: 'Favorites' cap in entry.ts) and its top-level rows.
// CHANGED 2026-10-22: one source, the tree (the flat list and the config "entries" fallback are gone), and
// one refresh.
import { ref, onMounted, inject } from 'vue'
import type { FavoriteTreeNode, WidgetSdk } from 'gexplorer/widgets'
import { buildRootRows, type RootRow } from './favorites.model'

export function useFavoritesData() {
  const sdk = inject<WidgetSdk>('widgetSdk')
  const getGlobalFavorites = sdk?.getGlobalFavorites
  if (!getGlobalFavorites)
    console.error("[favorites] the SDK has no favorites: declare the 'Favorites' capability in entry.ts")

  const loading = ref(false)
  const error = ref<string | null>(null)

  // The whole tree (folders and favorites), and its top level as rows, in the user's order
  const fullTree = ref<FavoriteTreeNode[]>([])
  const rootRows = ref<RootRow[]>([])

  /** Reads the tree again. */
  async function refresh() {
    loading.value = true
    error.value = null
    try {
      if (!getGlobalFavorites) throw new Error("no 'Favorites' capability")
      const tree = await getGlobalFavorites()
      fullTree.value = tree
      rootRows.value = buildRootRows(tree)
    } catch (e: any) {
      console.error('[favorites] reading the favorites failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
      fullTree.value = []
      rootRows.value = []
    } finally {
      loading.value = false
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
  sdk?.onHostChange?.('favorites', () => { void refresh() })

  onMounted(() => { void refresh() })

  return {
    loading,
    error,
    fullTree,
    rootRows,
    refresh,
    findFolderNodeById,
    isRootFolder,
  }
}
