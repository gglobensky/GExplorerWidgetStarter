// GEM YT 0.3.3 (2026-11-23): your own aisles. Groups you make of the channels you follow (Gaming, Cooking, Tech), a
// channel in as many as you like: YouTube has no folders for subscriptions. Kept in one document of the widget type
// (sdk.configWrite 'gem-yt-aisles': every copy sees the same aisles; each copy remembers which one it shows). Pure.

export const AISLES_DOC = 'gem-yt-aisles'
export const MAX_AISLES = 40
export const MAX_NAME = 40

export type Aisle = { id: string; name: string; channels: string[] }
export type Aisles = { version: 1; aisles: Aisle[] }

const ID = /^[\w-]{1,64}$/
const AISLE_ID = /^a[0-9a-z]{1,16}$/

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
}

export function readAisles(raw: unknown): Aisles {
  const out: Aisles = { version: 1, aisles: [] }
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1 || !Array.isArray((raw as any).aisles)) return out
  const seen = new Set<string>()
  for (const a of (raw as any).aisles.slice(0, MAX_AISLES)) {
    const name = cleanName(a?.name)
    if (!name || typeof a?.id !== 'string' || !AISLE_ID.test(a.id) || seen.has(a.id)) continue
    seen.add(a.id)
    const channels: string[] = Array.isArray(a.channels) ? [...new Set<string>(a.channels.filter((c: unknown): c is string => typeof c === 'string' && ID.test(c)))] : []
    out.aisles.push({ id: a.id, name, channels })
  }
  return out
}

/** A new aisle (null: no name, or too many aisles already). */
export function addAisle(doc: Aisles, name: string, now = Date.now()): Aisle | null {
  const n = cleanName(name)
  if (!n || doc.aisles.length >= MAX_AISLES) return null
  let id = 'a' + now.toString(36)
  while (doc.aisles.some(a => a.id === id)) id = 'a' + (++now).toString(36)
  const aisle = { id, name: n, channels: [] }
  doc.aisles.push(aisle)
  return aisle
}

export function renameAisle(doc: Aisles, id: string, name: string): boolean {
  const a = doc.aisles.find(x => x.id === id)
  const n = cleanName(name)
  if (!a || !n) return false
  a.name = n
  return true
}

export function removeAisle(doc: Aisles, id: string): boolean {
  const i = doc.aisles.findIndex(x => x.id === id)
  if (i < 0) return false
  doc.aisles.splice(i, 1)
  return true
}

/** Puts the channel in the aisle, or takes it out; true: it's in now. */
export function toggleChannel(doc: Aisles, id: string, channelId: string): boolean {
  const a = doc.aisles.find(x => x.id === id)
  if (!a || !ID.test(channelId)) return false
  const i = a.channels.indexOf(channelId)
  if (i >= 0) { a.channels.splice(i, 1); return false }
  a.channels.push(channelId)
  return true
}
