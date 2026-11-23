import Widget from './Widget.vue'
import youtube from './rules/youtube.json'

// GEM YT (2026-11-22): YouTube in GEM Shell. 0.1: Standard mode (the real youtube.com in a web surface). 0.2: GEM YT
// mode, your channels on racks (library-ui 3.9.0's video cases and posters), from YouTube's own pages read by GEM Shell
// with rules/youtube.json (sdk.pageData). The plan: claude/plan-2026-11-23-youtube-adblock.md (7, 7c).
export default {
  api: '1.0',
  id: 'gem-yt',
  version: '0.3.0',   // 0.1.0 (2026-11-22): Standard mode · 0.1.1: its YouTube rules (PageData) · 0.1.2: how long each page stays fresh · 0.2.0: GEM YT mode (racks) · 0.2.1: any size in a hub (the whole grid) · 0.2.2: every box a rack shows gets its picture · 0.2.3: pictures in the order racks fill, racks read as they come into view, the wall's plaque, JPEG covers · 0.2.4: Fresh from your subscriptions and You may like first, pictures on their way shown, the channel list readable · 0.2.5: racks in the order their channels last posted, You may like without your channels, the channel list A to Z · 0.3.0: remembered between starts (racks at once), each channel's uploads and subscribers kept, a slow survey of the channels not read yet, the latest upload on each poster
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  about: `# GEM YT

YouTube in GEM Shell. Sign in once and every copy is signed in; ads and trackers are blocked by GEM Shell (the 🛡 in
the bar: turn it off for this widget or for YouTube); a video's fullscreen fills your screen, and the sound goes on
when the widget is out of view.

**GEM YT mode** (▦ Racks): every channel you follow gets a rack, its poster on top, its latest videos as cases on
the shelves. Open a rack for all its videos; click a case to play it. GEM Shell reads your YouTube pages for it (it
asks you once) and keeps what it read for a while (⟳ reads again). **Standard mode** (▶ YouTube) is YouTube's own
site: narrow, its mobile site; wide, the desktop one (Settings: always one or the other).`,

  contexts: {
    grid: {
      // 0.2.1 (Guillaume): up to the whole grid (no maxSize); px, as the README asks
      minSize: { width: 360, height: 260 },
      defaultSize: { width: '60%', height: '60%' },
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
    // (rules/youtube.json: your subscriptions, their latest videos, a channel's videos, your home page). Asked once GEM YT mode uses them.
    { cap: 'PageData', reason: 'Shows your subscriptions and channels on racks (GEM YT mode).', rules: [youtube] },
  ],
}
