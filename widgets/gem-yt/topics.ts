// GEM YT 0.3.5 (2026-11-23): what your channels are about, from the creators' own words: the keywords a creator gives
// its channel (its page's metadata, read with its videos: no extra request) and the description (the subscriptions
// list's snippet at once, the full one once the channel is read). For searching your channels, a topic filter, and
// "make an aisle of these". Keywords are the creator's own and often noisy: suggestions, never truth. Pure.

/** Words that say nothing about a channel's topic. */
const STOP = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'his', 'her', 'its', 'from', 'this', 'that', 'are', 'was', 'not', 'all', 'any',
  'youtube', 'youtuber', 'video', 'channel', 'subscribe', 'new', 'best', 'top', 'official', 'free', 'online', 'daily',
  'weekly', 'hd', '4k', 'live', 'stream', 'streamer', 'streaming', 'content', 'creator', 'shorts', 'short', 'clip',
  'episode', 'part', 'full', 'show', 'watch', 'like', 'more', 'my', 'me', 'les', 'des', 'une', 'pour', 'avec', 'et', 'de', 'la', 'le',
])

/** A term, plain: lower case, outer punctuation off, plural "s" off (games -> game; not "chess", not short words). */
export function normalize(raw: string): string {
  let t = raw.toLowerCase().replace(/[​-‍﻿]/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ').trim()
  if (t.length > 4 && /[a-z]s$/.test(t) && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1)
  return t
}

/** A channel's keywords as YouTube keeps them: words, and "quoted phrases"; plain, without stop words. 30 at most. */
export function parseKeywords(raw: string | undefined): string[] {
  if (!raw) return []
  const out = new Set<string>()
  for (const m of raw.matchAll(/"([^"]{1,60})"|(\S{1,40})/g)) {
    const t = normalize(m[1] ?? m[2] ?? '')
    if (t.length < 3 || t.length > 40 || /^\d+$/.test(t) || STOP.has(t)) continue
    out.add(t)
    if (out.size >= 30) break
  }
  return [...out]
}

export type Topic = { term: string; channels: string[] }

/**
 * The topics your channels share: each term with the channels whose keywords have it, the most shared first; only
 * terms two channels share at least, and not a term nearly every channel has (it says nothing). MAX_TOPICS at most.
 */
export const MAX_TOPICS = 30
export function topicsOf(keywords: Map<string, string[]>): Topic[] {
  const by = new Map<string, Set<string>>()
  for (const [id, terms] of keywords) for (const t of terms) (by.get(t) ?? by.set(t, new Set()).get(t)!).add(id)
  const total = keywords.size
  return [...by]
    .filter(([, ids]) => ids.size >= 2 && (total < 10 || ids.size < total * 0.6))
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_TOPICS)
    .map(([term, ids]) => ({ term, channels: [...ids] }))
}

/** Search: every word of the query found somewhere in the text (lower case, accents kept). */
export function matches(query: string, text: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = text.toLowerCase()
  return words.every(w => hay.includes(w))
}
