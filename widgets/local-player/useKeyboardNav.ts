// useKeyboardNav.ts - Keyboard navigation for queue
import { onMounted, onBeforeUnmount, type Ref } from 'vue'
import type { Track } from './usePlayerState'

export function useKeyboardNav(
  queue: Ref<Track[]>,
  selectedIndex: Ref<number>,
  hasTracks: Ref<boolean>,
  play: (index?: number) => Promise<void>,
  /** removeSelected (the "remove-track" command): removes the selected track. */
  removeAt?: (index: number) => void | Promise<void>,
  /** The player's root element: its keys work only after a press in it (2026-10-24). */
  root?: Ref<HTMLElement | null>
) {
  // CHANGED (2026-10-24): the queue's keys (arrows, Enter, Escape) work while the player is the
  // last place the user pressed in, not everywhere: they listened on the whole document and took
  // ArrowUp / ArrowDown from every other widget and the shell. Delete moved to a command (entry.ts
  // commands: "remove-track", rebindable).
  let active = false
  function onDocumentPointerDown(e: PointerEvent) {
    active = !!root?.value && e.target instanceof Node && root.value.contains(e.target)
  }

  function onKeydown(e: KeyboardEvent) {
    // Ignore if typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    if (!active || e.defaultPrevented) return
    
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
    } else if (e.key === 'Escape' && selectedIndex.value >= 0) {
      // CHANGED (2026-10-23): only while a row is selected. This listens on the whole document:
      // taking every Escape kept the shell from using it (leaving the focused pane).
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
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
  })
  
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  })
  
  function selectRow(index: number) {
    selectedIndex.value = index
  }

  /** The selected track out of the queue; the next one takes the selection (again: removes it). */
  function removeSelected(): boolean {
    const i = selectedIndex.value
    if (i < 0 || !removeAt) return false
    void Promise.resolve(removeAt(i)).then(() => {
      selectedIndex.value = queue.value.length ? Math.min(i, queue.value.length - 1) : -1
    })
    return true
  }
  
  return {
    selectRow,
    removeSelected,
  }
}