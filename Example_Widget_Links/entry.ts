// src/widgets/links/src/entry.ts
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'links',
  version: '1.0.0',
  Component: Widget,
  
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 6, rows: 4 },
      defaultSize: { cols: 3, rows: 2 }
    },
    sidebar: {
      minHeight: 100,
      layouts: [
        { id: 'compact', tooltip: 'Compact View' },
        { id: 'expanded', tooltip: 'Expanded View' }
      ]
    }
  },
  
  defaults: {
    links: [
      { id: '1', name: 'GitHub', target: 'https://github.com', type: 'web' },
      { id: '2', name: 'Gmail', target: 'https://mail.google.com', type: 'web' },
      { id: '3', name: 'Downloads', target: 'C:\\Users\\Downloads', type: 'local' }
    ],
    showSeparator: true,
    groupByType: true
  },
  
  capabilities: []
}