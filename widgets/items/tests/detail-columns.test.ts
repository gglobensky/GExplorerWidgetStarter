import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPACT_PX, DEFAULT_SHOWN, fitColumns, MOD_TIME_PX, shownColumnsOf, toggleColumn } from '../detailColumns.ts'

const WEIGHTS = { name: 52, ext: 14, size: 16, mod: 28 } // the defaults (420/110/130/220), normalized
// Row padding 2 x 8, borders 2, gaps 6 between columns.
const overhead = (count: number) => 16 + 2 + 6 * Math.max(0, count - 1)
const tracks = (fit: ReturnType<typeof fitColumns>) => fit.visible.reduce((sum, col) => sum + (fit.widths[col] ?? 0), 0)

test('wide: every column, shared by weight, filling the row exactly', () => {
  const fit = fitColumns(1000, overhead, WEIGHTS)
  assert.deepEqual(fit.visible, ['name', 'ext', 'size', 'mod'])
  assert.equal(fit.room, 3)
  assert.equal(tracks(fit), 1000 - overhead(4))
  assert.equal(fit.dateOnly, false)
})

test('narrower: chosen columns stay in the user\'s order of choice; the oldest choice gives way', () => {
  // Room for Name + one column: the most recent choice.
  const fit = fitColumns(260, overhead, WEIGHTS, ['size', 'mod', 'ext'])
  assert.deepEqual(fit.visible, ['name', 'size'])
  assert.equal(fit.room, 1)
  assert.deepEqual(fit.squeezed, ['mod', 'ext'])
  assert.deepEqual(fitColumns(260, overhead, WEIGHTS).visible, ['name', 'mod'])
  // Room for none: Name alone, never overflowing.
  for (let width = 40; width <= 1400; width += 7) {
    const any = fitColumns(width, overhead, WEIGHTS)
    assert.equal(tracks(any) + overhead(any.visible.length) <= width, true, `overflow at ${width}`)
  }
  assert.deepEqual(fitColumns(120, overhead, WEIGHTS).visible, ['name'])
})

test('the menu: ticking a hidden column puts it first; unticking a shown one removes it', () => {
  // Narrow (room for 1), Modified shown: tick Size -> Size shows, Modified gives way.
  const before = fitColumns(260, overhead, WEIGHTS, ['mod', 'size', 'ext'])
  const after = toggleColumn(['mod', 'size', 'ext'], 'size', before.visible)
  assert.deepEqual(after, ['size', 'mod', 'ext'])
  assert.deepEqual(fitColumns(260, overhead, WEIGHTS, after).visible, ['name', 'size'])
  // Untick the shown one: gone from the choice (the next one shows if there is room).
  assert.deepEqual(toggleColumn(after, 'size', ['name', 'size']), ['mod', 'ext'])
  // A column never chosen, ticked: added first.
  assert.deepEqual(toggleColumn(['mod'], 'ext', ['name', 'mod']), ['ext', 'mod'])
})

test('widths follow the resize handles down to each column\'s compact width', () => {
  const small = fitColumns(900, overhead, { name: 10, ext: 30, size: 30, mod: 5 })
  assert.equal(small.widths.name! < 200, true)
  assert.equal(small.widths.mod! - COMPACT_PX.mod <= 3, true) // the last column takes the rounding
  assert.equal(small.dateOnly, COMPACT_PX.mod < MOD_TIME_PX)
  assert.equal(tracks(small), 900 - overhead(4))
})

test('saved choices: this version, the first version\'s hidden list, or the default', () => {
  assert.deepEqual(shownColumnsOf({ detailShown: ['size', 'name', 'bogus', 'size', 'mod'] }), ['size', 'mod'])
  assert.deepEqual(shownColumnsOf({ detailShown: [] }), [])
  assert.deepEqual(shownColumnsOf({ detailHidden: ['ext'] }), ['mod', 'size'])
  assert.deepEqual(shownColumnsOf(undefined), [...DEFAULT_SHOWN])
})
