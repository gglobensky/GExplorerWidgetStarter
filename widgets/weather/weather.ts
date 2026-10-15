export type WeatherLocation = { name: string; region?: string; country?: string; latitude: number; longitude: number }
export type WeatherDay = { date: string; code: number | null; high: number | null; low: number | null; precipitation: number | null; wind: number | null }
export type WeatherReport = {
  timezone: string; fetchedAt: number; currentTime: string
  current: { temperature: number | null; feelsLike: number | null; code: number | null; isDay: boolean }
  days: WeatherDay[]
}
export type WeatherConfig = {
  data?: { location?: WeatherLocation | string }
  view?: { units?: 'C' | 'F'; coloredIcons?: boolean; atmosphere?: boolean; forecastDays?: 3 | 7; refreshInterval?: number }
}
export type NetworkFetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
export interface WeatherProvider {
  search(query: string, language: string): Promise<WeatherLocation[]>
  forecast(location: WeatherLocation): Promise<WeatherReport>
}
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' ? v as Record<string, any> : {}
const numeric = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
export function validLocation(v: unknown): v is WeatherLocation {
  const l = record(v)
  return typeof l.name === 'string' && !!l.name.trim() && numeric(l.latitude) !== null && Math.abs(l.latitude) <= 90 && numeric(l.longitude) !== null && Math.abs(l.longitude) <= 180
}
export function normalizeForecast(value: unknown, now = Date.now()): WeatherReport {
  const data = record(value), current = record(data.current), daily = record(data.daily)
  if (!Array.isArray(daily.time) || !daily.time.length || typeof data.timezone !== 'string') throw new Error('The weather service returned an incomplete forecast.')
  try { new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format() } catch { throw new Error('The weather service returned an invalid time zone.') }
  const days: WeatherDay[] = daily.time.slice(0, 7).map((date: unknown, i: number) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('The weather service returned an invalid date.')
    const precipitation = numeric(daily.precipitation_probability_max?.[i])
    return { date, code: numeric(daily.weather_code?.[i]), high: numeric(daily.temperature_2m_max?.[i]), low: numeric(daily.temperature_2m_min?.[i]), precipitation: precipitation === null ? null : Math.max(0, Math.min(100, precipitation)), wind: numeric(daily.wind_speed_10m_max?.[i]) }
  })
  return { timezone: data.timezone, fetchedAt: now, currentTime: typeof current.time === 'string' ? current.time : '', current: { temperature: numeric(current.temperature_2m), feelsLike: numeric(current.apparent_temperature), code: numeric(current.weather_code), isDay: current.is_day !== 0 }, days }
}
export function createOpenMeteo(fetch: NetworkFetch): WeatherProvider {
  async function json(url: string): Promise<unknown> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Weather service unavailable (HTTP ${response.status}).`)
    const data = await response.json()
    if (record(data).error) throw new Error('The weather service could not process this request.')
    return data
  }
  return {
    async search(query, language) {
      const params = new URLSearchParams({ name: query.trim(), count: '8', language: language.split('-')[0], format: 'json' })
      const data = record(await json(`https://geocoding-api.open-meteo.com/v1/search?${params}`))
      return (Array.isArray(data.results) ? data.results : []).map((v: unknown) => {
        const r = record(v)
        return { name: r.name, region: typeof r.admin1 === 'string' ? r.admin1 : undefined, country: typeof r.country === 'string' ? r.country : undefined, latitude: r.latitude, longitude: r.longitude }
      }).filter(validLocation)
    },
    async forecast(location) {
      const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), timezone: 'auto', forecast_days: '7', temperature_unit: 'celsius', wind_speed_unit: 'kmh', current: 'temperature_2m,apparent_temperature,weather_code,is_day', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max' })
      return normalizeForecast(await json(`https://api.open-meteo.com/v1/forecast?${params}`))
    },
  }
}
export type ConditionKind = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' | 'unknown'
export function condition(code: number | null): { text: string; kind: ConditionKind } {
  if (code === 0) return { text: 'Clear skies', kind: 'sun' }
  if (code === 1 || code === 2) return { text: 'Partly cloudy', kind: 'partly' }
  if (code === 3) return { text: 'Overcast', kind: 'cloud' }
  if (code === 45 || code === 48) return { text: 'Fog', kind: 'fog' }
  if ([51, 53, 55, 56, 57].includes(code!)) return { text: 'Drizzle', kind: 'rain' }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code!)) return { text: 'Rain', kind: 'rain' }
  if ([71, 73, 75, 77, 85, 86].includes(code!)) return { text: 'Snow', kind: 'snow' }
  if ([95, 96, 99].includes(code!)) return { text: 'Thunderstorms', kind: 'storm' }
  return { text: 'Conditions unavailable', kind: 'unknown' }
}
export function temperature(value: number | null, unit: 'C' | 'F'): string {
  return value === null ? '—' : `${Math.round(unit === 'F' ? value * 9 / 5 + 32 : value)}°`
}
export function localDate(timezone: string, time = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time)
  const part = (name: string) => parts.find(p => p.type === name)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
