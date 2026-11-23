import Widget from './Widget.vue'
import youtube from './rules/youtube.json'

// GEM YT (2026-11-22): YouTube in GEM Shell. 0.1: Standard mode (the real youtube.com in a web surface).
// The plan: claude/plan-2026-11-23-youtube-adblock.md (7, 7c: GEM YT mode comes later, on the shell's YouTube adapter).
export default {
  api: '1.0',
  id: 'gem-yt',
  version: '0.1.2',   // 0.1.0 (2026-11-22): Standard mode · 0.1.1: its YouTube rules (PageData, used from GEM YT mode on) · 0.1.2: how long each page stays fresh
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  about: `# GEM YT

YouTube in GEM Shell. Sign in once and every copy is signed in; ads and trackers are blocked by GEM Shell (the 🛡 in
the bar: turn it off for this widget or for YouTube); a video's fullscreen fills your screen, and the sound goes on
when the widget is out of view.

Narrow, it shows YouTube's mobile site; wide, the desktop site (Settings: always one or the other).

Coming: **GEM YT mode**, our own view of your subscriptions and channels, on racks like the media library.`,

  contexts: {
    grid: {
      minSize: { cols: 3, rows: 2 },
      maxSize: { cols: 12, rows: 10 },
      defaultSize: { cols: 7, rows: 6 },
    },
    sidebar: { minHeight: 240 },
  },

  defaults: { data: {}, view: {} },

  settings: {
    fields: [
      {
        key: 'pages', type: 'choice', label: 'YouTube’s site', default: 'auto',
        choices: [
          { value: 'auto', label: 'By the widget’s size' },
          { value: 'desktop', label: 'Always desktop' },
          { value: 'mobile', label: 'Always mobile' },
        ],
        hint: 'By size: the mobile site when the widget is narrow, the desktop site when it is wide. A change reloads the page; a video goes on where it was.',
      },
    ],
  },

  capabilities: [
    { cap: 'Web', reason: 'Shows YouTube, and Google’s page to sign in.', domains: ['youtube.com', 'google.com'], userAdded: false },
    // 0.1.1 (GEM Shell 2026-11-22, page adapters 8c1): the rules GEM Shell reads YouTube's pages with for GEM YT mode
    // (rules/youtube.json: your subscriptions, a channel's videos, your home page). Asked once GEM YT mode uses them.
    { cap: 'PageData', reason: 'Shows your subscriptions and channels on racks (GEM YT mode).', rules: [youtube] },
  ],
}
