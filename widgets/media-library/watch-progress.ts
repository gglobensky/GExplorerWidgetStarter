// widgets/media-library/watch-progress.ts
//
// Where the user stopped in each local video ('watch-progress' document, by media path):
// what Resume, Continue watching and the watched mark are made from.
import type { WidgetSdk } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'

export const WATCH_PROGRESS_STORE = 'watch-progress'
/** Records kept: the most recently watched ones. */
export const MAX_PROGRESS_RECORDS = 2000
/** Less than this into a video is not worth resuming. */
export const MIN_RESUME_MS = 30_000

export type WatchRecord = {
  positionMs: number
  durationMs: number
  /** When it was last played (ms since 1970). */
  updatedAt: number
  /** Played to the end (or near it): no Resume, a watched mark. */
  watched?: boolean
}

type WatchProgressStore = { version:1; records:Record<string,WatchRecord> }
type ConfigStorage = Pick<WidgetSdk,'configRead'|'configWrite'>

export function progressKey(path: string): string {
  return path.toLocaleLowerCase()
}

/**
 * Near the end counts as watched: the last 7% or the last 90 s of anything longer than 20 minutes
 * (credits), the last 7% of anything shorter.
 */
export function isWatched(positionMs: number, durationMs: number): boolean {
  if (!(durationMs > 0) || !(positionMs >= 0)) return false
  const remaining = durationMs - positionMs
  return positionMs / durationMs >= .93 || (durationMs > 20 * 60_000 && remaining <= 90_000)
}

/** The record after playing up to `positionMs` (a finished video stays watched until replayed past the start). */
export function nextRecord(previous: WatchRecord | undefined, positionMs: number, durationMs: number, now: number): WatchRecord {
  const duration = durationMs > 0 ? durationMs : previous?.durationMs ?? 0
  const position = Math.max(0, Math.round(positionMs))
  const watched = isWatched(position, duration) || (!!previous?.watched && position < MIN_RESUME_MS)
  return { positionMs:watched ? 0 : position, durationMs:Math.round(duration), updatedAt:now, ...(watched ? { watched:true } : {}) }
}

/** Where Resume starts (seconds), or 0: from the start. */
export function resumeSeconds(record: WatchRecord | undefined): number {
  if (!record || record.watched || record.positionMs < MIN_RESUME_MS) return 0
  if (record.durationMs > 0 && isWatched(record.positionMs, record.durationMs)) return 0
  return Math.floor(record.positionMs / 1000)
}

/** The item with its watch state: progress (0..1) when resumable, watched, lastWatchedAt. */
export function applyWatchRecord(item: LibraryItem, record: WatchRecord | undefined): LibraryItem {
  if (!record || !item.path) return item
  const resume = resumeSeconds(record)
  return {
    ...item,
    progress:resume && record.durationMs > 0 ? Math.min(.99, record.positionMs / record.durationMs) : undefined,
    resumeSeconds:resume || undefined,
    watched:record.watched || undefined,
    lastWatchedAt:record.updatedAt,
  }
}

/** Keeps the most recent records. */
export function pruneRecords(records: Record<string,WatchRecord>, max = MAX_PROGRESS_RECORDS): Record<string,WatchRecord> {
  const entries = Object.entries(records)
  if (entries.length <= max) return records
  return Object.fromEntries(entries.sort(([,a],[,b]) => b.updatedAt - a.updatedAt).slice(0, max))
}

function validRecord(value: unknown): value is WatchRecord {
  const record = value as WatchRecord
  return !!record && typeof record === 'object'
    && Number.isFinite(record.positionMs) && Number.isFinite(record.durationMs) && Number.isFinite(record.updatedAt)
}

export async function loadWatchProgress(storage: ConfigStorage | undefined): Promise<Record<string,WatchRecord>> {
  if (!storage?.configRead) return {}
  const saved = await storage.configRead<WatchProgressStore>(WATCH_PROGRESS_STORE)
  if (saved?.version !== 1 || !saved.records || typeof saved.records !== 'object') return {}
  return Object.fromEntries(Object.entries(saved.records).filter(([,record]) => validRecord(record)))
}

export async function saveWatchProgress(storage: ConfigStorage | undefined, records: Record<string,WatchRecord>): Promise<void> {
  if (!storage?.configWrite) return
  await storage.configWrite(WATCH_PROGRESS_STORE, { version:1, records:pruneRecords(records) } satisfies WatchProgressStore)
}
