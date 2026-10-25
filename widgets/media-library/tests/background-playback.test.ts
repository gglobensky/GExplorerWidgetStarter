import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryItem } from '../../../shared/library-ui/types.ts'
import { useBackgroundPlayback } from '../useBackgroundPlayback.ts'

class FakeMedia extends EventTarget {
  src = ''; currentTime = 0; duration = 6000; readyState = 4; paused = true; muted = false; volume = 1; playbackRate = 1; seeking = false
  async play() { this.paused = false; this.dispatchEvent(new Event('play')) }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  fire(name: string) { this.dispatchEvent(new Event(name)) }
}

function setup() {
  const element = new FakeMedia()
  const cells = new Map<string, { value:unknown }>()
  const jobs: Array<{ kind:string; ended:boolean; held:unknown }> = []
  const sdk = {
    audio:() => ({ acquireElement:() => element }),
    jobs:() => ({
      ensure:(kind: string) => {
        const live = jobs.find(job => job.kind === kind && !job.ended)
        if (live) return live
        const job = { kind, ended:false, held:null as unknown, hold(h: unknown) { this.held = h }, end() { this.ended = true }, update() {} }
        jobs.push(job)
        return job
      },
      current:(kind: string) => jobs.find(job => job.kind === kind && !job.ended) ?? null,
    }),
  } as any
  const life = { persistRef:(key: string, initial: unknown) => cells.get(key) ?? (cells.set(key, { value:initial }), cells.get(key)!) } as any
  const reports: Array<[number, boolean]> = []
  const make = () => useBackgroundPlayback({ sdk, life } as any, (_item, positionMs, _d, final) => reports.push([positionMs, final]))
  return { element, jobs, reports, make }
}

const movie = { id:'m', title:'Heat', path:'D:\\Heat.mkv', year:1995, runtimeMinutes:170, rating:'', primaryGenre:'Crime', genres:['Crime'], synopsis:'', artwork:{ src:'', x:0, y:0 }, previews:[], addedRank:0 } as LibraryItem
const URL = 'http://127.0.0.1:1/fs/t'

test('while the player shows the movie, a muted shell element follows it', async () => {
  const { element, jobs, make } = setup()
  const video = new FakeMedia()
  make().follow(video as any, movie, URL, true)
  assert.equal(element.src, URL)
  assert.equal(element.muted, true)
  assert.equal(jobs[0].held, element)
  await video.play()
  assert.equal(element.paused, false)
  video.currentTime = 100; video.fire('seeked')
  assert.equal(element.currentTime, 100)
  element.currentTime = 100.2; video.fire('timeupdate')          // small drift: speed nudged, no seek
  assert.equal(element.currentTime, 100.2)
  assert.ok(element.playbackRate < 1)
  video.pause()
  assert.equal(element.paused, true)
})

test('leaving the screen unmutes the element already in place; coming back, the video takes the sound back', async () => {
  const { element, jobs, reports, make } = setup()
  const video = new FakeMedia()
  const first = make()
  first.follow(video as any, movie, URL, true)
  await video.play()
  video.currentTime = 600; element.currentTime = 600.03
  first.handOff(movie, URL, { positionMs:600_000, durationMs:6_000_000, paused:false, volume:.7, muted:false }, true)
  assert.equal(element.muted, false)
  assert.equal(element.currentTime, 600.03)                     // in sync: no jump in the sound
  assert.equal(element.volume, .7)
  assert.equal(element.paused, false)
  element.currentTime = 900                                      // it played on meanwhile
  const second = make()
  const back = second.takeBack()
  assert.deepEqual(back && { position:back.positionMs, playing:back.playing, live:back.live }, { position:900_000, playing:true, live:true })
  assert.equal(element.paused, false)                            // the sound carries on
  const newVideo = new FakeMedia()
  second.follow(newVideo as any, movie, URL, true)
  assert.equal(newVideo.muted, true)                             // the picture comes back muted
  newVideo.currentTime = 900.05; await newVideo.play(); newVideo.fire('playing')
  assert.equal(newVideo.volume, 0)                               // the crossfade starts from silence
  await new Promise(resolve => setTimeout(resolve, 450))
  assert.equal(newVideo.muted, false)                            // ... and takes the sound back
  assert.equal(element.muted, true)
  assert.equal(newVideo.volume, .7)                              // the level the user had
  assert.equal(element.volume, .7)                               // its own level kept for next time
  assert.equal(jobs.filter(job => !job.ended).length, 1)
  assert.equal(reports.at(-1)?.[0], 900_000)
  second.release()
  assert.equal(element.paused, true)
  assert.equal(jobs.every(job => job.ended), true)
})

test('paused, or keep-playing off: no sound; the player reopens paused at the same place', async () => {
  const { element, jobs, make } = setup()
  const video = new FakeMedia()
  const first = make()
  first.follow(video as any, movie, URL, true)
  first.handOff(movie, URL, { positionMs:5000, durationMs:9000, paused:true }, true)
  assert.equal(jobs.every(job => job.ended), true)
  assert.deepEqual(make().takeBack(), { item:{ ...movie }, positionMs:5000, playing:false, live:false })
  make().follow(video as any, movie, URL, false)
  assert.equal(jobs.filter(job => !job.ended).length, 0)
  assert.equal(element.paused, true)
})

test('stopped from the operations tray: nothing to bring back', async () => {
  const { jobs, make } = setup()
  const video = new FakeMedia()
  const first = make()
  first.follow(video as any, movie, URL, true)
  await video.play()
  first.handOff(movie, URL, { positionMs:5000, durationMs:9000, paused:false }, true)
  jobs[0].ended = true
  assert.equal(make().takeBack(), null)
})
