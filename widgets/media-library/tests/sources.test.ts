import assert from 'node:assert/strict'
import test from 'node:test'
import { loadMediaSources, MEDIA_SOURCES_STORE, normalizeMediaSources, saveMediaSources } from '../sources.ts'

test('normalizes media sources without changing their stored spelling', () => {
  assert.deepEqual(normalizeMediaSources(['D:\\Movies','','d:\\movies','E:\\TV']), ['D:\\Movies','E:\\TV'])
})

test('loads durable media sources ahead of the placement config fallback', async () => {
  const storage = {
    configRead:async (name:string) => name === MEDIA_SOURCES_STORE
      ? { version:1, sourcesByOwner:{ library1:['E:\\Saved Movies'] } }
      : null,
  } as any
  assert.deepEqual(await loadMediaSources(storage,'library1',['D:\\Placement Movies']), ['E:\\Saved Movies'])
})

test('migrates placement sources and preserves other Media Library instances', async () => {
  const writes:Array<{ name:string; value:unknown }> = []
  let saved:unknown = { version:1, sourcesByOwner:{ other:['F:\\Documentaries'] } }
  const storage = {
    configRead:async () => saved,
    configWrite:async (name:string,value:unknown) => { saved = value; writes.push({ name,value }) },
  } as any
  assert.deepEqual(await loadMediaSources(storage,'library1',['D:\\Movies']), ['D:\\Movies'])
  await saveMediaSources(storage,'library1',['D:\\Movies','E:\\TV'])
  assert.deepEqual(writes, [
    { name:MEDIA_SOURCES_STORE, value:{ version:1, sourcesByOwner:{ other:['F:\\Documentaries'], library1:['D:\\Movies'] } } },
    { name:MEDIA_SOURCES_STORE, value:{ version:1, sourcesByOwner:{ other:['F:\\Documentaries'], library1:['D:\\Movies','E:\\TV'] } } },
  ])
})
