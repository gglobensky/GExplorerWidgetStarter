import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'weather',
  version: '1.2.6',
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  
  // Grid-first; sidebar uses the responsive layout. Toolbar support is deferred.
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 2 },
      maxSize: { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 3 }
    },
    sidebar: {
      minHeight: 160
    }
  },
  
  defaults: {
    data: {},
    view: { units: 'C', coloredIcons: true, atmosphere: true, forecastDays: 3, refreshInterval: 900000 }
  },
  
  capabilities: [{ cap: 'Network', reason: 'Searches locations and retrieves weather forecasts from Open-Meteo.' }]
}
