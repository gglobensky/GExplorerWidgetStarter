// useKeyboardNav.ts - Keyboard navigation for queue
import { onMounted, onBeforeUnmount, type Ref } from '/runtime/vue.js '
import type { Track } from './usePlayerState'

export function useKeyboardNav(
  queue: Ref<Track[]>,
  selectedIndex: Ref<number>,
  hasTracks: Ref<boolean>,
  play: (index?: number) => Promise<void>,
  /** Delete: removes the selected track (only while a queue row is selected: a click outside the queue clears it). */
  removeAt?: (index: number) => void | Promise<void>
) {
  
  function onKeydown(e: KeyboardEvent) {
    // Ignore if typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    
    if (!hasTracks.value) return
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (selectedIndex.value < 0) {
        selectedIndex.value = 0
      } else {
        selectedIndex.value = Math.min(queue.value.length - 1, selectedIndex.value + 1)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (selectedIndex.value < 0) {
        selectedIndex.value = queue.value.length - 1
      } else {
        selectedIndex.value = Math.max(0, selectedIndex.value - 1)
      }
    } else if (e.key === 'Enter' && selectedIndex.value >= 0) {
      e.preventDefault()
      play(selectedIndex.value)
    } else if (e.key === 'Delete' && selectedIndex.value >= 0 && removeAt && !target.isContentEditable) {
      e.preventDefault()
      const i = selectedIndex.value
      void Promise.resolve(removeAt(i)).then(() => {
        // The next track takes the selection (Delete again removes it).
        selectedIndex.value = queue.value.length ? Math.min(i, queue.value.length - 1) : -1
      })
    } else if (e.key === 'Escape') {
      e.preventDefault()
      selectedIndex.value = -1
    }
  }
  
  function onDocumentClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.queue')) {
      selectedIndex.value = -1
    }
  }
  
  onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('click', onDocumentClick)
  })
  
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('click', onDocumentClick)
  })
  
  function selectRow(index: number) {
    selectedIndex.value = index
  }
  
  return {
    selectRow
  }
}