// /src/widgets/favorites/useFavoritesSortable.ts
import { ref, type Ref } from '/runtime/vue.js'
import { 
  useSortable,
  DropIntent,
  applyFavoritesMove
} from 'gexplorer/widgets'
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
    rootRows: Ref<RootRow[]>
    openMenus: Ref<OpenMenu[]>
    rowEls: Map<RootRowId, HTMLElement>
    menuContainers: Map<string, HTMLElement>
    refreshFavorites: () => Promise<void>
    refreshRootFolders: () => Promise<void>
    broadcastFavoritesChanged: (reason: 'move' | 'other') => void
    setupGhostForRow: (id: RootRowId, ev: { clientX: number; clientY: number }) => void
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
        rootRows,
        rowEls,
        menuContainers,
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

    // ── Shared drag state ─────────────────────────────────────────────────

    let dragJustEnded = false
    let currentDraggingId: RootRowId | null = null

    const sortableState = ref<{ isDragging: boolean; draggingId: RootRowId | null }>({
        isDragging: false,
        draggingId: null,
    })

    // ── Shared hit test helpers ───────────────────────────────────────────

    function hitTestMenuRow(clientX: number, clientY: number): RootRowId | null {
        for (const [id, el] of rowEls) {
            if (!id.startsWith('menu:')) continue
            const r = el.getBoundingClientRect()
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                return id
            }
        }
        return null
    }

    function hitTestMenuContainer(clientX: number, clientY: number): string | null {
        for (const [folderId, el] of menuContainers) {
            const r = el.getBoundingClientRect()
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                return folderId
            }
        }
        return null
    }

    // Hit tests everything — root rows, menu rows, and folder containers.
    // Used by the menu row raw pointer loop.
    function resolveIntent(clientX: number, clientY: number): DropIntent | null {
        // Root rows
        for (const [id, el] of rowEls) {
            if (id.startsWith('menu:')) continue
            const r = el.getBoundingClientRect()
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                const rel = (clientY - r.top) / (r.height || 1)
                if (id.startsWith('folder:')) {
                    if (rel < 0.3) return { targetId: id, placement: 'before' }
                    if (rel > 0.7) return { targetId: id, placement: 'after' }
                    return { targetId: id, placement: 'inside' }
                }
                return { targetId: id, placement: rel < 0.5 ? 'before' : 'after' }
            }
        }
        // Menu rows
        const menuRow = hitTestMenuRow(clientX, clientY)
        if (menuRow) {
            const el = rowEls.get(menuRow)!
            const r = el.getBoundingClientRect()
            const rel = (clientY - r.top) / (r.height || 1)
            return { targetId: menuRow, placement: rel < 0.5 ? 'before' : 'after' }
        }
        // Empty folder containers
        const folderId = hitTestMenuContainer(clientX, clientY)
        if (folderId) return { targetId: `folder:${folderId}` as RootRowId, placement: 'inside' }

        return null
    }

    // ── Shared apply move ─────────────────────────────────────────────────

    async function applyMove(
        movedRowId: RootRowId,
        targetRowId: RootRowId,
        placement: 'before' | 'after' | 'inside'
    ) {
        const { kind: movedKind, key: movedKey } = parseRootRowId(movedRowId)
        const { kind: targetKind, key: targetKey } = parseRootRowId(targetRowId)
        dragJustEnded = true
        try {
            await applyFavoritesMove({ movedKind, movedKey, targetKind, targetKey, placement })
            await refreshRootFolders()
            await refreshFavorites()
            broadcastFavoritesChanged('move')
        } catch (err) {
            console.error('[favorites] applyFavoritesMove failed', err)
        }
    }

    // ── Root row sortable (useSortable) ───────────────────────────────────

    const { displayList: displayRootRows, isDragging, draggingId, startDrag } = useSortable(rootRows, {
        identity: row => rowId(row),
        orientation: () => layout() === 'list' ? 'vertical' : 'horizontal',
        dragThresholdPx: 4,
        scrollContainer: () => layout() === 'list' ? listEl.value : toolbarEl.value,
        containerClassOnDrag: 'gex-fav-dragging',
        rowSelector: '[data-fav-row-id]',
        rowIdAttr: 'data-fav-row-id',
        autoScroll: { marginPx: 40, maxSpeedPxPerSec: 600 },
        isContainer: row => row.kind === 'folder',

        onDragStart(row, startX, startY) {
            const id = rowId(row)
            currentDraggingId = id
            sortableState.value.isDragging = true
            sortableState.value.draggingId = id
            setupGhostForRow(id, { clientX: startX, clientY: startY })
        },

        onPreview(intent, blocked, clientX, clientY) {
            updateGhostPosition({ clientX, clientY } as PointerEvent)
            let effectiveIntent = intent
            if (!intent || blocked) {
                const menuRow = hitTestMenuRow(clientX, clientY)
                if (menuRow) {
                    const el = rowEls.get(menuRow)
                    if (el) {
                        const r = el.getBoundingClientRect()
                        const rel = (clientY - r.top) / (r.height || 1)
                        effectiveIntent = { targetId: menuRow, placement: rel < 0.5 ? 'before' : 'after' }
                    }
                } else {
                    const folderId = hitTestMenuContainer(clientX, clientY)
                    if (folderId) {
                        effectiveIntent = { targetId: `folder:${folderId}` as RootRowId, placement: 'inside' }
                    }
                }
            }
            updateInsertBar(effectiveIntent, blocked)
            handleDragHover(effectiveIntent)
        },

        onCommit(ordered, intent) {
            const dragging = currentDraggingId
            currentDraggingId = null
            if (!dragging) return
            teardownDragVisuals()
            clearHoverTimer()
            sortableState.value.isDragging = false
            sortableState.value.draggingId = null
            void applyMove(dragging, String(intent.targetId) as RootRowId, intent.placement as any)
        },

        onBlocked(row, intent, clientX, clientY) {
            const dragging = currentDraggingId ?? rowId(row)
            currentDraggingId = null
            teardownDragVisuals()
            clearHoverTimer()
            sortableState.value.isDragging = false
            sortableState.value.draggingId = null

            if (intent && (intent.placement === 'inside' || intent.placement === 'before' || intent.placement === 'after')) {
                void applyMove(dragging, String(intent.targetId) as RootRowId, intent.placement)
                return
            }
            const menuRow = hitTestMenuRow(clientX, clientY)
            if (menuRow) {
                const el = rowEls.get(menuRow)
                const r = el?.getBoundingClientRect()
                const placement = r ? ((clientY - r.top) / (r.height || 1) < 0.5 ? 'before' : 'after') : 'after'
                void applyMove(dragging, menuRow, placement)
                return
            }
            const folderId = hitTestMenuContainer(clientX, clientY)
            if (folderId) {
                void applyMove(dragging, `folder:${folderId}` as RootRowId, 'inside')
                return
            }
            dragJustEnded = true
        },
    })

    // ── Menu row raw pointer loop ─────────────────────────────────────────
    // Menu rows are transient (open/close with folders) so they can't be
    // managed by a sortable instance. A raw pointer loop hit-tests everything
    // — root rows, sibling menu rows, folder containers — giving full freedom
    // to reorder within a submenu, move items between submenus, or drag back
    // to root level.

    const MENU_DRAG_THRESHOLD = 4

    let menuDragId: RootRowId | null = null
    let menuDragStartX = 0
    let menuDragStartY = 0
    let menuDragActive = false

    function startMenuRowDrag(row: MenuRow, folderId: string, event: PointerEvent) {
        const id = menuRowId(row) as RootRowId | null
        if (!id) return

        menuDragId = id
        menuDragStartX = event.clientX
        menuDragStartY = event.clientY
        menuDragActive = false

        event.preventDefault()
        document.addEventListener('pointermove', onMenuDragMove, true)
        document.addEventListener('pointerup', onMenuDragUp, true)
        document.addEventListener('pointercancel', onMenuDragCancel, true)
    }

    function onMenuDragMove(ev: PointerEvent) {
        if (!menuDragId) return

        if (!menuDragActive) {
            const dx = ev.clientX - menuDragStartX
            const dy = ev.clientY - menuDragStartY
            if (dx * dx + dy * dy < MENU_DRAG_THRESHOLD * MENU_DRAG_THRESHOLD) return
            // Threshold crossed — start visual drag
            menuDragActive = true
            currentDraggingId = menuDragId
            sortableState.value.isDragging = true
            sortableState.value.draggingId = menuDragId
            setupGhostForRow(menuDragId, { clientX: menuDragStartX, clientY: menuDragStartY })
        }

        updateGhostPosition(ev)
        const intent = resolveIntent(ev.clientX, ev.clientY)
        updateInsertBar(intent, false)
        handleDragHover(intent)
    }

    function onMenuDragUp(ev: PointerEvent) {
        cleanupMenuDragListeners()

        const dragging = menuDragId
        const wasActive = menuDragActive
        menuDragId = null
        menuDragActive = false
        currentDraggingId = null
        sortableState.value.isDragging = false
        sortableState.value.draggingId = null
        teardownDragVisuals()
        clearHoverTimer()

        if (!dragging || !wasActive) { dragJustEnded = wasActive; return }

        const intent = resolveIntent(ev.clientX, ev.clientY)
        if (!intent) { dragJustEnded = true; return }

        void applyMove(dragging, String(intent.targetId) as RootRowId, intent.placement as any)
    }

    function onMenuDragCancel() {
        cleanupMenuDragListeners()
        menuDragId = null
        menuDragActive = false
        currentDraggingId = null
        sortableState.value.isDragging = false
        sortableState.value.draggingId = null
        teardownDragVisuals()
        clearHoverTimer()
    }

    function cleanupMenuDragListeners() {
        document.removeEventListener('pointermove', onMenuDragMove, true)
        document.removeEventListener('pointerup', onMenuDragUp, true)
        document.removeEventListener('pointercancel', onMenuDragCancel, true)
    }

    // ── Row ref management ────────────────────────────────────────────────

    function setRowRef(row: RootRow, el: HTMLElement | null) {
        const id = rowId(row)
        if (el) rowEls.set(id, el)
        else rowEls.delete(id)
    }

    function setMenuRowRef(row: MenuRow, el: HTMLElement | null) {
        const id = menuRowId(row)
        if (!id) return
        if (el) rowEls.set(id as RootRowId, el)
        else rowEls.delete(id as RootRowId)
    }

    // ── Root row drag initiation ──────────────────────────────────────────

    function startRowDrag(row: RootRow, event: PointerEvent) {
        const idx = rootRows.value.indexOf(row)
        if (idx < 0) return
        event.preventDefault()
        startDrag(idx, event)
    }

    // ── Click swallow ─────────────────────────────────────────────────────

    function isDragJustEnded(): boolean { return dragJustEnded }
    function resetDragJustEnded() { dragJustEnded = false }

    return {
        displayRootRows,
        isDragging,
        draggingId,
        sortableState,
        setRowRef,
        setMenuRowRef,
        startRowDrag,
        startMenuRowDrag,
        isDragJustEnded,
        resetDragJustEnded,
    }
}