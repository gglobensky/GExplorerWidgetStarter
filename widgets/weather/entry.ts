import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'weather',
  version: '1.5.0',   // 1.4.0 (2026-10-30): Detect my location (Geolocation); 1.5.0: settings in the control panel
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
  
  // 1.5.0 (GEM Shell 2026-10-30, control panel D4): for every Weather widget, on its page in Settings (sdk.settings()).
  settings: {
    fields: [
      { key: 'units', type: 'choice', label: 'Temperature', default: 'C',
        choices: [{ value: 'C', label: 'Celsius (°C)' }, { value: 'F', label: 'Fahrenheit (°F)' }] },
      { key: 'refreshMinutes', type: 'number', label: 'Refresh every', unit: 'minutes', min: 5, max: 120, step: 5,
        slider: true, default: 15, hint: 'How often the forecast is fetched again while a Weather widget is open.' },
      { key: 'coloredIcons', type: 'toggle', label: 'Coloured icons', default: true },
      { key: 'atmosphere', type: 'toggle', label: 'Weather backdrop', default: true,
        hint: 'Colours behind the widget that follow the weather and the time of day.' },
      { key: 'refreshNow', type: 'action', label: 'Refresh now', buttonLabel: 'Refresh every Weather widget',
        hint: 'Fetches the forecast again in every open Weather widget.' },
    ],
    groups: [
      { title: 'Display', keys: ['units', 'coloredIcons', 'atmosphere'] },
      { title: 'Updates', keys: ['refreshMinutes', 'refreshNow'] },
    ],
  },

  capabilities: [
    { cap: 'Network', reason: 'Searches locations and retrieves weather forecasts from Open-Meteo.' },
    { cap: 'Geolocation', reason: 'Finds the city you are in when you click "Detect my location".' },
  ]
}
