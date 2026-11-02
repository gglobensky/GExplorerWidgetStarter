// widgets/media-library/useTmdbMatching.ts
//
// Optional TMDB metadata: the token (kept by GEM Shell as a protected secret: this widget only
// names it), matching the whole library or one title, and the matched records kept by media path
// in the 'tmdb-metadata' document so later scans restore them without a request.
// 0.12.0: a run is a background job (entry.ts `jobs.tmdb`, its card TmdbCard.vue): it goes on while the Video Club is
// off screen, and the card's Stop ends it after the batch it's on (what was matched is kept; the rest at the next
// scan or "Refresh matches"). Its state and progress are lifecycle cells: back on screen, the Video Club shows the run
// in progress (no second one starts) and takes each batch's matches from the scan cache as they come.
import { ref, watch, type Ref } from 'vue'
import type { WidgetJob, WidgetSecrets } from 'gexplorer/widgets'
import type { MovieItem } from './movie-types'
import { copyItems, errorText, type LibraryContext } from './context'
import type { Covers } from './useCovers'
import type { MetadataEdits } from './useMetadataEdits'
import { bundleMovieExtras, flattenLibraryExtras } from './media'
import { videoFingerprint, type ScannedVideo } from './scanner'
import {
  applyPersistedTmdbMetadata, createTmdbSession, diagnoseTmdbItem, enrichWithTmdb, persistedTmdbMetadata,
  TMDB_SECRET_HOSTS, TMDB_SECRET_NAME,
  type PersistedTmdbMetadata, type TmdbProgress,
} from './tmdb'

/**
 * misses: paths TMDB was asked about without a match (not asked again by a scan; their extras stay grouped).
 * fingerprints: each matched or missed file's size and date when it was asked about: a replaced file is asked again.
 * parser: the file-name parser the misses were found with; a newer one (better at series) asks them once more.
 */
type TmdbMetadataStore = {
  version:1
  records:Record<string,PersistedTmdbMetadata>
  misses?:string[]
  fingerprints?:Record<string,string>
  parser?:number
}
type SecretStatus = Awaited<ReturnType<WidgetSecrets['status']>>
export type TmdbState = 'idle' | 'matching' | 'ready' | 'error'

const TMDB_METADATA_STORE = 'tmdb-metadata'
export const TMDB_JOB = 'tmdb'
export const TMDB_STATE_CELL = 'media-library.tmdb-state'
export const TMDB_PROGRESS_CELL = 'media-library.tmdb-progress'
/** 2: series in folders ("Season 1, Episode 01", "Show Season One (1999)", "Ep 05", show extras). */
const PARSER_VERSION = 2
/** Titles matched, then saved, at a time: an interrupted run keeps what it matched. */
const MATCH_BATCH = 500

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

export function useTmdbMatching(ctx: LibraryContext, covers: Covers, edits: MetadataEdits) {
  const { sdk, items } = ctx
  const records = ref<Record<string,PersistedTmdbMetadata>>({})
  let misses = new Set<string>()
  let fingerprints: Record<string,string> = {}
  const secret = ref<SecretStatus>({ set:false })
  const secretBusy = ref(false)
  const queryBusy = ref(false)
  // Transient (0.14.1): a run doesn't outlive GEM Shell (a "matching" saved for the next start would block every new one)
  const cell = <T,>(key: string, initial: T): Ref<T> => ctx.life?.persistRef<T>(key, initial, { transient: true }) ?? ref(initial) as Ref<T>
  const state = cell<TmdbState>(TMDB_STATE_CELL, 'idle')
  const progress = cell<TmdbProgress | null>(TMDB_PROGRESS_CELL, null)
  /** This copy runs the matching (another mount's run, still going in its job: its batches come through the scan cache). */
  let ownRun = false
  watch(ctx.scanShelf, cached => {
    if (ownRun || state.value !== 'matching' || !cached || cached.sourceKey !== ctx.sourceKey()) return
    items.value = copyItems(cached.items)
  })
  const message = ref('')

  async function load() {
    if (!sdk?.configRead) return
    try {
      const saved = await sdk.configRead<TmdbMetadataStore>(TMDB_METADATA_STORE)
      if (saved?.version === 1 && saved.records && typeof saved.records === 'object') records.value = saved.records
      // Misses found by an older parser get one more chance (Batman Beyond, 2026-10-26).
      if (saved?.version === 1 && Array.isArray(saved.misses) && saved.parser === PARSER_VERSION) misses = new Set(saved.misses.filter(path => typeof path === 'string'))
      if (saved?.version === 1 && saved.fingerprints && typeof saved.fingerprints === 'object') fingerprints = { ...saved.fingerprints }
    } catch (error) {
      console.warn('[Media Library] Could not load saved TMDB metadata:', error)
    }
  }

  async function persist() {
    if (!sdk?.configWrite) return
    await sdk.configWrite(TMDB_METADATA_STORE, { version:1, records:records.value, misses:[...misses], fingerprints, parser:PARSER_VERSION } satisfies TmdbMetadataStore)
  }

  /**
   * A scan's files against what was matched: a file replaced since (another size or date) loses its
   * record and miss, so it is matched again. Files seen for the first time are only noted.
   */
  async function noteScanned(videos: ScannedVideo[]) {
    let forgot = 0
    let noted = false
    for (const video of videos) {
      const now = videoFingerprint(video)
      const before = fingerprints[video.path]
      if (before === now) continue
      if (before && (records.value[video.path] || misses.has(video.path))) {
        const { [video.path]:_dropped, ...rest } = records.value
        records.value = rest
        misses.delete(video.path)
        forgot += 1
      }
      fingerprints[video.path] = now
      noted = true
    }
    if (!noted) return
    if (forgot) console.info(`[Media Library] ${forgot} replaced ${forgot === 1 ? 'file' : 'files'} will be matched again.`)
    try { await persist() } catch (error) { console.warn('[Media Library] Could not save TMDB file notes:', error) }
  }

  /** Remembers which paths matched and which TMDB did not recognize. */
  function noteResults(list: MovieItem[]) {
    for (const item of list) {
      if (!item.path || !item.tmdbMatchAttempted) continue
      if (item.tmdbId != null) misses.delete(item.path)
      else misses.add(item.path)
    }
  }

  /** Scanned items TMDB already failed to recognize are marked as looked up. */
  function markMisses(list: MovieItem[]): MovieItem[] {
    return misses.size ? list.map(item => item.path && !item.tmdbMatchAttempted && misses.has(item.path) ? { ...item, tmdbMatchAttempted:true } : item) : list
  }

  /** A scan restored matches from the saved records (count), or the whole library from the lifecycle cache. */
  function noteRestored(count: number | 'cache') {
    if (count === 'cache' || count > 0) {
      state.value = 'ready'
      message.value = count === 'cache'
        ? 'Restored the current library from the lifecycle cache.'
        : `${count} TMDB ${count === 1 ? 'match' : 'matches'} restored from cache.`
    } else if (state.value === 'ready') {
      state.value = 'idle'
      message.value = ''
    }
  }

  /** The item as the provider sees it: earlier matches applied, the user's edits left out. */
  function providerBase(item: MovieItem): MovieItem {
    const withoutLocalFlag = item.localMetadataOverride ? { ...item, localMetadataOverride:false } : item
    return item.path ? applyPersistedTmdbMetadata(withoutLocalFlag, records.value[item.path]) : withoutLocalFlag
  }

  const canMatch = () => !!sdk?.networkFetch && secret.value.set && state.value !== 'matching'

  /**
   * Matches `list` in batches of MATCH_BATCH: each batch's matches are saved and shown (artwork
   * too) before the next starts. One paced session for the whole run (see tmdb.ts). Resolves with
   * the totals, or null when a newer scan replaced the library meanwhile.
   */
  async function matchInBatches(list: MovieItem[], revision: number): Promise<{ matched:number; unmatched:number; failed:number; images:number } | null> {
    if (!sdk) return null
    const session = createTmdbSession(sdk)
    const totals = { matched:0, unmatched:0, failed:0, images:0 }
    // The job (0.12.0): keeps the run going off screen; its card's Stop ends it (the run stops after its batch)
    let job: WidgetJob | null = null
    try { job = sdk.jobs?.().ensure(TMDB_JOB, { title:`TMDB matches · 0 of ${list.length.toLocaleString()}` }) ?? null } catch (error) { console.warn('[Media Library] no background job for TMDB matching', error) }
    // A newer scan replaced the library: this run's results are dropped. Stopped from the card: kept, then it ends.
    const superseded = () => revision !== ctx.revision()
    const stopped = () => !!job && !job.alive
    const stale = () => superseded() || stopped()
    ownRun = true
    try {
      for (let start = 0; start < list.length; start += MATCH_BATCH) {
        const batch = list.slice(start, start + MATCH_BATCH)
        const result = await enrichWithTmdb(sdk, batch.map(providerBase), next => {
          progress.value = { completed:start + next.completed, total:list.length, title:next.title }
          job?.update({ title:`TMDB matches · ${(start + next.completed).toLocaleString()} of ${list.length.toLocaleString()}` })
        }, session, stale)
        if (superseded()) return null
        const byId = new Map(result.items.map(item => [item.id, item]))
        const next = { ...records.value }
        for (const item of result.items) {
          const metadata = persistedTmdbMetadata(item)
          if (item.path && metadata) next[item.path] = metadata
        }
        records.value = next
        noteResults(result.items)
        items.value = bundleMovieExtras(flattenLibraryExtras(items.value).map(item => byId.has(item.id) ? edits.apply(byId.get(item.id)!) : item))
        await persist()
        totals.matched += result.matched
        totals.unmatched += result.unmatched
        totals.failed += result.failed
        ctx.sync()
        const artwork = await covers.hydrateTmdb(result.items, revision)
        if (superseded()) return null
        totals.images += artwork.imported
        if (stopped()) { console.info('[Media Library] TMDB matching stopped from its card.'); break }
      }
      const stats = session.stats()
      console.info(`[Media Library] TMDB run: ${list.length} titles, ${stats.requests} requests, ${stats.retries} retried.`)
      return totals
    } finally {
      ownRun = false
      job?.end()
    }
  }

  function summary(totals: { matched:number; unmatched:number; failed:number; images:number }, fresh: boolean): string {
    return [
      `${plural(totals.matched, fresh ? 'new title' : 'title')} matched`,
      totals.unmatched ? `${totals.unmatched.toLocaleString()} not recognized` : '',
      totals.failed ? `${totals.failed.toLocaleString()} to retry later` : '',
      totals.images ? plural(totals.images, 'image') : '',
    ].filter(Boolean).join(' · ')
  }

  /** Matches every scanned title again ("Refresh matches"). Resolves false when it could not run. */
  async function matchAll(options: { quiet?: boolean } = {}): Promise<boolean> {
    if (!canMatch() || !items.value.length || !sdk) return false
    const revision = ctx.revision()
    state.value = 'matching'
    message.value = ''
    try {
      const totals = await matchInBatches(flattenLibraryExtras(items.value), revision)
      if (!totals) { state.value = 'idle'; return false }
      state.value = 'ready'
      message.value = summary(totals, false)
      if (!options.quiet) ctx.snack('tmdb', `TMDB matched ${plural(totals.matched, 'title')}.`, 4000)
      return true
    } catch (error) {
      state.value = 'error'
      message.value = errorText(error)
      ctx.snack('tmdb', message.value, 6000)
      return false
    } finally {
      progress.value = null
    }
  }

  /**
   * Matches only the titles never looked up (new or replaced files): the rest keep their records.
   * Runs right after a scan when TMDB is connected. Resolves with the number matched.
   */
  async function matchNew(): Promise<number> {
    if (!canMatch() || !sdk) return 0
    const fresh = flattenLibraryExtras(items.value).filter(item => item.path && !item.tmdbMatchAttempted)
    if (!fresh.length) return 0
    const revision = ctx.revision()
    state.value = 'matching'
    message.value = ''
    try {
      const totals = await matchInBatches(fresh, revision)
      if (!totals) { state.value = 'idle'; return 0 }
      state.value = 'ready'
      message.value = summary(totals, true)
      if (totals.matched) ctx.snack('tmdb', `TMDB matched ${plural(totals.matched, 'new title')}.`, 4000)
      return totals.matched
    } catch (error) {
      state.value = 'error'
      message.value = errorText(error)
      ctx.snack('tmdb', message.value, 6000)
      return 0
    } finally {
      progress.value = null
    }
  }

  /** Looks one title up (the candidates are logged to the console for diagnosis). */
  async function matchOne(item: MovieItem, preferArtwork = false) {
    if (!sdk?.networkFetch || !secret.value.set || queryBusy.value) return
    const revision = ctx.revision()
    queryBusy.value = true
    try {
      const attempts = await diagnoseTmdbItem(sdk, item)
      const matched = attempts.find(attempt => attempt.chosen)
      const label = matched?.chosen?.title || matched?.chosen?.name
      if (!matched) {
        message.value = `No TMDB match for ${item.title}. Rename the title to the movie's real name, then try again.`
      } else {
        const current = items.value.find(candidate => candidate.path && candidate.path === item.path) ?? item
        const result = await enrichWithTmdb(sdk, [providerBase(current)])
        if (revision !== ctx.revision()) return
        const providerItem = result.items[0]
        const metadata = providerItem ? persistedTmdbMetadata(providerItem) : undefined
        if (result.matched && providerItem && current.path && metadata) {
          const path = current.path
          records.value = { ...records.value, [path]:metadata }
          noteResults([providerItem])
          const applied = edits.apply(providerItem)
          items.value = items.value.map(candidate => candidate.path === path ? applied : candidate)
          await persist()
          await covers.hydrateTmdb([providerItem], revision)
          if (preferArtwork && providerItem.tmdbPosterPath) await covers.useTmdbPoster(applied)
          ctx.sync()
          state.value = 'ready'
          message.value = `Matched ${label || item.title} (${matched.validation.resultYear || 'year unknown'})${preferArtwork && providerItem.tmdbPosterPath ? ' with its TMDB artwork' : ''}.`
        } else {
          message.value = `TMDB suggested ${label || 'a title'}, but it did not pass the match check.`
        }
      }
      ctx.snack('tmdb-query', message.value, 7000)
    } catch (error) {
      message.value = errorText(error)
      ctx.snack('tmdb-query', `TMDB lookup failed: ${message.value}`, 7000)
    } finally {
      queryBusy.value = false
    }
  }

  async function refreshSecret() {
    if (!sdk?.secrets) { secret.value = { set:false }; return }
    try {
      secret.value = await sdk.secrets().status(TMDB_SECRET_NAME)
    } catch (error) {
      secret.value = { set:false }
      console.warn('[Media Library] Could not read TMDB secret status:', error)
    }
  }

  async function promptSecret() {
    if (!sdk?.secrets || secretBusy.value) return
    secretBusy.value = true
    message.value = ''
    try {
      const result = await sdk.secrets().prompt({ name:TMDB_SECRET_NAME, label:'TMDB API Read Access Token', hosts:[...TMDB_SECRET_HOSTS] })
      if (result.saved) {
        await refreshSecret()
        state.value = 'idle'
        message.value = 'TMDB token saved securely by GEM Shell.'
      }
    } catch (error) {
      state.value = 'error'
      message.value = errorText(error)
    } finally {
      secretBusy.value = false
    }
  }

  async function forgetSecret() {
    if (!sdk?.secrets || secretBusy.value) return
    secretBusy.value = true
    try {
      await sdk.secrets().delete(TMDB_SECRET_NAME)
      await refreshSecret()
      state.value = 'idle'
      message.value = 'TMDB token removed.'
    } catch (error) {
      state.value = 'error'
      message.value = errorText(error)
    } finally {
      secretBusy.value = false
    }
  }

  return {
    records, secret, secretBusy, queryBusy, state, progress, message,
    load, noteRestored, noteScanned, markMisses, canMatch, matchAll, matchNew, matchOne, refreshSecret, promptSecret, forgetSecret,
  }
}

export type TmdbMatching = ReturnType<typeof useTmdbMatching>
