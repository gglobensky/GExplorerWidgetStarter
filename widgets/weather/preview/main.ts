import { createApp, h, ref } from 'vue'
import Widget from '../Widget.vue'
import type { WeatherConfig } from '../weather'

const params = new URLSearchParams(location.search)
const previewRoot = document.querySelector<HTMLElement>('#widget')
const previewWidth = Number(params.get('width'))
const previewHeight = Number(params.get('height'))
if (previewRoot && Number.isFinite(previewWidth) && previewWidth > 0)
  previewRoot.style.width = `${previewWidth}px`
if (previewRoot && Number.isFinite(previewHeight) && previewHeight > 0)
  previewRoot.style.height = `${previewHeight}px`
const config = ref<WeatherConfig>({ data: params.has('setup') ? {} : { location: { name: 'Montréal', region: 'Québec', country: 'Canada', latitude: 45.5, longitude: -73.6 } }, view: { units: 'C', coloredIcons: true, atmosphere: true } })
let fail = false
Object.assign(window, { weatherPreview: { fail: (value: boolean) => { fail = value }, setUnits: (units: 'C' | 'F') => { config.value = { ...config.value, view: { ...config.value.view, units } } } } })
createApp({ setup() { return () => h(Widget, { config: config.value, onEvent: (event: { payload: WeatherConfig }) => { config.value = event.payload } }) } })
  // Preview stand-in only; the real shell owns this global directive.
  .directive('gex-tooltip', {
    mounted(el, binding) { el.title = `${binding.value.content}\n${binding.value.detail ?? ''}` },
    updated(el, binding) { el.title = `${binding.value.content}\n${binding.value.detail ?? ''}` },
  })
  .provide('widgetSdk', { networkFetch: async (url: string) => {
    if (fail) throw new Error('Simulated network failure')
    if (url.includes('geocoding')) return { ok: true, status: 200, json: async () => ({ results: [{ name: 'Montréal', admin1: 'Québec', country: 'Canada', latitude: 45.5, longitude: -73.6 }] }) }
    const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10) })
    return { ok: true, status: 200, json: async () => ({ timezone: 'UTC', current: { temperature_2m: 14, apparent_temperature: 12, weather_code: 2, is_day: 1 }, daily: { time: dates, weather_code: [2,61,0,2,63,3,0], temperature_2m_max: [16,13,15,17,12,11,14], temperature_2m_min: [8,7,6,9,8,5,6], precipitation_probability_max: [15,80,5,20,90,30,5], wind_speed_10m_max: [12,18,9,14,21,11,8] } }) }
  } }).mount('#widget')
