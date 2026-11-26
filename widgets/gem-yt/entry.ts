import Widget from './Widget.vue'
import youtube from './rules/youtube.json'

// GEM YT (2026-11-22): YouTube in GEM Shell. 0.1: Standard mode (the real youtube.com in a web surface). 0.2: GEM YT
// mode, your channels from YouTube's own pages read by GEM Shell with rules/youtube.json (sdk.pageData): 1.0 (0.10.0)
// its pages (Feed, Creators, Discover, a channel's page, the watch page in tiles); the racks of 0.2 to 0.3 are gone.
// The plans: claude/plan-2026-11-23-youtube-adblock.md (7, 7c), plan-2026-11-23-gem-yt-1-0.md. History: CHANGELOG.md.
export default {
  api: '1.0',
  id: 'gem-yt',
  version: '0.24.2',    // what changed in each version: CHANGELOG.md
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  about: `# GEM YT

YouTube in GEM Shell. Sign in once and every copy is signed in; ads and trackers are blocked by GEM Shell (the 🛡 in
the bar: turn it off for this widget or for YouTube); a video's fullscreen fills your screen, and the sound goes on
when the widget is out of view.

**GEM YT mode** (▦ GEM YT): **Feed** is what's new for you (since you were here, the latest from your channels, You
may like without them); **Creators** shows every channel you follow as a tile (its banner, posting rhythm, topics, and
your tags: ＋ to tag it; Show filters them, 💛 Encouraged included); **Discover**, the channels YouTube keeps
suggesting that you don't follow. A channel opens on its own page (Latest | Popular, More videos); a video plays in
tiles (the video, Up next, comments, its channel). GEM Shell reads your YouTube pages for it (it asks you once) and
keeps what it read for a while (⟳ reads again). **Standard mode** (▶ YouTube) is YouTube's own site: narrow, its mobile site; wide, the desktop one (Settings: always one or the other).`,

  contexts: {
    grid: {
      // 0.2.1 (Guillaume): up to the whole grid (no maxSize); px, as the README asks
      minSize: { width: 360, height: 260 },
      defaultSize: { width: '60%', height: '60%' },
    },
    // 0.16.1: its own height and scrolling in the sidebar (it fills what it's given: the page, the compact player)
    sidebar: { minHeight: 240, scroll: 'self' },
    // 0.18.0: a strip: what's playing and its buttons (the panel opens under it)
    toolbar: { width: 360 },
  },

  defaults: { data: {}, view: {} },

  // 0.15.0: the video you're watching outlives GEM YT's tab (GEM Shell's jobs hold its page: Settings, When GEM YT is hidden)
  // watching: the page held while a video plays; scan: GEM Shell reading your channels once (sdk.pageData().scan)
  jobs: { watching: {}, scan: {} },

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
      // 0.15.0: what the video does when you leave GEM YT (another tab, GEM YT closed): a job in the operations tray
      {
        key: 'hidden', type: 'choice', label: 'When GEM YT is hidden', default: 'audio',
        choices: [
          { value: 'audio', label: 'Keep playing (the sound)' },
          { value: 'video', label: 'Keep playing in the operations tray (the video in its card)' },
          { value: 'pause', label: 'Pause' },
        ],
        hint: 'While a video is open, GEM Shell keeps its page when you go to another tab: its card in the operations tray says what it is (Open brings GEM YT back where you were, Stop closes it). Picture in picture always keeps playing.',
      },
      {
        key: 'quietAfter', type: 'choice', label: 'A channel has gone quiet after', default: '6',
        choices: [
          { value: '3', label: '3 months without a video' },
          { value: '6', label: '6 months without a video' },
          { value: '12', label: 'A year without a video' },
        ],
        hint: 'Quiet channels are put away at the end of the aisle, faded (the filter shows them all: Gone quiet).',
      },
      // 0.7.0: dislikes (Return YouTube Dislike asks to be credited: its name and address here and in the tooltip)
      {
        key: 'dislikes', type: 'toggle', label: 'Show dislikes', default: true,
        hint: 'Next to the video’s title: its likes and an estimate of its dislikes, from Return YouTube Dislike (returnyoutubedislike.com), which counts them from archived numbers and its own users’ votes. One request per video, kept for the day. Off: no requests at all.',
      },
    ],
  },

  capabilities: [
    { cap: 'Web', reason: 'Shows YouTube, and Google’s page to sign in.', domains: ['youtube.com', 'google.com'], userAdded: false },
    // 0.1.1 (GEM Shell 2026-11-22, page adapters 8c1): the rules GEM Shell reads YouTube's pages with for GEM YT mode
    // (rules/youtube.json: your subscriptions, their latest videos, a channel's videos, your home page). Asked once GEM YT mode uses them.
    { cap: 'PageData', reason: 'Shows your subscriptions, their videos and your feeds in GEM YT mode.', rules: [youtube] },
    // 0.7.0: dislikes from Return YouTube Dislike (returnyoutubedislikeapi.com); asked the first time a video plays in tiles
    { cap: 'Network', reason: 'Shows a video’s dislikes (an estimate) from Return YouTube Dislike, while Show dislikes is on.' },
    // 0.7.0: your own picture in the header ribbon (made ribbon-sized and kept by GEM Shell)
    { cap: 'Media', reason: 'Puts a picture you choose in the header ribbon.' },
  ],
}
