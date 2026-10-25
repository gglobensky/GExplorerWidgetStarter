// widgets/media-library/useWatchProgress.ts
//
// Live playback positions, written to the 'watch-progress' document when playback pauses, ends
// or closes (and every 30 s while it plays): the shelves only change when a record is committed.
import { ref } from 'vue'
import type { LibraryItem } from '../../shared/library-ui'
import type { LibraryContext } from './context'
import { applyWatchRecord, loadWatchProgress, nextRecord, progressKey, saveWatchProgress, type WatchRecord } from './watch-progress'

const COMMIT_EVERY_MS = 30_000

export function useWatchProgress(ctx: LibraryContext) {
  const { sdk } = ctx
  const records = ref<Record<string,WatchRecord>>({})
  const pending = new Map<string,WatchRecord>()
  let lastCommit = 0

  async function load() {
    try {
      records.value = await loadWatchProgress(sdk)
    } catch (error) {
      console.warn('[Media Library] Could not load watch progress:', error)
    }
  }

  function apply(item: LibraryItem): LibraryItem {
    return item.path ? applyWatchRecord(item, records.value[progressKey(item.path)]) : item
  }

  async function flush() {
    if (!pending.size) return
    records.value = { ...records.value, ...Object.fromEntries(pending) }
    pending.clear()
    lastCommit = Date.now()
    try {
      await saveWatchProgress(sdk, records.value)
    } catch (error) {
      console.warn('[Media Library] Could not save watch progress:', error)
    }
  }

  /** The player is at `positionMs` of `durationMs` in this item; `commit`: playback paused, ended or closed. */
  function note(item: LibraryItem, positionMs: number, durationMs: number, commit = false) {
    if (!item.path || !Number.isFinite(positionMs)) return
    const key = progressKey(item.path)
    pending.set(key, nextRecord(pending.get(key) ?? records.value[key], positionMs, durationMs, Date.now()))
    if (commit || Date.now() - lastCommit >= COMMIT_EVERY_MS) void flush()
  }

  /** Marks titles watched, or clears their progress (unwatched, from the start). */
  async function setWatched(items: LibraryItem[], watched: boolean) {
    const next = { ...records.value }
    const now = Date.now()
    for (const item of items) {
      if (!item.path) continue
      const key = progressKey(item.path)
      pending.delete(key)
      if (watched) next[key] = { positionMs:0, durationMs:next[key]?.durationMs ?? item.runtimeMinutes * 60_000, updatedAt:now, watched:true }
      else delete next[key]
    }
    records.value = next
    try {
      await saveWatchProgress(sdk, next)
    } catch (error) {
      console.warn('[Media Library] Could not save watch progress:', error)
    }
  }

  return { records, load, apply, note, flush, setWatched }
}

export type WatchProgress = ReturnType<typeof useWatchProgress>
