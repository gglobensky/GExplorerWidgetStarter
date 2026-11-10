import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarCells, calendarOccurrences, marksForDay, timeInZone } from '../calendar.ts'
import { clockEventReminders, normalizeClockEvents, withOccurrenceRemoval, withOccurrenceUpdate } from '../useClockCalendar.ts'
import { readCalendarProviderDeclaration, providerEventId, providerOriginalEventId } from '../calendarProvider.ts'

test('calendar paper always has six complete weeks and marks today', () => {
  const today = new Date(2026, 10, 9, 12)
  const cells = calendarCells(2026, 10, true, today)
  assert.equal(cells.length, 42)
  assert.equal(cells[0].date.getDay(), 1)
  assert.equal(cells.filter(c => c.today).length, 1)
  assert.equal(cells.find(c => c.today)?.day, 9)
})

test('marks on a calendar day are chronological', () => {
  const day = new Date(2026, 10, 9, 12)
  const marks = marksForDay([
    { id: 'b', title: 'B', startsAt: new Date(2026, 10, 9, 15).getTime() },
    { id: 'a', title: 'A', startsAt: new Date(2026, 10, 9, 9).getTime() },
    { id: 'x', title: 'X', startsAt: new Date(2026, 10, 10, 9).getTime() },
  ], day)
  assert.deepEqual(marks.map(m => m.id), ['a', 'b'])
})

test('all-day marks stay on their calendar date across time zones', () => {
  const startsAt = timeInZone({ year: 2026, month: 11, day: 9, hour: 9, minute: 0, second: 0 }, 'Asia/Tokyo')
  assert.equal(marksForDay([{ id: 'holiday', title: 'Holiday', startsAt, allDay: true, timezone: 'Asia/Tokyo' }], new Date(2026, 10, 9, 12)).length, 1)
})

test('saved calendar marks are bounded, clean and chronological', () => {
  const events = normalizeClockEvents({ events: [
    { id: 'later', title: '  Supper  ', startsAt: 2000, reminderMinutes: 999999, audible: false, colour: '#aabbcc' },
    { id: 'soon', title: 'Oven', startsAt: 1000, reminderMinutes: 10 },
    { id: 'bad', title: '', startsAt: 500 },
    { id: 'soon', title: 'Duplicate', startsAt: 3000 },
  ] })
  assert.deepEqual(events.map(e => e.id), ['soon', 'later'])
  assert.equal(events[1].title, 'Supper')
  assert.equal(events[1].reminderMinutes, 30 * 24 * 60)
  assert.equal(events[1].audible, false)
})

test('daily recurrence preserves New York wall time across daylight saving', () => {
  const timezone = 'America/New_York'
  const startsAt = timeInZone({ year: 2026, month: 3, day: 7, hour: 9, minute: 30, second: 0 }, timezone)
  const rangeEnd = timeInZone({ year: 2026, month: 3, day: 12, hour: 9, minute: 30, second: 0 }, timezone)
  const occurrences = calendarOccurrences([{ id: 'standup', title: 'Standup', startsAt, timezone, recurrence: 'daily' }], startsAt, rangeEnd)
  assert.equal(occurrences.length, 5)
  const localHours = occurrences.map(o => new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(o.startsAt))
  assert.deepEqual(localHours, ['09', '09', '09', '09', '09'])
  assert.equal(occurrences[1].startsAt - occurrences[0].startsAt, 23 * 60 * 60_000)
})

test('monthly recurrence clamps to the last valid day and reminders are occurrence-specific', () => {
  const startsAt = new Date(2026, 0, 31, 10).getTime()
  const events = normalizeClockEvents({ events: [{ id: 'rent', title: 'Rent', startsAt, recurrence: 'monthly', reminderMinutes: 60 }] })
  const occurrences = calendarOccurrences(events, startsAt, new Date(2026, 3, 2).getTime())
  assert.deepEqual(occurrences.map(o => new Date(o.startsAt).getDate()), [31, 28, 31])
  const reminders = clockEventReminders(events, startsAt - 2 * 60 * 60_000)
  assert.ok(reminders.length >= 3)
  assert.equal(new Set(reminders.map(r => r.id)).size, reminders.length)
})

test('one recurring occurrence can move without changing the series or its stable identity', () => {
  const startsAt = new Date(2026, 10, 1, 9).getTime()
  const original = new Date(2026, 10, 2, 9).getTime()
  const moved = new Date(2026, 10, 5, 15, 30).getTime()
  const event = normalizeClockEvents({ events: [{ id: 'daily', title: 'Daily', startsAt, recurrence: 'daily', reminderMinutes: 10 }] })[0]
  const changed = normalizeClockEvents({ events: [withOccurrenceUpdate(event, original, { ...event, startsAt: moved, title: 'Moved once', reminderMinutes: 30 })] })[0]
  const occurrences = calendarOccurrences([changed], startsAt, new Date(2026, 10, 7).getTime())
  const exception = occurrences.find(value => value.originalStartsAt === original)
  assert.equal(exception?.startsAt, moved)
  assert.equal(exception?.title, 'Moved once')
  assert.equal(exception?.occurrenceId, `daily@${original}`)
  assert.equal(occurrences.some(value => value.originalStartsAt === original && value.startsAt === original), false)
})

test('a recurring occurrence can be skipped and moved exceptions enter a requested window', () => {
  const startsAt = new Date(2026, 10, 1, 9).getTime()
  const second = new Date(2026, 10, 2, 9).getTime()
  const third = new Date(2026, 10, 3, 9).getTime()
  const moved = new Date(2026, 11, 20, 11).getTime()
  const event = normalizeClockEvents({ events: [{ id: 'series', title: 'Series', startsAt, recurrence: 'daily' }] })[0]
  const changed = normalizeClockEvents({ events: [withOccurrenceRemoval(withOccurrenceUpdate(event, second, { ...event, startsAt: moved }), third)] })[0]
  const november = calendarOccurrences([changed], startsAt, new Date(2026, 10, 6).getTime())
  assert.equal(november.some(value => value.originalStartsAt === second), false)
  assert.equal(november.some(value => value.originalStartsAt === third), false)
  const december = calendarOccurrences([changed], new Date(2026, 11, 20).getTime(), new Date(2026, 11, 21).getTime())
  assert.equal(december.some(value => value.originalStartsAt === second && value.startsAt === moved), true)
})

test('calendar provider declarations are versioned and external ids round-trip', () => {
  assert.equal(readCalendarProviderDeclaration({ contract: 'gem.calendar', version: 1, label: 'Work', capabilities: { import: true } })?.label, 'Work')
  assert.equal(readCalendarProviderDeclaration({ contract: 'gem.calendar', version: 2, label: 'Future' }), null)
  const id = providerEventId('work-calendar', 'meeting:42')
  assert.equal(providerOriginalEventId(id), 'meeting:42')
})
