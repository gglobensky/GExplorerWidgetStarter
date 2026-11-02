import test from 'node:test'
import assert from 'node:assert/strict'
import { lookUpTitle, timeLeft } from '../online/lookup-job.ts'

test('names the look-up job by how far it is', () => {
  assert.equal(lookUpTitle(12, 340), 'Game details · 12 of 340')
  assert.equal(lookUpTitle(400, 340), 'Game details · 340 of 340')
})

test('says about how long the rest takes', () => {
  assert.equal(timeLeft(330, 340), 'under a minute')
  assert.equal(timeLeft(0, 340), 'about 10 min')
})
