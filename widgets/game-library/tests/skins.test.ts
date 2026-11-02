import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILT_IN_SKINS, builtInSkin, cleanSkinValue, normalizeSkin, SKIN_KEYS, skinClass, skinStyle } from '../../../shared/library-ui/skins.ts'

test('the built-in skins hold only known, clean values', () => {
  for (const skin of BUILT_IN_SKINS) {
    for (const [key, value] of Object.entries(skin.values)) {
      assert.ok((SKIN_KEYS as readonly string[]).includes(key), `${skin.id}: ${key}`)
      assert.equal(cleanSkinValue(value), value, `${skin.id}: ${key}`)
    }
  }
  assert.equal(builtInSkin('nope').id, 'classic')
  assert.equal(skinClass(builtInSkin('classic')), '')
  assert.equal(skinClass(builtInSkin('late-show')), 'glu-skinned glu-skin-late-show')
  assert.equal(skinStyle(builtInSkin('software-aisle'))['--skin-accent'], '#3fd0c9')
})

test("a shared skin can't load anything or leave its declaration", () => {
  for (const bad of [
    'url(https://example.com/x.png)', 'image-set("a.png" 1x)', 'var(--x)', 'red; color: blue', 'red}body{display:none',
    '#fff !important', 'expression(alert(1))', 'attr(data-x)', 'linear-gradient(red, blue', '"quoted"', '/* x */ red',
    'element(#a)', 'env(safe-area-inset-top)', 'a'.repeat(601),
  ]) assert.equal(cleanSkinValue(bad), undefined, bad)
  for (const good of ['#2a1b33', 'navy', 'rgb(10 20 30 / 50%)', 'linear-gradient(90deg, #000, transparent 40%)', '46px',
    'radial-gradient(circle at 12px 14px, #e8475a 0 2px, transparent 3px) 0 0 / 46px 30px', 'color-mix(in srgb, #fff 20%, transparent)'])
    assert.equal(cleanSkinValue(good), good, good)
})

test('normalizeSkin keeps a skin document and drops what it must', () => {
  const skin = normalizeSkin({ format: 1, id: 'my-shop', name: ' My shop ', author: 'Guillaume', values: { wall: '#123', bar: 'url(x)', nope: 'red', sign: 'gold' } })
  assert.deepEqual(skin, { format: 1, id: 'my-shop', name: 'My shop', author: 'Guillaume', values: { wall: '#123', sign: 'gold' } })
  assert.equal(normalizeSkin({ format: 2, id: 'x', name: 'X', values: {} }), null)
  assert.equal(normalizeSkin({ format: 1, id: 'Bad Id', name: 'X', values: {} }), null)
})

// 3.5.0: skin files, the editor's helpers, the user's skins document
import { readFileSync } from 'node:fs'
import { colourInputValue, copyName, newSkinId, parseSkinFile, SKIN_FIELDS, skinFileText, withPickedColour } from '../../../shared/library-ui/skins.ts'

test('a skin file goes out and comes back the same, and the example loads whole', () => {
  const skin = builtInSkin('software-aisle')
  const back = parseSkinFile(skinFileText(skin))
  assert.ok(!('error' in back))
  assert.deepEqual(back.skin, skin)
  assert.equal(back.dropped, 0)
  const example = parseSkinFile(readFileSync(new URL('../skins/arcade-night.gemskin', import.meta.url), 'utf8'))
  assert.ok(!('error' in example), JSON.stringify(example))
  assert.equal(example.dropped, 0)
  assert.equal(Object.keys(example.skin.values).length, SKIN_KEYS.length)
})

test('a file that is not a skin, or holds what a skin may not, is told apart', () => {
  assert.ok('error' in parseSkinFile('not json'))
  assert.ok('error' in parseSkinFile('{"format":2,"id":"x","name":"X","values":{}}'))
  assert.ok('error' in parseSkinFile('{"format":1,"name":"X","values":{}}'))
  assert.ok('error' in parseSkinFile('x'.repeat(70 * 1024)))
  const r = parseSkinFile('﻿{"format":1,"id":"sneaky","name":"Sneaky","values":{"wall":"url(https://x.example/a.png)","accent":"red","nope":"blue"}}')
  assert.ok(!('error' in r))
  assert.deepEqual(r.skin.values, { accent: 'red' })
  assert.equal(r.dropped, 2)
})

test('new ids and copy names never clash, and every key is in the editor once', () => {
  assert.equal(newSkinId('Software aisle', []), 'software-aisle-2')
  assert.equal(newSkinId('My Shop!', ['my-shop']), 'my-shop-2')
  assert.equal(newSkinId('???', []), 'skin')
  assert.equal(copyName('Late show', ['Late show']), 'Late show (copy)')
  assert.equal(copyName('Late show (copy)', ['Late show (copy)']), 'Late show (copy 2)')
  assert.deepEqual([...SKIN_FIELDS.map(f => f.key)].sort(), [...SKIN_KEYS].sort())
  assert.equal(colourInputValue('#AbC'), '#aabbcc')
  assert.equal(colourInputValue('#ff3fd0cc'), '#ff3fd0')
  assert.equal(colourInputValue('linear-gradient(red, blue)'), '')
  assert.equal(withPickedColour('#ff3fd0cc', '#123456'), '#123456cc')
  assert.equal(withPickedColour('red', '#123456'), '#123456')
})

// 3.7.0: pictures in skins
import { withPictures } from '../../../shared/library-ui/skins.ts'

test("a skin's pictures: only by name, only GEM Shell's addresses, carried as data in files", () => {
  assert.equal(cleanSkinValue('picture(carpet) 0 0 / 128px 128px'), 'picture(carpet) 0 0 / 128px 128px')
  for (const bad of ['picture(../x)', 'picture(https://x.example/a.png)', 'picture()', 'picture(a b)'])
    assert.equal(cleanSkinValue(bad), undefined, bad)
  const id = 'b'.repeat(32)
  const pics = { carpet: { url: `/wasset/${id}.png`, assetId: id, width: 256, height: 256 } }
  assert.equal(withPictures('picture(carpet) 0 0 / 128px 128px, red', pics), `url("/wasset/${id}.png") 0 0 / 128px 128px, red`)
  assert.equal(withPictures('picture(gone), red', pics), 'none, red')
  assert.equal(withPictures('picture(carpet)', { carpet: { ...pics.carpet, url: 'https://x.example/a.png' } }), 'none')
  // A kept skin drops pictures that aren't GEM Shell's, or whose id doesn't match
  const kept = normalizeSkin({ format: 1, id: 'p', name: 'P', values: {}, pictures: { ok: pics.carpet, web: { ...pics.carpet, url: 'https://x/a.png' }, liar: { ...pics.carpet, assetId: 'c'.repeat(32) } } })
  assert.deepEqual(Object.keys(kept!.pictures!), ['ok'])
  // The example: its carpet travels as a PNG
  const example = parseSkinFile(readFileSync(new URL('../skins/arcade-night.gemskin', import.meta.url), 'utf8'))
  assert.ok(!('error' in example))
  assert.equal(example.dropped, 0)
  assert.equal(example.pictures.carpet.type, 'png')
  assert.equal(example.skin.pictures, undefined)   // made by GEM Shell when loaded, never taken from the file
  // A picture that isn't a PNG or a JPEG is left out and counted
  const odd = parseSkinFile(JSON.stringify({ format: 1, id: 'o', name: 'O', values: {}, pictures: { svg: { data: 'data:image/svg+xml;base64,PHN2Zz4=' }, ok: { data: 'data:image/png;base64,iVBORw0KGgo=' } } }))
  assert.ok(!('error' in odd))
  assert.deepEqual(Object.keys(odd.pictures), ['ok'])
  assert.equal(odd.dropped, 1)
  // Written back: data only for PNG / JPEG data
  assert.match(skinFileText(example.skin, { carpet: 'data:image/png;base64,iVBORw0KGgo=', bad: 'javascript:x' }), /"carpet": \{\s*"data": "data:image\/png;base64,iVBORw0KGgo="/)
})
