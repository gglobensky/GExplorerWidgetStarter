import Widget from './Widget.vue'

// A TEST WIDGET for web surfaces (GEM Shell H9, claude/native-surface-design.md): not for release.
export default {
  api: '1.0',
  id: 'web-test',
  version: '0.1.0',
  Component: Widget,
  about: `# Web surface test

Shows a declared site (lemonde.fr) in a web surface, and lets you add other sites. A test of GEM Shell's web surfaces; not for release.`,

  contexts: {
    grid: {
      minSize: { cols: 3, rows: 2 },
      maxSize: { cols: 12, rows: 10 },
      defaultSize: { cols: 6, rows: 5 },
    },
  },

  defaults: { data: {}, view: {} },

  capabilities: [
    { cap: 'Web', reason: 'Shows the news sites you pick, as they serve them.', domains: ['lemonde.fr'], userAdded: true },
  ],
}
