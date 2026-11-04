// /src/widgets/favorites/useDragVisuals.ts
import { ref, type Ref } from 'vue'
import type { RootRowId } from './favorites.model'
import type { 
  DropIntent,
  FavoriteTreeFolder
} from 'gexplorer/widgets'

export type UseDragVisualsOptions = {
  activeContainer: () => HTMLElement | null
  activeLayout: () => 'list' | 'toolbar' | null
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
    activeContainer,
    activeLayout,
    rowEls,
    findFolderNodeById,
    openFolderDropdownFromDrag,
    dragGhost,
  } = opts

  // The shell's ghost (follows the pointer by itself)
  let ghost: { close(): void } | null = null

  // Insert bar (shows drop location)
  let insertBarEl: HTMLElement | null = null

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

    if (insertBarEl && insertBarEl.parentNode) {
      insertBarEl.parentNode.removeChild(insertBarEl)
    }
    insertBarEl = null
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

  /**
   * Ensure insert bar element exists in container
   */
  function ensureInsertBar(container: HTMLElement) {
    if (insertBarEl) return
    insertBarEl = document.createElement('div')
    insertBarEl.className = 'gex-fav-insert-bar'
    insertBarEl.style.position = 'absolute'
    insertBarEl.style.pointerEvents = 'none'
    insertBarEl.style.zIndex = '9998'
    container.appendChild(insertBarEl)
  }

  /**
   * Update insert bar position based on drop intent
   */
  function updateInsertBar(
    intent: DropIntent | null,
    blocked: boolean
  ) {
    const container = activeContainer()
    if (!container) return

    if (!intent) {
      if (insertBarEl) insertBarEl.style.display = 'none'
      return
    }

    const targetEl = rowEls.get(String(intent.targetId))
    if (!targetEl) {
      if (insertBarEl) insertBarEl.style.display = 'none'
      return
    }

    ensureInsertBar(container)
    if (!insertBarEl) return

    // For flat root mode, treat 'inside' as 'after'
    let placement = intent.placement
    if (placement === 'inside') placement = 'after'

    const containerRect = container.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()

    insertBarEl.style.display = 'block'
    insertBarEl.classList.toggle('gex-fav-insert-bar-blocked', blocked)

    const layout = activeLayout()
    if (layout === 'list') {
      // Horizontal bar spanning the list width
      const y =
        placement === 'before'
          ? targetRect.top - containerRect.top
          : targetRect.bottom - containerRect.top

      insertBarEl.style.left = '0px'
      insertBarEl.style.width = `${containerRect.width}px`
      insertBarEl.style.top = `${y - 1}px`
      insertBarEl.style.height = '2px'
    } else {
      // Toolbar → vertical bar
      const x =
        placement === 'before'
          ? targetRect.left - containerRect.left
          : targetRect.right - containerRect.left

      insertBarEl.style.top = '0px'
      insertBarEl.style.height = `${containerRect.height}px`
      insertBarEl.style.left = `${x - 1}px`
      insertBarEl.style.width = '2px'
    }
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
