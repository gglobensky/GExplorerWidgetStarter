import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { continueWatching, createScannedLibrary, nextEpisode } from '../media.ts'
import {
  applyWatchRecord, isWatched, loadWatchProgress, nextRecord, pruneRecords, resumeSeconds, saveWatchProgress, WATCH_PROGRESS_STORE,
} from '../watch-progress.ts'

const MIN = 60_000

test('counts the end of a video, or its credits, as watched', () => {
  assert.equal(isWatched(93 * MIN, 100 * MIN), true)
  assert.equal(isWatched(98.6 * MIN, 100 * MIN), true)            // last 90 s of a feature
  assert.equal(isWatched(80 * MIN, 100 * MIN), false)
  assert.equal(isWatched(17.5 * MIN, 19 * MIN), false)            // a short episode keeps the 7% rule
  assert.equal(isWatched(5 * MIN, 0), false)
})

test('resumes only past the first 30 seconds and before the end', () => {
  assert.equal(resumeSeconds(nextRecord(undefined, 20_000, 100 * MIN, 1)), 0)
  assert.equal(resumeSeconds(nextRecord(undefined, 45 * MIN + 500, 100 * MIN, 1)), 45 * 60)
  assert.equal(resumeSeconds(nextRecord(undefined, 99 * MIN, 100 * MIN, 1)), 0)
})

test('a watched video stays watched when replayed briefly, and resumes when replayed further', () => {
  const watched = nextRecord(undefined, 99 * MIN, 100 * MIN, 1)
  assert.equal(watched.watched, true)
  assert.equal(nextRecord(watched, 10_000, 100 * MIN, 2).watched, true)
  const rewatching = nextRecord(watched, 40 * MIN, 100 * MIN, 3)
  assert.equal(rewatching.watched, undefined)
  assert.equal(resumeSeconds(rewatching), 40 * 60)
})

test('applies progress, resume point and watched mark to local items only', () => {
  const [item] = createScannedLibrary([{ path:'D:\\Movies\\Heat (1995).mkv', name:'Heat (1995).mkv', extension:'.mkv', size:1, modifiedAt:1, sourceRoot:'D:\\Movies' }], ['a','b'], new Map())
  const applied = applyWatchRecord(item, { positionMs:50 * MIN, durationMs:100 * MIN, updatedAt:7 })
  assert.equal(applied.progress, .5)
  assert.equal(applied.resumeSeconds, 3000)
  assert.equal(applied.lastWatchedAt, 7)
  assert.equal(applyWatchRecord({ ...item, path:undefined }, { positionMs:1, durationMs:2, updatedAt:3 }).lastWatchedAt, undefined)
})

function episode(id: string, season: number, number: number, extra: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id, title:`S0${season}E0${number}`, year:2020, runtimeMinutes:40, rating:'LOCAL', primaryGenre:'Drama', genres:['Drama'],
    synopsis:'', artwork:{ src:'', x:0, y:0 }, previews:[], addedRank:0, path:`D:\\Show\\${id}.mkv`,
    mediaKind:'episode', seriesTitle:'Show', seasonNumber:season, episodeNumber:number, ...extra,
  }
}

test('continue watching: newest first, one entry per series, the next episode after a finished one', () => {
  const items = [
    episode('e1', 1, 1, { watched:true, lastWatchedAt:30 }),
    episode('e2', 1, 2),
    episode('e3', 1, 3, { progress:.4, resumeSeconds:900, lastWatchedAt:10 }),
    { ...episode('m1', 0, 0), id:'m1', title:'Movie', mediaKind:'movie' as const, seriesTitle:undefined, progress:.2, resumeSeconds:600, lastWatchedAt:20 },
  ]
  assert.deepEqual(continueWatching(items).map(item => item.id), ['e2','m1'])
  assert.equal(nextEpisode(items, items[1])?.id, 'e3')
  assert.equal(nextEpisode(items, items[2]), undefined)
})

test('keeps the most recent records and stores them in their own document', async () => {
  const pruned = pruneRecords({ a:{ positionMs:0, durationMs:1, updatedAt:1 }, b:{ positionMs:0, durationMs:1, updatedAt:3 }, c:{ positionMs:0, durationMs:1, updatedAt:2 } }, 2)
  assert.deepEqual(Object.keys(pruned).sort(), ['b','c'])
  let saved: unknown = null
  const storage = {
    configRead:async () => saved,
    configWrite:async (name: string, value: unknown) => { assert.equal(name, WATCH_PROGRESS_STORE); saved = value },
  } as any
  await saveWatchProgress(storage, { 'd:\\a.mkv':{ positionMs:5, durationMs:9, updatedAt:1 } })
  assert.deepEqual(await loadWatchProgress(storage), { 'd:\\a.mkv':{ positionMs:5, durationMs:9, updatedAt:1 } })
  saved = { version:1, records:{ bad:{ positionMs:'x' } } }
  assert.deepEqual(await loadWatchProgress(storage), {})
})
