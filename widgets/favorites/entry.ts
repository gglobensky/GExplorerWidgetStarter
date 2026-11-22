// src/widgets/favorites/entry.ts
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'favorites',
  // NEW (2026-11-14, 0.3.6; GEM Shell G2b): GEM Shell's favorites role (widgets/roles.ts)
  role: 'favorites',
  // 0.3.3 (GEM Shell Session N, 2026-11-04): the list and the bar scroll in GEM Shell's <gex-scroll-area> (the list's ▲ / ▼
  // strips, a line at the end; the bar's sideways strips, the wheel scrolling it sideways); dragging near an edge
  // scrolls them. The list's own scroller and its bottom handle are gone: the sidebar row's min / max sizes it.
  // 0.3.2: a favorite carried out of a menu drops anywhere on the bar (its empty space too; before / after along the bar).
  // 0.3.1: a favorite dragged over a sub-folder in an open menu opens it, and drops there (a drag from the bar too).
  // 0.3.0 (GEM Shell E5c-2, 2026-11-03): the folder menus are GEM Shell's popovers (a level per folder, sub-folders
  // opening on hover, never over their parent), the drag ghost GEM Shell's (ui.dragGhost): nothing drawn outside the
  // widget's box any more.
  version: '0.4.1',   // 0.4.1 (2026-11-21): F2 over a folder menu's row renames it; dragging on the bar or the list shows where it goes as the menus do (the dragged pill faded, a line between pills, a folder lit for inside: the old insert bar was never visible). 0.4.0 (2026-11-21): the folder dropdowns are GEM Shell's menu (sdk.ui().openMenu): sub-folders as submenus (hover, → / ←, Enter, typing to jump), the ✕, F2 / Rename… in place, dragging favorites and folders within a menu, between its levels, out to the bar and from the bar into it (a sub-folder opens as the pointer lingers); the menus follow every change at once. FolderMenu.vue and useFolderPopovers.ts are gone. 0.3.11 (2026-11-21): Rename… works in a sub-folder's menu (the row stays on screen: GEM Shell keeps a hover level open while its right-click menu or a rename box is open; the widget no longer kept a closed level's rows). Remove everywhere (a folder's "Delete…" is "Remove folder"); GEM Shell's snackbar offers Undo after a remove; a folder asks first only when it holds something. 0.3.10 (2026-11-14): the several-panes badge sized from its text. 0.3.9 (2026-11-14): icons sized from the text (no overlap at large text); GEM Shell's colours; transparent in the toolbar / sidebar. 0.3.8: sizes follow Appearance (built with the Text size / Roundness step). 0.3.7 (2026-11-14): in GEM Shell's file dialog (contexts.dialog: the list)
                      // 0.3.6 (2026-11-14): role 'favorites'
                      // 0.3.5 (2026-11-13): the hand on a favorite (one click opens it; GEM Shell's cursor handles)
                      // 0.3.4 (2026-11-05): middle-click opens a favorite in a new tab (GEM Shell's "Open where?")
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,

  // One owner for the whole shell (claude/job-recovery-design.md J4a, 2026-10-23): the favorites are the
  // shell's, shared by every place this widget is shown, so a menu action reaches one of them (no
  // "which one?" submenu) and they stay in step.
  instance: 'global',

  // Keys (0.2.1; favorites too 0.2.2): F2 renames the folder or favorite under the mouse (the pills can't take
  // the focus: a click opens them), or the one focused with Tab. GEM Shell's key mapper: `when: 'hovered'`.
  commands: [
    { id: 'rename', name: 'Rename', keys: ['F2'], when: 'hovered',
      description: 'Renames the favorite or favorites folder under the mouse (or the one you Tabbed to): its name becomes editable. Enter keeps it, Escape cancels.' },
  ],

  // Right-click on a favorite or a favorites folder (Widget.vue: sdk.ui().contextMenu, onMenuItem)
  menuContexts: [
    { id: 'favorites.item',       label: 'Favorite',         icon: '★' },
    { id: 'favorites.folder',     label: 'Favorites folder', icon: '📁' },
    // 0.2.0: the bar or list itself, not on a favorite
    { id: 'favorites.background', label: 'Favorites bar',    icon: '☆' },
  ],
  menus: {
    items: [
      // On a favorite: adding goes in the folder it is in
      { id: 'rename-item',       label: 'Rename…',             icon: '✎', contexts: ['favorites.item'] },
      { id: 'edit',              label: 'Edit…',               icon: '⚙', contexts: ['favorites.item'] },
      { id: 'item.sep',          type: 'separator',                       contexts: ['favorites.item'] },
      { id: 'add-here',          label: 'Add favorite here…',  icon: '★', contexts: ['favorites.item'] },
      { id: 'new-folder-here',   label: 'New folder here…',    icon: '📁', contexts: ['favorites.item'] },
      { id: 'item.sep2',         type: 'separator',                       contexts: ['favorites.item'] },
      { id: 'remove',            label: 'Remove',              icon: '✕', contexts: ['favorites.item'] },
      // On a folder (its button or its open dropdown): inside it
      { id: 'add-inside',        label: 'Add favorite inside…', icon: '★', contexts: ['favorites.folder'] },
      { id: 'new-folder-inside', label: 'New folder inside…',  icon: '📁', contexts: ['favorites.folder'] },
      { id: 'folder.sep0',       type: 'separator',                       contexts: ['favorites.folder'] },
      { id: 'rename',            label: 'Rename…',             icon: '✎', contexts: ['favorites.folder'] },
      { id: 'folder.sep',        type: 'separator',                       contexts: ['favorites.folder'] },
      // 0.3.11: Remove, as for a favorite (nothing on disk is deleted); it asks only when the folder holds something
      { id: 'delete',            label: 'Remove folder',       icon: '✕', contexts: ['favorites.folder'] },
      // On the bar itself: the top level
      { id: 'add',               label: 'Add favorite…',       icon: '★', contexts: ['favorites.background'] },
      { id: 'new-folder',        label: 'New folder…',         icon: '📁', contexts: ['favorites.background'] },
    ],
  },

  // Where this widget can live
  contexts: {
    // Toolbar strip (main intended place)
    toolbar: {
      // These are "grid-ish" units; tweak to taste once the toolbar host exists
      minSize:     { cols: 4,  rows: 1 },
      maxSize:     { cols: 24, rows: 1 },
      defaultSize: { cols: 12, rows: 1 },
      layouts: [{ id: 'toolbar', icon: '★', tooltip: 'Toolbar pills' }],
    },

    // Optional: allow dropping favorites in the main grid as a big widget
    grid: {
      minSize:     { cols: 2, rows: 1 },
      maxSize:     { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 2 },
      layouts: [
        { id: 'toolbar', icon: '★', tooltip: 'Toolbar pills' },
        { id: 'list',    icon: '☰', tooltip: 'Vertical list' },
      ],
    },

    // Optional: also usable in sidebar
    sidebar: {
      minHeight: 120,
      // 0.3.3: the list scrolls itself (its <gex-scroll-area>), so the add button stays put above it
      scroll: 'self',
      layouts: [{ id: 'list', icon: '☰', tooltip: 'Vertical list' }],
    },

    // NEW (0.3.7, GEM Shell G2b-2): GEM Shell's file dialog shows it beside its explorer (as in the sidebar: the
    // list); a click moves the dialog there (sdk.navigate), a favorite of several folders asks which
    dialog: {
      layouts: [{ id: 'list', icon: '☰', tooltip: 'Vertical list' }],
    },

    // Layouts are per place (only the grid offers a choice): the Layout menu offers the place's own
  },

  // Default config that will be passed as props.config
  defaults: {
    data: {
      // Which logical favorites group to use in favorites/service
      group: 'default',

      // Future-you knobs:
      // scope: 'global' | 'workspace' | 'profile' (if you ever want that)
      showLabels: true,
      maxVisible: 24,
    },
    view: {
      layout: 'toolbar',  // must match one of contexts.layouts ids
      dense: true,
    },
  },

  // Other widgets' menus (claude/places-navigation-design.md, 2026-10-22): a file menu's
  // Favorites ▸ submenu, and a tab's right-click menu ('tab': the place the tab shows).
  actions: [
    {
      id: 'add',
      label: 'Add to favorites',
      // The folders selected (files skipped), or the folder shown when nothing is
      accepts: { contexts: ['folder', 'multi', 'background'], kinds: 'folders' },
      contextMenu: { label: 'Add to favorites', icon: '★', submenuLabel: 'Favorites' },
    },
    {
      id: 'addTogether',
      label: 'Add as one (side by side)',
      // 2 to 4 folders, one favorite that opens them side by side
      accepts: { contexts: ['multi'], kinds: 'folders', count: { min: 2, max: 4 } },
      contextMenu: { label: 'Add as one (side by side)', icon: '⊞', submenuLabel: 'Favorites' },
    },
    {
      id: 'addTab',
      label: 'Add this tab to favorites',
      accepts: { contexts: ['tab'] },
      contextMenu: { label: 'Add to favorites', icon: '★', submenuLabel: 'Favorites' },
    },
    {
      id: 'configure',
      label: 'Add to favorites…',
      // The add dialog on the folders (or the folder shown, or a tab's place): name, place, folders
      accepts: { contexts: ['folder', 'multi', 'background', 'tab'], kinds: 'folders' },
      contextMenu: { label: 'Add to favorites…', icon: '✎', submenuLabel: 'Favorites' },
    },
  ],

  capabilities: [
		{ cap: 'Read',  reason: 'Reads favorite paths to display them' },
		{ cap: 'Write', reason: 'Adds and removes favorites' },
		{ cap: 'Favorites', reason: "Shows and edits your favorites" },
		{ cap: 'Location', reason: 'Pre-fills the folder you are browsing when you add a favorite' },
	]
}
