import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLichessDailyPuzzle } from '../features/providers/lichess.ts'

test('Lichess daily-puzzle responses become a credited chess feature', () => {
  const puzzle = parseLichessDailyPuzzle({
    game: { id: 'FyCFwzjd', clock: '3+2' },
    puzzle: {
      id: 'm5n0s', rating: 1957, plays: 85080,
      solution: ['g1h2', 'f6g4', 'd1g4'],
      themes: ['opening', 'advantage', 'hangingPiece'],
      fen: 'r1bqr1k1/pp3ppp/2p2n2/3p2B1/8/2P1P3/PP1N1PPb/1BRQ1RK1 w - - 0 1',
    },
  }, '2026-11-03')
  assert.equal(puzzle.kind, 'chess')
  assert.equal(puzzle.provider, 'Lichess')
  assert.equal(puzzle.sourceUrl, 'https://lichess.org/training/m5n0s')
  assert.deepEqual(puzzle.solution, ['g1h2', 'f6g4', 'd1g4'])
})

test('incomplete or malformed puzzle responses are rejected', () => {
  assert.throws(() => parseLichessDailyPuzzle({ puzzle: { id: 'bad', solution: [] } }, '2026-11-03'), /complete daily puzzle/)
})
