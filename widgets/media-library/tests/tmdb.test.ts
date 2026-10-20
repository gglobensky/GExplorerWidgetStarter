import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { applyPersistedTmdbMetadata, enrichWithTmdb, persistedTmdbMetadata, restorePersistedTmdbMetadata, tmdbImageUrl } from '../tmdb.ts'

function item(values: Partial<LibraryItem>): LibraryItem {
  return {
    id:'item', title:'Local title', year:0, runtimeMinutes:0, rating:'LOCAL', primaryGenre:'Unsorted', genres:['Unsorted'],
    synopsis:'Local synopsis', artwork:{ src:'', x:0, y:0, mode:'placeholder' }, previews:[], addedRank:1, ...values,
  }
}

test('enriches movies and episodes through TMDB search and season details', async () => {
  const requested:string[] = []
  const authorizations:unknown[] = []
  let activeRequests = 0
  let maxActiveRequests = 0
  const sdk = {
    async networkFetch(url:string, options?:{ headers?:Record<string,unknown> }) {
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests,activeRequests)
      await new Promise(resolve => setTimeout(resolve,1))
      requested.push(url)
      authorizations.push(options?.headers?.Authorization)
      let body:any = {}
      if (url.includes('/genre/movie/list')) body = { genres:[{ id:878, name:'Science Fiction' }] }
      else if (url.includes('/genre/tv/list')) body = { genres:[{ id:18, name:'Drama' }] }
      else if (url.includes('/search/movie')) body = { results:[{ id:329865, title:'Arrival', release_date:'2016-11-10', overview:'A linguist meets visitors.', genre_ids:[878], vote_average:7.6, poster_path:'/arrival.jpg', backdrop_path:'/arrival-wide.jpg' }] }
      else if (url.includes('/search/tv')) body = { results:[{ id:1396, name:'Breaking Bad', first_air_date:'2008-01-20', overview:'A chemistry teacher changes course.', genre_ids:[18], vote_average:8.9, poster_path:'/bb.jpg', backdrop_path:'/bb-wide.jpg' }] }
      else if (url.includes('/tv/1396/season/1')) body = { episodes:[{ episode_number:1, name:'Pilot', overview:'Walter receives difficult news.', air_date:'2008-01-20', runtime:59, still_path:'/pilot.jpg', vote_average:8.2 }] }
      activeRequests -= 1
      return { ok:true, status:200, statusText:'OK', json:async () => body, text:async () => JSON.stringify(body) }
    },
  } as any
  const result = await enrichWithTmdb(sdk,[
    item({ id:'movie', title:'Arrival', year:2016, mediaKind:'movie', artwork:{ src:'custom-cover', x:40, y:60, mode:'cover' } }),
    item({ id:'episode', title:'S01E01', mediaKind:'episode', seriesTitle:'Breaking Bad', seasonNumber:1, episodeNumber:1 }),
  ])
  assert.equal(result.matched,2)
  assert.equal(result.items[0].synopsis,'A linguist meets visitors.')
  assert.deepEqual(result.items[0].genres,['Science Fiction'])
  assert.deepEqual(result.items[0].artwork,{ src:'custom-cover', x:40, y:60, mode:'cover' })
  assert.equal(result.items[0].tmdbStillPath,'/arrival-wide.jpg')
  assert.equal(result.items[1].title,'S01E01 · Pilot')
  assert.equal(result.items[1].runtimeMinutes,59)
  assert.equal(result.items[1].synopsis,'Walter receives difficult news.')
  assert.equal(result.items[1].tmdbStillPath,'/pilot.jpg')
  assert.equal(requested.some(url => url.includes('query=Arrival')),true)
  assert.equal(authorizations.every(value => JSON.stringify(value) === JSON.stringify({ secret:'tmdb', format:'Bearer {}' })),true)
  assert.equal(maxActiveRequests,1)
})

test('does not accept an unrelated result merely because its year matches', async () => {
  const sdk = {
    async networkFetch(url:string) {
      const body = url.includes('/genre/')
        ? { genres:[] }
        : { results:[{ id:10, title:'A Different Film', release_date:'2024-01-01', overview:'Wrong result.' }] }
      return { ok:true, status:200, statusText:'OK', json:async () => body, text:async () => JSON.stringify(body) }
    },
  } as any
  const original = item({ id:'unknown', title:'Signal North', year:2024, mediaKind:'movie' })
  const result = await enrichWithTmdb(sdk,[original])
  assert.equal(result.matched,0)
  assert.equal(result.items[0].title,'Signal North')
  assert.equal(result.items[0].synopsis,'Local synopsis')
})

test('retries distinct cleaned local titles only after the display title does not match', async () => {
  const requested:string[] = []
  const sdk = {
    async networkFetch(url:string) {
      requested.push(url)
      const body = url.includes('/genre/')
        ? { genres:[] }
        : url.includes('query=Clean+Movie')
          ? { results:[{ id:20, title:'Clean Movie', release_date:'2020-01-01', overview:'Matched after cleanup.' }] }
          : { results:[] }
      return { ok:true, status:200, statusText:'OK', json:async () => body, text:async () => JSON.stringify(body) }
    },
  } as any
  const result = await enrichWithTmdb(sdk,[item({
    title:'Unhelpful embedded title', year:2020, mediaKind:'movie', metadataSearchTitles:['Clean Movie'],
  })])
  const searches = requested.filter(url => url.includes('/search/movie'))
  assert.equal(result.matched,1)
  assert.equal(result.items[0].title,'Clean Movie')
  assert.equal(searches.length,2)
  assert.equal(searches[1].includes('query=Clean+Movie'),true)
})

test('queries an exact movie title without filtering by a possibly incorrect embedded year', async () => {
  const requested:string[] = []
  const sdk = {
    async networkFetch(url:string) {
      requested.push(url)
      const body = url.includes('/genre/')
        ? { genres:[] }
        : url.includes('query=Antz') && !url.includes('year=')
          ? { results:[{ id:8916, title:'Antz', release_date:'1998-10-02', overview:'An ant searches for another life.' }] }
          : { results:[] }
      return { ok:true, status:200, statusText:'OK', json:async () => body, text:async () => JSON.stringify(body) }
    },
  } as any
  const result = await enrichWithTmdb(sdk,[item({ title:'Antz', year:2024, mediaKind:'movie' })])
  const searches = requested.filter(url => url.includes('/search/movie'))
  assert.equal(result.matched,1)
  assert.equal(result.items[0].year,1998)
  assert.equal(searches.length,1)
  assert.equal(searches[0].includes('year='),false)
})

test('applies an exact movie match when the auxiliary genre catalog request fails', async () => {
  const requested:string[] = []
  const sdk = {
    async networkFetch(url:string) {
      requested.push(url)
      if (url.includes('/genre/movie/list')) return {
        ok:false, status:503, statusText:'Unavailable', json:async () => ({}), text:async () => '',
      }
      const body = { results:[{
        id:8916, title:'Antz', release_date:'1998-10-02',
        overview:'A neurotic worker ant searches for another life.', genre_ids:[16,35,10751],
      }] }
      return { ok:true, status:200, statusText:'OK', json:async () => body, text:async () => JSON.stringify(body) }
    },
  } as any
  const result = await enrichWithTmdb(sdk,[item({ title:'Antz', year:1998, mediaKind:'movie', artwork:{ src:'custom', x:50, y:50, mode:'cover' } })])
  assert.equal(result.matched,1)
  assert.equal(result.items[0].synopsis,'A neurotic worker ant searches for another life.')
  assert.deepEqual(result.items[0].genres,['Animation','Comedy','Family'])
  assert.equal(result.items[0].artwork.src,'custom')
  assert.equal(requested.some(url => url.includes('/genre/tv/list')),false)
})

test('builds only bounded https TMDB image URLs', () => {
  assert.equal(tmdbImageUrl('/arrival.jpg'), 'https://image.tmdb.org/t/p/w500/arrival.jpg')
  assert.equal(tmdbImageUrl('/pilot.jpg','w780'), 'https://image.tmdb.org/t/p/w780/pilot.jpg')
  assert.equal(tmdbImageUrl('https://example.com/poster.jpg'), undefined)
  assert.equal(tmdbImageUrl('/poster.jpg?token=secret'), undefined)
})

test('round-trips matched metadata without replacing local playback fields', () => {
  const local = item({ path:'D:\\Movies\\Arrival.mkv', title:'Arrival local', resolution:'3840×2160' })
  const matched = {
    ...local,
    title:'Arrival', year:2016, synopsis:'A linguist meets visitors.', primaryGenre:'Science Fiction',
    genres:['Science Fiction','Drama'], metadataSource:'tmdb' as const, tmdbId:329865,
    tmdbType:'movie' as const, tmdbPosterPath:'/poster.jpg', tmdbStillPath:'/still.jpg', tmdbRating:7.6,
  }
  const record = persistedTmdbMetadata(matched)
  const restored = applyPersistedTmdbMetadata(local,record)
  assert.equal(restored.title,'Arrival')
  assert.equal(restored.synopsis,'A linguist meets visitors.')
  assert.equal(restored.path,local.path)
  assert.equal(restored.resolution,'3840×2160')
  assert.deepEqual(restored.genres,['Science Fiction','Drama'])
})

test('restores cached TMDB records by local path without a network request', () => {
  const local = item({ path:'D:\\Movies\\Arrival.mkv', title:'Arrival local' })
  const cached = persistedTmdbMetadata({
    ...local, title:'Arrival', metadataSource:'tmdb', tmdbId:329865, tmdbType:'movie', tmdbPosterPath:'/poster.jpg',
  })!
  const restored = restorePersistedTmdbMetadata([local],{ [local.path!]:cached })
  assert.equal(restored.restored,1)
  assert.equal(restored.items[0].title,'Arrival')
  assert.equal(restored.items[0].tmdbPosterPath,'/poster.jpg')
})
