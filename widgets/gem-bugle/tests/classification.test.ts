import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyItem, dedupeAndSort, normalizeFeedItems } from '../classification.ts'
import type { BugleSource } from '../model.ts'

const source: BugleSource = {
  id: 'source',
  feedUrl: 'https://example.com/feed.xml',
  title: 'Example Daily',
  section: 'auto',
  display: 'summary',
  enabled: true,
  addedAt: 1,
}

test('classification prefers explicit feed categories and understandable keyword rules', () => {
  assert.equal(classifyItem({ title: 'A quiet launch', categories: ['Space', 'Research'] }, source), 'science')
  assert.equal(classifyItem({ title: 'Markets close higher', categories: [] }, source), 'business')
  assert.equal(classifyItem({ title: 'Notes from the editor', summary: 'Opinion and commentary', categories: [] }, source), 'opinion')
  assert.equal(classifyItem({ title: 'An uncategorised dispatch', categories: [] }, source), 'latest')
})

test('a reader-assigned desk always wins over automatic classification', () => {
  assert.equal(classifyItem({ title: 'A science laboratory', categories: ['science'] }, { ...source, section: 'culture' }), 'culture')
})

test('normalisation adds source attribution and deduplication removes tracking variants', () => {
  const items = normalizeFeedItems(source, [
    { id: 'a', title: 'One story', url: 'https://example.com/story?utm_source=feed', publishedAt: 10, categories: [] },
    { id: 'b', title: 'One story repeated', url: 'https://example.com/story?utm_medium=rss', publishedAt: 20, categories: [] },
  ])
  const result = dedupeAndSort(items)
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'b')
  assert.equal(result[0].sourceTitle, 'Example Daily')
})
