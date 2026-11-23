<script setup lang="ts">
// GEM YT 0.2 (2026-11-22; 0.2.3: pictures in the order racks fill, racks read as they come into view, the wall and
// its plaque; 0.2.4: two feed racks first, Fresh from your subscriptions and You may like; pictures on their way shown;
// 0.2.5: the racks in the order their channels last posted, You may like without the channels you follow;
// 0.3.0: what it read is remembered between starts (memory.ts): racks drawn at once, read again behind them; each
// channel's uploads and subscribers kept over time, and a slow background survey of the channels not read yet;
// 0.3.1: posting rhythm on the posters (a chart, ~2/wk, Overdue), quiet channels put away at the aisle's end, a filter;
// 0.3.2: the aisle holds still while you look: quiet racks are put away when it's (re)arranged, and a reorder keeps
// the rack you went to, or the ones in view, where they were). Two modes, per copy (its state):
//   - GEM YT (racks): the store floor of library-ui 3.9.0 (shared/library-ui): one rack per channel you follow, its
//     poster on top (avatar, name, subscribers), its latest videos as DVD cases lying on their side. A click on a rack
//     opens its department; a click on a case plays the video (Standard mode, on its page). The data is YouTube's own
//     pages read by GEM Shell with this widget's rules (sdk.pageData('youtube'): rules/youtube.json; GEM Shell asks
//     once), pictures through GEM Shell's image cache (pageData().image).
//   - Standard: the real youtube.com in a web surface (0.1): back, forward, reload, home, sound, the ad blocking shield.
// Racks are filled as they come into view (GEM Shell paces the reads: one at a time, 8 s apart; 0.2.3: was the first 8
// only): the racks on screen and half a screen ahead, in the aisle's order; a rack scrolled past before its turn waits
// until it's seen again. A department is read when opened. GEM Shell keeps what it read (subscriptions 6 h, a
// channel's videos 1 h: the rules' `fresh`); ⟳ reads again.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { LibraryFloor, skinClass, skinStyle } from '@shared/library-ui'
import { BROADCAST } from './skin'
import { LEDGER_DOC, MEMORY_DOC, emptyLedger, lastUpload, makeMemory, rhythmOf, noteRead, noteSubscribers, noteSurvey, noteUploads, readLedger, readMemory, surveyNext } from './memory'
import { boxOf, captionOf, channelOf, channelParam, clock, feedShelfOf, FEEDS, isFeed, shelfOf, videoOf, type Channel, type PosterInfo, type Video, type YtVideo } from './racks'

const HOME = 'https://www.youtube.com/'
/** The pictures of every box a rack shows (its shelves x 3, measured; this until it is); a department: all of its own. */
const RACK_PICTURES = 15
const THUMB = { width: 320, height: 180 }
const AVATAR = { width: 96, height: 96 }

const sdk = inject<WidgetSdk>('widgetSdk')
const web = (sdk as any)?.web?.()
const yt = (sdk as any)?.pageData?.('youtube')
const settings = sdk?.settings?.()
const data = sdk?.instanceData?.()
const state = data?.live('state', () => ({ url: HOME, mode: 'racks' as Mode, filter: 'all' as Filter }))

type Mode = 'racks' | 'standard'
/** 0.3.1: which racks the aisle shows (per copy). */
type Filter = 'all' | 'active' | 'overdue' | 'quiet' | 'gems' | 'rising' | 'big' | 'unknown'
const mode = ref<Mode>('racks')

// ── Standard mode (0.1) ─────────────────────────────────────────────────────────────────────────────────────────────
const frame = ref<HTMLElement | null>(null)
const status = ref('')
const sound = ref<{ playing: boolean; muted: boolean }>({ playing: false, muted: false })
const shield = ref<{ page: number; on: boolean } | null>(null)
const mobile = ref(false)
let surface: any = null
const offs: Array<() => void> = []
let saveTimer: ReturnType<typeof setTimeout> | null = null

function isYouTube(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try { const h = new URL(url).hostname; return h === 'youtube.com' || h.endsWith('.youtube.com') } catch { return false }
}

function pagesSetting(): 'auto' | 'desktop' | 'mobile' {
  const v = settings?.values?.pages
  return v === 'desktop' || v === 'mobile' ? v : 'auto'
}

function save(patch: Partial<{ url: string; mode: Mode; filter: Filter }>) {
  if (!state) return
  state.value.value = { ...(state.value.value ?? { url: HOME }), ...patch }
  state.changed()
}

/** The copy's last YouTube page, saved a moment after it settles (not Google's sign-in pages). */
function remember(url: string) {
  if (!isYouTube(url)) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save({ url }), 1500)
}

async function openSurface(url: string) {
  if (surface || !web) return
  const s = await web.surface(frame.value!, { url, version: pagesSetting() })
  if (!s || s.ok === false) { status.value = `YouTube can’t be shown: ${s?.error ?? s?.reason}`; return }
  surface = s
  mobile.value = s.version === 'mobile'
  offs.push(s.onNavigate((u: string) => { remember(u); mobile.value = s.version === 'mobile' }))
  if (typeof s.blocked === 'number') {
    shield.value = { page: s.blocked, on: !!s.blocking }
    const off = s.onBlocked?.((b: { page: number; blocking: boolean }) => { shield.value = { page: b.page, on: b.blocking } })
    if (off) offs.push(off)
  }
  const offAudio = s.onAudio?.((a: { playing: boolean; muted: boolean }) => { sound.value = a })
  if (offAudio) offs.push(offAudio)
  const offSettings = settings?.onChange((_values: unknown, key: string | null) => { if (key === 'pages' || key === null) s.setVersion?.(pagesSetting()) })
  if (offSettings) offs.push(offSettings)
}

async function showStandard(url?: string) {
  mode.value = 'standard'
  save({ mode: 'standard' })
  await nextTick()
  if (!surface) await openSurface(url ?? (isYouTube(state?.value.value?.url) ? state!.value.value.url : HOME))
  else if (url) {
    const r = await surface.load(url)
    if (r && !r.ok) status.value = `Not loaded: ${r.error ?? r.reason}`
  }
}

function showRacks() {
  mode.value = 'racks'
  save({ mode: 'racks' })
  if (!readNow.has('subscriptions') && !problem.value && !loading.value) void loadChannels(false)
}

async function home() {
  const r = await surface?.load(HOME)
  if (r && !r.ok) status.value = `Not loaded: ${r.error ?? r.reason}`
}

async function showBlocking(ev: MouseEvent) {
  const r = await surface?.showBlocking?.(ev.currentTarget as HTMLElement)
  if (r && !r.ok) status.value = `No menu: ${r.error ?? r.reason}`
}

// ── GEM YT mode (0.2) ───────────────────────────────────────────────────────────────────────────────────────────────
const channels = ref<Channel[]>([])
/** channel id -> its videos (absent: not read yet) */
const videos = reactive(new Map<string, Video[]>())
/** picture address (the page's) -> GEM Shell's local one */
const pictures = reactive(new Map<string, string>())
/** 0.2.4: pictures that couldn't be made ("No picture", not a shimmer) */
const noPicture = reactive(new Set<string>())
/** 0.2.4: feed id -> its videos (YouTube's own lists: FEEDS) */
const feeds = reactive(new Map<string, Video[]>())
const loading = ref(false)
const activeId = ref<string | null>(null)
const reading = reactive(new Set<string>())
/** What stops the racks: the reason sdk.pageData gave, in words, and what can be done. */
const problem = ref<{ text: string; action?: 'standard' | 'retry' } | null>(null)
const floor = ref<{ jumpTo(id: string): void } | null>(null)
const racksEl = ref<HTMLElement | null>(null)
/** 0.3.0: racks and feeds read in this session (the others are remembered ones, read again as they're seen). */
const readNow = new Set<string>()
/** 0.3.0: pictures GEM Shell confirmed this session (a remembered one is shown at once, asked again once its rack is read). */
const verified = new Set<string>()
/** 0.3.0: what GEM YT learns about each channel over time (memory.ts); ledgerVersion bumps on each change. */
const ledger = shallowRef(emptyLedger())
const ledgerVersion = ref(0)
/** 0.3.0: the channel the background survey is reading (not "Stocking shelves…": nothing on screen waits for it). */
const surveyId = ref<string | null>(null)

const pic = (v: Video) => (v.thumbnail ? pictures.get(v.thumbnail) : undefined)
const coming = (v: Video) => !!v.thumbnail && !noPicture.has(v.thumbnail)
// 0.2.5: the racks in the order their channels last posted (newest first), from Fresh from your subscriptions (YouTube's
// own list of your subscriptions' latest videos) and the racks already read; channels seen in neither keep YouTube's
// order after them. Set once that list is read (and again on ⟳), not as each rack comes in: racks don't jump around.
const rackOrder = ref<Map<string, number> | null>(null)
const ordered = computed(() => {
  const order = rackOrder.value
  if (!order) return channels.value
  return [...channels.value].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
})
/** A channel by what a feed's video says of it: its id, else its handle, else its name. */
const followed = computed(() => {
  const ids = new Map<string, Channel>(), handles = new Map<string, Channel>(), names = new Map<string, Channel>()
  for (const c of channels.value) {
    ids.set(c.id, c)
    if (c.handle) handles.set(c.handle.toLowerCase(), c)
    names.set(c.name.toLowerCase(), c)
  }
  return (v: Video): Channel | undefined =>
    (v.channelId && ids.get(v.channelId)) || (v.channelHandle && handles.get(v.channelHandle.toLowerCase())) || (v.channelName && names.get(v.channelName.toLowerCase())) || undefined
})
const time = (iso: string | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : undefined }

function orderRacks() {
  const latest = new Map<string, number>()
  const feed = feeds.get('feed:subscriptions') ?? []
  // The feed is newest first: a video without a date counts as just after the one before it
  let last = Date.now()
  for (const v of feed) {
    const t = time(v.published) ?? last
    last = t
    const c = followed.value(v)
    if (c && !(latest.get(c.id)! >= t)) latest.set(c.id, t)
  }
  for (const [id, list] of videos) {
    const t = list.map(v => time(v.published)).find((x): x is number => x !== undefined)
    if (t !== undefined && !(latest.get(id)! >= t)) latest.set(id, t)
  }
  // 0.3.0: and what the ledger knows (channels read in earlier sessions, or by the survey)
  for (const c of channels.value) {
    const t = lastUpload(ledger.value, c.id)
    if (t !== undefined && !(latest.get(c.id)! >= t)) latest.set(c.id, t)
  }
  const ranked = channels.value.filter(c => latest.has(c.id)).sort((a, b) => latest.get(b.id)! - latest.get(a.id)!)
  const order = new Map<string, number>()
  ranked.forEach((c, i) => order.set(c.id, i))
  channels.value.forEach((c, i) => { if (!order.has(c.id)) order.set(c.id, ranked.length + i) })
  rackOrder.value = order
  settleAisle()
  void nextTick(() => requestAnimationFrame(stockVisible))
}

// ── 0.3.1: what the ledger says of each channel: its rhythm, quiet (put away), overdue; the filter ──────────────────
const MONTH_MS = 30.44 * 24 * 3600_000
/** "Quiet after" (Settings): months without a video. */
const quietMs = computed(() => (Number(settings?.values?.quietAfter) || 6) * MONTH_MS)
/** Now, a little coarse (every 10 min): enough for "3d ago". */
const now = ref(Date.now())
const nowTimer = setInterval(() => { now.value = Date.now() }, 600_000)
type Info = PosterInfo & { quiet: boolean; overdue: boolean }
const infos = computed(() => {
  void ledgerVersion.value
  const out = new Map<string, Info>()
  for (const c of channels.value) {
    const r = rhythmOf(ledger.value.channels[c.id], now.value)
    const latest = r.last ?? videos.get(c.id)?.map(v => time(v.published)).find((t): t is number => t !== undefined)
    const quiet = latest !== undefined && now.value - latest > quietMs.value
    const overdue = r.overdue && !quiet
    const months = latest !== undefined ? Math.floor((now.value - latest) / MONTH_MS) : 0
    out.set(c.id, {
      latest, perWeek: quiet ? undefined : r.perWeek, bars: quiet ? undefined : r.bars, quiet, overdue, dim: quiet,
      flag: quiet ? (months >= 24 ? `Quiet ${Math.floor(months / 12)} yr` : `Quiet ${months} mo`) : overdue ? 'Overdue' : undefined,
    })
  }
  return out
})
const filter = ref<Filter>('all')
const passes = (c: Channel, f: Filter): boolean => {
  const i = infos.value.get(c.id)
  const subs = c.subscribers
  switch (f) {
    case 'all': return true
    case 'active': return !!i && i.latest !== undefined && !i.quiet
    case 'overdue': return !!i?.overdue
    case 'quiet': return !!i?.quiet
    case 'gems': return subs !== undefined && subs < 10_000
    case 'rising': return subs !== undefined && subs >= 10_000 && subs < 250_000
    case 'big': return subs !== undefined && subs >= 250_000
    case 'unknown': return !i || i.latest === undefined
  }
}
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All channels' },
  { value: 'active', label: 'Posting' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'quiet', label: 'Gone quiet' },
  { value: 'gems', label: 'Hidden gems (under 10K)' },
  { value: 'rising', label: 'Rising (10K to 250K)' },
  { value: 'big', label: 'Big (250K and up)' },
  { value: 'unknown', label: 'Not known yet' },
]
const filterCounts = computed(() => new Map(FILTERS.map(f => [f.value, channels.value.filter(c => passes(c, f.value)).length])))
function setFilter(ev: Event) {
  filter.value = (ev.target as HTMLSelectElement).value as Filter
  save({ filter: filter.value })
  anchorId = null
  settleAisle()
  activeId.value = null
  void nextTick(() => requestAnimationFrame(stockVisible))
}
// 0.3.2 (Guillaume: a channel picked in the list, then its rack moved away as the racks around it were read and it
// turned out quiet): which racks are put away is settled when the aisle is arranged (the last session's at start, the
// subscriptions feed's order, ⟳, the filter, the setting), not each time the ledger learns something. A rack found
// quiet meanwhile fades where it stands.
const putAway = ref(new Set<string>())
function settleAisle() {
  putAway.value = new Set([...infos.value].filter(([, i]) => i.quiet).map(([id]) => id))
}
watch(quietMs, settleAisle)
/** The aisle: the racks' order, the put away ones at its end (the back room), as the filter says. */
const aisle = computed(() => {
  const list = ordered.value.filter(c => passes(c, filter.value))
  return [...list.filter(c => !putAway.value.has(c.id)), ...list.filter(c => putAway.value.has(c.id))]
})

// 0.3.2: when the aisle does change order, what you're looking at stays put: the rack you went to (from the list,
// until you scroll yourself), else the first rack in view, at the same place on screen.
let anchorId: string | null = null
let held: { id: string; left: number } | null = null
const aisleGrid = () => racksEl.value?.querySelector<HTMLElement>('.glu-floor-rack-grid') ?? null
const rackEl = (grid: HTMLElement, id: string) => grid.querySelector<HTMLElement>(`[data-shelf-id="${CSS.escape(id)}"]`)
watch(() => aisle.value.map(c => c.id).join('|'), () => {
  const grid = aisleGrid()
  held = null
  if (!grid || anchorId) return
  const view = grid.getBoundingClientRect()
  for (const el of grid.querySelectorAll<HTMLElement>('[data-shelf-id]')) {
    const r = el.getBoundingClientRect()
    if (r.right > view.left + 1) { held = { id: el.dataset.shelfId!, left: r.left - view.left }; break }
  }
}, { flush: 'pre' })
watch(() => aisle.value.map(c => c.id).join('|'), () => {
  const grid = aisleGrid()
  if (!grid) return
  if (anchorId) {
    const el = rackEl(grid, anchorId)
    if (el) grid.scrollTo({ left: Math.max(0, el.offsetLeft - (grid.clientWidth - el.offsetWidth) / 2), behavior: 'auto' })
  } else if (held) {
    const el = rackEl(grid, held.id)
    if (el) grid.scrollLeft += el.getBoundingClientRect().left - grid.getBoundingClientRect().left - held.left
  }
  held = null
  requestAnimationFrame(stockVisible)
}, { flush: 'post' })
/** You scrolled the aisle yourself: nothing is held any more. */
function letGo() { anchorId = null }
function shelfFor(c: Channel) {
  const list = videos.get(c.id)
  const boxes = list?.map((v, i) => boxOf(v, c, i, pic(v), coming(v)))
  return shelfOf(c, boxes, c.avatar ? pictures.get(c.avatar) : undefined, infos.value.get(c.id))
}
const shelves = computed(() => aisle.value.map(shelfFor))
// 0.2.5: You may like without the channels you follow (YouTube's recommendations, past your subscriptions)
const feedVideos = (id: string) => {
  const list = feeds.get(id)
  return list && id === 'feed:home' ? list.filter(v => !followed.value(v)) : list
}
const featuredShelves = computed(() => filter.value !== 'all' ? [] : FEEDS.map(f => feedShelfOf(f, feedVideos(f.id)?.map((v, i) => boxOf(v, null, i, pic(v), coming(v))))))
/** The channel list in the bar: A to Z (200+ channels). */
const byName = computed(() => [...channels.value].sort((a, b) => a.name.localeCompare(b.name)))
const activeShelf = computed(() => {
  const id = activeId.value
  if (!id) return null
  if (isFeed(id)) return featuredShelves.value.find(s => s.id === id) ?? null
  const c = channels.value.find(x => x.id === id)
  return c ? shelfFor(c) : null
})
const surfaceStyle = skinStyle(BROADCAST)
const surfaceClass = skinClass(BROADCAST)

function explain(r: { reason: string; error?: string }): { text: string; action?: 'standard' | 'retry' } {
  switch (r.reason) {
    case 'declined': return { text: 'GEM YT needs your permission to read your YouTube pages (GEM Shell asks: Try again).', action: 'retry' }
    case 'no-data': return { text: 'YouTube gave no data: you may be signed out. Sign in in Standard mode, then come back.', action: 'standard' }
    case 'needs-update': return { text: 'YouTube changed its pages: GEM YT’s rules need an update. Standard mode still works.', action: 'standard' }
    case 'busy': return { text: 'GEM Shell read YouTube many times today: try again tomorrow, or use Standard mode.', action: 'standard' }
    case 'not-declared': return { text: 'This GEM Shell can’t use GEM YT’s rules (the console says why).', action: 'standard' }
    default: return { text: `YouTube couldn’t be read (${r.error ?? r.reason}).`, action: 'retry' }
  }
}

// Pictures: 4 at a time (GEM Shell's image workers), the most wanted first. CHANGED (0.2.3): a FIFO had every
// channel's avatar (all of them, asked when the subscriptions came) ahead of the first rack's covers, so the covers
// waited for the whole list and came in all at once at the end. Now: OPEN (the department open) before RACK (a rack
// in view: its covers and its avatar) before LATER (anything else); in the order asked within each.
const OPEN = 0, RACK = 1, LATER = 2
const queue: Array<{ url: string; size: { width: number; height: number }; prio: number; n: number }> = []
let asked = 0
let running = 0
function picture(url: string | undefined, size: { width: number; height: number }, prio = LATER) {
  if (!url || verified.has(url) || noPicture.has(url)) return
  const q = queue.find(x => x.url === url)
  if (q) { if (prio < q.prio) { q.prio = prio; q.n = asked++ } return }
  queue.push({ url, size, prio, n: asked++ })
  pump()
}
let warned = 0
function pump() {
  while (running < 4 && queue.length) {
    let best = 0
    for (let i = 1; i < queue.length; i++)
      if (queue[i].prio < queue[best].prio || queue[i].prio === queue[best].prio && queue[i].n < queue[best].n) best = i
    const { url, size } = queue.splice(best, 1)[0]
    running++
    yt.image(url, size).then((r: any) => {
      if (r?.ok) { verified.add(url); if (pictures.get(url) !== r.url) { pictures.set(url, r.url); saveSoon() } }
      // A remembered picture of a rack not read yet this session: GEM Shell hands out only what it read; asked again later
      else if (r?.reason === 'not-from-page') return
      else {
        noPicture.add(url)
        pictures.delete(url)
        if (warned++ < 3) console.warn('[GEM YT] picture not made:', url, r)
      }
    })
      .catch(() => { })
      .finally(() => { running--; pump() })
  }
}

async function loadChannels(fresh: boolean) {
  if (!yt) { problem.value = { text: 'This GEM Shell has no page data yet: update GEM Shell, or use Standard mode.', action: 'standard' }; return }
  loading.value = true
  problem.value = null
  const r = await yt.read('subscriptions', {}, { fresh })
  loading.value = false
  if (!r.ok) { problem.value = explain(r); return }
  channels.value = (r.items.channel ?? []).map(channelOf).filter(Boolean) as Channel[]
  if (!channels.value.length) { problem.value = { text: 'You follow no channel yet (or YouTube showed none).', action: 'standard' }; return }
  noteSubscribers(ledger.value, channels.value, Date.now())
  ledgerChanged()
  // 0.3.0: ⟳ keeps what's shown (remembered) and reads every rack again as it's seen
  if (fresh) { readNow.clear(); noPicture.clear(); refreshing = true; refreshed.clear() }
  readNow.add('subscriptions')
  // 0.2.3: the racks in view (and their avatars), one after another as GEM Shell paces them
  await nextTick()
  requestAnimationFrame(stockVisible)
}

/** A channel's latest videos (and the pictures of its first `pictures` ones; all: -1), at priority `prio`. */
async function loadVideos(c: Channel, fresh: boolean, pictureCount = -1, prio = OPEN) {
  if (reading.has(c.id)) return
  const param = channelParam(c)
  if (!param) { videos.set(c.id, []); readNow.add(c.id); return }
  if (!readNow.has(c.id) || fresh) {
    reading.add(c.id)
    const r = await yt.read('channel-videos', { channel: param }, { fresh })
    reading.delete(c.id)
    if (!r.ok) {
      if (r.reason === 'declined' || r.reason === 'busy') { problem.value = explain(r); return }
      readNow.add(c.id)
      if (!videos.has(c.id)) videos.set(c.id, [])
      return
    }
    const list = (r.items.video ?? []).map(videoOf).filter(Boolean) as Video[]
    readNow.add(c.id)
    videos.set(c.id, list)
    noteRead(ledger.value, c.id, list, Date.now())
    ledgerChanged()
    saveSoon()
  }
  const list = videos.get(c.id) ?? []
  picture(c.avatar, AVATAR, prio)
  for (const v of pictureCount < 0 ? list : list.slice(0, pictureCount)) picture(v.thumbnail, THUMB, prio)
}

/** 0.2.4: a feed rack's videos (YouTube's own list) and the pictures of its first `pictureCount` (all: -1). */
async function loadFeed(id: string, fresh: boolean, pictureCount = -1, prio = OPEN) {
  const feed = FEEDS.find(f => f.id === id)
  if (!feed || reading.has(id)) return
  if (!readNow.has(id) || fresh) {
    reading.add(id)
    const r = await yt.read(feed.page, {}, { fresh })
    reading.delete(id)
    if (!r.ok) {
      if (r.reason === 'declined' || r.reason === 'busy') { problem.value = explain(r); return }
      console.warn(`[GEM YT] ${feed.title}: not read (${r.reason})`, r.error ?? '', r.problems ?? '')
      readNow.add(id)
      if (!feeds.has(id)) feeds.set(id, [])
      return
    }
    const list = (r.items.video ?? []).map(videoOf).filter(Boolean) as Video[]
    readNow.add(id)
    feeds.set(id, list)
    if (id === 'feed:subscriptions') {
      // 0.3.0: the feed's videos are uploads of your channels: the ledger learns them without reading each channel
      const byChannel = new Map<string, Video[]>()
      for (const v of list) { const c = followed.value(v); if (c) byChannel.set(c.id, [...(byChannel.get(c.id) ?? []), v]) }
      for (const [cid, vs] of byChannel) noteUploads(ledger.value, cid, vs)
      ledgerChanged()
      orderRacks()
    }
    saveSoon()
  }
  const list = feedVideos(id) ?? []
  for (const v of pictureCount < 0 ? list : list.slice(0, pictureCount)) picture(v.thumbnail, THUMB, prio)
}

// ── Racks in view (0.2.3) ─────────────────────────────────────────────────────────────────────────────────────────
// 200+ subscriptions: reading every rack (8 s each) would take half an hour and most of the day's 300 reads. Only the
// racks the aisle shows, plus half a screen ahead, are read and pictured; scrolling brings the next ones.
let wanted: string[] = []
let boxesFor = new Map<string, number>()
let readsRunning = false
/** ⟳ on the aisle: each rack read again (not from GEM Shell's cache) the first time it's seen after. */
let refreshing = false
const refreshed = new Set<string>()

/** The racks in the aisle's view (and half a screen to its right), in the aisle's order; with their shelf counts. */
function racksInView(): Array<{ id: string; boxes: number }> {
  const grid = racksEl.value?.querySelector<HTMLElement>('.glu-floor-rack-grid')
  if (!grid) return []
  const view = grid.getBoundingClientRect()
  const ahead = view.width / 2
  const out: Array<{ id: string; boxes: number }> = []
  for (const el of grid.querySelectorAll<HTMLElement>('[data-shelf-id]')) {
    const r = el.getBoundingClientRect()
    if (r.right < view.left || r.left > view.right + ahead) continue
    const shelves = el.querySelectorAll('.glu-floor-rack-shelf').length
    out.push({ id: el.dataset.shelfId!, boxes: shelves ? shelves * 3 : RACK_PICTURES })
  }
  return out
}

/** The racks in view: their avatars asked first, then their videos read (one at a time) and their covers asked. */
function stockVisible() {
  if (mode.value !== 'racks' || activeId.value || !channels.value.length) return
  const seen = racksInView()
  if (!seen.length) return
  const byId = new Map(channels.value.map(c => [c.id, c]))
  wanted = []
  for (const { id, boxes } of seen) {
    // 0.3.0: a remembered rack shows what it had; its pictures are asked once it's read again this session
    if (isFeed(id)) {
      if (readNow.has(id)) for (const v of (feedVideos(id) ?? []).slice(0, boxes)) picture(v.thumbnail, THUMB, RACK)
      else wanted.push(id)
      continue
    }
    const c = byId.get(id)
    if (!c) continue
    picture(c.avatar, AVATAR, RACK)
    if (readNow.has(id)) for (const v of (videos.get(id) ?? []).slice(0, boxes)) picture(v.thumbnail, THUMB, RACK)
    else wanted.push(id)
  }
  boxesFor = new Map(seen.map(s => [s.id, s.boxes]))
  void runReads()
}

async function runReads() {
  if (readsRunning) return
  readsRunning = true
  try {
    for (;;) {
      if (problem.value) break
      const id = wanted.find(x => !readNow.has(x) && !reading.has(x))
      if (!id) break
      const fresh = refreshing && !refreshed.has(id)
      refreshed.add(id)
      if (isFeed(id)) { await loadFeed(id, fresh, boxesFor.get(id) ?? RACK_PICTURES, RACK); continue }
      const c = channels.value.find(x => x.id === id)
      if (!c) { wanted = wanted.filter(x => x !== id); continue }
      await loadVideos(c, fresh, boxesFor.get(c.id) ?? RACK_PICTURES, RACK)
    }
  } finally { readsRunning = false }
}

let viewFrame = 0
function onAisleMoved() {
  if (viewFrame) return
  viewFrame = requestAnimationFrame(() => { viewFrame = 0; stockVisible() })
}
let resizeObs: ResizeObserver | null = null
watch([activeId, mode], () => { void nextTick(() => requestAnimationFrame(stockVisible)) })

async function selectShelf(id: string) {
  activeId.value = id
  if (isFeed(id)) { await loadFeed(id, false, -1, OPEN); return }
  const c = channels.value.find(x => x.id === id)
  if (c) await loadVideos(c, false, -1, OPEN)
}

function play(item: YtVideo) {
  void showStandard(`https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`)
}

function jump(ev: Event) {
  const select = ev.target as HTMLSelectElement
  const id = select.value
  select.value = ''
  if (!id) return
  activeId.value = null
  // 0.3.1: a channel the filter hides: the filter goes back to all
  const c = channels.value.find(x => x.id === id)
  if (c && !passes(c, filter.value)) { filter.value = 'all'; save({ filter: 'all' }) }
  anchorId = id
  void nextTick(() => floor.value?.jumpTo(id))
}

/** ⟳: the open department read again, or the aisle (its racks again as they're seen). */
function reloadHere() {
  const id = activeId.value
  if (!id) { void loadChannels(true); return }
  if (isFeed(id)) { void loadFeed(id, true, -1, OPEN); return }
  const c = channels.value.find(x => x.id === id)
  if (c) void loadVideos(c, true)
}

function retry() { problem.value = null; void loadChannels(false) }

// ── Memory (0.3.0): memory.ts ────────────────────────────────────────────────────────────────────────────────────
const canSave = !(sdk as any)?.inPreview?.()
const stocking = computed(() => [...reading].some(id => id !== surveyId.value))
let saveTimer2: ReturnType<typeof setTimeout> | null = null
let ledgerTimer: ReturnType<typeof setTimeout> | null = null

function ledgerChanged() {
  ledgerVersion.value++
  if (!canSave || ledgerTimer) return
  ledgerTimer = setTimeout(() => { ledgerTimer = null; void saveLedger() }, 5000)
}
async function saveLedger() {
  if (canSave) await sdk?.configWrite?.(LEDGER_DOC, ledger.value).catch(err => console.warn('[GEM YT] ledger not saved', err))
}
function saveSoon() {
  if (!canSave || saveTimer2) return
  saveTimer2 = setTimeout(() => { saveTimer2 = null; void saveMemory() }, 4000)
}
async function saveMemory() {
  if (!canSave || !channels.value.length) return
  const mem = makeMemory(channels.value, ordered.value.map(c => c.id), videos, feeds, pictures, Date.now())
  await sdk?.configWrite?.(MEMORY_DOC, mem).catch(err => console.warn('[GEM YT] racks not remembered', err))
}

/** The last session's racks, drawn at once (before anything is read). */
async function loadMemory() {
  const [rawMem, rawLedger] = await Promise.all([
    sdk?.configRead?.(MEMORY_DOC).catch(() => null) ?? null,
    sdk?.configRead?.(LEDGER_DOC).catch(() => null) ?? null,
  ])
  ledger.value = readLedger(rawLedger)
  ledgerVersion.value++
  const mem = readMemory(rawMem)
  if (!mem || channels.value.length) return
  channels.value = mem.channels
  for (const [id, list] of Object.entries(mem.videos)) videos.set(id, list)
  for (const [id, list] of Object.entries(mem.feeds)) feeds.set(id, list)
  for (const [from, to] of Object.entries(mem.pictures)) pictures.set(from, to)
  if (mem.order.length) rackOrder.value = new Map(mem.order.map((id, i) => [id, i]))
  settleAisle()
}

// The background survey: a channel never read (or not for a week) every SURVEY_GAP_MS while GEM YT is open on its
// racks and nothing else is read, in the aisle's order, at most memory.ts's SURVEY_PER_DAY a day. No pictures.
const SURVEY_GAP_MS = 45_000
let surveyTimer: ReturnType<typeof setInterval> | null = null
async function surveyOne() {
  if (mode.value !== 'racks' || problem.value || readsRunning || reading.size || loading.value || !yt) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const now = Date.now()
  const id = surveyNext(ledger.value, ordered.value.map(c => c.id), x => readNow.has(x) || !channelParam(channels.value.find(c => c.id === x)!), now)
  const c = id ? channels.value.find(x => x.id === id) : undefined
  if (!c) return
  noteSurvey(ledger.value, now)
  surveyId.value = c.id
  try { await loadVideos(c, false, 0, LATER) } finally { surveyId.value = null }
}

// ── Life ────────────────────────────────────────────────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!web) { status.value = 'GEM Shell can’t show web pages here.' }
  await state?.ready.catch(() => { })
  await settings?.ready.catch(() => { })
  // 0.2.3: the aisle's scroll (caught on the way down: scroll doesn't bubble) and size bring racks into view
  racksEl.value?.addEventListener('scroll', onAisleMoved, { capture: true, passive: true })
  // 0.3.2: the wheel, a drag, the aisle's arrows, a key: you're moving the aisle yourself
  for (const ev of ['wheel', 'pointerdown', 'keydown'] as const) racksEl.value?.addEventListener(ev, letGo, { capture: true, passive: true })
  resizeObs = new ResizeObserver(onAisleMoved)
  if (racksEl.value) resizeObs.observe(racksEl.value)
  mode.value = state?.value.value?.mode === 'standard' || !yt ? 'standard' : 'racks'
  const f = state?.value.value?.filter
  if (f && FILTERS.some(x => x.value === f)) filter.value = f
  if (yt) await loadMemory()
  if (mode.value === 'standard') await showStandard()
  else void loadChannels(false)
  if (yt) surveyTimer = setInterval(() => { void surveyOne() }, SURVEY_GAP_MS)
})

onBeforeUnmount(() => {
  for (const off of offs) off()
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  queue.length = 0
  wanted = []
  if (surveyTimer) clearInterval(surveyTimer)
  clearInterval(nowTimer)
  // 0.3.0: what's pending is saved now
  if (saveTimer2) { clearTimeout(saveTimer2); saveTimer2 = null; void saveMemory() }
  if (ledgerTimer) { clearTimeout(ledgerTimer); ledgerTimer = null; void saveLedger() }
  racksEl.value?.removeEventListener('scroll', onAisleMoved, { capture: true })
  for (const ev of ['wheel', 'pointerdown', 'keydown'] as const) racksEl.value?.removeEventListener(ev, letGo, { capture: true })
  resizeObs?.disconnect()
  if (viewFrame) cancelAnimationFrame(viewFrame)
  state?.release()
  surface?.dispose()
})
</script>

<template>
  <div class="gem-yt">
    <div class="bar">
      <template v-if="mode === 'standard'">
        <button @click="surface?.back()" title="Back">‹</button>
        <button @click="surface?.forward()" title="Forward">›</button>
        <button @click="surface?.reload()" title="Reload">⟳</button>
        <button @click="home" title="YouTube’s home">⌂</button>
        <span class="spacer"></span>
        <span v-if="mobile" class="badge" title="YouTube’s mobile site (the widget is narrow; Settings: always desktop)">📱</span>
        <button v-if="sound.playing || sound.muted" @click="surface?.mute?.(!sound.muted)"
                :title="sound.muted ? 'Sound off: turn it on' : 'Playing: turn the sound off'">{{ sound.muted ? '🔇' : '🔊' }}</button>
        <button v-if="shield" class="shield" :class="{ off: !shield.on }" @click="showBlocking"
                :title="shield.on ? `${shield.page} ads and trackers blocked on this page` : 'Ad blocking is off here'">
          🛡 {{ shield.on ? shield.page : 'off' }}
        </button>
        <button v-if="yt" class="mode" @click="showRacks" title="GEM YT mode: your channels on racks">▦ Racks</button>
      </template>
      <template v-else>
        <button v-if="activeShelf" @click="activeId = null" title="All your channels">‹ Channels</button>
        <label v-if="channels.length" class="glu-picker pick" title="Go to a channel’s rack">
          <span>▦</span>
          <select :value="''" @change="jump">
            <option value="" disabled>Channels</option>
            <option v-for="c in byName" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label v-if="channels.length && !activeShelf" class="glu-picker pick" title="Which racks the aisle shows">
          <span>⚲</span>
          <select :value="filter" @change="setFilter">
            <option v-for="f in FILTERS" :key="f.value" :value="f.value">{{ f.label }} ({{ filterCounts.get(f.value) ?? 0 }})</option>
          </select>
        </label>
        <span class="spacer"></span>
        <span v-if="loading || stocking" class="hint">Stocking shelves…</span>
        <button @click="reloadHere"
                :disabled="loading || stocking" title="Read YouTube again">⟳</button>
        <button class="mode" @click="showStandard()" title="Standard mode: YouTube’s own pages">▶ YouTube</button>
      </template>
    </div>
    <div v-if="status && mode === 'standard'" class="status">{{ status }}</div>

    <div v-show="mode === 'racks'" ref="racksEl" class="racks gem-library-surface" :class="surfaceClass" :style="surfaceStyle">
      <div v-if="problem" class="note">
        <p>{{ problem.text }}</p>
        <button v-if="problem.action === 'retry'" @click="retry">Try again</button>
        <button v-if="problem.action === 'standard'" @click="showStandard()">Standard mode</button>
      </div>
      <div v-else-if="loading && !channels.length" class="note"><p>Stocking shelves…</p></div>
      <LibraryFloor
        v-else
        ref="floor"
        variant="video"
        items-noun="videos"
        :shelves="shelves"
        :featured="featuredShelves"
        :active-shelf="activeShelf"
        :caption="captionOf"
        @select-shelf="selectShelf"
        @open="play"
      >
        <template #intro>
          <!-- 0.2.3: the wall over the aisle, with GEM YT's plaque (our own emblem, not YouTube's logo) -->
          <div class="wall">
            <div class="plaque" role="img" :aria-label="`GEM YT: ${channels.length} channels`">
              <span class="plaque-plate">
                <span class="plaque-emblem" aria-hidden="true"><i></i></span>
                <span class="plaque-copy">
                  <span class="plaque-word">GEM<b>YT</b></span>
                  <span class="plaque-line">Presented for following {{ channels.length }} {{ channels.length === 1 ? 'channel' : 'channels' }}</span>
                </span>
              </span>
            </div>
          </div>
        </template>
        <template #marks="{ item }">
          <span v-if="item.live" class="sticker live">● LIVE</span>
          <span v-else-if="item.length" class="sticker">{{ clock(item.length) }}</span>
          <span v-if="item.watched" class="watched" :style="{ width: `${item.watched}%` }"></span>
        </template>
      </LibraryFloor>
    </div>
    <div v-show="mode === 'standard'" ref="frame" class="frame"></div>
  </div>
</template>

<style scoped>
.gem-yt { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bar { display: flex; align-items: center; gap: 4px; padding: 4px; flex: 0 0 auto; }
.bar button { min-width: 2em; }
.pick { height: 26px; min-width: 120px; }
/* 0.2.4: the bar is outside the skinned surface (no --glu-* colours there): the list's own, dark */
.pick select { color: #f1f1f3; color-scheme: dark; }
.pick option { color: #f1f1f3; background: #1b1c21; }
.hint { font-size: 11px; opacity: .7; padding: 0 4px; }
.spacer { flex: 1 1 auto; }
.badge { opacity: 0.7; padding: 0 2px; }
.status { font-size: 12px; padding: 2px 6px; opacity: 0.8; flex: 0 0 auto; }
.frame { flex: 1 1 auto; min-height: 0; position: relative; }
.shield { min-width: 3.5em; font-variant-numeric: tabular-nums; }
.shield.off { opacity: 0.6; }
.racks { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 17px 34px; container-type: inline-size; }
.note { display: grid; gap: 10px; justify-items: center; max-width: 420px; margin: 18% auto 0; text-align: center; }
.note p { margin: 0; }
.sticker { position: absolute; z-index: 4; right: 4px; bottom: 4px; padding: 1px 4px; border-radius: 3px; color: #fff; background: #000c; font: 700 9px/1.3 "Segoe UI", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.sticker.live { background: #d61f1f; }
/* 0.2.3: the wall and its plaque: a shadow-box frame, a glass front, a brushed silver plate. The type: a heavy grotesque
   (Segoe UI Black on Windows), tight like a broadcaster's wordmark. */
.wall { position: relative; display: flex; align-items: center; justify-content: center; height: clamp(92px, 10cqw, 136px); margin: -10px -8px 4px;
  background: radial-gradient(ellipse 38% 90% at 50% -10%, #ffffff1f, transparent 70%), repeating-linear-gradient(90deg, #0000 0 46px, #0000003d 46px 48px), linear-gradient(#24171b, #140d10 88%, #0c0809);
  box-shadow: inset 0 -12px 16px -12px #000, 0 1px 0 #ffffff0d; }
.plaque { position: relative; height: 76%; aspect-ratio: 3.1; padding: 5px; border-radius: 4px;
  background: linear-gradient(150deg, #34343a, #101013 45%, #1d1d22); box-shadow: 0 14px 20px -6px #000d, 0 0 0 1px #000, inset 0 1px 0 #ffffff26, inset 0 -1px 0 #0009; }
.plaque::after { content: ''; position: absolute; inset: 5px; border-radius: 2px; pointer-events: none;
  background: linear-gradient(115deg, #ffffff00 30%, #ffffff1c 38%, #ffffff00 47%, #ffffff00 70%, #ffffff10 76%, #ffffff00 82%); box-shadow: inset 0 0 0 1px #ffffff14, inset 0 3px 8px #000c; }
.plaque-plate { display: flex; align-items: center; gap: 4%; height: 100%; padding: 0 7%; border-radius: 2px; background: radial-gradient(ellipse at 50% 0%, #26262b, #0b0b0d 75%); }
.plaque-emblem { flex: 0 0 auto; height: 70%; aspect-ratio: 1.08; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%);
  background: linear-gradient(135deg, #fbfbfc 0%, #b6b9c0 24%, #eff1f4 42%, #8b8e95 64%, #e2e4e8 82%, #a3a6ad 100%); display: grid; place-items: center; filter: drop-shadow(0 2px 2px #000); }
.plaque-emblem i { width: 46%; height: 50%; margin-left: 10%; clip-path: polygon(0 0, 0 100%, 90% 50%); background: linear-gradient(160deg, #2c2d31, #0f0f11); }
.plaque-copy { display: grid; gap: 3px; min-width: 0; }
.plaque-word { font: 900 clamp(22px, 4.6cqw, 46px)/0.9 "Segoe UI Black", "Arial Black", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.045em; white-space: nowrap;
  background: linear-gradient(175deg, #ffffff 0%, #c9ccd2 30%, #f3f4f6 48%, #8d9097 70%, #d9dbdf 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 1px 0 #000); }
.plaque-word b { margin-left: 0.12em; font-weight: inherit; }
.plaque-line { overflow: hidden; color: #b9bcc2; font: 600 clamp(7px, 0.85cqw, 10px)/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.16em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
.watched { position: absolute; z-index: 4; left: 0; bottom: 0; height: 3px; background: #ff3b3b; }
</style>
