// widgets/media-library/useTmdbMatching.ts
//
// Optional TMDB metadata: the token (kept by GEM Shell as a protected secret: this widget only
// names it), matching the whole library or one title, and the matched records kept by media path
// in the 'tmdb-metadata' document so later scans restore them without a request.
import { ref } from 'vue'
import type { WidgetSecrets } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'
import { errorText, type LibraryContext } from './context'
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
  const state = ref<TmdbState>('idle')
  const progress = ref<TmdbProgress | null>(null)
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
  function noteResults(list: LibraryItem[]) {
    for (const item of list) {
      if (!item.path || !item.tmdbMatchAttempted) continue
      if (item.tmdbId != null) misses.delete(item.path)
      else misses.add(item.path)
    }
  }

  /** Scanned items TMDB already failed to recognize are marked as looked up. */
  function markMisses(list: LibraryItem[]): LibraryItem[] {
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
  function providerBase(item: LibraryItem): LibraryItem {
    const withoutLocalFlag = item.localMetadataOverride ? { ...item, localMetadataOverride:false } : item
    return item.path ? applyPersistedTmdbMetadata(withoutLocalFlag, records.value[item.path]) : withoutLocalFlag
  }

  const canMatch = () => !!sdk?.networkFetch && secret.value.set && state.value !== 'matching'

  /**
   * Matches `list` in batches of MATCH_BATCH: each batch's matches are saved and shown (artwork
   * too) before the next starts. One paced session for the whole run (see tmdb.ts). Resolves with
   * the totals, or null when a newer scan replaced the library meanwhile.
   */
  async function matchInBatches(list: LibraryItem[], revision: number): Promise<{ matched:number; unmatched:number; failed:number; images:number } | null> {
    if (!sdk) return null
    const session = createTmdbSession(sdk)
    const totals = { matched:0, unmatched:0, failed:0, images:0 }
    const stale = () => revision !== ctx.revision()
    for (let start = 0; start < list.length; start += MATCH_BATCH) {
      const batch = list.slice(start, start + MATCH_BATCH)
      const result = await enrichWithTmdb(sdk, batch.map(providerBase), next => {
        progress.value = { completed:start + next.completed, total:list.length, title:next.title }
      }, session, stale)
      if (stale()) return null
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
      if (stale()) return null
      totals.images += artwork.imported
    }
    const stats = session.stats()
    console.info(`[Media Library] TMDB run: ${list.length} titles, ${stats.requests} requests, ${stats.retries} retried.`)
    return totals
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
      if (!totals) return false
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
      if (!totals) return 0
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
  async function matchOne(item: LibraryItem, preferArtwork = false) {
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
