// GEM YT 0.4.0 (2026-11-24): Discover. The channels YouTube suggests that you don't follow: each time GEM YT reads your
// home page (You may like), the channels of its videos that aren't yours are noted here, with how many reads they
// came up in and when. The ones that keep coming back are ranked first. You can hide one (it stays hidden). Kept in
// one document of the widget type ('gem-yt-discover', sdk.configWrite: every copy sees the same). Pure.
//
// 0.13.0 (2026-11-25): and the channels your channels feature (their home tab's featured channels: the rules' page
// channel-featured, read slowly in the background with the survey, once a month a channel). A card says who features
// it ("Featured by Pixel Harbor"); featured counts more than suggested (a creator's own pick).
import type { Video } from './items'

export const DISCOVER_DOC = 'gem-yt-discover'
export const MAX_SUGGESTED = 300
export const MAX_HIDDEN = 500
/** Videos kept per suggested channel (shown on its tile), the latest first. */
export const SUGGESTED_VIDEOS = 3

export type SuggestedVideo = { id: string; title: string; thumbnail?: string }
export type Suggested = {
  id: string; name: string; handle?: string; avatar?: string
  /** home page reads it came up in */
  n: number
  first: number
  last: number
  videos: SuggestedVideo[]
  /** 0.13.0: your channels that feature it (their id and name), at most MAX_BY */
  by?: FeaturedBy[]
  /** 0.13.0: its subscribers, when a featured shelf said */
  subscribers?: number
}
export type FeaturedBy = { id: string; name: string }
export type Discover = {
  version: 1; channels: Record<string, Suggested>; hidden: string[]
  /** 0.13.0: when each of your channels' featured channels were last read */
  featuredRead?: Record<string, number>
  /** 0.13.3: your channels whose features you hid (Hide all featured by …): a channel only they feature isn't shown */
  hiddenBy?: FeaturedBy[]
}
export const MAX_BY = 8
/** A channel's featured channels read again after a month. */
export const FEATURED_AGAIN_MS = 30 * 86400_000
const MAX_FEATURED_READ = 2000

const CHANNEL_ID = /^UC[\w-]{22}$/
const HANDLE = /^@[\w.-]{1,100}$/
const VIDEO_ID = /^[\w-]{6,20}$/
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined)
const https = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') && v.length < 2000 ? v : undefined)

export function emptyDiscover(): Discover {
  return { version: 1, channels: {}, hidden: [] }
}

/** A suggested channel's key: its channel id, else its handle. */
export function keyOf(v: Pick<Video, 'channelId' | 'channelHandle'>): string | null {
  if (v.channelId && CHANNEL_ID.test(v.channelId)) return v.channelId
  if (v.channelHandle && HANDLE.test(v.channelHandle)) return v.channelHandle.toLowerCase()
  return null
}

/** Its page on YouTube (its videos). */
export function channelUrl(s: Pick<Suggested, 'id' | 'handle'>): string {
  if (s.handle && HANDLE.test(s.handle)) return `https://www.youtube.com/${s.handle}/videos`
  return CHANNEL_ID.test(s.id) ? `https://www.youtube.com/channel/${s.id}/videos` : `https://www.youtube.com/${s.id}/videos`
}

export function readDiscover(raw: unknown): Discover {
  const out = emptyDiscover()
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1) return out
  const r = raw as any
  if (Array.isArray(r.hidden)) out.hidden = [...new Set<string>(r.hidden.filter((x: unknown): x is string => typeof x === 'string' && (CHANNEL_ID.test(x) || HANDLE.test(x))))].slice(-MAX_HIDDEN)
  if (r.channels && typeof r.channels === 'object') {
    for (const [id, c] of Object.entries(r.channels as Record<string, any>).slice(0, MAX_SUGGESTED)) {
      if (!(CHANNEL_ID.test(id) || HANDLE.test(id)) || !c || typeof c !== 'object') continue
      const name = str(c.name, 200)
      if (!name || !num(c.n) || !num(c.first) || !num(c.last)) continue
      const videos: SuggestedVideo[] = Array.isArray(c.videos)
        ? c.videos.filter((v: any) => v && typeof v.id === 'string' && VIDEO_ID.test(v.id) && str(v.title, 300)).slice(0, SUGGESTED_VIDEOS)
          .map((v: any) => ({ id: v.id, title: v.title, ...(https(v.thumbnail) ? { thumbnail: v.thumbnail } : {}) }))
        : []
      const by: FeaturedBy[] = Array.isArray(c.by)
        ? c.by.filter((b: any) => b && typeof b.id === 'string' && CHANNEL_ID.test(b.id) && str(b.name, 200)).slice(0, MAX_BY).map((b: any) => ({ id: b.id, name: b.name }))
        : []
      if (c.n < 1 && !by.length) continue
      out.channels[id] = {
        id, name, n: c.n, first: c.first, last: c.last, videos,
        ...(by.length ? { by } : {}),
        ...(num(c.subscribers) && c.subscribers >= 0 ? { subscribers: c.subscribers } : {}),
        ...(str(c.handle, 101) && HANDLE.test(c.handle) ? { handle: c.handle } : {}),
        ...(https(c.avatar) ? { avatar: c.avatar } : {}),
      }
    }
  }
  if (Array.isArray(r.hiddenBy)) {
    out.hiddenBy = r.hiddenBy.filter((b: any) => b && typeof b.id === 'string' && CHANNEL_ID.test(b.id) && str(b.name, 200))
      .slice(-MAX_HIDDEN).map((b: any) => ({ id: b.id, name: b.name }))
  }
  if (r.featuredRead && typeof r.featuredRead === 'object') {
    const fr: Record<string, number> = {}
    for (const [id, at] of Object.entries(r.featuredRead as Record<string, unknown>).slice(0, MAX_FEATURED_READ)) if (CHANNEL_ID.test(id) && num(at)) fr[id] = at
    out.featuredRead = fr
  }
  return out
}

export type FeaturedChannel = { id: string; name: string; handle?: string; avatar?: string; subscribers?: number }

/**
 * 0.13.0: what one of your channels features (its whole shelf, as just read): each one you don't follow gets this
 * channel in its `by`; a channel it no longer features loses it (and goes when nothing else keeps it). True: changed.
 */
export function noteFeatured(doc: Discover, by: FeaturedBy, list: FeaturedChannel[], followed: (f: FeaturedChannel) => boolean, now: number): boolean {
  doc.featuredRead = { ...(doc.featuredRead ?? {}), [by.id]: now }
  const ids = Object.keys(doc.featuredRead)
  if (ids.length > MAX_FEATURED_READ) for (const id of ids.sort((a, b) => doc.featuredRead![a] - doc.featuredRead![b]).slice(0, ids.length - MAX_FEATURED_READ)) delete doc.featuredRead[id]
  let changed = true // featuredRead itself
  const keys = new Set<string>()
  for (const f of list) {
    if (f.id === by.id || followed(f) || !str(f.name, 200)) continue
    const key = CHANNEL_ID.test(f.id) ? f.id : f.handle && HANDLE.test(f.handle) ? f.handle.toLowerCase() : null
    if (!key) continue
    keys.add(key)
    const known = doc.channels[key]
    const others = (known?.by ?? []).filter(b => b.id !== by.id)
    doc.channels[key] = {
      id: key, name: f.name.slice(0, 200),
      ...(f.handle && HANDLE.test(f.handle) ? { handle: f.handle } : known?.handle ? { handle: known.handle } : {}),
      ...(https(f.avatar) ? { avatar: f.avatar } : known?.avatar ? { avatar: known.avatar } : {}),
      n: known?.n ?? 0, first: known?.first ?? now, last: known && !known.by?.some(b => b.id === by.id) ? now : known?.last ?? now,
      videos: known?.videos ?? [],
      by: [{ id: by.id, name: by.name.slice(0, 200) }, ...others].slice(0, MAX_BY),
      ...(num(f.subscribers) ? { subscribers: f.subscribers } : known?.subscribers !== undefined ? { subscribers: known.subscribers } : {}),
    }
  }
  // No longer featured by it
  for (const [key, c] of Object.entries(doc.channels)) {
    if (keys.has(key) || !c.by?.some(b => b.id === by.id)) continue
    const rest = c.by.filter(b => b.id !== by.id)
    if (!rest.length && c.n < 1) delete doc.channels[key]
    else doc.channels[key] = { ...c, ...(rest.length ? { by: rest } : { by: undefined }) }
  }
  trim(doc)
  return changed
}

/** 0.13.0: the next of your channels (in this order) whose featured channels are due: never read, or a month ago. */
export function featuredNext(doc: Discover, order: string[], skip: (id: string) => boolean, now: number): string | null {
  let stale: string | null = null
  let staleAt = Infinity
  for (const id of order) {
    if (!CHANNEL_ID.test(id) || skip(id)) continue
    const at = doc.featuredRead?.[id]
    if (at === undefined) return id
    if (now - at > FEATURED_AGAIN_MS && at < staleAt) { stale = id; staleAt = at }
  }
  return stale
}

function trim(doc: Discover) {
  const all = Object.values(doc.channels)
  if (all.length <= MAX_SUGGESTED) return
  const keep = new Set(rank(all).slice(0, MAX_SUGGESTED).map(s => s.id))
  for (const id of Object.keys(doc.channels)) if (!keep.has(id)) delete doc.channels[id]
}

/**
 * What a home page read suggests: the channels of its videos that you don't follow, each counted once for this read,
 * its latest videos kept (a channel whose videos are all known already isn't counted again: the same page read twice).
 * The least seen and oldest are let go past MAX_SUGGESTED. True: something changed.
 */
export function noteSuggested(doc: Discover, list: Video[], followed: (v: Video) => boolean, now: number): boolean {
  const thisRead = new Map<string, Video[]>()
  for (const v of list) {
    if (followed(v) || !v.channelName) continue
    const key = keyOf(v)
    if (!key) continue
    thisRead.set(key, [...(thisRead.get(key) ?? []), v])
  }
  let changed = false
  for (const [key, vs] of thisRead) {
    const v0 = vs[0]
    const known = doc.channels[key]
    const fresh: SuggestedVideo[] = vs.map(v => ({ id: v.id, title: v.title, ...(v.thumbnail ? { thumbnail: v.thumbnail } : {}) }))
    // A read that brings nothing new for it (GEM Shell's kept copy of the same page) doesn't count it again
    const isNew = !known || fresh.some(f => !known.videos.some(k => k.id === f.id))
    if (!isNew) continue
    changed = true
    const videos = [...fresh, ...(known?.videos ?? []).filter(x => !fresh.some(f => f.id === x.id))].slice(0, SUGGESTED_VIDEOS)
    doc.channels[key] = {
      id: key,
      name: v0.channelName!.slice(0, 200),
      ...(v0.channelHandle && HANDLE.test(v0.channelHandle) ? { handle: v0.channelHandle } : known?.handle ? { handle: known.handle } : {}),
      ...(https(v0.channelAvatar) ? { avatar: v0.channelAvatar } : known?.avatar ? { avatar: known.avatar } : {}),
      n: (known?.n ?? 0) + 1,
      first: known?.first ?? now,
      last: now,
      videos,
      ...(known?.by?.length ? { by: known.by } : {}),
      ...(known?.subscribers !== undefined ? { subscribers: known.subscribers } : {}),
    }
  }
  trim(doc)
  return changed
}

/** 0.13.0: a feature by one of your channels counts as 3 suggestions (a creator's own pick). */
export const scoreOf = (s: Suggested) => s.n + 3 * (s.by?.length ?? 0)
/** The highest score first (suggested often, featured by your channels), then the most recently. */
function rank(list: Suggested[]): Suggested[] {
  return [...list].sort((a, b) => scoreOf(b) - scoreOf(a) || b.last - a.last || a.name.localeCompare(b.name))
}

/**
 * The channels to show: not hidden, not followed (you may have followed one since), ranked. 0.13.3: a channel's `by`
 * without the creators whose features you hid; one that's left with no reason (never suggested) isn't shown.
 */
export function suggested(doc: Discover, follows: (s: Suggested) => boolean): Suggested[] {
  const hidden = new Set(doc.hidden)
  const hiddenBy = new Set((doc.hiddenBy ?? []).map(b => b.id))
  const shown = Object.values(doc.channels)
    .filter(s => !hidden.has(s.id) && !follows(s))
    .map(s => (s.by?.some(b => hiddenBy.has(b.id)) ? { ...s, by: s.by.filter(b => !hiddenBy.has(b.id)) } : s))
    .filter(s => s.n > 0 || (s.by?.length ?? 0) > 0)
  return rank(shown)
}

/** 0.13.3: Hide all featured by one of your channels (now and later). */
export function hideFeaturedBy(doc: Discover, by: FeaturedBy): void {
  const list = (doc.hiddenBy ?? []).filter(b => b.id !== by.id)
  doc.hiddenBy = [...list, { id: by.id, name: by.name.slice(0, 200) }].slice(-MAX_HIDDEN)
}

/** How many hidings there are (channels, and creators whose features are hidden). */
export const hiddenCount = (doc: Discover) => doc.hidden.length + (doc.hiddenBy?.length ?? 0)

export function hide(doc: Discover, id: string): void {
  if (!doc.hidden.includes(id)) doc.hidden.push(id)
  if (doc.hidden.length > MAX_HIDDEN) doc.hidden.splice(0, doc.hidden.length - MAX_HIDDEN)
}

export function unhideAll(doc: Discover): void {
  doc.hidden = []
  doc.hiddenBy = []
}
