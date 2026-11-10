export const BUGLE_SECTIONS = [
  'latest',
  'world',
  'local',
  'business',
  'technology',
  'science',
  'culture',
  'sports',
  'opinion',
] as const

export type BugleSection = typeof BUGLE_SECTIONS[number]
export type SourceSection = BugleSection | 'auto'
export type SourceDisplay = 'headlines' | 'summary'

export type BugleSource = {
  id: string
  feedUrl: string
  siteUrl?: string
  title: string
  customTitle?: boolean
  description?: string
  language?: string
  section: SourceSection
  display: SourceDisplay
  enabled: boolean
  addedAt: number
  lastFetchedAt?: number
  lastCheckedAt?: number
  lastItemCount?: number
  lastError?: string
}

export type FeedItem = {
  id: string
  title: string
  url: string
  publishedAt?: number
  author?: string
  summary?: string
  categories: string[]
  imageUrl?: string
}

export type FeedDocument = {
  feedUrl: string
  siteUrl?: string
  title: string
  description?: string
  language?: string
  items: FeedItem[]
}

export type SourceCandidate = {
  feed: FeedDocument
  discoveredAs?: string
}

export type BugleItem = FeedItem & {
  sourceId: string
  sourceTitle: string
  section: BugleSection
  display: SourceDisplay
}

export type SourceDocument = {
  version: 1
  sources: BugleSource[]
}

export function sectionLabel(section: BugleSection): string {
  return section === 'technology'
    ? 'Technology'
    : section.charAt(0).toUpperCase() + section.slice(1)
}
