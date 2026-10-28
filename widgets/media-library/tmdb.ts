import type { WidgetSdk } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'

type SearchResult = {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
}

type SearchResponse = { results?: SearchResult[] }
type MovieDetails = { runtime?: number | null; belongs_to_collection?: { id:number; name?:string } | null }
type GenreResponse = { genres?: Array<{ id:number; name:string }> }
type SeasonResponse = {
  poster_path?: string | null
  episodes?: Array<{
    episode_number: number
    name?: string
    overview?: string
    air_date?: string
    runtime?: number | null
    still_path?: string | null
    vote_average?: number
  }>
}

export type TmdbProgress = { completed:number; total:number; title:string }
/** failed: still failing after their retries; not marked as looked up, so the next run tries them again. */
export type TmdbEnrichment = { items:LibraryItem[]; matched:number; unmatched:number; failed:number }
export type TmdbDiagnosticAttempt = {
  request: { method:'GET'; url:string; body:null; query:Record<string,string> }
  responseBody: SearchResponse
  chosen?: SearchResult
  validation: { requestedTitle:string; requestedYear:number; resultYear:number; normalizedTitleMatch:boolean; yearMatches:boolean }
}
export type PersistedTmdbMetadata = Pick<LibraryItem,
  'title'|'year'|'runtimeMinutes'|'rating'|'primaryGenre'|'genres'|'synopsis'|'metadataSource'|
  'tmdbId'|'tmdbType'|'tmdbPosterPath'|'tmdbStillPath'|'tmdbRating'|'tmdbCollectionId'|'tmdbCollectionName'
>

const API = 'https://api.themoviedb.org/3'
const IMAGE_API = 'https://image.tmdb.org/t/p'
export const TMDB_SECRET_NAME = 'tmdb'
export const TMDB_SECRET_HOSTS = ['api.themoviedb.org'] as const

const FALLBACK_GENRES:Record<'movie'|'tv',Array<[number,string]>> = {
  movie:[
    [28,'Action'],[12,'Adventure'],[16,'Animation'],[35,'Comedy'],[80,'Crime'],[99,'Documentary'],[18,'Drama'],
    [10751,'Family'],[14,'Fantasy'],[36,'History'],[27,'Horror'],[10402,'Music'],[9648,'Mystery'],[10749,'Romance'],
    [878,'Science Fiction'],[10770,'TV Movie'],[53,'Thriller'],[10752,'War'],[37,'Western'],
  ],
  tv:[
    [10759,'Action & Adventure'],[16,'Animation'],[35,'Comedy'],[80,'Crime'],[99,'Documentary'],[18,'Drama'],
    [10751,'Family'],[10762,'Kids'],[9648,'Mystery'],[10763,'News'],[10764,'Reality'],[10765,'Sci-Fi & Fantasy'],
    [10766,'Soap'],[10767,'Talk'],[10768,'War & Politics'],[37,'Western'],
  ],
}

export function tmdbImageUrl(path: string | undefined, size: 'w500'|'w780' = 'w500'): string | undefined {
  const clean = path?.trim()
  if (!clean || !/^\/[A-Za-z0-9_./-]+$/.test(clean)) return undefined
  return `${IMAGE_API}/${size}${clean}`
}

export function tmdbReviewsUrl(item: Pick<LibraryItem,'tmdbId'|'tmdbType'>): string | undefined {
  if (!Number.isInteger(item.tmdbId) || Number(item.tmdbId) <= 0) return undefined
  const type = item.tmdbType === 'tv' ? 'tv' : item.tmdbType === 'movie' ? 'movie' : undefined
  return type ? `https://www.themoviedb.org/${type}/${item.tmdbId}/reviews` : undefined
}

export function persistedTmdbMetadata(item: LibraryItem): PersistedTmdbMetadata | undefined {
  if (item.metadataSource !== 'tmdb' || item.tmdbId == null) return undefined
  const {
    title,year,runtimeMinutes,rating,primaryGenre,genres,synopsis,metadataSource,
    tmdbId,tmdbType,tmdbPosterPath,tmdbStillPath,tmdbRating,tmdbCollectionId,tmdbCollectionName,
  } = item
  return {
    title,year,runtimeMinutes,rating,primaryGenre,genres:[...genres],synopsis,metadataSource,
    tmdbId,tmdbType,tmdbPosterPath,tmdbStillPath,tmdbRating,
    ...(tmdbCollectionId != null ? { tmdbCollectionId, tmdbCollectionName } : {}),
  }
}

export function applyPersistedTmdbMetadata(item: LibraryItem, metadata: PersistedTmdbMetadata | undefined): LibraryItem {
  return metadata ? { ...item, ...metadata, genres:[...metadata.genres], tmdbMatchAttempted:true } : item
}

export function restorePersistedTmdbMetadata(
  items: LibraryItem[],
  records: Record<string,PersistedTmdbMetadata>,
): { items:LibraryItem[]; restored:number } {
  let restored = 0
  return {
    items:items.map(item => {
      const metadata = item.path ? records[item.path] : undefined
      if (!metadata || item.extraOf) return item
      // Matched as a movie before the parser knew it for an episode (or the reverse): matched again.
      if ((item.mediaKind === 'episode') !== (metadata.tmdbType === 'tv')) return item
      restored += 1
      return applyPersistedTmdbMetadata(item,metadata)
    }),
    restored,
  }
}

function normalized(value: string | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function yearOf(value: string | undefined): number {
  const year = Number(value?.slice(0,4))
  return year >= 1000 && year <= 9999 ? year : 0
}

function bestResult(results: SearchResult[], title: string, year: number): SearchResult | undefined {
  const wanted = normalized(title)
  const wantedWords = new Set(wanted.split(' ').filter(Boolean))
  const best = results
    .map((result,index) => {
      const candidate = normalized(result.title || result.name)
      const original = normalized(result.original_title || result.original_name)
      const resultYear = yearOf(result.release_date || result.first_air_date)
      const candidateWords = new Set(candidate.split(' ').filter(Boolean))
      const overlap = [...wantedWords].filter(word => candidateWords.has(word)).length
      const overlapRatio = overlap / Math.max(1,wantedWords.size,candidateWords.size)
      let titleScore = overlapRatio * 60
      if (candidate === wanted || original === wanted) titleScore = 120
      else if (wanted.length >= 4 && (
        candidate.includes(wanted) || wanted.includes(candidate)
        || (original.length >= 4 && (original.includes(wanted) || wanted.includes(original)))
      )) titleScore = 80
      let score = titleScore + Math.max(0, 12-index)
      if (year && resultYear === year) score += 28
      else if (year && resultYear && Math.abs(resultYear-year) <= 1) score += 10
      return { result, score, titleScore }
    })
    .sort((a,b) => b.score-a.score)[0]
  return best && best.titleScore >= 45 ? best.result : undefined
}

function searchTitles(item: LibraryItem, primary: string): string[] {
  return [primary,...(item.metadataSearchTitles ?? [])]
    .map(title => title.trim())
    .filter((title,index,all) => !!title && all.findIndex(candidate => normalized(candidate) === normalized(title)) === index)
}

async function search(
  session: TmdbSession,
  type: 'movie'|'tv',
  titles: string[],
  year: number,
): Promise<SearchResult | undefined> {
  for (const title of titles) {
    const response = await session.json<SearchResponse>(`/search/${type}`,{ query:title, include_adult:'false' })
    const result = bestResult(response.results ?? [],title,year)
    if (result) return result
  }
  return undefined
}

export async function diagnoseTmdbItem(sdk: WidgetSdk, item: LibraryItem): Promise<TmdbDiagnosticAttempt[]> {
  const session = createTmdbSession(sdk)
  const type = item.mediaKind === 'episode' ? 'tv' : 'movie'
  const primary = type === 'tv' && item.seriesTitle ? item.seriesTitle : item.title
  const attempts:TmdbDiagnosticAttempt[] = []
  for (const title of searchTitles(item,primary)) {
    const params = { language:'en-US', query:title, include_adult:'false' }
    const url = `${API}/search/${type}?${new URLSearchParams(params)}`
    const responseBody = await session.json<SearchResponse>(`/search/${type}`,{ query:title, include_adult:'false' })
    const chosen = bestResult(responseBody.results ?? [],title,item.year)
    const resultTitle = chosen?.title || chosen?.name
    const resultYear = yearOf(chosen?.release_date || chosen?.first_air_date)
    const attempt:TmdbDiagnosticAttempt = {
      request:{ method:'GET', url, body:null, query:params },
      responseBody,
      chosen,
      validation:{
        requestedTitle:title,
        requestedYear:item.year,
        resultYear,
        normalizedTitleMatch:!!chosen && normalized(resultTitle) === normalized(title),
        yearMatches:!!item.year && resultYear === item.year,
      },
    }
    console.info('[Media Library][TMDB query diagnostic]',attempt)
    attempts.push(attempt)
  }
  return attempts
}

/** A TMDB failure worth stopping the whole run for (the token, the capability). */
export class TmdbFatalError extends Error {}

export type TmdbSessionOptions = {
  /**
   * Least time between two requests starting (default 220 ms: about 4.5 requests a second, a
   * tenth of TMDB's documented ceiling of roughly 40-50 a second: gentle on purpose).
   */
  minGapMs?: number
  /** Requests in flight at once (default 2). */
  concurrency?: number
  /** Waits; tests replace it. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * One matching run's requests: paced (minGapMs between starts, `concurrency` at once), retried
 * (429 "too many requests": 2, 4, 8, 16, 30 s; a 5xx or a dropped connection: 1, 3, 9 s), and the
 * answers a run asks for twice (genres, a show, a season) asked once. Reused across a run's
 * batches so a 1,500-title library still asks for each show and season only once.
 */
export type TmdbSession = ReturnType<typeof createTmdbSession>

export function createTmdbSession(sdk: WidgetSdk, options: TmdbSessionOptions = {}) {
  const minGapMs = options.minGapMs ?? 220
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  let nextStart = 0
  let active = 0
  const waiting: Array<() => void> = []
  const memo = new Map<string,Promise<unknown>>()
  let requests = 0
  let retries = 0

  async function slot(): Promise<void> {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve))
    active += 1
    const now = Date.now()
    const start = Math.max(now, nextStart)
    nextStart = start + minGapMs
    if (start > now) await sleep(start - now)
  }
  function release() {
    active -= 1
    waiting.shift()?.()
  }

  async function once<T>(path: string, params: Record<string,string>): Promise<T> {
    if (!sdk.networkFetch) throw new TmdbFatalError('The Network capability is unavailable.')
    const query = new URLSearchParams({ language:'en-US', ...params })
    const url = `${API}${path}?${query}`
    const rateWaits = [2000, 4000, 8000, 16000, 30000]
    const errorWaits = [1000, 3000, 9000]
    let rateTries = 0
    let errorTries = 0
    for (;;) {
      await slot()
      let response: Awaited<ReturnType<NonNullable<WidgetSdk['networkFetch']>>>
      try {
        requests += 1
        response = await sdk.networkFetch(url, {
          headers:{ accept:'application/json', Authorization:{ secret:TMDB_SECRET_NAME, format:'Bearer {}' } },
        })
      } catch (error) {
        release()
        // The shell refused (a permission, the secret): no retry.
        const code = (error as { code?: string } | null)?.code
        if (code && /^E_(?:SECRET|PERMISSION|DENIED|NEEDS)/.test(code)) throw new TmdbFatalError(error instanceof Error ? error.message : String(error))
        if (errorTries >= errorWaits.length) throw error
        retries += 1
        await sleep(errorWaits[errorTries++])
        continue
      }
      release()
      if (response.ok) return response.json() as Promise<T>
      if (response.status === 401) throw new TmdbFatalError('TMDB rejected the API Read Access Token.')
      if (response.status === 429 && rateTries < rateWaits.length) {
        retries += 1
        console.info(`[Media Library] TMDB asked to slow down; waiting ${rateWaits[rateTries] / 1000} s.`)
        await sleep(rateWaits[rateTries++])
        continue
      }
      if (response.status >= 500 && errorTries < errorWaits.length) {
        retries += 1
        await sleep(errorWaits[errorTries++])
        continue
      }
      throw new Error(`TMDB request failed (${response.status} ${response.statusText}).`)
    }
  }

  return {
    sdk,
    concurrency,
    /** One GET, paced and retried. */
    json<T>(path: string, params: Record<string,string> = {}): Promise<T> {
      return once<T>(path, params)
    },
    /** The same answer for the same key during this run (a failed one is asked again next time). */
    remember<T>(key: string, load: () => Promise<T>): Promise<T> {
      let pending = memo.get(key) as Promise<T> | undefined
      if (!pending) {
        pending = load()
        memo.set(key, pending)
        pending.catch(() => memo.delete(key))
      }
      return pending
    },
    stats: () => ({ requests, retries }),
  }
}

async function genres(session: TmdbSession, type: 'movie'|'tv'): Promise<Map<number,string>> {
  return session.remember(`genres:${type}`, async () => {
    const fallback = new Map(FALLBACK_GENRES[type])
    try {
      const response = await session.json<GenreResponse>(`/genre/${type}/list`)
      return new Map([...fallback,...(response.genres ?? []).map(genre => [genre.id,genre.name] as [number,string])])
    } catch (error) {
      if (error instanceof TmdbFatalError) throw error
      console.warn(`[Media Library] TMDB ${type} genres were unavailable; using the built-in genre map.`,error)
      return fallback
    }
  })
}

/** Runtime and collection (sequels) of a matched movie: optional, a failure only leaves them out. */
async function movieDetails(session: TmdbSession, id: number): Promise<MovieDetails | undefined> {
  try {
    const details = await session.json<MovieDetails>(`/movie/${id}`)
    return details && typeof details === 'object' ? details : undefined
  } catch (error) {
    if (error instanceof TmdbFatalError) throw error
    return undefined
  }
}

function applyCommon(item: LibraryItem, result: SearchResult, genreMap: Map<number,string>): LibraryItem {
  const foundGenres = (result.genre_ids ?? []).flatMap(id => genreMap.get(id) ? [genreMap.get(id)!] : [])
  const resultYear = yearOf(result.release_date || result.first_air_date)
  return {
    ...item,
    year:resultYear || item.year,
    synopsis:result.overview?.trim() || item.synopsis,
    genres:foundGenres.length ? foundGenres : item.genres,
    primaryGenre:foundGenres[0] || item.primaryGenre,
    tmdbId:result.id,
    tmdbType:item.mediaKind === 'episode' ? 'tv' : 'movie',
    tmdbPosterPath:result.poster_path || undefined,
    tmdbStillPath:result.backdrop_path || undefined,
    tmdbRating:result.vote_average,
    metadataSource:'tmdb',
    tmdbMatchAttempted:true,
  }
}

type TvDetails = { seasons?: Array<{ season_number:number; episode_count?:number }> }

/** A show's season, asked once per run. */
function season(session: TmdbSession, seriesId: number, number: number): Promise<SeasonResponse> {
  return session.remember(`season:${seriesId}:${number}`, () => session.json<SeasonResponse>(`/tv/${seriesId}/season/${number}`))
}

/**
 * Where an episode is: its season and number, or, numbered from the start of the show ("Naruto
 * 135" in a season-less folder), the season that number falls in, from the show's season sizes.
 */
async function locateEpisode(session: TmdbSession, seriesId: number, seasonNumber: number, episodeNumber: number): Promise<{ season:SeasonResponse; episode?:NonNullable<SeasonResponse['episodes']>[number]; seasonNumber:number }> {
  const first = await season(session, seriesId, seasonNumber).catch(error => {
    if (error instanceof TmdbFatalError) throw error
    return {} as SeasonResponse
  })
  const found = first.episodes?.find(candidate => candidate.episode_number === episodeNumber)
  if (found || seasonNumber !== 1 || (first.episodes?.length ?? 0) >= episodeNumber) return { season:first, episode:found, seasonNumber }
  const details = await session.remember(`tv:${seriesId}`, () => session.json<TvDetails>(`/tv/${seriesId}`)).catch(error => {
    if (error instanceof TmdbFatalError) throw error
    return {} as TvDetails
  })
  let remaining = episodeNumber
  for (const candidate of (details.seasons ?? []).filter(entry => entry.season_number > 0).sort((a,b) => a.season_number - b.season_number)) {
    const count = candidate.episode_count ?? 0
    if (remaining <= count) {
      const target = await season(session, seriesId, candidate.season_number)
      return { season:target, episode:target.episodes?.find(entry => entry.episode_number === remaining), seasonNumber:candidate.season_number }
    }
    remaining -= count
  }
  return { season:first, seasonNumber }
}

function seasonTag(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2,'0')}E${String(episodeNumber).padStart(2,'0')}`
}

/** One title: matched, or returned as it was with tmdbMatchAttempted. */
async function enrichOne(session: TmdbSession, item: LibraryItem): Promise<{ item:LibraryItem; matched:boolean }> {
  // Extras are never matched: TMDB would name them after their movie (or after a show called "Extras").
  if (item.extraOf) return { item:{ ...item, tmdbMatchAttempted:true }, matched:false }
  if (item.mediaKind === 'episode' && item.seriesTitle) {
    const tvGenres = await genres(session,'tv')
    const titles = searchTitles(item,item.seriesTitle)
    const series = await session.remember(`show:${titles.map(normalized).join('|')}:${item.year}`, () => search(session,'tv',titles,item.year))
    if (!series) return { item:{ ...item, tmdbMatchAttempted:true }, matched:false }
    const common = applyCommon(item,series,tvGenres)
    // Extras, specials without a number, "Season 2 · Bonus": the show's metadata, the file's own title.
    if (item.seasonNumber == null || item.episodeNumber == null) {
      return { item:{ ...common, title:item.title, year:item.year || common.year, tmdbPosterPath:series.poster_path || undefined }, matched:true }
    }
    const placed = await locateEpisode(session, series.id, item.seasonNumber, item.episodeNumber)
    const episode = placed.episode
    const number = episode?.episode_number ?? item.episodeNumber
    return {
      item:{
        ...common,
        title:episode?.name ? `${seasonTag(placed.seasonNumber, number)} · ${episode.name}` : common.title,
        seasonNumber:episode ? placed.seasonNumber : item.seasonNumber,
        episodeNumber:episode ? number : item.episodeNumber,
        synopsis:episode?.overview?.trim() || common.synopsis,
        year:yearOf(episode?.air_date) || common.year,
        runtimeMinutes:episode?.runtime || common.runtimeMinutes,
        // No still for this episode: the show's poster and backdrop stand in.
        tmdbPosterPath:placed.season.poster_path || series.poster_path || undefined,
        tmdbStillPath:episode?.still_path || series.backdrop_path || undefined,
        tmdbRating:episode?.vote_average || series.vote_average,
      },
      matched:true,
    }
  }
  const movieGenres = await genres(session,'movie')
  let movie = await search(session,'movie',searchTitles(item,item.title),item.year)
  // Last resort: the folder's name ("Heat (1995)\heat-cd1.avi"), never asked twice for one folder.
  const folderTitles = (item.folderSearchTitles ?? []).filter(title => !searchTitles(item,item.title).some(known => normalized(known) === normalized(title)))
  if (!movie && folderTitles.length) {
    movie = await session.remember(`folder:${folderTitles.map(normalized).join('|')}:${item.year}`, () => search(session,'movie',folderTitles,item.year))
  }
  if (!movie) return { item:{ ...item, tmdbMatchAttempted:true }, matched:false }
  const common = applyCommon(item,movie,movieGenres)
  const details = await movieDetails(session,movie.id)
  const collection = details?.belongs_to_collection
  return {
    item:{
      ...common,
      title:movie.title?.trim() || common.title,
      runtimeMinutes:common.runtimeMinutes || details?.runtime || 0,
      ...(collection?.id ? { tmdbCollectionId:collection.id, tmdbCollectionName:collection.name?.trim() || undefined } : {}),
    },
    matched:true,
  }
}

export async function enrichWithTmdb(
  sdk: WidgetSdk,
  items: LibraryItem[],
  onProgress: (progress:TmdbProgress) => void = () => {},
  session: TmdbSession = createTmdbSession(sdk),
  isCancelled: () => boolean = () => false,
): Promise<TmdbEnrichment> {
  // The first protected request must finish its consent flow before another exact
  // URL asks for access, or both can queue separate permission questions.
  if (items.some(item => item.mediaKind !== 'episode' || !item.seriesTitle)) await genres(session,'movie')
  if (items.some(item => item.mediaKind === 'episode' && item.seriesTitle)) await genres(session,'tv')
  const enriched:LibraryItem[] = new Array(items.length)
  let matched = 0
  let failed = 0
  let completed = 0
  let next = 0
  onProgress({ completed:0, total:items.length, title:items[0]?.seriesTitle || items[0]?.title || '' })

  async function worker() {
    while (next < items.length && !isCancelled()) {
      const index = next++
      const item = items[index]
      try {
        const result = await enrichOne(session,item)
        enriched[index] = result.item
        if (result.matched) matched += 1
      } catch (error) {
        if (error instanceof TmdbFatalError) throw error
        // Still failing after its retries (TMDB down, the connection gone): this title waits for
        // the next run; the rest go on.
        console.warn(`[Media Library] TMDB could not look up ${item.title}:`, error)
        enriched[index] = item
        failed += 1
      }
      completed += 1
      onProgress({ completed, total:items.length, title:item.seriesTitle || item.title })
    }
  }
  await Promise.all(Array.from({ length:Math.min(session.concurrency, items.length) }, worker))
  const done = enriched.map((item,index) => item ?? items[index])
  onProgress({ completed:items.length, total:items.length, title:'' })
  return { items:done, matched, unmatched:done.filter(item => item.tmdbMatchAttempted && item.tmdbId == null).length, failed }
}
