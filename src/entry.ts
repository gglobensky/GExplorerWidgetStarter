// entry.ts (for local-player)
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'local-player',          // must match folder name + your sidebar "type"
  version: '0.1.0',
  Component: Widget,

  // Match your established schema (same shape as `items`)
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 3 }
    },
    sidebar: {
      minHeight: 120
    },
    // In your working example, `layouts` is at this level, not nested under sidebar.
    layouts: [
      { id: 'compact',  icon: '◫', tooltip: 'Compact' },
      { id: 'expanded', icon: '▭', tooltip: 'Expanded' },
      { id: 'collapsed', icon: '▯', tooltip: 'Collapsed' }
    ]
  },

  // Keep it minimal; you can add actual config later
  defaults: {
    data: {},
    view: {
      // you can stash layout state here if your host reads it
      layout: 'compact'
    }
  },

  capabilities: []
}
