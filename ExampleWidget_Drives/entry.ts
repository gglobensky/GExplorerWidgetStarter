import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'drives',
  version: '0.5.0',
  Component: Widget,
  
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 4 },
      defaultSize: { cols: 4, rows: 2 }
    },
    sidebar: {
      minHeight: 150
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
  
  capabilities: []
}