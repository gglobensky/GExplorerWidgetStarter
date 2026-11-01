// widgets/popover-test/entry.ts — TEMPORARY (GEM Shell E5c-1 tests): popover levels, popover styles, the drag ghost.
// Delete once Favorites 0.3.0 is on the new APIs.
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'popover-test',
  version: '0.1.0',
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,

  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 6 },
      defaultSize: { cols: 3, rows: 2 },
    },
    sidebar: {
      minHeight: 80,
    },
  },

  defaults: {
    data: {},
    view: {},
  },

  capabilities: [],
}
