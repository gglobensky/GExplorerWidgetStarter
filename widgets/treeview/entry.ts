import Widget from './Widget.vue'

export default {
  api: '1.0', id: 'treeview', version: '0.4.0', license: 'PolyForm-Noncommercial-1.0.0', Component: Widget,
  displayName: 'Tree View', description: 'Browse one folder tree at a time, with remembered roots and focused folders.', category: 'navigation', icon: 'folder-tree',
  contexts: {
    sidebar: { minHeight: 180, fillRemaining: true },
    grid: { minSize: { cols: 2, rows: 2 }, defaultSize: { cols: 6, rows: 5 } },
    toolbar: { minSize: { cols: 4, rows: 1 }, maxSize: { cols: 16, rows: 1 }, defaultSize: { cols: 8, rows: 1 } },
  },
  defaults: { data: { folders: [] }, view: {} },
  capabilities: [
    { cap: 'Read', reason: 'Lists folders as you expand the tree and identifies favorite destinations.' },
    { cap: 'Metadata', reason: 'Shows total and available capacity for drive roots.' },
    { cap: 'Clipboard', reason: 'Copies and cuts selected folders through the OS clipboard.' },
    { cap: 'Write', reason: 'Creates and renames folders, and pastes OS clipboard items into the folder you choose.' },
    { cap: 'Favorites', reason: 'Shows your favorite folders and files in the root selector.' },
    { cap: 'Location', reason: 'Opens on the folder you are browsing.' },
  ],
  menuContexts: [
    { id: 'treeview.folder', label: 'Tree folder', icon: '▱', subject: 'files' },
    { id: 'treeview.column-folder', label: 'Tree column folder', icon: '▱', subject: 'files' },
  ],
  menus: { items: [
    { id: 'copy', label: 'Copy', icon: '📋', contexts: ['treeview.folder', 'treeview.column-folder'] },
    { id: 'cut', label: 'Cut', icon: '✂', contexts: ['treeview.folder', 'treeview.column-folder'] },
    { id: 'paste', label: 'Paste into folder', icon: '📄', contexts: ['treeview.folder', 'treeview.column-folder'], when: { clipboard: { canPaste: true } } },
    { id: 'focus', label: 'Focus this folder', contexts: ['treeview.folder', 'treeview.column-folder'] },
    { id: 'exit-focus', label: 'Exit focused view', contexts: ['treeview.folder', 'treeview.column-folder'] },
    { id: 'minimize-all', label: 'Minimize all', contexts: ['treeview.folder'] },
    { id: 'minimize-others', label: 'Minimize others', contexts: ['treeview.folder'] },
    { id: 'refresh', label: 'Refresh folders', contexts: ['treeview.folder', 'treeview.column-folder'] },
  ] },
}
