// widgets/game-library/online/igdb.ts
//
// IGDB (0.11.0, step 4): Twitch's game database. Every platform (the SNES's too), store ids linked to games (so
// a Steam game is found by its app id, not its title), summaries, genres, release dates, ratings, covers,
// artworks and screenshots. It takes the user's own Twitch app (dev.twitch.tv ▸ Applications): its client id and
// secret are kept by GEM Shell as the widget's secret 'igdb' of kind client-credentials (part C2), traded at
// id.twitch.tv for tokens GEM Shell keeps. The widget names the parts in its headers and never sees either.
// Requests: POST https://api.igdb.com/v4/<endpoint> with an Apicalypse query as the body; 4 a second at most.
// Pictures: https://images.igdb.com/igdb/image/upload/t_<size>/<image_id>.jpg (no key).
import { createPaced, type FetchPort, type PacedSession } from './paced.ts'
import { titleKey } from '../games.ts'

export const IGDB_SECRET = 'igdb'
export const IGDB_HOSTS = ['api.igdb.com']
export const IGDB_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API = 'https://api.igdb.com/v4'
/** IGDB's platform id for PC (Microsoft Windows). */
export const IGDB_PC = 6

export type IgdbGame = {
  id: number
  name: string
  summary?: string
  genres?: string[]
  /** ms since 1970 */
  released?: number
  /** 0–100, with how many ratings (critics and players together). */
  rating?: number
  ratingCount?: number
  url?: string
  cover?: string
  artworks: string[]
  screenshots: string[]
  platforms: number[]
}

export function igdbSession(port: FetchPort, sleep?: (ms: number) => Promise<void>): PacedSession {
  return createPaced(port, {
    service: 'IGDB',
    minGapMs: 280,
    concurrency: 2,
    headers: {
      'Client-ID': { secret: IGDB_SECRET, part: 'clientId' },
      Authorization: { secret: IGDB_SECRET, part: 'token', format: 'Bearer {}' },
    },
    fatalStatuses: [401, 403],
    sleep,
  })
}

/** A picture's address: cover_big_2x (a box), 1080p (a banner), screenshot_med / screenshot_huge. */
export function igdbImage(imageId: string, size: 'cover_small' | 'cover_big' | 'cover_big_2x' | '1080p' | 'screenshot_med' | 'screenshot_huge' | 'logo_med' = 'cover_big_2x'): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${encodeURIComponent(imageId)}.jpg`
}

const GAME_FIELDS = 'fields name,summary,genres.name,first_release_date,total_rating,total_rating_count,url,cover.image_id,artworks.image_id,screenshots.image_id,platforms;'
/** A title in an Apicalypse string. */
const quoted = (s: string) => `"${s.replace(/\\/g, ' ').replace(/"/g, '\\"').slice(0, 200)}"`

const imageIds = (v: unknown): string[] => Array.isArray(v)
  ? v.map(x => (x && typeof x === 'object' ? (x as any).image_id : undefined)).filter((s): s is string => typeof s === 'string' && /^[\w-]{1,64}$/.test(s))
  : []

/** One game of IGDB's answer, checked. */
export function parseIgdbGame(raw: any): IgdbGame | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'number' || typeof raw.name !== 'string') return null
  const genres = Array.isArray(raw.genres) ? raw.genres.map((g: any) => g?.name).filter((s: unknown): s is string => typeof s === 'string' && !!s.trim()).slice(0, 6) : undefined
  const rating = typeof raw.total_rating === 'number' && Number.isFinite(raw.total_rating) ? Math.round(raw.total_rating) : undefined
  return {
    id: raw.id,
    name: raw.name.trim().slice(0, 200),
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim().slice(0, 900) : undefined,
    genres: genres?.length ? genres.map(simpleGenre) : undefined,
    released: typeof raw.first_release_date === 'number' && raw.first_release_date > 0 ? raw.first_release_date * 1000 : undefined,
    rating: rating && rating > 0 ? Math.min(100, rating) : undefined,
    ratingCount: typeof raw.total_rating_count === 'number' ? raw.total_rating_count : undefined,
    url: typeof raw.url === 'string' && /^https:\/\/www\.igdb\.com\//.test(raw.url) ? raw.url : undefined,
    cover: imageIds(raw.cover ? [raw.cover] : [])[0],
    artworks: imageIds(raw.artworks).slice(0, 4),
    screenshots: imageIds(raw.screenshots).slice(0, 8),
    platforms: Array.isArray(raw.platforms) ? raw.platforms.filter((p: unknown): p is number => typeof p === 'number') : [],
  }
}

/** IGDB's long genre names, the way the shelves say them ("Role-playing (RPG)" → "RPG"). */
export function simpleGenre(name: string): string {
  const n = name.trim()
  const short: Record<string, string> = {
    'Role-playing (RPG)': 'RPG',
    'Real Time Strategy (RTS)': 'Strategy',
    'Turn-based strategy (TBS)': 'Strategy',
    'Hack and slash/Beat \'em up': "Beat 'em up",
    'Point-and-click': 'Point & click',
    'Card & Board Game': 'Card & board',
    'Quiz/Trivia': 'Trivia',
  }
  return short[n] ?? n
}

/** The IGDB game of a Steam app id (IGDB's links between stores and games); undefined when it has none. */
export async function igdbIdOfSteam(session: PacedSession, appId: string): Promise<number | undefined> {
  if (!/^\d+$/.test(appId)) return undefined
  const rows = await session.json<any[]>(`${API}/external_games`, { method: 'POST', body: `fields *; where uid = "${appId}"; limit 50;` })
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row?.game !== 'number') continue
    // Steam's links: their source says so (category 1, then external_game_source 1 since 2025), or their address does
    const steam = row.category === 1 || row.external_game_source === 1
      || (typeof row.url === 'string' && new RegExp(`store\\.steampowered\\.com/app/${appId}(\\D|$)`).test(row.url))
    if (steam) return row.game
  }
  return undefined
}

export async function igdbGame(session: PacedSession, id: number): Promise<IgdbGame | null> {
  const rows = await session.json<any[]>(`${API}/games`, { method: 'POST', body: `${GAME_FIELDS} where id = ${Math.floor(id)};` })
  return parseIgdbGame(Array.isArray(rows) ? rows[0] : null)
}

/**
 * Games by title (platform: IGDB's platform id, PC by default; 0: any). Only the same title counts (titleKey),
 * the one with the most ratings first: a guess from a near title would put the wrong game's box on the shelf.
 */
export async function findOnIgdb(session: PacedSession, title: string, platform = IGDB_PC): Promise<IgdbGame | undefined> {
  const where = platform ? ` where platforms = (${Math.floor(platform)});` : ''
  const rows = await session.json<any[]>(`${API}/games`, { method: 'POST', body: `search ${quoted(title)}; ${GAME_FIELDS}${where} limit 10;` })
  const key = titleKey(title)
  const same = (Array.isArray(rows) ? rows : []).map(parseIgdbGame).filter((g): g is IgdbGame => !!g && titleKey(g.name) === key)
  return same.sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))[0]
}

/** IGDB's platforms a person may narrow a search to (the manual link), by IGDB's ids. */
export const IGDB_PLATFORMS: Array<{ id: number; label: string }> = [
  { id: 0, label: 'Any platform' },
  { id: 6, label: 'PC' },
  { id: 18, label: 'NES' },
  { id: 19, label: 'Super Nintendo' },
  { id: 4, label: 'Nintendo 64' },
  { id: 21, label: 'GameCube' },
  { id: 5, label: 'Wii' },
  { id: 130, label: 'Switch' },
  { id: 33, label: 'Game Boy' },
  { id: 22, label: 'Game Boy Color' },
  { id: 24, label: 'Game Boy Advance' },
  { id: 20, label: 'Nintendo DS' },
  { id: 29, label: 'Genesis / Mega Drive' },
  { id: 7, label: 'PlayStation' },
  { id: 8, label: 'PlayStation 2' },
  { id: 52, label: 'Arcade' },
]
/** A platform's short name, for the list of results ('' when it isn't one of IGDB_PLATFORMS). */
export const platformLabel = (id: number) => (id ? IGDB_PLATFORMS.find(p => p.id === id)?.label ?? '' : '')

/** Several games by title, for a person to choose from (the manual link, later): any platform, IGDB's order. */
export async function searchIgdb(session: PacedSession, title: string, platform = 0, limit = 12): Promise<IgdbGame[]> {
  const where = platform ? ` where platforms = (${Math.floor(platform)});` : ''
  const rows = await session.json<any[]>(`${API}/games`, { method: 'POST', body: `search ${quoted(title)}; ${GAME_FIELDS}${where} limit ${Math.max(1, Math.min(50, limit))};` })
  return (Array.isArray(rows) ? rows : []).map(parseIgdbGame).filter((g): g is IgdbGame => !!g)
}
