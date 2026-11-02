import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchingSource, normalizeArt, sourceHash, trim, withChanges, type SavedPicture } from '../art-memory.ts'

const URL = '/wasset/' + 'a'.repeat(32) + '.jpg'
const pic = (from: string, at = 1): SavedPicture => ({ url: URL, from: sourceHash(from), width: 600, height: 900, at })

test('normalizeArt keeps only well-formed pictures of GEM Shell addresses', () => {
  const doc = normalizeArt({
    pictures: {
      'box:steam:620': pic('C:/x/620.jpg'),
      'pick:co1abc': pic('https://images.igdb.com/a.jpg'),
      'box:bad-url': { ...pic('a'), url: 'https://evil.example/x.jpg' },
      'box:path-url': { ...pic('a'), url: '/wasset/../secret.jpg' },
      'box:bad-hash': { ...pic('a'), from: 'C:/keep/no/paths' },
      'box:bad-size': { ...pic('a'), width: 0 },
      'nokey': pic('a'),
    },
  })
  assert.deepEqual(Object.keys(doc.pictures), ['box:steam:620'])
  assert.deepEqual(normalizeArt(null), { version: 1, pictures: {} })
  assert.deepEqual(normalizeArt({ pictures: [] }), { version: 1, pictures: {} })
})

test('the source hash finds the source a picture came from, and nothing else', () => {
  assert.match(sourceHash('x'), /^[0-9a-f]{8}$/)
  assert.equal(sourceHash('C:/a.jpg'), sourceHash('C:/a.jpg'))
  assert.notEqual(sourceHash('C:/a.jpg'), sourceHash('C:/b.jpg'))
  assert.equal(matchingSource(pic('https://b'), ['C:/a', 'https://b']), 'https://b')
  assert.equal(matchingSource(pic('https://gone'), ['C:/a']), undefined)
})

test('withChanges adds and forgets, never keeps search covers, and trim keeps the newest', () => {
  let doc = withChanges({ version: 1, pictures: {} }, { 'box:a': pic('a', 1), 'pick:z': pic('z', 2) }, [])
  assert.deepEqual(Object.keys(doc.pictures), ['box:a'])
  doc = withChanges(doc, { 'hero:a': pic('h', 3) }, ['box:a'])
  assert.deepEqual(Object.keys(doc.pictures), ['hero:a'])
  const many = { version: 1 as const, pictures: { 'box:1': pic('1', 1), 'box:2': pic('2', 3), 'box:3': pic('3', 2) } }
  assert.deepEqual(Object.keys(trim(many, 2).pictures).sort(), ['box:2', 'box:3'])
})
