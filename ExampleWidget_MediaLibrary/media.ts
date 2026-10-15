import type { LibraryArtwork, LibraryItem, LibraryShelf } from '../shared/library-ui/types'
import type { ScannedVideo } from './scanner'

type MovieSeed = Omit<LibraryItem, 'artwork' | 'previews'>

const seeds: MovieSeed[] = [
  { id:'signal-north', title:'Signal North', year:2024, runtimeMinutes:118, rating:'PG-13', primaryGenre:'Science Fiction', genres:['Science Fiction','Mystery'], synopsis:'A radio astronomer working through the longest night of winter hears a repeating signal hidden beneath the aurora—and realizes it is answering questions nobody has asked aloud.', progress:.38, addedRank:11 },
  { id:'long-rain', title:'The Long Rain', year:1978, runtimeMinutes:106, rating:'R', primaryGenre:'Crime', genres:['Crime','Thriller'], synopsis:'A weary private investigator follows a missing reel of film through rain-polished streets, where every witness remembers a different ending.', progress:.71, addedRank:4 },
  { id:'stillwater', title:'Stillwater', year:2021, runtimeMinutes:97, rating:'PG', primaryGenre:'Drama', genres:['Drama'], synopsis:'Returning to the lake where her family spent every summer, a cartographer finds that the shoreline—and the people waiting there—have quietly changed.', addedRank:8 },
  { id:'glasswork', title:'The Glasswork Garden', year:2025, runtimeMinutes:124, rating:'PG', primaryGenre:'Fantasy', genres:['Fantasy','Adventure'], synopsis:'An apprentice caretaker enters a greenhouse whose brass planets predict the seasons, and must repair its impossible machinery before winter arrives forever.', addedRank:12 },
  { id:'sundown-vector', title:'Sundown Vector', year:2023, runtimeMinutes:131, rating:'PG-13', primaryGenre:'Science Fiction', genres:['Science Fiction','Adventure'], synopsis:'Stranded beyond the mapped colonies, a survey pilot crosses a burning desert toward a signal that appears only at sunset.', addedRank:7 },
  { id:'last-show', title:'Last Show on Mercer', year:1962, runtimeMinutes:102, rating:'PG', primaryGenre:'Drama', genres:['Drama','Romance'], synopsis:'On the final night of a neighbourhood cinema, its projectionist prepares one last secret screening for the people whose lives unfolded in its seats.', progress:.17, addedRank:3 },
  { id:'blackwater-light', title:'Blackwater Light', year:2022, runtimeMinutes:111, rating:'PG-13', primaryGenre:'Thriller', genres:['Thriller','Mystery'], synopsis:'A lighthouse keeper records impossible ships in the storm and discovers each entry vanishes from the logbook by morning.', addedRank:9 },
  { id:'horizon-riders', title:'Horizon Riders', year:2019, runtimeMinutes:104, rating:'PG-13', primaryGenre:'Adventure', genres:['Adventure','Drama'], synopsis:'Two estranged friends take a final ride across a salt flat where distance, memory, and the setting sun refuse to behave.', addedRank:2 },
  { id:'winter-house', title:'The Winter House', year:2020, runtimeMinutes:115, rating:'R', primaryGenre:'Thriller', genres:['Thriller','Mystery'], synopsis:'Guests at a remote mountain hotel wake to find fresh footprints circling the building, though the road has been closed for weeks.', addedRank:6 },
  { id:'blue-below', title:'The Blue Below', year:2025, runtimeMinutes:127, rating:'PG', primaryGenre:'Science Fiction', genres:['Science Fiction','Drama'], synopsis:'At the bottom of a lightless sea, a research crew discovers a living constellation migrating past their windows.', addedRank:10 },
  { id:'harvest-static', title:'Harvest Static', year:2017, runtimeMinutes:93, rating:'PG-13', primaryGenre:'Drama', genres:['Drama','Mystery'], synopsis:'A sound engineer returns to an abandoned prairie farm and hears his childhood broadcasts emerging from a radio with no power.', addedRank:1 },
  { id:'crimson-line', title:'The Crimson Line', year:2024, runtimeMinutes:121, rating:'PG-13', primaryGenre:'Adventure', genres:['Adventure','Thriller'], synopsis:'A night train crosses a mountain range that does not appear on any map, carrying twelve passengers and one ticket too many.', progress:.54, addedRank:5 },
]

const cueNames = ['Opening', 'Turning point', 'The journey', 'Final act']
const cueTones = ['-16deg', '8deg', '24deg', '-32deg']

export function createMovieLibrary(atlases: [string, string]): LibraryItem[] {
  return seeds.map((seed, index) => {
    const local = index % 6
    const artwork: LibraryArtwork = {
      src: atlases[index < 6 ? 0 : 1],
      x: [0, 50, 100][local % 3] as 0 | 50 | 100,
      y: (local < 3 ? 0 : 100) as 0 | 100,
    }
    const seconds = seed.runtimeMinutes * 60
    return {
      ...seed,
      artwork,
      previews: [.12,.34,.57,.76].map((point, cue) => ({
        label: cueNames[cue],
        seconds: Math.round(seconds * point),
        tone: cueTones[cue],
      })),
    }
  })
}

export function shelvesFor(items: LibraryItem[], query = ''): LibraryShelf[] {
  const term = query.trim().toLocaleLowerCase()
  if (term) {
    const found = items.filter(item => [item.title, item.seriesTitle, item.year, ...item.genres].join(' ').toLocaleLowerCase().includes(term))
    return found.length ? [{ id:'search', title:'Search results', note:`${found.length} found`, items:found }] : []
  }
  const shelves: LibraryShelf[] = [
    { id:'continue', title:'Continue watching', note:'Your place is waiting', items:items.filter(item => item.progress && item.progress < .95) },
    { id:'recent', title:'New arrivals', note:'Fresh on the shelf', items:items.slice().sort((a,b) => b.addedRank-a.addedRank).slice(0,12) },
  ]
  const series = Array.from(new Set(items.flatMap(item => item.seriesTitle ? [item.seriesTitle] : []))).sort((a,b) => a.localeCompare(b, undefined, { numeric:true }))
  for (const title of series) {
    const matches = items
      .filter(item => item.seriesTitle === title)
      .sort((a,b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0) || a.title.localeCompare(b.title, undefined, { numeric:true }))
    shelves.push({ id:`series-${slug(title)}`, title, note:`Series · ${matches.length} ${matches.length === 1 ? 'episode' : 'episodes'}`, items:matches })
  }
  const preferred = ['Science Fiction','Thriller','Drama','Adventure','Fantasy','Crime']
  const foundGenres = Array.from(new Set(items.map(item => item.primaryGenre)))
  const genres = [...preferred.filter(genre => foundGenres.includes(genre)), ...foundGenres.filter(genre => !preferred.includes(genre)).sort()]
  for (const genre of genres) {
    const matches = items.filter(item => item.primaryGenre === genre)
    const mixedMedia = matches.some(item => item.mediaKind === 'episode')
    if (matches.length) shelves.push({ id:genre.toLocaleLowerCase().split(' ').join('-'), title:genre, note:`${matches.length} ${mixedMedia ? (matches.length === 1 ? 'title' : 'titles') : (matches.length === 1 ? 'movie' : 'movies')}`, items:matches })
  }
  return shelves.filter(shelf => shelf.items.length)
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const genreAliases: Array<[string, string]> = [
  ['science fiction','Science Fiction'], ['sci-fi','Science Fiction'], ['scifi','Science Fiction'],
  ['action','Action'], ['adventure','Adventure'], ['animation','Animation'], ['anime','Animation'],
  ['comedy','Comedy'], ['crime','Crime'], ['documentary','Documentary'], ['drama','Drama'],
  ['family','Family'], ['fantasy','Fantasy'], ['history','History'], ['horror','Horror'],
  ['music','Music'], ['mystery','Mystery'], ['romance','Romance'], ['thriller','Thriller'],
  ['war','War'], ['western','Western'],
]

export function parseMovieFilename(filename: string): { title: string; year: number } {
  const stem = filename.replace(/\.[^.]+$/, '')
  const readable = stem.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
  const yearMatch = readable.match(/(?:^|\s|\(|\[)((?:19|20)\d{2})(?=$|\s|\)|\])/)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  let title = yearMatch ? readable.slice(0, yearMatch.index).trim() : readable
  title = title.replace(/\s+(?:2160p|1080p|720p|4k|uhd|bluray|brrip|webrip|web-dl|remux|x26[45]|h26[45]|hevc|aac|dts).*$/i, '').trim()
  title = title.replace(/[\[(\-\s]+$/, '').trim()
  return { title:title || stem, year }
}

export type SeriesEpisode = { seriesTitle: string; seasonNumber: number; episodeNumber: number; episodeTitle: string }

function cleanMediaWords(value: string): string {
  return value.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '').trim()
}

export function parseSeriesEpisode(path: string, sourceRoot = ''): SeriesEpisode | null {
  const parts = path.split(/[\\/]/).filter(Boolean)
  const filename = (parts[parts.length - 1] ?? '').replace(/\.[^.]+$/, '')
  const relativeParts = sourceRoot && path.toLocaleLowerCase().startsWith(sourceRoot.toLocaleLowerCase())
    ? path.slice(sourceRoot.length).split(/[\\/]/).filter(Boolean)
    : parts
  const seasonFolderIndex = relativeParts.findIndex(part => /^(?:season\s*|s)(\d{1,2})$/i.test(part))
  const folderSeason = seasonFolderIndex >= 0 ? Number(relativeParts[seasonFolderIndex].match(/\d+/)?.[0] ?? 0) : 0
  const folderSeries = seasonFolderIndex > 0 ? cleanMediaWords(relativeParts[seasonFolderIndex - 1]) : ''
  const tagged = filename.match(/^(.*?)(?:[\s._-]+)?s(\d{1,2})e(\d{1,3})(?:[\s._-]+(.*))?$/i)
    ?? filename.match(/^(.*?)(?:[\s._-]+)?(\d{1,2})x(\d{1,3})(?:[\s._-]+(.*))?$/i)
  if (tagged) {
    const seriesTitle = cleanMediaWords(tagged[1]) || folderSeries || cleanMediaWords(parts[parts.length - 2] ?? '')
    const episodeTitle = cleanMediaWords(tagged[4] ?? '')
      .replace(/\s+(?:2160p|1080p|720p|4k|uhd|bluray|brrip|webrip|web-dl|remux|x26[45]|h26[45]|hevc|aac|dts).*$/i, '')
    if (!seriesTitle) return null
    return { seriesTitle, seasonNumber:Number(tagged[2]), episodeNumber:Number(tagged[3]), episodeTitle }
  }
  if (folderSeason && folderSeries) {
    const episode = filename.match(/^(?:episode|ep|e)[\s._-]*(\d{1,3})(?:[\s._-]+(.*))?$/i)
    if (episode) return { seriesTitle:folderSeries, seasonNumber:folderSeason, episodeNumber:Number(episode[1]), episodeTitle:cleanMediaWords(episode[2] ?? '') }
  }
  return null
}

export function inferGenre(path: string): string {
  const normalized = path.toLocaleLowerCase().replace(/[_.]+/g, ' ')
  return genreAliases.find(([alias]) => normalized.includes(alias))?.[1] ?? 'Unsorted'
}

function stableNumber(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return hash >>> 0
}

export function createScannedLibrary(
  videos: ScannedVideo[],
  _atlases: [string, string],
  coverUrls: Map<string, string>,
): LibraryItem[] {
  const newest = videos.slice().sort((a,b) => (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0))
  const ranks = new Map(newest.map((video, index) => [video.path, index + 1]))
  return videos.map(video => {
    const parsed = parseMovieFilename(video.name)
    const episode = parseSeriesEpisode(video.path, video.sourceRoot)
    const hash = stableNumber(video.path)
    const coverUrl = video.coverPath ? coverUrls.get(video.coverPath) : undefined
    const runtimeMinutes = video.probe?.durationMs ? Math.max(1, Math.round(video.probe.durationMs / 60_000)) : 0
    const durationSeconds = Math.max(60, Math.round((video.probe?.durationMs ?? 0) / 1000))
    const primaryGenre = inferGenre(video.path)
    const folder = video.path.replace(/[\\/][^\\/]+$/, '').split(/[\\/]/).pop() || 'your media folder'
    const year = video.probe?.year || parsed.year
    const artwork: LibraryArtwork = coverUrl
      ? { src:coverUrl, x:50, y:50, mode:'cover' }
      : { src:'', x:0, y:0, mode:'placeholder' }
    return {
      id:`local-${hash.toString(36)}`,
      title:episode
        ? `S${String(episode.seasonNumber).padStart(2,'0')}E${String(episode.episodeNumber).padStart(2,'0')}${episode.episodeTitle ? ` · ${episode.episodeTitle}` : ''}`
        : video.probe?.title?.trim() || parsed.title,
      year,
      runtimeMinutes,
      rating:'LOCAL',
      primaryGenre,
      genres:[primaryGenre],
      synopsis:`A local video from ${folder}. Add a matching image, poster.jpg, cover.jpg, or folder.jpg beside the movie to use it as the case artwork.`,
      artwork,
      previews:[.12,.34,.57,.76].map((point, index) => ({
        label:cueNames[index], seconds:Math.round(durationSeconds * point), tone:cueTones[index],
      })),
      addedRank:ranks.get(video.path) ?? 0,
      path:video.path,
      mimeType:video.extension,
      resolution:video.probe?.width && video.probe?.height ? `${video.probe.width}×${video.probe.height}` : undefined,
      mediaKind:episode ? 'episode' as const : 'movie' as const,
      seriesTitle:episode?.seriesTitle,
      seasonNumber:episode?.seasonNumber,
      episodeNumber:episode?.episodeNumber,
    }
  }).sort((a,b) => a.title.localeCompare(b.title, undefined, { numeric:true }))
}
