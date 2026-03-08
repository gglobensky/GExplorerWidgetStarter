// useDnD.ts - Drag & drop for queue reordering
import { computed, type Ref } from '/runtime/vue.js'
import { useSortable } from 'gexplorer/widgets'
import type { Track } from './usePlayerState'

export function useDnD(
    queue: Ref<Track[]>,
    currentIndex: Ref<number>,
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
            const currentId = queue.value[currentIndex.value]?.id
            queue.value = ordered.slice()
            if (currentId) {
                const newIdx = queue.value.findIndex(t => t.id === currentId)
                if (newIdx >= 0) currentIndex.value = newIdx
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