<script setup lang="ts">
// A TEST WIDGET for web surfaces (GEM Shell H9): a toolbar (address, Back / Forward / Reload, Add site) and a surface.
// 0.1.2 (2026-11-22): the ad blocking shield (GEM Shell's counts; its click opens GEM Shell's menu).
// 0.1.3 (2026-11-22): 🔊 / 🔇 while the page plays sound (s.playing, s.onAudio, s.mute).
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

const sdk = inject<WidgetSdk>('widgetSdk')
const web = (sdk as any)?.web?.()
const frame = ref<HTMLElement | null>(null)
const address = ref('https://www.lemonde.fr/')
const status = ref('')
let surface: any = null
let off: (() => void) | null = null
let offBlocked: (() => void) | null = null
let offAudio: (() => void) | null = null
// The sound button: shown while the page plays sound or is muted (older GEM Shells: never)
const sound = ref<{ playing: boolean; muted: boolean }>({ playing: false, muted: false })
// The shield: shown when GEM Shell has ad blocking (older ones: blocked is undefined)
const shield = ref<{ page: number; on: boolean } | null>(null)

onMounted(async () => {
  if (!web) { status.value = 'sdk.web() is missing (Web not declared?)'; return }
  const s = await web.surface(frame.value!, { url: address.value })
  if (!s || s.ok === false) { status.value = `Not shown: ${s?.error ?? s?.reason}`; return }
  surface = s
  off = s.onNavigate((u: string) => { address.value = u; status.value = '' })
  if (typeof s.blocked === 'number') {
    shield.value = { page: s.blocked, on: !!s.blocking }
    offBlocked = s.onBlocked?.((b: { page: number; blocking: boolean }) => { shield.value = { page: b.page, on: b.blocking } }) ?? null
  }
  offAudio = s.onAudio?.((a: { playing: boolean; muted: boolean }) => { sound.value = a }) ?? null
})

onBeforeUnmount(() => { off?.(); offBlocked?.(); offAudio?.(); surface?.dispose() })

async function showBlocking(ev: MouseEvent) {
  const r = await surface?.showBlocking?.(ev.currentTarget as HTMLElement)
  if (r && !r.ok) status.value = `No menu: ${r.error ?? r.reason}`
}

async function go() {
  if (!surface) return
  const r = await surface.load(address.value)
  status.value = r.ok ? '' : `Not loaded: ${r.error ?? r.reason}`
}

async function addSite() {
  // The site is the address's domain (type an address, then Add site)
  const host = (() => { try { return new URL(address.value).hostname.replace(/^www\./, '') } catch { return '' } })()
  const r = await web.addDomain(host)
  status.value = r.ok ? `Added ${r.domain}` : `Not added: ${r.error ?? r.reason}`
  if (r.ok) await go()
}
</script>

<template>
  <div class="web-test">
    <div class="bar">
      <button @click="surface?.back()" title="Back">‹</button>
      <button @click="surface?.forward()" title="Forward">›</button>
      <button @click="surface?.reload()" title="Reload">⟳</button>
      <input v-model="address" @keydown.enter="go" spellcheck="false" />
      <button @click="go">Go</button>
      <button @click="addSite" title="Allow the address's site (asks you)">Add site</button>
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
.web-test { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bar { display: flex; gap: 4px; padding: 4px; flex: 0 0 auto; }
.bar input { flex: 1 1 auto; min-width: 0; }
.status { font-size: 12px; padding: 2px 6px; opacity: 0.8; flex: 0 0 auto; }
.frame { flex: 1 1 auto; min-height: 0; position: relative; }
.shield { min-width: 3.5em; font-variant-numeric: tabular-nums; }
.shield.off { opacity: 0.6; }
</style>
