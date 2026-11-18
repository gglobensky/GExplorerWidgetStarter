import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'drives',
  // NEW (2026-11-14, 0.7.2; GEM Shell G2b): GEM Shell's drives role (widgets/roles.ts)
  role: 'drives',
  version: '0.7.7',   // 0.7.7 (2026-11-18, GEM Shell W): "Colour bars by space used" shows in Appearance ▸ Widgets ▸ Drives too, and only the fills in use can be changed (Fill while it's off, the three by space used while it's on). 0.7.6 (2026-11-18, GEM Shell G7): the usage bar's colours are customizable parts (Appearance ▸ Widgets ▸ Drives). 0.7.5 (2026-11-14): densities chosen as at 100 % text; GEM Shell's colours. 0.7.4: sizes follow Appearance (built with the Text size / Roundness step). 0.7.3 (2026-11-14): in GEM Shell's file dialog (contexts.dialog: a compact list)
                      // 0.7.2 (2026-11-14): role 'drives'
                      // 0.7.1 (2026-11-13): GEM Shell's cursor handles (the hand: one click opens a drive)
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
    },
    // NEW (0.7.3, GEM Shell G2b-2): GEM Shell's file dialog shows it beside its explorer (one column, compact, as in
    // the sidebar); a click moves the dialog to the drive
    dialog: {
      layouts: [{ id: 'list', icon: '☰', tooltip: 'Compact list' }],
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

  // NEW (0.7.6, GEM Shell G7): the colours the user may change (Appearance ▸ Widgets ▸ Drives, or Customize a part on a
  // bar). Widget.vue uses var(--my-<name>); the bar carries data-gem-part="usage". The fill is read on the track (a
  // separator's target: it must not nearly disappear).
  // 0.7.7 (GEM Shell W): the group shows the colorByUsage setting (still a setting: yours, every theme), and each fill
  // says when it's used (enabledWhen): the other ones are greyed there.
  customize: [
    { id: 'usage', label: 'Usage bar', settings: ['colorByUsage'], values: [
      { name: 'usage-fill', label: 'Fill (one colour)', designed: 'accent', textOn: 'usage-track', kind: 'decor',
        enabledWhen: { key: 'colorByUsage', truthy: false } },
      { name: 'usage-normal', label: 'Fill, by space used: plenty left', designed: 'success', textOn: 'usage-track', kind: 'decor',
        enabledWhen: { key: 'colorByUsage', truthy: true } },
      { name: 'usage-warning', label: 'Fill, by space used: above 75 %', designed: 'warning', textOn: 'usage-track', kind: 'decor',
        enabledWhen: { key: 'colorByUsage', truthy: true } },
      { name: 'usage-critical', label: 'Fill, by space used: above 90 %', designed: 'danger', textOn: 'usage-track', kind: 'decor',
        enabledWhen: { key: 'colorByUsage', truthy: true } },
      { name: 'usage-track', label: 'Track', designed: 'surface3' },
    ] },
  ],

  settings: {
    fields: [
      {
        key: 'colorByUsage',
        type: 'toggle',
        label: 'Colour bars by space used',
        default: true,
        hint: 'Green normally, amber above 75 % used, red above 90 %. Off: one colour (the theme\'s Fill).',
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
