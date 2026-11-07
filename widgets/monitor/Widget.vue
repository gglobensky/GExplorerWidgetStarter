<!-- widgets/monitor/Widget.vue -->
<!--
    GEM MONITOR: the computer's resources (sdk.monitor(), MONITOR-SHELL-ADDITIONS.md).
      toolbar   at a glance: the numbers you chose (CPU and memory by default, a right-click picks them: per copy) and
                a strip of one bar per core. A click opens the detail view under it; 📌 pins it as a window (it stays
                while you work; the button then brings it back).
      grid      tiles (TilesView): gauges, graphs, the cores, the busiest programs; ✎ moves, resizes, adds and removes
                them (GEM Shell's grid engine); ☰ opens the detail view over them.
      sidebar   the same panel, narrow.
    One watch per copy (store.ts): only what is on screen is read, and what a recording needs (live.ts keeps both
    while one runs with this view gone).
-->
<template>
    <div class="gm-widget" :class="'p-' + context" ref="rootEl">
        <button v-if="context === 'toolbar'" ref="toolBtn" type="button" class="gm-toolbtn" :class="{ open: popOpen || pinned }"
                :title="toolTip" aria-label="GEM Monitor" @click="toggleDetail" @contextmenu.prevent="configure">
            <Gauge :value="s?.cpu?.total ?? 0" mini :size="22" />
            <template v-if="store.st.state === 'ready'">
                <span v-for="m in shown" :key="m" class="gm-tb-item" :class="'k-' + m">
                    <span class="gm-tb-k">{{ LABELS[m] }}</span>
                    <b class="gm-tb-v">{{ valueOf(m) }}</b>
                    <CoreStrip v-if="m === 'cpu' && toolbar.cores && s?.cpu?.cores.length" :cores="s.cpu.cores" class="gm-tb-cores" />
                </span>
            </template>
            <span v-else-if="store.st.state === 'declined'" class="gm-tb-item gm-dim">Allow…</span>
            <span v-if="rec.st.state === 'recording'" class="gm-tb-rec" :title="`Recording: ${recClock}`"><span class="gm-rec-dot"></span>{{ recClock }}</span>
            <span v-else-if="rec.st.state === 'done'" class="gm-tb-rec done" title="A recording waits to be saved (click: the details)">💾</span>
        </button>
        <template v-else-if="context === 'grid'">
            <TilesView :store="store" :recorder="rec" :pages="config?.view?.pages" :legacy-tiles="config?.view?.tiles" :page="config?.view?.page"
                       :on-save="saveTiles" @details="showDetails = true" />
            <DetailView v-if="showDetails" :store="store" :recorder="rec" mode="panel" :interval="interval" :on-interval="setRefresh" :on-back="() => showDetails = false" />
        </template>
        <DetailView v-else :store="store" :recorder="rec" mode="panel" :interval="interval" :on-interval="setRefresh" />
    </div>
</template>

<script setup lang="ts">
import './monitor.css'
import { ref, computed, inject, onMounted, onBeforeUnmount, watch } from 'vue'
import type { WidgetSdk, MonitorSet, WidgetWindowHandle, WidgetPopoverHandle } from 'gexplorer/widgets'
import Gauge from './Gauge.vue'
import CoreStrip from './CoreStrip.vue'
import DetailView from './DetailView.vue'
import TilesView, { type TileLayout } from './TilesView.vue'
import { pct, bytes, rate, clock } from './store'
import { enterLive } from './live'

const props = defineProps<{
    sourceId: string
    config?: Record<string, any>
    placement?: { context?: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'window' | 'dialog'; size?: any }
}>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const context = computed<'grid' | 'sidebar' | 'toolbar'>(() => {
    const c = props.placement?.context
    return c === 'toolbar' ? 'toolbar' : c === 'sidebar' ? 'sidebar' : 'grid'
})
const rootEl = ref<HTMLElement | null>(null)
const toolBtn = ref<HTMLElement | null>(null)

// ── This copy's choices (its view) ──────────────────────────────────────────

type Metric = 'cpu' | 'ram' | 'gpu' | 'disk' | 'net' | 'self'
const METRICS: Metric[] = ['cpu', 'ram', 'gpu', 'disk', 'net', 'self']
const LABELS: Record<Metric, string> = { cpu: 'CPU', ram: 'RAM', gpu: 'GPU', disk: 'Disk', net: 'Net', self: 'GEM' }
const SET_OF: Record<Metric, MonitorSet> = { cpu: 'cpu', ram: 'memory', gpu: 'gpu', disk: 'disks', net: 'network', self: 'self' }

const toolbar = computed<{ show: Metric[]; cores: boolean }>(() => {
    const t = props.config?.view?.toolbar ?? {}
    const show = Array.isArray(t.show) ? t.show.filter((m: any) => METRICS.includes(m)) : ['cpu', 'ram']
    return { show: show.length ? show : ['cpu'], cores: t.cores !== false }
})
const shown = computed(() => toolbar.value.show)
const intervalMs = computed(() => {
    const v = Number(props.config?.view?.intervalMs)
    return [500, 1000, 2000, 5000].includes(v) ? v : 1000
})

/** The refresh rate, read live by the detail views (a popover's or a window's props aren't reactive). */
const interval = { get value() { return intervalMs.value } }

function saveView(patch: Record<string, unknown>) { void sdk.setView?.(patch) }
/** The grid's pages of tiles, as arranged, and the one shown (this copy's view: another copy in the same hub keeps its own). */
function saveTiles(layout: TileLayout) { saveView({ pages: layout.pages, page: layout.page }) }
const showDetails = ref(false)
function setRefresh(ms: number) {
    saveView({ intervalMs: ms })
    // the view comes back through props: the watch follows on the next tick
    setTimeout(() => store.refresh(), 0)
}

// ── The readings ────────────────────────────────────────────────────────────

// This instance's readings and recorder: kept while a recording runs with this view gone (live.ts, the job's card)
const live = enterLive(sdk, () => intervalMs.value)
const store = live.store
/** This copy's recorder (⏺ in the details): a background job, it goes on when this view leaves (RecordingCard). */
const rec = live.rec
const recClock = computed(() => { void rec.st.count; return clock(rec.elapsed()) })
const s = computed(() => { void store.st.tick; return store.last.value })

function valueOf(m: Metric): string {
    const x = s.value
    switch (m) {
        case 'cpu': return pct(x?.cpu?.total)
        case 'ram': return x?.memory?.total ? pct((x.memory.total - x.memory.available) * 100 / x.memory.total) : '–'
        case 'gpu': return x?.gpu?.length ? pct(Math.max(...x.gpu.map(g => g.total))) : '–'
        case 'disk': return x?.disks ? rate(x.disks.reduce((a, d) => a + d.read + d.write, 0)) : '–'
        case 'net': return x?.network ? rate(x.network.reduce((a, n) => a + n.received + n.sent, 0)) : '–'
        case 'self': return x?.self ? `${x.self.cpu.toFixed(1)}% · ${bytes(x.self.priv, 0)}` : '–'
    }
}
const toolTip = computed(() => {
    const x = s.value
    if (store.st.state !== 'ready' || !x) return 'GEM Monitor'
    const lines = ['GEM Monitor']
    if (x.cpu) lines.push(`CPU ${pct(x.cpu.total)} (${x.cpu.cores.length} cores)`)
    if (x.memory) lines.push(`Memory ${bytes(x.memory.total - x.memory.available)} of ${bytes(x.memory.total)}`)
    lines.push('Click: details · Right-click: what to show')
    return lines.join('\n')
})

// The toolbar's numbers need their own sets (the detail view adds its own while open)
let releaseToolbar: (() => void) | null = null
watch(() => context.value === 'toolbar' ? shown.value.map(m => SET_OF[m]).join(',') : '', sets => {
    releaseToolbar?.()
    releaseToolbar = sets ? store.need(sets.split(',') as MonitorSet[]) : null
}, { immediate: true })

/** Right-click on the toolbar button: what it shows (this copy only). */
async function configure() {
    const anchor = toolBtn.value
    if (!anchor) return
    const items = [
        ...METRICS.map(m => ({ id: m, label: `${shown.value.includes(m) ? '✓ ' : ' '}${({ cpu: 'Processor', ram: 'Memory', gpu: 'Graphics card', disk: 'Disks', net: 'Network', self: 'GEM Shell itself' } as Record<Metric, string>)[m]}` })),
        { id: 'cores', label: `${toolbar.value.cores ? '✓ ' : ' '}The cores, one bar each`, disabled: !shown.value.includes('cpu') },
    ]
    const id = await ui.menu(anchor, items, { label: 'Show in the toolbar' })
    if (!id) return
    if (id === 'cores') { saveView({ toolbar: { ...toolbar.value, cores: !toolbar.value.cores } }); return }
    const m = id as Metric
    const next = shown.value.includes(m) ? shown.value.filter(x => x !== m) : METRICS.filter(x => x === m || shown.value.includes(x))
    saveView({ toolbar: { ...toolbar.value, show: next.length ? next : ['cpu'] } })
}

// ── The detail view: a popover, pinned as a window ─────────────────────────

const popOpen = ref(false)
const pinned = ref(false)
let pop: WidgetPopoverHandle | null = null
let win: WidgetWindowHandle | null = null

function windowProps() {
    return { store, recorder: rec, mode: 'window', interval, onInterval: setRefresh }
}

function toggleDetail() {
    if (store.st.state === 'declined') { store.retry(); return }
    if (win?.open) { win.show(); return }
    if (pop) { pop.close(); return }
    const anchor = toolBtn.value
    if (!anchor) return
    const h = ui.openPopover({
        anchor, component: DetailView,
        props: { store, recorder: rec, mode: 'popover', interval, onInterval: setRefresh, onPin: pin },
        placement: 'below', maxWidth: 640, maxHeight: 640, style: { padding: 0, radius: 8 },
        onClose: () => { pop = null; popOpen.value = false },
    })
    if (!h) return
    pop = h
    popOpen.value = true
}

function pin() {
    const h = ui.openWindow?.({
        component: DetailView, props: windowProps(), title: 'Details', width: 600, height: 640,
        resizable: true, remember: 'detail', anchor: toolBtn.value ?? undefined,
        onClose: () => { win = null; pinned.value = false },
    })
    if (!h) {
        void ui.snack({ id: 'gem-monitor', text: 'Click GEM Monitor\'s button, then 📌 right away to pin it.', dedupe: 'replace', timeoutMs: 5000 })
        return
    }
    win = h
    pinned.value = true
    pop?.close()
}

onMounted(() => { if (store.st.state === 'idle') void store.init() })
onBeforeUnmount(() => {
    releaseToolbar?.()
    pop?.close()
    win?.close()
    live.leave()
})
</script>
