import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { applyPersistedTmdbMetadata, createTmdbSession, enrichWithTmdb, persistedTmdbMetadata, restorePersistedTmdbMetadata, tmdbImageUrl, tmdbReviewsUrl } from '../tmdb.ts'

function item(values: Partial<LibraryItem>): LibraryItem {
  return {
    id:'item', title:'Local title', year:0, runtimeMinutes:0, rating:'LOCAL', primaryGenre:'Unsorted', genres:['Unsorted'],
    synopsis:'Local synopsis', artwork:{ src:'', x:0, y:0, mode:'placeholder' }, previews:[], addedRank:1, ...values,
  }
}

test('builds TMDB review links only for matched movies and shows', () => {
  assert.equal(tmdbReviewsUrl({ tmdbId:545611, tmdbType:'movie' }),'https://www.themoviedb.org/movie/545611/reviews')
  assert.equal(tmdbReviewsUrl({ tmdbId:1396, tmdbType:'tv' }),'https://www.themoviedb.org/tv/1396/reviews')
  assert.equal(tmdbReviewsUrl({ tmdbId:undefined, tmdbType:undefined }),undefined)
})

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
  assert.equal(result.items[0].tmdbMatchAttempted,true)
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
  const result = await enrichWithTmdb(sdk,[item({ title:'Antz', year:1998, mediaKind:'movie', artwork:{ src:'custom', x:50, y:50, mode:'cover' } })],undefined,createTmdbSession(sdk,{ minGapMs:0, sleep:async () => {} }))
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

type Reply = { status?:number; body?:unknown }
/** A fake TMDB: `route` answers each URL; every request is recorded with its start time. */
function fakeTmdb(route: (url:string) => Reply | Promise<Reply>, delayMs = 1) {
  const calls: Array<{ url:string; at:number }> = []
  let active = 0
  let maxActive = 0
  const sdk = {
    async networkFetch(url:string) {
      calls.push({ url, at:Date.now() })
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, delayMs))
      const reply = await route(url)
      active -= 1
      const status = reply.status ?? 200
      return { ok:status < 300, status, statusText:String(status), json:async () => reply.body ?? {}, text:async () => JSON.stringify(reply.body ?? {}) }
    },
  } as any
  return { sdk, calls, maxActive:() => maxActive }
}
const instant = (sdk:any, extra = {}) => createTmdbSession(sdk, { minGapMs:0, sleep:async () => {}, ...extra })

test('paces requests: at most two in flight, a gap between starts', async () => {
  const fake = fakeTmdb(url => url.includes('/genre/') ? { body:{ genres:[] } } : { body:{ results:[] } }, 30)
  const titles = Array.from({ length:6 }, (_, index) => item({ id:`m${index}`, title:`Nothing ${index}`, mediaKind:'movie' }))
  await enrichWithTmdb(fake.sdk, titles, undefined, createTmdbSession(fake.sdk, { minGapMs:20 }))
  assert.equal(fake.maxActive() <= 2, true)
  const starts = fake.calls.map(call => call.at)
  for (let index = 1; index < starts.length; index += 1) assert.equal(starts[index] - starts[index - 1] >= 15, true, `gap before request ${index}`)
})

test('waits and retries when TMDB says 429, and on a 5xx', async () => {
  let searches = 0
  const waits: number[] = []
  const fake = fakeTmdb(url => {
    if (url.includes('/genre/')) return { body:{ genres:[] } }
    if (url.includes('/search/movie')) {
      searches += 1
      if (searches === 1) return { status:429 }
      if (searches === 2) return { status:503 }
      return { body:{ results:[{ id:8916, title:'Antz', release_date:'1998-10-02' }] } }
    }
    return { body:{} }
  })
  const result = await enrichWithTmdb(fake.sdk, [item({ title:'Antz', mediaKind:'movie' })], undefined, instant(fake.sdk, { sleep:async (ms:number) => { waits.push(ms) } }))
  assert.equal(result.matched, 1)
  assert.deepEqual(waits, [2000, 1000])
})

test('a title still failing after its retries is left for the next run; the others go on', async () => {
  const fake = fakeTmdb(url => {
    if (url.includes('/genre/')) return { body:{ genres:[] } }
    if (url.includes('query=Broken')) return { status:500 }
    if (url.includes('query=Antz')) return { body:{ results:[{ id:8916, title:'Antz', release_date:'1998-10-02' }] } }
    return { body:{} }
  })
  const result = await enrichWithTmdb(fake.sdk, [item({ id:'a', title:'Broken', mediaKind:'movie' }), item({ id:'b', title:'Antz', mediaKind:'movie' })], undefined, instant(fake.sdk))
  assert.equal(result.matched, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.items[0].tmdbMatchAttempted, undefined)
  assert.equal(result.items[1].tmdbId, 8916)
})

test('a rejected token stops the whole run', async () => {
  const fake = fakeTmdb(url => url.includes('/genre/') ? { body:{ genres:[] } } : { status:401 })
  await assert.rejects(enrichWithTmdb(fake.sdk, [item({ title:'Antz', mediaKind:'movie' })], undefined, instant(fake.sdk)), /rejected the API Read Access Token/)
})

test('asks for a show and its season once for all its episodes, and places Batman Beyond', async () => {
  const fake = fakeTmdb(url => {
    if (url.includes('/genre/tv')) return { body:{ genres:[{ id:16, name:'Animation' }] } }
    if (url.includes('/search/tv')) return { body:{ results:[
      { id:1, name:'The Batman', first_air_date:'2004-09-11' },
      { id:513, name:'Batman Beyond', first_air_date:'1999-01-10', poster_path:'/bb.jpg', backdrop_path:'/bb-wide.jpg', genre_ids:[16] },
    ] } }
    if (url.includes('/tv/513/season/1')) return { body:{ poster_path:'/s1.jpg', episodes:[
      { episode_number:1, name:'Rebirth (1)', overview:'Neo-Gotham.', air_date:'1999-01-10', still_path:'/e1.jpg' },
      { episode_number:2, name:'Rebirth (2)', overview:'Terry takes the suit.', air_date:'1999-01-10' },
    ] } }
    return { body:{} }
  })
  const episode = (number:number) => item({ id:`e${number}`, title:`S01E0${number}`, year:1999, mediaKind:'episode', seriesTitle:'Batman Beyond', seasonNumber:1, episodeNumber:number, metadataSearchTitles:['Batman Beyond'] })
  const extra = item({ id:'x', title:'Special · Beyond Batman Beyond', year:1999, mediaKind:'episode', seriesTitle:'Batman Beyond', seasonNumber:0, metadataSearchTitles:['Batman Beyond'] })
  const folderExtra = item({ id:'f', title:'Outakes', mediaKind:'movie', extraOf:'F:\\Movies\\Batman Beyond', tmdbMatchAttempted:true })
  const result = await enrichWithTmdb(fake.sdk, [episode(1), episode(2), extra, folderExtra], undefined, instant(fake.sdk))
  assert.equal(result.matched, 3)
  // An extras folder's video is never asked of TMDB.
  assert.equal(result.items[3].tmdbId, undefined)
  assert.equal(fake.calls.some(call => call.url.includes('query=Outakes')), false)
  assert.equal(fake.calls.filter(call => call.url.includes('/search/tv')).length, 1)
  assert.equal(fake.calls.filter(call => call.url.includes('/season/1')).length, 1)
  assert.equal(result.items[0].title, 'S01E01 · Rebirth (1)')
  assert.equal(result.items[0].tmdbStillPath, '/e1.jpg')
  // No still for episode 2: the show's backdrop stands in; the season poster for both.
  assert.equal(result.items[1].tmdbStillPath, '/bb-wide.jpg')
  assert.equal(result.items[1].tmdbPosterPath, '/s1.jpg')
  // A numberless special: the show's metadata and poster, its own title.
  assert.equal(result.items[2].title, 'Special · Beyond Batman Beyond')
  assert.equal(result.items[2].tmdbId, 513)
  assert.equal(result.items[2].tmdbPosterPath, '/bb.jpg')
})

test('places an episode numbered from the start of the show in its real season', async () => {
  const fake = fakeTmdb(url => {
    if (url.includes('/genre/')) return { body:{ genres:[] } }
    if (url.includes('/search/tv')) return { body:{ results:[{ id:46260, name:'Naruto', first_air_date:'2002-10-03' }] } }
    if (url.includes('/tv/46260/season/1')) return { body:{ episodes:Array.from({ length:57 }, (_, index) => ({ episode_number:index + 1 })) } }
    if (url.includes('/tv/46260/season/2')) return { body:{ episodes:Array.from({ length:43 }, (_, index) => ({ episode_number:index + 1, name:`Two-${index + 1}` })) } }
    if (url.match(/\/tv\/46260\?/)) return { body:{ seasons:[{ season_number:0, episode_count:3 }, { season_number:1, episode_count:57 }, { season_number:2, episode_count:43 }] } }
    return { body:{} }
  })
  const result = await enrichWithTmdb(fake.sdk, [item({ title:'S01E60', mediaKind:'episode', seriesTitle:'Naruto', seasonNumber:1, episodeNumber:60 })], undefined, instant(fake.sdk))
  assert.equal(result.items[0].seasonNumber, 2)
  assert.equal(result.items[0].episodeNumber, 3)
  assert.equal(result.items[0].title, 'S02E03 · Two-3')
})

test('a movie whose file name finds nothing is searched by its folder', async () => {
  const fake = fakeTmdb(url => {
    if (url.includes('/genre/')) return { body:{ genres:[] } }
    if (url.includes('query=Heat')) return { body:{ results:[{ id:949, title:'Heat', release_date:'1995-12-15' }] } }
    if (url.includes('/search/movie')) return { body:{ results:[] } }
    return { body:{} }
  })
  const result = await enrichWithTmdb(fake.sdk, [item({ title:'hxt cd1', mediaKind:'movie', folderSearchTitles:['Heat'] })], undefined, instant(fake.sdk))
  assert.equal(result.items[0].tmdbId, 949)
  assert.equal(result.items[0].title, 'Heat')
})

test('a record of the wrong kind (matched as a movie, now an episode) is not restored', () => {
  const local = item({ path:'F:\\Show\\Season 1\\Episode 1.avi', mediaKind:'episode', seriesTitle:'Show', seasonNumber:1, episodeNumber:1 })
  const asMovie = persistedTmdbMetadata({ ...local, metadataSource:'tmdb', tmdbId:5, tmdbType:'movie' })!
  assert.equal(restorePersistedTmdbMetadata([local], { [local.path!]:asMovie }).restored, 0)
})

test('records of extras are never restored onto them', () => {
  const local = item({ path:'F:\\T\\Featurettes\\Outakes.mkv', mediaKind:'movie', extraOf:'F:\\T', tmdbMatchAttempted:true })
  const wrong = persistedTmdbMetadata({ ...local, title:'Tucker and Dale vs. Evil', metadataSource:'tmdb', tmdbId:46838, tmdbType:'movie' })!
  assert.equal(restorePersistedTmdbMetadata([local], { [local.path!]:wrong }).restored, 0)
})
