// /src/widgets/favorites/useDragVisuals.ts
import { ref, type Ref } from 'vue'
import type { RootRowId } from './favorites.model'
import type { 
  DropIntent,
  FavoriteTreeFolder
} from 'gexplorer/widgets'

export type UseDragVisualsOptions = {
  /** Unused since 0.4.1 (the bar's drop is drawn by Widget.vue's classes); kept for its callers. */
  activeContainer?: () => HTMLElement | null
  activeLayout?: () => 'list' | 'toolbar' | null
  rowEls: Map<RootRowId, HTMLElement>
  findFolderNodeById: (id: string | null) => FavoriteTreeFolder | null
  openFolderDropdownFromDrag: (folder: FavoriteTreeFolder, anchor: HTMLElement | null) => void
  /**
   * 0.3.0 (GEM Shell E5c-1): the drag ghost is GEM Shell's (sdk.ui().dragGhost): drawn at the pointer anywhere in the
   * window while the user holds the button (a favorite dragged to a pane), which a widget's own element can't be any
   * more (its overlay layer is clipped to its box from E5c-3). null: no ghost (an older GEM Shell; the insert bar shows).
   */
  dragGhost: (opts: { label: string; icon?: string; offset?: { x?: number; y?: number } }) => { close(): void } | null
}

export function useDragVisuals(opts: UseDragVisualsOptions) {
  const {
    rowEls,
    findFolderNodeById,
    openFolderDropdownFromDrag,
    dragGhost,
  } = opts

  // The shell's ghost (follows the pointer by itself)
  let ghost: { close(): void } | null = null

  /**
   * 0.4.1: where a drop on the bar would go, drawn by Widget.vue's classes (a line before / after a pill, a folder lit
   * for inside, refused). It was an element made here (insertBarEl), which the component's scoped styles never reached:
   * a transparent strip, so the bar showed nothing while dragging.
   */
  const barDrop = ref<{ targetId: string; placement: 'before' | 'after' | 'inside'; blocked: boolean } | null>(null)

  // Hover-to-open state
  let hoverFolderId: RootRowId | null = null
  let hoverTimer: number | null = null
  const HOVER_OPEN_DELAY = 450 // ms

  // Last drop intent (used for applying moves)
  const lastDropIntent: Ref<DropIntent | null> = ref(null)

  /**
   * Clean up ghost and insert bar elements
   */
  function teardownDragVisuals() {
    ghost?.close()
    ghost = null

    barDrop.value = null
  }

  /**
   * The dragged row's ghost (0.3.0: GEM Shell's, ui.dragGhost): its label and icon, read from the row on screen.
   */
  function setupGhostForRow(id: RootRowId, _ev: { clientX: number; clientY: number }) {
    teardownDragVisuals()
    const row = rowEls.get(id)
    const text = row?.querySelector<HTMLElement>('.fav-label, .fav-menu-text')?.textContent?.trim() || row?.querySelector<HTMLElement>('[data-rename-row][title]')?.title?.split('\n')[0]?.trim() || ''
    const folder = id.startsWith('folder:')
    ghost = dragGhost({ label: text.slice(0, 80) || (folder ? 'Folder' : 'Favorite'), icon: folder ? '📁' : '★', offset: { x: 14, y: 10 } })
  }

  /** The shell's ghost follows the pointer by itself (kept for the sortable's calls). */
  function updateGhostPosition(_ev: PointerEvent) { /* nothing */ }

  /** Where a drop on the bar would go (null: nowhere on it); blocked: it can't go there. */
  function updateInsertBar(intent: DropIntent | null, blocked: boolean) {
    if (!intent || !rowEls.has(String(intent.targetId))) { barDrop.value = null; return }
    const placement = intent.placement === 'inside' || intent.placement === 'before' || intent.placement === 'after' ? intent.placement : 'after'
    const next = { targetId: String(intent.targetId), placement, blocked }
    const now = barDrop.value
    if (!now || now.targetId !== next.targetId || now.placement !== next.placement || now.blocked !== next.blocked) barDrop.value = next
  }

  /**
   * Clear hover timer and state
   */
  function clearHoverTimer() {
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer)
      hoverTimer = null
    }
    hoverFolderId = null
  }

  /**
   * Handle hover-to-open folder logic during drag
   */
  function handleDragHover(intent: DropIntent | null) {
    lastDropIntent.value = intent ?? null

    if (!intent || !intent.targetId || intent.placement !== 'inside') {
      clearHoverTimer()
      return
    }

    const id = String(intent.targetId) as RootRowId
    if (!id.startsWith('folder:')) {
      clearHoverTimer()
      return
    }

    // If we're still on the same folder, do nothing – timer already running or menu open
    if (hoverFolderId === id) return

    // Clear old timer FIRST, then set the new hovered id
    clearHoverTimer()
    hoverFolderId = id

    hoverTimer = window.setTimeout(() => {
      const rowEl = rowEls.get(id) ?? null
      const folderId = id.slice('folder:'.length)
      const folderNode = findFolderNodeById(folderId)
      if (!rowEl || !folderNode) return

      openFolderDropdownFromDrag(folderNode, rowEl)
    }, HOVER_OPEN_DELAY)
  }

  return {
    // State
    lastDropIntent,
    barDrop,

    // Ghost methods
    setupGhostForRow,
    updateGhostPosition,
    teardownDragVisuals,

    // Insert bar methods
    updateInsertBar,

    // Hover-to-open methods
    handleDragHover,
    clearHoverTimer,
  }
}
