import assert from 'node:assert/strict'
import test from 'node:test'
import { columnsFor, iconSizeOf, requestPx, sizedIconKey, stepIconSize } from '../iconSizes.ts'

test('columns follow the pane width', () => {
  assert.equal(columnsFor(1000, 104, 8), 9)   // 9 * 104 + 8 * 8 = 1000 fits exactly
  assert.equal(columnsFor(999, 104, 8), 8)
  assert.equal(columnsFor(90, 104, 8), 1)
  assert.equal(columnsFor(0, 104, 8), 1)
  assert.equal(columnsFor(216, 104, 8), 2)
})

test('icon sizes: saved value cleaned, Ctrl+wheel steps stop at the ends', () => {
  assert.equal(iconSizeOf('xl'), 'xl')
  assert.equal(iconSizeOf('huge'), 'md')
  assert.equal(stepIconSize('md', 1), 'lg')
  assert.equal(stepIconSize('xl', 1), 'xl')
  assert.equal(stepIconSize('sm', -1), 'sm')
})

test('system icons are asked for at the shown size times the pixel ratio', () => {
  assert.equal(requestPx(32), 32)
  assert.equal(requestPx(48, 1.5), 96)
  assert.equal(requestPx(112, 2), 256)
  assert.equal(requestPx(72), 96)
  assert.equal(sizedIconKey('ext:.pdf/32', 96), 'ext:.pdf/96')
  assert.equal(sizedIconKey('link:ico:abc123/32', 128), 'link:ico:abc123/128')
  assert.equal(sizedIconKey('custom', 96), 'custom')
})
