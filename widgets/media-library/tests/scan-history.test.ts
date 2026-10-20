import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScanHistory, mergeScanHistory, saveScanHistory, SCAN_HISTORY_STORE } from '../scan-history.ts'

test('replaces history after a complete scan and preserves unseen paths after a partial scan', () => {
  assert.deepEqual(mergeScanHistory(['D:\\Old.mkv'],['D:\\Current.mkv'],true), ['d:\\current.mkv'])
  assert.deepEqual(mergeScanHistory(['D:\\Old.mkv'],['D:\\Current.mkv'],false), ['d:\\current.mkv','d:\\old.mkv'])
})

test('persists scan history independently for each Media Library instance', async () => {
  let saved:unknown = { version:1, pathsByOwner:{ other:['f:\\other.mkv'] } }
  const storage = {
    configRead:async () => saved,
    configWrite:async (name:string,value:unknown) => {
      assert.equal(name,SCAN_HISTORY_STORE)
      saved = value
    },
  } as any
  await saveScanHistory(storage,'library1',['D:\\Movie.mkv'])
  assert.deepEqual(await loadScanHistory(storage,'library1'), ['d:\\movie.mkv'])
  assert.deepEqual(await loadScanHistory(storage,'other'), ['f:\\other.mkv'])
})
