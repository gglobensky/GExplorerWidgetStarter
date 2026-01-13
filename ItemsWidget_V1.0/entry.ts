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
      layouts: [
        { id: 'list', icon: '☰', tooltip: 'List' },
        { id: 'grid', icon: '▦', tooltip: 'Grid' },
        { id: 'details', icon: '▤', tooltip: 'Details' },
      ],
      minSize: { cols: 2, rows: 2 },
    },
    
    sidebar: {
      layouts: [
        { id: 'compact', icon: '─', tooltip: 'Compact Browser' },
        { id: 'list', icon: '☰', tooltip: 'File List' },
      ],
      minHeight: 100,
    },
    
    // No layouts for embedded/dialog contexts - they use defaults
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