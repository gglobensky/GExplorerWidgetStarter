// widgets/game-library/online/steam-store.ts
//
// Steam's store pages, as data (0.4.0, Phase 3; no key): a game's description, genres, release date, Metacritic
// score, developers, publishers and screenshots (appdetails), and the Steam app id of a game found elsewhere
// (storesearch: many Epic, GOG and hand-added games are on Steam too, so they get the same details).
// Steam allows about 200 store requests in 5 minutes: one every 1.8 s, one at a time.
import { createPaced, type FetchPort, type PacedSession } from './paced.ts'
import { titleKey } from '../games.ts'

export const STEAM_STORE = 'https://store.steampowered.com/api'
export const STEAM_GAP_MS = 1800

export type SteamDetails = {
  appId: string
  name: string
  synopsis?: string
  genres: string[]
  released?: string
  year?: number
  metacritic?: number
  /** Its Metacritic page (reviews). */
  metacriticUrl?: string
  developers: string[]
  publishers: string[]
  screenshots: Array<{ thumb: string; full: string }>
  /** Art on Steam's servers, guessed from the header image's folder (may be missing for newer games). */
  art: { box?: string; hero?: string; logo?: string }
}

/** What Steam's players say (all reviews, all languages): "Very Positive", 9,812 of 10,320. */
export type SteamReviews = {
  /** Steam's words: "Overwhelmingly Positive", "Mixed"... */
  desc: string
  /** Steam's 1-9 (9: Overwhelmingly Positive; 0: too few reviews). */
  score: number
  positive: number
  total: number
}

export function steamStoreSession(port: FetchPort, sleep?: (ms: number) => Promise<void>): PacedSession {
  return createPaced(port, { service: 'Steam', minGapMs: STEAM_GAP_MS, concurrency: 1, sleep })
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** Steam's descriptions are HTML: the text, entities spelled out, one space between words. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, name: string) => {
      const known = ENTITIES[name.toLowerCase()]
      if (known) return known
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
      }
      return all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function strings(list: unknown, max = 6): string[] {
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.trim()).slice(0, max) : []
}

function https(url: unknown): string | undefined {
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : undefined
}

/** appdetails' answer for one app: its details, or undefined (not found, not a game, not in this region). */
export function parseAppDetails(appId: string, body: unknown): SteamDetails | undefined {
  const entry = (body as Record<string, any> | null)?.[appId]
  if (!entry?.success || !entry.data || typeof entry.data !== 'object') return undefined
  const d = entry.data
  if (d.type && d.type !== 'game') return undefined
  const released = typeof d.release_date?.date === 'string' && d.release_date.date.trim() ? d.release_date.date.trim() : undefined
  const year = Number(released?.match(/\b(19[7-9]\d|20\d\d)\b/)?.[1]) || undefined
  const synopsis = typeof d.short_description === 'string' ? plainText(d.short_description).slice(0, 900) : ''
  const screenshots = (Array.isArray(d.screenshots) ? d.screenshots : [])
    .map((s: any) => ({ thumb: https(s?.path_thumbnail), full: https(s?.path_full) }))
    .filter((s: { thumb?: string; full?: string }): s is { thumb: string; full: string } => !!s.thumb && !!s.full)
    .slice(0, 8)
  const header = https(d.header_image)
  // ".../steam/apps/620/header.jpg?t=..." → the same folder's library art
  const folder = header?.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/')
  const score = Number(d.metacritic?.score)
  return {
    appId,
    name: typeof d.name === 'string' ? d.name : '',
    synopsis: synopsis || undefined,
    genres: (Array.isArray(d.genres) ? d.genres : []).map((g: any) => g?.description).filter((g: unknown): g is string => typeof g === 'string' && !!g.trim()).slice(0, 6),
    released,
    year,
    metacritic: Number.isFinite(score) && score > 0 && score <= 100 ? score : undefined,
    metacriticUrl: /^https:\/\/(www\.)?metacritic\.com\//i.test(String(d.metacritic?.url ?? '')) ? String(d.metacritic.url) : undefined,
    developers: strings(d.developers),
    publishers: strings(d.publishers),
    screenshots,
    art: folder ? { box: `${folder}library_600x900_2x.jpg`, hero: `${folder}library_hero.jpg`, logo: `${folder}logo.png` } : {},
  }
}

/** storesearch's answer: the app whose title is the same game (titleKey), else undefined: never a guess. */
export function pickSearchResult(title: string, body: unknown): string | undefined {
  const items = Array.isArray((body as any)?.items) ? (body as any).items : []
  const key = titleKey(title)
  if (!key) return undefined
  const hit = items.find((i: any) => (i?.type === 'app' || i?.type === undefined) && typeof i?.name === 'string' && titleKey(i.name) === key)
  const id = hit?.id
  return typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)) ? String(id) : undefined
}

export async function steamDetails(session: PacedSession, appId: string): Promise<SteamDetails | undefined> {
  const body = await session.json(`${STEAM_STORE}/appdetails?${new URLSearchParams({ appids: appId, l: 'english' })}`)
  return parseAppDetails(appId, body)
}

/**
 * Steam's words for a share of positive reviews, as its store pages say them (all reviews, all languages):
 * 95%+ of 500+ Overwhelmingly Positive · 80%+ of 50+ Very Positive · 80%+ Positive · 70%+ Mostly Positive ·
 * 40%+ Mixed · 20%+ Mostly Negative · under 20%: Negative, Very Negative (50+), Overwhelmingly Negative (500+).
 * Under 10 reviews: "3 user reviews" (score 0).
 */
export function reviewWords(positive: number, total: number): { desc: string; score: number } {
  if (total < 10) return { desc: `${total} user review${total === 1 ? '' : 's'}`, score: 0 }
  const share = positive / total
  if (share >= 0.8) return total >= 500 && share >= 0.95 ? { desc: 'Overwhelmingly Positive', score: 9 } : total >= 50 ? { desc: 'Very Positive', score: 8 } : { desc: 'Positive', score: 7 }
  if (share >= 0.7) return { desc: 'Mostly Positive', score: 6 }
  if (share >= 0.4) return { desc: 'Mixed', score: 5 }
  if (share >= 0.2) return { desc: 'Mostly Negative', score: 4 }
  return total >= 500 ? { desc: 'Overwhelmingly Negative', score: 1 } : total >= 50 ? { desc: 'Very Negative', score: 2 } : { desc: 'Negative', score: 3 }
}

/**
 * appreviewhistogram's answer (0.6.2: what the store pages use; the older appreviews?json=1 now sends to Steam's
 * home page): its monthly totals since release, added up. Undefined: no reviews, not found.
 */
export function parseReviews(body: unknown): SteamReviews | undefined {
  const ok = (body as any)?.success === 1 || (body as any)?.success === true
  const rollups = ok ? (body as any).results?.rollups : undefined
  if (!Array.isArray(rollups)) return undefined
  let positive = 0
  let negative = 0
  for (const r of rollups) {
    const up = Number(r?.recommendations_up)
    const down = Number(r?.recommendations_down)
    if (Number.isFinite(up) && up > 0) positive += up
    if (Number.isFinite(down) && down > 0) negative += down
  }
  const total = positive + negative
  if (!total) return undefined
  return { ...reviewWords(positive, total), positive, total }
}

export async function steamReviews(session: PacedSession, appId: string): Promise<SteamReviews | undefined> {
  const query = new URLSearchParams({ l: 'english', review_score_preference: '0' })
  const body = await session.json(`https://store.steampowered.com/appreviewhistogram/${encodeURIComponent(appId)}?${query}`)
  const reviews = parseReviews(body)
  // What Steam said when it gave no totals (to see why a game shows none)
  if (!reviews) console.info(`[game-library] Steam gave no review totals for app ${appId}:`, body)
  return reviews
}

export async function findOnSteam(session: PacedSession, title: string): Promise<string | undefined> {
  const body = await session.json(`${STEAM_STORE}/storesearch/?${new URLSearchParams({ term: title, l: 'english', cc: 'US' })}`)
  return pickSearchResult(title, body)
}
