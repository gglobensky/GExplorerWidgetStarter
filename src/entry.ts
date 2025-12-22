// src/widgets/music/src/entry.ts
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'local-player',                // must match entry.widget.type used in your library
  version: '1.0.0',
  Component: Widget,

  contexts: {
    grid: {
      minSize:     { cols: 2, rows: 1 },
      maxSize:     { cols: 6, rows: 3 },
      defaultSize: { cols: 3, rows: 2 },
    },

    sidebar: {
      // Keep this shape the same as your working example
      // (your sidebar's getMinHeight already understands it)
      minHeight: 84,

      // The order here is the cycle order in your sidebar menu
      layouts: [
        { id: 'compact',  tooltip: 'Compact View (single row)' },
        { id: 'expanded', tooltip: 'Expanded View (controls + queue)' },
        // no 'collapsed' here — you said the app handles that globally
      ],
    },
  },

  // Seed whatever defaults your widget reads from props/config
  defaults: {
    queueName: 'Queue',
    volume: 0.9,
    repeat: 'off',
    shuffle: false,
  },

  capabilities: [],
}
