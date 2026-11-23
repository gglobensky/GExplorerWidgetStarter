<script setup lang="ts">
// GEM YT 0.2 (2026-11-22). Two modes, per copy (its state):
//   - GEM YT (racks): the store floor of library-ui 3.9.0 (shared/library-ui): one rack per channel you follow, its
//     poster on top (avatar, name, subscribers), its latest videos as DVD cases lying on their side. A click on a rack
//     opens its department; a click on a case plays the video (Standard mode, on its page). The data is YouTube's own
//     pages read by GEM Shell with this widget's rules (sdk.pageData('youtube'): rules/youtube.json; GEM Shell asks
//     once), pictures through GEM Shell's image cache (pageData().image).
//   - Standard: the real youtube.com in a web surface (0.1): back, forward, reload, home, sound, the ad blocking shield.
// Racks are filled a few at a time (GEM Shell paces the reads: one at a time, 8 s apart): the first FIRST_RACKS
// channels at once, any other when its department is opened. GEM Shell keeps what it read (subscriptions 6 h, a
// channel's videos 1 h: the rules' `fresh`); ⟳ reads again.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { LibraryFloor, skinClass, skinStyle } from '@shared/library-ui'
import { BROADCAST } from './skin'
import { boxOf, captionOf, channelOf, channelParam, clock, shelfOf, videoOf, type Channel, type Video, type YtVideo } from './racks'

const HOME = 'https://www.youtube.com/'
const FIRST_RACKS = 8
/** 0.2.2: the pictures of every box a rack shows (6 shelves of 3); a department asks for all of its own. */
const RACK_PICTURES = 18
const THUMB = { width: 320, height: 180 }
const AVATAR = { width: 96, height: 96 }

const sdk = inject<WidgetSdk>('widgetSdk')
const web = (sdk as any)?.web?.()
const yt = (sdk as any)?.pageData?.('youtube')
const settings = sdk?.settings?.()
const data = sdk?.instanceData?.()
const state = data?.live('state', () => ({ url: HOME, mode: 'racks' as Mode }))

type Mode = 'racks' | 'standard'
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

function save(patch: Partial<{ url: string; mode: Mode }>) {
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
  if (!channels.value.length && !problem.value) void loadChannels(false)
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
const loading = ref(false)
const activeId = ref<string | null>(null)
const reading = reactive(new Set<string>())
/** What stops the racks: the reason sdk.pageData gave, in words, and what can be done. */
const problem = ref<{ text: string; action?: 'standard' | 'retry' } | null>(null)
const floor = ref<{ jumpTo(id: string): void } | null>(null)

const shelves = computed(() => channels.value.map(c => {
  const list = videos.get(c.id)
  const boxes = list?.map((v, i) => boxOf(v, c, i, v.thumbnail ? pictures.get(v.thumbnail) : undefined))
  return shelfOf(c, boxes, c.avatar ? pictures.get(c.avatar) : undefined)
}))
const activeShelf = computed(() => shelves.value.find(s => s.id === activeId.value) ?? null)
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

// Pictures: 4 at a time (GEM Shell's image workers), in the order asked
const queue: Array<{ url: string; size: { width: number; height: number } }> = []
let running = 0
function picture(url: string | undefined, size: { width: number; height: number }) {
  if (!url || pictures.has(url) || queue.some(q => q.url === url)) return
  queue.push({ url, size })
  pump()
}
let warned = 0
function pump() {
  while (running < 4 && queue.length) {
    const { url, size } = queue.shift()!
    running++
    yt.image(url, size).then((r: any) => {
      if (r?.ok) pictures.set(url, r.url)
      else if (warned++ < 3) console.warn('[GEM YT] picture not made:', url, r)
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
  for (const c of channels.value) picture(c.avatar, AVATAR)
  if (fresh) videos.clear()
  // The first racks, one after another (GEM Shell paces them)
  for (const c of channels.value.slice(0, FIRST_RACKS)) await loadVideos(c, fresh, RACK_PICTURES)
}

/** A channel's latest videos (and the pictures of its first `pictures` ones; all: -1). */
async function loadVideos(c: Channel, fresh: boolean, pictureCount = -1) {
  if (reading.has(c.id)) return
  const param = channelParam(c)
  if (!param) { videos.set(c.id, []); return }
  if (!videos.has(c.id) || fresh) {
    reading.add(c.id)
    const r = await yt.read('channel-videos', { channel: param }, { fresh })
    reading.delete(c.id)
    if (!r.ok) {
      if (r.reason === 'declined' || r.reason === 'busy') { problem.value = explain(r); return }
      videos.set(c.id, [])
      return
    }
    videos.set(c.id, (r.items.video ?? []).map(videoOf).filter(Boolean) as Video[])
  }
  const list = videos.get(c.id) ?? []
  for (const v of pictureCount < 0 ? list : list.slice(0, pictureCount)) picture(v.thumbnail, THUMB)
}

async function selectShelf(id: string) {
  activeId.value = id
  const c = channels.value.find(x => x.id === id)
  if (c) await loadVideos(c, false)
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
  void nextTick(() => floor.value?.jumpTo(id))
}

function retry() { problem.value = null; void loadChannels(false) }

// ── Life ────────────────────────────────────────────────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!web) { status.value = 'GEM Shell can’t show web pages here.' }
  await state?.ready.catch(() => { })
  await settings?.ready.catch(() => { })
  mode.value = state?.value.value?.mode === 'standard' || !yt ? 'standard' : 'racks'
  if (mode.value === 'standard') await showStandard()
  else void loadChannels(false)
})

onBeforeUnmount(() => {
  for (const off of offs) off()
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  queue.length = 0
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
        <strong v-else class="brand">GEM YT</strong>
        <label v-if="channels.length" class="glu-picker pick" title="Go to a channel’s rack">
          <span>▦</span>
          <select :value="''" @change="jump">
            <option value="" disabled>Channels</option>
            <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <span class="spacer"></span>
        <span v-if="loading || reading.size" class="hint">Stocking shelves…</span>
        <button @click="activeShelf ? loadVideos(channels.find(c => c.id === activeId)!, true) : loadChannels(true)"
                :disabled="loading || reading.size > 0" title="Read YouTube again">⟳</button>
        <button class="mode" @click="showStandard()" title="Standard mode: YouTube’s own pages">▶ YouTube</button>
      </template>
    </div>
    <div v-if="status && mode === 'standard'" class="status">{{ status }}</div>

    <div v-if="mode === 'racks'" class="racks gem-library-surface" :class="surfaceClass" :style="surfaceStyle">
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
        :active-shelf="activeShelf"
        :caption="captionOf"
        @select-shelf="selectShelf"
        @open="play"
      >
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
.brand { padding: 0 6px; letter-spacing: .08em; }
.pick { height: 26px; min-width: 120px; }
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
.watched { position: absolute; z-index: 4; left: 0; bottom: 0; height: 3px; background: #ff3b3b; }
</style>
