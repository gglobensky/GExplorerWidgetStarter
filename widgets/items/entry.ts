// src/widgets/items/entry.ts

import Widget from './Widget.vue'

// Menu: contributed by the host (contextmenu/actions/core.ts registerItemsContributions), Refresh
// included (2026-10-24: a widget's own contributions may only run its own actions).

// ============================================================================
// Widget definition
// ============================================================================

export default {
    api:     '1.0',
    id:      'items',
    version: '0.3.1',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    // Takes files and folders anywhere in the pane (dropped on a folder row: into
    // that folder). Moves them (Shift / Ctrl choice: backlog). See the host's
    // widgets/dnd/dropSpec.ts for every field and its default.
    drop: {
        effect: 'move',
    },

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
            // Layout menu gets "Single page" / "Paged ▸"; the choice is stored per folder
            paging: { pageSizes: [100, 250, 500, 1000, 2500, 5000], defaultPageSize: 500 },
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

    capabilities: [
		{ cap: 'Read',      reason: 'Lists directory contents and validates paths' },
		{ cap: 'Write',     reason: 'Moves, copies, renames, and deletes files' },
		{ cap: 'Metadata',  reason: 'Resolves file icons and shortcut targets' },
		{ cap: 'Clipboard', reason: 'Copies and cuts files to the clipboard' },
	]
}