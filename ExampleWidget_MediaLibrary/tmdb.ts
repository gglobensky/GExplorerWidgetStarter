import type { WidgetSdk } from 'gexplorer/widgets'
import type { LibraryItem } from '../shared/library-ui'

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

const API = 'https://api.themoviedb.org/3'

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

async function json<T>(sdk: WidgetSdk, token: string, path: string, params: Record<string,string> = {}): Promise<T> {
  if (!sdk.networkFetch) throw new Error('The Network capability is unavailable.')
  const query = new URLSearchParams({ language:'en-US', ...params })
  const response = await sdk.networkFetch(`${API}${path}?${query}`, {
    headers:{ accept:'application/json', Authorization:`Bearer ${token.replace(/^Bearer\s+/i,'').trim()}` },
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('TMDB rejected the API Read Access Token.')
    throw new Error(`TMDB request failed (${response.status} ${response.statusText}).`)
  }
  return response.json() as Promise<T>
}

async function genres(sdk: WidgetSdk, token: string, type: 'movie'|'tv'): Promise<Map<number,string>> {
  const response = await json<GenreResponse>(sdk, token, `/genre/${type}/list`)
  return new Map((response.genres ?? []).map(genre => [genre.id,genre.name]))
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
    tmdbRating:result.vote_average,
    metadataSource:'tmdb',
  }
}

export async function enrichWithTmdb(
  sdk: WidgetSdk,
  items: LibraryItem[],
  token: string,
  onProgress: (progress:TmdbProgress) => void = () => {},
): Promise<TmdbEnrichment> {
  const cleanToken = token.replace(/^Bearer\s+/i,'').trim()
  if (!cleanToken) throw new Error('Enter a TMDB API Read Access Token.')
  const [movieGenres,tvGenres] = await Promise.all([genres(sdk,cleanToken,'movie'),genres(sdk,cleanToken,'tv')])
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
          seriesPromise = json<SearchResponse>(sdk,cleanToken,'/search/tv',{ query:item.seriesTitle, include_adult:'false' })
            .then(response => bestResult(response.results ?? [],item.seriesTitle!,item.year))
          seriesCache.set(seriesKey,seriesPromise)
        }
        const series = await seriesPromise
        if (!series) { enriched.push(item); continue }
        const seasonKey = `${series.id}:${item.seasonNumber}`
        let seasonPromise = seasonCache.get(seasonKey)
        if (!seasonPromise) {
          seasonPromise = json<SeasonResponse>(sdk,cleanToken,`/tv/${series.id}/season/${item.seasonNumber}`)
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
          tmdbStillPath:episode?.still_path || undefined,
          tmdbRating:episode?.vote_average || series.vote_average,
        })
        matched += 1
      } else {
        const response = await json<SearchResponse>(sdk,cleanToken,'/search/movie',{
          query:item.title,
          include_adult:'false',
          ...(item.year ? { year:String(item.year) } : {}),
        })
        const movie = bestResult(response.results ?? [],item.title,item.year)
        if (!movie) { enriched.push(item); continue }
        const common = applyCommon(item,movie,movieGenres)
        enriched.push({ ...common, title:movie.title?.trim() || common.title })
        matched += 1
      }
    } catch (error) {
      if (error instanceof Error && /token|Network capability|TMDB request failed/.test(error.message)) throw error
      enriched.push(item)
    }
  }
  onProgress({ completed:items.length, total:items.length, title:'' })
  return { items:enriched, matched, unmatched:items.length-matched }
}
