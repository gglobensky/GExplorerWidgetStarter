import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { applyMetadataOverride, loadMetadataOverrides, saveMetadataOverrides } from '../metadata-overrides.ts'

const item:LibraryItem = {
  id:'antz', title:'Antz', year:1998, runtimeMinutes:83, rating:'PG', primaryGenre:'Animation', genres:['Animation'],
  synopsis:'TMDB description', artwork:{ src:'', x:0, y:0 }, previews:[], addedRank:1, path:'D:\\Movies\\Antz.mkv',
}

test('local synopsis and genres override provider metadata', () => {
  const overridden = applyMetadataOverride(item,{ synopsis:'My description', genres:['Family','Comedy'] })
  assert.equal(overridden.synopsis,'My description')
  assert.deepEqual(overridden.genres,['Family','Comedy'])
  assert.equal(overridden.primaryGenre,'Family')
  assert.equal(overridden.localMetadataOverride,true)
})

test('persists local metadata overrides', async () => {
  let stored:unknown
  const storage = {
    configRead:async () => stored as any,
    configWrite:async (_name:string,value:unknown) => { stored = value },
  }
  await saveMetadataOverrides(storage as any,{ [item.path!]:{ synopsis:'Mine', genres:['Comedy'] } })
  assert.deepEqual(await loadMetadataOverrides(storage as any),{ [item.path!]:{ synopsis:'Mine', genres:['Comedy'] } })
})
