import Widget from './Widget.vue'

export default {
  api: '1.0', id: 'treeview', version: '0.5.2', license: 'PolyForm-Noncommercial-1.0.0', Component: Widget,
  displayName: 'Tree View', description: 'Browse one folder tree at a time, with remembered roots and focused folders.', category: 'navigation', icon: 'folder-tree',
  contexts: {
    sidebar: { minHeight: 180, fillRemaining: true },
    grid: { minSize: { cols: 2, rows: 2 }, defaultSize: { cols: 6, rows: 5 } },
    toolbar: { minSize: { cols: 4, rows: 1 }, maxSize: { cols: 16, rows: 1 }, defaultSize: { cols: 8, rows: 1 } },
  },
  defaults: { data: { folders: [] }, view: {} },
  // Commands (0.5.2, GEM Shell's key mapper): run while the tree has your focus; Widget.vue onCommand.
  // They act on the focused folder (else the folder the tree is focused on, else its root).
  commands: [
    { id: 'copy', name: 'Copy folder', keys: ['Ctrl+C'],
      description: 'Copies the focused folder to the clipboard, to paste it elsewhere (here, in a file list, or in another app).' },
    { id: 'cut', name: 'Cut folder', keys: ['Ctrl+X'],
      description: 'Cuts the focused folder: pasting it elsewhere moves it there.' },
    { id: 'paste', name: 'Paste into folder', keys: ['Ctrl+V'],
      description: 'Pastes what the clipboard holds (files or folders copied or cut) into the focused folder.' },
  ],
  capabilities: [
    { cap: 'Read', reason: 'Lists folders as you expand the tree and identifies favorite destinations.' },
    { cap: 'Metadata', reason: 'Shows total and available capacity for drive roots.' },
    { cap: 'Clipboard', reason: 'Copies and cuts selected folders through the OS clipboard.' },
    { cap: 'Write', reason: 'Creates and renames folders, and pastes OS clipboard items into the folder you choose.' },
    { cap: 'Favorites', reason: 'Shows your favorite folders and files in the root selector.' },
    { cap: 'Location', reason: 'Opens on the folder you are browsing.' },
  ],
  // Menu situations (0.5.0): items set to "Disable when…" one of them grey out (defaults below; the user
  // changes them per item in sys:context-menus). TreePanel.menuStatesFor reports them on each right-click.
  menuStates: [
    { id: 'narrow', label: 'Narrow view' },
    { id: 'unfocused', label: 'Nothing focused' },
    { id: 'this-focused', label: 'This folder is focused' },
  ],
  menuContexts: [
    { id: 'treeview.folder', label: 'Tree folder', icon: '▱', subject: 'files' },
    { id: 'treeview.column-folder', label: 'Tree column folder', icon: '▱', subject: 'files' },
  ],
  menus: { items: [
    { id: 'copy', label: 'Copy', icon: '📋', contexts: ['treeview.folder', 'treeview.column-folder'] },
    { id: 'cut', label: 'Cut', icon: '✂', contexts: ['treeview.folder', 'treeview.column-folder'] },
    { id: 'paste', label: 'Paste into folder', icon: '📄', contexts: ['treeview.folder', 'treeview.column-folder'], when: { clipboard: { canPaste: true } } },
    { id: 'focus', label: 'Focus this folder', contexts: ['treeview.folder', 'treeview.column-folder'], disableWhen: ['this-focused'] },
    { id: 'exit-focus', label: 'Exit focused view', contexts: ['treeview.folder', 'treeview.column-folder'], disableWhen: ['unfocused'] },
    { id: 'minimize-all', label: 'Minimize all', contexts: ['treeview.folder'], disableWhen: ['narrow'] },
    { id: 'minimize-others', label: 'Minimize others', contexts: ['treeview.folder'], disableWhen: ['narrow'] },
    { id: 'refresh', label: 'Refresh folders', contexts: ['treeview.folder', 'treeview.column-folder'] },
  ] },
}
