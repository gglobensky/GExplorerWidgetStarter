import test from 'node:test'
import assert from 'node:assert/strict'
import { clockLayout } from '../layout.ts'
import { resolveCalendarSelection } from '../calendarSelection.ts'

test('responsive clock policy keeps every size decision at explicit boundaries', () => {
  assert.equal(clockLayout(169, 300).size, 's')
  assert.equal(clockLayout(170, 109).size, 's')
  assert.equal(clockLayout(170, 110).size, 'm')
  assert.equal(clockLayout(420, 270).size, 'l')

  assert.equal(clockLayout(149, 200).pages.calendar, false)
  assert.equal(clockLayout(150, 72).pages.calendar, true)
  assert.equal(clockLayout(249, 200).pages.timers, false)
  assert.equal(clockLayout(250, 125).pages.timers, true)
  assert.equal(clockLayout(380, 175).compactStyledTimer, true)
  assert.equal(clockLayout(460, 330).richTimeTools, true)
  assert.equal(clockLayout(500, 379).timersPerPage, 2)
  assert.equal(clockLayout(500, 380).timersPerPage, 4)
  assert.equal(clockLayout(500, 540).timersPerPage, 6)
})

test('calendar selection prefers the newest data provider and avoids duplicate panel providers', () => {
  const data = [
    { key: 'work-1', widgetType: 'calendar.work' },
    { key: 'family-1', widgetType: 'calendar.family' },
  ]
  const panels = [
    { key: 'work-panel', widgetType: 'calendar.work' },
    { key: 'paper-panel', widgetType: 'calendar.paper' },
  ]
  assert.deepEqual(resolveCalendarSelection('latest', data, panels), { kind: 'data', key: 'family-1' })
  assert.deepEqual(resolveCalendarSelection('local', data, panels), { kind: 'local' })
  assert.deepEqual(resolveCalendarSelection('data:work-1', data, panels), { kind: 'data', key: 'work-1' })
  assert.deepEqual(resolveCalendarSelection('panel:paper-panel', data, panels), { kind: 'panel', key: 'paper-panel' })
  assert.deepEqual(resolveCalendarSelection('missing', data, panels), { kind: 'local' })
})

test('latest falls back to the newest unmatched legacy panel when no data provider exists', () => {
  const panels = [{ key: 'one', widgetType: 'calendar.one' }, { key: 'two', widgetType: 'calendar.two' }]
  assert.deepEqual(resolveCalendarSelection('latest', [], panels), { kind: 'panel', key: 'two' })
})
