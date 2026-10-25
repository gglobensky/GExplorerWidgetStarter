import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { bundleMovieExtras, collectionItems, shelvesFor, sortItems } from '../media.ts'
import { enrichWithTmdb, persistedTmdbMetadata } from '../tmdb.ts'

function movie(id: string, title: string, year: number, extra: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id, title, year, runtimeMinutes:110, rating:'LOCAL', primaryGenre:'Science Fiction', genres:['Science Fiction'], synopsis:'',
    artwork:{ src:'', x:0, y:0 }, previews:[], addedRank:0, path:`D:\\Movies\\${title}.mkv`, sourceRoot:'D:\\Movies', mediaKind:'movie', ...extra,
  }
}

const alien = movie('alien', 'Alien', 1979, { tmdbCollectionId:8091, tmdbCollectionName:'Alien Collection', addedRank:1 })
const aliens = movie('aliens', 'Aliens', 1986, { tmdbCollectionId:8091, tmdbCollectionName:'Alien Collection', addedRank:3 })
const arrival = movie('arrival', 'Arrival', 2016, { addedRank:2 })
const prometheus = movie('prometheus', 'Prometheus', 2012, { tmdbCollectionId:8091, tmdbCollectionName:'Alien Collection', addedRank:4 })
const blade = movie('blade', 'The Blade Runner', 1982, { tmdbCollectionId:422837 })

test('sorts by title (ignoring articles), release date and recently added', () => {
  const items = [prometheus, arrival, blade, aliens, alien]
  assert.deepEqual(sortItems(items,'title').map(item => item.id), ['alien','aliens','arrival','blade','prometheus'])
  assert.deepEqual(sortItems(items,'release').map(item => item.id), ['alien','blade','aliens','prometheus','arrival'])
  assert.deepEqual(sortItems(items,'added').map(item => item.id), ['prometheus','aliens','arrival','alien','blade'])
})

test('keeps sequels together in release order where the collection first appears', () => {
  assert.deepEqual(sortItems([prometheus, arrival, aliens, alien, blade],'collection').map(item => item.id), ['alien','aliens','prometheus','arrival','blade'])
})

test('a Collections shelf lists sets of two or more local movies', () => {
  const result = collectionItems([prometheus, arrival, aliens, alien, blade])
  assert.equal(result.collections, 1)
  assert.deepEqual(result.items.map(item => item.id), ['alien','aliens','prometheus'])
  const shelves = shelvesFor([prometheus, arrival, aliens, alien, blade])
  assert.deepEqual(shelves.find(shelf => shelf.id === 'collections')?.items.map(item => item.id), ['alien','aliens','prometheus'])
  assert.equal(shelvesFor([arrival, blade]).some(shelf => shelf.id === 'collections'), false)
  const second = [movie('t1','The Terminator',1984,{ tmdbCollectionId:528, tmdbCollectionName:'The Terminator Collection' }), movie('t2','Terminator 2',1991,{ tmdbCollectionId:528, tmdbCollectionName:'The Terminator Collection' })]
  const groups = shelvesFor([prometheus, aliens, alien, ...second]).find(shelf => shelf.id === 'collections')?.groups
  assert.deepEqual(groups?.map(group => [group.title, group.items.map(item => item.id)]), [['Alien Collection',['alien','aliens','prometheus']],['The Terminator Collection',['t1','t2']]])
})

test('extras: convention folders, dash suffixes, and short unrecognized videos beside an identified movie', () => {
  const root = 'D:\\Movies'
  const heat = movie('heat', 'Heat', 1995, { path:`${root}\\Heat (1995)\\Heat.mkv`, metadataSource:'tmdb', tmdbType:'movie', tmdbId:949, tmdbMatchAttempted:true })
  const folderExtra = movie('making', 'Making Of', 0, { path:`${root}\\Heat (1995)\\Featurettes\\Making Of.mkv`, runtimeMinutes:95 })
  const trailer = movie('trailer', 'Heat-trailer', 0, { path:`${root}\\Heat (1995)\\Heat-trailer.mkv`, runtimeMinutes:2 })
  const shortClip = movie('clip', 'Pacino on set', 0, { path:`${root}\\Heat (1995)\\Pacino on set.mkv`, runtimeMinutes:12, tmdbMatchAttempted:true })
  const longFilm = movie('cut', 'Something Else', 0, { path:`${root}\\Heat (1995)\\Something Else.mkv`, runtimeMinutes:128, tmdbMatchAttempted:true })
  const grouped = bundleMovieExtras([heat, folderExtra, trailer, shortClip, longFilm])
  assert.deepEqual(grouped.map(item => item.id), ['heat','cut'])
  assert.deepEqual(grouped[0].extras?.map(item => item.id), ['trailer','making','clip'])
})

test('extras without TMDB: the only video not named as an extra owns its extras folder', () => {
  const root = 'D:\\Movies'
  const film = movie('film', 'Film', 2001, { path:`${root}\\Film\\Film.mkv` })
  const deleted = movie('deleted', 'Scene 1', 0, { path:`${root}\\Film\\Deleted Scenes\\Scene 1.mkv`, runtimeMinutes:3 })
  const grouped = bundleMovieExtras([film, deleted])
  assert.deepEqual(grouped.map(item => item.id), ['film'])
  assert.deepEqual(grouped[0].extras?.map(item => item.id), ['deleted'])
  // An unrecognized long video beside an unidentified one is never folded in.
  assert.equal(bundleMovieExtras([film, movie('other', 'Other Film', 0, { path:`${root}\\Film\\Other Film.mkv` })]).some(item => item.extras?.length), false)
})

test('matching a movie keeps its collection and runtime', async () => {
  const sdk = {
    async networkFetch(url: string) {
      const body = url.includes('/genre/') ? { genres:[] }
        : url.includes('/search/movie') ? { results:[{ id:348, title:'Alien', release_date:'1979-05-25', genre_ids:[] }] }
          : url.includes('/movie/348') ? { runtime:117, belongs_to_collection:{ id:8091, name:'Alien Collection' } }
            : {}
      return { ok:true, status:200, statusText:'OK', json:async () => body, text:async () => JSON.stringify(body) }
    },
  } as any
  const result = await enrichWithTmdb(sdk, [movie('a', 'Alien', 1979, { runtimeMinutes:0 })])
  assert.equal(result.items[0].tmdbCollectionId, 8091)
  assert.equal(result.items[0].tmdbCollectionName, 'Alien Collection')
  assert.equal(result.items[0].runtimeMinutes, 117)
  assert.equal(persistedTmdbMetadata(result.items[0])?.tmdbCollectionId, 8091)
})
