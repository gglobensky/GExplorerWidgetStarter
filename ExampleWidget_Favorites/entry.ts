// src/widgets/favorites/entry.ts
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'favorites',
  version: '0.1.0',
  Component: Widget,

  // Where this widget can live
  contexts: {
    // Toolbar strip (main intended place)
    toolbar: {
      // These are "grid-ish" units; tweak to taste once the toolbar host exists
      minSize:     { cols: 4,  rows: 1 },
      maxSize:     { cols: 24, rows: 1 },
      defaultSize: { cols: 12, rows: 1 },
    },

    // Optional: allow dropping favorites in the main grid as a big widget
    grid: {
      minSize:     { cols: 2, rows: 1 },
      maxSize:     { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 2 },
    },

    // Optional: also usable in sidebar
    sidebar: {
      minHeight: 120,
    },

    // Widget-local layout modes (up to you & Widget.vue)
    layouts: [
      { id: 'toolbar', icon: '★', tooltip: 'Toolbar pills' },
      { id: 'list',    icon: '☰', tooltip: 'Vertical list' },
    ],
  },

  // Default config that will be passed as props.config
  defaults: {
    data: {
      // Which logical favorites group to use in favorites/service
      group: 'default',

      // Future-you knobs:
      // scope: 'global' | 'workspace' | 'profile' (if you ever want that)
      showLabels: true,
      maxVisible: 24,
    },
    view: {
      layout: 'toolbar',  // must match one of contexts.layouts ids
      dense: true,
    },
  },

  // Capability tag so other code can discover "favorites providers" later
  capabilities: ['favorites:provider'],
}
