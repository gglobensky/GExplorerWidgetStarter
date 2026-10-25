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
export type TmdbEnrichment = { items:LibraryItem[]; matched:number; unmatched:number }
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
      if (!metadata) return item
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
  sdk: WidgetSdk,
  type: 'movie'|'tv',
  titles: string[],
  year: number,
): Promise<SearchResult | undefined> {
  for (const title of titles) {
    const response = await json<SearchResponse>(sdk,`/search/${type}`,{ query:title, include_adult:'false' })
    const result = bestResult(response.results ?? [],title,year)
    if (result) return result
  }
  return undefined
}

export async function diagnoseTmdbItem(sdk: WidgetSdk, item: LibraryItem): Promise<TmdbDiagnosticAttempt[]> {
  const type = item.mediaKind === 'episode' ? 'tv' : 'movie'
  const primary = type === 'tv' && item.seriesTitle ? item.seriesTitle : item.title
  const attempts:TmdbDiagnosticAttempt[] = []
  for (const title of searchTitles(item,primary)) {
    const params = { language:'en-US', query:title, include_adult:'false' }
    const url = `${API}/search/${type}?${new URLSearchParams(params)}`
    const responseBody = await json<SearchResponse>(sdk,`/search/${type}`,{ query:title, include_adult:'false' })
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

async function json<T>(sdk: WidgetSdk, path: string, params: Record<string,string> = {}): Promise<T> {
  if (!sdk.networkFetch) throw new Error('The Network capability is unavailable.')
  const query = new URLSearchParams({ language:'en-US', ...params })
  const response = await sdk.networkFetch(`${API}${path}?${query}`, {
    headers:{ accept:'application/json', Authorization:{ secret:TMDB_SECRET_NAME, format:'Bearer {}' } },
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('TMDB rejected the API Read Access Token.')
    throw new Error(`TMDB request failed (${response.status} ${response.statusText}).`)
  }
  return response.json() as Promise<T>
}

async function genres(sdk: WidgetSdk, type: 'movie'|'tv'): Promise<Map<number,string>> {
  const fallback = new Map(FALLBACK_GENRES[type])
  try {
    const response = await json<GenreResponse>(sdk, `/genre/${type}/list`)
    return new Map([...fallback,...(response.genres ?? []).map(genre => [genre.id,genre.name] as [number,string])])
  } catch (error) {
    console.warn(`[Media Library] TMDB ${type} genres were unavailable; using the built-in genre map.`,error)
    return fallback
  }
}

/** Runtime and collection (sequels) of a matched movie: optional, a failure only leaves them out. */
async function movieDetails(sdk: WidgetSdk, id: number): Promise<MovieDetails | undefined> {
  try {
    const details = await json<MovieDetails>(sdk,`/movie/${id}`)
    return details && typeof details === 'object' ? details : undefined
  } catch (error) {
    if (error instanceof Error && /token/i.test(error.message)) throw error
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

export async function enrichWithTmdb(
  sdk: WidgetSdk,
  items: LibraryItem[],
  onProgress: (progress:TmdbProgress) => void = () => {},
): Promise<TmdbEnrichment> {
  // The first protected request must finish its consent flow before another exact
  // URL asks for access, or both can queue separate permission questions.
  const needsMovieGenres = items.some(item => item.mediaKind !== 'episode')
  const needsTvGenres = items.some(item => item.mediaKind === 'episode')
  const movieGenres = needsMovieGenres ? await genres(sdk,'movie') : new Map<number,string>()
  const tvGenres = needsTvGenres ? await genres(sdk,'tv') : new Map<number,string>()
  const seriesCache = new Map<string,Promise<SearchResult | undefined>>()
  const seasonCache = new Map<string,Promise<SeasonResponse>>()
  const enriched:LibraryItem[] = []
  let matched = 0

  for (let index=0; index<items.length; index += 1) {
    const item = items[index]
    onProgress({ completed:index, total:items.length, title:item.seriesTitle || item.title })
    try {
      if (item.mediaKind === 'episode' && item.seriesTitle && item.seasonNumber != null && item.episodeNumber != null) {
        const seriesKey = normalized(item.seriesTitle)
        let seriesPromise = seriesCache.get(seriesKey)
        if (!seriesPromise) {
          seriesPromise = search(sdk,'tv',searchTitles(item,item.seriesTitle),item.year)
          seriesCache.set(seriesKey,seriesPromise)
        }
        const series = await seriesPromise
        if (!series) { enriched.push({ ...item, tmdbMatchAttempted:true }); continue }
        const seasonKey = `${series.id}:${item.seasonNumber}`
        let seasonPromise = seasonCache.get(seasonKey)
        if (!seasonPromise) {
          seasonPromise = json<SeasonResponse>(sdk,`/tv/${series.id}/season/${item.seasonNumber}`)
          seasonCache.set(seasonKey,seasonPromise)
        }
        const season = await seasonPromise
        const episode = season.episodes?.find(candidate => candidate.episode_number === item.episodeNumber)
        const common = applyCommon(item,series,tvGenres)
        enriched.push({
          ...common,
          title:episode?.name ? `S${String(item.seasonNumber).padStart(2,'0')}E${String(item.episodeNumber).padStart(2,'0')} · ${episode.name}` : common.title,
          synopsis:episode?.overview?.trim() || common.synopsis,
          year:yearOf(episode?.air_date) || common.year,
          runtimeMinutes:episode?.runtime || common.runtimeMinutes,
          tmdbPosterPath:season.poster_path || series.poster_path || undefined,
          tmdbStillPath:episode?.still_path || series.backdrop_path || undefined,
          tmdbRating:episode?.vote_average || series.vote_average,
        })
        matched += 1
      } else {
        const movie = await search(sdk,'movie',searchTitles(item,item.title),item.year)
        if (!movie) { enriched.push({ ...item, tmdbMatchAttempted:true }); continue }
        const common = applyCommon(item,movie,movieGenres)
        const details = await movieDetails(sdk,movie.id)
        const collection = details?.belongs_to_collection
        enriched.push({
          ...common,
          title:movie.title?.trim() || common.title,
          runtimeMinutes:common.runtimeMinutes || details?.runtime || 0,
          ...(collection?.id ? { tmdbCollectionId:collection.id, tmdbCollectionName:collection.name?.trim() || undefined } : {}),
        })
        matched += 1
      }
    } catch (error) {
      if (error instanceof Error && /token|secret|Network capability|TMDB request failed/i.test(error.message)) throw error
      enriched.push({ ...item, tmdbMatchAttempted:true })
    }
  }
  onProgress({ completed:items.length, total:items.length, title:'' })
  return { items:enriched, matched, unmatched:items.length-matched }
}
