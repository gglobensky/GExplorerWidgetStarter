import Widget from './Widget.vue'
import { registerWidgetMenus } from '/src/contextmenu'

// Define menu contributions for the Items widget
const menuConfig = {
  contributions: [
    {
      scope: 'background',
      items: [
        {
          id: 'items.refresh-menu-item',
          type: 'command',
          actionId: 'items.refresh',
          section: '@core.view',
          order: 10,
        },
      ],
    },
  ],
}


// Register the menu contributions when the widget loads
registerWidgetMenus('items', menuConfig)

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
    layouts: [
      { id: 'list', icon: '☰', tooltip: 'List View' },
      { id: 'grid', icon: '▦', tooltip: 'Grid View' },
      { id: 'details', icon: '▤', tooltip: 'Details View' }
    ]
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
