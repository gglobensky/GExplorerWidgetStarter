// widgets/game-library/art-memory.ts
//
// The pictures remembered between starts (0.20.0, Guillaume 2026-11-02: "Let's save those pictures!"). GEM Shell
// keeps the images themselves (its cache room) and their addresses stay the same ("/wasset/<id>.<ext>", served
// only to this widget); what was lost at each start was which picture went with which box, so every box asked again,
// six at a time. Now that is kept in its own document (sdk.configWrite 'game-library-art'): at the next start the boxes
// show their pictures at once, each checked in the background (an address the cache let go is made again).
//
// Kept for each picture: its address, its size (px), when it was made, and a short hash of the source it was made
// from (never the source itself: no paths or urls in this document), so a picture whose source changed is made
// again. Not kept: the covers of IGDB's search ('pick:'), only for the moment. At most MAX_PICTURES, the newest.
// Pure (tested: tests/art-memory.test.ts).

export const ART_DOC = 'game-library-art'
export const MAX_PICTURES = 5000

export type SavedPicture = { url: string; from: string; width: number; height: number; at: number }
export type ArtMemory = { version: 1; pictures: Record<string, SavedPicture> }

/** Only GEM Shell's image addresses (anything else in the document is left out). */
const ASSET_URL = /^\/wasset\/[0-9a-f]{32}\.(?:jpg|png)$/
const KEY = /^[a-z-]+:[^\n]{1,300}$/
const HASH = /^[0-9a-f]{8}$/

/** A short hash of a picture's source (FNV-1a, 32 bits): which source, without keeping it. */
export function sourceHash(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Whether a picture of this key is remembered (IGDB's search covers are not). */
export const keepsKey = (key: string) => !key.startsWith('pick:')

const size = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 4096

/** What was saved, checked: anything that doesn't fit is left out (never a reason to fail). */
export function normalizeArt(raw: unknown): ArtMemory {
  const out: ArtMemory = { version: 1, pictures: {} }
  const pictures = (raw as { pictures?: unknown } | null)?.pictures
  if (!pictures || typeof pictures !== 'object' || Array.isArray(pictures)) return out
  for (const [key, p] of Object.entries(pictures as Record<string, unknown>)) {
    const v = p as Partial<SavedPicture> | null
    if (!KEY.test(key) || !keepsKey(key) || !v || typeof v !== 'object') continue
    if (typeof v.url !== 'string' || !ASSET_URL.test(v.url)) continue
    if (typeof v.from !== 'string' || !HASH.test(v.from)) continue
    if (!size(v.width) || !size(v.height)) continue
    out.pictures[key] = { url: v.url, from: v.from, width: v.width!, height: v.height!, at: typeof v.at === 'number' && v.at > 0 ? v.at : 0 }
  }
  return trim(out)
}

/** At most MAX_PICTURES: the newest kept. */
export function trim(doc: ArtMemory, max = MAX_PICTURES): ArtMemory {
  const keys = Object.keys(doc.pictures)
  if (keys.length <= max) return doc
  const kept = keys.sort((a, b) => doc.pictures[b].at - doc.pictures[a].at).slice(0, max)
  return { version: 1, pictures: Object.fromEntries(kept.map(k => [k, doc.pictures[k]])) }
}

/** <doc> with these pictures added (or replaced) and these keys forgotten. */
export function withChanges(doc: ArtMemory, made: Record<string, SavedPicture>, gone: Iterable<string>): ArtMemory {
  const pictures = { ...doc.pictures }
  for (const key of gone) delete pictures[key]
  for (const [key, p] of Object.entries(made)) if (keepsKey(key) && ASSET_URL.test(p.url)) pictures[key] = p
  return trim({ version: 1, pictures })
}

/** The source among <sources> a remembered picture was made from, or undefined (its source went). */
export function matchingSource(saved: SavedPicture, sources: string[]): string | undefined {
  return sources.find(s => sourceHash(s) === saved.from)
}
