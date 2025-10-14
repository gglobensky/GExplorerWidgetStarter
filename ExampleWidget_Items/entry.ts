import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'items',
  version: '0.3.1',
  Component: Widget,
  
  // NEW: Declare context support
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 3 }
    },
    sidebar: {
      minHeight: 200
    }
  },
  
  defaults: {
    data: { rpath: '' },
    view: { 
      layout: 'list', 
      columns: 1, 
      itemSize: 'md', 
      showHidden: false, 
      navigateMode: 'internal' 
    }
  },
  
  capabilities: []
}