// GEM YT 1.0, part 3 (2026-11-24): the encouragement plaque's tiers (plan round 3): the creators you encourage (ads
// allowed for them: GEM Shell's switch, never the widget's) give the plaque its finish.

export type Tier = { id: 'silver' | 'gold' | 'diamond' | 'ruby' | 'opal'; name: string; from: number }

export const TIERS: Tier[] = [
  { id: 'silver', name: 'Silver', from: 0 },
  { id: 'gold', name: 'Gold', from: 1 },
  { id: 'diamond', name: 'Diamond', from: 5 },
  { id: 'ruby', name: 'Ruby', from: 10 },
  { id: 'opal', name: 'Opal', from: 25 },
]

export function tierOf(encouraged: number): Tier {
  let t = TIERS[0]
  for (const x of TIERS) if (encouraged >= x.from) t = x
  return t
}

/** The next tier and how many more it takes (null: the last one). */
export function nextTier(encouraged: number): { tier: Tier; more: number } | null {
  const t = TIERS.find(x => x.from > encouraged)
  return t ? { tier: t, more: t.from - encouraged } : null
}
