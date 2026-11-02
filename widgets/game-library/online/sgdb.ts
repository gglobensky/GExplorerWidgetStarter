// widgets/game-library/online/sgdb.ts
//
// SteamGridDB (0.4.0, Phase 3): boxes, banners (heroes) and logos made by its community, for the games without art
// on this computer (Epic, GOG, yours; a Steam game Steam keeps no art for). The user's own free API key, saved by
// GEM Shell as this widget's secret 'steamgriddb' for www.steamgriddb.com only: the widget never sees it.
// Images come from SteamGridDB's CDN with no key. WebP is never asked for (GEM Shell's images take PNG and JPEG).
import { createPaced, type FetchPort, type PacedSession } from './paced.ts'
import { titleKey } from '../games.ts'

export const SGDB_SECRET = 'steamgriddb'
export const SGDB_HOSTS = ['www.steamgriddb.com']
export const SGDB_API = 'https://www.steamgriddb.com/api/v2'

export type SgdbArtKind = 'box' | 'hero' | 'logo'
/** Where SteamGridDB knows the game from: its Steam app id, or its own id (found by title). */
export type SgdbTarget = { steam: string } | { game: number }

export function sgdbSession(port: FetchPort, sleep?: (ms: number) => Promise<void>): PacedSession {
  return createPaced(port, {
    service: 'SteamGridDB',
    minGapMs: 250,
    concurrency: 2,
    headers: { Authorization: { secret: SGDB_SECRET, format: 'Bearer {}' } },
    fatalStatuses: [401, 403],
    sleep,
  })
}

const PATHS: Record<SgdbArtKind, string> = { box: 'grids', hero: 'heroes', logo: 'logos' }
const QUERIES: Record<SgdbArtKind, Record<string, string>> = {
  // Vertical boxes only (600x900 and its 2x), still images, PNG or JPEG
  box: { dimensions: '600x900,342x482,660x930', types: 'static', mimes: 'image/png,image/jpeg', nsfw: 'false', humor: 'false' },
  hero: { types: 'static', mimes: 'image/png,image/jpeg', nsfw: 'false', humor: 'false' },
  // Logos keep their transparency: PNG
  logo: { types: 'static', mimes: 'image/png', nsfw: 'false', humor: 'false' },
}

export function sgdbArtUrl(kind: SgdbArtKind, target: SgdbTarget): string {
  const where = 'steam' in target ? `steam/${encodeURIComponent(target.steam)}` : `game/${target.game}`
  return `${SGDB_API}/${PATHS[kind]}/${where}?${new URLSearchParams(QUERIES[kind])}`
}

/** An images answer: their urls, best first (SteamGridDB sorts by score), WebP and animations left out. */
export function parseImages(body: unknown, max = 3): string[] {
  if (!body || typeof body !== 'object' || (body as any).success === false) return []
  const data = Array.isArray((body as any).data) ? (body as any).data : []
  const urls: string[] = []
  for (const image of data) {
    const url = image?.url
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) continue
    if (/\.(webp|gif|webm)(\?|$)/i.test(url)) continue
    if (image.nsfw === true || image.epilepsy === true) continue
    urls.push(url)
    if (urls.length >= max) break
  }
  return urls
}

/** A search answer: the game with the same title (titleKey; a verified one first), else undefined. */
export function pickSgdbGame(title: string, body: unknown): number | undefined {
  const data = Array.isArray((body as any)?.data) ? (body as any).data : []
  const key = titleKey(title)
  if (!key) return undefined
  const same = data.filter((g: any) => typeof g?.id === 'number' && typeof g?.name === 'string' && titleKey(g.name) === key)
  const hit = same.find((g: any) => g.verified) ?? same[0]
  return hit?.id
}

export async function findSgdbGame(session: PacedSession, title: string): Promise<number | undefined> {
  const body = await session.json(`${SGDB_API}/search/autocomplete/${encodeURIComponent(title)}`)
  return pickSgdbGame(title, body)
}

export async function sgdbArt(session: PacedSession, kind: SgdbArtKind, target: SgdbTarget): Promise<string[]> {
  return parseImages(await session.json(sgdbArtUrl(kind, target)))
}
