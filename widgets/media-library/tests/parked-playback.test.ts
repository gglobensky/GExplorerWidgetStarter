import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { useParkedPlayback } from '../useParkedPlayback.ts'

class FakeVideo extends EventTarget {
  attrs = new Map<string, string>(); currentTime = 0; duration = 6000; readyState = 4; paused = true; ended = false
  getAttribute(name: string) { return this.attrs.get(name) ?? null }
  set src(value: string) { this.attrs.set('src', value) }
  async play() { this.paused = false; this.dispatchEvent(new Event('play')) }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  fire(name: string) { this.dispatchEvent(new Event(name)) }
}

/** A stand-in for GEM Shell's video rack (sdk.video()) and jobs (sdk.jobs()). */
function setup() {
  const cells = new Map<string, { value:unknown }>()
  const jobs: Array<{ kind:string; ended:boolean; held:unknown; title:string }> = []
  let live: { handle:any; listeners:Set<(r: string) => void>; held:boolean } | null = null
  const release = (reason: string) => {
    if (!live) return
    const { handle, listeners } = live
    live = null
    handle.element.attrs.delete('src')
    for (const fn of [...listeners]) fn(reason)
  }
  const make = () => {
    const element = new FakeVideo()
    const listeners = new Set<(r: string) => void>()
    const handle = {
      id:'vid_1', ownerId:'o', key:'movie', element, decodeWhileParked:false, pictureSuspended:false,
      get alive() { return live?.handle === handle },
      onRelease(fn: (r: string) => void) { listeners.add(fn); return () => listeners.delete(fn) },
      release() { release('released') },
    }
    live = { handle, listeners, held:false }
    return handle
  }
  const sdk = {
    video:() => ({
      acquire:() => live?.handle ?? make(),
      find:() => live?.handle ?? null,
      canPauseDecoding:() => true,
    }),
    jobs:() => ({
      ensure:(kind: string, opts: { title:string }) => {
        const running = jobs.find(job => job.kind === kind && !job.ended)
        if (running) return running
        const job = {
          kind, ended:false, held:null as unknown, title:opts.title,
          hold(h: unknown) { this.held = h; if (live) live.held = true },
          end() { this.ended = true; if (live) live.held = false },
          update(p: { title?:string }) { if (p.title) this.title = p.title },
        }
        jobs.push(job)
        return job
      },
      current:(kind: string) => jobs.find(job => job.kind === kind && !job.ended) ?? null,
    }),
  } as any
  const life = { persistRef:(key: string, initial: unknown) => cells.get(key) ?? (cells.set(key, { value:initial }), cells.get(key)!) } as any
  const reports: Array<[number, boolean]> = []
  let keep = true
  const instance = () => useParkedPlayback({ sdk, life }, (_item, positionMs, _d, final) => reports.push([positionMs, final]), () => keep)
  /** The widget unmounting: the shell releases an unheld video before the widget's own unmount runs. */
  const unmount = (p: ReturnType<typeof instance>) => { if (live && !live.held) release('unmounted'); p.leave() }
  return { jobs, reports, instance, unmount, setKeep:(on: boolean) => { keep = on }, live:() => live }
}

const movie = { id:'m', title:'Heat', path:'D:\\Heat.mkv', year:1995, runtimeMinutes:170, rating:'', primaryGenre:'Crime', genres:['Crime'], synopsis:'', artwork:{ src:'', x:0, y:0 }, previews:[], addedRank:0 } as LibraryItem
const URL = 'http://127.0.0.1:1/fs/t'

test('playing holds the shell video in the background job', async () => {
  const { jobs, instance } = setup()
  const p = instance()
  const handle = p.start(movie, URL)!
  assert.ok(p.available)
  assert.equal(jobs[0].held, handle)
  assert.equal(jobs[0].title, 'Heat')
  assert.equal(p.session.value?.held, true)
})

test('back on screen, the same video comes back still playing', async () => {
  const { instance, unmount, reports } = setup()
  const first = instance()
  const handle = first.start(movie, URL)!
  handle.element.src = URL
  await handle.element.play()
  handle.element.currentTime = 42; handle.element.fire('timeupdate')
  unmount(first)
  assert.equal(handle.alive, true)
  handle.element.currentTime = 50; handle.element.fire('pause')   // paused from the tray card
  assert.deepEqual(reports.at(-1), [50000, true])
  await handle.element.play()
  const second = instance()
  const back = second.takeBack()
  assert.ok(back?.live)
  assert.equal(back.handle, handle)
  assert.equal(second.session.value?.playing, true)
})

test('with keep playing off, the place is kept and the player reopens paused', async () => {
  const { instance, unmount, setKeep, jobs } = setup()
  setKeep(false)
  const first = instance()
  const handle = first.start(movie, URL)!
  assert.equal(jobs.length, 0)
  handle.element.src = URL
  await handle.element.play()
  handle.element.currentTime = 300; handle.element.fire('timeupdate')
  unmount(first)
  assert.equal(handle.alive, false)
  const back = instance().takeBack()
  assert.deepEqual(back && !back.live ? back.positionMs : null, 300000)
})

test('the movie ending while hidden ends the job; closing the player releases the video', async () => {
  const { instance, unmount, jobs } = setup()
  const first = instance()
  const handle = first.start(movie, URL)!
  handle.element.src = URL
  unmount(first)
  handle.element.fire('ended')
  assert.equal(handle.alive, false)
  assert.equal(jobs[0].ended, true)
  assert.equal(instance().takeBack(), null)

  const p = instance()
  const next = p.start(movie, URL)!
  p.release()
  assert.equal(next.alive, false)
  assert.equal(p.session.value, null)
  assert.equal(jobs.at(-1)?.ended, true)
})

test('turning keep playing off while playing lets the job go', () => {
  const { instance, setKeep, jobs } = setup()
  const p = instance()
  p.start(movie, URL)
  setKeep(false)
  p.syncJob()
  assert.equal(jobs[0].ended, true)
  assert.equal(p.session.value?.held, false)
})
