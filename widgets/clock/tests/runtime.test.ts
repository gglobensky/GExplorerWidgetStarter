import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive, ref } from 'vue'
import { durationText } from '../time.ts'
import { ALARM_SOUNDS, alarmToneBlob, validAlarmSound } from '../alarmTone.ts'
import { createRuntime, type ClockTimer, type StopwatchData } from '../runtime.ts'

test('time tools format stopwatch and timer durations', () => {
  assert.equal(durationText(0), '0:00')
  assert.equal(durationText(65_432), '1:05')
  assert.equal(durationText(3_661_999), '1:01:01')
  assert.equal(durationText(65_432, true), '1:05.4')
  assert.equal(durationText(65_432, 2), '1:05.43')
})

test('the optional alarm is a local WAV for Audio Rack', () => {
  const blob = alarmToneBlob()
  assert.equal(blob.type, 'audio/wav')
  assert.ok(blob.size > 10_000)
})

test('built-in alarm sounds are valid, local, and distinct', async () => {
  const waves = await Promise.all(ALARM_SOUNDS.map(async sound => new Uint8Array(await alarmToneBlob(sound.id).arrayBuffer())))
  assert.equal(validAlarmSound('not-a-sound'), 'chime')
  assert.equal(waves.length, 4)
  assert.ok(waves.every(wave => String.fromCharCode(...wave.slice(0, 4)) === 'RIFF'))
  assert.equal(new Set(waves.map(wave => `${wave.length}:${wave.slice(1000, 1020).join(',')}`)).size, waves.length)
})

test('paused timers and stopwatch retain resumable job cards and Audio Rack loads the alarm source', async () => {
  const jobs: Record<string, any> = {}
  const makeJob = (kind: string) => jobs[kind] = {
    alive: true, title: '', held: null, closeWarning: null,
    end() { this.alive = false },
    update(value: { title?: string; closeWarning?: string | null }) {
      if (value.title) this.title = value.title
      if (value.closeWarning !== undefined) this.closeWarning = value.closeWarning
    },
    checkpoint() {}, attention() {}, hold(value: unknown) { this.held = value },
  }
  let source = '', loads = 0, primes = 0
  const audioHandle: any = {
    alive: true, currentTime: 0, loop: true, volume: .78, muted: false, playbackRate: 1,
    pause() {}, play: async () => {}, release() {}, connectToCategory() {},
    load() { loads++ },
    get src() { return source }, set src(value: string) { source = value },
  }
  const sdk: any = {
    jobs: () => ({
      ensure: (kind: string) => jobs[kind]?.alive ? jobs[kind] : makeJob(kind),
      whenPending: () => () => {},
    }),
    audio: () => ({
      prime: async () => { primes++ },
      acquireElement: (options: any) => {
        assert.equal(options.initialProps.src, undefined)
        return audioHandle
      },
    }),
  }
  const stopwatch = reactive<StopwatchData>({ status: 'idle', startedAt: 0, elapsedMs: 0, laps: [] })
  const timers = ref<ClockTimer[]>([])
  const runtime = createRuntime(sdk, stopwatch, timers)

  runtime.startStopwatch()
  runtime.pauseStopwatch()
  assert.equal(jobs.stopwatch.alive, true)
  assert.match(jobs.stopwatch.title, /paused/)

  await runtime.addTimer(60_000, 'Tea', true)
  assert.match(jobs.scheduler.closeWarning, /Tea/)
  runtime.pauseTimer(timers.value[0].id)
  assert.equal(jobs.scheduler.alive, true)
  assert.equal(jobs.scheduler.closeWarning, null)
  assert.equal(jobs.scheduler.held, audioHandle)
  assert.match(source, /^blob:/)
  assert.equal(loads, 1)
  assert.equal(primes, 1)
  const originalSource = source
  runtime.setAlarmSound('bell')
  assert.equal(runtime.alarmSound.value, 'bell')
  assert.notEqual(source, originalSource)
  assert.equal(loads, 2)
  runtime.dispose()
})

test('ringing timers can be snoozed without losing their scheduler job', async () => {
  const jobs: Record<string, any> = {}
  const sdk: any = {
    jobs: () => ({
      ensure: (kind: string) => jobs[kind] ??= { alive: true, end() { this.alive = false }, update() {}, checkpoint() {}, attention() {}, hold() {} },
      whenPending: () => () => {},
    }),
  }
  const stopwatch = reactive<StopwatchData>({ status: 'idle', startedAt: 0, elapsedMs: 0, laps: [] })
  const timers = ref<ClockTimer[]>([{ id: 'tea', label: 'Tea', durationMs: 1000, remainingMs: 0, endAt: 0, status: 'ringing', audible: false, source: 'timer' }])
  const runtime = createRuntime(sdk, stopwatch, timers)

  assert.equal(runtime.snoozeTimer('tea'), true)
  assert.equal(timers.value[0].status, 'running')
  assert.equal(timers.value[0].snoozed, true)
  assert.ok(timers.value[0].remainingMs >= 299_000)
  assert.equal(jobs.scheduler.alive, true)
  assert.equal(runtime.snoozeTimer('tea'), false)
  runtime.dispose()
})

test('calendar reminder synchronization preserves a snoozed occurrence', async () => {
  const sdk: any = { jobs: () => ({ ensure: () => ({ alive: true, end() {}, update() {}, checkpoint() {}, attention() {}, hold() {} }), whenPending: () => () => {} }) }
  const stopwatch = reactive<StopwatchData>({ status: 'idle', startedAt: 0, elapsedMs: 0, laps: [] })
  const timers = ref<ClockTimer[]>([{ id: 'calendar-event-1', label: 'Meeting', durationMs: 300_000, remainingMs: 300_000, endAt: Date.now() + 300_000, status: 'running', audible: false, source: 'calendar', sourceId: 'event-1', snoozed: true }])
  const runtime = createRuntime(sdk, stopwatch, timers)
  const snoozedEnd = timers.value[0].endAt

  await runtime.syncCalendarReminders([{ id: 'event-1', label: 'Meeting', at: Date.now() + 60_000, audible: false }])
  assert.equal(timers.value[0].endAt, snoozedEnd)
  assert.equal(timers.value[0].snoozed, true)
  runtime.dispose()
})

test('scheduler recovery resumes its job and primes Audio Rack without opening the clock view', async () => {
  let pendingScheduler: ((job: any) => void) | undefined, primes = 0
  const resumed = { alive: true, end() {}, update() {}, checkpoint() {}, attention() {}, hold() {} }
  const sdk: any = {
    jobs: () => ({
      ensure: () => resumed,
      whenPending: (kind: string, callback: (job: any) => void) => { if (kind === 'scheduler') pendingScheduler = callback; return () => {} },
    }),
    audio: () => ({
      prime: async () => { primes++ },
      acquireElement: () => ({ currentTime: 0, pause() {}, play: async () => {}, load() {}, set src(_value: string) {} }),
    }),
  }
  const stopwatch = reactive<StopwatchData>({ status: 'idle', startedAt: 0, elapsedMs: 0, laps: [] })
  const timers = ref<ClockTimer[]>([])
  const runtime = createRuntime(sdk, stopwatch, timers)
  const saved: ClockTimer[] = [{ id: 'oven', label: 'Oven', durationMs: 300_000, remainingMs: 250_000,
    endAt: Date.now() + 250_000, status: 'running', audible: true, source: 'timer' }]

  pendingScheduler?.({ state: saved, params: null, resume: () => resumed })
  await Promise.resolve()
  assert.equal(timers.value[0].id, 'oven')
  assert.equal(primes, 1)
  runtime.dispose()
})

