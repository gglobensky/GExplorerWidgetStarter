// widgets/game-library/library-store.ts
//
// What the Game Library keeps for the user (sdk.configRead / configWrite, one document per widget type):
//   manual     the games they added by hand (an exe or a shortcut, the title they gave)
//   played     when they last started each game from here (Steam says it itself; the other stores don't)
//   preferred  the store Play uses for a game found in several
//   edits      the genres and descriptions the user wrote (0.5.0), over what Steam says
//   quips      the line picked for each game's play time (0.10.1, playtime-quips.ts), kept until its next milestone
//   links      the IGDB game the user linked a box to by hand (0.11.1): its details and its name win over the guesses
import { STORES, type StoreId } from './games.ts'
import { MILESTONES, type KeptQuip, type Milestone } from './playtime-quips.ts'

export const LIBRARY_DOC = 'game-library'

export type LibraryDoc = {
  version: 1
  manual: Array<{ path: string; title?: string }>
  played: Record<string, number>
  preferred: Record<string, StoreId>
  edits: Record<string, GameEdits>
  quips?: Record<string, KeptQuip>
  links?: Record<string, GameLink>
}

/** A box linked by hand to IGDB's game (0.11.1). */
export type GameLink = { igdbId: number; name: string }

export type GameEdits = { synopsis?: string; genres?: string[] }
/** A change to a game's edits: a field null goes back to what Steam says. */
export type GameEdit = { synopsis?: string | null; genres?: string[] | null }

export type ConfigPort = {
  configRead?: <T = unknown>(name: string) => Promise<T | null>
  configWrite?: (name: string, data: unknown) => Promise<void>
}


/** What was saved, checked: anything that doesn't fit is left out (never a reason to fail). */
export function normalizeDoc(raw: unknown): LibraryDoc {
  const doc: LibraryDoc = { version: 1, manual: [], played: {}, preferred: {}, edits: {} }
  if (!raw || typeof raw !== 'object') return doc
  const r = raw as Record<string, unknown>
  if (Array.isArray(r.manual)) {
    const seen = new Set<string>()
    for (const m of r.manual) {
      const path = typeof (m as any)?.path === 'string' ? (m as any).path.trim() : ''
      if (!path || seen.has(path.toLowerCase())) continue
      seen.add(path.toLowerCase())
      const title = typeof (m as any).title === 'string' && (m as any).title.trim() ? (m as any).title.trim().slice(0, 200) : undefined
      doc.manual.push(title ? { path, title } : { path })
    }
  }
  if (r.played && typeof r.played === 'object') {
    for (const [id, at] of Object.entries(r.played as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at) && at > 0) doc.played[id] = at
    }
  }
  if (r.preferred && typeof r.preferred === 'object') {
    for (const [id, store] of Object.entries(r.preferred as Record<string, unknown>)) {
      if (STORES.includes(store as StoreId)) doc.preferred[id] = store as StoreId
    }
  }
  if (r.edits && typeof r.edits === 'object') {
    for (const [id, e] of Object.entries(r.edits as Record<string, any>)) {
      if (!id.startsWith('game:') || !e || typeof e !== 'object') continue
      const out: GameEdits = {}
      if (typeof e.synopsis === 'string' && e.synopsis.trim()) out.synopsis = e.synopsis.trim().slice(0, 4000)
      if (Array.isArray(e.genres)) {
        const genres = e.genres.filter((g: unknown): g is string => typeof g === 'string' && !!g.trim()).map((g: string) => g.trim().slice(0, 40)).slice(0, 6)
        if (genres.length) out.genres = genres
      }
      if (out.synopsis || out.genres) doc.edits[id] = out
    }
  }
  if (r.quips && typeof r.quips === 'object') {
    const quips: Record<string, KeptQuip> = {}
    for (const [id, q] of Object.entries(r.quips as Record<string, any>)) {
      if (id.startsWith('game:') && MILESTONES.includes(q?.at as Milestone) && typeof q?.text === 'string' && q.text) quips[id] = { at: q.at, text: q.text.slice(0, 300) }
    }
    doc.quips = quips
  }
  if (r.links && typeof r.links === 'object') {
    const links: Record<string, GameLink> = {}
    for (const [id, l] of Object.entries(r.links as Record<string, any>)) {
      if (id.startsWith('game:') && Number.isInteger(l?.igdbId) && l.igdbId > 0 && typeof l?.name === 'string' && l.name.trim()) links[id] = { igdbId: l.igdbId, name: l.name.trim().slice(0, 200) }
    }
    doc.links = links
  }
  return doc
}

/** The doc with one game's edits changed (a field null: back to what Steam says). */
export function withEdit(doc: LibraryDoc, id: string, edit: GameEdit): LibraryDoc {
  const next: GameEdits = { ...doc.edits[id] }
  if (edit.synopsis !== undefined) { if (edit.synopsis) next.synopsis = edit.synopsis; else delete next.synopsis }
  if (edit.genres !== undefined) { if (edit.genres?.length) next.genres = edit.genres; else delete next.genres }
  const edits = { ...doc.edits }
  if (next.synopsis || next.genres) edits[id] = next
  else delete edits[id]
  return { ...doc, edits }
}

/** The doc with one game linked to IGDB's (null: the link taken off). */
export function withLink(doc: LibraryDoc, id: string, link: GameLink | null): LibraryDoc {
  const links = { ...doc.links }
  if (link) links[id] = link
  else delete links[id]
  return { ...doc, links }
}

export async function loadDoc(port: ConfigPort): Promise<LibraryDoc> {
  try { return normalizeDoc(await port.configRead?.(LIBRARY_DOC)) } catch { return normalizeDoc(null) }
}

export async function saveDoc(port: ConfigPort, doc: LibraryDoc): Promise<void> {
  await port.configWrite?.(LIBRARY_DOC, doc)
}
