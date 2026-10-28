import assert from 'node:assert/strict'
import test from 'node:test'
import { createThumbnailLoader, thumbExtsOf, thumbFormat, thumbKey, thumbPx, wantsThumbnail, type ThumbJob } from '../thumbnails.ts'

const file = (name: string, ext: string, extra: Partial<{ Kind: string; Size: number; ModifiedAt: number }> = {}) =>
  ({ Kind: 'file', Ext: ext, FullPath: `C:/f/${name}`, Size: 10, ModifiedAt: 1, ...extra })

const EXTS = thumbExtsOf({ pictures: { exts: ['jpg', 'png'] }, videos: { exts: ['mkv', 'mp4'] }, music: { exts: ['mp3'] } })

test('which files get a thumbnail, at which size, in which format', () => {
  assert.equal(wantsThumbnail(file('a.JPG', '.JPG'), EXTS), true)
  assert.equal(wantsThumbnail(file('a.mkv', '.mkv'), EXTS), true)
  assert.equal(wantsThumbnail(file('a.pdf', '.pdf'), EXTS), true)
  assert.equal(wantsThumbnail(file('a.exe', '.exe'), EXTS), false)
  assert.equal(wantsThumbnail(file('pics', '', { Kind: 'dir' }), EXTS), false)
  assert.equal(wantsThumbnail(file('a.lnk', '.lnk', { Kind: 'link' }), EXTS), false)
  assert.equal(thumbPx(144), 192)
  assert.equal(thumbPx(144, 1.5), 256)
  assert.equal(thumbPx(288, 4), 1024)
  assert.equal(thumbFormat(file('a.png', '.png')), 'png')
  assert.equal(thumbFormat(file('a.mp4', '.mp4')), 'jpeg')
  // an edited file is another thumbnail
  assert.notEqual(thumbKey(file('a.jpg', '.jpg'), 192), thumbKey(file('a.jpg', '.jpg', { ModifiedAt: 2 }), 192))
})

function deferred() {
  let resolve!: (v: string) => void, reject!: (e: unknown) => void
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const job = (n: number): ThumbJob => ({ key: `k${n}`, path: `p${n}`, px: 96, format: 'jpeg' })
const tick = () => new Promise(r => setTimeout(r, 0))

test('asks for what is on screen, a few at a time, and drops what scrolled away', async () => {
  const pending = new Map<string, ReturnType<typeof deferred>>()
  let changes = 0
  const loader = createThumbnailLoader({
    concurrency: 2,
    create: (j) => { const d = deferred(); pending.set(j.key, d); return d.promise },
    onChange: () => { changes++ },
  })
  loader.want([job(1), job(2), job(3), job(4)])
  assert.deepEqual([...pending.keys()], ['k1', 'k2'])
  // scrolled: 3 and 4 are gone, 5 and 6 are on screen
  loader.want([job(5), job(6)])
  pending.get('k1')!.resolve('/wasset/1.jpg')
  await tick()
  assert.equal(loader.get('k1'), '/wasset/1.jpg')
  assert.deepEqual([...pending.keys()], ['k1', 'k2', 'k5'])
  pending.get('k2')!.reject(Object.assign(new Error('no'), { code: 'E_NO_THUMBNAIL' }))
  await tick()
  assert.equal(loader.failed('k2'), true)
  assert.deepEqual([...pending.keys()], ['k1', 'k2', 'k5', 'k6'])
  // a failed or known one is not asked again
  loader.want([job(1), job(2)])
  assert.equal(pending.size, 4)
  assert.equal(changes, 2)
})

test('a broken image is made again once; clear() ignores late answers', async () => {
  let made = 0
  const later = deferred()
  const loader = createThumbnailLoader({
    create: (j) => { made++; return j.key === 'k9' ? later.promise : Promise.resolve(`/wasset/${j.key}.jpg`) },
    onChange: () => {},
  })
  loader.want([job(1)])
  await tick()
  loader.broken('k1')
  assert.equal(loader.get('k1'), undefined)
  loader.want([job(1)])
  await tick()
  assert.equal(loader.get('k1'), '/wasset/k1.jpg')
  loader.broken('k1')
  assert.equal(loader.failed('k1'), true)   // twice: icon from now on
  loader.want([job(9)])
  loader.clear()
  later.resolve('/wasset/late.jpg')
  await tick()
  assert.equal(loader.get('k9'), undefined)
  assert.equal(made, 3)
})
