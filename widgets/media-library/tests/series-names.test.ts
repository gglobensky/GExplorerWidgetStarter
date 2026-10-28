import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleMovieExtras, cleanShowName, createScannedLibrary, extrasOwnerFolder, flattenLibraryExtras, isExtrasFolderName, parseSeriesContext, parseSeriesEpisode } from '../media.ts'
import type { ScannedVideo } from '../scanner.ts'

// Guillaume's real layout (screenshot 2026-10-26).
const ROOT = 'F:\\Movies'
const SHOW = `${ROOT}\\Batman Beyond  (DC Comics Classic Collection) The Complete Series (1999) Xvid 2 ch AVI`
const SEASON_ONE = `${SHOW}\\Batman Beyond Season One (1999)`

function video(path: string, sourceRoot = ROOT, durationMs = 22 * 60_000): ScannedVideo {
  const name = path.split('\\').pop()!
  return { path, name, extension:`.${name.split('.').pop()}`, size:100, modifiedAt:1, sourceRoot, probe:{ path, durationMs } }
}

test('cleans release words out of a show folder', () => {
  assert.equal(cleanShowName('Batman Beyond  (DC Comics Classic Collection) The Complete Series (1999) Xvid 2 ch AVI'), 'Batman Beyond')
  assert.equal(cleanShowName('The.Wire.The.Complete.Series.1080p.BluRay'), 'The Wire')
  assert.equal(cleanShowName('Seinfeld Seasons 1-9 DVDRip'), 'Seinfeld')
  assert.equal(cleanShowName('Doctor Who (2005)'), 'Doctor Who')
  assert.equal(cleanShowName('Gem Show'), 'Gem Show')
  // A show whose own name starts with a release word keeps it.
  assert.equal(cleanShowName('The Collection'), 'The Collection')
})

test('recognizes Batman Beyond: "Season 1, Episode 01" under "<Show> Season One (1999)"', () => {
  const parsed = parseSeriesContext(`${SEASON_ONE}\\Season 1, Episode 01 - Rebirth (Part 1).avi`, ROOT)
  assert.deepEqual(parsed?.episode, { seriesTitle:'Batman Beyond', seasonNumber:1, episodeNumber:1, episodeTitle:'Rebirth (Part 1)' })
  assert.equal(parsed?.context.year, 1999)
  assert.equal(parsed?.context.showFolder, SHOW)
  assert.deepEqual(parseSeriesEpisode(`${SHOW}\\Batman Beyond Season Three (2000)\\Season 3, Episode 05 - Eyewitness.avi`, ROOT), {
    seriesTitle:'Batman Beyond', seasonNumber:3, episodeNumber:5, episodeTitle:'Eyewitness',
  })
  assert.equal(parseSeriesEpisode(`${SEASON_ONE}\\Season 1, Episode 12 - A Touch of Curaré.avi`, ROOT)?.episodeTitle, 'A Touch of Curaré')
})

test('recognizes the common episode spellings', () => {
  const cases: Array<[string, number, number, string]> = [
    ['D:\\TV\\Breaking.Bad.S01E01.Pilot.720p.mkv', 1, 1, 'Breaking Bad'],
    ['D:\\TV\\Show S01 E02.mkv', 1, 2, 'Show'],
    ['D:\\TV\\Show.S02.E03.mkv', 2, 3, 'Show'],
    ['D:\\TV\\Show S01E01E02.mkv', 1, 1, 'Show'],
    ['D:\\TV\\Lost\\Saison 2\\Lost.2x05.mkv', 2, 5, 'Lost'],
    ['D:\\TV\\Friends\\Friends S03\\Friends - 3x10 - The One Where.mkv', 3, 10, 'Friends'],
    ['D:\\Anime\\Cowboy Bebop\\Cowboy Bebop Ep_05.mkv', 1, 5, 'Cowboy Bebop'],
    ['D:\\Anime\\Cowboy Bebop\\Cowboy.Bebop.Ep.06.mkv', 1, 6, 'Cowboy Bebop'],
    ['D:\\Anime\\Cowboy Bebop\\Cowboy Bebop Episode 7.mkv', 1, 7, 'Cowboy Bebop'],
    ['D:\\Anime\\Cowboy Bebop\\Cowboy Bebop E08.mkv', 1, 8, 'Cowboy Bebop'],
    ['D:\\TV\\Dark\\Staffel 1\\Folge 3.mkv', 1, 3, 'Dark'],
    ['D:\\TV\\Les Simpson\\Saison deux\\Episode 7.avi', 2, 7, 'Les Simpson'],
    ['D:\\TV\\Show\\Season 1\\Show - Season 1 Episode 4.mkv', 1, 4, 'Show'],
  ]
  for (const [path, season, episode, show] of cases) {
    const parsed = parseSeriesEpisode(path, path.split('\\').slice(0, 2).join('\\'))
    assert.equal(parsed?.seasonNumber, season, path)
    assert.equal(parsed?.episodeNumber, episode, path)
    assert.equal(parsed?.seriesTitle, show, path)
  }
  assert.deepEqual(parseSeriesEpisode('D:\\TV\\Doctor Who (2005)\\Specials\\The Christmas Invasion.mkv', 'D:\\TV'), {
    seriesTitle:'Doctor Who', seasonNumber:0, episodeTitle:'The Christmas Invasion',
  })
})

test('bare numbers are episodes only in a season folder or among numbered siblings', () => {
  assert.equal(parseSeriesEpisode('D:\\Anime\\Naruto\\012 - Title.mkv', 'D:\\Anime', { numberedSiblings:12 })?.episodeNumber, 12)
  assert.equal(parseSeriesEpisode('D:\\Anime\\Naruto\\[Group] Naruto - 013 [720p].mkv', 'D:\\Anime', { numberedSiblings:12 })?.episodeTitle, '')
  assert.equal(parseSeriesEpisode('D:\\Movies\\Collection\\01 - Rocky.mkv', 'D:\\Movies', { numberedSiblings:1 }), null)
  assert.equal(parseSeriesEpisode('D:\\Movies\\01 - Rocky.mkv', 'D:\\Movies', { numberedSiblings:9 }), null)
})

test('movies that look like episodes stay movies', () => {
  for (const path of [
    'D:\\Movies\\Star Wars Episode 4 - A New Hope (1977).mkv',
    'D:\\Movies\\Heat (1995)\\Heat.1995.1080p.mkv',
    'D:\\Movies\\1920x1080 demo.mkv',
    'D:\\Movies\\District 9 (2009).mkv',
    'D:\\Movies\\Apollo 13\\Apollo 13.mkv',
    'D:\\Movies\\Se7en (1995).mkv',
  ]) assert.equal(parseSeriesEpisode(path, 'D:\\Movies'), null, path)
})

test('a show\'s Extras (and its "Season 3 Extras" subfolder) go to every episode and the movie beside them', () => {
  const JOKER = `${SHOW}\\Batman Beyond - Return of the Joker (The Original Uncut Version) (2000)`
  const items = bundleMovieExtras(createScannedLibrary([
    video(`${SEASON_ONE}\\Season 1, Episode 02 - Rebirth (Part 2).avi`),
    video(`${SEASON_ONE}\\Season 1, Episode 01 - Rebirth (Part 1).avi`),
    video(`${SHOW}\\Batman Beyond Season Three (2001)\\Season 3, Episode 05 - Out of the Past.avi`),
    video(`${SHOW}\\Extras\\Beyond Batman Beyond.avi`, ROOT, 12 * 60_000),
    video(`${SHOW}\\Extras\\Inside Batman Beyond - The Panel 01.avi`, ROOT, 8 * 60_000),
    video(`${SHOW}\\Extras\\Season 3 Extras\\Out of the Past.avi`, ROOT, 22 * 60_000),
    video(`${SHOW}\\Extras\\Season 3 Extras\\The Call (Part 1) (1).avi`, ROOT, 22 * 60_000),
    video(`${JOKER}\\Batman Beyond - Return of the Joker (The Original Uncut Version) (2000).avi`, ROOT, 76 * 60_000),
  ], ['', ''], new Map()))
  // No show called "Extras", no extras on the shelves.
  assert.equal(items.some(item => item.seriesTitle === 'Extras'), false)
  assert.equal(items.length, 4)
  const expected = ['Beyond Batman Beyond', 'Inside Batman Beyond - The Panel 01', 'Out of the Past', 'The Call (Part 1) (1)']
  for (const item of items) assert.deepEqual(item.extras?.map(extra => extra.title), expected, item.title)
  const joker = items.find(item => item.path?.includes('Joker'))!
  assert.equal(joker.mediaKind, 'movie')
  assert.equal(joker.metadataSearchTitles?.includes('Batman Beyond - Return of the Joker'), true)
  const extra = joker.extras![0]
  assert.equal(extra.extraOf, SHOW)
  assert.equal(extra.tmdbMatchAttempted, true)
  // Flattening for TMDB keeps each shared extra once.
  assert.equal(flattenLibraryExtras(items).length, 8)
  // A season folder inside an extras folder is not a season.
  assert.equal(parseSeriesEpisode(`${SHOW}\\Extras\\Season 3 Extras\\Out of the Past.avi`, ROOT), null)
})

test('Tucker & Dale: its Featurettes stay its extras, never TMDB titles of their own', () => {
  const FOLDER = `${ROOT}\\Tucker and Dale vs. Evil (2010) (1080p BluRay x265 HEVC 10bit AAC 5.1 RZeroX)`
  const items = bundleMovieExtras(createScannedLibrary([
    video(`${FOLDER}\\Tucker and Dale vs. Evil (2010) (1080p BluRay x265 RZeroX).mkv`, ROOT, 89 * 60_000),
    video(`${FOLDER}\\Featurettes\\Making of Tucker and Dale Vs. Evil.mkv`, ROOT, 50 * 60_000),
    video(`${FOLDER}\\Featurettes\\Outakes.mkv`, ROOT, 20 * 60_000),
    video(`${FOLDER}\\Featurettes\\Tucker and Dale ARE Evil - The College Kids' Point of View.mkv`, ROOT, 40 * 60_000),
  ], ['', ''], new Map()))
  assert.equal(items.length, 1)
  assert.deepEqual(items[0].extras?.map(extra => extra.title), [
    'Making of Tucker and Dale Vs Evil', 'Outakes', "Tucker and Dale ARE Evil - The College Kids' Point of View",
  ])
  assert.equal(items[0].extras?.every(extra => extra.tmdbMatchAttempted && !extra.folderSearchTitles), true)
})

test('names folders of extras, but not a movie folder that only sounds like one', () => {
  for (const name of ['Extras', 'Featurettes', 'Season 3 Extras', 'Special Features', 'Bonus Disc', 'Behind the Scenes', 'DVD Extras', 'Deleted Scenes', 'Trailers'])
    assert.equal(isExtrasFolderName(name), true, name)
  for (const name of ['Bonus Track (2020)', 'Batman Beyond Season One (1999)', 'Weapons (2025) [1080p]', 'Subs'])
    assert.equal(isExtrasFolderName(name), false, name)
  assert.equal(extrasOwnerFolder('D:\\Movies\\Extras\\clip.mkv', 'D:\\Movies'), undefined)
})

test('a movie gets its folder names as a last resort, never the source root', () => {
  const [inFolder] = createScannedLibrary([video('D:\\Movies\\Heat (1995)\\CD1\\heat-cd1.avi', 'D:\\Movies')], ['', ''], new Map())
  assert.deepEqual(inFolder.folderSearchTitles, ['Heat'])
  const [atRoot] = createScannedLibrary([video('D:\\Movies\\heat.avi', 'D:\\Movies')], ['', ''], new Map())
  assert.deepEqual(atRoot.folderSearchTitles, [])
})
