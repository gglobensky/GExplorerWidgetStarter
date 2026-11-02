// widgets/game-library/online/steam-owned.ts
//
// The Steam games the user owns, installed or not, with their play time (0.10.0): Steam's Web API,
// IPlayerService/GetOwnedGames, with the user's own Web API key (steamcommunity.com/dev/apikey). GEM Shell keeps the
// key as this widget's secret 'steamwebapi' for api.steampowered.com only, and sends it as the x-webapi-key header
// (Valve's documented alternative to ?key=, partner.steamgames.com/doc/webapi_overview/auth): the widget never sees it.
// The account is the one last signed in to Steam on this computer (config\loginusers.vdf), or the only one with a
// userdata folder. A profile whose game details are private may answer an empty list.
// Kept in configWrite('game-library-owned'): looked up again after OWNED_FOR_MS, or when asked.
import { createPaced, type FetchPort, type PacedSession } from './paced.ts'
import { parseVdf, vdfString, type VdfObject } from '../stores/vdf.ts'

export const STEAM_API_SECRET = 'steamwebapi'
export const STEAM_API_HOSTS = ['api.steampowered.com']
export const OWNED_DOC = 'game-library-owned'
/** Looked up again after this (play time changes as the user plays). */
export const OWNED_FOR_MS = 6 * 3600_000

const STEAM_ID_BASE = 76561197960265728n

export type OwnedGame = {
  appId: string
  name: string
  /** Minutes, on every computer. */
  playtimeMinutes: number
  /** ms since 1970; 0 when never played. */
  lastPlayed: number
}

export type OwnedDoc = {
  version: 1
  steamId?: string
  /** When the list was last read (ms). */
  at?: number
  games: OwnedGame[]
  /** Why the last look-up gave nothing ("the profile's game details are private"…), for the settings. */
  note?: string
}

/** The SteamID64 of the account last signed in (MostRecent "1"), else the first one listed. */
export function steamIdFromLoginUsers(text: string): string | undefined {
  const users = (parseVdf(text) as VdfObject)
  const root = Object.entries(users).find(([k]) => k.toLowerCase() === 'users')?.[1]
  if (!root || typeof root !== 'object') return undefined
  const ids = Object.keys(root).filter(id => /^7656\d{13}$/.test(id))
  return ids.find(id => vdfString(root[id], 'MostRecent') === '1') ?? ids[0]
}

/** userdata\<account id> (Steam's 32-bit account id) as a SteamID64. */
export function steamIdFromAccountId(accountId: string): string | undefined {
  if (!/^\d{1,10}$/.test(accountId) || accountId === '0') return undefined
  return (STEAM_ID_BASE + BigInt(accountId)).toString()
}

export function ownedGamesUrl(steamId: string): string {
  return `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`
}

/** GetOwnedGames' answer: the games with a name. */
export function parseOwnedGames(json: any): OwnedGame[] {
  const list = json?.response?.games
  if (!Array.isArray(list)) return []
  const out: OwnedGame[] = []
  for (const g of list) {
    const id = typeof g?.appid === 'number' ? String(g.appid) : typeof g?.appid === 'string' && /^\d+$/.test(g.appid) ? g.appid : ''
    const name = typeof g?.name === 'string' ? g.name.trim() : ''
    if (!id || !name) continue
    const minutes = Number(g.playtime_forever)
    const last = Number(g.rtime_last_played)
    out.push({ appId: id, name: name.slice(0, 200), playtimeMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0, lastPlayed: Number.isFinite(last) && last > 0 ? last * 1000 : 0 })
  }
  return out
}

export function normalizeOwned(raw: any): OwnedDoc {
  const doc: OwnedDoc = { version: 1, games: [] }
  if (!raw || typeof raw !== 'object') return doc
  if (typeof raw.steamId === 'string' && /^7656\d{13}$/.test(raw.steamId)) doc.steamId = raw.steamId
  if (typeof raw.at === 'number' && Number.isFinite(raw.at)) doc.at = raw.at
  if (typeof raw.note === 'string') doc.note = raw.note.slice(0, 300)
  doc.games = parseOwnedGames({ response: { games: (Array.isArray(raw.games) ? raw.games : []).map((g: any) => ({ appid: g?.appId, name: g?.name, playtime_forever: g?.playtimeMinutes, rtime_last_played: (g?.lastPlayed ?? 0) / 1000 })) } })
  return doc
}

export function ownedSession(port: FetchPort, sleep?: (ms: number) => Promise<void>): PacedSession {
  return createPaced(port, {
    service: 'Steam Web API',
    minGapMs: 1000,
    headers: { 'x-webapi-key': { secret: STEAM_API_SECRET } },
    fatalStatuses: [401, 403],
    sleep,
  })
}

/** Whether the list is due (none yet, another account, or older than OWNED_FOR_MS). */
export function ownedDue(doc: OwnedDoc, steamId: string, now = Date.now()): boolean {
  return doc.steamId !== steamId || !doc.at || now - doc.at > OWNED_FOR_MS
}

/** Reads the owned games of <steamId>. Throws OnlineFatalError when GEM Shell or Steam refuses (the key). */
export async function fetchOwned(session: PacedSession, steamId: string, now = Date.now()): Promise<OwnedDoc> {
  const json = await session.json<any>(ownedGamesUrl(steamId))
  const games = parseOwnedGames(json)
  const note = games.length ? undefined
    : json?.response && !('games' in json.response) ? "Steam listed no games: the profile's game details may be private (Steam ▸ Profile ▸ Edit Profile ▸ Privacy Settings ▸ Game details: Public)."
      : 'Steam listed no games.'
  return { version: 1, steamId, at: now, games, note }
}

/** "12 h played", "45 min played"; '' when never. */
export function playtimeText(minutes: number | undefined): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes} min played`
  const hours = minutes / 60
  return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)} h played`
}
