import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNaturalAppointment } from '../naturalLanguage.ts'

const base = new Date(2026, 10, 10, 12)

test('natural entry understands relative dates, time, duration and reminder', () => {
  const result = parseNaturalAppointment('Dentist tomorrow at 2:30pm for 45 minutes, remind me 1 hour before', base)
  assert.equal(result.error, undefined)
  assert.deepEqual(result.value && { ...result.value, summary: undefined }, {
    title: 'Dentist', date: '2026-11-11', time: '14:30', allDay: false,
    durationMinutes: 45, reminderMinutes: 60, summary: undefined,
  })
})

test('natural entry understands weekdays, all-day appointments and no reminder', () => {
  const result = parseNaturalAppointment('Family day next Saturday all day with no reminder', base)
  assert.equal(result.value?.title, 'Family day')
  assert.equal(result.value?.date, '2026-11-14')
  assert.equal(result.value?.allDay, true)
  assert.equal(result.value?.durationMinutes, 1440)
  assert.equal(result.value?.reminderMinutes, -1)
})

test('natural entry uses the selected calendar day when no date is stated', () => {
  const result = parseNaturalAppointment('Dinner at 7pm', base)
  assert.equal(result.value?.date, '2026-11-10')
  assert.equal(result.value?.time, '19:00')
  assert.equal(result.value?.title, 'Dinner')
})

test('natural entry accepts a conversational reminder command', () => {
  const result = parseNaturalAppointment('Remind me to check the oven tomorrow at 5pm', base)
  assert.equal(result.value?.title, 'Check the oven')
  assert.equal(result.value?.date, '2026-11-11')
  assert.equal(result.value?.time, '17:00')
})

test('natural entry rejects impossible dates and missing titles', () => {
  assert.match(parseNaturalAppointment('Party 2026-02-31 at 8pm', base).error ?? '', /not valid/)
  assert.match(parseNaturalAppointment('tomorrow at noon', base).error ?? '', /appointment name/)
})
