// /src/widgets/favorites/useDragVisuals.ts
import { ref, type Ref } from '/runtime/vue.js'
import type { DropIntent } from '/src/widgets/sortable/engine'
import type { RootRowId } from './favorites.model'
import type { FavoriteTreeNode } from '/src/widgets/contracts/favorites'

export type UseDragVisualsOptions = {
  activeContainer: () => HTMLElement | null
  activeLayout: () => 'list' | 'toolbar' | null
  rowEls: Map<RootRowId, HTMLElement>
  findFolderNodeById: (id: string | null) => FavoriteTreeNode | null
  openFolderDropdownFromDrag: (folder: FavoriteTreeNode, anchor: HTMLElement | null) => void
}

export function useDragVisuals(opts: UseDragVisualsOptions) {
  const {
    activeContainer,
    activeLayout,
    rowEls,
    findFolderNodeById,
    openFolderDropdownFromDrag,
  } = opts

  // Ghost element (follows cursor)
  let ghostEl: HTMLElement | null = null
  let dragOffsetX = 0
  let dragOffsetY = 0

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
    if (ghostEl && ghostEl.parentNode) {
      ghostEl.parentNode.removeChild(ghostEl)
    }
    ghostEl = null

    if (insertBarEl && insertBarEl.parentNode) {
      insertBarEl.parentNode.removeChild(insertBarEl)
    }
    insertBarEl = null
  }

  /**
   * Create a ghost element for a dragged row
   */
  function setupGhostForRow(id: RootRowId, ev: PointerEvent) {
    // Clean up any old ghost/bar just in case
    teardownDragVisuals()

    const row = rowEls.get(id)
    if (!row) return

    const rect = row.getBoundingClientRect()

    ghostEl = row.cloneNode(true) as HTMLElement
    ghostEl.style.position = 'fixed'
    ghostEl.style.left = '0'
    ghostEl.style.top = '0'
    ghostEl.style.width = `${rect.width}px`
    ghostEl.style.height = `${rect.height}px`
    ghostEl.style.pointerEvents = 'none'
    ghostEl.style.opacity = '0.85'
    ghostEl.style.zIndex = '9999'
    ghostEl.classList.add('gex-fav-ghost')

    document.body.appendChild(ghostEl)

    // pointer offset so the ghost doesn't "jump"
    dragOffsetX = ev.clientX - rect.left
    dragOffsetY = ev.clientY - rect.top

    // initial position
    const x = ev.clientX - dragOffsetX
    const y = ev.clientY - dragOffsetY
    ghostEl.style.transform = `translate(${x}px, ${y}px)`
  }

  /**
   * Update ghost position as pointer moves
   */
  function updateGhostPosition(ev: PointerEvent) {
    if (!ghostEl) return
    const x = ev.clientX - dragOffsetX
    const y = ev.clientY - dragOffsetY
    ghostEl.style.transform = `translate(${x}px, ${y}px)`
  }

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
