// widgets/game-library/shelf-labels.ts
//
// The Game Shop's words on its shelves (0.22.0, library-ui 3.6.0 shelfLabels): under each box, how long it was played
// ("37 h played"), else what players and critics think ("94% liked", "Metacritic 88", "IGDB 86"); a staff-pick card
// on the best of a department ("Staff pick! / 94% of players loved it", "… / 140 h and counting"). Pure (tested).
import { staffOpener } from '../../shared/library-ui/shelfLabels.ts'
import type { GameItem } from './games.ts'
import type { GameDetails } from './online/details.ts'

const hours = (minutes: number) => {
  const h = minutes / 60
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1).replace(/\.0$/, '')
}
const liked = (d: GameDetails | undefined) => d?.reviews && d.reviews.total >= 50 ? Math.round((d.reviews.positive / d.reviews.total) * 100) : undefined

/** The label under a box on the shelf, or undefined. */
export function gameTag(game: GameItem, d: GameDetails | undefined): string | undefined {
  if ((game.playtimeMinutes ?? 0) >= 60) return `${hours(game.playtimeMinutes!)} h played`
  const pct = liked(d)
  if (pct !== undefined) return `${pct}% liked`
  if (d?.metacritic) return `Metacritic ${d.metacritic}`
  if (d?.igdbRating && (d.igdbRatingCount ?? 0) >= 10) return `IGDB ${Math.round(d.igdbRating)}`
  return undefined
}

/** How a game ranks for a staff pick (out of 100): players' share, else Metacritic, else IGDB with enough votes. */
export function pickScore(d: GameDetails | undefined): number | undefined {
  return liked(d) ?? d?.metacritic ?? ((d?.igdbRating && (d.igdbRatingCount ?? 0) >= 10) ? d.igdbRating : undefined)
}

/** A staff-pick card's words (first line, then why). */
export function pickNote(game: GameItem, d: GameDetails | undefined): string {
  const why = (game.playtimeMinutes ?? 0) >= 20 * 60 ? `${hours(game.playtimeMinutes!)} h and counting`
    : liked(d) !== undefined ? `${liked(d)}% of players loved it`
    : d?.metacritic ? `Metacritic ${d.metacritic}`
    : d?.igdbRating ? `Rated ${Math.round(d.igdbRating)} on IGDB`
    : 'Worth a try'
  return `${staffOpener(game.id)}\n${why}`
}
