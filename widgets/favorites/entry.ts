// src/widgets/favorites/entry.ts
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'favorites',
  version: '0.1.0',
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,

  // One owner for the whole shell (claude/job-recovery-design.md J4a, 2026-10-23): the favorites are the
  // shell's, shared by every place this widget is shown, so a menu action reaches one of them (no
  // "which one?" submenu) and they stay in step.
  instance: 'global',

  // Right-click on a favorite or a favorites folder (Widget.vue: sdk.ui().contextMenu, onMenuItem)
  menuContexts: [
    { id: 'favorites.item',   label: 'Favorite',         icon: '★' },
    { id: 'favorites.folder', label: 'Favorites folder', icon: '📁' },
  ],
  menus: {
    items: [
      { id: 'edit',      label: 'Edit…',   icon: '✎', contexts: ['favorites.item'] },
      { id: 'item.sep',  type: 'separator',          contexts: ['favorites.item'] },
      { id: 'remove',    label: 'Remove',  icon: '✕', contexts: ['favorites.item'] },
      { id: 'rename',    label: 'Rename…', icon: '✎', contexts: ['favorites.folder'] },
      { id: 'folder.sep', type: 'separator',         contexts: ['favorites.folder'] },
      { id: 'delete',    label: 'Delete…', icon: '✕', contexts: ['favorites.folder'] },
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
    },

    // Optional: allow dropping favorites in the main grid as a big widget
    grid: {
      minSize:     { cols: 2, rows: 1 },
      maxSize:     { cols: 12, rows: 8 },
      defaultSize: { cols: 4, rows: 2 },
    },

    // Optional: also usable in sidebar
    sidebar: {
      minHeight: 120,
    },

    // Widget-local layout modes (up to you & Widget.vue)
    layouts: [
      { id: 'toolbar', icon: '★', tooltip: 'Toolbar pills' },
      { id: 'list',    icon: '☰', tooltip: 'Vertical list' },
    ],
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
