import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanGemSkinCssValue, gemSkinHeader, incompatibleSkinMessage, readGemSkinHeader } from '../index.ts'

test('one .gemskin header identifies compatible widget families', () => {
  const raw = { skin: gemSkinHeader('timepiece', 1, ['clock', 'calendar']) }
  const result = readGemSkinHeader(raw)
  assert.ok('header' in result)
  assert.deepEqual(result.header, raw.skin)
  assert.equal(incompatibleSkinMessage(result.header, 'timepiece', [1]), null)
  assert.match(incompatibleSkinMessage(result.header, 'library-store', [1]) ?? '', /Clock\/Calendar/)
})

test('legacy headerless skins are library skins only', () => {
  const result = readGemSkinHeader({ format: 1, id: 'old' })
  assert.ok('header' in result)
  assert.equal(incompatibleSkinMessage(result.header, 'library-store', [1]), null)
  assert.match(incompatibleSkinMessage(result.header, 'timepiece', [1]) ?? '', /older Game\/Media Library/)
})

test('bad compatibility headers are rejected', () => {
  assert.ok('error' in readGemSkinHeader({ skin: { kind: 'gem.skin', family: '../clock', schema: 1, targets: ['clock'] } }))
  assert.ok('error' in readGemSkinHeader({ skin: { kind: 'gem.skin', family: 'timepiece', schema: 0, targets: [] } }))
})

test('shared skin CSS tokens cannot load or escape', () => {
  assert.equal(cleanGemSkinCssValue('linear-gradient(#000, #123)'), 'linear-gradient(#000, #123)')
  for (const bad of ['url(https://bad.example/x)', 'red; color: blue', 'var(--secret)', 'linear-gradient(#000'])
    assert.equal(cleanGemSkinCssValue(bad), undefined)
})
