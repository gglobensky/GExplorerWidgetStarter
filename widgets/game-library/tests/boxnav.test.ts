import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boxDirectionOf, nearestSpot } from '../../../shared/library-ui/boxNav.ts'

// A shelf of three boxes, and a shelf under it of two (shifted right)
const shelf = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }, { x: 150, y: 300 }, { x: 250, y: 300 }]

test('moves to the next box on the same shelf before one on another', () => {
  assert.equal(nearestSpot({ x: 100, y: 100 }, shelf.slice(1), 'right'), 0)     // the box at 200
  assert.equal(nearestSpot({ x: 300, y: 100 }, shelf.slice(0, 2), 'left'), 1)    // the box at 200
  assert.equal(nearestSpot({ x: 300, y: 100 }, shelf.slice(3), 'right'), -1)     // nothing further right
})

test('moves up and down to the nearest box across', () => {
  assert.equal(nearestSpot({ x: 200, y: 100 }, [shelf[3], shelf[4]], 'down'), 0)  // 150 (tie: the first)
  assert.equal(nearestSpot({ x: 260, y: 300 }, shelf.slice(0, 3), 'up'), 2)        // the box at 300: nearest across
})

test('names the commands', () => {
  assert.equal(boxDirectionOf('box-up'), 'up')
  assert.equal(boxDirectionOf('play'), null)
})
