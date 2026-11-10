import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sourceHealth } from '../source-health.ts'
import type { BugleSource } from '../model.ts'

const source: BugleSource = {
  id: 'source', feedUrl: 'https://example.com/feed', title: 'Example', section: 'auto', display: 'summary', enabled: true, addedAt: 1,
}

test('source health distinguishes unchecked, healthy, failed, and paused feeds', () => {
  assert.equal(sourceHealth(source, 1_000).tone, 'unknown')
  assert.deepEqual(sourceHealth({ ...source, lastCheckedAt: 1_000, lastItemCount: 1 }, 61_000), {
    tone: 'healthy', label: 'Healthy', detail: '1 item · checked 1m ago',
  })
  assert.equal(sourceHealth({ ...source, lastCheckedAt: 1_000, lastError: 'HTTP 500' }, 61_000).tone, 'error')
  assert.equal(sourceHealth({ ...source, enabled: false, lastError: 'HTTP 500' }, 61_000).tone, 'paused')
})
