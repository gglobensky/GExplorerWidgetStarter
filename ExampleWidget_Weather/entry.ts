import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'weather',
  version: '0.1.0',
  Component: Widget,
  
  // NEW: Declare context support
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 2 },
      maxSize: { cols: 4, rows: 4 },
      defaultSize: { cols: 2, rows: 2 }
    },
    sidebar: {
      minHeight: 150
    }
  },
  
  defaults: {
    data: { location: 'TOP/31,80' },
    view: { refreshInterval: 300000 }
  },
  
  capabilities: ['Network']
}