import { ref, type Ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { calendarOccurrences, validTimeZone, type CalendarException, type CalendarMark, type CalendarRecurrence } from './calendar.ts'

export type ClockEvent = CalendarMark & {
  allDay?: boolean
  reminderMinutes?: number
  audible?: boolean
  notes?: string
}
type CalendarDoc = { version: 3; events: ClockEvent[] }
const DOC = 'clock-calendar'
const RECURRENCES: CalendarRecurrence[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

function cleanException(raw: unknown, startsAt: number): CalendarException | null {
  const value = raw as Partial<CalendarException> | null
  if (!value || !Number.isFinite(value.originalStartsAt) || Number(value.originalStartsAt) < startsAt) return null
  const originalStartsAt = Number(value.originalStartsAt)
  if (value.cancelled === true) return { originalStartsAt, cancelled: true }
  const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 120) : undefined
  const notes = value.notes === null ? null : typeof value.notes === 'string' ? value.notes.slice(0, 1000) : undefined
  const reminderMinutes = value.reminderMinutes === null ? null : Number.isFinite(value.reminderMinutes)
    ? Math.max(0, Math.min(30 * 24 * 60, Number(value.reminderMinutes))) : undefined
  return { originalStartsAt, startsAt: Number.isFinite(value.startsAt) ? Number(value.startsAt) : originalStartsAt,
    ...(title ? { title } : {}), ...(typeof value.allDay === 'boolean' ? { allDay: value.allDay } : {}),
    ...(typeof value.colour === 'string' && /^#[0-9a-f]{6}$/i.test(value.colour) ? { colour: value.colour } : {}),
    ...(Number.isFinite(value.durationMinutes) ? { durationMinutes: Math.max(0, Math.min(31 * 24 * 60, Math.round(Number(value.durationMinutes)))) } : {}),
    ...(typeof value.timezone === 'string' ? { timezone: validTimeZone(value.timezone) } : {}),
    ...(reminderMinutes !== undefined ? { reminderMinutes } : {}), ...(typeof value.audible === 'boolean' ? { audible: value.audible } : {}),
    ...(notes !== undefined ? { notes } : {}) }
}

export function normalizeClockEvents(raw: unknown): ClockEvent[] {
  const values = Array.isArray((raw as { events?: unknown } | null)?.events) ? (raw as { events: unknown[] }).events : []
  const ids = new Set<string>(), events: ClockEvent[] = []
  for (const value of values) {
    const e = value as Partial<ClockEvent> | null
    if (!e || typeof e.id !== 'string' || ids.has(e.id) || typeof e.title !== 'string' || !e.title.trim()
      || !Number.isFinite(e.startsAt)) continue
    ids.add(e.id)
    const recurrence = RECURRENCES.includes(e.recurrence as CalendarRecurrence) ? e.recurrence as CalendarRecurrence : 'none'
    const exceptions = recurrence === 'none' || !Array.isArray(e.exceptions) ? undefined : Array.from(new Map(e.exceptions
      .map(value => cleanException(value, Number(e.startsAt))).filter((value): value is CalendarException => !!value)
      .slice(0, 500).map(value => [value.originalStartsAt, value])).values())
    events.push({ id: e.id.slice(0, 80), title: e.title.trim().slice(0, 120), startsAt: Number(e.startsAt), allDay: e.allDay === true,
      colour: typeof e.colour === 'string' && /^#[0-9a-f]{6}$/i.test(e.colour) ? e.colour : undefined,
      durationMinutes: Number.isFinite(e.durationMinutes) ? Math.max(0, Math.min(31 * 24 * 60, Math.round(Number(e.durationMinutes)))) : e.allDay === true ? 24 * 60 : 60,
      timezone: validTimeZone(typeof e.timezone === 'string' ? e.timezone : 'local'), recurrence,
      recurrenceInterval: recurrence === 'none' ? undefined : Number.isFinite(e.recurrenceInterval) ? Math.max(1, Math.min(99, Math.round(Number(e.recurrenceInterval)))) : 1,
      recurrenceUntil: recurrence !== 'none' && Number.isFinite(e.recurrenceUntil) && Number(e.recurrenceUntil) >= Number(e.startsAt) ? Number(e.recurrenceUntil) : undefined,
      reminderMinutes: Number.isFinite(e.reminderMinutes) ? Math.max(0, Math.min(30 * 24 * 60, Number(e.reminderMinutes))) : undefined,
      audible: e.audible !== false, notes: typeof e.notes === 'string' ? e.notes.slice(0, 1000) : undefined,
      ...(exceptions?.length ? { exceptions } : {}) })
    if (events.length === 2000) break
  }
  return events.sort((a, b) => a.startsAt - b.startsAt)
}

/** Reminder instances for the next two years. Recurring ids are occurrence-specific. */
export function clockEventReminders(events: ClockEvent[], now = Date.now()) {
  const horizon = now + 2 * 366 * 24 * 60 * 60_000
  const recurring = calendarOccurrences(events.filter(e => (e.recurrence ?? 'none') !== 'none'), now - 30 * 24 * 60 * 60_000, horizon, 1200)
  const oneOff = events.filter(e => (e.recurrence ?? 'none') === 'none').map(e => ({ ...e, seriesId: e.id, occurrenceId: e.id, endsAt: e.startsAt + (e.durationMinutes ?? 60) * 60_000 }))
  return [...oneOff, ...recurring].flatMap(event => event.reminderMinutes === undefined ? [] : [{
    id: event.occurrenceId, label: event.title, at: event.startsAt - event.reminderMinutes * 60_000, audible: event.audible !== false,
  }]).filter(reminder => reminder.at >= now - 30 * 60_000).sort((a, b) => a.at - b.at).slice(0, 20)
}

function occurrenceException(originalStartsAt: number, patch: Omit<ClockEvent, 'id'>): CalendarException {
  return { originalStartsAt, startsAt: patch.startsAt, title: patch.title, allDay: patch.allDay === true, colour: patch.colour,
    durationMinutes: patch.durationMinutes, timezone: validTimeZone(patch.timezone), reminderMinutes: patch.reminderMinutes ?? null,
    audible: patch.audible !== false, notes: patch.notes ?? null }
}

export function withOccurrenceUpdate(event: ClockEvent, originalStartsAt: number, patch: Omit<ClockEvent, 'id'>): ClockEvent {
  if ((event.recurrence ?? 'none') === 'none') return { ...patch, id: event.id }
  const exception = occurrenceException(originalStartsAt, patch)
  return { ...event, exceptions: [...(event.exceptions ?? []).filter(value => value.originalStartsAt !== originalStartsAt), exception] }
}

export function withOccurrenceRemoval(event: ClockEvent, originalStartsAt: number): ClockEvent {
  if ((event.recurrence ?? 'none') === 'none') return event
  return { ...event, exceptions: [...(event.exceptions ?? []).filter(value => value.originalStartsAt !== originalStartsAt), { originalStartsAt, cancelled: true }] }
}

export function withSeriesUpdate(event: ClockEvent, patch: Omit<ClockEvent, 'id'>): ClockEvent {
  const sameSchedule = event.startsAt === patch.startsAt && (event.recurrence ?? 'none') === (patch.recurrence ?? 'none')
    && (event.recurrenceInterval ?? 1) === (patch.recurrenceInterval ?? 1)
    && event.recurrenceUntil === patch.recurrenceUntil && validTimeZone(event.timezone) === validTimeZone(patch.timezone)
  return { ...patch, id: event.id, ...(sameSchedule && event.exceptions?.length ? { exceptions: event.exceptions } : {}) }
}

export function useClockCalendar(sdk: WidgetSdk | undefined, notify: (text: string) => void) {
  const events = ref<ClockEvent[]>([]) as Ref<ClockEvent[]>, loaded = ref(false)
  void (async () => {
    try { events.value = normalizeClockEvents(await sdk?.configRead?.(DOC)) } catch { /* first run */ }
    loaded.value = true
  })()
  async function write() {
    try { await sdk?.configWrite?.(DOC, { version: 3, events: events.value } satisfies CalendarDoc) }
    catch { notify("The calendar couldn't be saved.") }
  }
  function add(input: Omit<ClockEvent, 'id'>) {
    const event = normalizeClockEvents({ events: [{ ...input, id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }] })[0]
    if (!event) return
    events.value = [...events.value, event].sort((a, b) => a.startsAt - b.startsAt)
    void write(); notify(`Marked “${event.title}” on the calendar.`)
  }
  function update(id: string, patch: Omit<ClockEvent, 'id'>) {
    const previous = events.value.find(value => value.id === id)
    const event = normalizeClockEvents({ events: [previous ? withSeriesUpdate(previous, patch) : { ...patch, id }] })[0]
    if (!event) return
    events.value = events.value.map(e => e.id === id ? event : e).sort((a, b) => a.startsAt - b.startsAt)
    void write(); notify(`Updated “${event.title}”.`)
  }
  function updateOccurrence(id: string, originalStartsAt: number, patch: Omit<ClockEvent, 'id'>) {
    const source = events.value.find(event => event.id === id)
    if (!source) return
    if ((source.recurrence ?? 'none') === 'none') { update(id, patch); return }
    events.value = normalizeClockEvents({ events: events.value.map(event => event.id === id ? withOccurrenceUpdate(event, originalStartsAt, patch) : event) })
    void write(); notify(`Updated this occurrence of “${source.title}”.`)
  }
  function removeOccurrence(id: string, originalStartsAt: number) {
    const source = events.value.find(event => event.id === id)
    if (!source) return
    if ((source.recurrence ?? 'none') === 'none') { remove(id); return }
    events.value = normalizeClockEvents({ events: events.value.map(event => event.id === id ? withOccurrenceRemoval(event, originalStartsAt) : event) })
    void write(); notify(`Skipped this occurrence of “${source.title}”.`)
  }
  function remove(id: string) { events.value = events.value.filter(e => e.id !== id); void write() }
  function replace(next: ClockEvent[]) { events.value = normalizeClockEvents({ events: next }); void write() }
  return { events, loaded, add, update, updateOccurrence, remove, removeOccurrence, replace }
}
export type ClockCalendar = ReturnType<typeof useClockCalendar>
