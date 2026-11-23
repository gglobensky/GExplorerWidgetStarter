// GEM YT 0.2.0: what sdk.pageData('youtube') gives (its rules: rules/youtube.json), as library-ui's racks and boxes.
// Pure: no SDK, no Vue (tests can load it).
import type { LibraryItem, LibraryShelf } from '@shared/library-ui'

/** A subscription (the rules' "channel" item). */
export type Channel = { id: string; name: string; handle?: string; avatar?: string; subscribers?: number; videos?: number; verified?: boolean }
/** A video (the rules' "video" item). */
export type Video = {
  id: string; title: string; thumbnail?: string; length?: number; live?: boolean; published?: string
  publishedText?: string; views?: number; watched?: number
}
/** A box on GEM YT's shelves. */
export type YtVideo = LibraryItem & { length?: number; live?: boolean; watched?: number; views?: number; publishedText?: string; channelId: string }

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export function channelOf(it: Record<string, unknown>): Channel | null {
  const id = str(it.id), name = str(it.name)
  if (!id || !name) return null
  return { id, name, handle: str(it.handle), avatar: str(it.avatar), subscribers: num(it.subscribers), videos: num(it.videos), verified: it.verified === true }
}

export function videoOf(it: Record<string, unknown>): Video | null {
  const id = str(it.id), title = str(it.title)
  if (!id || !/^[\w-]{6,20}$/.test(id) || !title) return null
  return { id, title, thumbnail: str(it.thumbnail), length: num(it.length), live: it.live === true, published: str(it.published), publishedText: str(it.publishedText), views: num(it.views), watched: num(it.watched) }
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

export function boxOf(v: Video, channel: Channel, rank: number, thumb: string | undefined): YtVideo {
  const year = v.published ? new Date(v.published).getFullYear() : 0
  return {
    id: v.id, title: v.title, year: Number.isFinite(year) ? year : 0, primaryGenre: channel.name, genres: [], synopsis: '',
    artwork: thumb ? { src: thumb, x: 50, y: 50, mode: 'cover' } : { src: '', x: 50, y: 50, mode: 'placeholder' },
    addedRank: rank, channelId: channel.id,
    length: v.length, live: v.live, watched: v.watched, views: v.views, publishedText: v.publishedText,
  }
}

/** The line on a box's band: "3 days ago · 1.2K views" (live: "Live · 3K watching"). */
export function captionOf(v: YtVideo): string {
  const parts: string[] = []
  if (v.live) parts.push('Live')
  else if (v.publishedText) parts.push(v.publishedText)
  if (v.views !== undefined) parts.push(`${compact(v.views)} ${v.live ? 'watching' : v.views === 1 ? 'view' : 'views'}`)
  return parts.join(' · ')
}

/** A channel's rack: its poster (its avatar, its subscribers), its videos once read. */
export function shelfOf(c: Channel, boxes: YtVideo[] | undefined, avatar: string | undefined): LibraryShelf<YtVideo> {
  return {
    id: c.id,
    title: c.name,
    note: boxes ? `${boxes.length} latest ${boxes.length === 1 ? 'video' : 'videos'}` : 'Stocking shelves…',
    items: boxes ?? [],
    poster: { src: avatar ?? '', round: true, caption: c.subscribers !== undefined ? `${compact(c.subscribers)} subscribers` : undefined },
  }
}
