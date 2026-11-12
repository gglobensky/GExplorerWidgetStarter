import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyFilterChoice, applySortChoice, chipLabel, customTypeId, effectiveFilter, filterMenu, isFiltering, listingKinds, menuTypes,
  NO_FILTER, parseExtensions, quickFilterOf, registryOf, typeExts,
} from '../quickFilter.ts'

const REG = registryOf({ custom: [{ id: 'raw', label: 'Raw photos', exts: ['cr2', 'nef', 'arw'] }], hidden: ['archives'] })

test('saved filters are cleaned', () => {
  assert.deepEqual(quickFilterOf(undefined), NO_FILTER)
  assert.deepEqual(quickFilterOf({ show: 'files', type: 'pictures' }), { show: 'files', type: 'pictures' })
  assert.deepEqual(quickFilterOf({ show: 'bogus', type: 'ext:mkv' }), { show: 'all', type: 'ext:mkv' })
  assert.deepEqual(quickFilterOf({ type: 'custom:raw' }), { show: 'all', type: 'custom:raw' })
  assert.deepEqual(quickFilterOf({ type: 'ext:../evil' }), NO_FILTER)
  assert.deepEqual(quickFilterOf({ show: 'folders', type: 'videos' }), { show: 'folders', type: null })
  assert.equal(isFiltering(NO_FILTER), false)
})

test('becomes the backend listing\'s kinds and extensions', () => {
  assert.deepEqual(listingKinds(NO_FILTER), { kinds: undefined, exts: undefined })
  assert.deepEqual(listingKinds({ show: 'folders', type: null }), { kinds: ['dir', 'dirLink'], exts: undefined })
  assert.deepEqual(listingKinds({ show: 'files', type: 'ext:mkv' }), { kinds: ['file', 'link'], exts: ['mkv'] })
  assert.deepEqual(listingKinds({ show: 'all', type: 'custom:raw' }, undefined, REG).exts, ['cr2', 'nef', 'arw'])
  // A dialog's own filter is narrowed, never replaced; no overlap: folders only.
  assert.deepEqual(listingKinds({ show: 'all', type: 'pictures' }, ['png', 'txt']).exts, ['png'])
  assert.deepEqual(listingKinds({ show: 'all', type: 'music' }, ['png']), { kinds: ['dir', 'dirLink'], exts: undefined })
})

test('the user\'s types: made from a name and extensions, hidden built-ins left out of the menu', () => {
  assert.deepEqual(parseExtensions('jpg, .PNG  webp;*.tiff jpg ../x'), ['jpg', 'png', 'webp', 'tiff'])
  assert.equal(customTypeId('Raw photos', REG), 'raw-photos')
  assert.equal(customTypeId('Raw', registryOf({ custom: [{ id: 'raw', label: 'Raw', exts: ['x'] }] })), 'raw-2')
  assert.deepEqual(menuTypes(REG).map(t => t.ref), ['pictures', 'videos', 'music', 'documents', 'custom:raw'])
  assert.deepEqual(registryOf({ custom: [{ id: 'BAD ID', label: 'x', exts: ['a'] }, { id: 'ok', label: 'Ok', exts: [] }], hidden: ['nope', 'music'] }), { custom: [], hidden: ['music'] })
  // A filter on a type since deleted: no type.
  assert.deepEqual(effectiveFilter({ show: 'files', type: 'custom:gone' }, REG), { show: 'files', type: null })
  assert.equal(typeExts('custom:gone', REG), undefined)
})

test('the Filter submenu: Show and Type lists with ticks, Edit types, Clear when filtering', () => {
  const menu = filterMenu({ show: 'files', type: 'custom:raw' }, REG, 'psd') as any[]
  assert.deepEqual(menu.map(entry => entry.id ?? '—'), ['show', 'type', '—', 'clear'])
  assert.equal(menu[0].label, 'Show: Files only')
  assert.deepEqual(menu[0].children.filter((c: any) => c.checked).map((c: any) => c.id), ['show.files'])
  assert.equal(menu[1].label, 'Type: Raw photos')
  const typeIds = menu[1].children.map((c: any) => c.id ?? '—')
  assert.deepEqual(typeIds, ['type.any', 'type.pictures', 'type.videos', 'type.music', 'type.documents', 'type.custom.raw', 'type.ext.psd', '—', 'types.edit'])
  assert.deepEqual(menu[1].children.filter((c: any) => c.checked).map((c: any) => c.id), ['type.custom.raw'])
  assert.deepEqual((filterMenu(NO_FILTER, REG) as any[]).map(entry => entry.id), ['show', 'type'])
})

test('a menu choice gives the new filter', () => {
  assert.deepEqual(applyFilterChoice(NO_FILTER, 'show.files'), { show: 'files', type: null })
  assert.deepEqual(applyFilterChoice({ show: 'files', type: null }, 'type.videos'), { show: 'files', type: 'videos' })
  assert.deepEqual(applyFilterChoice({ show: 'folders', type: null }, 'type.custom.raw'), { show: 'all', type: 'custom:raw' })
  assert.deepEqual(applyFilterChoice({ show: 'all', type: 'videos' }, 'show.folders'), { show: 'folders', type: null })
  assert.deepEqual(applyFilterChoice({ show: 'files', type: 'videos' }, 'clear'), NO_FILTER)
  assert.deepEqual(applyFilterChoice(NO_FILTER, 'type.ext.psd'), { show: 'all', type: 'ext:psd' })
  assert.equal(applyFilterChoice(NO_FILTER, 'types.edit'), null)
  assert.equal(chipLabel({ show: 'files', type: 'custom:raw' }, REG), 'Files only · Raw photos')
})

test('Sort first in the menu, saying ascending / descending on the current column', () => {
  const menu = filterMenu(NO_FILTER, REG, undefined, { key: 'size', dir: 'desc' }) as any[]
  assert.deepEqual(menu.map(entry => entry.id), ['sort', 'show', 'type'])
  assert.equal(menu[0].label, 'Sort: Size ↓')
  assert.deepEqual(menu[0].children.map((c: any) => c.label), ['Name', 'Extension', 'Size (descending)', 'Modified'])
  assert.equal(menu[0].children.some((c: any) => 'checked' in c), false)
  assert.deepEqual(applySortChoice({ key: 'size', dir: 'desc' }, 'sort.size'), { key: 'size', dir: 'asc' })
  assert.deepEqual(applySortChoice({ key: 'size', dir: 'desc' }, 'sort.name'), { key: 'name', dir: 'asc' })
  assert.equal(applySortChoice({ key: 'name', dir: 'asc' }, 'sort.bogus'), null)
  assert.equal(applySortChoice({ key: 'name', dir: 'asc' }, 'show.files'), null)
})
