import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeForecast, createOpenMeteo, temperature, condition, localDate, validLocation } from '../weather.ts'

test('missing readings remain missing, including precipitation', () => {
  const result = normalizeForecast({ timezone: 'America/Toronto', current: { temperature_2m: null }, daily: { time: ['2026-10-11'], temperature_2m_max: [0], precipitation_probability_max: [null] } }, 42)
  assert.equal(result.current.temperature, null)
  assert.equal(result.days[0].high, 0)
  assert.equal(result.days[0].precipitation, null)
  assert.equal(temperature(null, 'F'), '—')
  assert.equal(result.fetchedAt, 42)
})
test('units and weather codes handle freezing, snow, and unknown codes', () => {
  assert.equal(temperature(0, 'F'), '32°')
  assert.equal(temperature(-40, 'F'), '-40°')
  assert.equal(condition(75).kind, 'snow')
  assert.equal(condition(null).kind, 'unknown')
})
test('today uses the location date across the date line', () => {
  const time = Date.parse('2026-10-11T10:30:00Z')
  assert.equal(localDate('Pacific/Kiritimati', time), '2026-10-12')
  assert.equal(localDate('Pacific/Honolulu', time), '2026-10-11')
})
test('invalid forecasts and invalid coordinates are rejected', () => {
  assert.throws(() => normalizeForecast({}), /incomplete/)
  assert.throws(() => normalizeForecast({ timezone: 'UTC', daily: { time: ['2026-02-30'] } }), /invalid date/)
  assert.throws(() => normalizeForecast({ timezone: 'bad-zone', daily: { time: ['2026-10-11'] } }), /time zone/)
  assert.equal(validLocation({ name: 'Test', latitude: 91, longitude: 0 }), false)
  assert.equal(validLocation({ name: 'Test', latitude: 0, longitude: 0 }), true)
})
test('provider encodes city searches and filters invalid results', async () => {
  let requested = ''
  const provider = createOpenMeteo(async url => { requested = url; return { ok: true, status: 200, json: async () => ({ results: [{ name: 'Montréal', latitude: 45, longitude: -73 }, { name: 'Bad', latitude: null }] }) } })
  const result = await provider.search('Montréal & Québec', 'fr-CA')
  assert.equal(new URL(requested).searchParams.get('name'), 'Montréal & Québec')
  assert.equal(new URL(requested).searchParams.get('language'), 'fr')
  assert.equal(result.length, 1)
})
test('HTTP failures do not become forecasts', async () => {
  const provider = createOpenMeteo(async () => ({ ok: false, status: 503, json: async () => ({}) }))
  await assert.rejects(provider.forecast({ name: 'Test', latitude: 0, longitude: 0 }), /503/)
})
