import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleMovieExtras, createMovieLibrary, createScannedLibrary, flattenLibraryExtras, inferGenre, movieSearchTitles, parseMovieFilename, parseSeriesEpisode, preferredCoverSource, shelvesFor, showroomRowsFor, showroomTitleCount } from '../media.ts'
import { chooseCover, scanVideoSources, videoMime } from '../scanner.ts'
import { inferredSeasonNumber, itemsForSeason, seasonLabel, seasonsFor } from '../../../shared/library-ui/seasons.ts'

const movies = createMovieLibrary(['atlas-a','atlas-b'])

test('creates stable artwork cells and preview cues for every movie', () => {
  assert.equal(movies.length, 12)
  assert.deepEqual(movies[0].artwork, { src:'atlas-a', x:0, y:0 })
  assert.deepEqual(movies[5].artwork, { src:'atlas-a', x:100, y:100 })
  assert.deepEqual(movies[6].artwork, { src:'atlas-b', x:0, y:0 })
  assert.equal(movies.every(movie => movie.previews.length === 4), true)
})

test('builds utility shelves before primary genre shelves', () => {
  const shelves = shelvesFor(movies)
  assert.deepEqual(shelves.slice(0,2).map(shelf => shelf.id), ['continue','recent'])
  assert.equal(shelves.find(shelf => shelf.id === 'science-fiction')?.items.length, 3)
  assert.equal(shelves.find(shelf => shelf.id === 'fantasy')?.items[0].id, 'glasswork')
})

test('search matches titles, years, and secondary genres', () => {
  assert.deepEqual(shelvesFor(movies,'1978')[0].items.map(item => item.id), ['long-rain'])
  assert.equal(shelvesFor(movies,'romance')[0].items[0].id, 'last-show')
  assert.equal(shelvesFor(movies,'not in this collection').length, 0)
})

test('cleans common movie filenames and infers folder genres', () => {
  assert.deepEqual(parseMovieFilename('Arrival.2016.2160p.UHD.BluRay.x265.mkv'), { title:'Arrival', year:2016 })
  assert.deepEqual(parseMovieFilename('Spirited_Away [2001].mp4'), { title:'Spirited Away', year:2001 })
  assert.deepEqual(parseMovieFilename('[YTS.MX] The.Movie.2023.1080p.WEB-DL.DDP5.1.H.264-GROUP.mkv'), { title:'The Movie', year:2023 })
  assert.deepEqual(movieSearchTitles('Blade.Runner.Directors.Cut.1982.1080p.BluRay.x265.mkv'), ['Blade Runner Directors Cut','Blade Runner'])
  assert.equal(inferGenre('D:\\Movies\\Science Fiction\\Arrival.mkv'), 'Science Fiction')
  assert.equal(inferGenre('D:\\Home Videos\\Birthday.mp4'), 'Unsorted')
})

test('detects common series naming and creates ordered series shelves alongside genres', () => {
  assert.deepEqual(parseSeriesEpisode('D:\\TV\\The Expanse\\Season 02\\The.Expanse.S02E03.Static.mkv', 'D:\\TV'), {
    seriesTitle:'The Expanse', seasonNumber:2, episodeNumber:3, episodeTitle:'Static',
  })
  assert.deepEqual(parseSeriesEpisode('D:\\TV\\Severance\\Season 01\\Episode 4 - The You You Are.mp4', 'D:\\TV'), {
    seriesTitle:'Severance', seasonNumber:1, episodeNumber:4, episodeTitle:'The You You Are',
  })
  assert.deepEqual(parseSeriesEpisode('D:\\TV\\Severance\\Season 02\\03 - Who Is Alive.mkv', 'D:\\TV'), {
    seriesTitle:'Severance', seasonNumber:2, episodeNumber:3, episodeTitle:'Who Is Alive',
  })
  assert.deepEqual(parseSeriesEpisode('D:\\TV\\Severance\\Season 02\\Bonus Feature.mkv', 'D:\\TV'), {
    seriesTitle:'Severance', seasonNumber:2, episodeTitle:'Bonus Feature',
  })
  const episodes = [
    { ...movies[0], id:'ep2', title:'S01E02 · Second', mediaKind:'episode' as const, seriesTitle:'Gem Show', seasonNumber:1, episodeNumber:2 },
    { ...movies[0], id:'ep1', title:'S01E01 · First', mediaKind:'episode' as const, seriesTitle:'Gem Show', seasonNumber:1, episodeNumber:1 },
    { ...movies[0], id:'ep-s2', title:'S02E01 · Return', mediaKind:'episode' as const, seriesTitle:'Gem Show', seasonNumber:2, episodeNumber:1 },
    { ...movies[0], id:'ep-fallback', title:'S01E03 · Third', mediaKind:'episode' as const, seriesTitle:'Gem Show', seasonNumber:undefined, episodeNumber:undefined },
  ]
  const shelves = shelvesFor(episodes)
  assert.deepEqual(shelves.find(shelf => shelf.id === 'series-gem-show')?.items.map(item => item.id), ['ep1','ep2','ep-fallback','ep-s2'])
  const genreItems = shelves.find(shelf => shelf.id === 'science-fiction')?.items ?? []
  assert.equal(genreItems.length,1)
  assert.equal(genreItems[0].title,'Gem Show')
  assert.equal(genreItems[0].targetShelfId,'series-gem-show')
})

test('builds season filters from scanned metadata, filenames, and season folders', () => {
  const episodes = [
    { ...movies[0], id:'metadata', title:'Pilot', seasonNumber:1 },
    { ...movies[0], id:'tagged', title:'Show.S02E03.Return.mkv', seasonNumber:undefined },
    { ...movies[0], id:'folder', title:'Bonus Feature', path:'D:\\TV\\Show\\Season 03\\Bonus Feature.mkv', seasonNumber:undefined },
    { ...movies[0], id:'alternate', title:'Show 4x02 Finale', seasonNumber:undefined },
  ]
  assert.deepEqual(episodes.map(inferredSeasonNumber),[1,2,3,4])
  assert.deepEqual(seasonsFor(episodes),[1,2,3,4])
  assert.deepEqual(itemsForSeason(episodes,3).map(item => item.id),['folder'])
  assert.equal(seasonLabel(0),'Specials')
  assert.equal(seasonLabel(3),'Season 3')
})

test('keeps each series on dedicated showroom shelf rows', () => {
  const items = [
    { ...movies[0], id:'movie-b', title:'Movie B' },
    { ...movies[0], id:'ep-2', title:'S01E02', seriesTitle:'Gem Show', seasonNumber:1, episodeNumber:2 },
    { ...movies[0], id:'movie-a', title:'Movie A' },
    { ...movies[0], id:'ep-1', title:'S01E01', seriesTitle:'Gem Show', seasonNumber:1, episodeNumber:1 },
    { ...movies[0], id:'ep-3', title:'S02E01', seriesTitle:'Gem Show', seasonNumber:2, episodeNumber:1 },
  ]
  const rows = showroomRowsFor(items,'Science Fiction',2)
  assert.deepEqual(rows.map(row => ({ label:row.label, total:row.total, ids:row.items.map(item => item.id) })), [
    { label:undefined, total:2, ids:['movie-a','movie-b'] },
    { label:'Gem Show', total:3, ids:['ep-1','ep-2'] },
  ])
  assert.equal(showroomTitleCount(items,'Science Fiction'),5)
})

test('shows only locally discovered items from the latest scan as new arrivals', () => {
  const local = [
    { ...movies[0], id:'old', path:'D:\\Movies\\Old.mkv', newArrival:false },
    { ...movies[1], id:'new', path:'D:\\Movies\\New.mkv', newArrival:true },
  ]
  assert.deepEqual(shelvesFor(local).find(shelf => shelf.id === 'recent')?.items.map(item => item.id), ['new'])
  assert.equal(shelvesFor(local.map(item => ({ ...item, newArrival:false }))).some(shelf => shelf.id === 'recent'), false)
})

test('bundles checked unmatched files beside one identified movie without hiding real movies or source-root files', () => {
  const root = 'D:\\Movies'
  const arrival = { ...movies[0], id:'arrival', title:'Arrival', path:`${root}\\Arrival (2016)\\Arrival.mkv`, sourceRoot:root, mediaKind:'movie' as const, metadataSource:'tmdb' as const, tmdbType:'movie' as const, tmdbId:329865, tmdbMatchAttempted:true }
  const extras = [
    { ...movies[1], id:'interview', title:'Cast Interview', path:`${root}\\Arrival (2016)\\Cast Interview.mkv`, sourceRoot:root, mediaKind:'movie' as const, tmdbMatchAttempted:true },
    { ...movies[2], id:'behind-scenes', title:'Behind the Scenes', path:`${root}\\Arrival (2016)\\Behind the Scenes.mkv`, sourceRoot:root, mediaKind:'movie' as const, tmdbMatchAttempted:true },
  ]
  const anotherMovie = { ...movies[3], id:'short-film', title:'Short Film', path:`${root}\\Arrival (2016)\\Short Film.mkv`, sourceRoot:root, mediaKind:'movie' as const, metadataSource:'tmdb' as const, tmdbType:'movie' as const, tmdbId:100, tmdbMatchAttempted:true }
  const rootVideo = { ...movies[4], id:'root-video', title:'Unsorted Clip', path:`${root}\\Unsorted Clip.mkv`, sourceRoot:root, mediaKind:'movie' as const, tmdbMatchAttempted:true }

  const grouped = bundleMovieExtras([arrival,...extras,rootVideo])
  assert.deepEqual(grouped.map(item => item.id),['arrival','root-video'])
  assert.deepEqual(grouped[0].extras?.map(item => item.id),['behind-scenes','interview'])
  assert.deepEqual(flattenLibraryExtras(grouped).map(item => item.id),['arrival','behind-scenes','interview','root-video'])
  assert.equal(bundleMovieExtras([arrival,...extras,anotherMovie]).some(item => item.extras?.length),false)
})

test('prefers movie-matched sidecar artwork and maps stream MIME hints', () => {
  const entry = (Name:string, FullPath:string) => ({ Name, FullPath, Kind:'file' as const, Ext:'.jpg', Size:1, ModifiedAt:0, IconKey:'', Hidden:false })
  const images = [entry('poster.jpg','D:\\Movies\\poster.jpg'), entry('Arrival.jpg','D:\\Movies\\Arrival.jpg')]
  assert.equal(chooseCover('Arrival.mkv', images), 'D:\\Movies\\Arrival.jpg')
  assert.equal(videoMime('.webm'), 'video/webm')
  assert.equal(videoMime('.mp4'), 'video/mp4')
})

test('orders cover sources as custom, TMDB, sidecar, then generated thumbnail', () => {
  assert.equal(preferredCoverSource({ custom:true, tmdb:true, sidecar:true }), 'custom')
  assert.equal(preferredCoverSource({ tmdb:true, sidecar:true }), 'tmdb')
  assert.equal(preferredCoverSource({ sidecar:true }), 'sidecar')
  assert.equal(preferredCoverSource({}), 'thumbnail')
})

test('uses a neutral placeholder for scanned media without a real cover', () => {
  const items = createScannedLibrary([{
    path:'D:\\TV\\Gem Show\\Season 01\\Gem.Show.S01E01.Pilot.mkv',
    name:'Gem.Show.S01E01.Pilot.mkv', extension:'.mkv', size:100, modifiedAt:1, sourceRoot:'D:\\TV',
  }], ['atlas-a','atlas-b'], new Map())
  assert.deepEqual(items[0].artwork, { src:'', x:0, y:0, mode:'placeholder' })
  assert.equal(items[0].seriesTitle, 'Gem Show')
})

test('recursively scans videos, closes listings, and attaches media details', async () => {
  const entry = (Name:string, FullPath:string, Kind:'file'|'dir', Ext = '') => ({ Name, FullPath, Kind, Ext, Size:Kind === 'file' ? 100 : null, ModifiedAt:10, IconKey:'', Hidden:false })
  const folders:Record<string, ReturnType<typeof entry>[]> = {
    'D:\\Movies': [
      entry('Science Fiction','D:\\Movies\\Science Fiction','dir'),
      entry('Home.mp4','D:\\Movies\\Home.mp4','file','.mp4'),
      entry('widget.ts','D:\\Movies\\widget.ts','file','.ts'),
      entry('Broadcast.ts','D:\\Movies\\Broadcast.ts','file','.ts'),
      entry('poster.jpg','D:\\Movies\\poster.jpg','file','.jpg'),
    ],
    'D:\\Movies\\Science Fiction': [
      entry('Arrival.mkv','D:\\Movies\\Science Fiction\\Arrival.mkv','file','.mkv'),
      entry('Arrival.jpg','D:\\Movies\\Science Fiction\\Arrival.jpg','file','.jpg'),
    ],
  }
  let closed = 0
  const sdk = {
    openListing(path:string) {
      const rows = folders[path] ?? []
      return {
        snapshot:() => ({ status:'ready', total:rows.length, version:1, sort:{ key:'name', dir:'asc', foldersFirst:true }, progress:null, stale:false, error:null, rowsTick:1, basePath:path }),
        subscribe:() => () => {}, rows:async (start:number,end:number) => rows.slice(start,end), close:() => { closed += 1 },
      }
    },
    mediaInfo:async (paths:string[]) => paths.map(path => path.endsWith('widget.ts')
      ? { path }
      : { path, durationMs:7_200_000, year:2016 }),
  } as any
  const result = await scanVideoSources(sdk, ['D:\\Movies'], 'test', () => {}, () => false)
  assert.equal(result.videos.length, 3)
  assert.equal(result.videos.some(video => video.name === 'widget.ts'), false)
  assert.equal(result.videos.some(video => video.name === 'Broadcast.ts'), true)
  assert.equal(result.videos.find(video => video.name === 'Home.mp4')?.coverPath, 'D:\\Movies\\poster.jpg')
  assert.equal(result.videos.find(video => video.name === 'Arrival.mkv')?.coverPath, 'D:\\Movies\\Science Fiction\\Arrival.jpg')
  assert.equal(result.videos[0].probe?.durationMs, 7_200_000)
  assert.equal(closed, 2)
})
