import assert from 'node:assert/strict'
import { test } from 'node:test'
import { manualRelease, mergeReleases, type GameItem } from '../games.ts'
import { isSortMode, sortGames } from '../sort.ts'

function game(title: string, extra: Partial<GameItem> = {}, size?: number): GameItem {
  const [g] = mergeReleases([{ ...manualRelease(`C:\\G\\${title}.exe`, title), sizeOnDisk: size }])
  return { ...g, ...extra }
}
const a = game('Alpha', { year: 2001, lastPlayedAt: 5 }, 10)
const b = game('beta', { year: 2020 }, 30)
const c = game('Gamma', { lastPlayedAt: 9 })
const titles = (list: GameItem[]) => list.map(g => g.title)

test('sort: by title, case and numbers counted as people read them', () => {
  assert.deepEqual(titles(sortGames([c, b, a], 'title')), ['Alpha', 'beta', 'Gamma'])
  assert.deepEqual(titles(sortGames([game('Game 10'), game('Game 2')], 'title')), ['Game 2', 'Game 10'])
})

test('sort: last played, newest, largest; the games without it go last, by title', () => {
  assert.deepEqual(titles(sortGames([a, b, c], 'played')), ['Gamma', 'Alpha', 'beta'])
  assert.deepEqual(titles(sortGames([a, b, c], 'year')), ['beta', 'Alpha', 'Gamma'])
  assert.deepEqual(titles(sortGames([a, b, c], 'size')), ['beta', 'Alpha', 'Gamma'])
})

test('sort: best rated uses the score it is given', () => {
  const scores: Record<string, number> = { Alpha: 70, Gamma: 95 }
  assert.deepEqual(titles(sortGames([a, b, c], 'rating', g => scores[g.title])), ['Gamma', 'Alpha', 'beta'])
  assert.equal(isSortMode('rating'), true)
  assert.equal(isSortMode('nope'), false)
})
