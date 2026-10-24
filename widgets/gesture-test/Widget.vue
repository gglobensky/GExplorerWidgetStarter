<!-- widgets/gesture-test/Widget.vue — TEMPORARY (2026-10-24, release plan B2): see entry.ts -->
<script setup lang="ts">
import { inject, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

const sdk = inject<WidgetSdk>('widgetSdk')
const FILE = 'C:\\Windows\\win.ini'
const results = ref<Array<{ test: string; expect: string; got: string; pass: boolean | null }>>([])
const busy = ref<string | null>(null)

function record(test: string, expect: 'ok' | 'refused', r: any) {
  const ok = !!r?.ok
  const got = ok ? 'ok' : `refused (${r?.reason ?? 'no result'})`
  const pass = expect === 'ok' ? ok : (!ok && r?.reason === 'no-gesture')
  results.value.unshift({ test, expect, got, pass })
}

function later(ms: number, label: string, run: () => Promise<any>, test: string) {
  busy.value = `${label}: ${Math.round(ms / 1000)} s…`
  setTimeout(async () => {
    busy.value = null
    try { record(test, 'refused', await run()) }
    catch (e: any) { results.value.unshift({ test, expect: 'refused', got: `threw: ${e?.message ?? e}`, pass: null }) }
  }, ms)
}

// A. Control: right after the click, in this widget. Must work (a new tab shows win.ini selected).
async function revealNow() {
  try { record('A. reveal right after the click', 'ok', await sdk?.reveal?.(FILE, { newTab: true })) }
  catch (e: any) { results.value.unshift({ test: 'A', expect: 'ok', got: `threw: ${e?.message ?? e}`, pass: null }) }
}

// B. 7 s later: past the 5 s window and the browser's transient activation.
function revealLate() { later(7000, 'reveal', () => sdk!.reveal!(FILE, { newTab: true }), 'B. reveal 7 s after the click') }

// C. 3 s later, but the user clicks another widget meanwhile: the gesture is that widget's now.
function revealAfterOtherClick() { later(3000, 'reveal (click the GExplorer now!)', () => sdk!.reveal!(FILE, { newTab: true }), 'C. reveal after a click in another widget') }

// D. 7 s later, after code fakes a click on this widget's own button (untrusted events).
const fakeTarget = ref<HTMLButtonElement | null>(null)
function revealAfterFakeClick() {
  later(7000, 'fake click, then reveal', async () => {
    const el = fakeTarget.value
    el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return sdk!.reveal!(FILE, { newTab: true })
  }, 'D. reveal after a synthetic click')
}

// E, F. The other view-moving calls, late.
function navigateLate() { later(7000, 'navigate', () => sdk!.navigate!('C:\\', { newTab: true }), 'E. navigate 7 s after the click') }
function openUrlLate() { later(7000, 'openUrl', () => sdk!.openUrl!('https://example.com'), 'F. openUrl 7 s after the click') }

// H. Does the backend accept a message posted from a frame? The type is made up: no handler exists, so the
// most it can do is a log line in the BACKEND console ('[policy] unclassified message 'gesture-test:frame-probe'').
function postFromFrame() {
  const f = document.createElement('iframe')
  f.style.display = 'none'
  f.src = 'about:blank'
  document.body.appendChild(f)
  setTimeout(() => {
    let got = 'no bridge in the frame'
    try {
      const wv: any = (f.contentWindow as any)?.chrome?.webview
      if (wv?.postMessage) {
        wv.postMessage(JSON.stringify({ id: 'gesture-test-probe', type: 'gesture-test:frame-probe', payload: { at: Date.now() }, origin: 'host' }))
        got = 'posted: check the backend console'
      }
    } catch (e: any) { got = `threw: ${e?.message ?? e}` }
    results.value.unshift({ test: 'H. message posted from a frame', expect: 'nothing in the backend console', got, pass: null })
    f.remove()
  }, 500)
}

// G. A frame this widget makes (about:blank, srcdoc): does it get a host bridge object? Only looks, sends nothing.
function probeFrames() {
  const probe = (label: string, setup: (f: HTMLIFrameElement) => void) => {
    const f = document.createElement('iframe')
    f.style.display = 'none'
    setup(f)
    document.body.appendChild(f)
    setTimeout(() => {
      let got = 'no bridge'
      try {
        const w: any = f.contentWindow
        const ext = typeof w?.external?.sendMessage === 'function'
        const wv = !!w?.chrome?.webview
        got = ext || wv ? `BRIDGE: ${ext ? 'external.sendMessage ' : ''}${wv ? 'chrome.webview' : ''}` : 'no bridge'
      } catch (e: any) { got = `not readable (${e?.message ?? e})` }
      results.value.unshift({ test: `G. ${label}`, expect: 'no bridge', got, pass: !got.startsWith('BRIDGE') })
      f.remove()
    }, 500)
  }
  probe('about:blank frame', f => { f.src = 'about:blank' })
  probe('srcdoc frame', f => { f.srcdoc = '<p>x</p>' })
  probe('frame with no src', () => {})
}
</script>

<template>
  <div class="gt">
    <p class="gt-title">Gesture test (temporary)</p>
    <div class="gt-buttons">
      <button @click="revealNow">A. Reveal now (must work)</button>
      <button @click="revealLate">B. Reveal in 7 s</button>
      <button @click="revealAfterOtherClick">C. Reveal in 3 s (click the GExplorer meanwhile)</button>
      <button ref="fakeTarget" @click.stop="revealAfterFakeClick">D. Fake click, reveal in 7 s</button>
      <button @click="navigateLate">E. Navigate in 7 s</button>
      <button @click="openUrlLate">F. Open URL in 7 s</button>
      <button @click="probeFrames">G. Frame bridge probe</button>
      <button @click="postFromFrame">H. Post a harmless message from a frame (watch the backend console)</button>
    </div>
    <p v-if="busy" class="gt-busy">{{ busy }}</p>
    <table class="gt-results">
      <tr><th>Test</th><th>Expected</th><th>Got</th><th></th></tr>
      <tr v-for="(r, i) in results" :key="i">
        <td>{{ r.test }}</td><td>{{ r.expect }}</td><td>{{ r.got }}</td>
        <td>{{ r.pass === null ? '?' : r.pass ? 'PASS' : 'FAIL' }}</td>
      </tr>
    </table>
  </div>
</template>

<style scoped>
.gt { padding: 8px; font-size: 12px; color: var(--fg, #ddd); overflow: auto; height: 100%; box-sizing: border-box; }
.gt-title { margin: 0 0 6px; font-weight: 600; }
.gt-buttons { display: flex; flex-direction: column; gap: 4px; }
.gt-buttons button { text-align: left; }
.gt-busy { color: var(--accent, #4ea1ff); }
.gt-results { margin-top: 6px; border-collapse: collapse; width: 100%; }
.gt-results td, .gt-results th { border: 1px solid var(--border, #444); padding: 2px 4px; text-align: left; }
</style>
