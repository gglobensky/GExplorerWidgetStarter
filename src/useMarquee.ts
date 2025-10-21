// useMarquee.ts - Marquee scroll logic for current track title
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'

export function useMarquee(
  currentTitle: Ref<string>,
  layoutClass: Ref<string>,
  resizePhase: Ref<string | undefined>,
  config?: Ref<Record<string, any> | undefined>
) {
  const marqueeBox = ref<HTMLElement | null>(null)
  const marqueeCopy = ref<HTMLElement | null>(null)
  const marqueeOn = ref(false)
  
  const prefersReduced = ref(false)
  const respectReduced = computed(() => config?.value?.respectReducedMotion ?? false)
  const marqueeDir = computed(() => config?.value?.marqueeDirection ?? 'right')
  const marqueeSpeed = computed(() => Number(config?.value?.marqueeSpeed ?? 35))
  
  let marqueeRO: ResizeObserver | null = null
  let rafId = 0
  
  function rafBatchIfIdle(fn: () => void) {
    if (resizePhase.value === 'active') return
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      fn()
    })
  }
  
  function updateMarquee() {
    if (resizePhase.value === 'active') return
    
    const box = marqueeBox.value
    const copy = marqueeCopy.value
    if (!box || !copy) {
      marqueeOn.value = false
      return
    }
    
    const dir = marqueeDir.value
    const boxW = Math.round(box.clientWidth)
    const copyW = Math.ceil(copy.scrollWidth)
    const needs = (!respectReduced.value || !prefersReduced.value) && copyW > boxW + 1
    
    // Set direction attribute for CSS keyframe selection
    if (box.getAttribute('data-dir') !== dir) {
      box.setAttribute('data-dir', dir)
    }
    
    marqueeOn.value = needs
    
    if (!needs) {
      // Stop animation
      const track = box.querySelector('.marquee-track') as HTMLElement | null
      if (track) {
        track.style.animation = 'none'
        track.style.transform = 'translate3d(0,0,0)'
        requestAnimationFrame(() => {
          if (track) track.style.animation = ''
        })
      }
      return
    }
    
    // Compute animation
    const GAP_PX = Math.round(Math.max(28, boxW))
    const travel = copyW + GAP_PX
    const speed = Math.max(10, Number(marqueeSpeed.value || 35))
    const durSec = travel / speed
    
    // Apply CSS vars
    box.style.setProperty('--gap', `${GAP_PX}px`)
    box.style.setProperty('--travel', `${travel}px`)
    box.style.setProperty('--marquee-dur', `${durSec.toFixed(3)}s`)
  }
  
  function observeIfPossible(el: HTMLElement | null) {
    if (el && marqueeRO) marqueeRO.observe(el)
  }
  
  function unobserveIfPossible(el: HTMLElement | null) {
    if (el && marqueeRO) marqueeRO.unobserve(el)
  }
  
  // Watch resize phase
  watch(() => resizePhase.value, phase => {
    if (phase === 'active') {
      marqueeOn.value = false
    } else {
      rafBatchIfIdle(updateMarquee)
    }
  })
  
  // Watch dependencies
  watch(
    [currentTitle, () => layoutClass.value],
    () => { rafBatchIfIdle(updateMarquee) },
    { flush: 'post', immediate: true }
  )
  
  // Watch refs
  watch([marqueeBox, marqueeCopy], ([box, copy], [prevBox, prevCopy]) => {
    if (marqueeRO) {
      unobserveIfPossible(prevBox)
      unobserveIfPossible(prevCopy)
      observeIfPossible(box)
      observeIfPossible(copy)
    }
    rafBatchIfIdle(updateMarquee)
  }, { flush: 'post' })
  
  // Watch marquee on/off state
  watch(marqueeOn, (running) => {
    const box = marqueeBox.value
    const copy = marqueeCopy.value
    if (!marqueeRO || !box || !copy) return
    
    if (resizePhase.value === 'active') {
      unobserveIfPossible(box)
      unobserveIfPossible(copy)
      return
    }
    
    if (running) {
      observeIfPossible(box)
      observeIfPossible(copy)
    } else {
      unobserveIfPossible(box)
      unobserveIfPossible(copy)
    }
  }, { flush: 'post', immediate: true })
  
  onMounted(() => {
    // Setup ResizeObserver
    marqueeRO = new ResizeObserver(() => {
      rafBatchIfIdle(updateMarquee)
    })
    
    // Check for reduced motion preference
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (mq) {
      prefersReduced.value = mq.matches
      const onChange = (e: MediaQueryListEvent) => {
        prefersReduced.value = e.matches
        rafBatchIfIdle(updateMarquee)
      }
      mq.addEventListener?.('change', onChange)
      
      onBeforeUnmount(() => mq.removeEventListener?.('change', onChange))
    }
    
    // Initial update
    nextTick(() => {
      rafBatchIfIdle(updateMarquee)
    })
  })
  
  onBeforeUnmount(() => {
    marqueeRO?.disconnect()
    if (rafId) cancelAnimationFrame(rafId)
  })
  
  // Template ref setters (rock-solid)
  function setMarqueeBox(el: Element | null) {
    marqueeBox.value = (el as HTMLElement) || null
  }
  
  function setMarqueeCopy(el: Element | null) {
    marqueeCopy.value = (el as HTMLElement) || null
  }
  
  return {
    marqueeBox,
    marqueeCopy,
    marqueeOn,
    marqueeDir,
    setMarqueeBox,
    setMarqueeCopy
  }
}