import { ref, computed, type Ref, type ComputedRef } from '/runtime/vue.js'
import { createMarqueeDriver, type GeometryAdapter, type ScrollerAdapter, type Rect } from '/src/widgets/selection/marquee-driver'

/**
 * useMarquee - Composable for marquee selection
 * 
 * Extracts marquee logic so it can be shared across all layout types.
 * Each layout provides its own scroll element reference and geometry adapter.
 */

export interface UseMarqueeOptions {
  /**
   * Ref to the scrolling element where marquee selection happens.
   * For Details: detailsScrollEl
   * For List/Grid: scrollEl (outer container)
   */
  scrollEl: Ref<HTMLElement | null>
  
  /**
   * Ref to the container element used for measuring item positions.
   * For Details: padEl (the inner container with rows)
   * For List/Grid: scrollEl (same as scroll element)
   */
  containerEl: Ref<HTMLElement | null>
  
  /**
   * Selection engine methods
   */
  engine: {
    replaceSelection: (ids: string[], opts: { reason: string }) => void
    getSelected: () => Set<string>
  }
  
  /**
   * Current layout type - affects coordinate calculations
   */
  layout: ComputedRef<string>
  
  /**
   * Selected items set
   */
  selected: Ref<Set<string>>
}

export interface UseMarqueeReturn {
  /**
   * Current marquee rectangle (with scroll offset applied)
   */
  marqueeRect: Ref<Rect | null>
  
  /**
   * Whether marquee is currently active
   */
  marqueeActive: ComputedRef<boolean>
  
  /**
   * Event handlers to attach to scroll element
   */
  handlers: {
    onPointerDown: (ev: PointerEvent) => void
    onPointerMove: (ev: PointerEvent) => void
    onPointerUp: (ev: PointerEvent) => void
    onClick: (ev: MouseEvent) => void
    onScroll: () => void
  }
  
  /**
   * Internal state for troubleshooting
   */
  state: {
    lastClientX: number
    lastClientY: number
    squelchNextClick: boolean
  }
}

/**
 * Helper to package keyboard modifiers from events
 */
function modsFromEvent(e: PointerEvent | MouseEvent | KeyboardEvent) {
  return { 
    ctrl: e.ctrlKey || false, 
    meta: (e as any).metaKey || false, 
    shift: e.shiftKey || false, 
    alt: e.altKey || false 
  }
}

/**
 * Check if pointer is over scrollbar
 */
function isOnScrollbar(el: HTMLElement, ev: PointerEvent): boolean {
  const r = el.getBoundingClientRect()
  const scrollbarWidth = el.offsetWidth - el.clientWidth
  if (scrollbarWidth <= 0) return false
  
  // Check if click is in the right gutter (scrollbar area)
  const clickX = ev.clientX - r.left
  return clickX > el.clientWidth
}

/**
 * Check if pointer is inside scroll rect
 */
function isInsideScrollRect(scrollEl: HTMLElement | null, cx: number, cy: number): boolean {
  if (!scrollEl) return false
  const r = scrollEl.getBoundingClientRect()
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
}

/**
 * Check if pointer is over a selected row
 */
function isOverSelectedRow(selected: Set<string>, cx: number, cy: number): boolean {
  const el = document.elementFromPoint(cx, cy) as HTMLElement | null
  const row = el?.closest('.row[data-path]') as HTMLElement | null
  if (!row) return false
  const id = row.dataset.path!
  return selected.has(id)
}

export function useMarquee(options: UseMarqueeOptions): UseMarqueeReturn {
  const { scrollEl, containerEl, engine, layout, selected } = options
  
  // ---- State ----
  const marqueeRect = ref<Rect | null>(null)
  let squelchNextPlaneClick = false
  let lastScrollTopForDrag = 0
  let lastClientX = 0
  let lastClientY = 0
  
  const marqueeActive = computed(() => {
    const r = marqueeRect.value
    return !!r && (r.w > 0 || r.h > 0)
  })
  
  // ---- Geometry Adapter ----
  const geo: GeometryAdapter = {
    // Viewport rect in scroller-viewport space
    contentRect() {
      const sc = scrollEl.value!
      return { x: 0, y: 0, w: sc.clientWidth, h: sc.clientHeight }
    },
    
    // Item rects in the same scroller-viewport space
    itemRects() {
      const sc = scrollEl.value!
      const scR = sc.getBoundingClientRect()
      const root = containerEl.value ?? sc
      const rows = root.querySelectorAll<HTMLElement>('.row[data-path]')
      const arr: Array<{ id: string; rect: Rect }> = []
      
      rows.forEach(row => {
        const rr = row.getBoundingClientRect()
        arr.push({
          id: row.dataset.path!,
          rect: {
            x: rr.left - scR.left,
            y: rr.top - scR.top,
            w: rr.width,
            h: rr.height,
          },
        })
      })
      return arr
    },
    
    // Pointer in the same scroller-viewport space
    pointFromClient(clientX, clientY) {
      const sc = scrollEl.value!
      const scR = sc.getBoundingClientRect()
      return { x: clientX - scR.left, y: clientY - scR.top }
    },
  }
  
  // ---- Scroller Adapter ----
  const scroller: ScrollerAdapter = {
    scrollTop() { 
      return scrollEl.value!.scrollTop 
    },
    maxScrollTop() {
      const el = scrollEl.value!
      return Math.max(0, el.scrollHeight - el.clientHeight)
    },
    scrollBy(dy) {
      // Only allow when the pointer is truly outside the viewport
      const outside = !pointerInsideViewportFromClient(lastClientX, lastClientY)
      if (!outside) return
      scrollEl.value!.scrollTop += dy
    },
  }
  
  // Check if pointer is inside viewport (for autoscroll logic)
  function pointerInsideViewportFromClient(cx: number, cy: number) {
    const cr = geo.contentRect()
    const p = geo.pointFromClient(cx, cy)
    return p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h
  }
  
  // ---- Marquee Driver ----
  const driver = createMarqueeDriver(
    {
      enabled: true,
      startThresholdPx: 6,
      fps: 30,
      guardTopPx: 0,
      autoscroll: { 
        enabled: true, 
        baseSpeed: 2400, 
        speedMultiplier: 1.75, 
        maxDistancePx: 240 
      },
      combine: 'auto', // Shift→add, Ctrl/Cmd→toggle, else replace
      policy: /Mac/i.test(navigator.platform) ? 'mac' : 'windows',
    },
    geo,
    scroller,
    {
      replaceSelection: (...args) => engine.replaceSelection(...args as any),
      getSelected: () => engine.getSelected(),
    },
    {
      rectChanged: (r) => {
        if (r) {
          const st = scrollEl.value?.scrollTop ?? 0
          marqueeRect.value = { x: r.x, y: r.y + st, w: r.w, h: r.h }
          squelchNextPlaneClick = (r.w > 0 || r.h > 0)
        } else {
          marqueeRect.value = null
        }
      },
      log: (e) => console.debug('[marquee]', e),
    }
  )
  
  // ---- Event Handlers ----
  function onPointerDown(ev: PointerEvent) {
    if (ev.button !== 0) return
    
    const t = ev.target as HTMLElement | null
    const plane = scrollEl.value!
    
    // Don't start marquee if clicking on a row or draggable element
    if (t?.closest('.row[data-path], [draggable="true"]')) return
    
    // Don't start marquee if clicking on scrollbar
    if (isOnScrollbar(plane, ev)) return
    
    // Capture pointer for smooth tracking
    ;(ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId)
    
    lastClientX = ev.clientX
    lastClientY = ev.clientY
    lastScrollTopForDrag = scrollEl.value!.scrollTop
    
    driver.pointerDown(ev, modsFromEvent(ev))
    
    window.addEventListener('pointerup', onPointerUp, { once: true })
    ev.preventDefault()
  }
  
  function onPointerMove(ev: PointerEvent) {
    lastClientX = ev.clientX
    lastClientY = ev.clientY
    driver.pointerMove(ev)
  }
  
  function onPointerUp(ev: PointerEvent) {
    const wasMarquee = marqueeActive.value
    
    // Adjust for any scroll that happened during marquee
    if (wasMarquee) {
      const sc = scrollEl.value!
      const dy = sc.scrollTop - lastScrollTopForDrag
      if (dy) {
        driver.adjustForScroll(dy)
        lastScrollTopForDrag = sc.scrollTop
        driver.recomputeNow('plane:flush-before-up')
      }
    }
    
    driver.pointerUp(ev)
    window.removeEventListener('pointerup', onPointerUp)
    
    // Only treat as a "click" if no marquee was shown
    if (!wasMarquee) {
      const inside = isInsideScrollRect(scrollEl.value, ev.clientX, ev.clientY)
      const overSelected = isOverSelectedRow(selected.value, ev.clientX, ev.clientY)
      if (inside && !overSelected) {
        engine.replaceSelection([], { reason: 'plane:click-up-outside' })
      }
    }
  }
  
  function onClick(ev: MouseEvent) {
    if (squelchNextPlaneClick) return
    
    const t = ev.target as HTMLElement | null
    if (!t?.closest('.row[data-path]')) {
      engine.replaceSelection([], { reason: 'plane:clear' })
    }
  }
  
  function onScroll() {
    if (!marqueeActive.value) return
    
    const sc = scrollEl.value!
    const dy = sc.scrollTop - lastScrollTopForDrag
    if (dy) {
      driver.adjustForScroll(dy)
      lastScrollTopForDrag = sc.scrollTop
    }
  }
  
  // ---- Return ----
  return {
    marqueeRect,
    marqueeActive,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onClick,
      onScroll,
    },
    state: {
      get lastClientX() { return lastClientX },
      get lastClientY() { return lastClientY },
      get squelchNextClick() { return squelchNextPlaneClick },
    },
  }
}