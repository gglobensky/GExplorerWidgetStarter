import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countSudokuSolutions, editionNumber, generateSudoku } from '../daily.ts'

function validUnit(values: number[]): boolean {
  return [...values].sort((a, b) => a - b).join('') === '123456789'
}

test('daily Sudoku is deterministic and has one solution', () => {
  const first = generateSudoku('2026-11-03')
  const again = generateSudoku('2026-11-03')
  assert.deepEqual(first, again)
  assert.equal(first.puzzle.length, 81)
  assert.equal(countSudokuSolutions(first.puzzle), 1)
  assert.ok(first.clues >= 30 && first.clues <= 40)
})

test('generated solution is valid across rows, columns and boxes', () => {
  const { solution } = generateSudoku('2026-11-04')
  for (let row = 0; row < 9; row++) assert.ok(validUnit(solution.slice(row * 9, row * 9 + 9)))
  for (let column = 0; column < 9; column++) assert.ok(validUnit(Array.from({ length: 9 }, (_, row) => solution[row * 9 + column])))
  for (let boxRow = 0; boxRow < 3; boxRow++) {
    for (let boxColumn = 0; boxColumn < 3; boxColumn++) {
      const box = []
      for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) box.push(solution[(boxRow * 3 + row) * 9 + boxColumn * 3 + column])
      assert.ok(validUnit(box))
    }
  }
})

test('edition numbers advance once per date', () => {
  assert.equal(editionNumber('2026-11-04') - editionNumber('2026-11-03'), 1)
})
