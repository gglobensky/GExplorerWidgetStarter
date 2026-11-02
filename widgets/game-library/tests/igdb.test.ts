import assert from 'node:assert/strict'
import { test } from 'node:test'
import { epicRelease, mergeReleases, type GameItem } from '../games.ts'
import { findOnIgdb, igdbIdOfSteam, igdbImage, igdbSession, parseIgdbGame, simpleGenre } from '../online/igdb.ts'
import { lookUpDetails, normalizeDetails, type DetailsDoc } from '../online/details.ts'
import type { FetchPort } from '../online/paced.ts'

const noSleep = async () => {}
type Call = { url: string; method?: string; body?: string; headers?: Record<string, unknown> }

/** IGDB, Steam's store and SteamGridDB answered from a table; every call kept. */
function fakePort(answer: (call: Call) => unknown): { port: FetchPort; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    port: {
      async networkFetch(url, options) {
        const call = { url, method: options?.method, body: options?.body, headers: options?.headers as Record<string, unknown> }
        calls.push(call)
        const json = answer(call)
        if (json === undefined) throw new Error('HTTP 404: Not Found')
        return { ok: true, status: 200, statusText: 'OK', json: async () => json }
      },
    },
  }
}

const HADES_RAW = {
  id: 113112, name: 'Hades', summary: 'Defy the god of the dead.', first_release_date: 1600300800,
  total_rating: 93.4, total_rating_count: 812, url: 'https://www.igdb.com/games/hades--1',
  genres: [{ id: 12, name: 'Role-playing (RPG)' }, { id: 31, name: 'Adventure' }],
  cover: { id: 1, image_id: 'co39vc' }, artworks: [{ id: 2, image_id: 'ar5l8' }], screenshots: [{ id: 3, image_id: 'sc6a1' }],
  platforms: [6, 130],
}

test('igdb: a game read, its genres in the shelves\' words, its pictures\' addresses', () => {
  const g = parseIgdbGame(HADES_RAW)!
  assert.equal(g.name, 'Hades')
  assert.deepEqual(g.genres, ['RPG', 'Adventure'])
  assert.equal(g.rating, 93)
  assert.equal(g.released, 1600300800000)
  assert.equal(g.cover, 'co39vc')
  assert.equal(igdbImage('co39vc'), 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co39vc.jpg')
  assert.equal(parseIgdbGame({ name: 'no id' }), null)
  assert.equal(simpleGenre('Shooter'), 'Shooter')
})

test('igdb: the client id and the token are named, never written; queries go as POST bodies', async () => {
  const { port, calls } = fakePort(c => (c.url.endsWith('/games') ? [HADES_RAW, { ...HADES_RAW, id: 9, name: 'Hades II', total_rating_count: 5000 }] : []))
  const found = await findOnIgdb(igdbSession(port, noSleep), 'HADES')
  assert.equal(found?.id, 113112, 'only the same title counts, not the better rated sequel')
  assert.equal(calls[0].method, 'POST')
  assert.match(calls[0].body ?? '', /^search "HADES"; fields .*where platforms = \(6\); limit 10;$/)
  assert.deepEqual(calls[0].headers?.['Client-ID'], { secret: 'igdb', part: 'clientId' })
  assert.deepEqual(calls[0].headers?.Authorization, { secret: 'igdb', part: 'token', format: 'Bearer {}' })
  const quoted = fakePort(() => [])
  await findOnIgdb(igdbSession(quoted.port, noSleep), 'Say "hi"')
  assert.match(quoted.calls[0].body ?? '', /^search "Say \\"hi\\""/)
})

test('igdb: a Steam game is found by its app id (the store links), whatever the field says it is Steam\'s', async () => {
  const { port } = fakePort(c => c.url.endsWith('/external_games')
    ? [{ id: 1, game: 77, uid: '1145360', category: 5 }, { id: 2, game: 113112, uid: '1145360', url: 'https://store.steampowered.com/app/1145360' }]
    : [])
  assert.equal(await igdbIdOfSteam(igdbSession(port, noSleep), '1145360'), 113112)
  const bySource = fakePort(() => [{ id: 3, game: 5, uid: '620', external_game_source: 1 }])
  assert.equal(await igdbIdOfSteam(igdbSession(bySource.port, noSleep), '620'), 5)
  const none = fakePort(() => [{ id: 4, game: 6, uid: '620', category: 5, url: 'https://www.gog.com/game/x' }])
  assert.equal(await igdbIdOfSteam(igdbSession(none.port, noSleep), '620'), undefined)
})

test('details: IGDB fills what Steam can\'t (a game not sold there), with its rating; asked again a month later', async () => {
  const game: GameItem = mergeReleases([epicRelease({ appName: 'Hades', title: 'Hades', installDir: 'C:\\Epic\\Hades', namespace: 'n', catalogItemId: 'c', requiresAuth: true } as any)])[0]
  const { port, calls } = fakePort(c => {
    if (c.url.includes('store.steampowered.com/api/storesearch')) return { total: 0, items: [] }
    if (c.url.endsWith('/games')) return [HADES_RAW]
    return undefined
  })
  const doc: DetailsDoc = normalizeDetails(null)
  const r = await lookUpDetails(port, [game], doc, { sgdb: false, igdb: true, sleep: noSleep, now: () => 1000, onDetails: () => {} })
  assert.equal(r.asked, 1)
  const d = doc.games[game.id]
  assert.equal(d.igdbId, 113112)
  assert.equal(d.igdbRating, 93)
  assert.equal(d.synopsis, 'Defy the god of the dead.')
  assert.deepEqual(d.genres, ['RPG', 'Adventure'])
  assert.equal(d.year, 2020)
  assert.deepEqual(d.art?.box, ['https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co39vc.jpg'])
  assert.equal(d.screenshots?.length, 1)
  assert.ok(calls.some(c => c.url.endsWith('/games')))
  // Saved and read back
  const back = normalizeDetails(JSON.parse(JSON.stringify(doc)))
  assert.equal(back.games[game.id].igdbId, 113112)
  assert.equal(back.games[game.id].igdbUrl, 'https://www.igdb.com/games/hades--1')
  // Without the Twitch app, IGDB isn't asked
  const off = fakePort(() => undefined)
  await lookUpDetails(off.port, [game], normalizeDetails(null), { sgdb: false, igdb: false, sleep: noSleep, onDetails: () => {} })
  assert.ok(!off.calls.some(c => c.url.includes('igdb')))
})

test('details: a box linked by hand takes that game (no guess on Steam), its details over what was there, its cover first', async () => {
  const game: GameItem = mergeReleases([{ store: 'manual', storeId: 'C:\\Games\\zelda3.exe', title: 'Zelda3', installed: true, launches: [{ kind: 'exe', path: 'C:\\Games\\zelda3.exe' }] }])[0]
  const ZELDA = { id: 1026, name: 'The Legend of Zelda: A Link to the Past', summary: 'Hyrule, again.', first_release_date: 690508800, genres: [{ name: 'Adventure' }], cover: { image_id: 'co1abc' }, platforms: [19] }
  const { port, calls } = fakePort(c => (c.url.endsWith('/games') ? [ZELDA] : undefined))
  const doc: DetailsDoc = normalizeDetails({ games: { [game.id]: { synopsis: 'A wrong guess', art: { box: ['https://cdn2.steamgriddb.com/grid/x.png'] } } } })
  await lookUpDetails(port, [game], doc, { sgdb: false, igdb: true, force: true, sleep: noSleep, links: { [game.id]: { igdbId: 1026, name: ZELDA.name } }, onDetails: () => {} })
  const d = doc.games[game.id]
  assert.ok(!calls.some(c => c.url.includes('steampowered')), 'Steam is not searched for a box linked by hand')
  assert.match(calls.find(c => c.url.endsWith('/games'))?.body ?? '', /where id = 1026;/)
  assert.equal(d.synopsis, 'Hyrule, again.')
  assert.equal(d.year, 1991)
  assert.equal(d.art?.box?.[0], 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1abc.jpg')
})

test('library: a link kept, and taken off', async () => {
  const { normalizeDoc, withLink } = await import('../library-store.ts')
  let doc = normalizeDoc({ links: { 'game:zelda3': { igdbId: 1026, name: 'A Link to the Past' }, 'game:bad': { igdbId: -1, name: 'x' } } })
  assert.deepEqual(doc.links, { 'game:zelda3': { igdbId: 1026, name: 'A Link to the Past' } })
  doc = withLink(doc, 'game:zelda3', null)
  assert.deepEqual(doc.links, {})
})
