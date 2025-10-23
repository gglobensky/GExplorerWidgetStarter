// useDnD.ts - Drag & drop for queue reordering
import { ref, watch, computed, nextTick, type Ref } from 'vue'
import { createDnD, type DnDHandle } from 'gexplorer/widgets'
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
  let dnd: DnDHandle<Track> | null = null
  const dndVersion = ref(0)
  let wasDragging = false
  
  const dndState = computed(() =>
    (void dndVersion.value, dnd?.getState() ?? { isDragging: false, draggingId: null, hoverIdx: null })
  )
  
  const displayQueue = computed<Track[]>(() =>
    (void dndVersion.value, dnd?.getDisplayList() ?? [])
  )
  
  function onDnDUpdate() {
    dndVersion.value++
    if (!dnd) return
    
    const { isDragging } = dnd.getState()
    
    if (wasDragging && !isDragging) {
      const committed = dnd.getOrderedList()
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
  
  function ensureDnD() {
    if (!dnd && queue.value.length > 0) {
        dnd = createDnD(queue.value, {
            identity: t => t.id,
            orientation: 'vertical',
            dragThresholdPx: 4,
            onUpdate: onDnDUpdate,
            scrollContainer: getQueueEl,
            containerClassOnDrag: 'gex-dragging',
            rowSelector: '.row.item',
            autoScroll: { marginPx: 56, maxSpeedPxPerSec: 900 },
            globalCursor: 'grabbing'
        })
    } else {
      dnd?.setOrderedList(queue.value)
    }
  }
  
    function startRowDrag(iDisplay: number, event: MouseEvent) {
    const target = event.target as HTMLElement
    if (target.closest('.icon-btn')) return
    event.preventDefault()
    
    console.log('[useDnD] startRowDrag called')
    console.log('[useDnD] - iDisplay:', iDisplay)
    console.log('[useDnD] - dnd exists:', !!dnd)
    console.log('[useDnD] - queue length:', queue.value.length)
    console.log('[useDnD] - dnd orderedList length:', dnd?.getOrderedList().length)
    
    // Ensure refs are registered
    registerAllRefs()
    
    console.log('[useDnD] - After registerAllRefs')
    console.log('[useDnD] - Starting drag...')
    
    dnd?.startDrag(iDisplay, event as PointerEvent)
    
    console.log('[useDnD] - Drag started, state:', dnd?.getState())
    }
  
  // Register refs when queue changes
const registerAllRefs = () => {
    const queueElValue = getQueueEl()  // ← Call the getter
    if (!showQueue.value || !queueElValue || !dnd) {
      console.log('[useDnD] registerAllRefs skipped:', { 
        showQueue: showQueue.value, 
        queueEl: !!queueElValue, 
        dnd: !!dnd 
      })
      return
    }
    
    const rows = queueElValue.querySelectorAll('.row.item')
    console.log('[useDnD] registerAllRefs found rows:', rows.length)
    
    rows.forEach((el, idx) => {
      const trackId = el.getAttribute('data-track-id')
      const track = queue.value.find(t => t.id === trackId)
      if (track) dnd.registerRef(track, el as HTMLElement)
    })
  }
  
  watch([() => queue.value.length, showQueue], async () => {
    if (!showQueue.value) return
    await nextTick()
    registerAllRefs()
  }, { flush: 'post' })
  
  watch(
    () => queue.value.map(t => t.id).join('|'),
    ensureDnD,
    { immediate: true }
  )
  
  return {
    dnd,
    dndState,
    displayQueue,
    ensureDnD,
    startRowDrag
  }
}