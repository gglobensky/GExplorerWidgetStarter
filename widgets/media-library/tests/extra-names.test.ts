import assert from 'node:assert/strict'
import test from 'node:test'
import { extraDisplayName } from '../../../shared/library-ui/types.ts'

const extra = (file: string) => ({ title:file, path:`D:\\Movies\\Heat (1995)\\${file}` })

test("an extra's name drops the movie's title (and year) at its start or end", () => {
  for (const [file, name] of [
    ['Heat (1995) - The Making of.mkv', 'The Making of'],
    ['The Making of Heat.mkv', 'The Making of'],
    ['heat_1995_deleted_scene_3.mkv', 'Deleted scene 3'],
  ]) assert.equal(extraDisplayName(extra(file), 'Heat'), name, file)
})

test('Plex-style suffixes become words; other names stay whole', () => {
  assert.equal(extraDisplayName(extra('Heat-trailer.mkv'), 'Heat'), 'Trailer')
  assert.equal(extraDisplayName(extra('Heat - behindthescenes.mp4'), 'Heat'), 'Behind the scenes')
  assert.equal(extraDisplayName(extra('Pacino on set.mkv'), 'Heat'), 'Pacino on set')
  assert.equal(extraDisplayName(extra('Heatwave diary.mkv'), 'Heat'), 'Heatwave diary')
  assert.equal(extraDisplayName(extra('Heat.mkv'), 'Heat'), 'Heat')               // nothing else: whole name
})
