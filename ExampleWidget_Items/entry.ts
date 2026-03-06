// src/widgets/items/entry.ts

import Widget from './Widget.vue'
import { registerWidgetMenus } from '/src/contextmenu'

// ============================================================================
// Menu contributions
// ============================================================================

const menuConfig = {
    contributions: [
        {
            scope: 'background',
            items: [
                {
                    id:       'items.refresh-menu-item',
                    type:     'command',
                    actionId: 'items.refresh',
                    section:  '@core.view',
                    order:    10,
                },
            ],
        },
        {
            // Rename only makes sense for a single item
            scope: 'file',
            items: [
                {
                    id:       'items.rename-menu-item',
                    type:     'command',
                    actionId: 'fs.rename',
                    section:  '@core.edit',
                    order:    10,
                },
            ],
        },
        {
            scope: 'folder',
            items: [
                {
                    id:       'items.rename-menu-item',
                    type:     'command',
                    actionId: 'fs.rename',
                    section:  '@core.edit',
                    order:    10,
                },
            ],
        },
    ],
}

registerWidgetMenus('items', menuConfig)

// ============================================================================
// Widget definition
// ============================================================================

export default {
    api:     '1.0',
    id:      'items',
    version: '0.3.1',
    Component: Widget,
    dropAccepts: ['gex/file-refs'],

    // ── Context declarations ────────────────────────────────────────────────
    // Static metadata consumed by:
    //   - ContextMenuEditor (left-panel tabs)
    //   - Command template picker (context filter)
    //   - Config storage key mapping
    //
    // builtin: true  → resolved by contextResolver's built-in logic
    // builtin: false → widget component registers a detector via
    //                  registerContextDetector() in onMounted
    menuContexts: [
        { id: 'background', label: 'Empty area',       icon: '🖥',  builtin: true },
        { id: 'file',       label: 'File',              icon: '📄',  builtin: true },
        { id: 'folder',     label: 'Folder',            icon: '📁',  builtin: true },
        { id: 'multi',      label: 'Multiple selected', icon: '⬛',  builtin: true },
    ],
	
	actions: [
		{
			id: 'navigate',
			label: 'Navigate to folder',
			accepts: {
				extensions: [],        // folders don't have extensions
				contexts: ['folder'],  // only offered when right-clicking a folder
			},
			contextMenu: {
				label: 'Open in this pane',
				icon: '📂',
				submenuLabel: 'File Pane',
			},
		},
		{
			id: 'reveal',
			label: 'Reveal file',
			accepts: {
				contexts: ['file'],
			},
			contextMenu: {
				label: 'Reveal in this pane',
				icon: '🔍',
				submenuLabel: 'File Pane',
			},
		},
	],

    contexts: {
        grid: {
            layouts: [
                { id: 'list',    icon: '☰', tooltip: 'List'    },
                { id: 'grid',    icon: '▦', tooltip: 'Grid'    },
                { id: 'details', icon: '▤', tooltip: 'Details' },
            ],
            minSize: { cols: 2, rows: 2 },
        },
        sidebar: {
            layouts: [
                { id: 'compact', icon: '─', tooltip: 'Compact Browser' },
                { id: 'list',    icon: '☰', tooltip: 'File List'       },
            ],
            minHeight: 100,
        },
    },

    defaults: {
        data: { rpath: '' },
        view: {
            layout:       'list',
            columns:      1,
            itemSize:     'md',
            showHidden:   false,
            navigateMode: 'internal',
        },
    },

    capabilities: [],
}