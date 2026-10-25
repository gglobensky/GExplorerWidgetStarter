import type { LibraryArtwork, LibraryItem, LibraryShelf } from '../../shared/library-ui/types'
import type { ScannedVideo } from './scanner'

type MovieSeed = Omit<LibraryItem, 'artwork' | 'previews'>

export type CoverSource = 'custom' | 'tmdb' | 'sidecar' | 'thumbnail'

export function preferredCoverSource(available: {
  custom?: boolean
  tmdb?: boolean
  sidecar?: boolean
}): CoverSource {
  if (available.custom) return 'custom'
  if (available.tmdb) return 'tmdb'
  if (available.sidecar) return 'sidecar'
  return 'thumbnail'
}

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

export type SortMode = 'title' | 'release' | 'added' | 'collection'
export const SORT_MODES: Array<{ id:SortMode; label:string }> = [
  { id:'title', label:'Title' },
  { id:'release', label:'Release date' },
  { id:'added', label:'Recently added' },
  { id:'collection', label:'Sequels together' },
]

export function sortableTitle(title: string): string {
  return title.replace(/^(?:the|a|an)\s+/i, '')
}

function byTitle(a: LibraryItem, b: LibraryItem): number {
  return sortableTitle(a.title).localeCompare(sortableTitle(b.title), undefined, { numeric:true, sensitivity:'base' })
}

function byRelease(a: LibraryItem, b: LibraryItem): number {
  const ay = a.year > 1800 ? a.year : Number.MAX_SAFE_INTEGER
  const by = b.year > 1800 ? b.year : Number.MAX_SAFE_INTEGER
  return ay - by || byTitle(a,b)
}

/**
 * Orders titles. 'collection': by title, but the movies of one TMDB collection stay together, in
 * release order, where the first of them (by title) would be.
 */
export function sortItems(items: LibraryItem[], mode: SortMode = 'title'): LibraryItem[] {
  if (mode === 'release') return items.slice().sort(byRelease)
  if (mode === 'added') return items.slice().sort((a,b) => b.addedRank - a.addedRank || byTitle(a,b))
  const titled = items.slice().sort(byTitle)
  if (mode !== 'collection') return titled
  const groups = new Map<number,LibraryItem[]>()
  for (const item of titled) {
    if (item.tmdbCollectionId == null) continue
    const group = groups.get(item.tmdbCollectionId) ?? []
    group.push(item)
    groups.set(item.tmdbCollectionId,group)
  }
  const placed = new Set<number>()
  return titled.flatMap(item => {
    const id = item.tmdbCollectionId
    if (id == null || (groups.get(id)?.length ?? 0) < 2) return [item]
    if (placed.has(id)) return []
    placed.add(id)
    return groups.get(id)!.slice().sort(byRelease)
  })
}

/** Movies of the collections the library holds two or more of, each collection together in release order. */
export function collectionItems(items: LibraryItem[]): { items:LibraryItem[]; collections:number; groups:Array<{ id:string; title:string; items:LibraryItem[] }> } {
  const groups = new Map<number,LibraryItem[]>()
  for (const item of items) {
    if (item.tmdbCollectionId == null || item.mediaKind === 'episode') continue
    const group = groups.get(item.tmdbCollectionId) ?? []
    group.push(item)
    groups.set(item.tmdbCollectionId,group)
  }
  const sets = [...groups.values()].filter(group => group.length >= 2)
    .map(group => group.slice().sort(byRelease))
    .sort((a,b) => sortableTitle(a[0].tmdbCollectionName ?? a[0].title).localeCompare(sortableTitle(b[0].tmdbCollectionName ?? b[0].title), undefined, { numeric:true }))
  const named = sets.map(set => ({ id:`collection-${set[0].tmdbCollectionId}`, title:set[0].tmdbCollectionName || sortableTitle(set[0].title), items:set }))
  return { items:sets.flat(), collections:sets.length, groups:named }
}

export function shelvesFor(items: LibraryItem[], query = '', sort: SortMode = 'title'): LibraryShelf[] {
  const term = query.trim().toLocaleLowerCase()
  if (term) {
    const found = sortItems(items.filter(item => [item.title, item.seriesTitle, item.tmdbCollectionName, item.year, ...item.genres].join(' ').toLocaleLowerCase().includes(term)), sort)
    return found.length ? [{ id:'search', title:'Search results', note:`${found.length} found`, items:found }] : []
  }
  const localCollection = items.some(item => !!item.path)
  const arrivals = (localCollection ? items.filter(item => item.newArrival) : items)
    .slice().sort((a,b) => b.addedRank-a.addedRank).slice(0,12)
  const shelves: LibraryShelf[] = [
    { id:'continue', title:'Continue watching', note:'Your place is waiting', items:continueWatching(items) },
    ...(arrivals.length ? [{ id:'recent', title:'New arrivals', note:'Added since the last scan', items:arrivals }] : []),
  ]
  const collections = collectionItems(items)
  if (collections.collections) shelves.push({ id:'collections', title:'Collections', note:`${collections.collections} ${collections.collections === 1 ? 'set' : 'sets'} · sequels side by side`, items:collections.items, groups:collections.groups })
  const series = Array.from(new Set(items.flatMap(item => item.seriesTitle ? [item.seriesTitle] : []))).sort((a,b) => a.localeCompare(b, undefined, { numeric:true }))
  for (const title of series) {
    const matches = items
      .filter(item => item.seriesTitle === title)
      .sort((a,b) => episodeOrder(a).season - episodeOrder(b).season
        || episodeOrder(a).episode - episodeOrder(b).episode
        || a.title.localeCompare(b.title, undefined, { numeric:true }))
    shelves.push({ id:`series-${slug(title)}`, title, note:`Series · ${matches.length} ${matches.length === 1 ? 'episode' : 'episodes'}`, items:matches })
  }
  const preferred = ['Science Fiction','Thriller','Drama','Adventure','Fantasy','Crime']
  const foundGenres = Array.from(new Set(items.map(item => item.primaryGenre)))
  const genres = [...preferred.filter(genre => foundGenres.includes(genre)), ...foundGenres.filter(genre => !preferred.includes(genre)).sort()]
  for (const genre of genres) {
    const matches = items.filter(item => item.primaryGenre === genre)
    const seenSeries = new Set<string>()
    const genreItems = matches.flatMap(item => {
      if (!item.seriesTitle) return [item]
      const key = item.seriesTitle.toLocaleLowerCase()
      if (seenSeries.has(key)) return []
      seenSeries.add(key)
      return [seriesGenreCard(matches.filter(candidate => candidate.seriesTitle?.toLocaleLowerCase() === key),item.seriesTitle,genre)]
    })
    if (genreItems.length) shelves.push({ id:slug(genre), title:genre, note:`${genreItems.length} ${genreItems.length === 1 ? 'title' : 'titles'}`, items:sortItems(genreItems, sort) })
  }
  return shelves.filter(shelf => shelf.items.length)
}

/** A series' episodes in season, then episode order. */
export function seriesEpisodes(items: LibraryItem[], seriesTitle: string): LibraryItem[] {
  const key = seriesTitle.toLocaleLowerCase()
  return items
    .filter(item => item.seriesTitle?.toLocaleLowerCase() === key)
    .sort((a,b) => episodeOrder(a).season - episodeOrder(b).season
      || episodeOrder(a).episode - episodeOrder(b).episode
      || a.title.localeCompare(b.title, undefined, { numeric:true }))
}

/** The episode after this one in its series, if the library has it. */
export function nextEpisode(items: LibraryItem[], item: LibraryItem): LibraryItem | undefined {
  if (!item.seriesTitle) return undefined
  const episodes = seriesEpisodes(items, item.seriesTitle)
  const index = episodes.findIndex(candidate => candidate.id === item.id)
  return index >= 0 ? episodes[index + 1] : undefined
}

/**
 * Continue watching, most recent first: titles stopped part way, and for a series whose latest
 * played episode was finished, its next episode. One entry per series.
 */
export function continueWatching(items: LibraryItem[], max = 20): LibraryItem[] {
  const result: LibraryItem[] = []
  const added = new Set<string>()
  const seriesSeen = new Set<string>()
  const add = (item: LibraryItem) => {
    if (added.has(item.id)) return
    added.add(item.id)
    result.push(item)
  }
  const played = items.filter(item => item.lastWatchedAt).sort((a,b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0))
  for (const item of played) {
    const series = item.seriesTitle?.toLocaleLowerCase()
    if (series && seriesSeen.has(series)) continue
    if (series) seriesSeen.add(series)
    if (item.progress && !item.watched) add(item)
    else if (item.watched && series) {
      const next = nextEpisode(items, item)
      if (next && !next.watched) add(next)
    }
  }
  // Progress without a play date: the sample collection.
  for (const item of items) if (item.progress && item.progress < .95 && !item.lastWatchedAt && !item.watched) add(item)
  return result.slice(0, max)
}

export type ShowroomRackRow = {
  id: string
  label?: string
  total: number
  items: LibraryItem[]
}

export function showroomTitleCount(items: LibraryItem[], genre: string): number {
  return items.filter(item => item.primaryGenre === genre).length
}

export function showroomRowsFor(items: LibraryItem[], genre: string, capacity = 6, sort: SortMode = 'title'): ShowroomRackRow[] {
  const rowCapacity = Math.max(1,Math.floor(capacity))
  const matching = items.filter(item => item.primaryGenre === genre)
  const movies = sortItems(matching.filter(item => !item.seriesTitle), sort)
  const series = new Map<string,LibraryItem[]>()
  for (const item of matching) {
    if (!item.seriesTitle) continue
    const episodes = series.get(item.seriesTitle) ?? []
    episodes.push(item)
    series.set(item.seriesTitle,episodes)
  }
  const rows: ShowroomRackRow[] = []
  for (let index = 0; index < movies.length; index += rowCapacity) {
    const rowItems = movies.slice(index,index + rowCapacity)
    rows.push({ id:`titles-${index / rowCapacity}`, total:rowItems.length, items:rowItems })
  }
  for (const [title,episodes] of [...series].sort(([a],[b]) => a.localeCompare(b,undefined,{ numeric:true }))) {
    episodes.sort((a,b) => episodeOrder(a).season - episodeOrder(b).season
      || episodeOrder(a).episode - episodeOrder(b).episode
      || a.title.localeCompare(b.title,undefined,{ numeric:true }))
    rows.push({ id:`series-${slug(title)}`, label:title, total:episodes.length, items:episodes.slice(0,rowCapacity) })
  }
  return rows
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function episodeOrder(item: LibraryItem): { season:number; episode:number } {
  const tagged = item.title.match(/\bS(\d{1,3})E(\d{1,4})\b/i)
  return {
    season:item.seasonNumber ?? (tagged ? Number(tagged[1]) : Number.MAX_SAFE_INTEGER),
    episode:item.episodeNumber ?? (tagged ? Number(tagged[2]) : Number.MAX_SAFE_INTEGER),
  }
}

function seriesGenreCard(items: LibraryItem[], seriesTitle: string, genre: string): LibraryItem {
  const representative = items.find(item => item.artwork.src) ?? items[0]
  return {
    ...representative,
    id:`series-link-${slug(genre)}-${slug(seriesTitle)}`,
    title:seriesTitle,
    progress:undefined,
    path:undefined,
    mimeType:undefined,
    mediaKind:undefined,
    seriesTitle:undefined,
    seasonNumber:undefined,
    episodeNumber:undefined,
    targetShelfId:`series-${slug(seriesTitle)}`,
    synopsis:`Browse all locally discovered episodes of ${seriesTitle}.`,
    newArrival:items.some(item => item.newArrival),
  }
}

const genreAliases: Array<[string, string]> = [
  ['science fiction','Science Fiction'], ['sci-fi','Science Fiction'], ['scifi','Science Fiction'],
  ['action','Action'], ['adventure','Adventure'], ['animation','Animation'], ['anime','Animation'],
  ['comedy','Comedy'], ['crime','Crime'], ['documentary','Documentary'], ['drama','Drama'],
  ['family','Family'], ['fantasy','Fantasy'], ['history','History'], ['horror','Horror'],
  ['music','Music'], ['mystery','Mystery'], ['romance','Romance'], ['thriller','Thriller'],
  ['war','War'], ['western','Western'],
]

const technicalSuffix = /\s+(?:2160p|1080p|720p|576p|480p|4k|8k|uhd|hdr10?\+?|dolby[ ._-]*vision|bluray|blu[ ._-]*ray|b[dr]rip|web[ ._-]*dl|webrip|hdrip|dvdrip|hdtv|remux|x26[45]|h26[45]|hevc|avc|av1|xvid|divx|10[ ._-]*bit|8[ ._-]*bit|aac|ac3|eac3|ddp?(?:[ ._-]*\d(?:[ ._-]*\d)?)?|dts(?:[ ._-]*hd)?|truehd|atmos|flac|multi(?:[ ._-]*audio)?|dual(?:[ ._-]*audio)?|proper|repack)(?:\s|$).*$/i
const editionSuffix = /\s+(?:director'?s[ ._-]*cut|extended(?:[ ._-]*(?:cut|edition))?|unrated|remastered|theatrical(?:[ ._-]*cut)?|final[ ._-]*cut)$/i

function parsedMovieName(value: string, stripExtension: boolean): { title:string; year:number } {
  const stem = stripExtension ? value.replace(/\.[A-Za-z0-9]{1,5}$/, '') : value
  const readable = stem
    .replace(/^\[(?:yts(?:\.[a-z]+)?|rarbg|eztv|ettv|torrentgalaxy|tgx)\][\s._-]*/i, '')
    .replace(/\b([hx])[ ._-]?26([45])\b/gi, '$126$2')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const yearMatch = readable.match(/(?:^|\s|\(|\[)((?:19|20)\d{2})(?=$|\s|\)|\])/)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  let title = yearMatch && readable.slice(0,yearMatch.index).trim()
    ? readable.slice(0,yearMatch.index).trim()
    : readable.replace(yearMatch?.[0] ?? '', ' ').trim()
  title = title.replace(technicalSuffix, '').trim()
  title = title.replace(/[\[(\-\s]+$/, '').trim()
  return { title:title || stem, year }
}

export function parseMovieFilename(filename: string): { title: string; year: number } {
  return parsedMovieName(filename,true)
}

export function movieSearchTitles(filename: string, embeddedTitle = ''): string[] {
  const filenameTitle = parseMovieFilename(filename).title
  const embedded = embeddedTitle.trim() ? parsedMovieName(embeddedTitle,false).title : ''
  const candidates = [filenameTitle,filenameTitle.replace(editionSuffix,''),embedded,embedded.replace(editionSuffix,'')]
  return candidates.map(title => title.trim()).filter((title,index,all) => !!title && all.findIndex(candidate => candidate.toLocaleLowerCase() === title.toLocaleLowerCase()) === index)
}

export type SeriesEpisode = { seriesTitle: string; seasonNumber: number; episodeNumber?: number; episodeTitle: string }

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
      ?? filename.match(/^\[?(\d{1,3})\]?(?:[\s._-]+(.*))?$/i)
    if (episode) return { seriesTitle:folderSeries, seasonNumber:folderSeason, episodeNumber:Number(episode[1]), episodeTitle:cleanMediaWords(episode[2] ?? '') }
    const episodeTitle = cleanMediaWords(filename)
      .replace(/\s+(?:2160p|1080p|720p|4k|uhd|bluray|brrip|webrip|web-dl|remux|x26[45]|h26[45]|hevc|aac|dts).*$/i, '')
    if (episodeTitle) return { seriesTitle:folderSeries, seasonNumber:folderSeason, episodeTitle }
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
    const searchTitles = episode
      ? movieSearchTitles(episode.seriesTitle)
      : movieSearchTitles(video.name,video.probe?.title ?? '')
    const hash = stableNumber(video.path)
    const coverUrl = video.coverPath ? coverUrls.get(video.coverPath) : undefined
    const runtimeMinutes = video.probe?.durationMs ? Math.max(1, Math.round(video.probe.durationMs / 60_000)) : 0
    const durationSeconds = Math.max(60, Math.round((video.probe?.durationMs ?? 0) / 1000))
    const primaryGenre = inferGenre(video.path)
    const folder = video.path.replace(/[\\/][^\\/]+$/, '').split(/[\\/]/).pop() || 'your media folder'
    // A filename year usually represents the release. Container tags often
    // contain the encode/import year instead, so only use them as a fallback.
    const year = parsed.year || video.probe?.year || 0
    const artwork: LibraryArtwork = coverUrl
      ? { src:coverUrl, x:50, y:50, mode:'cover' }
      : { src:'', x:0, y:0, mode:'placeholder' }
    return {
      id:`local-${hash.toString(36)}`,
      title:episode
        ? episode.episodeNumber != null
          ? `S${String(episode.seasonNumber).padStart(2,'0')}E${String(episode.episodeNumber).padStart(2,'0')}${episode.episodeTitle ? ` · ${episode.episodeTitle}` : ''}`
          : `Season ${episode.seasonNumber}${episode.episodeTitle ? ` · ${episode.episodeTitle}` : ''}`
        : parsed.title,
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
      sourceRoot:video.sourceRoot,
      mimeType:video.extension,
      resolution:video.probe?.width && video.probe?.height ? `${video.probe.width}×${video.probe.height}` : undefined,
      mediaKind:episode ? 'episode' as const : 'movie' as const,
      seriesTitle:episode?.seriesTitle,
      seasonNumber:episode?.seasonNumber,
      episodeNumber:episode?.episodeNumber,
      metadataSearchTitles:searchTitles,
    }
  }).sort((a,b) => a.title.localeCompare(b.title, undefined, { numeric:true }))
}

function normalizedPath(path: string): string {
  return path.replace(/[\\/]+$/,'').replace(/\//g,'\\').toLocaleLowerCase()
}

function parentDirectory(path: string): string {
  return normalizedPath(path).replace(/\\[^\\]+$/,'')
}

function comparableName(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
}

function looksLikeMovieFolder(directory: string, movie: LibraryItem): boolean {
  const folder = comparableName(directory.split('\\').pop() ?? '')
  const title = comparableName(movie.title)
  return !!folder && !!title && (folder.includes(title) || title.includes(folder))
}

/** Folders that hold a movie's extras (Plex / Jellyfin / Kodi conventions), inside the movie's folder. */
const EXTRA_FOLDER = /^(?:extras?|featurettes?|behind[ ._-]?the[ ._-]?scenes|deleted[ ._-]?scenes|interviews?|scenes|shorts|trailers?|bonus(?:[ ._-]?(?:features|material))?|specials?|other|making[ ._-]?of|samples?)$/i
/** File-name suffixes for extras beside the movie: "Heat-trailer.mkv", "Heat - featurette.mp4". */
const EXTRA_SUFFIX = /\s*-\s*(?:behind[ ._]?the[ ._]?scenes|deleted(?:[ ._]?scenes?)?|featurette|interview|scene|short|trailer|teaser|other|extra|sample)$/i
const EXTRA_WORDS = /\b(?:extras?|bonus|featurettes?|behind the scenes|deleted scenes?|interviews?|trailers?|teasers?|making of|alternate ending|bloopers?|outtakes?|gag reel|commentary|sample)\b/i
/** An unrecognized video beside an identified movie, shorter than this, is one of its extras. */
export const EXTRA_MAX_MINUTES = 60

function fileStem(path: string): string {
  return (path.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '')
}

export function looksLikeExtra(item: LibraryItem): boolean {
  return EXTRA_WORDS.test(item.title) || (!!item.path && EXTRA_SUFFIX.test(fileStem(item.path)))
}

/** "Heat - Behind the Scenes" names "Heat": the movie's whole title, as words, inside a longer name. */
function namesMovie(item: LibraryItem, movie: LibraryItem): boolean {
  const name = ` ${comparableName(item.path ? fileStem(item.path) : item.title)} `
  const title = comparableName(movie.title)
  return !!title && name.trim() !== title && name.includes(` ${title} `)
}

export function flattenLibraryExtras(items: LibraryItem[]): LibraryItem[] {
  const flattened:LibraryItem[] = []
  const append = (item:LibraryItem) => {
    const { extras, ...standalone } = item
    flattened.push(standalone)
    for (const extra of extras ?? []) append(extra)
  }
  for (const item of items) append(item)
  return flattened
}

/**
 * Gathers a movie's extras under it (they leave the shelves; the movie's details list them):
 * - videos in an extras folder inside the movie's folder (Extras, Featurettes, Behind The Scenes...);
 * - videos beside the movie named as extras ("Heat-trailer.mkv", "Deleted Scenes.mkv");
 * - beside a movie TMDB identified, videos TMDB did not recognize that are shorter than
 *   EXTRA_MAX_MINUTES (a second full-length movie stays a movie), or, length unknown, that name the
 *   movie or sit in the movie's own folder.
 * The movie of a folder: the one TMDB identified there, else its only video not named as an extra.
 */
export function bundleMovieExtras(items: LibraryItem[]): LibraryItem[] {
  const flat = flattenLibraryExtras(items)
  type Member = { item:LibraryItem; inExtrasFolder:boolean }
  const folders = new Map<string,Member[]>()
  for (const item of flat) {
    if (!item.path || item.mediaKind === 'episode') continue
    const parent = parentDirectory(item.path)
    const inExtrasFolder = EXTRA_FOLDER.test(parent.split('\\').pop() ?? '') && parent !== normalizedPath(item.sourceRoot ?? '')
    const owner = inExtrasFolder ? parent.replace(/\\[^\\]+$/,'') : parent
    const group = folders.get(owner) ?? []
    group.push({ item, inExtrasFolder })
    folders.set(owner,group)
  }

  const extrasByMovie = new Map<string,LibraryItem[]>()
  const bundledIds = new Set<string>()
  for (const [directory,group] of folders) {
    const beside = group.filter(member => !member.inExtrasFolder).map(member => member.item)
    const identified = beside.filter(item => item.metadataSource === 'tmdb' && item.tmdbType === 'movie' && item.tmdbId)
    const unnamed = beside.filter(item => !looksLikeExtra(item) && !item.tmdbId)
    const movie = identified.length === 1 ? identified[0]
      : identified.length === 0 && unnamed.length === 1 ? unnamed[0]
        : undefined
    if (!movie) continue
    const byTmdb = movie.metadataSource === 'tmdb'
    const extras = group.filter(({ item, inExtrasFolder }) => {
      if (item.id === movie.id || item.tmdbId) return false
      if (inExtrasFolder || looksLikeExtra(item)) return true
      if (!byTmdb || !item.tmdbMatchAttempted) return false
      return item.runtimeMinutes > 0
        ? item.runtimeMinutes < EXTRA_MAX_MINUTES
        : namesMovie(item,movie) || looksLikeMovieFolder(directory,movie)
    }).map(member => member.item).sort((a,b) => a.title.localeCompare(b.title,undefined,{ numeric:true }))
    if (!extras.length) continue
    extrasByMovie.set(movie.id,extras)
    for (const extra of extras) bundledIds.add(extra.id)
  }

  return flat
    .filter(item => !bundledIds.has(item.id))
    .map(item => extrasByMovie.has(item.id) ? { ...item, extras:extrasByMovie.get(item.id) } : item)
}
