import { test } from 'node:test'
import assert from 'node:assert/strict'
import { busName, chooseDensity, deviceText, formatBytes, hardwareText, specText, usagePercent, usageTone } from '../drives.ts'

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

test('density counts the widget padding and the real card heights (0.7.8)', () => {
  // 7×4 with four drives (2 × 2 cards): 160 px inside the padding, 2 × 72 + 8 = 152, expanded fits
  assert.equal(chooseDensity('grid', 340, 176, 4), 'expanded')
  // the same width, a little shorter: 2 × 72 + 8 = 152 > 150 inside, so compact (it used to stay expanded and cut the last line)
  assert.equal(chooseDensity('grid', 340, 166, 4), 'compact')
  // one row of expanded cards needs 72 + 16 of padding
  assert.equal(chooseDensity('grid', 700, 88, 4), 'expanded')
  assert.equal(chooseDensity('grid', 700, 87, 4), 'compact')
})

test('the detailed density needs a roomy card, in the grid only (0.8.0)', () => {
  // one drive in a 4 × 2 box: detailed; four drives in the same box: not
  assert.equal(chooseDensity('grid', 330, 176, 1), 'detailed')
  assert.equal(chooseDensity('grid', 330, 176, 4), 'compact')
  assert.equal(chooseDensity('grid', 560, 240, 2), 'detailed')
  assert.equal(chooseDensity('sidebar', 600, 600, 1), 'compact')
  assert.equal(chooseDensity('grid', 170, 176, 1), 'expanded')
  // 12 × 4 in one row (Guillaume's screenshot): four cards about 185 wide, 144 tall inside
  assert.equal(chooseDensity('grid', 770, 160, 4), 'detailed')
  assert.equal(chooseDensity('grid', 770, 160, 3), 'detailed')
})

test('spec, hardware and device lines say what is known (0.8.0)', () => {
  const base = { type: 'fixed', kind: 'ssd', device: { vendor: 'Samsung', product: 'SSD 980 PRO 1TB', revision: null, bus: 'nvme', removableMedia: false },
    fileSystem: 'NTFS', partition: { style: 'GPT', type: '', typeName: 'Basic data', number: 3, offset: 0, length: 0, systemReason: null },
    bitLocker: 'off', remotePath: null } as any
  assert.equal(specText(base), 'NTFS · GPT · NVMe SSD')
  assert.equal(specText({ ...base, bitLocker: 'on', partition: null, kind: 'unknown' }), 'NTFS · NVMe · BitLocker')
  assert.equal(hardwareText({ ...base, device: null, kind: 'hdd' }), 'HDD')
  assert.equal(hardwareText({ ...base, type: 'network' }), 'Network')
  assert.equal(hardwareText({ ...base, device: { ...base.device, bus: 'weird' }, kind: 'unknown' }), null)
  assert.equal(busName('1394'), 'FireWire')
  assert.equal(deviceText(base), 'Samsung SSD 980 PRO 1TB')
  assert.equal(deviceText({ ...base, device: { ...base.device, product: 'Samsung SSD 870' } }), 'Samsung SSD 870')
  assert.equal(deviceText({ ...base, remotePath: '\\\\nas\\media' }), '\\\\nas\\media')
  assert.equal(deviceText({ ...base, device: null }), null)
})
