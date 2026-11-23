<script setup lang="ts">
// GEM YT 0.1 (2026-11-22): Standard mode. The real youtube.com in a web surface (GEM Shell's sdk.web()), with a bar:
// back, forward, reload, home, then 🔊 / 🔇 while it plays and the ad blocking shield (its click: GEM Shell's menu).
// Each copy keeps its last page (sdk.instanceData(): a copy placed again from Removed comes back to it).
// Desktop or mobile site: the 'pages' setting (auto by the widget's width: GEM Shell's surface versions).
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

const HOME = 'https://www.youtube.com/'
const sdk = inject<WidgetSdk>('widgetSdk')
const web = (sdk as any)?.web?.()
const settings = sdk?.settings?.()
const data = sdk?.instanceData?.()
const state = data?.live('state', () => ({ url: HOME }))

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

/** The copy's last YouTube page, saved a moment after it settles (not Google's sign-in pages). */
function remember(url: string) {
  if (!state || !isYouTube(url)) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { state.value.value = { url }; state.changed() }, 1500)
}

onMounted(async () => {
  if (!web) { status.value = 'GEM Shell can’t show web pages here.'; return }
  await state?.ready.catch(() => { })
  await settings?.ready.catch(() => { })
  const last = state?.value.value?.url
  const s = await web.surface(frame.value!, { url: isYouTube(last) ? last : HOME, version: pagesSetting() })
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
  const offSettings = settings?.onChange((_values, key) => { if (key === 'pages' || key === null) s.setVersion?.(pagesSetting()) })
  if (offSettings) offs.push(offSettings)
})

onBeforeUnmount(() => {
  for (const off of offs) off()
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  state?.release()
  surface?.dispose()
})

async function home() {
  const r = await surface?.load(HOME)
  if (r && !r.ok) status.value = `Not loaded: ${r.error ?? r.reason}`
}

async function showBlocking(ev: MouseEvent) {
  const r = await surface?.showBlocking?.(ev.currentTarget as HTMLElement)
  if (r && !r.ok) status.value = `No menu: ${r.error ?? r.reason}`
}
</script>

<template>
  <div class="gem-yt">
    <div class="bar">
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
    </div>
    <div v-if="status" class="status">{{ status }}</div>
    <div ref="frame" class="frame"></div>
  </div>
</template>

<style scoped>
.gem-yt { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bar { display: flex; align-items: center; gap: 4px; padding: 4px; flex: 0 0 auto; }
.bar button { min-width: 2em; }
.spacer { flex: 1 1 auto; }
.badge { opacity: 0.7; padding: 0 2px; }
.status { font-size: 12px; padding: 2px 6px; opacity: 0.8; flex: 0 0 auto; }
.frame { flex: 1 1 auto; min-height: 0; position: relative; }
.shield { min-width: 3.5em; font-variant-numeric: tabular-nums; }
.shield.off { opacity: 0.6; }
</style>
