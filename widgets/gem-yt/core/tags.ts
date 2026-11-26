// GEM YT 0.4.0 (2026-11-24): your tags. Labels you put on the channels you follow (Gaming, Cooking, Tech), a channel
// with as many as you like: YouTube has no folders for subscriptions. They were the racks' aisles (0.3.3, aisles.ts):
// the same document of the widget type and the same stored shape ('gem-yt-aisles', { version: 1, aisles: [...] }),
// so the aisles you made are your tags, with nothing to move. Every copy sees the same tags (sdk.configWrite); each
// copy remembers which one it shows. Pure.
// 2026-11-26 (0.23.0): one kind of tag. A tag also holds, by itself, the channels whose creators use its name as one of
// their channel's keywords (their own tag: "gaming"); you can take one of those out (`out`, kept) or put any channel
// in by hand (`channels`). withCreators gives the tags as shown.

import { normalize } from './topics'

/** The document's name stays the aisles' (what's saved is the same). */
export const TAGS_DOC = 'gem-yt-aisles'
export const MAX_TAGS = 40
export const MAX_NAME = 40

export type Tag = { id: string; name: string; channels: string[]; out?: string[] }
/** As stored: `aisles` is the tags (the aisles' name kept: nothing to migrate). */
export type Tags = { version: 1; aisles: Tag[] }

const ID = /^[\w-]{1,64}$/
const TAG_ID = /^a[0-9a-z]{1,16}$/

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
}

export function readTags(raw: unknown): Tags {
  const out: Tags = { version: 1, aisles: [] }
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1 || !Array.isArray((raw as any).aisles)) return out
  const seen = new Set<string>()
  for (const a of (raw as any).aisles.slice(0, MAX_TAGS)) {
    const name = cleanName(a?.name)
    if (!name || typeof a?.id !== 'string' || !TAG_ID.test(a.id) || seen.has(a.id)) continue
    seen.add(a.id)
    const channels: string[] = Array.isArray(a.channels) ? [...new Set<string>(a.channels.filter((c: unknown): c is string => typeof c === 'string' && ID.test(c)))] : []
    const taken: string[] = Array.isArray(a.out) ? [...new Set<string>(a.out.filter((c: unknown): c is string => typeof c === 'string' && ID.test(c)))] : []
    out.aisles.push({ id: a.id, name, channels, ...(taken.length ? { out: taken } : {}) })
  }
  return out
}

/** A new tag (null: no name, or too many tags already). */
export function addTag(doc: Tags, name: string, now = Date.now()): Tag | null {
  const n = cleanName(name)
  if (!n || doc.aisles.length >= MAX_TAGS) return null
  let id = 'a' + now.toString(36)
  while (doc.aisles.some(a => a.id === id)) id = 'a' + (++now).toString(36)
  const tag = { id, name: n, channels: [] }
  doc.aisles.push(tag)
  return tag
}

export function renameTag(doc: Tags, id: string, name: string): boolean {
  const a = doc.aisles.find(x => x.id === id)
  const n = cleanName(name)
  if (!a || !n) return false
  a.name = n
  return true
}

export function removeTag(doc: Tags, id: string): boolean {
  const i = doc.aisles.findIndex(x => x.id === id)
  if (i < 0) return false
  doc.aisles.splice(i, 1)
  return true
}

/** Puts the tag on the channel, or takes it off; true: it's on now. */
export function toggleTag(doc: Tags, id: string, channelId: string): boolean {
  const a = doc.aisles.find(x => x.id === id)
  if (!a || !ID.test(channelId)) return false
  const i = a.channels.indexOf(channelId)
  if (i >= 0) { a.channels.splice(i, 1); return false }
  a.channels.push(channelId)
  return true
}

/** The tags as shown, and per tag the channels its creators' keywords put in it. */
export type ShownTags = Tags & { auto: Map<string, Set<string>> }

/**
 * Each tag with the channels you put in it and those whose creators use its name as a keyword (normalized: "Games"
 * finds "game"), less the ones you took out. keywordsOf: a channel's keywords as read (normalized), if read yet.
 */
export function withCreators(doc: Tags, keywordsOf: (channelId: string) => readonly string[] | undefined, channelIds: readonly string[]): ShownTags {
  const auto = new Map<string, Set<string>>()
  const aisles = doc.aisles.map(a => {
    const term = normalize(a.name)
    const mine = new Set<string>()
    if (term) for (const id of channelIds) if (keywordsOf(id)?.includes(term)) mine.add(id)
    auto.set(a.id, mine)
    const out = new Set(a.out ?? [])
    const channels = [...new Set([...a.channels, ...mine])].filter(id => !out.has(id))
    return { ...a, channels }
  })
  return { version: 1, aisles, auto }
}

/** Puts a channel in a tag (on) or takes it out, whichever way it got there (`auto`: its creator's keyword). */
export function setMember(doc: Tags, id: string, channelId: string, on: boolean, auto: boolean): boolean {
  const a = doc.aisles.find(x => x.id === id)
  if (!a || !ID.test(channelId)) return false
  const manual = a.channels.indexOf(channelId)
  const out = new Set(a.out ?? [])
  if (on) {
    out.delete(channelId)
    if (!auto && manual < 0) a.channels.push(channelId)
  } else {
    if (manual >= 0) a.channels.splice(manual, 1)
    if (auto) out.add(channelId)
  }
  if (out.size) a.out = [...out]
  else delete a.out
  return true
}

/** A tag by its name (normalized: "Gaming" is "gaming"). */
export function tagNamed(doc: Tags, name: string): Tag | undefined {
  const n = normalize(name)
  return n ? doc.aisles.find(a => normalize(a.name) === n) : undefined
}

/** A channel's tags, in the tags' order. */
export function tagsOf(doc: Tags, channelId: string): Tag[] {
  return doc.aisles.filter(a => a.channels.includes(channelId))
}
