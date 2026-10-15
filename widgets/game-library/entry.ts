// widgets/game-library/entry.ts
import Widget from './Widget.vue'

const menuConfig = {
  contributions: [
    {
      scope: 'background',
      items: [
        {
          id: 'gamelib.refresh',
          type: 'command',
          actionId: 'gamelib.refresh',
          section: '@core.view',
          order: 10,
        },
        {
          id: 'gamelib.rescan',
          type: 'command',
          actionId: 'gamelib.rescan',
          section: '@core.view',
          order: 20,
        },
      ],
    },
    {
      scope: 'all',
      items: [
        {
          id: 'gamelib.open-store',
          type: 'command',
          actionId: 'gamelib.openStore',
          section: '@core.open',
          order: 10,
        },
        {
          id: 'gamelib.open-folder',
          type: 'command',
          actionId: 'gamelib.openFolder',
          section: '@core.open',
          order: 20,
        },
      ],
    },
  ],
}

export default {
  api: '1.0',
  id: 'game-library',
  version: '0.1.0',
  Component: Widget,

  // Registered by the host when the widget loads (registerWidgetMenus is not in the SDK).
  menus: menuConfig,

  contexts: {
    grid: {
      layouts: [
        { id: 'grid', icon: '▦', tooltip: 'Grid + Details' },
        { id: 'hero', icon: '▤', tooltip: 'Hero + Details' },
      ],
      minSize: { cols: 3, rows: 2 },
    },

    sidebar: {
      layouts: [
        { id: 'compact', icon: '─', tooltip: 'Compact' },
      ],
      minHeight: 120,
    },
  },

  defaults: {
    data: {
      providers: ['steam'],           // later: ['steam','epic']
      filterText: '',
      selectedKey: '',
    },
    view: {
      layout: 'grid',
      tileSize: 'lg',                 // sm|md|lg
      sort: 'recent',                 // recent|alpha|installed
      showOnlyInstalled: false,
    }
  },

  // we’ll keep this empty until you wire net perms
  capabilities: []
}
