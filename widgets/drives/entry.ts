import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'drives',
  version: '0.7.1',   // 0.7.1 (2026-11-13): GEM Shell's cursor handles (the hand: one click opens a drive)
                      // 0.7.0 (2026-11-13, GEM Shell drive properties): a drive's menu (Open, Open in a new tab,
                      // Rename, then GEM Shell's Copy path / Properties), F2 renames it in place, Alt+Enter: Properties
                      // 0.6.1 (2026-11-05): middle-click opens a drive in a new tab
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,

  // ── Commands (the key mapper): run while a drive here has your focus (Widget.vue onCommand) ──
  commands: [
    { id: 'rename', name: 'Rename drive', keys: ['F2'],
      description: 'Renames the focused drive in place: its name becomes editable. Enter keeps the new name, Escape cancels. Some drives can\'t be renamed (discs, network shares).' },
    { id: 'properties', name: 'Properties', keys: ['Alt+Enter'],
      description: 'Shows the focused drive\'s properties: its name, space, file system, hardware and permissions.' },
  ],

  // ── Context menus: a drive (subject 'files': GEM Shell adds its Copy path and Properties after these) ──
  menuContexts: [
    { id: 'drive', label: 'Drive', icon: '💽', subject: 'files' },
  ],
  menus: {
    items: [
      { id: 'open', label: 'Open', icon: '📂', contexts: ['drive'], disableWhen: ['no-media'] },
      { id: 'open-tab', label: 'Open in a new tab', icon: '⧉', contexts: ['drive'], disableWhen: ['no-media'] },
      { id: 'drive.sep', type: 'separator', contexts: ['drive'] },
      { id: 'rename', label: 'Rename', icon: '✎', contexts: ['drive'], disableWhen: ['no-media'] },
    ],
  },
  menuStates: [
    { id: 'no-media', label: 'The drive has no disc' },
  ],
  
  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 4 },
      defaultSize: { cols: 4, rows: 2 }
    },
    sidebar: {
      minHeight: 96
    },
    toolbar: {
      // A useful starting width; the toolbar still lets the user make it flexible or resize it.
      width: 280
    }
  },
  
  defaults: {
    data: {},
    view: {
      layout: 'grid',
      columns: 3,
      itemSize: 'md',
      showFsType: true,
      showCapacity: true,
    }
  },

  settings: {
    fields: [
      {
        key: 'colorByUsage',
        type: 'toggle',
        label: 'Colour bars by space used',
        default: true,
        hint: 'Uses green normally, amber above 75% used, and red above 90%. Turn this off to use the shell accent colour.',
      },
    ],
    groups: [
      { title: 'Display', keys: ['colorByUsage'] },
    ],
  },
  
  capabilities: [
		{ cap: 'Metadata', reason: 'Reads drive capacity and filesystem info' },
		// 0.7.0: a drive's name (asked per drive: the drive itself, nothing in it)
		{ cap: 'Write', reason: 'Renames drives (asked for each drive, for its name only)' },
	]
}
