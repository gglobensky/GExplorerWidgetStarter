// GEM YT 0.4.0 (2026-11-24): what the parts draw, plain (Widget.vue makes them from what it read and remembers).

/** A creator's tile (Creators). Pictures are GEM Shell's addresses (/wasset/…), once made. */
export type CreatorCard = {
  id: string
  name: string
  handle?: string
  avatar?: string
  banner?: string
  /** its banner is on its way (a shimmer, not the plain gradient) */
  bannerComing?: boolean
  subscribers?: number
  /** its latest upload (ms) */
  latest?: number
  /** "~2/wk" */
  rate?: string
  /** videos a week, oldest first, 0 to 1 (null: a week not known) */
  bars?: Array<number | null>
  /** "Overdue", "Quiet 8 mo" */
  flag?: string
  /** quiet (Settings: Quiet after): a dusty tile */
  dim?: boolean
  /** 0.4.1: inactive, two years and more without a video: a ghost of a tile */
  ghost?: boolean
  /** its topics (the creator's own keywords that your channels share), a few */
  topics: string[]
  tags: Array<{ id: string; name: string }>
  /** being read now */
  reading?: boolean
}

/** A suggested channel's tile (Discover). */
export type DiscoverCard = {
  id: string
  name: string
  handle?: string
  avatar?: string
  /** home page reads it came up in */
  count: number
  last: number
  videos: Array<{ id: string; title: string; thumbnail?: string }>
  /** 0.13.0: your channels that feature it (0.13.3: with their ids, for Hide all featured by …) */
  featuredBy?: Array<{ id: string; name: string }>
  /** 0.13.3: your tags on the channels that feature it (no read: borrowed from them), each with who it's from */
  tags?: Array<{ name: string; from: string }>
  /** 0.13.0: its subscribers, when known */
  subscribers?: number
}

/** GEM YT 1.0, part 2 (2026-11-24): a video's card (Feed). Its picture is GEM Shell's address (/wasset/…), once made. */
export type VideoCard = {
  id: string
  title: string
  thumb?: string
  /** its picture is on its way (a shimmer) */
  coming?: boolean
  length?: number
  live?: boolean
  /** watched, 0 to 100 */
  watched?: number
  channelName?: string
  /** the channel's avatar, once made */
  avatar?: string
  /** "3d ago · 12K views" */
  line?: string
  /** one of your channels (Latest, Since): its id, to open its videos */
  channelId?: string
}

/** A Feed section: its videos, a few words, and how it stands. */
export type FeedSection = { id: string; title: string; note?: string; cards: VideoCard[]; empty: string; reading?: boolean }
