import { createApp, h, ref } from 'vue'
import Widget from '../Widget.vue'

const params = new URLSearchParams(location.search)
const context = params.get('context') === 'sidebar' || params.get('context') === 'toolbar'
  ? params.get('context') as 'sidebar' | 'toolbar'
  : 'grid'
const defaults = context === 'toolbar' ? { width: 430, height: 48 } : context === 'sidebar' ? { width: 290, height: 330 } : { width: 760, height: 560 }
const width = Math.max(120, Number(params.get('width')) || defaults.width)
const height = Math.max(36, Number(params.get('height')) || defaults.height)
const root = document.querySelector<HTMLElement>('#widget')
if (root) {
  root.style.width = `${width}px`
  root.style.height = `${height}px`
}

const stories = [
  ['A new observatory opens its eye to the northern sky', 'Science', 'Researchers expect the instrument to reveal faint objects that older surveys could not distinguish.'],
  ['City restores the clock above the old central station', 'Local', 'The landmark timepiece is keeping time again after a careful six-month restoration.'],
  ['Independent studios find an audience for quieter games', 'Culture', 'Small teams are experimenting with shorter stories and hand-drawn worlds.'],
  ['Markets steady as manufacturers publish autumn forecasts', 'Business', 'Several firms reported that supply delays continued to ease this quarter.'],
  ['Open source maintainers gather for their annual summit', 'Technology', 'The programme focuses on sustainable projects, documentation and new contributors.'],
  ['The home side wins a dramatic extra-time final', 'Sports', 'A late goal settled an even contest in front of a capacity crowd.'],
  ['Museums reconsider how a digital exhibition should age', 'Culture', 'Curators are preserving not only files but the software and displays that gave them meaning.'],
  ['Why a slower morning edition can still matter', 'Opinion', 'A daily paper can offer deliberate selection instead of an endless stream.'],
]

const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>The Example Chronicle</title><link>https://example.test/</link><description>Sample stories for the GEM Bugle preview.</description>${stories.map((story, index) => `<item><guid>story-${index}</guid><title>${story[0]}</title><link>https://example.test/story-${index}</link><category>${story[1]}</category><description>${story[2]}</description><pubDate>${new Date(Date.now() - index * 3600000).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`

let stored: any = {
  version: 1,
  sources: [{ id: 'example', feedUrl: 'https://example.test/feed.xml', siteUrl: 'https://example.test/', title: 'The Example Chronicle', section: 'auto', display: 'summary', enabled: true, addedAt: Date.now() }],
}
const values = {
  refreshMinutes: 30,
  showDiversions: params.get('diversions') !== 'off',
  dailyChess: params.get('chess') !== 'off',
  pageAnimation: true,
}
const page = ref(0)
const dailyChess = JSON.stringify({
  game: { id: 'preview-game', clock: '3+2' },
  puzzle: {
    id: 'preview', rating: 1450, plays: 1200,
    solution: ['e2e8', 'h8g7', 'e8e7'],
    themes: ['mateInTwo', 'rookEndgame'],
    fen: '7k/8/8/8/8/8/4R3/7K w - - 0 1',
  },
})
const sdk = {
  networkFetch: async (url: string) => ({ ok: true, status: 200, text: async () => url.includes('lichess.org') ? dailyChess : rss }),
  configRead: async () => stored,
  configWrite: async (_name: string, data: any) => { stored = data },
  openUrl: async (url: string) => { window.alert(`The shell would open:\n${url}`); return { ok: true as const } },
  setView: async (patch: any) => { page.value = Number(patch.page) || 0; return { ok: true as const } },
  lifecycle: () => ({
    persistRef: (_key: string, initial: any) => ref(typeof initial === 'function' ? initial() : initial),
    keepInterval: () => () => {},
    onResume: () => () => {},
  }),
  settings: () => ({ values, onAction: () => () => {}, onChange: () => () => {} }),
  ui: () => ({ openPopover: () => null }),
}

createApp({
  setup() {
    return () => h(Widget, {
      placement: { context, size: { width, height, cols: 7, rows: 6 } },
      config: { view: { page: page.value } },
    })
  },
}).provide('widgetSdk', sdk).mount('#widget')
