import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'gem-bugle',
  version: '0.4.0',
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  about: `# The GEM Bugle

A personal daily newspaper assembled from feeds the reader chooses, with locally generated daily diversions.

The optional starter shelf contains reviewed official feeds and never subscribes the reader automatically. Reader-added publications are credited beside every story and in the Bugle's colophon, because runtime sources are not part of the signed widget bundle.`,

  credits: [
    {
      name: 'NASA',
      url: 'https://www.nasa.gov/',
      text: 'The optional starter shelf links to official NASA Science feeds. NASA is not affiliated with or endorsing GEM Bugle; stories and media remain credited to their stated sources.',
    },
    {
      name: 'NASA Jet Propulsion Laboratory',
      url: 'https://www.jpl.nasa.gov/',
      text: 'The optional starter shelf links to JPL’s official news RSS feed. JPL is managed for NASA by Caltech and is not affiliated with or endorsing GEM Bugle.',
    },
    {
      name: 'Lichess',
      url: 'https://lichess.org/',
      text: 'The optional Daily chess feature uses the public Lichess daily-puzzle API. Lichess publishes its puzzle collection in the public domain and is not affiliated with or endorsing GEM Bugle.',
    },
  ],

  contexts: {
    grid: {
      minSize: { cols: 2, rows: 1 },
      maxSize: { cols: 12, rows: 10 },
      defaultSize: { cols: 7, rows: 6 },
    },
    sidebar: { minHeight: 170 },
    toolbar: { width: 360 },
  },

  defaults: {
    data: {},
    view: { page: 0 },
  },

  settings: {
    fields: [
      { key: 'refreshMinutes', type: 'number', label: 'Refresh every', unit: 'minutes', min: 10, max: 240, step: 10, slider: true, default: 30 },
      { key: 'showDiversions', type: 'toggle', label: 'Include the diversions page', default: true },
      { key: 'dailyChess', type: 'toggle', label: 'Fetch the Lichess daily chess puzzle', default: false, hint: 'Optional. Contacts lichess.org once per edition and keeps the puzzle locally for the day.' },
      { key: 'pageAnimation', type: 'toggle', label: 'Animate page turns', default: true, hint: 'Reduced-motion system preferences always take precedence.' },
      { key: 'refreshNow', type: 'action', label: 'Refresh now', buttonLabel: 'Fetch every enabled source', whenClosed: 'queue' },
    ],
    groups: [
      { title: 'Edition', keys: ['showDiversions', 'pageAnimation'] },
      { title: 'Diversions', description: 'Sudoku is generated locally. Network diversions are opt-in.', keys: ['dailyChess'] },
      { title: 'Sources', description: 'Add and arrange publications from the Sources button in an open Bugle.', keys: ['refreshMinutes', 'refreshNow'] },
    ],
  },

  capabilities: [
    { cap: 'Network', reason: 'Reads feeds the reader adds and optional daily features they enable.' },
    { cap: 'Read', reason: 'Imports an OPML subscription list only after the reader chooses a file.' },
    { cap: 'Write', reason: 'Exports the reader’s subscriptions as an OPML file at a location they choose.' },
  ],
}
