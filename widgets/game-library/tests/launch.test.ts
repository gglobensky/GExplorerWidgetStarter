import assert from 'node:assert/strict'
import { test } from 'node:test'
import { epicRelease, gogRelease, manualRelease, steamRelease, type GameRelease } from '../games.ts'
import { launcherNote, launchRelease, type LaunchPort } from '../launch.ts'
import { normalizeDoc } from '../library-store.ts'

const steam = steamRelease({ appId: '620', name: 'Portal 2', installDir: 'C:\\S\\steamapps\\common\\Portal 2', library: 'C:\\S', installed: true, lastPlayed: 0, lastUpdated: 0, sizeOnDisk: 1 })
const gog = gogRelease({ gameId: '1', title: 'UT2004', installDir: 'E:\\UT', exe: 'E:\\UT\\System\\UT2004.exe', args: '' })
const epicFree = epicRelease({ appName: 'A', namespace: 'n', catalogItemId: 'i', title: 'Free', installDir: 'D:\\F', exe: 'D:\\F\\f.exe', requiresAuth: false, sizeOnDisk: 0 })

function port(opts: { links?: Record<string, { ok: boolean; reason?: string }>; exe?: { ok: boolean; reason?: string } } = {}) {
  const calls: string[] = []
  const p: LaunchPort = {
    openPath: async path => { calls.push(`exe ${path}`); return opts.exe ?? { ok: true } },
    ...(opts.links ? { appLinks: () => ({ open: async (uri: string) => { calls.push(`link ${uri}`); return opts.links![uri.split(':')[0]] ?? { ok: true } } }) } : {}),
  }
  return { p, calls }
}

test('launch: Steam goes through its link when GEM Shell has app links', async () => {
  const { p, calls } = port({ links: {} })
  const r = await launchRelease(p, steam)
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['link steam://rungameid/620'])
})

test('launch: without app links, a Steam game says plainly what it waits for', async () => {
  const { p, calls } = port()
  const r = await launchRelease(p, steam)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.message : '', /Steam games needs GEM Shell's app links/)
  assert.deepEqual(calls, [])
})

test('launch: GOG and your games start from their exe', async () => {
  const { p, calls } = port()
  assert.equal((await launchRelease(p, gog)).ok, true)
  assert.equal((await launchRelease(p, manualRelease('C:\\G\\g.exe', 'G'))).ok, true)
  assert.deepEqual(calls, ['exe E:\\UT\\System\\UT2004.exe', 'exe C:\\G\\g.exe'])
})

test('launch: an Epic game without sign-in falls back to its exe when there are no app links', async () => {
  const { p, calls } = port()
  const r = await launchRelease(p, epicFree)
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['exe D:\\F\\f.exe'])
})

test('launch: a refusal for the gesture stops at once; a missing launcher tries the next way', async () => {
  const noGesture = port({ exe: { ok: false, reason: 'no-gesture' } })
  const r = await launchRelease(noGesture.p, gog)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.message : '', /click or a key press/)
  const noEpic = port({ links: { 'com.epicgames.launcher': { ok: false, reason: 'not-registered' } } })
  assert.equal((await launchRelease(noEpic.p, epicFree)).ok, true)
  assert.deepEqual(noEpic.calls.map(c => c.split(' ')[0]), ['link', 'exe'])
})

test('launch: not installed is never started', async () => {
  const { p, calls } = port({ links: {} })
  const r = await launchRelease(p, { ...steam, installed: false } as GameRelease)
  assert.equal(r.ok, false)
  assert.deepEqual(calls, [])
})

test('launch: the note under Play', () => {
  assert.equal(launcherNote(steam), 'Starts Steam')
  assert.equal(launcherNote(gog), '')
})

test('library doc: what was saved is checked, never a reason to fail', () => {
  assert.deepEqual(normalizeDoc(null), { version: 1, manual: [], played: {}, preferred: {}, edits: {} })
  const doc = normalizeDoc({
    manual: [{ path: 'C:\\G\\g.exe', title: ' G ' }, { path: 'c:\\g\\G.EXE' }, { path: '' }, 'junk'],
    played: { 'game:a': 5, 'game:b': -1, 'game:c': 'x' },
    preferred: { 'game:a': 'gog', 'game:b': 'origin' },
  })
  assert.deepEqual(doc.manual, [{ path: 'C:\\G\\g.exe', title: 'G' }])
  assert.deepEqual(doc.played, { 'game:a': 5 })
  assert.deepEqual(doc.preferred, { 'game:a': 'gog' })
})

test('a launcher command goes first, and an older GEM Shell without it falls through', async () => {
  const { launchRelease } = await import('../launch.ts')
  const release = { store: 'battlenet' as const, storeId: 'D4', title: 'Diablo IV', installed: true, launches: [
    { kind: 'command' as const, scheme: 'battlenet', code: 'Fen', launcher: 'Battle.net' },
    { kind: 'exe' as const, path: 'd4.exe' },
  ] }
  const asked: string[] = []
  const withLaunch = { appLinks: () => ({ open: async () => ({ ok: false }), launch: async (s: string, c: string) => { asked.push(`${s}:${c}`); return { ok: true } } }), openPath: async () => ({ ok: true }) }
  const a = await launchRelease(withLaunch, release)
  assert.equal(a.ok && a.via.kind, 'command')
  assert.deepEqual(asked, ['battlenet:Fen'])
  const older = { appLinks: () => ({ open: async () => ({ ok: false }) }), openPath: async () => ({ ok: true }) }
  const b = await launchRelease(older, release)
  assert.equal(b.ok && b.via.kind, 'exe')
})
