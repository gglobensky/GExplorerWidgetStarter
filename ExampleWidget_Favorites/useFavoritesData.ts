// /src/widgets/favorites/useFavoritesData.ts
import { ref, watch, onMounted, onBeforeUnmount } from '/runtime/vue.js'
import type {
  FavoriteEntry,
  FavoriteTreeNode,
} from '/src/widgets/contracts/favorites'
import {
  getFavorites,
  getGlobalFavorites,
} from '/src/widgets/favorites/service'
import {
  sendWidgetMessage,
  onWidgetMessage,
} from '/src/widgets/instances'
import {
  buildRootRows,
  type RootRow,
} from './favorites.model'

export type UseFavoritesDataOptions = {
  sourceId: string
  configData: () => any
  groupValue: () => string
  instanceId: string
}

export function useFavoritesData(opts: UseFavoritesDataOptions) {
  const { sourceId, configData, groupValue, instanceId } = opts

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
   * Broadcast a favorites change event to other widget instances
   */
  function broadcastFavoritesChanged(
    reason: 'add' | 'remove' | 'move' | 'folder-add' | 'folder-remove' | 'other' = 'other'
  ) {
    sendWidgetMessage({
      from: instanceId,
      topic: 'favorites:changed',
      payload: { reason },
    })
  }

  /**
   * Load flat favorites list from service
   */
  async function refreshFavorites() {
    loading.value = true
    error.value = null

    try {
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

  // Cross-widget refresh handler
  let offBus: (() => void) | null = null

  onMounted(async () => {
    // Initial load
    await refreshFavorites()
    await refreshRootFolders()

    // Listen for changes from other widget instances
    offBus = onWidgetMessage((msg) => {
      if (msg.topic !== 'favorites:changed') return
      if (msg.from === instanceId) return
      void refreshFavorites()
      void refreshRootFolders()
    })
  })

  onBeforeUnmount(() => {
    offBus?.()
    offBus = null
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
    broadcastFavoritesChanged,
    findFolderNodeById,
    isRootFolder,
  }
}
