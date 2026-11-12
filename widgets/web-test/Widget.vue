<script setup lang="ts">
// A TEST WIDGET for web surfaces (GEM Shell H9): a toolbar (address, Back / Forward / Reload, Add site) and a surface.
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

const sdk = inject<WidgetSdk>('widgetSdk')
const web = (sdk as any)?.web?.()
const frame = ref<HTMLElement | null>(null)
const address = ref('https://www.lemonde.fr/')
const status = ref('')
let surface: any = null
let off: (() => void) | null = null

onMounted(async () => {
  if (!web) { status.value = 'sdk.web() is missing (Web not declared?)'; return }
  const s = await web.surface(frame.value!, { url: address.value })
  if (!s || s.ok === false) { status.value = `Not shown: ${s?.error ?? s?.reason}`; return }
  surface = s
  off = s.onNavigate((u: string) => { address.value = u; status.value = '' })
})

onBeforeUnmount(() => { off?.(); surface?.dispose() })

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
</style>
