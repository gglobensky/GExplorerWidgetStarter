// src/widgets/items/entry.ts

import Widget from './Widget.vue'
import { ICON_SIZE_IDS, ICON_SIZE_LABELS } from './iconSizes'

/** Icons / Media: how the cells flow (view.arrange; the Layout menu, after the sizes). */
const ARRANGES = [
    { id: 'rows', label: 'Arrange in rows' },
    { id: 'columns', label: 'Arrange in columns' },
]

// Menu: contributed by the host (contextmenu/actions/core.ts registerItemsContributions), Refresh
// included (2026-10-24: a widget's own contributions may only run its own actions).

// ============================================================================
// Widget definition
// ============================================================================

export default {
    api:     '1.0',
    id:      'items',
    version: '0.15.1',   // 0.15.1 (2026-11-12): the selected count is anchored on its pane (GEM Shell hides it behind
                         // the file dialog and other questions; the dialog's own shows)
                         // 0.15.0 (2026-11-12): one selection across panes (globalSelection.ts): selecting in a pane
                         // clears the others' (focusing or scrolling clears nothing; the file dialog's apart); the
                         // count shows at the top right of the main view (GEM Shell's status tip)
                         // 0.14.0 (2026-11-05, GEM Shell H4c-6): one line per person, every line editable (GEM Shell writes
                         // the rows: lowered here, No access); "Add or edit" focuses someone already listed
                         // 0.13.2 (2026-11-05, GEM Shell H4c-5): "No access" means no access on Windows too (written as a row
                         // denying everything, said once); partly denied rows under Advanced
                         // 0.13.1 (2026-11-05, GEM Shell H4c-4): Permissions without scrollbars (People / Advanced views, the
                         // picker in the tab's place, short lists scroll), GEM Shell's risk question when a choice is
                         // made (Keep undoes that choice only), a refused owner shown with Undo, "needs admin" owners
                         // 0.13.0 (2026-11-05, GEM Shell H4c): the Permissions tab edits (PermissionsTab.vue: owner, who may
                         // use it in five words, denied rows, inheritance; Linux's mode, UNTESTED), the Permissions capability
                         // 0.12.1 (2026-11-05, GEM Shell H4b P4): Properties in tabs, attributes saved with GEM Shell's footer
                         // (Discard / Save), Alt+Enter through ui.showProperties
                         // 0.12.0 (2026-11-05, GEM Shell H4b): the Properties window (PropertiesWindow.vue, sdk.ui().openWindow),
                         // GEM Shell's Properties entries handed here (ui.onPropertiesRequest), Alt+Enter
                         // 0.11.2 (2026-11-05): a middle-click on a folder opens it in a new tab (GEM Shell's "Open where?")
                         // 0.10.0 (GEM Shell 2026-10-30, M2): useVirtualFlow + a ListFlow; 0.10.1 (M3): Arrange in columns;
                         // 0.11.0 (D4b, 2026-10-31): hidden / protected files from sdk.prefs(); the Layout of a new folder setting
                         // 0.11.1 (2026-10-31): Filter ▸ Sort in the file dialog (Show / Type greyed there)
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    // A file explorer (GEM Shell 2026-10-31, E4a): works in panes; one explorer is GEM Shell's default
    role: 'explorer',
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
        // 0.12.0
        { id: 'properties', name: 'Properties', keys: ['Alt+Enter'],
          description: 'Shows the properties of the selected files and folders (of the folder shown when nothing is selected) in a window: size, dates, attributes, media details, permissions and checksums. Fold it into the operations tray to keep it for later.' },
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
        // 0.11.1: shown in a file dialog too, for its Sort; Show and Type are greyed there (the dialog's own type
        // filter applies), Clear filter left out. Rules the user can change in Settings › Context Menu.
        { id: 'filter', type: 'submenu', label: 'Filter', icon: '⏷', contexts: ['background'],
          children: [
            { id: 'sort', type: 'submenu', label: 'Sort', children: [
                { slot: 'sort.columns', label: 'Sort columns' },
            ] },
            { id: 'show', type: 'submenu', label: 'Show', disableWhen: ['dialog'], children: [
                { id: 'show.all', label: 'Everything' },
                { id: 'show.folders', label: 'Folders only' },
                { id: 'show.files', label: 'Files only' },
            ] },
            { id: 'type', type: 'submenu', label: 'Type', disableWhen: ['dialog'], children: [
                { id: 'type.any', label: 'Any type' },
                { slot: 'type.list', label: 'Your types and the built-in ones' },
                { slot: 'type.focused', label: "The selected file's type" },
                { type: 'separator' },
                { id: 'types.edit', label: 'Edit types…', title: 'Make your own types, delete them, or hide built-in ones' },
            ] },
            { type: 'separator' },
            { id: 'clear', label: 'Clear filter', hideWhen: ['unfiltered', 'dialog'] },
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
                // 0.10.1: and how they flow (view.arrange, after the sizes): rows, or columns scrolling sideways.
                { id: 'grid',    icon: '▦', tooltip: 'Icons',  columns: false,
                  sizes: ICON_SIZE_IDS.map(id => ({ id, label: `${ICON_SIZE_LABELS[id]} icons` })), arranges: ARRANGES },
                // Media (0.8.0): thumbnails of pictures, videos, music covers and PDFs (Media capability);
                // the same automatic columns and sizes as Icons, bigger.
                { id: 'media',   icon: '🖼', tooltip: 'Media',  columns: false,
                  sizes: ICON_SIZE_IDS.map(id => ({ id, label: ICON_SIZE_LABELS[id] })), arranges: ARRANGES },
                { id: 'details', icon: '▤', tooltip: 'Details' },
            ],
            // Layout menu gets "Single page" / "Paged ▸"; the choice is stored per folder
            paging: { pageSizes: [100, 250, 500, 1000, 2500, 5000], defaultPageSize: 500 },
            minSize: { cols: 2, rows: 2 },
        },
        // 0.9.2 (GEM Shell 2026-10-29, Session K): no sidebar (nor toolbar) context. The explorer works in panes
        // only (folder tabs, hubs' grids, the file dialog): its navigation and its focus are a pane's. The shell
        // enforces it for whichever widget is the explorer.
    },

    // ── Settings (its page in GEM Shell's Settings; sdk.settings(), 0.11.0) ───────────────────────────
    // Hidden and protected files aren't here: they are GEM Shell's (Settings ▸ Files & drives), for every
    // widget alike, read through sdk.prefs().
    settings: {
        fields: [
            {
                key: 'newFolderLayout', type: 'choice', label: 'Layout of a new folder', default: 'auto',
                hint: 'How a folder you never changed the layout of opens. Automatic: Media for a folder of pictures, '
                    + 'videos or music, Details otherwise. A folder keeps its own layout once you change it there.',
                choices: [
                    { value: 'auto', label: 'Automatic' },
                    { value: 'details', label: 'Details' },
                    { value: 'list', label: 'List' },
                    { value: 'grid', label: 'Icons' },
                    { value: 'media', label: 'Media' },
                ],
            },
        ],
        groups: [{ title: 'Folders', keys: ['newFolderLayout'] }],
    },

    defaults: {
        data: { rpath: '' },
        // A folder with no view of its own (folder tabs and hubs alike) starts from view + folderView (GEM Shell,
        // 2026-10-27); then the user's "Layout of a new folder" (settings above, Widget.vue): Automatic keeps
        // this, or Media for a folder of pictures / videos / music.
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
		{ cap: 'Permissions', reason: 'Changes who may use a file or folder, from its Properties window (asked per item)' },
	]
}