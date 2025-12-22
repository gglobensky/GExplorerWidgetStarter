// /src/widgets/favorites/useFavoritesSortable.ts
import { ref, watch, onMounted, onBeforeUnmount, nextTick, type Ref } from '/runtime/vue.js'
import {
  snapshotFromNodes,
  type SortableNodeRef,
  type DropIntent,
} from '/src/widgets/sortable/engine'
import {
  createSortableDriver,
  type SortableModelAdapter,
  type SortableGeometryAdapter,
  type MoveEvent,
  type SortableDriver,
} from '/src/widgets/sortable/driver'
import {
  createSortableVisuals,
  type SortableVisuals,
} from '/src/widgets/sortable/ui-adapter'
import { applyFavoritesMove } from '/src/widgets/favorites/service'
import {
  rowId,
  menuRowId,
  parseRootRowId,
  type RootRow,
  type RootRowId,
  type MenuRow,
  type OpenMenu,
} from './favorites.model'

export type UseFavoritesSortableOptions = {
  layout: () => 'list' | 'toolbar'
  listEl: Ref<HTMLElement | null>
  toolbarEl: Ref<HTMLElement | null>
  baseRootRows: () => RootRow[]
  openMenus: Ref<OpenMenu[]>
  rowEls: Map<RootRowId, HTMLElement>
  menuContainers: Map<string, HTMLElement>
  lastDropIntent: Ref<DropIntent | null>
  refreshFavorites: () => Promise<void>
  refreshRootFolders: () => Promise<void>
  broadcastFavoritesChanged: (reason: 'move' | 'other') => void
  setupGhostForRow: (id: RootRowId, ev: PointerEvent) => void
  updateGhostPosition: (ev: PointerEvent) => void
  updateInsertBar: (intent: DropIntent | null, blocked: boolean) => void
  handleDragHover: (intent: DropIntent | null) => void
  teardownDragVisuals: () => void
  clearHoverTimer: () => void
}

export function useFavoritesSortable(opts: UseFavoritesSortableOptions) {
  const {
    layout,
    listEl,
    toolbarEl,
    baseRootRows,
    openMenus,
    rowEls,
    menuContainers,
    lastDropIntent,
    refreshFavorites,
    refreshRootFolders,
    broadcastFavoritesChanged,
    setupGhostForRow,
    updateGhostPosition,
    updateInsertBar,
    handleDragHover,
    teardownDragVisuals,
    clearHoverTimer,
  } = opts

  // Driver and visuals
  let driver: SortableDriver | null = null
  let visuals: SortableVisuals | null = null
  let activeContainer: HTMLElement | null = null
  let activeLayout: 'list' | 'toolbar' | null = null

  // Click swallow flag (prevents click-through after drag)
  let dragJustEnded = false

  // Simple state for template bindings
  const sortableState = ref<{ isDragging: boolean; draggingId: RootRowId | null }>({
    isDragging: false,
    draggingId: null,
  })

  /**
   * Set a row ref for hit-testing
   */
  function setRowRef(row: RootRow, el: HTMLElement | null) {
    const id = rowId(row)
    if (el) {
      rowEls.set(id, el)
    } else {
      rowEls.delete(id)
    }
  }

  /**
   * Tear down driver and visuals
   */
  function teardownSortable() {
    driver?.cancel()
    driver = null
    visuals?.detach()
    visuals = null
    activeContainer = null
    activeLayout = null
  }

  /**
   * Ensure sortable driver is initialized and up-to-date
   */
  function ensureSortable() {
    const containerEl = layout() === 'list' ? listEl.value : toolbarEl.value
    if (!containerEl) {
      teardownSortable()
      return
    }

    const layoutKey: 'list' | 'toolbar' =
      layout() === 'list' ? 'list' : 'toolbar'

    // If nothing important changed, keep existing driver
    if (driver && containerEl === activeContainer && layoutKey === activeLayout) {
      return
    }

    teardownSortable()

    activeContainer = containerEl
    activeLayout = layoutKey

    // --- MODEL ADAPTER ---
    const model: SortableModelAdapter = {
      snapshot() {
        const roots = baseRootRows()

        const rootNodes: SortableNodeRef[] = roots.map(row => ({
          id: rowId(row),
          parentId: null,
          sortMode: 'manual',
          isContainer: row.kind === 'folder',
        }))

        // Also include all rows from open menus as children of their folder
        const menuNodes: SortableNodeRef[] = []
        for (const menu of openMenus.value) {
          if (!menu.folderId) continue
          const parentId: RootRowId = `folder:${menu.folderId}`
          for (const r of menu.rows) {
            const id = menuRowId(r)
            if (!id) continue
            menuNodes.push({
              id,
              parentId,
              sortMode: 'manual',
              isContainer: r.type === 'folder',
            })
          }
        }

        return snapshotFromNodes([...rootNodes, ...menuNodes])
      },

      applyMove(move) {
        console.log('[DEBUG] model.applyMove called', {
          moveId: move.id,
          dragJustEnded,
          openMenusCount: openMenus.value.length,
          timestamp: performance.now()
        })

        const intent = lastDropIntent.value
        if (!intent || !intent.targetId) {
          console.warn('[favorites] applyMove without intent – ignoring')
          return
        }

        const movedRowId = String(move.id) as RootRowId
        const targetRowId = String(intent.targetId) as RootRowId
        const placement = (intent.placement as any) ?? 'after'

        const { kind: movedKind, key: movedKey } = parseRootRowId(movedRowId)
        const { kind: targetKind, key: targetKey } = parseRootRowId(targetRowId)

        // Set dragJustEnded IMMEDIATELY so backdrop clicks are swallowed
        dragJustEnded = true
        console.log('[DEBUG] Set dragJustEnded = true in applyMove')

        void applyFavoritesMove({
          movedKind,
          movedKey,
          targetKind,
          targetKey,
          placement,
        })
          .then(async () => {
            console.log('[DEBUG] applyFavoritesMove completed, calling refreshRootFolders')
            await refreshRootFolders()
            await refreshFavorites()
            broadcastFavoritesChanged('move')
            console.log('[DEBUG] Refresh complete, openMenusCount:', openMenus.value.length)
          })
          .catch(err => {
            console.error('[favorites] applyFavoritesMove failed', err)
          })
      },
    }

    // --- GEOMETRY ADAPTER ---
    const geom: SortableGeometryAdapter = {
      hitTest(evt: MoveEvent) {
        const container = activeContainer
        if (!container) return null

        const x = (evt as PointerEvent).clientX
        const y = (evt as PointerEvent).clientY

        const containerRect = container.getBoundingClientRect()

        // 1) First, try to hit any known row (roots or menu rows)
        for (const [id, el] of rowEls) {
          const rect = el.getBoundingClientRect()
          if (
            x >= rect.left && x <= rect.right &&
            y >= rect.top && y <= rect.bottom
          ) {
            const rel = layoutKey === 'list'
              ? (y - rect.top) / (rect.height || 1)
              : (x - rect.left) / (rect.width || 1)

            const relClamped = Math.min(Math.max(rel, 0), 1)
            return { id, relY: relClamped }
          }
        }

        // 2) If no row was hit, check if we're inside any open folder menu.
        //    This is how empty folders get an "inside" target.
        for (const [folderId, el] of menuContainers) {
          const rect = el.getBoundingClientRect()
          if (
            x >= rect.left && x <= rect.right &&
            y >= rect.top && y <= rect.bottom
          ) {
            const id: RootRowId = `folder:${folderId}`
            // relY doesn't really matter for "inside", middle is fine
            return { id, relY: 0.5 }
          }
        }

        // 3) Fallbacks for "after last root row"
        const roots = baseRootRows()
        if (!roots.length) {
          return null
        }
        const last = roots[roots.length - 1]
        const lastId = rowId(last)

        // 3a) Pointer is inside the toolbar/list container but not on a pill:
        //     treat this as "after last root item".
        if (
          x >= containerRect.left && x <= containerRect.right &&
          y >= containerRect.top && y <= containerRect.bottom
        ) {
          return { id: lastId, relY: 1 }
        }

        // 3b) Toolbar-only: pointer is in the vertical band of the row but
        //     *to the right* of the container → still "after last".
        if (layoutKey === 'toolbar') {
          const inVerticalBand =
            y >= containerRect.top && y <= containerRect.bottom

          if (inVerticalBand && x > containerRect.right) {
            return { id: lastId, relY: 1 }
          }
        }

        return null
      },
    }

    // --- VISUALS ADAPTER ---
    visuals = createSortableVisuals({
      listEl: containerEl,
      getRowEl: id => rowEls.get(String(id)) ?? null,
    })

    // --- DRIVER ---
    driver = createSortableDriver({
      model,
      geom,
      events: {
        onState(s) {
          visuals?.onState(s)
          sortableState.value.isDragging = !!s.draggingId
          sortableState.value.draggingId = (s.draggingId as RootRowId | null) ?? null

          if (!s.draggingId) {
            teardownDragVisuals()
            clearHoverTimer()
          }
        },

        onPreview(intent, { blocked }) {
          visuals?.onPreview(intent, blocked)
          updateInsertBar(intent, blocked)
          handleDragHover(intent)
        },

        async onDrop(move, blocked) {
          console.log('[DEBUG] onDrop called', {
            hasMove: !!move,
            blocked,
            dragJustEnded,
            openMenusCount: openMenus.value.length,
            timestamp: performance.now()
          })

          // Normal case: driver accepted the move and already called model.applyMove
          if (!blocked && move) {
            dragJustEnded = true
            console.log('[DEBUG] Set dragJustEnded = true in onDrop (normal path)')
            teardownDragVisuals()
            clearHoverTimer()
            return
          }

          // Fallback: driver blocked the move (likely because targetId isn't in the snapshot),
          // but we *do* have a meaningful drop intent we can apply at the tree level.
          const draggingId = sortableState.value.draggingId as RootRowId | null
          const intent = lastDropIntent.value

          if (
            blocked &&
            draggingId &&
            intent &&
            intent.targetId
          ) {
            const targetRowId = String(intent.targetId) as RootRowId

            // If the target is *also* a root row, let the block stand:
            // we don't want to double-apply or fight the driver.
            const isRootTarget = baseRootRows().some(r => rowId(r) === targetRowId)
            if (!isRootTarget) {
              // Set dragJustEnded IMMEDIATELY at the start of fallback path
              // This ensures backdrop clicks are swallowed BEFORE async work completes
              dragJustEnded = true
              console.log('[DEBUG] Set dragJustEnded = true in onDrop (fallback - EARLY)')

              console.log('[DEBUG] Entering fallback path in onDrop')
              const { kind: movedKind, key: movedKey } = parseRootRowId(draggingId)
              const { kind: targetKind, key: targetKey } = parseRootRowId(targetRowId)
              const placement = (intent.placement as any) ?? 'after'

              try {
                await applyFavoritesMove({
                  movedKind,
                  movedKey,
                  targetKind,
                  targetKey,
                  placement,
                })

                await refreshRootFolders()
                await refreshFavorites()
                broadcastFavoritesChanged('move')
              } catch (err) {
                console.error(
                  '[favorites] applyFavoritesMove (fallback from onDrop) failed',
                  err,
                )
              }
            }
          }

          teardownDragVisuals()
          clearHoverTimer()
        },
      },
    })

    visuals.attach()
  }

  /**
   * Start drag for a root row
   */
  function startRowDrag(row: RootRow, event: PointerEvent) {
    ensureSortable()
    if (!driver) return

    const id = rowId(row)

    // Create the ghost at the row's initial position
    setupGhostForRow(id, event)

    driver.startDrag(id, event)
    event.preventDefault()
  }

  /**
   * Start drag for a menu row
   */
  function startMenuRowDrag(row: MenuRow, event: PointerEvent) {
    ensureSortable()
    if (!driver) return

    const id = menuRowId(row)
    if (!id) return

    setupGhostForRow(id as RootRowId, event)
    driver.startDrag(id as RootRowId, event)
    event.preventDefault()
  }

  /**
   * Global pointer move handler
   */
  function handleGlobalPointerMove(ev: PointerEvent) {
    updateGhostPosition(ev)
    driver?.pointerMove(ev)
  }

  /**
   * Global pointer up handler
   */
  function handleGlobalPointerUp(ev: PointerEvent) {
    driver?.pointerUp(ev)
  }

  /**
   * Check if drag just ended (for click swallowing)
   */
  function isDragJustEnded(): boolean {
    return dragJustEnded
  }

  /**
   * Reset drag just ended flag
   */
  function resetDragJustEnded() {
    dragJustEnded = false
  }

  // Watch rootRows and re-initialize sortable when they change
  watch(
    () =>
      baseRootRows()
        .map(r =>
          r.kind === 'folder'
            ? `folder:${r.node.id}`
            : `item:${r.entry.path}`
        )
        .join('|'),
    () => ensureSortable()
  )

  // Lifecycle
  onMounted(async () => {
    // Ensure DOM refs exist before wiring sortable geometry/visuals
    await nextTick()
    ensureSortable()

    // Global pointer handlers (needed if driver relies on window-level move/up)
    window.addEventListener('pointermove', handleGlobalPointerMove as any, { passive: true })
    window.addEventListener('pointerup', handleGlobalPointerUp as any, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', handleGlobalPointerMove as any)
    window.removeEventListener('pointerup', handleGlobalPointerUp as any)

    teardownSortable()
  })

  return {
    // State
    sortableState,

    // Methods
    setRowRef,
    startRowDrag,
    startMenuRowDrag,
    ensureSortable,
    isDragJustEnded,
    resetDragJustEnded,
  }
}
