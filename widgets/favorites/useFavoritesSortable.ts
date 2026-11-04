// /src/widgets/favorites/useFavoritesSortable.ts
import { ref, inject, type Ref } from 'vue'
import {
  useSortable,
  DropIntent,
  type WidgetSdk
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
    /** Reads the favorites again (and keeps open folder menus in step). */
    refresh: () => Promise<void>
    setupGhostForRow: (id: RootRowId, ev: { clientX: number; clientY: number }) => void
    updateGhostPosition: (ev: PointerEvent) => void
    updateInsertBar: (intent: DropIntent | null, blocked: boolean) => void
    handleDragHover: (intent: DropIntent | null) => void
    teardownDragVisuals: () => void
    clearHoverTimer: () => void
    /** The drop intent the visuals keep (Widget.vue passes it; read through handleDragHover). */
    lastDropIntent?: Ref<DropIntent | null>
}

export function useFavoritesSortable(opts: UseFavoritesSortableOptions) {
  // The user's favorites come through the widget's SDK ('Favorites' cap in entry.ts).
  const sdk = inject<WidgetSdk>('widgetSdk')
  const need = <K extends keyof WidgetSdk>(k: K): NonNullable<WidgetSdk[K]> => {
    const f = sdk?.[k]
    if (!f) throw new Error(`the SDK has no ${String(k)}: declare the 'Favorites' capability in entry.ts`)
    return f as NonNullable<WidgetSdk[K]>
  }
    const {
        layout,
        listEl,
        toolbarEl,
        rootRows,
        rowEls,
        menuContainers,
        refresh,
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

    // CHANGED (0.3.1): a menu row is a row inside an open folder menu (its container): their ids are folder: / item: like
    // the bar's, so the old 'menu:' test never matched and a drag from the bar never saw the menus' rows.
    function inOpenMenu(el: HTMLElement): boolean {
        for (const c of menuContainers.values()) if (c.contains(el)) return true
        return false
    }

    function hitTestMenuRow(clientX: number, clientY: number): RootRowId | null {
        for (const [id, el] of rowEls) {
            if (!inOpenMenu(el)) continue
            const r = el.getBoundingClientRect()
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                return id
            }
        }
        return null
    }

    /** 0.3.1: where a drop on a menu row goes: a folder's middle third is inside it (and opens it after a moment). */
    function menuRowIntent(id: RootRowId, clientY: number): DropIntent | null {
        const el = rowEls.get(id)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const rel = (clientY - r.top) / (r.height || 1)
        if (id.startsWith('folder:')) {
            if (rel < 0.3) return { targetId: id, placement: 'before' }
            if (rel > 0.7) return { targetId: id, placement: 'after' }
            return { targetId: id, placement: 'inside' }
        }
        return { targetId: id, placement: rel < 0.5 ? 'before' : 'after' }
    }

    /** 0.3.1: the pointer is over an open menu: the drop goes there, whatever the bar's sortable projects. */
    function menuIntentAt(clientX: number, clientY: number): DropIntent | null {
        const menuRow = hitTestMenuRow(clientX, clientY)
        if (menuRow) return menuRowIntent(menuRow, clientY)
        const folderId = hitTestMenuContainer(clientX, clientY)
        return folderId ? { targetId: `folder:${folderId}` as RootRowId, placement: 'inside' } : null
    }
    let lastMenuIntent: DropIntent | null = null

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
        if (menuRow) return menuRowIntent(menuRow, clientY)
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
            await need('applyFavoritesMove')({ movedKind, movedKey, targetKind, targetKey, placement })
            await refresh()
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
            // CHANGED (0.3.1): over an open menu, its rows decide (a sub-folder opens when hovered), not the bar's projection
            lastMenuIntent = menuIntentAt(clientX, clientY)
            const effectiveIntent = lastMenuIntent ?? intent
            updateInsertBar(effectiveIntent, lastMenuIntent ? false : blocked)
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
            // 0.3.1: dropped over an open menu: there
            const target = lastMenuIntent ?? intent
            lastMenuIntent = null
            void applyMove(dragging, String(target.targetId) as RootRowId, target.placement)
        },

        onBlocked(row, intent, clientX, clientY) {
            const dragging = currentDraggingId ?? rowId(row)
            currentDraggingId = null
            teardownDragVisuals()
            clearHoverTimer()
            sortableState.value.isDragging = false
            sortableState.value.draggingId = null

            // 0.3.1: over an open menu first (its rows, a folder's middle: inside), then the bar's intent
            const inMenu = menuIntentAt(clientX, clientY)
            lastMenuIntent = null
            if (inMenu) { void applyMove(dragging, String(inMenu.targetId) as RootRowId, inMenu.placement); return }
            if (intent && (intent.placement === 'inside' || intent.placement === 'before' || intent.placement === 'after')) {
                void applyMove(dragging, String(intent.targetId) as RootRowId, intent.placement)
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