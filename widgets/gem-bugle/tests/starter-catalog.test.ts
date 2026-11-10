import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STARTER_SOURCES, starterSource } from '../starter-catalog.ts'

test('starter shelf entries are unique official HTTPS feeds with source pages', () => {
  assert.ok(STARTER_SOURCES.length > 0)
  assert.equal(new Set(STARTER_SOURCES.map(source => source.id)).size, STARTER_SOURCES.length)
  assert.equal(new Set(STARTER_SOURCES.map(source => source.feedUrl)).size, STARTER_SOURCES.length)
  for (const source of STARTER_SOURCES) {
    assert.equal(new URL(source.feedUrl).protocol, 'https:')
    assert.equal(new URL(source.siteUrl).protocol, 'https:')
    assert.ok(source.provenance.includes('Official'))
    assert.equal(starterSource(source.id), source)
  }
})
