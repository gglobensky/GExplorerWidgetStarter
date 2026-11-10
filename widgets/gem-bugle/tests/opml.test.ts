import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOpml, parseOpml } from '../opml.ts'
import type { BugleSource } from '../model.ts'

test('OPML import accepts common outline attributes, categories, and XML entities', () => {
  const subscriptions = parseOpml(`<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="Technology"><outline type="rss" text="Bits &amp; Pieces" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com/"/></outline>
    <outline title="Local Notes" xmlUrl="https://local.example/rss" category="Local"/>
  </body></opml>`)
  assert.deepEqual(subscriptions, [
    { title: 'Bits & Pieces', feedUrl: 'https://example.com/feed.xml', siteUrl: 'https://example.com/', section: 'technology' },
    { title: 'Local Notes', feedUrl: 'https://local.example/rss', section: 'local' },
  ])
})

test('OPML import ignores duplicate and non-web outlines', () => {
  const subscriptions = parseOpml(`<opml><body>
    <outline text="First" xmlUrl="https://example.com/feed"/>
    <outline text="Duplicate" xmlUrl="https://example.com/feed"/>
    <outline text="Unsafe" xmlUrl="file:///tmp/feed.xml"/>
  </body></opml>`)
  assert.equal(subscriptions.length, 1)
  assert.equal(subscriptions[0].section, 'auto')
})

test('OPML export is portable, escaped, and round-trips Bugle desks', () => {
  const sources: BugleSource[] = [{
    id: 'one', feedUrl: 'https://example.com/feed?a=1&b=2', siteUrl: 'https://example.com/', title: 'News & Notes',
    section: 'science', display: 'summary', enabled: true, addedAt: 1,
  }]
  const text = createOpml(sources, Date.UTC(2026, 0, 2))
  assert.match(text, /News &amp; Notes/)
  assert.match(text, /feed\?a=1&amp;b=2/)
  assert.deepEqual(parseOpml(text), [{
    title: 'News & Notes', feedUrl: 'https://example.com/feed?a=1&b=2', siteUrl: 'https://example.com/', section: 'science',
  }])
})
