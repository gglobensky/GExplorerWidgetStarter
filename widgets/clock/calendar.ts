export type CalendarRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/** A change to one generated occurrence. Its identity remains originalStartsAt even when moved. */
export type CalendarException = {
  originalStartsAt: number
  cancelled?: boolean
  startsAt?: number
  title?: string
  allDay?: boolean
  colour?: string
  durationMinutes?: number
  timezone?: string
  reminderMinutes?: number | null
  audible?: boolean
  notes?: string | null
}

export type CalendarMark = {
  id: string
  title: string
  startsAt: number
  allDay?: boolean
  colour?: string
  durationMinutes?: number
  timezone?: string
  recurrence?: CalendarRecurrence
  recurrenceInterval?: number
  recurrenceUntil?: number
  exceptions?: CalendarException[]
}

export type CalendarOccurrence<T extends CalendarMark = CalendarMark> = T & {
  /** Stable id of the saved event series. */
  seriesId: string
  /** Unique id for this occurrence, suitable for reminder jobs and v-for. */
  occurrenceId: string
  /** The generated series time before a single-occurrence move. */
  originalStartsAt: number
  endsAt: number
}

export type CalendarCell = {
  key: string
  date: Date
  day: number
  inMonth: boolean
  today: boolean
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }
const formatters = new Map<string, Intl.DateTimeFormat>()

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatter(timezone: string) {
  let value = formatters.get(timezone)
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    formatters.set(timezone, value)
  }
  return value
}

export function validTimeZone(timezone: string | undefined): string {
  if (!timezone || timezone === 'local') return 'local'
  try { formatter(timezone).format(0); return timezone } catch { return 'local' }
}

function partsAt(at: number, timezone: string): DateParts {
  if (timezone === 'local') {
    const d = new Date(at)
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() }
  }
  const values = Object.fromEntries(formatter(timezone).formatToParts(at).map(p => [p.type, Number(p.value)]))
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second }
}

export function datePartsInZone(at: number, timezone = 'local'): DateParts {
  return partsAt(at, validTimeZone(timezone))
}

/** Turns wall-clock fields in an IANA zone into an epoch, including DST transitions. */
export function timeInZone(parts: DateParts, timezone = 'local'): number {
  if (timezone === 'local') return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second).getTime()
  const wanted = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  let guess = wanted
  for (let i = 0; i < 4; i++) {
    const actual = partsAt(guess, timezone)
    const delta = wanted - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    if (!delta) break
    guess += delta
  }
  return guess
}

function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate() }

function occurrenceParts(base: DateParts, recurrence: CalendarRecurrence, step: number): DateParts {
  if (!step || recurrence === 'none') return { ...base }
  if (recurrence === 'monthly') {
    const total = base.year * 12 + base.month - 1 + step
    const year = Math.floor(total / 12), month = total % 12 + 1
    return { ...base, year, month, day: Math.min(base.day, daysInMonth(year, month)) }
  }
  if (recurrence === 'yearly') {
    const year = base.year + step
    return { ...base, year, day: Math.min(base.day, daysInMonth(year, base.month)) }
  }
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + step * (recurrence === 'weekly' ? 7 : 1), base.hour, base.minute, base.second))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: base.hour, minute: base.minute, second: base.second }
}

function firstLikelyIndex(mark: CalendarMark, rangeStart: number, base: DateParts, recurrence: CalendarRecurrence, interval: number) {
  if (rangeStart <= mark.startsAt) return 0
  if (recurrence === 'daily' || recurrence === 'weekly') {
    const unit = recurrence === 'weekly' ? 7 * 86_400_000 : 86_400_000
    return Math.max(0, Math.floor((rangeStart - mark.startsAt) / unit / interval) - 2)
  }
  const at = partsAt(rangeStart, validTimeZone(mark.timezone))
  if (recurrence === 'monthly') return Math.max(0, Math.floor(((at.year - base.year) * 12 + at.month - base.month) / interval) - 2)
  return Math.max(0, Math.floor((at.year - base.year) / interval) - 2)
}

/** Expands saved series only inside a requested window; wall time stays stable across DST. */
export function calendarOccurrences<T extends CalendarMark>(marks: T[], rangeStart: number, rangeEnd: number, limit = 2000): CalendarOccurrence<T>[] {
  const out: CalendarOccurrence<T>[] = []
  for (const mark of marks) {
    if (!Number.isFinite(mark.startsAt)) continue
    const recurrence = mark.recurrence ?? 'none'
    const occurrence = (originalStartsAt: number, exception?: CalendarException): CalendarOccurrence<T> | null => {
      if (exception?.cancelled) return null
      type ExpandedOccurrence = T & Partial<CalendarException> & { startsAt: number }
      const value = { ...mark, ...(exception ?? {}), startsAt: exception?.startsAt ?? originalStartsAt } as ExpandedOccurrence
      delete value.cancelled; delete value.originalStartsAt
      if (exception?.reminderMinutes === null) delete value.reminderMinutes
      if (exception?.notes === null) delete value.notes
      const duration = Math.max(0, Math.min(31 * 24 * 60, value.durationMinutes ?? (value.allDay ? 24 * 60 : 60))) * 60_000
      return { ...value, seriesId: mark.id, occurrenceId: mark.recurrence && mark.recurrence !== 'none' ? `${mark.id}@${originalStartsAt}` : mark.id,
        originalStartsAt, endsAt: value.startsAt + duration } as CalendarOccurrence<T>
    }
    if (recurrence === 'none') {
      const value = occurrence(mark.startsAt)
      if (value && value.startsAt >= rangeStart && value.startsAt < rangeEnd) out.push(value)
      continue
    }
    const exceptions = new Map((mark.exceptions ?? []).map(value => [value.originalStartsAt, value]))
    const handled = new Set<number>()
    const timezone = validTimeZone(mark.timezone), interval = Math.max(1, Math.min(99, Math.round(mark.recurrenceInterval ?? 1)))
    const base = partsAt(mark.startsAt, timezone)
    let index = firstLikelyIndex(mark, rangeStart, base, recurrence, interval)
    for (let guard = 0; guard < limit + 8; guard++, index++) {
      const startsAt = timeInZone(occurrenceParts(base, recurrence, index * interval), timezone)
      if (mark.recurrenceUntil !== undefined && startsAt > mark.recurrenceUntil) break
      if (startsAt >= rangeEnd) break
      if (startsAt >= rangeStart) {
        handled.add(startsAt)
        const value = occurrence(startsAt, exceptions.get(startsAt))
        if (value && value.startsAt >= rangeStart && value.startsAt < rangeEnd) out.push(value)
      }
      if (out.length >= limit) return out.sort((a, b) => a.startsAt - b.startsAt)
    }
    // A moved occurrence can enter this window even when its generated date was outside it.
    for (const exception of exceptions.values()) {
      if (handled.has(exception.originalStartsAt) || exception.cancelled || !Number.isFinite(exception.startsAt)) continue
      if (exception.startsAt! < rangeStart || exception.startsAt! >= rangeEnd) continue
      const value = occurrence(exception.originalStartsAt, exception)
      if (value) out.push(value)
      if (out.length >= limit) return out.sort((a, b) => a.startsAt - b.startsAt)
    }
  }
  return out.sort((a, b) => a.startsAt - b.startsAt)
}

/** Six paper-calendar rows, Monday or Sunday first. */
export function calendarCells(year: number, month: number, weekStartsMonday: boolean, today = new Date()): CalendarCell[] {
  const first = new Date(year, month, 1, 12)
  const weekday = first.getDay()
  const lead = weekStartsMonday ? (weekday + 6) % 7 : weekday
  const start = new Date(year, month, 1 - lead, 12)
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12)
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      date, day: date.getDate(), inMonth: date.getMonth() === month, today: sameDay(date, today),
    }
  })
}

export function marksForDay<T extends CalendarMark>(marks: T[], date: Date): T[] {
  return marks.filter(mark => {
    if (!mark.allDay) return sameDay(new Date(mark.startsAt), date)
    const parts = partsAt(mark.startsAt, validTimeZone(mark.timezone))
    return parts.year === date.getFullYear() && parts.month === date.getMonth() + 1 && parts.day === date.getDate()
  }).sort((a, b) => a.startsAt - b.startsAt)
}
