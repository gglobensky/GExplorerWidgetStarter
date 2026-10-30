import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'weather',
  version: '1.4.0',   // 1.4.0 (2026-10-30): Detect my location (Geolocation)
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  
  // Grid-first; sidebar uses the responsive layout. 1.3.0 (2026-10-28): one grid row high, and in the
  // toolbar, a compact strip (icon, temperature, condition, city, next days when wide enough).
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 3 }
    },
    sidebar: {
      minHeight: 160
    },
    toolbar: {
      // Starts fixed at this width (the user can make it flexible); the strip fits any row height
      width: 300
    }
  },
  
  defaults: {
    data: {},
    view: { units: 'C', coloredIcons: true, atmosphere: true, forecastDays: 3, refreshInterval: 900000 }
  },
  
  capabilities: [
    { cap: 'Network', reason: 'Searches locations and retrieves weather forecasts from Open-Meteo.' },
    { cap: 'Geolocation', reason: 'Finds the city you are in when you click "Detect my location".' },
  ]
}
