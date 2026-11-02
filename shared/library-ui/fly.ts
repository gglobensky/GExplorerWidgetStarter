// shared/library-ui/fly.ts
//
// Taking a box off the shelf (3.2.0, 2026-11-02; Guillaume: "as if it was taken and put into focus"): a copy of the box
// slides from where it stands to where the open case will be, growing to its size (3.2.1: no lift, 0.5 s; Guillaume),
// and back when the case is put away. The copy is drawn in
// the widget's surface (`host`, the gem-library-surface element: a containing block, its styles and skin apply), over
// everything, and removed when it lands; the real elements are hidden meanwhile (`hide`) so nothing shows twice.
// Nothing happens with "reduce motion" (the promise resolves at once).

export const FLY_MS = 500

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The rect of <el> without the translation an opening animation may still give it (the store page's 8px slide). */
export function settledRect(el: HTMLElement, animated?: HTMLElement | null): DOMRect {
  const r = el.getBoundingClientRect()
  if (!animated) return r
  try {
    const m = new DOMMatrix(getComputedStyle(animated).transform)
    return new DOMRect(r.x - m.m41, r.y - m.m42, r.width, r.height)
  } catch {
    return r
  }
}

export type FlyOptions = {
  /** How long it takes (ms; default FLY_MS). */
  ms?: number
  /** After it lands, the copy stays this long over its place (ms): what replaces it can fade in under it. */
  keepMs?: number
}

/**
 * Flies a copy of <source> (cloned as it looks now) from <from> to <to> (viewport rects) inside <host>. <hide>: the
 * elements kept hidden until it lands. Resolves when it has landed (or at once: reduced motion, no animation support).
 */
export function flyCopy(host: HTMLElement, source: HTMLElement, from: DOMRect, to: DOMRect, hide: Array<HTMLElement | null | undefined> = [], options: FlyOptions = {}): Promise<void> {
  if (reduced() || typeof source.animate !== 'function' || !from.width || !to.width) return Promise.resolve()
  const base = host.getBoundingClientRect()
  const copy = source.cloneNode(true) as HTMLElement
  copy.setAttribute('aria-hidden', 'true')
  copy.removeAttribute('id')
  copy.classList.add('glu-flying')
  Object.assign(copy.style, {
    position: 'absolute', zIndex: '60', margin: '0', left: '0', top: '0', width: `${from.width}px`, height: `${from.height}px`,
    transform: 'none', pointerEvents: 'none', boxSizing: 'border-box',
  })
  const at = (r: DOMRect) => ({ left: `${r.left - base.left}px`, top: `${r.top - base.top}px`, width: `${r.width}px`, height: `${r.height}px` })
  const hidden = hide.filter((el): el is HTMLElement => !!el)
  const before = hidden.map(el => el.style.visibility)
  for (const el of hidden) el.style.visibility = 'hidden'
  host.appendChild(copy)
  // Slides and grows (or shrinks) from one place to the other, its shadow following its size
  const animation = copy.animate([
    { ...at(from), boxShadow: '0 6px 10px #0008' },
    { ...at(to), boxShadow: '0 28px 50px #000b' },
  ], { duration: options.ms ?? FLY_MS, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' })
  return new Promise(resolve => {
    const done = () => {
      hidden.forEach((el, i) => { el.style.visibility = before[i] })
      if (options.keepMs) setTimeout(() => copy.remove(), options.keepMs)
      else copy.remove()
      resolve()
    }
    animation.onfinish = done
    animation.oncancel = done
  })
}
