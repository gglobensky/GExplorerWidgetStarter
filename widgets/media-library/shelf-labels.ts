// widgets/media-library/shelf-labels.ts
//
// The Video Club's words on its shelves (0.17.0, library-ui 3.6.0 shelfLabels): under each case, TMDB's rating
// ("★ 7.8"), else its running time ("1 h 58"); a staff-pick card on the best rated of a department ("Staff pick! /
// Rated 8.1 on TMDB"). Pure (tested).
import { staffOpener } from '../../shared/library-ui/shelfLabels.ts'
import type { MovieItem } from './movie-types.ts'

const rated = (m: MovieItem) => (m.tmdbRating && m.tmdbRating > 0 ? m.tmdbRating : undefined)

/** The label under a case on the shelf, or undefined. */
export function movieTag(m: MovieItem): string | undefined {
  const r = rated(m)
  if (r !== undefined) return `★ ${r.toFixed(1)}`
  const min = Math.round(m.runtimeMinutes || 0)
  if (min <= 0) return undefined
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/** How a movie ranks for a staff pick (out of 100). */
export const moviePickScore = (m: MovieItem) => { const r = rated(m); return r === undefined ? undefined : r * 10 }

/** A staff-pick card's words. */
export function moviePickNote(m: MovieItem): string {
  const r = rated(m)
  return `${staffOpener(m.id)}\n${r !== undefined ? `Rated ${r.toFixed(1)} on TMDB` : 'Worth a watch'}`
}
