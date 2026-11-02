// widgets/game-library/sort.ts
//
// The top bar's ⇅ list (0.7.0, as the Video Club's): the order of the boxes on every rack and shelf. "Recently played"
// keeps its own order. A game without the value sorted on goes after the others, by title.
import type { GameItem } from './games.ts'

export type SortMode = 'title' | 'played' | 'year' | 'rating' | 'size'

export const SORT_MODES: ReadonlyArray<{ id: SortMode; label: string }> = [
  { id: 'title', label: 'Title A–Z' },
  { id: 'played', label: 'Last played' },
  { id: 'year', label: 'Newest first' },
  { id: 'rating', label: 'Best rated' },
  { id: 'size', label: 'Largest first' },
]

export function isSortMode(value: unknown): value is SortMode {
  return SORT_MODES.some(mode => mode.id === value)
}

const byTitle = (a: GameItem, b: GameItem) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })

/**
 * The games in that order. ratingOf: a game's score out of 100 (Metacritic, else the share of Steam's players who
 * liked it), undefined when unknown.
 */
export function sortGames(games: GameItem[], mode: SortMode, ratingOf: (game: GameItem) => number | undefined = () => undefined): GameItem[] {
  const value = (game: GameItem): number | undefined => {
    switch (mode) {
      case 'played': return game.lastPlayedAt || undefined
      case 'year': return game.year > 1800 ? game.year : undefined
      case 'rating': return ratingOf(game)
      case 'size': return Math.max(0, ...game.releases.map(r => r.sizeOnDisk ?? 0)) || undefined
      default: return undefined
    }
  }
  if (mode === 'title') return [...games].sort(byTitle)
  return [...games].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === undefined && vb === undefined) return byTitle(a, b)
    if (va === undefined) return 1
    if (vb === undefined) return -1
    return vb - va || byTitle(a, b)
  })
}
