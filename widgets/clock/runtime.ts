import { markRaw, ref, type Ref } from 'vue'
import type { AudioHandle, WidgetJob, WidgetPendingJob, WidgetSdk } from 'gexplorer/widgets'
import { alarmToneBlob, validAlarmSound, type AlarmSoundId } from './alarmTone.ts'
import { durationText } from './time.ts'

export type StopwatchData = { status: 'idle' | 'running' | 'paused'; startedAt: number; elapsedMs: number; laps: number[] }
export type ClockTimer = {
  id: string; label: string; durationMs: number; remainingMs: number; endAt: number
  status: 'running' | 'paused' | 'ringing' | 'done'; audible: boolean
  source?: 'timer' | 'calendar'; sourceId?: string
  snoozed?: boolean
}

const blankStopwatch = (): StopwatchData => ({ status: 'idle', startedAt: 0, elapsedMs: 0, laps: [] })
const validStopwatch = (raw: unknown): StopwatchData | null => {
  const s = raw as StopwatchData | null
  return s && ['idle', 'running', 'paused'].includes(s.status) && Number.isFinite(s.startedAt) && Number.isFinite(s.elapsedMs) && Array.isArray(s.laps)
    ? { status: s.status, startedAt: s.startedAt, elapsedMs: Math.max(0, s.elapsedMs), laps: s.laps.filter(Number.isFinite).slice(0, 200) } : null
}
function validTimers(raw: unknown): ClockTimer[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value): ClockTimer[] => {
    const t = value as ClockTimer
    return t && typeof t.id === 'string' && typeof t.label === 'string' && Number.isFinite(t.durationMs)
      && Number.isFinite(t.remainingMs) && Number.isFinite(t.endAt) && ['running', 'paused', 'ringing', 'done'].includes(t.status)
      ? [{ ...t, label: t.label.slice(0, 80), durationMs: Math.max(1000, t.durationMs), remainingMs: Math.max(0, t.remainingMs), audible: t.audible !== false,
          source: t.source === 'calendar' ? 'calendar' : 'timer', sourceId: typeof t.sourceId === 'string' ? t.sourceId : undefined,
          snoozed: t.snoozed === true }]
      : []
  }).slice(0, 20)
}

export type ClockRuntime = ReturnType<typeof createRuntime>

export function createRuntime(sdk: WidgetSdk, stopwatch: StopwatchData, timers: Ref<ClockTimer[]>, alarmSound: Ref<AlarmSoundId> = ref('chime')) {
  const stamp = ref(Date.now())
  const jobs = sdk.jobs?.()
  let stopwatchJob: WidgetJob | null = null
  let schedulerJob: WidgetJob | null = null
  let alarm: AudioHandle | null = null
  let alarmUrl: string | null = null
  let previewAlarm: AudioHandle | null = null
  let previewUrl: string | null = null
  let titledAt = 0, checkpointedAt = 0

  function stopwatchElapsed(at = stamp.value) {
    return stopwatch.elapsedMs + (stopwatch.status === 'running' ? Math.max(0, at - stopwatch.startedAt) : 0)
  }
  const snapshotStopwatch = (): StopwatchData => ({ ...stopwatch, elapsedMs: stopwatchElapsed(), startedAt: Date.now(), laps: [...stopwatch.laps] })
  function replaceTimers(next: ClockTimer[]) { timers.value = next }
  // Paused clocks are still live tools. Keeping their job alive gives the tray a
  // stable card from which they can be resumed, even while the widget is away.
  function retainedTimers() { return timers.value.filter(t => t.status === 'running' || t.status === 'ringing' || t.status === 'paused') }
  function nextTimer() { return timers.value.filter(t => t.status === 'running').sort((a, b) => a.endAt - b.endAt)[0] ?? null }
  function syncSchedulerCloseWarning() {
    if (!schedulerJob?.alive) return
    const active = timers.value.filter(t => t.status === 'running' || t.status === 'ringing')
    schedulerJob.update({ closeWarning: active.length === 0 ? null
      : active.length === 1 ? `Clock: “${active[0].label}” is active.`
      : `Clock: ${active.length} timers or reminders are active.` })
  }

  function ensureStopwatchJob() {
    if (stopwatchJob?.alive || !jobs) return
    stopwatchJob = jobs.ensure('stopwatch', { title: `Stopwatch ${durationText(stopwatchElapsed())}`, params: { startedAt: stopwatch.startedAt } })
  }
  function replaceAlarmSource() {
    if (!alarm) return
    alarm.pause()
    if (alarmUrl) URL.revokeObjectURL(alarmUrl)
    alarmUrl = URL.createObjectURL(alarmToneBlob(alarmSound.value))
    alarm.src = alarmUrl
    alarm.load()
  }
  async function ensureSchedulerJob(userGesture = false) {
    if (!schedulerJob?.alive && jobs) schedulerJob = jobs.ensure('scheduler', { title: 'Clock timers', params: { timers: timers.value } })
    syncSchedulerCloseWarning()
    if (sdk.audio) {
      const audio = sdk.audio()
      // A recovered scheduler has no fresh click. Audio Rack may still allow its
      // context to resume (notably in the desktop WebView), so always try; job
      // attention remains the fallback where autoplay policy rejects it.
      try { await audio.prime() } catch { /* the tray still calls attention */ }
      if (!alarm) {
        alarmUrl ??= URL.createObjectURL(alarmToneBlob(alarmSound.value))
        // Assign through AudioHandle.src instead of initialProps. Audio Rack's
        // setter loads the source and connects it to the SFX bus; initialProps
        // only assigned the underlying element and could leave this Blob silent.
        alarm = audio.acquireElement({ key: 'clock-alarm', category: 'sfx', suspendPolicy: 'continue', initialProps: { loop: true, volume: .78, preload: 'auto' } })
        alarm.src = alarmUrl
        alarm.load()
        schedulerJob?.hold(alarm)
      }
    }
  }
  function stopPreview() {
    previewAlarm?.pause()
    previewAlarm?.release()
    previewAlarm = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }
  function setAlarmSound(sound: AlarmSoundId) {
    const next = validAlarmSound(sound)
    if (alarmSound.value === next) return
    alarmSound.value = next
    replaceAlarmSource()
  }
  async function previewAlarmSound(sound: AlarmSoundId = alarmSound.value) {
    if (!sdk.audio) return
    stopPreview()
    const audio = sdk.audio()
    try { await audio.prime() } catch { /* play() below reports policy failures */ }
    previewUrl = URL.createObjectURL(alarmToneBlob(validAlarmSound(sound)))
    previewAlarm = audio.acquireElement({ key: 'clock-alarm-preview', category: 'sfx', suspendPolicy: 'pause', initialProps: { loop: false, volume: .78, preload: 'auto' } })
    previewAlarm.src = previewUrl
    previewAlarm.load()
    previewAlarm.addEventListener('ended', stopPreview, { once: true })
    try { await previewAlarm.play() } catch { stopPreview() }
  }
  function stopAlarmIfQuiet() {
    if (timers.value.some(t => t.status === 'ringing' && t.audible)) return
    alarm?.pause()
    if (alarm) alarm.currentTime = 0
    schedulerJob?.attention(false)
  }
  function finishSchedulerIfIdle() {
    syncSchedulerCloseWarning()
    if (retainedTimers().length) return
    stopAlarmIfQuiet()
    if (schedulerJob?.alive) schedulerJob.end()
    schedulerJob = null
    alarm = null
  }

  function tick() {
    const at = Date.now(); stamp.value = at
    if (stopwatchJob && !stopwatchJob.alive) {
      if (stopwatch.status === 'running') {
        stopwatch.elapsedMs = stopwatchElapsed(at); stopwatch.startedAt = 0; stopwatch.status = 'paused'; stopwatchJob = null
      }
      stopwatchJob = null
    } else if (stopwatch.status === 'running') {
      ensureStopwatchJob()
      if (stopwatchJob && at - titledAt > 5000) stopwatchJob.update({ title: `Stopwatch ${durationText(stopwatchElapsed(at))}` })
    } else if (stopwatch.status === 'paused' && stopwatchJob && at - titledAt > 5000) {
      stopwatchJob.update({ title: `Stopwatch paused · ${durationText(stopwatchElapsed(at))}` })
    }
    if (schedulerJob && !schedulerJob.alive) {
      replaceTimers(timers.value.map(t => t.status === 'running' ? { ...t, status: 'paused', remainingMs: Math.max(0, t.endAt - at), endAt: 0 } : t.status === 'ringing' ? { ...t, status: 'done' } : t))
      alarm?.pause(); schedulerJob = null; alarm = null
    }
    const next = timers.value.map(t => {
      if (t.status !== 'running') return t
      const remainingMs = Math.max(0, t.endAt - at)
      if (remainingMs > 0) return remainingMs === t.remainingMs ? t : { ...t, remainingMs }
      return { ...t, remainingMs: 0, status: 'ringing' as const }
    })
    const rang = next.find((t, i) => t.status === 'ringing' && timers.value[i]?.status === 'running') ?? null
    if (next.some((t, i) => t !== timers.value[i])) replaceTimers(next)
    if (rang) {
      schedulerJob?.update({ title: `${rang.label} is ready` }); schedulerJob?.attention(true)
      if (rang.audible && alarm) { alarm.currentTime = 0; void alarm.play().catch(() => { /* attention remains */ }) }
    } else if (schedulerJob?.alive && at - titledAt > 5000) {
      const upcoming = nextTimer(), paused = timers.value.find(t => t.status === 'paused')
      schedulerJob.update({ title: upcoming ? `${upcoming.label} · ${durationText(upcoming.remainingMs)}` : paused ? `${paused.label} paused · ${durationText(paused.remainingMs)}` : 'Clock timers' })
    }
    if (at - titledAt > 5000) titledAt = at
    syncSchedulerCloseWarning()
    if (at - checkpointedAt > 2000) {
      if (stopwatchJob?.alive) stopwatchJob.checkpoint(snapshotStopwatch())
      if (schedulerJob?.alive) schedulerJob.checkpoint(timers.value)
      checkpointedAt = at
    }
  }
  const interval = setInterval(tick, 200)

  function startStopwatch() {
    if (stopwatch.status === 'running') return
    stopwatch.startedAt = Date.now(); stopwatch.status = 'running'; ensureStopwatchJob(); tick()
  }
  function pauseStopwatch() {
    if (stopwatch.status !== 'running') return
    stopwatch.elapsedMs = stopwatchElapsed(Date.now()); stopwatch.startedAt = 0; stopwatch.status = 'paused'
    if (stopwatchJob?.alive) {
      stopwatchJob.update({ title: `Stopwatch paused · ${durationText(stopwatch.elapsedMs)}` })
      stopwatchJob.checkpoint(snapshotStopwatch())
    }
  }
  function resetStopwatch() {
    if (stopwatchJob?.alive) stopwatchJob.end(); stopwatchJob = null
    Object.assign(stopwatch, blankStopwatch())
  }
  function lapStopwatch() { if (stopwatch.status === 'running') stopwatch.laps = [stopwatchElapsed(), ...stopwatch.laps].slice(0, 200) }

  async function addTimer(durationMs: number, label = 'Timer', audible = true) {
    const duration = Math.max(1000, Math.min(7 * 24 * 3600_000, Math.round(durationMs)))
    const at = Date.now()
    replaceTimers([...timers.value.filter(t => t.status !== 'done'), { id: `t-${at}-${Math.random().toString(36).slice(2, 7)}`, label: label.trim() || 'Timer', durationMs: duration, remainingMs: duration, endAt: at + duration, status: 'running', audible, source: 'timer' }])
    await ensureSchedulerJob(true); tick()
  }
  function pauseTimer(id: string) {
    const at = Date.now(); replaceTimers(timers.value.map(t => t.id === id && t.status === 'running' ? { ...t, status: 'paused', remainingMs: Math.max(0, t.endAt - at), endAt: 0 } : t)); finishSchedulerIfIdle()
  }
  function resumeTimer(id: string) {
    const at = Date.now(); replaceTimers(timers.value.map(t => t.id === id && t.status === 'paused' ? { ...t, status: 'running', endAt: at + t.remainingMs } : t)); void ensureSchedulerJob(true); tick()
  }
  function dismissTimer(id: string) {
    replaceTimers(timers.value.map(t => t.id === id ? { ...t, status: 'done', remainingMs: 0, endAt: 0 } : t)); stopAlarmIfQuiet(); finishSchedulerIfIdle()
  }
  function snoozeTimer(id: string, minutes = 5) {
    const delay = Math.max(60_000, Math.min(60 * 60_000, Math.round(minutes * 60_000))), at = Date.now()
    let changed = false
    replaceTimers(timers.value.map(t => {
      if (t.id !== id || t.status !== 'ringing') return t
      changed = true
      return { ...t, durationMs: delay, remainingMs: delay, endAt: at + delay, status: 'running', snoozed: true }
    }))
    if (!changed) return false
    stopAlarmIfQuiet(); void ensureSchedulerJob(true); tick()
    return true
  }
  function removeTimer(id: string) { replaceTimers(timers.value.filter(t => t.id !== id)); stopAlarmIfQuiet(); finishSchedulerIfIdle() }
  async function syncCalendarReminders(reminders: Array<{ id: string; label: string; at: number; audible: boolean }>, userGesture = false) {
    const at = Date.now(), existing = new Map(timers.value.filter(t => t.source === 'calendar').map(t => [t.sourceId, t]))
    const calendar = reminders.filter(r => Number.isFinite(r.at) && r.at >= at - 30 * 60_000).slice(0, 200).map(r => {
      const old = existing.get(r.id)
      if (old?.snoozed && old.status !== 'done') return old
      if (old && old.endAt === r.at && old.status !== 'done') return old
      const durationMs = Math.max(1000, r.at - at)
      return { id: `calendar-${r.id}`, source: 'calendar' as const, sourceId: r.id, label: r.label.slice(0, 80), durationMs,
        remainingMs: Math.max(0, r.at - at), endAt: r.at, status: 'running' as const, audible: r.audible }
    })
    replaceTimers([...timers.value.filter(t => t.source !== 'calendar'), ...calendar])
    // A recurring reminder falls out of the rolling window after it rang. Do not
    // leave its Audio Rack loop playing merely because later reminders keep this job alive.
    stopAlarmIfQuiet()
    if (retainedTimers().length) await ensureSchedulerJob(userGesture)
    else finishSchedulerIfIdle()
    tick()
  }

  const unsubStopwatch = jobs?.whenPending('stopwatch', (pending: WidgetPendingJob) => {
    const saved = validStopwatch(pending.state)
    if (saved) Object.assign(stopwatch, saved, {
      status: saved.status === 'paused' ? 'paused' : 'running',
      elapsedMs: saved.elapsedMs + (saved.status === 'running' ? Math.max(0, Date.now() - saved.startedAt) : 0),
      startedAt: saved.status === 'paused' ? 0 : Date.now(),
    })
    stopwatchJob = pending.resume({ title: `Stopwatch ${durationText(stopwatchElapsed())}` }); tick()
  })
  const unsubScheduler = jobs?.whenPending('scheduler', (pending: WidgetPendingJob) => {
    const params = pending.params as { timers?: unknown } | undefined
    const saved = validTimers(pending.state ?? params?.timers)
    if (saved.length) replaceTimers(saved)
    schedulerJob = pending.resume({ title: 'Clock timers' }); void ensureSchedulerJob(false); tick()
  })

  return markRaw({
    stamp, stopwatch, timers, alarmSound, stopwatchElapsed, startStopwatch, pauseStopwatch, resetStopwatch, lapStopwatch,
    setAlarmSound, previewAlarmSound,
    addTimer, pauseTimer, resumeTimer, snoozeTimer, dismissTimer, removeTimer, syncCalendarReminders, nextTimer,
    dispose() { clearInterval(interval); unsubStopwatch?.(); unsubScheduler?.(); stopPreview(); alarm?.pause(); if (alarmUrl) URL.revokeObjectURL(alarmUrl) },
  })
}

export function clockRuntime(sdk: WidgetSdk): ClockRuntime {
  const life = sdk.lifecycle?.()
  if (!life) throw new Error('[clock] lifecycle is not available')
  const stopwatch = life.persistReactive<StopwatchData>('clock-stopwatch', blankStopwatch)
  const timers = life.persistRef<ClockTimer[]>('clock-timers', [])
  const alarmSound = life.persistRef<AlarmSoundId>('clock-alarm-sound', 'chime')
  alarmSound.value = validAlarmSound(alarmSound.value)
  return life.persistRef<ClockRuntime>('clock-runtime', () => createRuntime(sdk, stopwatch, timers, alarmSound), { dispose: runtime => runtime.dispose() }).value
}
