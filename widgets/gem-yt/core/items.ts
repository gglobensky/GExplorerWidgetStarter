// GEM YT 0.4.0 (2026-11-24): what sdk.pageData('youtube') gives (its rules: rules/youtube.json), plain: channels and
// videos, and the few words GEM YT's parts all use.
// Pure: no SDK, no Vue (tests can load it).

/** A subscription (the rules' "channel" item). */
export type Channel = {
  id: string; name: string; handle?: string; avatar?: string; subscribers?: number; videos?: number; verified?: boolean
  /** 0.3.5: the subscriptions list's snippet of its description (search, topics) */
  description?: string
}
/** A video (the rules' "video" item). */
export type Video = {
  id: string; title: string; thumbnail?: string; length?: number; live?: boolean; published?: string
  publishedText?: string; views?: number; watched?: number
  /** 0.2.4: on a feed (your subscriptions' latest, You may like): whose it is. */
  channelId?: string; channelHandle?: string; channelName?: string
  /** 0.4.0: its channel's avatar (a feed's video; Discover) */
  channelAvatar?: string
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export function channelOf(it: Record<string, unknown>): Channel | null {
  const id = str(it.id), name = str(it.name)
  if (!id || !name) return null
  return { id, name, handle: str(it.handle), avatar: str(it.avatar), subscribers: num(it.subscribers), videos: num(it.videos), verified: it.verified === true, description: str(it.description)?.slice(0, 300) }
}

export function videoOf(it: Record<string, unknown>): Video | null {
  const id = str(it.id), title = str(it.title)
  if (!id || !/^[\w-]{6,20}$/.test(id) || !title) return null
  return { id, title, thumbnail: str(it.thumbnail), length: num(it.length), live: it.live === true, published: str(it.published), publishedText: str(it.publishedText), views: num(it.views), watched: num(it.watched), channelId: str(it.channelId), channelHandle: str(it.channelHandle), channelName: str(it.channelName), channelAvatar: str(it.channelAvatar) }
}

/** The channel page's parameter: its handle, else channel/<id>. */
export function channelParam(c: Channel): string | null {
  if (c.handle && /^@[\w.-]{1,100}$/.test(c.handle)) return c.handle
  if (/^UC[\w-]{22}$/.test(c.id)) return `channel/${c.id}`
  return null
}

/** "1.2K", "3.4M" */
export function compact(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`
  return String(n)
}

/** 754 -> "12:34", 3723 -> "1:02:03" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** 0.3.0: how long ago, short: "today", "3d ago", "2w ago", "5mo ago", "2y ago". */
export function agoShort(ms: number, now = Date.now()): string {
  const d = Math.floor((now - ms) / 86_400_000)
  if (d < 1) return 'today'
  if (d < 14) return `${d}d ago`
  if (d < 60) return `${Math.floor(d / 7)}w ago`
  if (d < 730) return `${Math.floor(d / 30.4)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

/** 0.3.1: videos a week, in words: "~2/wk", "~3/mo"; '' when rarer or not known. */
export function rateText(perWeek: number | undefined): string {
  if (perWeek === undefined) return ''
  if (perWeek >= 0.95) return `~${Math.round(perWeek)}/wk`
  const month = perWeek * 4.35
  return month >= 0.95 ? `~${Math.round(month)}/mo` : ''
}

/** What the ledger says of a channel (its latest upload, rhythm, chart, a sticker, faded). */
export type PosterInfo = { latest?: number; perWeek?: number; bars?: Array<number | null>; flag?: string; dim?: boolean }

/** 0.2.4: YouTube's own lists (your subscriptions' latest, your home page): Feed's sections. */
export const FEEDS = [
  { id: 'feed:subscriptions', page: 'subscription-feed', title: 'Fresh from your subscriptions' },
  { id: 'feed:home', page: 'home', title: 'You may like' },
] as const
export type FeedId = (typeof FEEDS)[number]['id']
