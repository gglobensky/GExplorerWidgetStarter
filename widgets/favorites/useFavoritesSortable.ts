// /src/widgets/favorites/useFavoritesSortable.ts
//
// The bar's (and the list's) own drag: GEM Shell's sortable over the top-level rows.
// CHANGED 0.4.0 (2026-11-21, GEM Shell's menu API): the folder menus are sdk.ui().openMenu (useFolderMenus.ts). Their
// rows drag inside the menus by themselves (and out to the bar: barIntentAt here); a drag from the bar over an open
// menu asks the menu where it goes (menuIntentAt: the menu draws its marks and opens sub-folders as the pointer
// lingers). The raw pointer loop for menu rows and the hit tests of the menus' rows went with the old menus.
import { ref, inject, type Ref } from 'vue'
import {
  useSortable,
  DropIntent,
  type WidgetSdk
} from 'gexplorer/widgets'
import {
    rowId,
    parseRootRowId,
    type RootRow,
    type RootRowId,
} from './favorites.model'

export type UseFavoritesSortableOptions = {
    layout: () => 'list' | 'toolbar'
    listEl: Ref<HTMLElement | null>
    toolbarEl: Ref<HTMLElement | null>
    /** 0.3.3: the element that scrolls (the list's or the bar's scroll area); none: listEl / toolbarEl. */
    scrollEl?: () => HTMLElement | null
    rootRows: Ref<RootRow[]>
    rowEls: Map<RootRowId, HTMLElement>
    /** Reads the favorites again (and keeps open folder menus in step). */
    refresh: () => Promise<void>
    setupGhostForRow: (id: RootRowId, ev: { clientX: number; clientY: number }) => void
    updateGhostPosition: (ev: PointerEvent) => void
    updateInsertBar: (intent: DropIntent | null, blocked: boolean) => void
    handleDragHover: (intent: DropIntent | null) => void
    teardownDragVisuals: () => void
    clearHoverTimer: () => void
    /**
     * 0.4.0: the open folder menu at (x, y) for the row being dragged: null when not over it; { intent: null } when
     * over it where it can't go (useFolderMenus.ts menuIntentAt).
     */
    menuIntentAt: (x: number, y: number, draggedRowId: string) => { intent: DropIntent | null } | null
    /** 0.4.0: the drag ended: the menu's marks go. */
    menuDragEnd: () => void
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
        refresh,
        setupGhostForRow,
        updateGhostPosition,
        updateInsertBar,
        handleDragHover,
        teardownDragVisuals,
        clearHoverTimer,
        menuIntentAt,
        menuDragEnd,
    } = opts

    // ── Shared drag state ─────────────────────────────────────────────────

    let dragJustEnded = false
    let currentDraggingId: RootRowId | null = null
    /** 0.4.0: the last move was over the open menu (its intent, or null: refused there). */
    let overMenu: { intent: DropIntent | null } | null = null

    const sortableState = ref<{ isDragging: boolean; draggingId: RootRowId | null }>({
        isDragging: false,
        draggingId: null,
    })

    /**
     * Where a drop at (x, y) goes on the bar or the list: before / after a favorite along the bar's own axis (a folder's
     * middle: inside it); in the bar's empty space, next to the nearest favorite. null: not on the bar. 0.4.0: also a
     * menu row carried out of a folder menu (useFolderMenus.ts onDragOut).
     */
    function barIntentAt(clientX: number, clientY: number): DropIntent | null {
        const horizontal = layout() !== 'list'
        const bar = horizontal ? toolbarEl.value : listEl.value
        let nearest: { id: RootRowId; dist: number; after: boolean } | null = null
        for (const [id, el] of rowEls) {
            const r = el.getBoundingClientRect()
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                const rel = horizontal ? (clientX - r.left) / (r.width || 1) : (clientY - r.top) / (r.height || 1)
                if (id.startsWith('folder:')) {
                    if (rel < 0.3) return { targetId: id, placement: 'before' }
                    if (rel > 0.7) return { targetId: id, placement: 'after' }
                    return { targetId: id, placement: 'inside' }
                }
                return { targetId: id, placement: rel < 0.5 ? 'before' : 'after' }
            }
            if (bar?.contains(el)) {
                const mid = horizontal ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2
                const at = horizontal ? clientX : clientY
                const dist = Math.abs(at - mid)
                if (!nearest || dist < nearest.dist) nearest = { id, dist, after: at > mid }
            }
        }
        if (nearest && bar) {
            const b = bar.getBoundingClientRect()
            if (clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom) {
                return { targetId: nearest.id, placement: nearest.after ? 'after' : 'before' }
            }
        }
        return null
    }

    // ── Shared apply move ─────────────────────────────────────────────────

    async function applyMove(
        movedRowId: RootRowId,
        targetRowId: RootRowId,
        placement: 'before' | 'after' | 'inside'
    ) {
        if (movedRowId === targetRowId) return
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

    function endRootDrag() {
        currentDraggingId = null
        teardownDragVisuals()
        clearHoverTimer()
        menuDragEnd()
        sortableState.value.isDragging = false
        sortableState.value.draggingId = null
    }

    // ── Root row sortable (useSortable) ───────────────────────────────────

    const { displayList: displayRootRows, isDragging, draggingId, startDrag } = useSortable(rootRows, {
        identity: row => rowId(row),
        orientation: () => layout() === 'list' ? 'vertical' : 'horizontal',
        dragThresholdPx: 4,
        scrollContainer: () => opts.scrollEl?.() ?? (layout() === 'list' ? listEl.value : toolbarEl.value),
        containerClassOnDrag: 'gex-fav-dragging',
        rowSelector: '[data-fav-row-id]',
        rowIdAttr: 'data-fav-row-id',
        autoScroll: { marginPx: 40, maxSpeedPxPerSec: 600 },
        isContainer: row => row.kind === 'folder',

        onDragStart(row, startX, startY) {
            const id = rowId(row)
            currentDraggingId = id
            overMenu = null
            sortableState.value.isDragging = true
            sortableState.value.draggingId = id
            setupGhostForRow(id, { clientX: startX, clientY: startY })
        },

        onPreview(intent, blocked, clientX, clientY) {
            updateGhostPosition({ clientX, clientY } as PointerEvent)
            // 0.4.0: over the open menu, the menu decides (its marks; a sub-folder opens as the pointer lingers)
            overMenu = menuIntentAt(clientX, clientY, currentDraggingId ?? '')
            if (overMenu) {
                updateInsertBar(null, false)
                handleDragHover(null)
                return
            }
            updateInsertBar(intent, blocked)
            handleDragHover(intent)
        },

        onCommit(_ordered, intent) {
            const dragging = currentDraggingId
            const menu = overMenu
            overMenu = null
            endRootDrag()
            if (!dragging) return
            if (menu) {
                if (menu.intent) void applyMove(dragging, String(menu.intent.targetId) as RootRowId, menu.intent.placement)
                else dragJustEnded = true
                return
            }
            void applyMove(dragging, String(intent.targetId) as RootRowId, intent.placement)
        },

        onBlocked(row, intent, clientX, clientY) {
            const dragging = currentDraggingId ?? rowId(row)
            const menu = menuIntentAt(clientX, clientY, dragging) ?? overMenu
            overMenu = null
            endRootDrag()
            if (menu) {
                if (menu.intent) void applyMove(dragging, String(menu.intent.targetId) as RootRowId, menu.intent.placement)
                else dragJustEnded = true
                return
            }
            if (intent && (intent.placement === 'inside' || intent.placement === 'before' || intent.placement === 'after')) {
                void applyMove(dragging, String(intent.targetId) as RootRowId, intent.placement)
                return
            }
            dragJustEnded = true
        },
    })

    // ── Row ref management ────────────────────────────────────────────────

    function setRowRef(row: RootRow, el: HTMLElement | null) {
        const id = rowId(row)
        if (el) rowEls.set(id, el)
        else rowEls.delete(id)
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
        startRowDrag,
        applyMove,
        barIntentAt,
        isDragJustEnded,
        resetDragJustEnded,
    }
}
