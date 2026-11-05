import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'drives',
  version: '0.6.1',   // 0.6.1 (2026-11-05): middle-click opens a drive in a new tab
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 4 },
      defaultSize: { cols: 4, rows: 2 }
    },
    sidebar: {
      minHeight: 96
    },
    toolbar: {
      // A useful starting width; the toolbar still lets the user make it flexible or resize it.
      width: 280
    }
  },
  
  defaults: {
    data: {},
    view: {
      layout: 'grid',
      columns: 3,
      itemSize: 'md',
      showFsType: true,
      showCapacity: true,
    }
  },

  settings: {
    fields: [
      {
        key: 'colorByUsage',
        type: 'toggle',
        label: 'Colour bars by space used',
        default: true,
        hint: 'Uses green normally, amber above 75% used, and red above 90%. Turn this off to use the shell accent colour.',
      },
    ],
    groups: [
      { title: 'Display', keys: ['colorByUsage'] },
    ],
  },
  
  capabilities: [
		{ cap: 'Metadata', reason: 'Reads drive capacity and filesystem info' },
	]
}
