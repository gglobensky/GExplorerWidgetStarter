// useDnD.ts - Drag & drop for queue reordering
import { computed, type Ref } from 'vue'
import { useSortable } from 'gexplorer/widgets'
import type { Track } from './usePlayerState'

export function useDnD(
    queue: Ref<Track[]>,
    currentIndex: Ref<number>,
    selectedIndex: Ref<number>,
    showQueue: Ref<boolean>,
    getQueueEl: () => HTMLElement | null,
    toPlaylistItems: () => any[],
    playlists: any,
    sel: any
) {
    const { displayList: displayQueue, isDragging, draggingId, startDrag: _startDrag } = useSortable(queue, {
        identity: t => t.id,
        orientation: 'vertical',
        dragThresholdPx: 4,
        scrollContainer: getQueueEl,
        containerClassOnDrag: 'gex-dragging',
        rowSelector: '.row.item',
        rowIdAttr: 'data-track-id',
        autoScroll: { marginPx: 56, maxSpeedPxPerSec: 900 },
        globalCursor: 'grabbing',
        onCommit: (ordered) => {
            // The selected track is an index: it follows its track (2026-10-23: the selection stayed at its index,
            // outlining whichever track moved into it). The playing one is kept by id (1.1.0): it follows by itself.
            const selectedId = queue.value[selectedIndex.value]?.id
            queue.value = ordered.slice()
            if (selectedId) {
                const newIdx = queue.value.findIndex(t => t.id === selectedId)
                if (newIdx >= 0) selectedIndex.value = newIdx
            }
            playlists.setItems(sel, toPlaylistItems(), { keepCurrent: true })
        },
    })

    // Compat shim — keeps Widget.vue template unchanged while we migrate
    const sortableState = computed(() => ({
        isDragging: isDragging.value,
        draggingId: draggingId.value,
        hoverIdx: null as number | null,
    }))

    function startRowDrag(iDisplay: number, event: MouseEvent) {
        if (!showQueue.value) return
        const target = event.target as HTMLElement
        if (target.closest('.icon-btn')) return
        event.preventDefault()
        _startDrag(iDisplay, event as PointerEvent)
    }

    return {
        displayQueue,
        isDragging,
        sortableState,
        startRowDrag,
        // sortable and ensureSortable intentionally gone —
        // useSortable handles lifecycle automatically.
    }
}