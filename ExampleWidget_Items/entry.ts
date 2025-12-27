import Widget from './Widget.vue'
import { registerWidgetMenus } from '@/contextmenu'
import type { WidgetMenuConfig } from '@/contextmenu'

// Define menu contributions for the Items widget
const menuConfig: WidgetMenuConfig = {
  // No need to register actions here - they're already registered globally
  // We just contribute menu items that reference the actions
  
  contributions: [
    {
      scope: 'background',  // Show when right-clicking empty space
      items: [
        {
          id: 'items.refresh-menu-item',
          type: 'command',
          actionId: 'items.refresh',  // References the globally registered action
          section: '@core.view',
          order: 10,
        },
        // Future: Add more items like paste, new folder, etc.
        // {
        //   id: 'items.paste-menu-item',
        //   type: 'command',
        //   actionId: 'fs.paste',
        //   section: '@core.edit',
        //   order: 20,
        // },
      ],
    },
    // Future: Add contributions for 'item' and 'selection' scopes
    // {
    //   scope: 'item',
    //   items: [
    //     {
    //       id: 'items.open-menu-item',
    //       type: 'command',
    //       actionId: 'fs.open',
    //       section: '@core.file',
    //       order: 10,
    //     },
    //   ],
    // },
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
