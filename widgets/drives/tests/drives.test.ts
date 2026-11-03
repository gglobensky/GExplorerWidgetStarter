import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseDensity, formatBytes, usagePercent, usageTone } from '../drives.ts'

test('capacity percentages are clamped and tolerate missing totals', () => {
  assert.equal(usagePercent({ root: 'C:\\', ready: true, total: 100, free: 25, used: 75 }), 75)
  assert.equal(usagePercent({ root: 'C:\\', ready: true, total: 100, free: 0, used: 120 }), 100)
  assert.equal(usagePercent({ root: 'C:\\', ready: false, total: 0, free: 0, used: 0 }), null)
})

test('usage tones change at the declared thresholds', () => {
  assert.equal(usageTone(null), 'unknown')
  assert.equal(usageTone(74), 'normal')
  assert.equal(usageTone(75), 'warning')
  assert.equal(usageTone(89), 'warning')
  assert.equal(usageTone(90), 'critical')
})

test('byte formatting stays concise across drive-sized values', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512 * 1024 ** 3), '512 GB')
  assert.equal(formatBytes(1.5 * 1024 ** 4), '1.5 TB')
  assert.equal(formatBytes(-1), '—')
})

test('density follows the allocated box and placement context', () => {
  assert.equal(chooseDensity('grid', 560, 176, 4), 'expanded')
  assert.equal(chooseDensity('grid', 260, 100, 4), 'compact')
  assert.equal(chooseDensity('grid', 150, 40, 4), 'micro')
  assert.equal(chooseDensity('sidebar', 300, 300, 4), 'compact')
  assert.equal(chooseDensity('toolbar', 280, 48, 4), 'compact')
  assert.equal(chooseDensity('toolbar', 160, 32, 4), 'micro')
})
