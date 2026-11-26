<script setup lang="ts">
// GEM YT: YouTube in GEM Shell. History: CHANGELOG.md. Two modes, per copy (its state):
//   - Standard: the real youtube.com in a web surface (sdk.web()): back, forward, reload, home, sound, the ad blocking
//     shield. On a video's page, its parts in tiles (WatchTiles: page regions), or, in the sidebar, the compact player
//     (CompactTiles); in the toolbar, a strip whose panel shows the video or the list (ToolbarStrip, ToolbarPanel).
//     A job holds the page while GEM YT is hidden (its sound, the video in the tray's card, or paused).
//   - GEM YT: its own pages, from YouTube's pages read by GEM Shell with rules/youtube.json (sdk.pageData('youtube'):
//     GEM Shell asks once, paces the reads, caches pictures): Feed, Creators (your channels as tiles, filtered by tag
//     and Show), Discover (channels YouTube suggests or your channels feature), a channel's page.
// What it learns is kept between starts (core/memory.ts: the memory and the ledger); a slow background survey reads the
// channels not read yet. core/ is pure (no SDK, no Vue); parts/ are the pages and tiles.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
// 0.16.0: the placement (sidebar: the compact player)
const props = defineProps<{ placement?: { context?: string } }>()
import type { WidgetSdk } from 'gexplorer/widgets'
// 1.0 (0.10.0): the racks are gone; library-ui stays for its look (its stylesheet: the bar's pickers)
import '@shared/library-ui'
import { TAGS_DOC, addTag, readTags, tagNamed, toggleTag as toggleChannel } from './core/tags'
import { matches, parseKeywords, topicsOf } from './core/topics'
import { DEEP_CHANNELS, DEEP_KEEP, LEDGER_DOC, MEMORY_DOC, SURVEY_PER_DAY, emptyLedger, lastUpload, makeMemory, noteAbout, noteBanner, rhythmOf, noteRead, noteSubscribers, noteSurvey, noteUploads, readLedger, readMemory, surveyNext } from './core/memory'
import { DISCOVER_DOC, channelUrl, emptyDiscover, featuredNext, hiddenCount, hide as hideSuggested, hideFeaturedBy, noteFeatured, noteSuggested, readDiscover, suggested, unhideAll, type FeaturedChannel, type Suggested } from './core/discover'
import { agoShort, channelOf, channelParam, compact, FEEDS, rateText, videoOf, type Channel, type PosterInfo, type Video } from './core/items'
import CreatorsPart from './parts/CreatorsPart.vue'
import WatchTiles from './parts/WatchTiles.vue'
import CompactTiles from './parts/CompactTiles.vue'
import { readCompact, type CompactSaved } from './parts/compactState'   // 0.20.0
import ToolbarStrip from './parts/ToolbarStrip.vue'   // 0.18.0
import ToolbarPanel from './parts/ToolbarPanel.vue'
import { defaultLayoutFor, isWatchUrl, LAYOUT_SIZES, readLayout, sizeFor, type LayoutSize, type WatchLayout } from './core/watchLayout'
import DiscoverPart from './parts/DiscoverPart.vue'
import type { CreatorCard, DiscoverCard, FeedSection, VideoCard } from './parts/cards'
import FeedPart from './parts/FeedPart.vue'
import ChannelVideosPart from './parts/ChannelVideosPart.vue'
import Ribbon from './parts/Ribbon.vue'
import { hubSteps } from './parts/hubGrid'
import { useToolbar } from './use/toolbar'
import { useNowPlaying } from './use/nowPlaying'
import { useWatchJob } from './use/watchJob'
import { useVotes } from './use/votes'
import { useEncourage } from './use/encourage'
import { useTags } from './use/tags'

const HOME = 'https://www.youtube.com/'
const THUMB = { width: 320, height: 180 }
const AVATAR = { width: 96, height: 96 }
/** 0.4.0: a banner on a Creators tile (YouTube's are 6.2 : 1) */
const BANNER = { width: 640, height: 104 }

const sdk = inject<WidgetSdk>('widgetSdk')
const web = (sdk as any)?.web?.()
const yt = (sdk as any)?.pageData?.('youtube')
const settings = sdk?.settings?.()
const data = sdk?.instanceData?.()
const state = data?.live('state', () => ({ url: HOME, mode: 'feed' as Mode, page: 'feed' as Page, filter: 'all' as Filter, aisle: null as string | null, picked: [] as string[], sortBy: 'latest' as SortBy, tiles: true, watchLayout: null as unknown, watchLayouts: null as unknown, sizesTold: [] as string[], ribbon: 'banner' as RibbonLook, ribbonPicture: null as RibbonPicture | null, ribbonChannel: null as string | null, barFolded: false, compact: null as unknown }))

/** 0.7.0: the header ribbon's look (per copy), and your own picture for it (a persistent picture GEM Shell made) */
type RibbonLook = 'banner' | 'picture' | 'theme' | 'off'
type RibbonPicture = { assetId: string; url: string }
/** 0.4.0: GEM YT's pages (the GEM parts), and Standard mode (YouTube's own site). 1.0 (0.10.0): the racks are gone. */
type Page = 'feed' | 'creators' | 'discover'
/** 0.9.0: 'channel', a channel's videos (from a page: not kept, ‹ goes back to it) */
type Mode = Page | 'standard' | 'channel'
const PAGES: Array<{ value: Page; label: string; title: string }> = [
  // 1.0, part 2: Feed first (what's new for you)
  { value: 'feed', label: '☰ Feed', title: 'What’s new: since you were here, the latest from your channels, You may like' },
  { value: 'creators', label: '◉ Creators', title: 'Your channels as tiles: their rhythm, topics and tags' },
  { value: 'discover', label: '✦ Discover', title: 'Channels YouTube keeps suggesting that you don’t follow' },
]
const isPage = (v: unknown): v is Page => v === 'feed' || v === 'creators' || v === 'discover'
/** The page shown last (Standard mode's way back). */
const lastPage = ref<Page>('feed')
/** 0.3.7: the channels' order (per copy). */
type SortBy = 'latest' | 'name' | 'subsDown' | 'subsUp' | 'rate'
type Filter = 'all' | 'active' | 'overdue' | 'quiet' | 'dead' | 'gems' | 'rising' | 'big' | 'unknown' | 'encouraged' | `topic:${string}`
const mode = ref<Mode>('feed')

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
/**
 * 0.14.1: the version asked of YouTube. With ▤ Tiles on, 'auto' means desktop: the tiles are YouTube's desktop page's
 * parts (the rules' regions). A narrow widget (under 560 px) got the mobile page, whose parts the regions don't find:
 * the whole page showed under the tiles, and m.youtube.com's player paused itself. Mobile only when you choose it.
 */
function versionWanted(): 'auto' | 'desktop' | 'mobile' {
  const v = pagesSetting()
  return v === 'auto' && tilesOn.value ? 'desktop' : v
}

function save(patch: Partial<{ url: string; mode: Mode; page: Page; filter: Filter; aisle: string | null; picked: string[]; sortBy: SortBy; tiles: boolean; watchLayout: WatchLayout; watchLayouts: Partial<Record<LayoutSize, WatchLayout>>; sizesTold: string[]; ribbon: RibbonLook; ribbonPicture: RibbonPicture | null; ribbonChannel: string | null; barFolded: boolean; compact: CompactSaved }>) {
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
  // 0.15.0: the page kept by GEM YT's job (key "main") comes back as it is
  const s = await web.surface(frame.value!, { url, version: versionWanted(), key: 'main' })
  if (!s || s.ok === false) { status.value = `YouTube can’t be shown: ${s?.error ?? s?.reason}`; return }
  surface = s
  canPip.value = typeof s?.pip === 'function'   // 0.14.0
  mobile.value = s.version === 'mobile'
  currentUrl.value = s.url ?? url
  offs.push(s.onNavigate((u: string) => { remember(u); currentUrl.value = u; mobile.value = s.version === 'mobile' }))
  if (tilesOn.value && mode.value === 'standard') void watchNow()
  if (typeof s.blocked === 'number') {
    shield.value = { page: s.blocked, on: !!s.blocking }
    const off = s.onBlocked?.((b: { page: number; blocking: boolean; encouraged?: number; creatorEncouraged?: boolean }) => {
      shield.value = { page: b.page, on: b.blocking }
      // 0.8.0: GEM Shell's Encourage this creator: the count (the plaque) and whether this video's creator is one
      if (typeof b.encouraged === 'number') encouragedCount.value = b.encouraged
      creatorEncouraged.value = typeof b.creatorEncouraged === 'boolean' ? b.creatorEncouraged : null
    })
    if (off) offs.push(off)
  }
  const offAudio = s.onAudio?.((a: { playing: boolean; muted: boolean }) => { sound.value = a })
  if (offAudio) offs.push(offAudio)
  const offSettings = settings?.onChange((_values: unknown, key: string | null) => {
    if (key === 'pages' || key === null) s.setVersion?.(versionWanted())
    if (key === 'hidden' || key === null) syncJob()   // 0.15.0
  })
  syncJob()   // 0.15.0: a page taken back is held again at once
  // 0.14.1: ▤ Tiles on or off changes what 'auto' means
  offs.push(watch(tilesOn, () => { if (s.versionMode !== versionWanted()) s.setVersion?.(versionWanted()) }))
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

/** 0.4.0: a page of GEM YT (Feed, Creators, Discover). */
function showPage(p: Page) {
  mode.value = p
  lastPage.value = p
  save({ mode: p, page: p })
  if (!readNow.has('subscriptions') && !problem.value && !loading.value) void loadChannels(false)
  if (p === 'discover') void learnSuggestions(false)
  if (p === 'feed') loadFeeds(false)
  void readEncouraged()
}
function showPages() { showPage(lastPage.value) }

// ── 1.0, part 1: the watch page in tiles (parts/WatchTiles.vue, core/watchLayout.ts) ───────────────────────────
// On a /watch page (Standard mode's view), YouTube's page in tiles: the video, Up next, Comments | Description (tabs),
// and our Channel part, each tile where the copy's layout says (splitters, panels that fold: GEM Shell's gridPlace);
// YouTube's own parts placed there by GEM Shell (S2: sdk.web() surface.regions). Any other page (home, search, a
// channel): the whole page, as before. ▤ Tiles turns them off (kept per copy).
const tilesOn = ref(true)
/** 0.19.0: the bar above the video folded away (the toggle next to ⧉; only while the tiles show: else it stays) */
const barFolded = ref(false)
/** 0.20.0: the sidebar player's height, tab and ⤢, kept per copy */
const compactSaved = ref<CompactSaved>(readCompact(null))
function keepCompact(c: CompactSaved) { compactSaved.value = c; save({ compact: c }) }
// What the page shows now, picture in picture, the next video (use/nowPlaying.ts)
const { nowInfo, media, owner, watchNow, stopWatching, nowWhat, nowState, nowLine, pipOn, canPip, pipState, togglePip, nextUrl, playNext } =
  useNowPlaying({ surface: () => surface, snack })

// The video outlives GEM YT: a job holds the page (use/watchJob.ts)
const { syncJob } = useWatchJob({ sdk, surface: () => surface, settings: () => settings?.values, standard: () => mode.value === 'standard', nowInfo, pipOn })
/** The hub grid's columns and rows (the tiles' steps) */
const hubGrid = hubSteps(sdk)
const watchLayout = ref<WatchLayout>(defaultLayoutFor('wide', hubGrid.cols, hubGrid.rows))
// 0.11.0: a layout per size (wide, medium, narrow: the widget's width), the ones you arranged kept per copy; a size not
// arranged yet gets its default, and says once (per copy and size) that it can be arranged too
const layoutSize = ref<LayoutSize>('wide')
const layouts = ref<Partial<Record<LayoutSize, WatchLayout>>>({})
const sizesTold = ref<string[]>([])
function showSizeLayout() {
  watchLayout.value = layouts.value[layoutSize.value] ?? defaultLayoutFor(layoutSize.value, hubGrid.cols, hubGrid.rows)
}
const currentUrl = ref('')
// 0.5.1: a watch page by its address, or by what the page itself says (its v= parameter, asked once a second): YouTube
// moves to a video without a new page, and older GEM Shells didn't tell the widget its address then
/** 0.16.0: GEM YT in the sidebar: the watch page as a compact player (plan-2026-11-25-gem-yt-compact.md) */
const compactPlayer = computed(() => props.placement?.context === 'sidebar')
/** 0.18.0: in the toolbar, a strip (the page plays out of view; ▣ / ☰ open a panel with the video or the list) */
const inToolbar = computed(() => props.placement?.context === 'toolbar')
const showTiles = computed(() => !inToolbar.value && tilesOn.value && mode.value === 'standard' && (isWatchUrl(currentUrl.value) || !!nowInfo.value.videoId))
let regionsShown = false
async function placeRegions(place: Record<string, { x: number; y: number; width: number; height: number }>) {
  if (!surface?.regions || !showTiles.value) return
  regionsShown = true
  const r = await surface.regions('youtube', place)
  if (!r.ok) status.value = `Tiles: ${r.error ?? r.reason}`
}
// Leaving the watch page (or ▤ Tiles off): the whole page again
watch(showTiles, on => {
  if (!on && regionsShown && surface?.regions) { regionsShown = false; void surface.regions('youtube', null) }
})
// What's playing is watched while tiles are on in Standard mode (on any page: it says when a video page comes)
watch(() => tilesOn.value && mode.value === 'standard', on => { if (on) void watchNow(); else stopWatching() })
const barHidden = computed(() => barFolded.value && mode.value === 'standard' && showTiles.value)
function toggleBar() { barFolded.value = !barFolded.value; save({ barFolded: barFolded.value }) }
function toggleTiles() {
  if (!surface?.regions) { status.value = 'This GEM Shell can’t show YouTube in tiles yet (it needs page regions).'; return }
  tilesOn.value = !tilesOn.value
  status.value = ''
  save({ tiles: tilesOn.value })
}
function setWatchLayout(l: WatchLayout) {
  watchLayout.value = l
  layouts.value = { ...layouts.value, [layoutSize.value]: l }
  // wide also as before (an older GEM YT reads that one)
  save({ watchLayouts: { ...layouts.value }, ...(layoutSize.value === 'wide' ? { watchLayout: l } : {}) })
}
const SIZE_WORDS: Record<LayoutSize, string> = { wide: 'wide', medium: 'medium-sized', narrow: 'narrow' }
watch(() => [layoutSize.value, showTiles.value] as const, ([size, on]) => {
  if (!on || compactPlayer.value || inToolbar.value || size === 'wide' || layouts.value[size] || sizesTold.value.includes(size)) return   // 0.16.0: not the compact player's
  sizesTold.value = [...sizesTold.value, size]
  save({ sizesTold: sizesTold.value })
  snack(`GEM YT arranged the video’s tiles for a ${SIZE_WORDS[size]} widget. Drag the lines and fold the panels as you like: this size remembers how you leave it.`)
})

// ── The toolbar: a strip and its panel (use/toolbar.ts) ─────────────────────────────────────────────────────────────
const { watchingVideo, stripTitle, stripAvatar, stripInitial, canMedia, panelView, openPanel, toggleMedia, toggleMute, closePanel } = useToolbar({
  sdk, surface: () => surface, frame, nowInfo, nowLine, media, sound, currentUrl, avatar: () => playingCard.value?.avatar,
  panelComponent: ToolbarPanel, snack, status,
})
// In the sidebar, what's playing also goes in the header GEM Shell gives the widget ("GEM YT · <title>", scrolling)
watch(() => (compactPlayer.value && showTiles.value ? nowWhat.value || null : null), t => {
  try { (sdk as any)?.ui?.()?.setHeaderStatus?.(t) } catch { /* an older GEM Shell, or a preview */ }
}, { immediate: true })

/** The playing channel, if it's one of yours: its card (pictures asked once it's known). */
const playingChannel = computed(() => {
  const n = nowInfo.value
  const o = owner.value && owner.value.videoId === n.videoId ? owner.value : null
  if (!o && !n.channelHandle && !n.channelName) return undefined
  return followed.value({ id: '', title: '', channelId: o?.channelId, channelHandle: n.channelHandle ?? undefined, channelName: n.channelName ?? o?.name ?? undefined })
})
const playingCard = computed(() => { void ledgerVersion.value; const c = playingChannel.value; return c ? cardOf(c) : null })
watch(playingChannel, c => {
  if (!c) return
  picture(c.avatar, AVATAR, OPEN)
  picture(ledger.value.channels[c.id]?.banner, BANNER, OPEN)
})
const playingInfo = computed(() => ({ name: nowInfo.value.channelName, handle: nowInfo.value.channelHandle }))

// Dislikes and 💬 Comment (use/votes.ts)
const { votes, openVotesCredit, quickComment } = useVotes({ sdk, on: () => settings?.values?.dislikes !== false, videoId: () => nowInfo.value.videoId, tilesShown: showTiles })

/** The Channel part's name: its videos (their own page). */
function openPlayingChannel(id: string) { openCreator(id) }
function openHandle(handle: string) { void surface?.load(`https://www.youtube.com/${handle}/videos`) }

async function home() {
  const r = await surface?.load(HOME)
  if (r && !r.ok) status.value = `Not loaded: ${r.error ?? r.reason}`
}

// Encourage this creator (use/encourage.ts)
const { encouragedCount, creatorEncouraged, encouragedIds, readEncouraged, readEncouragedIds, encourageMenu } =
  useEncourage({ web, surface: () => surface, channelIds: () => channels.value.map(c => c.id), status })

async function showBlocking(ev: MouseEvent) {
  const r = await surface?.showBlocking?.(ev.currentTarget as HTMLElement)
  if (r && !r.ok) status.value = `No menu: ${r.error ?? r.reason}`
}

// ── GEM YT mode (0.2) ───────────────────────────────────────────────────────────────────────────────────────────────
const channels = ref<Channel[]>([])
// 0.9.6: the Encouraged filter asked again when the count changes or the channels are read (here: after both exist)
watch(() => [encouragedCount.value, channels.value.length] as const, () => { void readEncouragedIds() })
/** channel id -> its videos (absent: not read yet) */
const videos = reactive(new Map<string, Video[]>())
/** picture address (the page's) -> GEM Shell's local one */
const pictures = reactive(new Map<string, string>())
/** 0.2.4: pictures that couldn't be made ("No picture", not a shimmer) */
const noPicture = reactive(new Set<string>())
/** 0.2.4: feed id -> its videos (YouTube's own lists: FEEDS) */
const feeds = reactive(new Map<string, Video[]>())
const loading = ref(false)
const reading = reactive(new Set<string>())
/** What stops GEM YT's pages: the reason sdk.pageData gave, in words, and what can be done. */
const problem = ref<{ text: string; action?: 'standard' | 'retry' } | null>(null)
/** 0.3.0: racks and feeds read in this session (the others are remembered ones, read again as they're seen). */
const readNow = new Set<string>()
/** 0.3.0: pictures GEM Shell confirmed this session (a remembered one is shown at once, asked again once its rack is read). */
const verified = new Set<string>()
/** 0.3.0: what GEM YT learns about each channel over time (memory.ts); ledgerVersion bumps on each change. */
const ledger = shallowRef(emptyLedger())
const ledgerVersion = ref(0)
/** 0.3.0: the channel the background survey is reading (not "Stocking shelves…": nothing on screen waits for it). */
const surveyId = ref<string | null>(null)

// 0.2.5: your channels in the order they last posted (newest first), from Fresh from your subscriptions (YouTube's
// own list of your subscriptions' latest videos) and the channels already read; channels seen in neither keep YouTube's
// order after them. Set once that list is read (and again on ⟳), not as each channel comes in: tiles don't jump around.
const channelOrder = ref<Map<string, number> | null>(null)
const ordered = computed(() => {
  const order = channelOrder.value
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

function orderChannels() {
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
  channelOrder.value = order
  settleOrder()
}

// ── 0.3.1: what the ledger says of each channel: its rhythm, quiet (put away), overdue; the filter ──────────────────
const MONTH_MS = 30.44 * 24 * 3600_000
/** 0.4.1: a channel this long without a video is inactive (a ghost on its Creators tile; Show: Inactive). */
const DEAD_MS = 24 * MONTH_MS
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
// 0.3.7: declared here, before the aisle's watchers (they read it at once)
const sortBy = ref<SortBy>('latest')
const SORTS: Array<{ value: SortBy; label: string }> = [
  { value: 'latest', label: 'Latest video first' },
  { value: 'name', label: 'A to Z' },
  { value: 'subsDown', label: 'Most subscribers' },
  { value: 'subsUp', label: 'Fewest subscribers' },
  { value: 'rate', label: 'Posting most often' },
]
const passes = (c: Channel, f: Filter): boolean => {
  const i = infos.value.get(c.id)
  const subs = c.subscribers
  switch (f) {
    case 'all': return true
    case 'active': return !!i && i.latest !== undefined && !i.quiet
    case 'overdue': return !!i?.overdue
    case 'quiet': return !!i?.quiet
    // 0.4.1: two years or more without a video (Creators draws them as ghosts)
    case 'dead': return !!i?.quiet && i.latest !== undefined && now.value - i.latest >= DEAD_MS
    case 'gems': return subs !== undefined && subs < 10_000
    case 'rising': return subs !== undefined && subs >= 10_000 && subs < 250_000
    case 'big': return subs !== undefined && subs >= 250_000
    case 'unknown': return !i || i.latest === undefined
    case 'encouraged': return encouragedIds.value.has(c.id)   // 0.9.6
  }
  // 0.3.5: a topic: the channel's own keywords have it
  return f.startsWith('topic:') && !!ledger.value.channels[c.id]?.about?.k?.includes(f.slice(6))
}
// ── 0.3.5: topics and search (topics.ts) ──────────────────────────────────────────────────────────────────────────
/** The topics your channels share (from the keywords of the channels read so far). */
const topics = computed(() => {
  void ledgerVersion.value
  const kw = new Map<string, string[]>()
  for (const c of channels.value) { const k = ledger.value.channels[c.id]?.about?.k; if (k?.length) kw.set(c.id, k) }
  return topicsOf(kw)
})
const topicChoices = computed(() => topics.value.map(t => ({ value: `topic:${t.term}` as Filter, label: t.term, count: t.channels.length })))
const isFilter = (v: unknown): v is Filter => typeof v === 'string' && (FILTERS.some(x => x.value === v) || (/^topic:.{1,40}$/.test(v)))
const filterLabel = (f: Filter) => FILTERS.find(x => x.value === f)?.label ?? (f.startsWith('topic:') ? `About “${f.slice(6)}”` : f)
/** Search your channels: name, handle, description, keywords, the titles of the videos known. */
const query = ref('')
const haystack = (c: Channel) => {
  const about = ledger.value.channels[c.id]?.about
  return [c.name, c.handle, c.description, about?.d, about?.k?.join(' '), ...(videos.get(c.id) ?? []).map(v => v.title)].filter(Boolean).join(' \n ')
}
const found = (c: Channel) => !query.value.trim() || matches(query.value.trim(), haystack(c))
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All channels' },
  { value: 'active', label: 'Posting' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'quiet', label: 'Gone quiet' },
  { value: 'dead', label: 'Inactive (2 years and more)' },
  { value: 'gems', label: 'Hidden gems (under 10K)' },
  { value: 'rising', label: 'Rising (10K to 250K)' },
  { value: 'big', label: 'Big (250K and up)' },
  { value: 'unknown', label: 'Not known yet' },
  { value: 'encouraged', label: '💛 Encouraged' },
]
const filterCounts = computed(() => new Map([...FILTERS.map(f => [f.value, channels.value.filter(c => passes(c, f.value)).length] as const), ...topicChoices.value.map(t => [t.value, t.count] as const)]))
function setSort(ev: Event) {
  sortBy.value = (ev.target as HTMLSelectElement).value as SortBy
  save({ sortBy: sortBy.value })
  toStart()
}
/** 0.3.7: back to the start (Creators' first tile). */
function toStart() {
  creatorsPart.value?.toTop()
}
function setFilter(ev: Event) {
  filter.value = (ev.target as HTMLSelectElement).value as Filter
  save({ filter: filter.value })
  settleOrder()
}
// ── Your tags (use/tags.ts) ──────────────────────────────────────────────────────────────────────────────────────────
const { tagsDoc, tags, tagId, currentTag, addMembers, adoptTopic, picked, naming, nameDraft, nameInput, confirmingDelete, tagsChanged, showTag, setTag, startNaming, commitName, deleteTag, toggleIn } =
  useTags({
    sdk, remember: id => save({ aisle: id }), settle: () => settleOrder(), setPicked: ids => setPicked(ids),
    keywordsOf: id => { void ledgerVersion.value; return ledger.value.channels[id]?.about?.k }, channelIds: () => channels.value.map(c => c.id),
  })
/** Keywords your creators share that aren't a tag yet: offered in the Tag picker (picking one adopts it) */
const tagSuggestions = computed(() => topics.value.filter(t => !tagNamed(tagsDoc.value, t.term)))

// ── 0.3.3: Since you were here ─────────────────────────────────────────────────────────────────────────────────────
// Your channels' videos that came out since your last visit (the subscriptions feed and the racks read), newest first,
// not the ones you watched; in the aisle shown. Not shown on a first visit, nor when there's nothing new.
const SINCE = 'mine:since'
/** When this visit began (saved with the memory) and when the last one did. */
const visitAt = Date.now()
const prevVisit = ref<number | null>(null)
const sinceVideos = computed(() => {
  const from = prevVisit.value
  if (!from) return []
  const only = scopeIds.value
  const seen = new Set<string>()
  const out: Array<{ v: Video; t: number }> = []
  const add = (v: Video, c: Channel | undefined) => {
    if (!c || seen.has(v.id) || (only && !only.has(c.id)) || (v.watched ?? 0) >= 90) return
    const t = time(v.published)
    if (t === undefined || t <= from) return
    seen.add(v.id)
    out.push({ v: { ...v, channelName: c.name }, t })
  }
  for (const v of feeds.get('feed:subscriptions') ?? []) add(v, followed.value(v))
  for (const c of channels.value) for (const v of videos.get(c.id) ?? []) add(v, c)
  return out.sort((a, b) => b.t - a.t)
})
// 0.3.2 (Guillaume: a channel picked in the list, then its rack moved away as the racks around it were read and it
// turned out quiet): which racks are put away is settled when the aisle is arranged (the last session's at start, the
// subscriptions feed's order, ⟳, the filter, the setting), not each time the ledger learns something. A rack found
// quiet meanwhile fades where it stands.
const putAway = ref(new Set<string>())
function settleOrder() {
  putAway.value = new Set([...infos.value].filter(([, i]) => i.quiet).map(([id]) => id))
}
watch(quietMs, settleOrder)
/** The aisle: the racks' order, the put away ones at its end (the back room), as the filter says. */
/** 0.3.6: the channels the aisle is narrowed to: the aisle shown's, else the pick (in Every channel), else all. */
const scopeIds = computed(() => currentTag.value ? new Set(currentTag.value.channels) : picked.value.length ? new Set(picked.value) : null)
const shownChannels = computed(() => {
  const only = scopeIds.value
  const list = ordered.value.filter(c => passes(c, filter.value) && found(c) && (!only || only.has(c.id)))
  // 0.3.7: the order chosen (latest: the arranged order above); the unknown last, ties by name
  const subs = (c: Channel) => c.subscribers
  const rate = (c: Channel) => infos.value.get(c.id)?.perWeek
  const by = (key: (c: Channel) => number | undefined, dir: 1 | -1) => (a: Channel, b: Channel) => {
    const x = key(a), y = key(b)
    if (x === undefined || y === undefined) return x === y ? a.name.localeCompare(b.name) : x === undefined ? 1 : -1
    return (x - y) * dir || a.name.localeCompare(b.name)
  }
  if (sortBy.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortBy.value === 'subsDown') list.sort(by(subs, -1))
  else if (sortBy.value === 'subsUp') list.sort(by(subs, 1))
  else if (sortBy.value === 'rate') list.sort(by(rate, -1))
  return [...list.filter(c => !putAway.value.has(c.id)), ...list.filter(c => putAway.value.has(c.id))]
})

// 0.2.5: You may like without the channels you follow (YouTube's recommendations, past your subscriptions)
const feedVideos = (id: string) => {
  const list = feeds.get(id)
  return list && id === 'feed:home' ? list.filter(v => !followed.value(v)) : list
}
/** The channel list in the bar: A to Z (200+ channels). */
const byName = computed(() => [...channels.value].sort((a, b) => a.name.localeCompare(b.name)))
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
  // 0.3.0: ⟳ keeps what's shown (remembered) and reads every channel again as it's seen (Creators' tiles in view)
  if (fresh) { readNow.clear(); noPicture.clear(); refreshing = true; refreshed.clear() }
  readNow.add('subscriptions')
  // the channels not read yet (all of them, the first time; then the new subscriptions): GEM Shell's scan
  void scanChannels()
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
    lastMiss = r.ok ? null : r.reason
    if (!r.ok) {
      if (r.reason === 'declined' || r.reason === 'busy') { problem.value = explain(r); return }
      // the site asked whether a person is there: GEM Shell shows it (its window); not an empty channel
      if ((r.reason as string) === 'challenge') return
      readNow.add(c.id)
      if (!videos.has(c.id)) videos.set(c.id, [])
      return
    }
    takeChannelRead(c, r.items, r.at, prio)
  }
  const list = videos.get(c.id) ?? []
  picture(c.avatar, AVATAR, prio)
  for (const v of pictureCount < 0 ? list : list.slice(0, pictureCount)) picture(v.thumbnail, THUMB, prio)
}

/** A channel's page as read (by GEM YT, or by GEM Shell's scan): its videos, what it says of itself, its banner. */
function takeChannelRead(c: Channel, items: Record<string, Array<Record<string, unknown>>>, at: number, prio: number) {
  const list = (items.video ?? []).map(videoOf).filter(Boolean) as Video[]
  readNow.add(c.id)
  videos.set(c.id, merged(list, videos.get(c.id)))
  noteRead(ledger.value, c.id, list, at)
  // what the channel says of itself (its page's metadata): search, its keywords (tags)
  const info = items.channelInfo?.[0] as Record<string, unknown> | undefined
  if (info) noteAbout(ledger.value, c.id, typeof info.description === 'string' ? info.description : undefined, parseKeywords(typeof info.keywords === 'string' ? info.keywords : undefined))
  // its banner (Creators): asked at once when its tile is shown
  noteBanner(ledger.value, c.id, (items.channelBanner?.[0] as Record<string, unknown> | undefined)?.image)
  if (mode.value === 'creators') picture(ledger.value.channels[c.id]?.banner, BANNER, prio)
  ledgerChanged()
  saveSoon()
}

// ── Scanning your channels (GEM Shell's scans: sdk.pageData('youtube').scan) ───────────────────────────────────────
// The channels never read are read once by GEM Shell, as a job ("Scanning your channels": its card in the operations
// tray while GEM YT isn't on screen, Pause and Stop there), 6 to 30 s apart, whether GEM YT is open or not. Then only
// new subscriptions are added (the subscriptions list read again shows them), and the slow survey keeps things fresh.
// While GEM YT is open, each read is taken as it ends; coming back, what was read meanwhile is taken from GEM Shell's
// cache (cachedOnly: never a read of YouTube).
const SCAN_KIND = 'scan'
const scanInfo = ref<{ done: number; total: number; running: boolean; paused: boolean } | null>(null)
let scanOff: (() => void) | null = null
function neverRead(): Channel[] {
  return channels.value.filter(c => ledger.value.channels[c.id]?.readAt === undefined && !!channelParam(c))
}
function listenScan(h: { state(): { done: number; total: number; running: boolean; paused: boolean }; onItems(cb: (params: Record<string, string>, r: any) => void): () => void }) {
  scanOff?.()
  const byParam = new Map(channels.value.map(c => [channelParam(c), c] as const))
  const tick = () => { const s = h.state(); scanInfo.value = { done: s.done, total: s.total, running: s.running, paused: s.paused } }
  tick()
  scanOff = h.onItems((params, r) => {
    tick()
    // the last one: the scan ends right after (its state then)
    if (h.state().done >= h.state().total) setTimeout(tick, 400)
    const c = byParam.get(params.channel)
    if (c && r?.ok) takeChannelRead(c, r.items, r.at, LATER)
  })
}
async function scanChannels() {
  if (!yt || typeof (yt as any).scan !== 'function' || !alive) return
  const was = (yt as any).scanState?.(SCAN_KIND) as { running: boolean; done: number; handle: any } | null
  // what GEM Shell read while GEM YT wasn't on screen: from its cache
  if (was && was.done > 0) {
    for (const c of neverRead()) {
      const r = await yt.read('channel-videos', { channel: channelParam(c)! }, { cachedOnly: true } as any)
      if (!alive) return
      if (r.ok) takeChannelRead(c, r.items, r.at, LATER)
    }
  }
  const todo = neverRead()
  if (!todo.length) { if (was?.running) listenScan(was.handle); else scanInfo.value = null; return }
  const h = (yt as any).scan('channel-videos', todo.map(c => ({ channel: channelParam(c)! })), { kind: SCAN_KIND, title: 'Scanning your channels' })
  if (!h?.ok) { console.warn('[GEM YT] the channels can’t be scanned here', h?.error); return }
  if (!was?.running) {
    const mins = Math.max(1, Math.round(todo.length * 18 / 60))
    snack(`GEM YT is reading your ${todo.length} channel${todo.length === 1 ? '' : 's'} once, in the background (about ${mins} min). It goes on when GEM YT is closed; pause or stop it in the operations tray.`)
  }
  listenScan(h)
}

/**
 * 0.3.8: what was just read first (newest), then what was already known and isn't in it (older videos read with More
 * videos before, or remembered): a rack read again doesn't lose a department's older videos. DEEP_KEEP at most.
 */
function merged(fresh: Video[], known: Video[] | undefined): Video[] {
  if (!known?.length) return fresh
  const ids = new Set(fresh.map(v => v.id))
  return [...fresh, ...known.filter(v => !ids.has(v.id))].slice(0, DEEP_KEEP)
}

// ── 0.3.8: More videos (a channel's department) ──────────────────────────────────────────────────────────────────
// GEM Shell reads the channel's page again and scrolls it `level` times (its rules: 5 at most), YouTube's own page
// asking for the next videos; kept in GEM Shell's cache (the page's fresh minutes) and in the memory (deep channels).
/** channel id -> how many scrolls were asked */
const moreLevel = reactive(new Map<string, number>())
const MORE_MAX = 5
/** The channels you went further into, the last last (kept whole in the memory: memory.ts DEEP_KEEP). */
let deepIds: string[] = []
const loadingMore = ref<string | null>(null)
async function loadMore(c: Channel) {
  const param = channelParam(c)
  if (!param || loadingMore.value || reading.has(c.id)) return
  const level = Math.min(MORE_MAX, (moreLevel.get(c.id) ?? 0) + 1)
  loadingMore.value = c.id
  reading.add(c.id)
  try {
    // the parts as they come (GEM Shell's streamed reads): the list grows while it's read
    const known = videos.get(c.id)
    const acc: Video[] = []
    const r = await yt.read('channel-videos', { channel: param }, {
      more: level,
      onPart: (p: { items: Record<string, Array<Record<string, unknown>>> }) => {
        const add = (p.items.video ?? []).map(videoOf).filter(Boolean) as Video[]
        if (!add.length) return
        acc.push(...add)
        videos.set(c.id, merged(acc, known))
        for (const v of add) picture(v.thumbnail, THUMB, OPEN)
      },
    })
    if (!r.ok) {
      if (r.reason === 'declined' || r.reason === 'busy') problem.value = explain(r)
      else console.warn(`[GEM YT] ${c.name}: more videos not read (${r.reason})`, r.error ?? '')
      return
    }
    const list = (r.items.video ?? []).map(videoOf).filter(Boolean) as Video[]
    // the list's end: fewer parts came than asked (nothing more to scroll)
    moreLevel.set(c.id, r.more < level ? MORE_MAX + 1 : level)
    videos.set(c.id, merged(list, videos.get(c.id)))
    noteRead(ledger.value, c.id, list, Date.now())
    ledgerChanged()
    deepIds = [...deepIds.filter(x => x !== c.id), c.id].slice(-DEEP_CHANNELS)
    saveSoon()
    const all = videos.get(c.id) ?? []
    // 0.9.5: every picture still missing, not only the new ones' (merged puts the fresh first: the tail wasn't the new
    // ones), so pictures left half-way earlier (a page left before they came, another session) come now: GEM Shell
    // hands out a picture once it read its page again (picture() skips those already made)
    for (const v of all) picture(v.thumbnail, THUMB, OPEN)
  } finally {
    reading.delete(c.id)
    loadingMore.value = null
  }
}
const canMore = (id: string) => (moreLevel.get(id) ?? 0) < MORE_MAX && (videos.get(id)?.length ?? 0) < DEEP_KEEP

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
      // the site asked whether a person is there: GEM Shell shows it (its window); not an empty channel
      if ((r.reason as string) === 'challenge') return
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
      orderChannels()
    }
    // 0.4.0: Discover learns the channels You may like suggests (not yours)
    if (id === 'feed:home' && noteSuggested(discoverDoc.value, list, v => !!followed.value(v), Date.now())) discoverChanged()
    saveSoon()
  }
  const list = feedVideos(id) ?? []
  for (const v of pictureCount < 0 ? list : list.slice(0, pictureCount)) picture(v.thumbnail, THUMB, prio)
}

// ── Channels in view (0.2.3; 1.0: Creators' tiles) ────────────────────────────────────────────────────────────────
// 200+ subscriptions: reading every channel (8 s each) would take half an hour and most of the day's 300 reads. Only
// the ones Creators shows are read (onCreatorsRange), one at a time as GEM Shell paces them.
let wanted: string[] = []
let readsRunning = false
/** ⟳: each channel read again (not from GEM Shell's cache) the first time it's seen after. */
let refreshing = false
const refreshed = new Set<string>()

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
      const c = channels.value.find(x => x.id === id)
      if (!c) { wanted = wanted.filter(x => x !== id); continue }
      await loadVideos(c, fresh, 0, RACK)
    }
  } finally { readsRunning = false }
}

/** The channel list without GEM Shell's menu (an older shell): a channel chosen opens its videos. */
function jump(ev: Event) {
  const select = ev.target as HTMLSelectElement
  const id = select.value
  select.value = ''
  if (id) openCreator(id)
}
// ── 0.3.4 / 0.3.6: the channel list (GEM Shell's menu: typing jumps, long lists paged, avatars) ──────────────────
// The channels Show and the search let through, A to Z. Each has a check: in your own aisle, it's in that aisle; in
// Every channel, it's picked (the aisle shows only the picked channels; Save as aisle keeps them). The row itself
// goes to the channel's rack. 0.3.6: the list's own filter is gone (one filter, Show, for the racks and the list).
function setPicked(ids: string[]) {
  picked.value = ids
  save({ picked: ids })
  settleOrder()
}
function togglePick(id: string) {
  setPicked(picked.value.includes(id) ? picked.value.filter(x => x !== id) : [...picked.value, id])
}
/** The pick kept as an aisle (named at once: its name box opens). */
function savePick() {
  const made = addTag(tagsDoc.value, 'Picked channels')
  if (!made) return
  for (const id of picked.value) toggleChannel(tagsDoc.value, made.id, id)
  tagsChanged()
  setPicked([])
  showTag(made.id)
  startNaming({ mode: 'rename' })
}
const listed = () => byName.value.filter(c => passes(c, filter.value) && found(c))
let listMenu: { close(): void } | null = null
function openChannelList(ev: MouseEvent) {
  const ui = (sdk as any)?.ui?.()
  if (!ui?.openMenu) return
  const btn = ev.currentTarget as HTMLElement
  const rows = () => {
    const a = currentTag.value
    const list = listed()
    const narrowed = filter.value !== 'all' || !!query.value.trim()
    const inIt = (id: string) => (a ? a.channels.includes(id) : picked.value.includes(id))
    const head = { type: 'header', label: a ? `✓ in “${a.name}” · ${list.length} shown` : `✓ picked: Creators shows only those · ${list.length} shown` }
    const extra: unknown[] = []
    if (a) {
      const missing = list.filter(c => !inIt(c.id)).length
      if (narrowed && missing) extra.push({ id: '__addall', label: `Put these ${missing} in “${a.name}”`, icon: '✓' })
    } else {
      if (picked.value.length) extra.push({ id: '__save', label: `Save the ${picked.value.length} picked as a tag…`, icon: '＋' }, { id: '__clear', label: 'Clear the pick', icon: '✕' })
      if (narrowed && list.length) extra.push({ id: '__make', label: `Make a tag of these ${list.length}`, detail: `“${suggestedName()}”`, icon: '＋' })
    }
    if (extra.length) extra.push({ type: 'separator' })
    return [head, ...extra, ...list.map(c => {
      const i = infos.value.get(c.id)
      const detail = [c.subscribers !== undefined ? `${compactNum(c.subscribers)} subscribers` : '', i?.latest !== undefined ? agoShort(i.latest, now.value) : '', i?.flag ?? '']
        .filter(Boolean).join(' · ')
      const on = inIt(c.id)
      const avatar = c.avatar ? pictures.get(c.avatar) : undefined
      return {
        id: c.id, label: c.name, detail: detail || undefined, ...(avatar ? { image: avatar, imageRound: true } : { icon: '◯' }),
        check: 'box', checked: on,
        checkTooltip: a ? (on ? `Take it out of “${a.name}”` : `Put it in “${a.name}”`) : on ? 'Unpick it' : 'Pick it: Creators shows only the picked channels',
      }
    })]
  }
  listMenu = ui.openMenu({
    at: btn, items: rows, label: 'Your channels', checkToggles: 'column',
    onPick: (row: { id: string }) => {
      const list = listed()
      if (row.id === '__make') {
        const made = addTag(tagsDoc.value, suggestedName())
        if (!made) return
        for (const c of list) toggleChannel(tagsDoc.value, made.id, c.id)
        tagsChanged()
        query.value = ''
        if (filter.value !== 'all') { filter.value = 'all'; save({ filter: 'all' }) }
        showTag(made.id)
        startNaming({ mode: 'rename' })
        return
      }
      if (row.id === '__save') { savePick(); return }
      if (row.id === '__clear') { setPicked([]); return }
      if (row.id === '__addall') {
        const a = currentTag.value
        if (!a) return
        addMembers(a.id, list.map(c => c.id))
        return
      }
      pickChannel(row.id)
    },
    onToggle: (row: { id: string }) => {
      if (currentTag.value) toggleIn(currentTag.value.id, row.id)
      else togglePick(row.id)
    },
    onClose: () => { listMenu = null },
  })
}
/** A new aisle's name from what narrowed the list: the topic, the search, else the filter's. */
function suggestedName(): string {
  const f = filter.value
  const n = f.startsWith('topic:') ? f.slice(6) : query.value.trim() || filterLabel(f)
  return n.charAt(0).toUpperCase() + n.slice(1)
}
/** 0.3.5: what the filter and the search hide of the aisle shown (said in the bar, with Show all). */
const hiddenHere = computed(() => {
  if (filter.value === 'all' && !query.value.trim()) return 0
  const only = scopeIds.value
  const scope = channels.value.filter(c => !only || only.has(c.id))
  return scope.length - scope.filter(c => passes(c, filter.value) && found(c)).length
})
function showEverything() {
  query.value = ''
  if (filter.value !== 'all') { filter.value = 'all'; save({ filter: 'all' }) }
  settleOrder()
}
const hasMenu = computed(() => !!(sdk as any)?.ui?.()?.openMenu)
const compactNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n)).replace('.0', '')

/** 0.4.0: a channel picked in the list: its videos (1.0: its own page). */
function pickChannel(id: string) {
  openCreator(id)
}

/** ⟳: the page shown read again (Creators: every channel again as it's seen). */
function reloadHere() {
  if (mode.value === 'discover') { void learnSuggestions(true); return }
  if (mode.value === 'feed') { loadFeeds(true); return }
  if (mode.value === 'channel' && viewedChannel.value) {
    const c = viewedChannel.value
    const sort = channelSort.value
    if (sort !== 'latest') { sorted.delete(sortKey(sort, c.id)); sortedLevel.delete(sortKey(sort, c.id)); void loadSorted(c, sort) }
    else void loadVideos(c, true)
    return
  }
  void loadChannels(true)
}

function retry() { problem.value = null; void loadChannels(false) }

// ── 0.4.0: Creators (parts/CreatorsPart.vue) ─────────────────────────────────────────────────────────────────────
// The channels the bar lets through (the tag, Show, the search), in its order: the racks' aisle, as tiles. The tiles
// in view get their avatars and banners; a channel never read (or not for a week) is read, one at a time as GEM Shell
// paces them (its banner, rhythm and topics come with it), like the racks in view; no video pictures.
const creatorsPart = ref<{ toTop(): void } | null>(null)
const READ_AGAIN_MS = 7 * 24 * 3600_000
/** The topics of a channel shown on its tile: its keywords that your channels share, 3 at most. */
const sharedTopics = computed(() => new Set(topics.value.map(t => t.term)))
/** 1.0: a channel's card (Creators' tiles, the watch page's Channel part). */
function cardOf(c: Channel): CreatorCard {
    const i = infos.value.get(c.id)
    const rec = ledger.value.channels[c.id]
    const banner = rec?.banner
    return {
      id: c.id, name: c.name, handle: c.handle,
      avatar: c.avatar ? pictures.get(c.avatar) : undefined,
      banner: banner ? pictures.get(banner) : undefined,
      bannerComing: !!banner && !noPicture.has(banner),
      subscribers: c.subscribers, latest: i?.latest, rate: rateText(i?.perWeek) || undefined, bars: i?.bars, flag: i?.flag, dim: i?.dim,
      ghost: !!i?.quiet && i.latest !== undefined && now.value - i.latest >= DEAD_MS,
      // a keyword that's a tag already shows as the tag (one kind of tag)
      topics: (rec?.about?.k ?? []).filter(k => sharedTopics.value.has(k) && !tagNamed(tagsDoc.value, k)).slice(0, 3),
      tags: tags.value.aisles.filter(a => a.channels.includes(c.id)).map(a => ({ id: a.id, name: a.name })),
      reading: reading.has(c.id),
    }
}
const creatorCards = computed<CreatorCard[]>(() => {
  void ledgerVersion.value
  return shownChannels.value.map(cardOf)
})
const creatorsEmpty = computed(() => (hiddenHere.value ? `The filter and the search hide ${hiddenHere.value}: Show all.` : currentTag.value ? `No channel tagged “${currentTag.value.name}” yet: ＋ on a tile tags it.` : undefined))
function onCreatorsRange(ids: string[]) {
  if (mode.value !== 'creators') return
  const byId = new Map(channels.value.map(c => [c.id, c]))
  const toRead: string[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (!c) continue
    picture(c.avatar, AVATAR, RACK)
    picture(ledger.value.channels[id]?.banner, BANNER, RACK)
    const at = ledger.value.channels[id]?.readAt
    if (!readNow.has(id) && (at === undefined || Date.now() - at > READ_AGAIN_MS)) toRead.push(id)
  }
  wanted = toRead
  void runReads()
}
/** A tile, a channel's name: the channel's videos (0.9.0: their own page). */
function openCreator(id: string) {
  const c = channels.value.find(x => x.id === id)
  if (!c) return
  if (mode.value !== 'channel' && isPage(mode.value)) lastPage.value = mode.value
  channelView.value = id
  channelSort.value = 'latest'   // 0.9.4: a channel opens on its latest videos
  mode.value = 'channel'
  void loadVideos(c, false, -1, OPEN)
  void readEncouraged()
}

// ── 0.9.0: a channel's videos (parts/ChannelVideosPart.vue) ─────────────────────────────────────────────────────
const channelView = ref<string | null>(null)
const viewedChannel = computed(() => (channelView.value ? channels.value.find(c => c.id === channelView.value) ?? null : null))
const channelCard = computed(() => { void ledgerVersion.value; return viewedChannel.value ? cardOf(viewedChannel.value) : null })
// 0.9.4: Latest (the channel's videos page) or Popular (YouTube's own list of the channel's most watched: the playlist
// UULP + its id; rules 2026.11.25.3: channel-popular). 0.10.1: or Oldest (the channel's videos page, GEM Shell's reader
// clicking its own Oldest first: a page choice, rules 2026.11.25.4). Kept for the session only (the memory keeps the latest).
type ChannelSort = 'latest' | 'popular' | 'oldest'
type OtherSort = Exclude<ChannelSort, 'latest'>
const channelSort = ref<ChannelSort>('latest')
/** "<sort>|<channel id>" -> its videos in that order; how far More went; the one being read; those that failed */
const sorted = reactive(new Map<string, Video[]>())
const sortedLevel = reactive(new Map<string, number>())
const sortedBusy = ref<string | null>(null)
const sortedFailed = reactive(new Set<string>())
const sortKey = (sort: OtherSort, id: string) => `${sort}|${id}`
const SORT_WORDS: Record<OtherSort, { title: string; failed: string }> = {
  popular: { title: 'Most watched', failed: 'YouTube didn’t give this channel’s most watched videos.' },
  oldest: { title: 'Oldest first', failed: 'YouTube didn’t give this channel’s oldest videos (or this GEM Shell can’t choose an order on a page yet).' },
}
const popularList = (c: Channel) => (/^UC[\w-]{22}$/.test(c.id) ? `UULP${c.id.slice(2)}` : null)
async function loadSorted(c: Channel, sort: OtherSort, level = 0) {
  if (sortedBusy.value || !yt) return
  const k = sortKey(sort, c.id)
  const list = sort === 'popular' ? popularList(c) : null
  const param = sort === 'oldest' ? channelParam(c) : null
  if (sort === 'popular' ? !list : !param) return
  sortedBusy.value = k
  try {
    // the parts as they come (GEM Shell's streamed reads): the list grows while it's read
    const before = sorted.get(k) ?? []
    const acc: Video[] = []
    const onPart = (p: { items: Record<string, Array<Record<string, unknown>>> }) => {
      const add = [...(p.items.playlistVideo ?? []), ...(p.items.video ?? [])].map(videoOf).filter(Boolean) as Video[]
      if (!add.length) return
      const ids = new Set(acc.map(v => v.id))
      for (const v of add) if (!ids.has(v.id)) { ids.add(v.id); acc.push(v); picture(v.thumbnail, THUMB, OPEN) }
      sorted.set(k, [...acc, ...before.filter(v => !ids.has(v.id))])
    }
    const more = level ? { more: level } : {}
    const r = sort === 'popular'
      ? await yt.read('channel-popular', { list }, { ...more, onPart })
      : await yt.read('channel-videos', { channel: param }, { choose: 'oldest', ...more, onPart })
    if (!r.ok) {
      sortedFailed.add(k)
      if (r.reason === 'declined' || r.reason === 'busy') problem.value = explain(r)
      else console.warn(`[GEM YT] ${c.name}: ${sort} videos not read (${r.reason})`, r.error ?? '')
      return
    }
    // An older GEM Shell reads the page as it is (Latest): not Oldest
    if (sort === 'oldest' && r.chosen !== 'oldest') { sortedFailed.add(k); console.warn(`[GEM YT] ${c.name}: this GEM Shell made no choice (page choices: a newer GEM Shell)`); return }
    sortedFailed.delete(k)
    // YouTube's order; a list read further keeps the same first ones
    const seen = new Set<string>()
    const got = ([...(r.items.playlistVideo ?? []), ...(r.items.video ?? [])].map(videoOf).filter(Boolean) as Video[])
      .filter(v => !seen.has(v.id) && seen.add(v.id))
    const known = sorted.get(k) ?? []
    sorted.set(k, [...got, ...known.filter(v => !seen.has(v.id))])
    if (level) sortedLevel.set(k, r.more < level ? MORE_MAX + 1 : level)
    for (const v of sorted.get(k) ?? []) picture(v.thumbnail, THUMB, OPEN)   // 0.9.5: all still missing (see loadMore)
  } finally {
    sortedBusy.value = null
  }
}
function setChannelSort(sort: ChannelSort) {
  channelSort.value = sort
  const c = viewedChannel.value
  if (sort !== 'latest' && c && !sorted.has(sortKey(sort, c.id))) void loadSorted(c, sort)
}
const channelSorts = computed(() => {
  const c = viewedChannel.value
  return [
    { id: 'latest', label: 'Latest' },
    ...(c && popularList(c) ? [{ id: 'popular', label: 'Popular' }] : []),
    ...(c && channelParam(c) ? [{ id: 'oldest', label: 'Oldest' }] : []),
  ]
})
const channelSection = computed<FeedSection>(() => {
  const c = viewedChannel.value
  const sort = channelSort.value
  if (c && sort !== 'latest') {
    const k = sortKey(sort, c.id)
    const list = sorted.get(k) ?? []
    const busy = sortedBusy.value === k && !list.length
    return {
      id: `channel-${sort}`, title: SORT_WORDS[sort].title, note: list.length ? `${list.length} so far` : undefined,
      cards: list.map(v => ({ ...videoCard(v, c), channelId: undefined })),
      empty: busy ? '' : sortedFailed.has(k) ? SORT_WORDS[sort].failed : 'Not read yet.', reading: busy,
    }
  }
  const list = c ? videos.get(c.id) ?? [] : []
  const busy = !!c && reading.has(c.id) && !list.length
  // what's remembered shows at once; "updating…" while it's read again behind
  const again = !!c && reading.has(c.id) && list.length > 0
  return {
    id: 'channel', title: 'Videos', note: list.length ? `${list.length} so far${again ? ' · updating…' : ''}` : undefined,
    cards: c ? list.map(v => ({ ...videoCard(v, c), channelId: undefined })) : [],
    empty: busy ? '' : 'No videos read yet.', reading: busy,
  }
})
const channelMore = computed(() => {
  const c = viewedChannel.value
  const sort = channelSort.value
  if (c && sort !== 'latest') {
    const k = sortKey(sort, c.id)
    const n = sorted.get(k)?.length ?? 0
    if (!n || (sortedLevel.get(k) ?? 0) >= MORE_MAX || n >= DEEP_KEEP) return null
    return { label: 'More videos', busy: sortedBusy.value === k }
  }
  if (!c || !(videos.get(c.id)?.length) || !canMore(c.id)) return null
  return { label: 'More videos', busy: loadingMore.value === c.id }
})
const channelBackLabel = computed(() => `Back to ${PAGES.find(p => p.value === lastPage.value)?.label.replace(/^\S+\s/, '') ?? 'the page'}`)
function closeChannel() { channelView.value = null; showPage(lastPage.value) }
function channelMoreVideos() {
  const c = viewedChannel.value
  if (!c) return
  const sort = channelSort.value
  if (sort !== 'latest') void loadSorted(c, sort, Math.min(MORE_MAX, (sortedLevel.get(sortKey(sort, c.id)) ?? 0) + 1))
  else void loadMore(c)
}
function openChannelPage() { const h = viewedChannel.value?.handle; if (h) void showStandard(`https://www.youtube.com/${h}/videos`) }
function newTagFor(channelId: string) { startNaming({ mode: 'new', channelId }) }
/** A creator's keyword on a tile: the tag of that name (adopted if there's none yet) */
function showTopic(term: string) {
  adoptTopic(term)
  creatorsPart.value?.toTop()
}

// ── 1.0, part 2: Feed (parts/FeedPart.vue) ───────────────────────────────────────────────────────────────────────
// Since you were here, the latest from your channels (both narrowed by the bar's Tag), You may like without your
// channels: the racks' featured shelves, as a page of cards. A card plays in the watch page's tiles.
function loadFeeds(fresh: boolean) {
  void loadFeed('feed:subscriptions', fresh, 16, OPEN)
  void loadFeed('feed:home', fresh, 16, OPEN)
}
const agoOf = (v: Video) => { const t = time(v.published); return t !== undefined ? agoShort(t, now.value) : v.publishedText }
function videoCard(v: Video, c?: Channel): VideoCard {
  const avatarUrl = c?.avatar ?? v.channelAvatar
  return {
    id: v.id, title: v.title, thumb: v.thumbnail ? pictures.get(v.thumbnail) : undefined,
    coming: !!v.thumbnail && !pictures.has(v.thumbnail) && !noPicture.has(v.thumbnail),
    length: v.length, live: v.live, watched: v.watched, channelName: c?.name ?? v.channelName,
    avatar: avatarUrl ? pictures.get(avatarUrl) : undefined,
    line: [agoOf(v), v.views !== undefined ? `${compact(v.views)} ${v.live ? 'watching' : v.views === 1 ? 'view' : 'views'}` : ''].filter(Boolean).join(' · '),
    channelId: c?.id,
  }
}
const feedSections = computed<FeedSection[]>(() => {
  const only = scopeIds.value
  const tag = currentTag.value ? ` tagged “${currentTag.value.name}”` : ''
  const since = sinceVideos.value
  const latest = (feeds.get('feed:subscriptions') ?? [])
    .map(v => ({ v, c: followed.value(v) }))
    .filter(({ c }) => !only || (c && only.has(c.id)))
  const mayLike = only ? [] : feedVideos('feed:home') ?? []
  return [
    ...(prevVisit.value ? [{
      id: 'since', title: 'Since you were here',
      note: since.length ? `${since.length} new from your channels${tag} since ${agoShort(prevVisit.value, now.value)}` : undefined,
      cards: since.map(({ v }) => videoCard(v, followed.value(v))),
      empty: `Nothing new from your channels${tag} since your last visit.`,
    }] : []),
    {
      id: 'latest', title: `Latest from your channels${tag}`, cards: latest.map(({ v, c }) => videoCard(v, c)),
      empty: reading.has('feed:subscriptions') ? '' : 'Nothing yet: ⟳ reads YouTube again.', reading: reading.has('feed:subscriptions'),
    },
    ...(only ? [] : [{
      id: 'mayLike', title: 'You may like', note: 'YouTube’s suggestions, without your own channels (Discover learns from them)',
      cards: mayLike.map(v => videoCard(v)), empty: reading.has('feed:home') ? '' : 'Nothing yet: ⟳ reads YouTube again.', reading: reading.has('feed:home'),
    }]),
  ]
})
/** The pictures of the cards shown (thumbnails, avatars): the first ones of each section, all of an opened one. */
const feedShown = reactive(new Map<string, number>())
function askFeedPictures() {
  for (const s of feedSections.value)
    for (const c of s.cards.slice(0, feedShown.get(s.id) ?? 8)) {
      const v = (feeds.get('feed:subscriptions') ?? []).find(x => x.id === c.id) ?? (feeds.get('feed:home') ?? []).find(x => x.id === c.id)
        ?? sinceVideos.value.find(x => x.v.id === c.id)?.v
      if (!v) continue
      picture(v.thumbnail, THUMB, OPEN)
      const ch = c.channelId ? channels.value.find(x => x.id === c.channelId) : undefined
      picture(ch?.avatar ?? v.channelAvatar, AVATAR, LATER)
    }
}
watch(() => (mode.value === 'feed' ? feedSections.value.map(s => s.cards.length).join() : ''), k => { if (k) askFeedPictures() })
function onFeedShown(id: string, count: number) { feedShown.set(id, count); askFeedPictures() }

// ── 0.4.0: Discover (parts/DiscoverPart.vue, core/discover.ts) ──────────────────────────────────────────────────
const discoverDoc = ref(emptyDiscover())
const discoverVersion = ref(0)
let discoverTimer: ReturnType<typeof setTimeout> | null = null
function discoverChanged() {
  discoverVersion.value++
  if (!canSave || discoverTimer) return
  discoverTimer = setTimeout(() => { discoverTimer = null; void saveDiscover() }, 3000)
}
async function saveDiscover() {
  if (canSave) await sdk?.configWrite?.(DISCOVER_DOC, discoverDoc.value).catch(err => console.warn('[GEM YT] Discover not saved', err))
}
const follows = (s: Suggested) => !!followed.value({ id: '', title: '', channelId: s.id, channelHandle: s.handle, channelName: s.name })
const discoverCards = computed<DiscoverCard[]>(() => {
  void discoverVersion.value
  return suggested(discoverDoc.value, follows).map(s => ({
    id: s.id, name: s.name, handle: s.handle, avatar: s.avatar, count: s.n, last: s.last, videos: s.videos,
    featuredBy: s.by?.map(b => ({ id: b.id, name: b.name })), subscribers: s.subscribers, tags: borrowedTags(s),
  }))
})
/** 0.13.3: your tags on the channels that feature it (no read needed), 4 at most, each once. */
function borrowedTags(s: Suggested): Array<{ name: string; from: string }> {
  const out: Array<{ name: string; from: string }> = []
  for (const b of s.by ?? []) {
    for (const t of tags.value.aisles) {
      if (!t.channels.includes(b.id) || out.some(x => x.name === t.name)) continue
      out.push({ name: t.name, from: b.name })
      if (out.length >= 4) return out
    }
  }
  return out
}
function hideAllFeaturedBy(by: { id: string; name: string }) {
  hideFeaturedBy(discoverDoc.value, by)
  discoverChanged()
  snack(`Discover won’t show the channels ${by.name} features (Show them brings them back).`)
}
const learning = computed(() => reading.has('feed:home') || [...reading].some(k => k.startsWith('featured:')))
/** Your home page read (again: fresh), for Discover to learn from; then the cards' pictures. */
async function learnSuggestions(fresh: boolean) {
  if (!yt) return
  if (fresh || !readNow.has('feed:home')) await loadFeed('feed:home', fresh, 0, OPEN)
  askDiscoverPictures()
  // 0.13.1: ⟳ Look for more also reads one of your channels' featured channels (the next one due) at once
  if (fresh) {
    const fid = featuredNext(discoverDoc.value, ordered.value.map(c => c.id), x => !channelParam(channels.value.find(c => c.id === x)!), Date.now())
    const fc = fid ? channels.value.find(x => x.id === fid) : undefined
    if (fc) { await readFeatured(fc); askDiscoverPictures() }
  }
}
/** The pictures of the first cards (GEM Shell makes only what this session read: the rest stay plain). */
function askDiscoverPictures() {
  for (const c of discoverCards.value.slice(0, 60)) {
    picture(c.avatar, AVATAR, LATER)
    for (const v of c.videos) picture(v.thumbnail, THUMB, LATER)
  }
}
watch(() => discoverCards.value.length, () => { if (mode.value === 'discover') askDiscoverPictures() })
const discoverPicture = (url: string | undefined) => (url ? pictures.get(url) : undefined)
function openSuggested(id: string) {
  const s = discoverDoc.value.channels[id]
  if (s) void showStandard(channelUrl(s))
}
function hideSuggestion(id: string) { hideSuggested(discoverDoc.value, id); discoverChanged() }
function unhideSuggestions() { unhideAll(discoverDoc.value); discoverChanged() }
function playVideo(id: string) { void showStandard(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`) }

// ── Memory (0.3.0): memory.ts ────────────────────────────────────────────────────────────────────────────────────
const canSave = !(sdk as any)?.inPreview?.()
const stocking = computed(() => [...reading].some(id => id !== surveyId.value && !id.startsWith('featured:')))
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
  // 0.4.0: and the banners (Creators) and the suggested channels' avatars (Discover)
  const extra = [...channels.value.map(c => ledger.value.channels[c.id]?.banner), ...Object.values(discoverDoc.value.channels).map(s => s.avatar)].filter((u): u is string => !!u)
  const mem = makeMemory(channels.value, ordered.value.map(c => c.id), videos, feeds, pictures, Date.now(), visitAt, deepIds, extra)
  await sdk?.configWrite?.(MEMORY_DOC, mem).catch(err => console.warn('[GEM YT] racks not remembered', err))
}

/** The last session's racks, drawn at once (before anything is read). */
async function loadMemory() {
  const [rawMem, rawLedger, rawTags, rawDiscover] = await Promise.all([
    sdk?.configRead?.(MEMORY_DOC).catch(() => null) ?? null,
    sdk?.configRead?.(LEDGER_DOC).catch(() => null) ?? null,
    sdk?.configRead?.(TAGS_DOC).catch(() => null) ?? null,
    sdk?.configRead?.(DISCOVER_DOC).catch(() => null) ?? null,
  ])
  tagsDoc.value = readTags(rawTags)
  discoverDoc.value = readDiscover(rawDiscover)
  if (tagId.value && !currentTag.value) tagId.value = null
  ledger.value = readLedger(rawLedger)
  ledgerVersion.value++
  const mem = readMemory(rawMem)
  if (mem?.visitAt && mem.visitAt < visitAt) prevVisit.value = mem.visitAt
  if (!mem || channels.value.length) return
  channels.value = mem.channels
  for (const [id, list] of Object.entries(mem.videos)) videos.set(id, list)
  deepIds = mem.deep ?? []
  for (const [id, list] of Object.entries(mem.feeds)) feeds.set(id, list)
  for (const [from, to] of Object.entries(mem.pictures)) pictures.set(from, to)
  if (mem.order.length) channelOrder.value = new Map(mem.order.map((id, i) => [id, i]))
  settleOrder()
}

// The background survey: a channel never read (or not for a week) every SURVEY_GAP_MS while GEM YT is open on its
// racks and nothing else is read, in the aisle's order, at most memory.ts's SURVEY_PER_DAY a day. No pictures.
// 0.3.4: like a person, not a clock: 45 s to 2 min between reads; when YouTube stops giving its data (a check page,
// a sign-in wall: two reads in a row without it) the survey pauses an hour.
const SURVEY_GAP_MS = 45_000
const SURVEY_SPREAD_MS = 75_000
const SURVEY_PAUSE_MS = 3600_000
let surveyTimer: ReturnType<typeof setTimeout> | null = null
let surveyMisses = 0
/** The last channel read's refusal (null: it read). */
let lastMiss: string | null = null
let alive = true
let surveyPausedUntil = 0
let surveyTurn = 0
/** 0.13.2: featured reads in a row that found no shelf (a warning at FEATURED_NONE_WARN) */
let featuredNone = 0
const FEATURED_NONE_WARN = 25
/** 0.13.0: a channel's featured channels (its home tab's shelf: the rules' channel-featured), noted for Discover. */
async function readFeatured(c: Channel) {
  const param = channelParam(c)
  if (!param) return
  const key = `featured:${c.id}`
  if (reading.has(key)) return
  reading.add(key)
  const r = await yt.read('channel-featured', { channel: param }, {}).finally(() => reading.delete(key))
  // 0.13.2: most channels feature no channel: GEM Shell says "needs-update" (nothing the rules collect on the page).
  // That's an answer (it features none), not YouTube refusing: noted, so the next read is another channel's, and the
  // survey isn't paused. Many in a row (FEATURED_NONE_WARN) may mean YouTube moved its shelf: said once in the console.
  const none = !r.ok && r.reason === 'needs-update'
  lastMiss = r.ok || none ? null : r.reason
  if (!r.ok && !none) {
    console.warn(`[GEM YT] ${c.name}'s featured channels not read: ${r.reason}${r.error ? ` (${r.error})` : ''}`)
    if (r.reason === 'declined' || r.reason === 'busy') problem.value = explain(r)
    return
  }
  // (0.13.3: GEM Shell answers ok with nothing on this page now (the rules' mayBeEmpty): counted the same way)
  if (none || !(r.ok && r.items.featuredChannel?.length)) {
    if (++featuredNone === FEATURED_NONE_WARN) console.warn(`[GEM YT] ${FEATURED_NONE_WARN} channels in a row feature no channel: if YouTube shows some, its featured shelf moved (run the page analysis tool on channel-home)`)
  } else featuredNone = 0
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const list: FeaturedChannel[] = (r.ok ? r.items.featuredChannel ?? [] : []).map((x: Record<string, unknown>) => ({
    id: str(x.id) ?? '', name: str(x.name) ?? '', handle: str(x.handle), avatar: str(x.avatar),
    subscribers: typeof x.subscribers === 'number' ? x.subscribers : undefined,
  })).filter((f: FeaturedChannel) => f.id && f.name)
  const isMine = (f: FeaturedChannel) => !!followed.value({ id: '', title: '', channelId: f.id, channelHandle: f.handle, channelName: f.name })
  if (noteFeatured(discoverDoc.value, { id: c.id, name: c.name }, list, isMine, Date.now())) discoverChanged()
  console.info(list.length ? `[GEM YT] ${c.name} features ${list.length} channel(s), ${list.filter(f => !isMine(f)).length} you don’t follow` : `[GEM YT] ${c.name} features no channel`)
}
function nextSurvey() {
  if (!alive) return
  surveyTimer = setTimeout(() => { void surveyOne().finally(nextSurvey) }, SURVEY_GAP_MS + Math.random() * SURVEY_SPREAD_MS)
}
async function surveyOne() {
  if (Date.now() < surveyPausedUntil) return
  // while GEM Shell scans the channels, the survey waits (one reader at a time; the scan reads what it would)
  if ((yt as any)?.scanState?.(SCAN_KIND)?.running) return
  // 0.4.0: on any of GEM YT's pages (not in Standard mode)
  // not on a channel's page either: what you opened goes first (and GEM Shell reads one at a time)
  if (mode.value === 'standard' || mode.value === 'channel' || problem.value || readsRunning || reading.size || loading.value || !yt) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const now = Date.now()
  const order = ordered.value.map(c => c.id)
  // 0.13.0: every other turn (or when no channel's videos are due), a channel's featured channels for Discover
  const featuredTurn = surveyTurn++ % 2 === 1
  const id = featuredTurn ? null : surveyNext(ledger.value, order, x => readNow.has(x) || !channelParam(channels.value.find(c => c.id === x)!), now)
  const c = id ? channels.value.find(x => x.id === id) : undefined
  if (!c) {
    // the same day's cap as the survey's reads (memory.ts)
    if (ledger.value.survey.day === Math.floor(now / 86400_000) && ledger.value.survey.count >= SURVEY_PER_DAY) return
    const fid = featuredNext(discoverDoc.value, order, x => !channelParam(channels.value.find(c => c.id === x)!), now)
    const fc = fid ? channels.value.find(x => x.id === fid) : undefined
    if (!fc) return
    noteSurvey(ledger.value, now)
    await readFeatured(fc)
  } else {
    noteSurvey(ledger.value, now)
    surveyId.value = c.id
    try { await loadVideos(c, false, 0, LATER) } finally { surveyId.value = null }
  }
  if (lastMiss === 'no-data' || lastMiss === 'failed' || lastMiss === 'needs-update') {
    if (++surveyMisses >= 2) { surveyPausedUntil = Date.now() + SURVEY_PAUSE_MS; surveyMisses = 0; console.warn(`[GEM YT] YouTube stopped answering the survey (twice: ${lastMiss}): paused for an hour`) }
  } else surveyMisses = 0
}

// ── 1.0, part 3: the header ribbon (parts/Ribbon.vue) ─────────────────────────────────────────────────────────────
// Across the top of GEM YT's pages: the banner of the creator you watched last (one of yours), your own picture, or the
// theme's colours; the plaque on it. Per copy. Hidden when the widget is low.
const ribbonLook = ref<RibbonLook>('banner')
const ribbonPicture = ref<RibbonPicture | null>(null)
const ribbonChannel = ref<string | null>(null)
const RIBBON = { width: 1600, height: 265 }
const rootEl = ref<HTMLElement | null>(null)
const rootH = ref(1000)
let rootObs: ResizeObserver | null = null
watch(rootEl, el => {
  rootObs?.disconnect()
  if (!el) return
  rootObs = new ResizeObserver(() => {
    rootH.value = el.clientHeight
    // 0.11.0: the layout for the widget's size (not before it's measured)
    if (el.clientWidth > 0) {
      const size = sizeFor(el.clientWidth, layoutSize.value)
      if (size !== layoutSize.value) { layoutSize.value = size; showSizeLayout() }
    }
  })
  rootObs.observe(el)
}, { flush: 'post' })
const ribbonShown = computed(() => ribbonLook.value !== 'off' && rootH.value >= 420)
watch(playingChannel, c => {
  if (!c || c.id === ribbonChannel.value) return
  ribbonChannel.value = c.id
  save({ ribbonChannel: c.id })
})
/** Whose banner: the last one watched, else the first of your channels with a banner */
const ribbonOwner = computed(() => {
  void ledgerVersion.value
  const has = (id: string) => !!ledger.value.channels[id]?.banner
  const id = ribbonChannel.value && has(ribbonChannel.value) ? ribbonChannel.value : channels.value.find(c => has(c.id))?.id
  return id ? { id, name: channels.value.find(c => c.id === id)?.name, banner: ledger.value.channels[id]!.banner! } : null
})
/** The banner, made wide for the ribbon (only once GEM Shell read it this session); meanwhile the tiles' size */
const ribbonBanner = ref<string | undefined>()
watch(() => (ribbonShown.value && ribbonLook.value === 'banner' ? ribbonOwner.value?.banner : undefined), async src => {
  ribbonBanner.value = undefined
  if (!src || !yt) return
  picture(src, BANNER, OPEN)
  const r = await yt.image(src, RIBBON).catch(() => null)
  if (r?.ok && ribbonOwner.value?.banner === src) ribbonBanner.value = r.url
}, { immediate: true })
const ribbonImage = computed(() => {
  if (ribbonLook.value === 'picture') return ribbonPicture.value?.url
  if (ribbonLook.value !== 'banner') return undefined
  const src = ribbonOwner.value?.banner
  return ribbonBanner.value ?? (src ? pictures.get(src) : undefined)
})
function snack(text: string) { void (sdk as any)?.ui?.()?.snack?.({ text }) }
function setRibbon(look: RibbonLook) {
  ribbonLook.value = look
  save({ ribbon: look })
}
/** Your picture: the file dialog, then GEM Shell makes it ribbon-sized and keeps it (the old one deleted) */
async function chooseRibbonPicture() {
  const ui = (sdk as any)?.ui?.()
  if (!ui?.openFiles || !sdk?.mediaImageCreate) { snack('This GEM Shell can’t make pictures for GEM YT (it needs the Media permission).'); return }
  const paths: string[] | null = await ui.openFiles({ title: 'A picture for the ribbon', filters: [{ label: 'Pictures', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff'] }] })
  if (!paths?.length) return
  try {
    const img = await sdk.mediaImageCreate({ type: 'file', path: paths[0] } as any, { ...RIBBON, fit: 'cover', storage: 'persistent' })
    const old = ribbonPicture.value
    ribbonPicture.value = { assetId: img.assetId, url: img.url }
    ribbonLook.value = 'picture'
    save({ ribbon: 'picture', ribbonPicture: ribbonPicture.value })
    if (old && old.assetId !== img.assetId) void sdk.mediaImageDelete?.(old.assetId).catch(() => { })
  } catch (e: any) {
    snack(e?.code === 'E_FORMAT' || e?.code === 'E_NOT_IMAGE' ? 'GEM Shell can’t read that picture (JPEG, PNG, GIF, BMP or TIFF).' : `The picture wasn’t made (${e?.code ?? e?.message ?? e}).`)
  }
}
function ribbonMenu(ev: MouseEvent) {
  const ui = (sdk as any)?.ui?.()
  if (!ui?.openMenu) return
  const owner = ribbonOwner.value
  ui.openMenu({
    at: ev.type === 'contextmenu' ? ev : (ev.currentTarget as HTMLElement),
    label: 'The ribbon',
    items: () => [
      { type: 'header', label: 'The ribbon' },
      { id: 'banner', label: 'The creator’s banner', detail: owner?.name ? `${owner.name}: the last one you watched` : 'The last creator you watched', check: 'radio', checked: ribbonLook.value === 'banner' },
      { id: 'picture', label: ribbonPicture.value ? 'Your picture' : 'Your picture…', detail: ribbonPicture.value ? undefined : 'Choose one on this computer', check: 'radio', checked: ribbonLook.value === 'picture' },
      { id: 'theme', label: 'The theme’s colours', check: 'radio', checked: ribbonLook.value === 'theme' },
      ...(ribbonPicture.value ? [{ id: 'another', label: 'Another picture…', icon: '🖼' }] : []),
      { type: 'separator' },
      { id: 'off', label: 'Hide the ribbon', icon: '✕', detail: 'The bar’s ▭ shows it again' },
    ],
    onToggle: (row: { id: string }) => pickRibbon(row.id),
    onPick: (row: { id: string }) => pickRibbon(row.id),
  })
}
function pickRibbon(id: string) {
  if (id === 'another' || (id === 'picture' && !ribbonPicture.value)) void chooseRibbonPicture()
  else if (id === 'banner' || id === 'picture' || id === 'theme' || id === 'off') setRibbon(id)
}

// ── Life ────────────────────────────────────────────────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!web) { status.value = 'GEM Shell can’t show web pages here.' }
  await state?.ready.catch(() => { })
  await settings?.ready.catch(() => { })
  const savedPage = state?.value.value?.page ?? state?.value.value?.mode
  if (isPage(savedPage)) lastPage.value = savedPage
  // 1.0: the watch page's tiles (on unless turned off) and their layout
  tilesOn.value = state?.value.value?.tiles !== false
  barFolded.value = state?.value.value?.barFolded === true   // 0.19.0
  compactSaved.value = readCompact(state?.value.value?.compact)   // 0.20.0
  // 0.11.0: a layout per size (0.10's one layout is the wide one)
  const saved = state?.value.value?.watchLayouts as Record<string, unknown> | null | undefined
  const kept: Partial<Record<LayoutSize, WatchLayout>> = {}
  for (const size of LAYOUT_SIZES) {
    const raw = saved && typeof saved === 'object' ? saved[size] : size === 'wide' ? state?.value.value?.watchLayout : undefined
    if (raw) kept[size] = readLayout(raw, hubGrid.cols, hubGrid.rows, size)
  }
  layouts.value = kept
  const told = state?.value.value?.sizesTold
  if (Array.isArray(told)) sizesTold.value = told.filter((x: unknown): x is string => typeof x === 'string').slice(0, 3)
  if (rootEl.value?.clientWidth) layoutSize.value = sizeFor(rootEl.value.clientWidth, null)
  showSizeLayout()
  // 1.0, part 3: the ribbon
  const rl = state?.value.value?.ribbon
  if (rl === 'banner' || rl === 'picture' || rl === 'theme' || rl === 'off') ribbonLook.value = rl
  const rp = state?.value.value?.ribbonPicture as RibbonPicture | null | undefined
  if (rp && typeof rp.assetId === 'string' && typeof rp.url === 'string' && rp.url.startsWith('/')) ribbonPicture.value = { assetId: rp.assetId, url: rp.url }
  if (ribbonLook.value === 'picture' && !ribbonPicture.value) ribbonLook.value = 'banner'
  const rc = state?.value.value?.ribbonChannel
  if (typeof rc === 'string') ribbonChannel.value = rc
  mode.value = inToolbar.value || state?.value.value?.mode === 'standard' || !yt ? 'standard' : lastPage.value   // 0.18.0: the toolbar plays
  const f = state?.value.value?.filter
  if (isFilter(f)) filter.value = f
  const a = state?.value.value?.aisle
  if (typeof a === 'string') tagId.value = a
  const sb = state?.value.value?.sortBy
  if (SORTS.some(x => x.value === sb)) sortBy.value = sb as SortBy
  const pk = state?.value.value?.picked
  if (Array.isArray(pk)) picked.value = pk.filter((x: unknown): x is string => typeof x === 'string').slice(0, 1000)
  if (yt) await loadMemory()
  if (mode.value === 'standard') await showStandard()
  else { void loadChannels(false); if (mode.value === 'discover') void learnSuggestions(false); if (mode.value === 'feed') loadFeeds(false) }
  if (yt) nextSurvey()
  void readEncouraged()
})

onBeforeUnmount(() => {
  scanOff?.(); scanOff = null
  closePanel()
  if (compactPlayer.value) try { (sdk as any)?.ui?.()?.setHeaderStatus?.(null) } catch { /* a preview */ }
  for (const off of offs) off()
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  queue.length = 0
  wanted = []
  alive = false
  if (surveyTimer) clearTimeout(surveyTimer)
  surveyTimer = null
  listMenu?.close()
  clearInterval(nowTimer)
  if (discoverTimer) { clearTimeout(discoverTimer); discoverTimer = null; void saveDiscover() }
  // 0.3.0: what's pending is saved now
  if (saveTimer2) { clearTimeout(saveTimer2); saveTimer2 = null; void saveMemory() }
  if (ledgerTimer) { clearTimeout(ledgerTimer); ledgerTimer = null; void saveLedger() }
  rootObs?.disconnect()
  stopWatching()
  state?.release()
  surface?.dispose()
})
</script>

<template>
  <div ref="rootEl" class="gem-yt" :class="{ 'in-sidebar': props.placement?.context === 'sidebar', 'in-toolbar': inToolbar }">
    <!-- 0.18.0: the toolbar's strip (everything else is hidden there; the frame stays, 1 px) -->
    <ToolbarStrip v-if="inToolbar" :title="stripTitle" :avatar="stripAvatar" :initial="stripInitial" :watching="watchingVideo"
                  :playing="!!media?.playing" :muted="sound.muted" :can-next="!!nextUrl" :can-media="canMedia" :panel="panelView"
                  @toggle="toggleMedia" @next="playNext" @mute="toggleMute" @expand="openPanel" />
    <div v-show="!barHidden" class="bar" :class="{ std: mode === 'standard' }">
      <template v-if="mode === 'standard'">
        <!-- 0.19.0: the standard bar restyled: the page's moves in one group, then chips -->
        <div class="seg" role="group" aria-label="Page">
          <button v-gex-tooltip="'Back'" @click="surface?.back()">‹</button>
          <button v-gex-tooltip="'Forward'" @click="surface?.forward()">›</button>
          <button v-gex-tooltip="'Reload'" @click="surface?.reload()">⟳</button>
          <button v-gex-tooltip="'YouTube’s home'" @click="home">⌂</button>
        </div>
        <span class="spacer"></span>
        <span v-if="mobile" class="badge" v-gex-tooltip="{ content: 'YouTube’s mobile site', detail: 'The widget is narrow. Settings: always desktop' }">📱</span>
        <button v-if="sound.playing || sound.muted" class="chip" @click="surface?.mute?.(!sound.muted)"
                v-gex-tooltip="sound.muted ? 'Sound off: turn it on' : 'Playing: turn the sound off'">{{ sound.muted ? '🔇' : '🔊' }}</button>
        <button v-if="shield" class="chip shield" :class="{ off: !shield.on }" @click="showBlocking"
                v-gex-tooltip="shield.on ? `${shield.page} ads and trackers blocked on this page` : 'Ad blocking is off here'">
          🛡 {{ shield.on ? shield.page : 'off' }}
        </button>
        <button class="chip" :class="{ on: tilesOn }" @click="toggleTiles"
                v-gex-tooltip="tilesOn ? { content: 'Videos in tiles', detail: 'The video, Up next, the comments, the channel. Click for YouTube’s whole page' } : { content: 'YouTube’s whole page', detail: 'Click for videos in tiles' }">▤ Tiles</button>
        <button v-if="yt" class="chip mode" @click="showPages" v-gex-tooltip="{ content: 'GEM YT', detail: 'Your channels: Feed, Creators, Discover' }">▦ GEM YT</button>
      </template>
      <template v-else>
        <!-- 0.4.0: GEM YT's pages -->
        <div class="grp pages" role="tablist" aria-label="Page">
          <span class="grp-label">Page</span>
          <button v-for="p in PAGES" :key="p.value" class="btn page-btn" :class="{ on: mode === p.value }" role="tab"
                  :aria-selected="mode === p.value" :title="p.title" @click="mode === p.value ? undefined : showPage(p.value)">{{ p.label }}</button>
        </div>
        <!-- GEM Shell reading your channels once (a job: its card, with Pause and Stop, is in the operations tray while GEM YT isn't on screen) -->
        <span v-if="scanInfo?.running" class="scan-chip" role="status"
              v-gex-tooltip="{ content: 'Scanning your channels', detail: 'GEM Shell reads each channel once (videos, tags, banner), slowly, even with GEM YT closed. Pause or stop it in the operations tray.' }">
          <span class="scan-dot" aria-hidden="true"></span>{{ scanInfo.done }} / {{ scanInfo.total }}
        </span>
        <!-- 0.3.6: the bar in labelled groups: Tag (which channels; 0.4.0: the aisles are tags), Show (which of them), the search, Channels (the list) -->
        <button v-if="mode === 'channel'" class="btn" :title="channelBackLabel" @click="closeChannel">‹ {{ channelBackLabel }}</button>
        <template v-if="mode !== 'discover' && mode !== 'channel'">
        <div v-if="channels.length" class="grp" role="group" aria-label="Tag">
          <span class="grp-label">Tag</span>
          <label class="glu-picker pick" title="Your tags: your channels grouped your way">
            <span>▤</span>
            <select :value="tagId ?? (picked.length ? '__picked' : '')" @change="setTag">
              <option value="">Every channel ({{ channels.length }})</option>
              <option v-if="picked.length && !tagId" value="__picked">Picked channels ({{ picked.length }})</option>
              <option v-for="a in tags.aisles" :key="a.id" :value="a.id">{{ a.name }} ({{ a.channels.length }})</option>
              <optgroup v-if="tagSuggestions.length" label="Your creators’ own tags">
                <option v-for="t in tagSuggestions" :key="t.term" :value="`topic:${t.term}`">{{ t.term }} ({{ t.channels.length }})</option>
              </optgroup>
              <option value="__new">+ New tag…</option>
            </select>
          </label>
          <template v-if="naming">
            <input ref="nameInput" v-model="nameDraft" class="tag-name" maxlength="40"
                   :placeholder="naming.mode === 'rename' ? 'The tag’s name' : 'New tag’s name'"
                   @keydown.enter.prevent="commitName" @keydown.esc.prevent="naming = null" />
            <button class="btn icon" title="Done" @click="commitName">✓</button>
            <button class="btn icon" title="Cancel" @click="naming = null">✕</button>
          </template>
          <template v-else-if="currentTag">
            <button class="btn icon" title="Rename this tag" @click="startNaming({ mode: 'rename' })">✎</button>
            <button v-if="!confirmingDelete" class="btn icon" title="Delete this tag (you still follow its channels)" @click="confirmingDelete = true">🗑</button>
            <template v-else>
              <span class="hint">Delete “{{ currentTag.name }}”?</span>
              <button class="btn danger" @click="deleteTag">Delete</button>
              <button class="btn" @click="confirmingDelete = false">Keep</button>
            </template>
          </template>
          <template v-else-if="picked.length">
            <button class="btn" title="Keep the picked channels as a tag" @click="savePick">Save as tag</button>
            <button class="btn icon" title="Clear the pick: every channel again" @click="setPicked([])">✕</button>
          </template>
        </div>
        <template v-if="mode !== 'feed'">
        <div v-if="channels.length" class="grp" role="group" aria-label="Order">
          <span class="grp-label">Order</span>
          <label class="glu-picker pick" title="The order of your channels">
            <span>⇅</span>
            <select :value="sortBy" @change="setSort">
              <option v-for="o in SORTS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button class="btn icon" title="Back to the start" @click="toStart">⇤</button>
        </div>
        <div v-if="channels.length" class="grp" role="group" aria-label="Show">
          <span class="grp-label">Show</span>
          <label class="glu-picker pick" title="Which of your channels the page shows (and the list)">
            <span>⚲</span>
            <select :value="filter" @change="setFilter">
              <option v-for="f in FILTERS" :key="f.value" :value="f.value">{{ f.label }} ({{ filterCounts.get(f.value) ?? 0 }})</option>
              <option v-if="filter.startsWith('topic:') && !topicChoices.some(t => t.value === filter)" :value="filter">{{ filterLabel(filter) }} (0)</option>
            </select>
          </label>
          <template v-if="hiddenHere">
            <span class="hint">{{ hiddenHere }} hidden</span>
            <button class="btn" title="Clear the filter and the search" @click="showEverything">Show all</button>
          </template>
        </div>
        <span v-if="channels.length" class="search-wrap">
          <input v-model="query" class="search" type="search" placeholder="⌕  Search your channels"
                 title="Names, descriptions, keywords and the titles of the videos known" />
        </span>
        <span v-else class="spacer"></span>
        <div v-if="channels.length" class="grp" role="group" aria-label="Channels">
          <span class="grp-label">Channels</span>
          <button v-if="hasMenu" class="btn list-btn"
                  :title="currentTag ? `Your channels: check them to put them in “${currentTag.name}”` : 'Your channels: go to one, or check some to show only those'"
                  @click="openChannelList">
            ▦ {{ currentTag ? 'Edit the tag' : picked.length ? `Picked (${picked.length})` : 'Go to or pick' }} ▾
          </button>
          <label v-else class="glu-picker pick" title="Open a channel’s videos">
            <span>▦</span>
            <select :value="''" @change="jump">
              <option value="" disabled>Go to…</option>
              <option v-for="c in byName" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
        </div>
        </template>
        <span v-else class="spacer"></span>
        </template>
        <span v-else class="spacer"></span>
        <span v-if="loading || stocking" class="hint">Reading…</span>
        <button v-if="ribbonLook === 'off'" class="btn icon" title="Show the ribbon (your picture, the creator’s banner, the plaque)" @click="setRibbon('banner')">▭</button>
        <button class="btn icon" @click="reloadHere"
                :disabled="loading || stocking" title="Read YouTube again">⟳</button>
        <button class="btn mode-btn" @click="showStandard()" title="Standard mode: YouTube’s own pages">▶ YouTube</button>
      </template>
    </div>
    <div v-if="status && mode === 'standard'" class="status">{{ status }}</div>

    <!-- 0.4.0: the GEM parts -->
    <div v-if="mode === 'creators' || mode === 'discover' || mode === 'feed' || mode === 'channel'" class="page">
      <Ribbon v-if="ribbonShown && mode !== 'channel'" :look="ribbonLook === 'off' ? 'theme' : ribbonLook" :image="ribbonImage" :credit="ribbonOwner?.name"
              :channels="channels.length" :encouraged="encouragedCount" @menu="ribbonMenu" />
      <div v-if="problem" class="note">
        <p>{{ problem.text }}</p>
        <button v-if="problem.action === 'retry'" @click="retry">Try again</button>
        <button v-if="problem.action === 'standard'" @click="showStandard()">Standard mode</button>
      </div>
      <div v-else-if="loading && !channels.length" class="note"><p>Reading your channels…</p></div>
      <ChannelVideosPart v-else-if="mode === 'channel'" :card="channelCard" :section="channelSection" :now="now" :back-label="channelBackLabel"
                         :more="channelMore" :sorts="channelSorts" :sort="channelSort" @sort="setChannelSort" @back="closeChannel" @play="playVideo" @more="channelMoreVideos" @open-page="openChannelPage" />
      <FeedPart v-else-if="mode === 'feed'" :sections="feedSections" @play="playVideo" @open-channel="openCreator" @shown="onFeedShown" />
      <CreatorsPart v-else-if="mode === 'creators'" ref="creatorsPart" :cards="creatorCards" :tags="tags.aisles" :now="now" :empty="creatorsEmpty"
                    @open="openCreator" @range="onCreatorsRange" @toggle-tag="toggleIn" @new-tag="newTagFor" @show-tag="showTag" @show-topic="showTopic" />
      <DiscoverPart v-else :cards="discoverCards" :now="now" :hidden="hiddenCount(discoverDoc)" :learning="learning" :picture-of="discoverPicture"
                    @open="openSuggested" @hide="hideSuggestion" @hide-by="hideAllFeaturedBy" @play="playVideo" @unhide="unhideSuggestions" @refresh="learnSuggestions(true)" />
    </div>
    <div v-show="mode === 'standard'" ref="frame" class="frame">
      <!-- 1.0: the watch page's tiles, inside the surface's element (our page shows wherever YouTube's parts aren't) -->
      <!-- 0.16.0: in the sidebar, the compact player (the video, then Up next | Queue; ⤢ the list takes the space) -->
      <CompactTiles v-if="showTiles && compactPlayer" :now-line="nowLine" :now-what="nowWhat" :now-state="nowState" :queue="nowInfo.queue" :pip="pipState" :can-next="!!nextUrl" :bar-folded="barFolded" :saved="compactSaved" @save="keepCompact" @fold-bar="toggleBar" @pip="togglePip" @next="playNext" @regions="placeRegions" />
      <WatchTiles v-if="showTiles && !compactPlayer" :layout="watchLayout" :now-line="nowLine" :now-what="nowWhat" :now-state="nowState" :card="playingCard" :playing="playingInfo" :tags="tags.aisles" :now="now" :queue="nowInfo.queue"
                  :votes="votes" :quick="quickComment" @quick="quickComment = $event" @credit="openVotesCredit" :pip="pipState" @pip="togglePip" :bar-folded="barFolded" @fold-bar="toggleBar"
                  :encouraged="nowInfo.channelHandle || nowInfo.channelName ? creatorEncouraged : null" @encourage="encourageMenu"
                  @update:layout="setWatchLayout" @regions="placeRegions" @open="openPlayingChannel" @open-handle="openHandle"
                  @toggle-tag="toggleIn" @new-tag="newTagFor" @show-tag="(id: string) => { showPage('creators'); showTag(id) }" />
    </div>
  </div>
</template>

<style scoped>
.gem-yt { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* 0.16.1: the sidebar makes a widget as tall as its content: GEM YT fills what it's given (the page, the tiles), so it
   takes a height of its own there (else the frame was 0 px tall: no page, no video) */
.gem-yt.in-sidebar { height: max(380px, 100vh); }   /* 0.20.0: as tall as the sidebar lets it (it shrinks to the place's maximum) */
/* 0.18.0: the toolbar: the strip only; the page's frame 1 px, out of view (it plays on: its sound) */
.gem-yt.in-toolbar { height: 100%; }
.gem-yt.in-toolbar > :not(.tb-strip):not(.frame) { display: none !important; }
.gem-yt.in-toolbar > .frame { position: absolute !important; left: 0; top: 0; width: 1px !important; height: 1px !important; overflow: hidden; opacity: 0; pointer-events: none; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 5px 6px; flex: 0 0 auto; }
.bar button { min-width: 2em; }
/* 0.3.6: the bar's groups (a box, a small label) and its buttons in the racks' look */
.grp { position: relative; display: flex; align-items: center; gap: 4px; padding: 13px 5px 4px; border: 1px solid #ffffff1f; border-radius: 8px; background: #ffffff08; }
.grp-label { position: absolute; top: 2px; left: 8px; color: #9ea2aa; font: 700 8px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; pointer-events: none; }
.search-wrap { display: flex; flex: 1 1 auto; justify-content: center; min-width: 160px; }
.search-wrap .search { width: min(420px, 100%); height: 30px; font-size: 12px; border-radius: 15px; padding: 0 14px; }
/* 0.11.1: a narrow widget: the bar's groups fill their rows (justified), their pickers and buttons stretch */
.bar { container-type: inline-size; }
@container (max-width: 760px) {
  .bar > .grp, .bar > .search-wrap { flex: 1 1 auto; }
  .bar > .grp > .pick, .bar > .grp > .list-btn { flex: 1 1 auto; }
  .bar > .grp > .pick select { flex: 1 1 auto; min-width: 0; }
  .bar > .grp.pages > .page-btn { flex: 1 1 0; }
  .bar > .search-wrap .search { width: 100%; }
}
.btn { height: 26px; padding: 0 10px; border: 1px solid #ffffff2e; border-radius: 6px; color: #e9eaee; background: #0b1117c9; font-size: 11px; cursor: pointer; white-space: nowrap; }
.btn:hover:not(:disabled) { border-color: #ffffff55; background: #18212b; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.icon { min-width: 26px; padding: 0 6px; }
.btn.danger { border-color: #d9484888; color: #ffb4b4; }
.mode-btn { border-color: color-mix(in srgb, var(--glu-accent, #ff4545) 55%, transparent); }
.pick { height: 26px; min-width: 120px; }
/* 0.2.4: the bar is outside the skinned surface (no --glu-* colours there): the list's own, dark */
.pick select { color: #f1f1f3; color-scheme: dark; }
/* 0.3.3: naming a tag */
.search { width: 150px; height: 24px; padding: 0 7px; border: 1px solid #ffffff30; border-radius: 4px; color: #f1f1f3; background: #15161a; font-size: 11px; }
.list-btn { height: 26px; padding: 0 9px; white-space: nowrap; }
.tag-name { width: 150px; height: 24px; padding: 0 6px; border: 1px solid #ffffff30; border-radius: 4px; color: #f1f1f3; background: #15161a; font-size: 11px; }
.pick option { color: #f1f1f3; background: #1b1c21; }
.hint { font-size: 11px; opacity: .7; padding: 0 4px; }
.spacer { flex: 1 1 auto; }
.badge { opacity: 0.7; padding: 0 2px; }
.status { font-size: 12px; padding: 2px 6px; opacity: 0.8; flex: 0 0 auto; }
.frame { flex: 1 1 auto; min-height: 0; position: relative; }
.bar button.on { border-color: var(--glu-accent, #ff4545); }
/* 0.19.0: the standard bar: a segmented group for the page's moves, chips for the rest */
.bar.std { gap: 6px; padding: 6px 8px; }
.bar.std .seg { display: flex; height: 28px; overflow: hidden; border: 1px solid #ffffff24; border-radius: 8px; background: #0b1117d9; }
.bar.std .seg button { width: 30px; min-width: 0; height: 100%; padding: 0; border: 0; border-radius: 0; color: #e9eaee; background: transparent; font-size: 15px; line-height: 1; cursor: pointer; }
.bar.std .seg button + button { border-left: 1px solid #ffffff14; }
.bar.std .seg button:hover { background: #ffffff14; }
.bar.std .seg button:active { background: #ffffff22; }
.bar.std .chip { display: inline-flex; align-items: center; gap: 5px; height: 28px; min-width: 0; padding: 0 11px; border: 1px solid #ffffff24; border-radius: 14px;
  color: #e9eaee; background: #0b1117d9; font: 600 11px/1 "Segoe UI", system-ui, sans-serif; letter-spacing: .02em; white-space: nowrap; cursor: pointer; }
.bar.std .chip:hover { border-color: #ffffff4d; background: #18212b; }
.bar.std .chip.on { border-color: color-mix(in srgb, var(--glu-accent, #ff4545) 70%, transparent); color: #fff; background: color-mix(in srgb, var(--glu-accent, #ff4545) 28%, #0b1117); }
.bar.std .chip.mode { border-color: color-mix(in srgb, var(--glu-accent, #ff4545) 45%, transparent); }
.bar.std .chip.shield { font-variant-numeric: tabular-nums; }
.scan-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border: 1px solid #ffffff24; border-radius: 12px;
  color: var(--gex-fg-muted, #a6a9b1); font: 600 11px/1 "Segoe UI", system-ui, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.scan-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--glu-accent, #ff4545); animation: scan-pulse 1.6s ease-in-out infinite; }
@keyframes scan-pulse { 50% { opacity: .3; } }
/* 0.4.0: a GEM part's page; the page switch */
.page { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.page > * { flex: 1 1 auto; min-height: 0; }
.page > .note { flex: 0 0 auto; }
.page > .ribbon { flex: 0 0 auto; }
.page-btn.on { border-color: var(--glu-accent, #ff4545); color: #fff; background: color-mix(in srgb, var(--glu-accent, #ff4545) 30%, #0b1117); }
.shield { min-width: 3.5em; font-variant-numeric: tabular-nums; }
.shield.off { opacity: 0.6; }
.note { display: grid; gap: 10px; justify-items: center; max-width: 420px; margin: 18% auto 0; text-align: center; }
.note p { margin: 0; }
</style>
