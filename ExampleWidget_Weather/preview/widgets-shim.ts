import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Isolated-preview stand-in for the host's public composable. Production keeps
// gexplorer/widgets external and receives the real implementation from GEM Shell.
export function useScrollHints(options: {
  scrollEl: { value: HTMLElement | null }
  axis?: 'x' | 'y'
  deps?: () => unknown
  eps?: number
  wheel?: 'off' | 'native' | 'transpose'
  pageRatio?: number
  minPageStep?: number
}) {
  const horizontal = options.axis === 'x'
  const hasOverflow = ref(false)
  const atStart = ref(true)
  const atEnd = ref(true)
  let element: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  let frame = 0

  function update() {
    if (!element) return
    const size = horizontal ? element.scrollWidth : element.scrollHeight
    const client = horizontal ? element.clientWidth : element.clientHeight
    const position = horizontal ? element.scrollLeft : element.scrollTop
    const epsilon = options.eps ?? 2
    hasOverflow.value = size - client > epsilon
    atStart.value = position <= epsilon
    atEnd.value = size - position - client <= epsilon
  }
  function scheduleUpdate() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }
  function onWheel(event: WheelEvent) {
    if (!element || options.wheel !== 'transpose' || !hasOverflow.value) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY
    if (!delta) return
    if (horizontal) element.scrollLeft += delta
    else element.scrollTop += delta
    event.preventDefault()
  }
  function attach(next: HTMLElement | null) {
    element?.removeEventListener('scroll', scheduleUpdate)
    element?.removeEventListener('wheel', onWheel)
    observer?.disconnect()
    element = next
    if (!element) return
    element.addEventListener('scroll', scheduleUpdate, { passive: true })
    if (options.wheel === 'transpose')
      element.addEventListener('wheel', onWheel, { passive: false })
    observer = new ResizeObserver(scheduleUpdate)
    observer.observe(element)
    scheduleUpdate()
  }
  function scrollByPage(direction: -1 | 1) {
    if (!element) return
    const client = horizontal ? element.clientWidth : element.clientHeight
    const amount = direction * Math.max(
      options.minPageStep ?? 80,
      Math.round(client * (options.pageRatio ?? 0.8)),
    )
    element.scrollBy(horizontal
      ? { left: amount, behavior: 'smooth' }
      : { top: amount, behavior: 'smooth' })
  }

  let stopElement: (() => void) | undefined
  let stopDeps: (() => void) | undefined
  onMounted(() => nextTick(() => {
    attach(options.scrollEl.value)
    stopElement = watch(() => options.scrollEl.value, attach, { flush: 'post' })
    if (options.deps)
      stopDeps = watch(options.deps, scheduleUpdate, { flush: 'post' })
  }))
  onBeforeUnmount(() => {
    stopElement?.()
    stopDeps?.()
    attach(null)
    if (frame) cancelAnimationFrame(frame)
  })

  return { hasOverflow, atStart, atEnd, scrollByPage, update, scheduleUpdate }
}
