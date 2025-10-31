// useDnD.ts - Drag & drop for queue reordering
import { ref, watch, computed, nextTick, type Ref } from 'vue'
import { createSortable, type SortableHandle } from 'gexplorer/widgets'
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
  let sortable: SortableHandle<Track> | null = null
  const sortableVersion = ref(0)
  let wasDragging = false

  const sortableState = computed(() =>
    (void sortableVersion.value,
      sortable?.getState() ?? { isDragging: false, draggingId: null, hoverIdx: null })
  )

  const displayQueue = computed<Track[]>(() =>
    (void sortableVersion.value, sortable?.getDisplayList() ?? [])
  )

  function onSortableUpdate() {
    sortableVersion.value++
    if (!sortable) return

    const { isDragging } = sortable.getState()

    if (wasDragging && !isDragging) {
      const committed = sortable.getOrderedList()
      const same =
        committed.length === queue.value.length &&
        committed.every((t, i) => t.id === queue.value[i]?.id)

      if (!same) {
        const currentId = queue.value[currentIndex.value]?.id
        queue.value = committed.slice()

        if (currentId) {
          const newIdx = queue.value.findIndex(t => t.id === currentId)
          if (newIdx >= 0) currentIndex.value = newIdx
        }

        // Sync playlist order
        playlists.setItems(sel, toPlaylistItems(), { keepCurrent: true })
      }
    }

    wasDragging = isDragging
  }

  function ensureSortable() {
    if (!sortable && queue.value.length > 0) {
      sortable = createSortable(queue.value, {
        identity: t => t.id,
        orientation: 'vertical',
        dragThresholdPx: 4,
        onUpdate: onSortableUpdate,
        scrollContainer: getQueueEl,
        containerClassOnDrag: 'gex-dragging',
        rowSelector: '.row.item',
        autoScroll: { marginPx: 56, maxSpeedPxPerSec: 900 },
        globalCursor: 'grabbing'
      })
    } else {
      sortable?.setOrderedList(queue.value)
    }
  }

  function startRowDrag(iDisplay: number, event: MouseEvent) {
    const target = event.target as HTMLElement
    if (target.closest('.icon-btn')) return
    event.preventDefault()

    // Ensure refs are registered before starting the drag
    registerAllRefs()
    sortable?.startDrag(iDisplay, event as PointerEvent)
  }

  // Register refs when queue changes / becomes visible
  const registerAllRefs = () => {
    const queueElValue = getQueueEl()
    if (!showQueue.value || !queueElValue || !sortable) return

    const rows = queueElValue.querySelectorAll('.row.item')
    rows.forEach((el) => {
      const trackId = el.getAttribute('data-track-id')
      const track = queue.value.find(t => t.id === trackId)
      if (track) sortable.registerRef(track, el as HTMLElement)
    })
  }

  watch([() => queue.value.length, showQueue], async () => {
    if (!showQueue.value) return
    await nextTick()
    registerAllRefs()
  }, { flush: 'post' })

  watch(
    () => queue.value.map(t => t.id).join('|'),
    ensureSortable,
    { immediate: true }
  )

  return {
    sortable,
    sortableState,
    displayQueue,
    ensureSortable,
    startRowDrag
  }
}
