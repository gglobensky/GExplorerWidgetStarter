// widgets/game-library/online/details.ts
//
// Online details (0.4.0, Phase 3): what Steam's store says of each game (description, genres, year, Metacritic,
// developers, screenshots) and the art SteamGridDB has for the games with none on this computer, looked up in the
// background and kept (sdk.configWrite 'game-library-details') so each game is asked for about once a month.
//   - A Steam game: by its app id. Another: Steam's store search by title (only the same title counts), so an
//     Epic or GOG game sold on Steam too gets the same details.
//   - Art: what this computer has comes first; then SteamGridDB (with the user's key); then Steam's servers.
//   - Not found: asked again after a week. Found: after 30 days. "Look up details again": now.
import type { GameItem } from '../games.ts'
import { OnlineFatalError, type FetchPort } from './paced.ts'
import { findOnIgdb, igdbGame, igdbIdOfSteam, igdbImage, igdbSession } from './igdb.ts'
import { findSgdbGame, sgdbArt, sgdbSession, type SgdbArtKind, type SgdbTarget } from './sgdb.ts'
import { findOnSteam, steamDetails, steamReviews, steamStoreSession, type SteamDetails, type SteamReviews } from './steam-store.ts'

export const DETAILS_DOC = 'game-library-details'
const DAY = 86_400_000
export const FOUND_FOR_MS = 30 * DAY
export const MISSED_FOR_MS = 7 * DAY

export type GameDetails = {
  /** The Steam app id the details are of (a Steam game's own, or found by title). */
  steamAppId?: string
  synopsis?: string
  genres?: string[]
  released?: string
  year?: number
  metacritic?: number
  metacriticUrl?: string
  /** What Steam's players say (0.6.0), and when it was asked. */
  reviews?: SteamReviews
  reviewsAt?: number
  developers?: string[]
  publishers?: string[]
  screenshots?: Array<{ thumb: string; full: string }>
  /** Image urls, best first. */
  art?: { box?: string[]; hero?: string[]; logo?: string[] }
  /** When Steam was asked (found or not), when SteamGridDB was. */
  steamAt?: number
  steamFound?: boolean
  sgdbAt?: number
  sgdbFound?: boolean
  /** 0.11.0: IGDB's game, its rating (0–100, critics and players) and page, and when it was asked. */
  igdbId?: number
  igdbRating?: number
  igdbRatingCount?: number
  igdbUrl?: string
  igdbAt?: number
  igdbFound?: boolean
}

export type DetailsDoc = {
  version: 1
  games: Record<string, GameDetails>
  /**
   * 0.9.0: whether SteamGridDB had a key the last time this Game Shop looked (the key can now be set or forgotten on
   * GEM Shell's settings page with no Game Shop open: on opening, a change since is caught up with, sgdbKeyChange).
   */
  sgdbKey?: boolean
}

export type ConfigPort = {
  configRead?: <T = unknown>(name: string) => Promise<T | null>
  configWrite?: (name: string, data: unknown) => Promise<void>
}

const httpsList = (v: unknown, max: number) => Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, max) : undefined
const textList = (v: unknown, max: number) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.slice(0, 80)).slice(0, max) : undefined
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

/** What was saved, checked: anything that doesn't fit is left out. */
export function normalizeDetails(raw: unknown): DetailsDoc {
  const doc: DetailsDoc = { version: 1, games: {} }
  if (typeof (raw as any)?.sgdbKey === 'boolean') doc.sgdbKey = (raw as any).sgdbKey
  const games = (raw as any)?.games
  if (!games || typeof games !== 'object') return doc
  for (const [id, g] of Object.entries(games as Record<string, any>)) {
    if (!g || typeof g !== 'object' || !id.startsWith('game:')) continue
    const d: GameDetails = {}
    if (typeof g.steamAppId === 'string' && /^\d+$/.test(g.steamAppId)) d.steamAppId = g.steamAppId
    d.synopsis = text(g.synopsis, 900)
    d.genres = textList(g.genres, 6)
    d.released = text(g.released, 40)
    d.year = num(g.year)
    d.metacritic = num(g.metacritic)
    if (typeof g.metacriticUrl === 'string' && /^https:\/\/(www\.)?metacritic\.com\//i.test(g.metacriticUrl)) d.metacriticUrl = g.metacriticUrl.slice(0, 300)
    d.developers = textList(g.developers, 6)
    d.publishers = textList(g.publishers, 6)
    if (Array.isArray(g.screenshots)) {
      d.screenshots = g.screenshots
        .filter((s: any) => typeof s?.thumb === 'string' && typeof s?.full === 'string' && /^https:\/\//i.test(s.thumb) && /^https:\/\//i.test(s.full))
        .map((s: any) => ({ thumb: s.thumb, full: s.full }))
        .slice(0, 8)
    }
    if (g.art && typeof g.art === 'object') d.art = { box: httpsList(g.art.box, 4), hero: httpsList(g.art.hero, 4), logo: httpsList(g.art.logo, 4) }
    if (g.reviews && typeof g.reviews === 'object' && typeof g.reviews.desc === 'string') {
      const total = num(g.reviews.total)
      const positive = typeof g.reviews.positive === 'number' && g.reviews.positive >= 0 ? g.reviews.positive : undefined
      if (total && positive !== undefined) d.reviews = { desc: g.reviews.desc.slice(0, 60), score: Math.max(0, Math.min(9, Math.round(Number(g.reviews.score) || 0))), positive: Math.min(positive, total), total }
    }
    d.reviewsAt = num(g.reviewsAt)
    d.steamAt = num(g.steamAt)
    d.sgdbAt = num(g.sgdbAt)
    if (typeof g.steamFound === 'boolean') d.steamFound = g.steamFound
    if (typeof g.sgdbFound === 'boolean') d.sgdbFound = g.sgdbFound
    if (typeof g.igdbId === 'number' && Number.isInteger(g.igdbId) && g.igdbId > 0) d.igdbId = g.igdbId
    d.igdbRating = num(g.igdbRating)
    d.igdbRatingCount = num(g.igdbRatingCount)
    if (typeof g.igdbUrl === 'string' && /^https:\/\/www\.igdb\.com\//.test(g.igdbUrl)) d.igdbUrl = g.igdbUrl.slice(0, 300)
    d.igdbAt = num(g.igdbAt)
    if (typeof g.igdbFound === 'boolean') d.igdbFound = g.igdbFound
    for (const k of Object.keys(d) as Array<keyof GameDetails>) if (d[k] === undefined) delete d[k]
    doc.games[id] = d
  }
  return doc
}

export async function loadDetails(port: ConfigPort): Promise<DetailsDoc> {
  try { return normalizeDetails(await port.configRead?.(DETAILS_DOC)) } catch { return normalizeDetails(null) }
}
export async function saveDetails(port: ConfigPort, doc: DetailsDoc): Promise<void> {
  await port.configWrite?.(DETAILS_DOC, doc)
}

const stale = (at: number | undefined, found: boolean | undefined, now: number) => !at || now - at > (found ? FOUND_FOR_MS : MISSED_FOR_MS)

/** The kinds of art a game has none of on this computer (Steam's cached files). */
export function missingArt(game: GameItem): SgdbArtKind[] {
  const kinds: SgdbArtKind[] = []
  if (!game.art?.box) kinds.push('box')
  if (!game.art?.hero) kinds.push('hero')
  if (!game.art?.logo) kinds.push('logo')
  return kinds
}

/** What to ask for this game now. */
export function due(game: GameItem, d: GameDetails | undefined, sgdb: boolean, now: number, igdb = false): { steam: boolean; sgdb: boolean; reviews: boolean; igdb: boolean } {
  const appId = game.releases.find(r => r.store === 'steam')?.storeId ?? d?.steamAppId
  return {
    steam: stale(d?.steamAt, d?.steamFound, now),
    sgdb: sgdb && missingArt(game).length > 0 && stale(d?.sgdbAt, d?.sgdbFound, now),
    // Players' reviews change: asked again weekly (a game without any: weekly too)
    reviews: !!appId && stale(d?.reviewsAt, false, now),
    igdb: igdb && stale(d?.igdbAt, d?.igdbFound, now),
  }
}

export type LookUpOptions = {
  /** The user connected SteamGridDB (sdk.secrets().status). */
  sgdb: boolean
  /** 0.11.0: the user gave their Twitch app for IGDB. */
  igdb?: boolean
  /**
   * 0.11.1: the boxes the user linked to an IGDB game by hand (game id → IGDB id): that game's details win over
   * Steam's guesses (Steam is asked only for a game sold there), its cover first.
   */
  links?: Record<string, { igdbId: number; name: string }>
  /** Ask again even for games asked recently ("Look up details again"). */
  force?: boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Each game's new details, as they come (the widget saves and shows them). */
  onDetails: (gameId: string, details: GameDetails) => void
  /** Checked between games: true stops the run (the widget left the screen). */
  stopped?: () => boolean
  /** How far it is: games done, games to do (0.5.0). Called once with (0, total) when it starts. */
  onProgress?: (done: number, total: number) => void
}

export type LookUpResult = {
  /** The games it looked up. */
  asked: number
  /** The games that were due (asked is less when the run stopped early). */
  due: number
  /** Steam stopped the run (the Network permission was refused): its message. */
  error?: string
  /** SteamGridDB refused (the key): its message; Steam's details went on. */
  sgdbError?: string
  /** IGDB refused (the Twitch app): its message; the others went on. */
  igdbError?: string
}

/** Looks up what's due, two games at a time (each service paces its own requests). Never throws. */
export async function lookUpDetails(port: FetchPort, games: GameItem[], doc: DetailsDoc, options: LookUpOptions): Promise<LookUpResult> {
  const now = options.now ?? Date.now
  const steam = steamStoreSession(port, options.sleep)
  const sgdb = sgdbSession(port, options.sleep)
  const igdb = igdbSession(port, options.sleep)
  let sgdbOn = options.sgdb
  let igdbOn = !!options.igdb
  const result: LookUpResult = { asked: 0, due: 0 }
  const wantsOf = (game: GameItem) => options.force
    ? { steam: true, sgdb: sgdbOn && missingArt(game).length > 0, reviews: true, igdb: igdbOn }
    : due(game, doc.games[game.id], sgdbOn, now(), igdbOn)
  // The games due; those with nothing yet first, then the boxes still plain, then the rest
  // 0.13.0: the games not installed (hundreds, with Epic's library) after the installed ones
  const rank = (g: GameItem) => (g.releases.some(r => r.installed) ? 0 : 4) + (doc.games[g.id] ? 2 : 0) + (g.art?.box ? 1 : 0)
  // 0.12.0: a CurseForge modpack isn't looked up (its name is the user's; a guess would be another game), unless linked
  const lookable = (g: GameItem) => !!options.links?.[g.id] || !g.releases.every(r => r.store === 'curseforge')
  const order = games.filter(g => { if (!lookable(g)) return false; const w = wantsOf(g); return w.steam || w.sgdb || w.reviews || w.igdb }).sort((a, b) => rank(a) - rank(b))
  result.due = order.length
  let done = 0
  options.onProgress?.(0, order.length)

  async function one(game: GameItem) {
    const before = doc.games[game.id]
    const t = now()
    const wants = wantsOf(game)
    if (!wants.steam && !wants.reviews && !(wants.sgdb && sgdbOn) && !(wants.igdb && igdbOn)) return
    result.asked += 1
    const next: GameDetails = { ...before, art: { ...before?.art } }
    let steamArt: SteamDetails['art'] | undefined
    const link = options.links?.[game.id]
    const linked = link?.igdbId
    // The name the user chose (a box added by hand is named after its exe): what SteamGridDB is searched by
    const title = link?.name ?? game.title
    const ownSteam = game.releases.find(r => r.store === 'steam')?.storeId
    // A box linked by hand isn't searched on Steam by its title (the guess may be another game)
    if (wants.steam && (!linked || ownSteam)) {
      try {
        const own = game.releases.find(r => r.store === 'steam')?.storeId
        const appId = own ?? before?.steamAppId ?? await findOnSteam(steam, game.title)
        const found = appId ? await steamDetails(steam, appId) : undefined
        next.steamAt = t
        next.steamFound = !!found
        if (found) {
          next.steamAppId = found.appId
          next.synopsis = found.synopsis
          next.genres = found.genres
          next.released = found.released
          next.year = found.year
          next.metacritic = found.metacritic
          next.metacriticUrl = found.metacriticUrl
          next.developers = found.developers
          next.publishers = found.publishers
          next.screenshots = found.screenshots
          steamArt = found.art
        }
      } catch (error) {
        if (error instanceof OnlineFatalError) throw error
        console.warn(`[game-library] Steam's details of ${game.title} were unavailable.`, error)
      }
    }

    // What Steam's players say: when due, or when Steam's details were just asked (a game found on Steam by title)
    const reviewsId = game.releases.find(r => r.store === 'steam')?.storeId ?? next.steamAppId
    if (reviewsId && (wants.reviews || wants.steam)) {
      try {
        next.reviews = await steamReviews(steam, reviewsId)
        next.reviewsAt = t
        if (!next.reviews) delete next.reviews
      } catch (error) {
        if (error instanceof OnlineFatalError) throw error
        console.warn(`[game-library] Steam's reviews of ${game.title} were unavailable: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (wants.sgdb && sgdbOn) {
      try {
        const appId = game.releases.find(r => r.store === 'steam')?.storeId ?? next.steamAppId
        let target: SgdbTarget | undefined = appId ? { steam: appId } : undefined
        const art: NonNullable<GameDetails['art']> = { ...next.art }
        let found = false
        for (const kind of missingArt(game)) {
          let urls = target ? await sgdbArt(sgdb, kind, target) : []
          // SteamGridDB doesn't know it by its Steam id (or it has none): by title
          if (!urls.length && (!target || 'steam' in target)) {
            const id = await findSgdbGame(sgdb, title)
            if (id !== undefined) { target = { game: id }; urls = await sgdbArt(sgdb, kind, target) }
            else if (!target) break
          }
          if (urls.length) { art[kind] = [...urls, ...(art[kind] ?? []).filter(isSteamCdn)]; found = true }
        }
        next.art = art
        next.sgdbAt = t
        next.sgdbFound = found
      } catch (error) {
        if (error instanceof OnlineFatalError) {
          // The key was refused: no more SteamGridDB this run; Steam's details go on
          sgdbOn = false
          result.sgdbError = error.message
        } else {
          console.warn(`[game-library] SteamGridDB's art of ${game.title} was unavailable.`, error)
        }
      }
    }

    // Steam's own servers' art comes after SteamGridDB's
    if (steamArt) {
      for (const kind of ['box', 'hero', 'logo'] as const) {
        const url = steamArt[kind]
        const list = (next.art?.[kind] ?? []).filter(u => !isSteamCdn(u))
        if (url) list.push(url)
        next.art![kind] = list.length ? list.slice(0, 4) : undefined
      }
    }
    // 0.11.0: IGDB: its rating and page always; what Steam didn't give (a game not on Steam): the description,
    // genres, year, screenshots; its cover and artwork after the others' pictures
    if (igdbOn && (wants.igdb || linked)) {
      try {
        const appId = game.releases.find(r => r.store === 'steam')?.storeId ?? next.steamAppId
        const id = linked ?? before?.igdbId ?? (appId ? await igdbIdOfSteam(igdb, appId) : undefined)
        const found = id ? await igdbGame(igdb, id) : await findOnIgdb(igdb, game.title)
        next.igdbAt = t
        next.igdbFound = !!found
        if (found) {
          next.igdbId = found.id
          next.igdbRating = found.rating
          next.igdbRatingCount = found.ratingCount
          next.igdbUrl = found.url
          const take = !!linked
          if ((take || !next.synopsis) && found.summary) next.synopsis = found.summary
          if ((take || !next.genres?.length) && found.genres?.length) next.genres = found.genres
          if ((take || !next.year) && found.released) next.year = new Date(found.released).getUTCFullYear()
          if ((take || !next.screenshots?.length) && found.screenshots.length) {
            next.screenshots = found.screenshots.map(s => ({ thumb: igdbImage(s, 'screenshot_med'), full: igdbImage(s, 'screenshot_huge') }))
          }
          const add = (kind: 'box' | 'hero', url: string | undefined) => {
            if (!url) return
            const list = (next.art![kind] ?? []).filter(u => !isIgdbImage(u))
            next.art![kind] = (take ? [url, ...list] : [...list, url]).slice(0, 4)
          }
          add('box', found.cover ? igdbImage(found.cover, 'cover_big_2x') : undefined)
          add('hero', found.artworks[0] ? igdbImage(found.artworks[0], '1080p') : undefined)
        }
      } catch (error) {
        if (error instanceof OnlineFatalError) {
          igdbOn = false
          result.igdbError = error.message
        } else {
          console.warn(`[game-library] IGDB's details of ${game.title} were unavailable.`, error)
        }
      }
    }
    for (const kind of ['box', 'hero', 'logo'] as const) if (!next.art?.[kind]?.length) delete next.art?.[kind]
    if (next.art && !Object.keys(next.art).length) delete next.art
    for (const k of ['igdbRating', 'igdbRatingCount', 'igdbUrl'] as const) if (next[k] === undefined) delete next[k]
    doc.games[game.id] = next
    options.onDetails(game.id, next)
  }

  const queue = [...order]
  async function worker() {
    while (queue.length && !options.stopped?.() && !result.error) {
      const game = queue.shift()!
      try {
        await one(game)
      } catch (error) {
        // Only Steam's fatal errors reach here: GEM Shell refused the network
        result.error = error instanceof Error ? error.message : String(error)
      }
      options.onProgress?.(++done, order.length)
    }
  }
  await Promise.all([worker(), worker()])
  return result
}

/** SteamGridDB's pictures (its CDN). */
export function isSgdbUrl(url: string): boolean {
  return /^https:\/\/([^/]*\.)?steamgriddb\.com\//i.test(url)
}

/**
 * The details without SteamGridDB's pictures ("Forget the key", 0.5.0): its urls left out, SteamGridDB to be asked
 * again once a key is given. `removed`: the games that lose a picture.
 */
/**
 * The details after the SteamGridDB key changed (0.9.0): forgotten, its pictures go (withoutSgdb); set, the games
 * it was asked for without one are due again. null: no change since the last look (or the key's state unknown).
 */
export function sgdbKeyChange(doc: DetailsDoc, keySet: boolean): { doc: DetailsDoc; removed: number } | null {
  if (doc.sgdbKey === keySet) return null
  if (!keySet) {
    const out = withoutSgdb(doc)
    return { doc: { ...out.doc, sgdbKey: false }, removed: out.removed }
  }
  const games = Object.fromEntries(Object.entries(doc.games).map(([id, d]) => [id, d.sgdbFound ? d : { ...d, sgdbAt: undefined }]))
  return { doc: { ...doc, games, sgdbKey: true }, removed: 0 }
}

export function withoutSgdb(doc: DetailsDoc): { doc: DetailsDoc; removed: number } {
  let removed = 0
  const games: Record<string, GameDetails> = {}
  for (const [id, d] of Object.entries(doc.games)) {
    const next: GameDetails = { ...d }
    delete next.sgdbAt
    delete next.sgdbFound
    if (d.art) {
      const art: NonNullable<GameDetails['art']> = {}
      let lost = false
      for (const kind of ['box', 'hero', 'logo'] as const) {
        const list = d.art[kind]?.filter(u => !isSgdbUrl(u))
        if ((d.art[kind]?.length ?? 0) !== (list?.length ?? 0)) lost = true
        if (list?.length) art[kind] = list
      }
      if (lost) removed += 1
      if (Object.keys(art).length) next.art = art
      else delete next.art
    }
    games[id] = next
  }
  return { doc: { ...doc, games }, removed }
}

/** IGDB's pictures. */
export function isIgdbImage(url: string): boolean {
  return /^https:\/\/images\.igdb\.com\//i.test(url)
}

function isSteamCdn(url: string): boolean {
  return /^https:\/\/[^/]*(steamstatic\.com|steampowered\.com|akamaihd\.net)\//i.test(url)
}
