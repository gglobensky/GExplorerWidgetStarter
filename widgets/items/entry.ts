// src/widgets/items/entry.ts

import Widget from './Widget.vue'
import { ICON_SIZE_IDS, ICON_SIZE_LABELS } from './iconSizes'

// Menu: contributed by the host (contextmenu/actions/core.ts registerItemsContributions), Refresh
// included (2026-10-24: a widget's own contributions may only run its own actions).

// ============================================================================
// Widget definition
// ============================================================================

export default {
    api:     '1.0',
    id:      'items',
    version: '0.9.1',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    // Takes files and folders anywhere in the pane (dropped on a folder row: into
    // that folder). Moves them (Shift / Ctrl choice: backlog). See the host's
    // widgets/dnd/dropSpec.ts for every field and its default.
    drop: {
        effect: 'move',
    },

    // ── Commands (the key mapper, 2026-10-24) ────────────────────────────────
    // Run while this list has your focus (you clicked in it, or Tabbed into it): Widget.vue's
    // onCommand gets the id. The keys are defaults: the user changes them in Keyboard shortcuts.
    commands: [
        { id: 'rename', name: 'Rename', keys: ['F2'],
          description: 'Renames the selected file or folder in place: its name becomes editable in the list. Enter keeps the new name, Escape cancels.' },
        { id: 'delete', name: 'Delete', keys: ['Delete'],
          description: 'Moves the selected files and folders to the Recycle Bin (they can be restored from there).' },
        { id: 'delete-permanent', name: 'Delete permanently', keys: ['Shift+Delete'],
          description: 'Deletes the selected files and folders for good, without the Recycle Bin. Always asks first.' },
        // 0.8.6: copy / cut / paste (were only in the menu); cut items look faded until the clipboard changes.
        { id: 'copy', name: 'Copy', keys: ['Ctrl+C'],
          description: 'Copies the selected files and folders to the clipboard, to paste them elsewhere (here, another folder, or another app).' },
        { id: 'cut', name: 'Cut', keys: ['Ctrl+X'],
          description: 'Cuts the selected files and folders: pasting them elsewhere moves them there. They look faded until then.' },
        { id: 'paste', name: 'Paste', keys: ['Ctrl+V'],
          description: 'Pastes what the clipboard holds into the folder shown: a copy, or a move after a cut.' },
        // 0.8.7
        { id: 'new-folder', name: 'New folder', keys: ['Ctrl+Shift+N'],
          description: 'Creates a folder in the folder shown ("New folder", or the next free name) and opens its name for typing: Enter keeps it.' },
        { id: 'select-all', name: 'Select all', keys: ['Ctrl+A'],
          description: 'Selects every file and folder in the folder shown (all pages, when the list is paged).' },
        { id: 'refresh', name: 'Refresh', keys: ['F5'],
          description: 'Lists the folder again, for changes the list didn\'t show yet. A folder you were refused asks for access again.' },
        { id: 'page-next', name: 'Next page', keys: ['Alt+PageDown'],
          description: 'In a paged list (Layout ▸ Paged): shows the next page.' },
        { id: 'page-prev', name: 'Previous page', keys: ['Alt+PageUp'],
          description: 'In a paged list (Layout ▸ Paged): shows the previous page.' },
        { id: 'page-goto', name: 'Go to page', keys: ['Ctrl+G'],
          description: 'In a paged list (Layout ▸ Paged): opens the pager\'s page number box, to type the page to show.' },
        { id: 'filter', name: 'Filter', keys: ['Ctrl+Shift+F'],
          description: 'Opens the Filter menu: the sort order, folders only or files only, one type of file (Pictures, Videos, your own types…), or clears the filter. Kept per folder.' },
    ],

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
	
    // ── The widget's own menu items (2026-10-27) ─────────────────────────────
    // Right-click on empty space: Filter ▸ (Sort ▸, Show ▸, Type ▸, Clear filter).
    // CHANGED (0.9.0, GEM Shell 2026-10-29: declared submenus): its entries are declared here, so the user can
    // reorder and hide them in Settings › Context Menu; the lists only known when the menu opens are slots, and
    // the ticks and current values come with each right-click (Widget.vue openContextMenu: slots, state;
    // quickFilter.ts filterMenuParts). A choice reaches onMenuItem.
    menus: { items: [
        { id: 'filter', type: 'submenu', label: 'Filter', icon: '⏷', contexts: ['background'], hideWhen: ['dialog'],
          children: [
            { id: 'sort', type: 'submenu', label: 'Sort', children: [
                { slot: 'sort.columns', label: 'Sort columns' },
            ] },
            { id: 'show', type: 'submenu', label: 'Show', children: [
                { id: 'show.all', label: 'Everything' },
                { id: 'show.folders', label: 'Folders only' },
                { id: 'show.files', label: 'Files only' },
            ] },
            { id: 'type', type: 'submenu', label: 'Type', children: [
                { id: 'type.any', label: 'Any type' },
                { slot: 'type.list', label: 'Your types and the built-in ones' },
                { slot: 'type.focused', label: "The selected file's type" },
                { type: 'separator' },
                { id: 'types.edit', label: 'Edit types…', title: 'Make your own types, delete them, or hide built-in ones' },
            ] },
            { type: 'separator' },
            { id: 'clear', label: 'Clear filter', hideWhen: ['unfiltered'] },
          ] },
    ] },
    // 0.9.0: menu situations ("Disable when…" in Settings › Context Menu)
    menuStates: [
        { id: 'unfiltered', label: 'Nothing is filtered' },
        { id: 'dialog', label: 'In a file dialog' },
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
                // Icons (0.7.0, was Grid; the id stays so saved views keep it): its columns follow the pane, and
                // the Layout menu's Icons entry opens its sizes (view.itemSize; Ctrl + wheel steps them too).
                { id: 'grid',    icon: '▦', tooltip: 'Icons',  columns: false,
                  sizes: ICON_SIZE_IDS.map(id => ({ id, label: `${ICON_SIZE_LABELS[id]} icons` })) },
                // Media (0.8.0): thumbnails of pictures, videos, music covers and PDFs (Media capability);
                // the same automatic columns and sizes as Icons, bigger.
                { id: 'media',   icon: '🖼', tooltip: 'Media',  columns: false,
                  sizes: ICON_SIZE_IDS.map(id => ({ id, label: ICON_SIZE_LABELS[id] })) },
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
        // A folder with no view of its own (folder tabs and hubs alike) starts from view + folderView (GEM Shell,
        // 2026-10-27); mostly pictures / videos / music: Media instead (Widget.vue, smart default).
        // Later a choice in the shell's settings panel (GExplorer section).
        folderView: { layout: 'details' },
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
		{ cap: 'Media',     reason: 'Shows thumbnails of pictures, videos and music covers in the Media layout' },
	]
}