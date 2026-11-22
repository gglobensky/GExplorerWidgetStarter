import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyFilterChoice, applySortChoice, chipLabel, clearPart, customTypeId, effectiveFilter, filterChips, filterExts, filterMenu,
  filterMenuParts, isFiltering, listingKinds, menuTypes, NO_FILTER, parseExtensions, quickFilterOf, registryOf, showMenuRows,
  toggleType, typeExts, typeMenuRows, typeRefOfMenuId, typesLabel,
} from '../quickFilter.ts'

const REG = registryOf({ custom: [{ id: 'raw', label: 'Raw photos', exts: ['cr2', 'nef', 'arw'] }], hidden: ['archives'] })

test('saved filters are cleaned', () => {
  assert.deepEqual(quickFilterOf(undefined), NO_FILTER)
  // Saved before 0.17.0 (one type)
  assert.deepEqual(quickFilterOf({ show: 'files', type: 'pictures' }), { show: 'files', types: ['pictures'] })
  assert.deepEqual(quickFilterOf({ show: 'bogus', type: 'ext:mkv' }), { show: 'all', types: ['ext:mkv'] })
  assert.deepEqual(quickFilterOf({ type: 'custom:raw' }), { show: 'all', types: ['custom:raw'] })
  assert.deepEqual(quickFilterOf({ type: 'ext:../evil' }), NO_FILTER)
  assert.deepEqual(quickFilterOf({ show: 'folders', type: 'videos' }), { show: 'folders', types: [] })
  // 0.17.0: several, repeats and unknown ones dropped
  assert.deepEqual(quickFilterOf({ types: ['videos', 'pictures', 'videos', 'nope', 'ext:mkv'] }), { show: 'all', types: ['videos', 'pictures', 'ext:mkv'] })
  assert.equal(isFiltering(NO_FILTER), false)
})

test('becomes the backend listing\'s kinds and extensions', () => {
  assert.deepEqual(listingKinds(NO_FILTER), { kinds: undefined, exts: undefined })
  assert.deepEqual(listingKinds({ show: 'folders', types: [] }), { kinds: ['dir', 'dirLink'], exts: undefined })
  assert.deepEqual(listingKinds({ show: 'files', types: ['ext:mkv'] }), { kinds: ['file', 'link'], exts: ['mkv'] })
  assert.deepEqual(listingKinds({ show: 'all', types: ['custom:raw'] }, undefined, REG).exts, ['cr2', 'nef', 'arw'])
  // A dialog's own filter is narrowed, never replaced; no overlap: folders only.
  assert.deepEqual(listingKinds({ show: 'all', types: ['pictures'] }, ['png', 'txt']).exts, ['png'])
  assert.deepEqual(listingKinds({ show: 'all', types: ['music'] }, ['png']), { kinds: ['dir', 'dirLink'], exts: undefined })
  // 0.17.0: several types: their extensions together (OR), Hide folders with them (AND)
  assert.deepEqual(listingKinds({ show: 'files', types: ['ext:mkv', 'custom:raw', 'ext:nef'] }, undefined, REG), { kinds: ['file', 'link'], exts: ['mkv', 'cr2', 'nef', 'arw'] })
})

test('the user\'s types: made from a name and extensions, hidden built-ins left out of the menu', () => {
  assert.deepEqual(parseExtensions('jpg, .PNG  webp;*.tiff jpg ../x'), ['jpg', 'png', 'webp', 'tiff'])
  assert.equal(customTypeId('Raw photos', REG), 'raw-photos')
  assert.equal(customTypeId('Raw', registryOf({ custom: [{ id: 'raw', label: 'Raw', exts: ['x'] }] })), 'raw-2')
  assert.deepEqual(menuTypes(REG).map(t => t.ref), ['pictures', 'videos', 'music', 'documents', 'custom:raw'])
  assert.deepEqual(registryOf({ custom: [{ id: 'BAD ID', label: 'x', exts: ['a'] }, { id: 'ok', label: 'Ok', exts: [] }], hidden: ['nope', 'music'] }), { custom: [], hidden: ['music'] })
  // A filter on a type since deleted: no type.
  assert.deepEqual(effectiveFilter({ show: 'files', types: ['custom:gone', 'videos'] }, REG), { show: 'files', types: ['videos'] })
  assert.equal(typeExts('custom:gone', REG), undefined)
})

test('the Filter submenu: Show and Type lists with ticks, Edit types, Clear when filtering', () => {
  const menu = filterMenu({ show: 'files', types: ['custom:raw'] }, REG, 'psd') as any[]
  assert.deepEqual(menu.map(entry => entry.id ?? '—'), ['show', 'type', '—', 'clear'])
  assert.equal(menu[0].label, 'Show: Hide folders')
  assert.deepEqual(menu[0].children.filter((c: any) => c.checked).map((c: any) => c.id), ['show.files'])
  assert.equal(menu[1].label, 'Type: Raw photos')
  const typeIds = menu[1].children.map((c: any) => c.id ?? '—')
  assert.deepEqual(typeIds, ['type.any', 'type.pictures', 'type.videos', 'type.music', 'type.documents', 'type.custom.raw', 'type.ext.psd', '—', 'types.edit'])
  assert.deepEqual(menu[1].children.filter((c: any) => c.checked).map((c: any) => c.id), ['type.custom.raw'])
  assert.deepEqual((filterMenu(NO_FILTER, REG) as any[]).map(entry => entry.id), ['show', 'type'])
})

test('a menu choice gives the new filter', () => {
  assert.deepEqual(applyFilterChoice(NO_FILTER, 'show.files'), { show: 'files', types: [] })
  assert.deepEqual(applyFilterChoice({ show: 'files', types: [] }, 'type.videos'), { show: 'files', types: ['videos'] })
  assert.deepEqual(applyFilterChoice({ show: 'folders', types: [] }, 'type.custom.raw'), { show: 'all', types: ['custom:raw'] })
  assert.deepEqual(applyFilterChoice({ show: 'all', types: ['videos'] }, 'show.folders'), { show: 'folders', types: [] })
  assert.deepEqual(applyFilterChoice({ show: 'files', types: ['videos'] }, 'clear'), NO_FILTER)
  assert.deepEqual(applyFilterChoice(NO_FILTER, 'type.ext.psd'), { show: 'all', types: ['ext:psd'] })
  assert.equal(applyFilterChoice(NO_FILTER, 'types.edit'), null)
  assert.equal(chipLabel({ show: 'files', types: ['custom:raw'] }, REG), 'Hide folders · Raw photos')
  // 0.17.0: a type chosen again comes off; another one joins (OR); Any type clears them
  assert.deepEqual(applyFilterChoice({ show: 'all', types: ['videos', 'music'] }, 'type.videos'), { show: 'all', types: ['music'] })
  assert.deepEqual(applyFilterChoice({ show: 'all', types: ['videos'] }, 'type.music'), { show: 'all', types: ['videos', 'music'] })
  assert.deepEqual(applyFilterChoice({ show: 'files', types: ['videos', 'music'] }, 'type.any'), { show: 'files', types: [] })
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

test('0.17.0: one chip per part, their ✕, the Type and Show menus', () => {
  const f = { show: 'files', types: ['pictures', 'custom:raw', 'ext:mkv'] } as const
  assert.deepEqual(filterChips(f as any, REG).map(c => [c.part, c.label]), [['show', 'Hide folders'], ['type', 'Pictures, Raw photos or .mkv files']])
  assert.deepEqual(filterChips(NO_FILTER, REG), [])
  assert.equal(filterChips({ show: 'all', types: ['pictures', 'videos', 'music', 'documents'] }, REG)[0].title, 'Type: Pictures, Videos, Music or Documents')
  assert.deepEqual(clearPart(f as any, 'type'), { show: 'files', types: [] })
  assert.deepEqual(clearPart(f as any, 'show'), { show: 'all', types: ['pictures', 'custom:raw', 'ext:mkv'] })
  assert.equal(typesLabel(['pictures', 'videos', 'music', 'documents']), 'Pictures, Videos or 2 more')
  assert.equal(typesLabel([]), 'Any type')
  assert.deepEqual(filterExts({ show: 'all', types: [] }), undefined)
  assert.deepEqual(toggleType({ show: 'folders', types: [] }, 'videos', true), { show: 'all', types: ['videos'] })
  assert.deepEqual(toggleType({ show: 'all', types: ['videos'] }, 'videos', false), { show: 'all', types: [] })
  assert.equal(typeRefOfMenuId('type.custom.raw'), 'custom:raw')
  assert.equal(typeRefOfMenuId('type.ext.psd'), 'ext:psd')
  assert.equal(typeRefOfMenuId('type.any'), null)
  assert.equal(typeRefOfMenuId('types.edit'), null)

  const rows = typeMenuRows(f as any, REG, 'psd') as any[]
  assert.deepEqual(rows.map(r => r.id ?? r.type), ['type.pictures', 'type.videos', 'type.music', 'type.documents', 'type.custom.raw', 'type.ext.mkv', 'type.ext.psd', 'separator', 'type.any', 'types.edit'])
  assert.deepEqual(rows.filter(r => r.checked).map(r => r.id), ['type.pictures', 'type.custom.raw', 'type.ext.mkv'])
  assert.equal(rows.find(r => r.id === 'type.any').disabled, false)
  assert.equal((typeMenuRows({ show: 'folders', types: [] }, REG) as any[])[0].type, 'header')
  assert.deepEqual(showMenuRows(f as any).map(r => [r.id, r.checked]), [['show.all', false], ['show.folders', false], ['show.files', true]])

  // The right-click menu's declared entries tick every type on
  const parts = filterMenuParts(f as any, REG, 'psd')
  assert.deepEqual(parts.slots['type.list'].filter((e: any) => e.checked).map((e: any) => e.id), ['type.pictures', 'type.custom.raw'])
  assert.deepEqual(parts.slots['type.focused'].map((e: any) => [e.id, e.checked]), [['type.ext.mkv', true], ['type.ext.psd', false]])
})
