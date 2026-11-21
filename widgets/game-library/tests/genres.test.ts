import test from 'node:test'
import assert from 'node:assert/strict'
import { shelfGenres } from '../online/igdb.ts'

test('one shelf name whoever gave it (IGDB\'s singular, Steam\'s plural)', () => {
  assert.deepEqual(shelfGenres(['Sport']), ['Sports'])
  assert.deepEqual(shelfGenres(['Sports', 'Sport', 'Racing']), ['Sports', 'Racing'])
  assert.deepEqual(shelfGenres(['Simulator', 'Simulation']), ['Simulation'])
  assert.deepEqual(shelfGenres(['Puzzle', 'Platform', 'Shooter']), ['Puzzles', 'Platformers', 'Shooters'])
})

test('leaves the other names as they are, empty ones out', () => {
  assert.deepEqual(shelfGenres(['RPG', ' ', 'Indie', 'indie']), ['RPG', 'Indie'])
})
