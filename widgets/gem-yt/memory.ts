// GEM YT 0.3.0 (2026-11-23): what GEM YT remembers between starts. Two documents of the widget type (sdk.configRead /
// configWrite: shared by its copies, kept by GEM Shell on this computer only):
//
//   gem-yt-memory   the racks as they were last seen: your channels, each rack's latest videos (what a rack shows),
//                   the two feeds, the aisle's order, and which GEM Shell picture went with which address. Drawn at
//                   once at the next start, then read again behind them (racks as they come into view).
//   gem-yt-ledger   what GEM YT learns about each channel over time: when it was last read, its uploads (video id and
//                   date, the newest MAX_UPLOADS: a date first seen as "2 days ago" stays more precise than a later
//                   "3 weeks ago"), its subscriber counts (one a day), and the background survey's daily count. The
//                   ground for the back room, posting rhythm and filters (plan-2026-11-23-gem-yt-subscriptions.md).
//
// Pure (no SDK, no Vue). Anything that doesn't fit when read back is left out, never a reason to fail.
import { channelOf, videoOf, type Channel, type Video } from './racks'

export const MEMORY_DOC = 'gem-yt-memory'
export const LEDGER_DOC = 'gem-yt-ledger'
/** Videos kept per rack (what a rack shows) and per feed. */
export const RACK_KEEP = 18
export const FEED_KEEP = 30
export const MAX_UPLOADS = 60
export const MAX_SUBS = 180
/** The background survey: channels read a day at most (GEM Shell allows 300 reads a day for the widget). */
export const SURVEY_PER_DAY = 60
/** A channel read longer ago than this is surveyed again. */
export const SURVEY_AGAIN_MS = 7 * 24 * 3600_000

const DAY_MS = 24 * 3600_000
/** GEM Shell's image addresses only (anything else in the document is left out). */
const ASSET_URL = /^\/wasset\/[0-9a-f]{32}\.(?:jpg|png)$/
const ID = /^[\w-]{1,64}$/

export type Memory = {
  version: 1
  at: number
  channels: Channel[]
  videos: Record<string, Video[]>
  feeds: Record<string, Video[]>
  order: string[]
  /** page address -> GEM Shell's local one */
  pictures: Record<string, string>
  /** 0.3.3: when this visit began (the next one's "Since you were here" starts there) */
  visitAt?: number
}

export type ChannelRecord = {
  readAt?: number
  /** [video id, upload time (ms)], newest first */
  uploads: Array<[string, number]>
  /** [day number (ms / 1 day), subscribers] */
  subs: Array<[number, number]>
}
export type Ledger = { version: 1; channels: Record<string, ChannelRecord>; survey: { day: number; count: number } }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function videos(raw: unknown, keep: number): Video[] {
  return Array.isArray(raw) ? (raw.slice(0, keep).map(v => (obj(v) ? videoOf(v) : null)).filter(Boolean) as Video[]) : []
}

export function readMemory(raw: unknown): Memory | null {
  if (!obj(raw) || raw.version !== 1) return null
  const channels = Array.isArray(raw.channels) ? (raw.channels.map(c => (obj(c) ? channelOf(c) : null)).filter(Boolean) as Channel[]) : []
  if (!channels.length) return null
  const ids = new Set(channels.map(c => c.id))
  const out: Memory = { version: 1, at: num(raw.at) ? raw.at : 0, channels, videos: {}, feeds: {}, order: [], pictures: {} }
  if (num(raw.visitAt)) out.visitAt = raw.visitAt
  if (obj(raw.videos)) for (const [id, list] of Object.entries(raw.videos)) if (ids.has(id)) out.videos[id] = videos(list, RACK_KEEP)
  if (obj(raw.feeds)) for (const [id, list] of Object.entries(raw.feeds)) if (/^feed:[a-z]{1,20}$/.test(id)) out.feeds[id] = videos(list, FEED_KEEP)
  if (Array.isArray(raw.order)) out.order = raw.order.filter((id): id is string => typeof id === 'string' && ids.has(id))
  if (obj(raw.pictures))
    for (const [from, to] of Object.entries(raw.pictures))
      if (from.startsWith('https://') && from.length < 2000 && typeof to === 'string' && ASSET_URL.test(to)) out.pictures[from] = to
  return out
}

/** The memory to save: only the pictures of what it keeps (so the document never grows past the racks). */
export function makeMemory(channels: Channel[], order: string[], rackVideos: Map<string, Video[]>, feeds: Map<string, Video[]>,
  pictures: Map<string, string>, now: number, visitAt?: number): Memory {
  const mem: Memory = { version: 1, at: now, channels, videos: {}, feeds: {}, order, pictures: {}, ...(visitAt ? { visitAt } : {}) }
  const keepPic = (url: string | undefined) => { const to = url && pictures.get(url); if (url && to) mem.pictures[url] = to }
  for (const c of channels) {
    keepPic(c.avatar)
    const list = rackVideos.get(c.id)
    if (!list) continue
    mem.videos[c.id] = list.slice(0, RACK_KEEP)
    for (const v of mem.videos[c.id]) keepPic(v.thumbnail)
  }
  for (const [id, list] of feeds) {
    mem.feeds[id] = list.slice(0, FEED_KEEP)
    for (const v of mem.feeds[id]) keepPic(v.thumbnail)
  }
  return mem
}

export function emptyLedger(): Ledger {
  return { version: 1, channels: {}, survey: { day: 0, count: 0 } }
}

export function readLedger(raw: unknown): Ledger {
  const out = emptyLedger()
  if (!obj(raw) || raw.version !== 1) return out
  if (obj(raw.survey) && num(raw.survey.day) && num(raw.survey.count)) out.survey = { day: raw.survey.day, count: raw.survey.count }
  if (!obj(raw.channels)) return out
  for (const [id, r] of Object.entries(raw.channels)) {
    if (!ID.test(id) || !obj(r)) continue
    const rec: ChannelRecord = { uploads: [], subs: [] }
    if (num(r.readAt)) rec.readAt = r.readAt
    if (Array.isArray(r.uploads))
      for (const u of r.uploads.slice(0, MAX_UPLOADS)) if (Array.isArray(u) && typeof u[0] === 'string' && ID.test(u[0]) && num(u[1])) rec.uploads.push([u[0], u[1]])
    if (Array.isArray(r.subs))
      for (const s of r.subs.slice(-MAX_SUBS)) if (Array.isArray(s) && num(s[0]) && num(s[1])) rec.subs.push([s[0], s[1]])
    out.channels[id] = rec
  }
  return out
}

function recordOf(ledger: Ledger, id: string): ChannelRecord {
  return (ledger.channels[id] ??= { uploads: [], subs: [] })
}

/** Uploads seen (a channel's page, or the subscriptions feed): a video already known keeps its first date. */
export function noteUploads(ledger: Ledger, channelId: string, list: Video[]): void {
  const rec = recordOf(ledger, channelId)
  const known = new Set(rec.uploads.map(u => u[0]))
  for (const v of list) {
    const t = v.published ? Date.parse(v.published) : NaN
    if (!Number.isFinite(t) || known.has(v.id)) continue
    rec.uploads.push([v.id, t])
    known.add(v.id)
  }
  rec.uploads.sort((a, b) => b[1] - a[1])
  if (rec.uploads.length > MAX_UPLOADS) rec.uploads.length = MAX_UPLOADS
}

export function noteRead(ledger: Ledger, channelId: string, list: Video[], now: number): void {
  recordOf(ledger, channelId).readAt = now
  noteUploads(ledger, channelId, list)
}

/** Today's subscriber counts (one point a day per channel). */
export function noteSubscribers(ledger: Ledger, channels: Channel[], now: number): void {
  const day = Math.floor(now / DAY_MS)
  for (const c of channels) {
    if (c.subscribers === undefined) continue
    const rec = recordOf(ledger, c.id)
    const last = rec.subs[rec.subs.length - 1]
    if (last && last[0] === day) last[1] = c.subscribers
    else rec.subs.push([day, c.subscribers])
    if (rec.subs.length > MAX_SUBS) rec.subs.splice(0, rec.subs.length - MAX_SUBS)
  }
}

export function lastUpload(ledger: Ledger, channelId: string): number | undefined {
  return ledger.channels[channelId]?.uploads[0]?.[1]
}

/**
 * The next channel the background survey reads (in the aisle's order: the most recently active first): one never
 * read, else the one read longest ago past SURVEY_AGAIN_MS. Null: none, or today's SURVEY_PER_DAY are done.
 */
export function surveyNext(ledger: Ledger, order: string[], skip: (id: string) => boolean, now: number): string | null {
  const day = Math.floor(now / DAY_MS)
  if (ledger.survey.day === day && ledger.survey.count >= SURVEY_PER_DAY) return null
  let stale: string | null = null
  let staleAt = Infinity
  for (const id of order) {
    if (skip(id)) continue
    const at = ledger.channels[id]?.readAt
    if (at === undefined) return id
    if (now - at > SURVEY_AGAIN_MS && at < staleAt) { stale = id; staleAt = at }
  }
  return stale
}

/** 0.3.1: a channel's posting rhythm, from its ledger record. */
export type Rhythm = {
  /** Videos a week, oldest first (RHYTHM_WEEKS), 0 to 1 of the busiest; null: a week not known. */
  bars: Array<number | null>
  /** Videos a week over the weeks known (undefined: too little known). */
  perWeek?: number
  /** Well past its usual gap (3 times the median of its last gaps, a week at least). */
  overdue: boolean
  last?: number
}
export const RHYTHM_WEEKS = 12
const WEEK_MS = 7 * DAY_MS

export function rhythmOf(rec: ChannelRecord | undefined, now: number): Rhythm {
  const ups = rec?.uploads ?? []
  const last = ups[0]?.[1]
  if (!ups.length) return { bars: [], overdue: false, last }
  // What's known: a channel page lists its latest ~30 videos, so a busy channel's older weeks aren't known; a channel
  // known only from the subscriptions feed isn't known before its oldest video there either
  const oldest = ups[ups.length - 1][1]
  const complete = rec?.readAt !== undefined && ups.length < 25
  const knownFrom = complete ? -Infinity : oldest
  const counts: Array<number | null> = []
  for (let w = RHYTHM_WEEKS - 1; w >= 0; w--) {
    const end = now - w * WEEK_MS, start = end - WEEK_MS
    counts.push(start < knownFrom ? null : ups.filter(u => u[1] > start && u[1] <= end).length)
  }
  const known = counts.filter((c): c is number => c !== null)
  const top = Math.max(1, ...known)
  const bars = counts.map(c => (c === null ? null : c / top))
  const perWeek = known.length >= 3 ? known.reduce((a, b) => a + b, 0) / known.length : undefined
  const gaps: number[] = []
  for (let i = 0; i + 1 < Math.min(ups.length, 11); i++) gaps.push(ups[i][1] - ups[i + 1][1])
  gaps.sort((a, b) => a - b)
  const median = gaps.length >= 3 ? gaps[Math.floor(gaps.length / 2)] : undefined
  const overdue = median !== undefined && last !== undefined && now - last > Math.max(3 * median, WEEK_MS)
  return { bars, perWeek, overdue, last }
}

export function noteSurvey(ledger: Ledger, now: number): void {
  const day = Math.floor(now / DAY_MS)
  if (ledger.survey.day !== day) ledger.survey = { day, count: 0 }
  ledger.survey.count += 1
}
