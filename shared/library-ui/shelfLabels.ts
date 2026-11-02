// shared/library-ui/shelfLabels.ts
//
// What's written on the shelves of a department (3.6.0, 2026-11-02; the mockups' "label strips" and "staff pick"
// cards, Guillaume: "I like the label strips and the staff pick notes"):
//   - a tag under each box, on the shelf's front edge (LibraryFloor tagFor: the widget's words, "37 h played", "★ 7.8");
//   - a strip at the shelf's left end (rowStrip: "A – D" when sorted by title, the years when sorted by year);
//   - a handwritten card leaning on a few boxes (pickFor): the best ones of the department, one per dozen or so.
// Pure (tested: widgets/game-library/tests/shelf-labels.test.ts).

/** A title's letter on the strip: its first letter or digit ("#" for a digit), "The"/"A" left out. */
export function titleLetter(title: string): string {
  const t = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^(the|a|an|le|la|les|l')\s+/i, '').trim()
  const c = t.match(/[\p{L}\p{N}]/u)?.[0] ?? ''
  return /\p{N}/u.test(c) ? '#' : c.toUpperCase()
}

/** "A – D" (the first and last box's letters), "M" when they're the same; undefined for no boxes. */
export function titleRange(items: ReadonlyArray<{ title: string }>): string | undefined {
  if (!items.length) return undefined
  const a = titleLetter(items[0].title)
  const b = titleLetter(items[items.length - 1].title)
  if (!a && !b) return undefined
  return a === b || !b ? a : !a ? b : `${a} – ${b}`
}

/** "1998 – 2004" (the boxes' years, any order), "2021" for one year; undefined when none is known. */
export function yearRange(items: ReadonlyArray<{ year: number }>): string | undefined {
  const years = items.map(i => i.year).filter(y => y > 1800)
  if (!years.length) return undefined
  const lo = Math.min(...years)
  const hi = Math.max(...years)
  return lo === hi ? String(lo) : `${lo} – ${hi}`
}

/** A small, stable number from an id (picks and openers don't change from one look to the next). */
export function idHash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  return h
}

/**
 * The department's staff picks: the best scored (score ≥ min, out of 100), one for every <every> boxes (at least one
 * when any qualifies), never two side by side when it can be helped. Their ids.
 */
export function staffPicks<T extends { id: string }>(items: readonly T[], score: (item: T) => number | undefined, opts: { every?: number; min?: number } = {}): Set<string> {
  const every = opts.every ?? 12
  const min = opts.min ?? 80
  const want = Math.max(1, Math.round(items.length / every))
  const index = new Map(items.map((item, i) => [item.id, i]))
  const ranked = items
    .map(item => ({ item, s: score(item) }))
    .filter((x): x is { item: T; s: number } => x.s !== undefined && x.s >= min)
    .sort((a, b) => b.s - a.s || idHash(a.item.id) - idHash(b.item.id))
  const out = new Set<string>()
  const near = (id: string) => [...out].some(o => Math.abs(index.get(o)! - index.get(id)!) <= 1)
  for (const x of ranked) { if (out.size >= want) break; if (!near(x.item.id)) out.add(x.item.id) }
  for (const x of ranked) { if (out.size >= want) break; out.add(x.item.id) }
  return out
}

const OPENERS = ['Staff pick!', 'Our favourite!', "Don't miss it!", 'Trust us on this one', 'A must!']
/** The card's first line, chosen by the box (always the same for it). */
export const staffOpener = (id: string) => OPENERS[idHash(id) % OPENERS.length]
