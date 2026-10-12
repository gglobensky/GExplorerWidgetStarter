import Widget from './Widget.vue'

export default {
  api: '1.0', id: 'treeview', version: '0.2.4', Component: Widget,
  displayName: 'Tree View', description: 'Browse one folder tree at a time, with remembered roots and focused folders.', category: 'navigation', icon: 'folder-tree',
  contexts: { sidebar: { minHeight: 180, fillRemaining: true } },
  defaults: { data: { folders: [] }, view: {} },
  capabilities: [
    { cap: 'Read', reason: 'Lists folders as you expand the tree and identifies favorite destinations.' },
    { cap: 'Favorites', reason: 'Shows your favorite folders and files in the root selector.' },
  ],
  menuContexts: [{ id: 'treeview.folder', label: 'Tree folder', icon: '▱', subject: 'files' }],
  menus: { items: [
    { id: 'focus', label: 'Focus this folder', contexts: ['treeview.folder'] },
    { id: 'exit-focus', label: 'Exit focused view', contexts: ['treeview.folder'] },
    { id: 'minimize-all', label: 'Minimize all', contexts: ['treeview.folder'] },
    { id: 'minimize-others', label: 'Minimize others', contexts: ['treeview.folder'] },
    { id: 'refresh', label: 'Refresh folders', contexts: ['treeview.folder'] },
  ] },
}
