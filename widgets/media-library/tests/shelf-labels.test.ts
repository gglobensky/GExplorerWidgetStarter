import assert from 'node:assert/strict'
import test from 'node:test'
import type { MovieItem } from '../movie-types.ts'
import { moviePickNote, moviePickScore, movieTag } from '../shelf-labels.ts'

const m = (extra: Partial<MovieItem>) => ({ id: 'x', title: 'X', runtimeMinutes: 0, ...extra }) as MovieItem

test('the Video Club words: TMDB rating, else running time', () => {
  assert.equal(movieTag(m({ tmdbRating: 7.84 })), '★ 7.8')
  assert.equal(movieTag(m({ runtimeMinutes: 118 })), '1 h 58')
  assert.equal(movieTag(m({ runtimeMinutes: 42 })), '42 min')
  assert.equal(movieTag(m({})), undefined)
  assert.equal(moviePickScore(m({ tmdbRating: 8.1 })), 81)
  assert.equal(moviePickScore(m({})), undefined)
  assert.match(moviePickNote(m({ tmdbRating: 8.1 })), /\nRated 8\.1 on TMDB$/)
})
