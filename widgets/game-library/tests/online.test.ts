import assert from 'node:assert/strict'
import { test } from 'node:test'
import { epicRelease, mergeReleases, steamRelease, type GameItem } from '../games.ts'
import { due, FOUND_FOR_MS, lookUpDetails, MISSED_FOR_MS, normalizeDetails, sgdbKeyChange, withoutSgdb, type DetailsDoc } from '../online/details.ts'
import { normalizeDoc, withEdit } from '../library-store.ts'
import { createPaced, httpStatusOf, OnlineFatalError, type FetchPort, type FetchResponse } from '../online/paced.ts'
import { parseImages, pickSgdbGame, sgdbArtUrl } from '../online/sgdb.ts'
import { parseAppDetails, parseReviews, pickSearchResult, plainText, reviewWords } from '../online/steam-store.ts'

const noSleep = async () => {}

// What Steam's appdetails says, trimmed to the fields read
const PORTAL2 = {
  620: {
    success: true,
    data: {
      type: 'game', name: 'Portal 2',
      short_description: 'The &quot;Perpetual Testing Initiative&quot; has been expanded<br>to allow you to design co-op puzzles &amp; more.',
      header_image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/header.jpg?t=1745363004',
      developers: ['Valve'], publishers: ['Valve'],
      genres: [{ id: '1', description: 'Action' }, { id: '25', description: 'Adventure' }],
      release_date: { coming_soon: false, date: '18 Apr, 2011' },
      metacritic: { score: 95, url: 'https://www.metacritic.com/game/pc/portal-2' },
      screenshots: [
        { id: 0, path_thumbnail: 'https://shared.akamai.steamstatic.com/a.600x338.jpg', path_full: 'https://shared.akamai.steamstatic.com/a.1920x1080.jpg' },
        { id: 1, path_thumbnail: 'http://insecure/b.jpg', path_full: 'http://insecure/b.jpg' },
      ],
    },
  },
}

function steamGame(): GameItem {
  const [game] = mergeReleases([steamRelease({ appId: '620', name: 'Portal 2', installDir: 'C:\\S\\common\\Portal 2', library: 'C:\\S', installed: true, lastPlayed: 0, lastUpdated: 0, sizeOnDisk: 1 })])
  return { ...game, art: { box: 'C:\\S\\cache\\620\\box.jpg', hero: 'C:\\S\\cache\\620\\hero.jpg', logo: 'C:\\S\\cache\\620\\logo.png' } }
}
function epicGame(title = 'Dead Island 2'): GameItem {
  const [game] = mergeReleases([epicRelease({ appName: 'X', namespace: 'n', catalogItemId: 'i', title, installDir: 'D:\\DI2', exe: 'D:\\DI2\\di2.exe', requiresAuth: true, sizeOnDisk: 0 })])
  return game
}

/** A fake web: url pattern → answer (status, body); every request recorded. */
function web(routes: Array<[RegExp, number, unknown] | [RegExp, Error]>) {
  const calls: Array<{ url: string; auth: unknown }> = []
  const port: FetchPort = {
    networkFetch: async (url, options) => {
      calls.push({ url, auth: options?.headers?.Authorization })
      const route = routes.find(r => r[0].test(url))
      if (!route) return response(404, {})
      if (route[1] instanceof Error) throw route[1]
      return response(route[1] as number, route[2])
    },
  }
  return { port, calls }
}
function response(status: number, body: unknown): FetchResponse {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body }
}

test('steam store: descriptions become plain text', () => {
  assert.equal(plainText('A <b>bold</b> &amp; &quot;quoted&quot;&#39;s<br/>line &#x2014; end'), 'A bold & "quoted"\'s line — end')
})

test('steam store: appdetails gives the details, https screenshots only, and the library art beside the header', () => {
  const d = parseAppDetails('620', PORTAL2)!
  assert.equal(d.name, 'Portal 2')
  assert.equal(d.synopsis, 'The "Perpetual Testing Initiative" has been expanded to allow you to design co-op puzzles & more.')
  assert.deepEqual(d.genres, ['Action', 'Adventure'])
  assert.equal(d.year, 2011)
  assert.equal(d.released, '18 Apr, 2011')
  assert.equal(d.metacritic, 95)
  assert.equal(d.metacriticUrl, 'https://www.metacritic.com/game/pc/portal-2')
  assert.deepEqual(d.developers, ['Valve'])
  assert.equal(d.screenshots.length, 1)
  assert.equal(d.art.box, 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/library_600x900_2x.jpg')
  assert.equal(d.art.logo, 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/logo.png')
})

test('steam store: not found, not a game: no details', () => {
  assert.equal(parseAppDetails('1', { 1: { success: false } }), undefined)
  assert.equal(parseAppDetails('2', { 2: { success: true, data: { type: 'dlc', name: 'A DLC' } } }), undefined)
  assert.equal(parseAppDetails('3', null), undefined)
})

test('steam store: a search only counts the same title', () => {
  const body = { total: 2, items: [{ type: 'app', name: 'Dead Island 2 - Haus', id: 1 }, { type: 'app', name: 'Dead Island 2', id: 934700 }] }
  assert.equal(pickSearchResult('Dead Island 2', body), '934700')
  assert.equal(pickSearchResult('Dead Island™ 2', body), '934700')
  assert.equal(pickSearchResult('Dead Island', body), undefined)
  assert.equal(pickSearchResult('X', { items: 'nope' }), undefined)
})

test('sgdb: urls ask for still PNG or JPEG boxes of the right shape', () => {
  const url = new URL(sgdbArtUrl('box', { steam: '620' }))
  assert.equal(url.pathname, '/api/v2/grids/steam/620')
  assert.equal(url.searchParams.get('mimes'), 'image/png,image/jpeg')
  assert.equal(url.searchParams.get('types'), 'static')
  assert.match(url.searchParams.get('dimensions') ?? '', /^600x900/)
  assert.equal(new URL(sgdbArtUrl('logo', { game: 42 })).pathname, '/api/v2/logos/game/42')
  assert.equal(new URL(sgdbArtUrl('logo', { game: 42 })).searchParams.get('mimes'), 'image/png')
})

test('sgdb: images best first, WebP, animations and nsfw left out', () => {
  const body = { success: true, data: [
    { url: 'https://cdn2.steamgriddb.com/grid/a.webp' },
    { url: 'https://cdn2.steamgriddb.com/grid/b.png' },
    { url: 'https://cdn2.steamgriddb.com/grid/c.jpg', nsfw: true },
    { url: 'http://cdn2.steamgriddb.com/grid/d.jpg' },
    { url: 'https://cdn2.steamgriddb.com/grid/e.jpg' },
  ] }
  assert.deepEqual(parseImages(body), ['https://cdn2.steamgriddb.com/grid/b.png', 'https://cdn2.steamgriddb.com/grid/e.jpg'])
  assert.deepEqual(parseImages({ success: false, errors: ['Game not found'] }), [])
})

test('sgdb: a search picks the same title, a verified one first', () => {
  const body = { success: true, data: [{ id: 1, name: 'Hades II', verified: true }, { id: 2, name: 'Hades', verified: false }, { id: 3, name: 'HADES', verified: true }] }
  assert.equal(pickSgdbGame('Hades', body), 3)
  assert.equal(pickSgdbGame('Hades III', body), undefined)
})

test('details: a Steam game with its art on this computer asks Steam only (details, reviews), by its app id', async () => {
  const { port, calls } = web([[/appdetails/, 200, PORTAL2]])
  const doc: DetailsDoc = { version: 1, games: {} }
  const seen: string[] = []
  const r = await lookUpDetails(port, [steamGame()], doc, { sgdb: true, sleep: noSleep, onDetails: id => seen.push(id) })
  assert.equal(r.error, undefined)
  // Its details and its players' reviews (no reviews here: a 404), never SteamGridDB
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /appids=620/)
  assert.match(calls[1].url, /appreviewhistogram\/620/)
  assert.ok(calls.every(c => c.auth === undefined))
  const d = doc.games['game:portal 2']
  assert.equal(d.steamAppId, '620')
  assert.equal(d.metacritic, 95)
  assert.equal(d.steamFound, true)
  assert.deepEqual(seen, ['game:portal 2'])
})

test('details: an Epic game is found on Steam by title, then SteamGridDB by its Steam id, its key named for its host only', async () => {
  const { port, calls } = web([
    [/storesearch/, 200, { items: [{ type: 'app', name: 'Dead Island 2', id: 934700 }] }],
    [/appdetails/, 200, { 934700: { success: true, data: { type: 'game', name: 'Dead Island 2', genres: [{ description: 'Action' }], header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/934700/header.jpg' } } }],
    [/grids\/steam\/934700/, 200, { success: true, data: [{ url: 'https://cdn2.steamgriddb.com/grid/di2.png' }] }],
    [/heroes\/steam\/934700/, 200, { success: true, data: [{ url: 'https://cdn2.steamgriddb.com/hero/di2.jpg' }] }],
    [/logos\/steam\/934700/, 200, { success: true, data: [] }],
    [/search\/autocomplete/, 200, { success: true, data: [{ id: 77, name: 'Dead Island 2' }] }],
    [/logos\/game\/77/, 200, { success: true, data: [{ url: 'https://cdn2.steamgriddb.com/logo/di2.png' }] }],
  ])
  const doc: DetailsDoc = { version: 1, games: {} }
  const r = await lookUpDetails(port, [epicGame()], doc, { sgdb: true, sleep: noSleep, onDetails: () => {} })
  assert.equal(r.sgdbError, undefined)
  const d = doc.games['game:dead island 2']
  assert.equal(d.steamAppId, '934700')
  assert.deepEqual(d.genres, ['Action'])
  // SteamGridDB first, Steam's servers after
  assert.deepEqual(d.art?.box, ['https://cdn2.steamgriddb.com/grid/di2.png', 'https://cdn.akamai.steamstatic.com/steam/apps/934700/library_600x900_2x.jpg'])
  assert.deepEqual(d.art?.logo, ['https://cdn2.steamgriddb.com/logo/di2.png', 'https://cdn.akamai.steamstatic.com/steam/apps/934700/logo.png'])
  assert.equal(d.sgdbFound, true)
  for (const c of calls) {
    if (c.url.startsWith('https://www.steamgriddb.com/')) assert.deepEqual(c.auth, { secret: 'steamgriddb', format: 'Bearer {}' })
    else assert.equal(c.auth, undefined)
  }
})

test('details: a refused SteamGridDB key stops SteamGridDB, not Steam', async () => {
  const { port, calls } = web([
    [/storesearch/, 200, { items: [] }],
    [/steamgriddb/, 401, { success: false }],
  ])
  const doc: DetailsDoc = { version: 1, games: {} }
  const r = await lookUpDetails(port, [epicGame('A'), epicGame('B'), epicGame('C')], doc, { sgdb: true, sleep: noSleep, onDetails: () => {} })
  assert.equal(r.error, undefined)
  assert.match(r.sgdbError ?? '', /SteamGridDB refused/)
  assert.equal(calls.filter(c => c.url.includes('storesearch')).length, 3)
  assert.ok(calls.filter(c => c.url.includes('steamgriddb')).length <= 2)   // two games at a time: at most one each
  assert.equal(doc.games['game:a'].steamFound, false)
})

test('details: GEM Shell refusing the network stops the run, and says why', async () => {
  const refused = Object.assign(new Error('E_NEEDS_NETWORK: the user refused'), { code: 'E_NEEDS_NETWORK' })
  const { port, calls } = web([[/./, refused]])
  const doc: DetailsDoc = { version: 1, games: {} }
  const r = await lookUpDetails(port, [epicGame('A'), epicGame('B'), epicGame('C'), epicGame('D')], doc, { sgdb: false, sleep: noSleep, onDetails: () => {} })
  assert.match(r.error ?? '', /E_NEEDS_NETWORK/)
  assert.ok(calls.length <= 2)
})

test('details: a 5xx is tried again, a 429 waited out', async () => {
  let n = 0
  const waits: number[] = []
  const port: FetchPort = { networkFetch: async () => (++n < 3 ? response(n === 1 ? 503 : 429, {}) : response(200, PORTAL2)) }
  const doc: DetailsDoc = { version: 1, games: {} }
  await lookUpDetails(port, [steamGame()], doc, { sgdb: false, sleep: async ms => { waits.push(ms) }, onDetails: () => {} })
  assert.equal(doc.games['game:portal 2'].steamFound, true)
  assert.ok(waits.includes(1000) && waits.includes(2000))
})

test('details: found again after 30 days, not found after a week; SteamGridDB only for missing art', () => {
  const now = 1_000 * FOUND_FOR_MS
  const steam = steamGame()
  assert.deepEqual(due(steam, undefined, true, now), { steam: true, sgdb: false, reviews: true, igdb: false })
  assert.deepEqual(due(steam, { steamAt: now - FOUND_FOR_MS + 1, steamFound: true, reviewsAt: now - 1 }, true, now), { steam: false, sgdb: false, reviews: false, igdb: false })
  assert.deepEqual(due(steam, { steamAt: now - MISSED_FOR_MS - 1, steamFound: false, reviewsAt: now - MISSED_FOR_MS - 1 }, true, now), { steam: true, sgdb: false, reviews: true, igdb: false })
  const epic = epicGame()
  // Not known on Steam: no reviews to ask for
  assert.deepEqual(due(epic, { steamAt: now, steamFound: true }, true, now), { steam: false, sgdb: true, reviews: false, igdb: false })
  assert.deepEqual(due(epic, { steamAt: now, steamFound: true, steamAppId: '9', reviewsAt: now }, false, now), { steam: false, sgdb: false, reviews: false, igdb: false })
  // IGDB (0.11.0): only with the Twitch app; like Steam, a month when found, a week when not
  assert.equal(due(epic, { steamAt: now, steamFound: true }, false, now, true).igdb, true)
  assert.equal(due(epic, { steamAt: now, steamFound: true, igdbAt: now - MISSED_FOR_MS + 1, igdbFound: false }, false, now, true).igdb, false)
  assert.equal(due(epic, { steamAt: now, steamFound: true, igdbAt: now - MISSED_FOR_MS - 1, igdbFound: false }, false, now, true).igdb, true)
})

test('details: what was saved is checked', () => {
  const doc = normalizeDetails({ games: {
    'game:a': { synopsis: 'Fine', genres: ['Action', 3], art: { box: ['https://x/a.png', 'http://x/b.png', 'javascript:alert(1)'] }, steamAppId: '12', metacritic: 'high' },
    'not-a-game': { synopsis: 'x' },
    'game:b': 'junk',
  } })
  assert.deepEqual(Object.keys(doc.games), ['game:a'])
  assert.deepEqual(doc.games['game:a'].genres, ['Action'])
  assert.deepEqual(doc.games['game:a'].art?.box, ['https://x/a.png'])
  assert.equal(doc.games['game:a'].metacritic, undefined)
  assert.deepEqual(normalizeDetails(null), { version: 1, games: {} })
})

test('details: progress counts the games due, once at the start and after each', async () => {
  const { port } = web([[/appdetails/, 200, PORTAL2]])
  const doc: DetailsDoc = { version: 1, games: {} }
  const seen: string[] = []
  const r = await lookUpDetails(port, [steamGame()], doc, { sgdb: false, sleep: noSleep, onDetails: () => {}, onProgress: (d, t) => seen.push(`${d}/${t}`) })
  assert.deepEqual(seen, ['0/1', '1/1'])
  assert.equal(r.due, 1)
  // Nothing due now: no game counted
  const again: string[] = []
  const r2 = await lookUpDetails(port, [steamGame()], doc, { sgdb: false, sleep: noSleep, onDetails: () => {}, onProgress: (d, t) => again.push(`${d}/${t}`) })
  assert.deepEqual(again, ['0/0'])
  assert.equal(r2.asked, 0)
})

test('details: forgetting SteamGridDB takes its pictures, keeps Steam\'s, and asks it again next time', () => {
  const doc: DetailsDoc = { version: 1, games: {
    'game:a': { sgdbAt: 5, sgdbFound: true, art: { box: ['https://cdn2.steamgriddb.com/grid/a.png', 'https://cdn.akamai.steamstatic.com/steam/apps/1/library_600x900_2x.jpg'], logo: ['https://cdn2.steamgriddb.com/logo/a.png'] } },
    'game:b': { steamAt: 5, steamFound: true },
  } }
  const { doc: out, removed } = withoutSgdb(doc)
  assert.equal(removed, 1)
  assert.deepEqual(out.games['game:a'].art, { box: ['https://cdn.akamai.steamstatic.com/steam/apps/1/library_600x900_2x.jpg'] })
  assert.equal(out.games['game:a'].sgdbAt, undefined)
  assert.deepEqual(out.games['game:b'], { steamAt: 5, steamFound: true })
  assert.ok(doc.games['game:a'].art?.logo, 'the original is left as it was')
})

test('details: a SteamGridDB key set or forgotten while no Game Shop was open is caught up with', () => {
  const doc: DetailsDoc = { version: 1, sgdbKey: true, games: {
    'game:a': { sgdbAt: 5, sgdbFound: true, art: { box: ['https://cdn2.steamgriddb.com/grid/a.png'] } },
    'game:b': { sgdbAt: 5, sgdbFound: false },
  } }
  assert.equal(sgdbKeyChange(doc, true), null, 'no change since the last look')
  const forgotten = sgdbKeyChange(doc, false)!
  assert.equal(forgotten.removed, 1)
  assert.equal(forgotten.doc.sgdbKey, false)
  assert.equal(forgotten.doc.games['game:a'].art, undefined)
  const set = sgdbKeyChange({ ...doc, sgdbKey: false }, true)!
  assert.equal(set.doc.sgdbKey, true)
  assert.equal(set.doc.games['game:a'].sgdbAt, 5, 'found: kept')
  assert.equal(set.doc.games['game:b'].sgdbAt, undefined, 'asked without a key: due again')
  assert.equal(normalizeDetails({ sgdbKey: false, games: {} }).sgdbKey, false)
})

test('edits: written here, kept over Steam\'s, null goes back', () => {
  let doc = normalizeDoc(null)
  doc = withEdit(doc, 'game:a', { genres: ['Puzzle'], synopsis: 'Mine' })
  assert.deepEqual(doc.edits['game:a'], { genres: ['Puzzle'], synopsis: 'Mine' })
  doc = withEdit(doc, 'game:a', { synopsis: null })
  assert.deepEqual(doc.edits['game:a'], { genres: ['Puzzle'] })
  doc = withEdit(doc, 'game:a', { genres: null })
  assert.equal(doc.edits['game:a'], undefined)
  const read = normalizeDoc({ edits: { 'game:x': { genres: ['A', 3, ' '], synopsis: '  ' }, 'game:y': { synopsis: 'Kept' }, bad: { synopsis: 'x' } } })
  assert.deepEqual(read.edits, { 'game:x': { genres: ['A'] }, 'game:y': { synopsis: 'Kept' } })
})

test('steam reviews: the store\'s monthly totals added up, in Steam\'s words', () => {
  // 7 Days to Die on 2026-11-01, two months for short: 86% → Very Positive
  const body = { success: 1, results: { rollup_type: 'month', rollups: [
    { date: 1, recommendations_up: 254_000, recommendations_down: 40_700 },
    { date: 2, recommendations_up: 685, recommendations_down: 80 },
  ] } }
  assert.deepEqual(parseReviews(body), { desc: 'Very Positive', score: 8, positive: 254_685, total: 295_465 })
  assert.equal(parseReviews({ success: 1, results: { rollups: [] } }), undefined)
  assert.equal(parseReviews({ success: 2 }), undefined)
  assert.equal(parseReviews('<!DOCTYPE html>'), undefined)
  assert.equal(reviewWords(990, 1000).desc, 'Overwhelmingly Positive')
  assert.equal(reviewWords(97, 100).desc, 'Very Positive')
  assert.equal(reviewWords(19, 20).desc, 'Positive')
  assert.equal(reviewWords(75, 100).desc, 'Mostly Positive')
  assert.equal(reviewWords(50, 100).desc, 'Mixed')
  assert.equal(reviewWords(30, 100).desc, 'Mostly Negative')
  assert.equal(reviewWords(5, 1000).desc, 'Overwhelmingly Negative')
  assert.deepEqual(reviewWords(3, 3), { desc: '3 user reviews', score: 0 })
})

test('details: a Steam game gets its players\' reviews with its details, then weekly', async () => {
  const { port, calls } = web([
    [/appdetails/, 200, PORTAL2],
    [/appreviewhistogram\/620/, 200, { success: 1, results: { rollups: [{ recommendations_up: 990, recommendations_down: 10 }] } }],
  ])
  const doc: DetailsDoc = { version: 1, games: {} }
  let t = 1_000_000
  await lookUpDetails(port, [steamGame()], doc, { sgdb: false, sleep: noSleep, now: () => t, onDetails: () => {} })
  assert.deepEqual(doc.games['game:portal 2'].reviews, { desc: 'Overwhelmingly Positive', score: 9, positive: 990, total: 1000 })
  assert.match(calls[1].url, /appreviewhistogram\/620\?l=english&review_score_preference=0/)
  // A week and a day later: only the reviews
  t += MISSED_FOR_MS + 86_400_000
  await lookUpDetails(port, [steamGame()], doc, { sgdb: false, sleep: noSleep, now: () => t, onDetails: () => {} })
  assert.equal(calls.length, 3)
  assert.match(calls[2].url, /appreviewhistogram/)
})

test('paced: GEM Shell rejecting an answer that isn\'t 2xx is read as its status', async () => {
  assert.equal(httpStatusOf('HTTP 404: Not Found'), 404)
  assert.equal(httpStatusOf('Network error: reset'), undefined)
  const fail = (m: string) => async (): Promise<FetchResponse> => { throw new Error(m) }
  const waits: number[] = []
  const sleep = async (ms: number) => { waits.push(ms) }
  // 404: null at once, no retry
  assert.equal(await createPaced({ networkFetch: fail('HTTP 404: Not Found') }, { service: 'X', minGapMs: 0, sleep }).json('https://x'), null)
  assert.deepEqual(waits, [])
  // 401 for a service that names it fatal: stops
  await assert.rejects(createPaced({ networkFetch: fail('HTTP 401: Unauthorized') }, { service: 'SteamGridDB', minGapMs: 0, fatalStatuses: [401], sleep }).json('https://x'), OnlineFatalError)
  // 429 then fine: waited out
  let n = 0
  const port: FetchPort = { networkFetch: async () => { if (++n === 1) throw new Error('HTTP 429: Too Many Requests'); return response(200, { fine: true }) } }
  assert.deepEqual(await createPaced(port, { service: 'Steam', minGapMs: 0, sleep }).json('https://x'), { fine: true })
  assert.deepEqual(waits, [2000])
  // The shell's own refusal: fatal
  await assert.rejects(createPaced({ networkFetch: fail('Network permission denied by user') }, { service: 'Steam', minGapMs: 0, sleep }).json('https://x'), OnlineFatalError)
})
