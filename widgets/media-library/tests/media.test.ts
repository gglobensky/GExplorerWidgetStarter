import assert from 'node:assert/strict'
import test from 'node:test'
import { createMovieLibrary, createScannedLibrary, inferGenre, parseMovieFilename, parseSeriesEpisode, shelvesFor } from '../media.ts'
import { chooseCover, scanVideoSources, videoMime } from '../scanner.ts'

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
  const episodes = [
    { ...movies[0], id:'ep2', title:'S01E02 · Second', mediaKind:'episode' as const, seriesTitle:'Gem Show', seasonNumber:1, episodeNumber:2 },
    { ...movies[1], id:'ep1', title:'S01E01 · First', mediaKind:'episode' as const, seriesTitle:'Gem Show', seasonNumber:1, episodeNumber:1 },
  ]
  const shelves = shelvesFor(episodes)
  assert.deepEqual(shelves.find(shelf => shelf.id === 'series-gem-show')?.items.map(item => item.id), ['ep1','ep2'])
  assert.equal(shelves.some(shelf => shelf.id === 'science-fiction'), true)
})

test('prefers movie-matched sidecar artwork and maps stream MIME hints', () => {
  const entry = (Name:string, FullPath:string) => ({ Name, FullPath, Kind:'file' as const, Ext:'.jpg', Size:1, ModifiedAt:0, IconKey:'', Hidden:false })
  const images = [entry('poster.jpg','D:\\Movies\\poster.jpg'), entry('Arrival.jpg','D:\\Movies\\Arrival.jpg')]
  assert.equal(chooseCover('Arrival.mkv', images), 'D:\\Movies\\Arrival.jpg')
  assert.equal(videoMime('.webm'), 'video/webm')
  assert.equal(videoMime('.mp4'), 'video/mp4')
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
    mediaInfo:async (paths:string[]) => paths.map(path => ({ path, durationMs:7_200_000, year:2016 })),
  } as any
  const result = await scanVideoSources(sdk, ['D:\\Movies'], 'test', () => {}, () => false)
  assert.equal(result.videos.length, 2)
  assert.equal(result.videos.find(video => video.name === 'Home.mp4')?.coverPath, 'D:\\Movies\\poster.jpg')
  assert.equal(result.videos.find(video => video.name === 'Arrival.mkv')?.coverPath, 'D:\\Movies\\Science Fiction\\Arrival.jpg')
  assert.equal(result.videos[0].probe?.durationMs, 7_200_000)
  assert.equal(closed, 2)
})
