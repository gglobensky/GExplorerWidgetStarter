// Updated entry.ts for Items widget

import Widget from './Widget.vue'
import { registerWidgetMenus } from '/src/contextmenu'

// Define menu contributions for the Items widget
const menuConfig = {
  contributions: [
    // Background context (when nothing is selected)
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
    // Item/selection context - use 'all' to match both item and selection
    {
      scope: 'all',  // ✅ Changed from 'selection' to 'all'
      items: [
        {
          id: 'items.rename-menu-item',
          type: 'command',
          actionId: 'fs.rename',
          section: '@core.edit',
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