// shared/library-ui/boxNav.ts
//
// Moving along the shelves with the arrow keys (3.4.0, 2026-11-02): the widgets declare four commands in entry.ts
// (`box-left`, `box-right`, `box-up`, `box-down`, keys Left / Right / Up / Down: GEM Shell's key mapper, so the user
// sees and changes them in Settings ▸ Keyboard shortcuts) and call moveBoxFocus() from their onCommand. The box the
// focus moves to is the one pulled out (a focused box lifts, outlined: library-ui's :focus-visible look); Enter or
// Space opens it (it's a button). In the showroom the racks are what the focus moves between.
//
// Spatial: the nearest box in that direction, by where they are on screen (rows that wrap, racks side by side,
// shelves of different lengths all work); scrolled into view (smoothly, unless reduced motion).

export type BoxDirection = 'left' | 'right' | 'up' | 'down'

/** What the arrows move between: boxes, and the showroom's racks. */
export const BOX_TARGETS = '.glu-case, .glu-floor-rack'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 3.4.1: a key held down repeats (~30 a second): each smooth scroll would restart the one before and the view crawl
 * behind the focus (Guillaume). A move this soon after the last one scrolls at once; a single press, smoothly.
 */
const QUICK_MS = 250
let lastMove = 0

/** The direction a command stands for ('box-left' → 'left'), or null. */
export function boxDirectionOf(commandId: string): BoxDirection | null {
  const m = /^box-(left|right|up|down)$/.exec(commandId)
  return m ? (m[1] as BoxDirection) : null
}

type Spot = { x: number; y: number }

/**
 * The index of the best candidate from <from> in <dir> among <spots> (centres), or -1. Pure (tested): the candidate
 * must lie that way (more than 4px), the score is the distance along that way plus twice the distance across it, so
 * the next box on the same shelf beats a nearer one on another.
 */
export function nearestSpot(from: Spot, spots: Spot[], dir: BoxDirection): number {
  let best = -1
  let bestScore = Infinity
  spots.forEach((s, i) => {
    const dx = s.x - from.x
    const dy = s.y - from.y
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (along <= 4) return
    const score = along + across * 2
    if (score < bestScore) { bestScore = score; best = i }
  })
  return best
}

const centre = (el: Element): Spot => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Moves the focus to the nearest box (or rack) in <dir> inside <container>. With none focused there: the first one
 * on screen. Returns whether the focus moved.
 */
export function moveBoxFocus(container: HTMLElement | null | undefined, dir: BoxDirection, selector = BOX_TARGETS): boolean {
  if (!container) return false
  const all = [...container.querySelectorAll<HTMLElement>(selector)].filter(el => {
    if (el.closest('[inert], [aria-hidden="true"]')) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
  if (!all.length) return false
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(selector) : null
  let next: HTMLElement | undefined
  if (!active || !container.contains(active)) {
    const view = container.getBoundingClientRect()
    next = all.find(el => { const r = el.getBoundingClientRect(); return r.bottom > view.top && r.top < view.bottom }) ?? all[0]
  } else {
    const others = all.filter(el => el !== active)
    const i = nearestSpot(centre(active), others.map(centre), dir)
    next = i >= 0 ? others[i] : undefined
  }
  if (!next) return false
  next.focus({ preventScroll: true })
  const now = Date.now()
  const quick = now - lastMove < QUICK_MS
  lastMove = now
  next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() || quick ? 'auto' : 'smooth' })
  return true
}
