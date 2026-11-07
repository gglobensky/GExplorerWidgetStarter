<!-- widgets/monitor/DetailView.vue -->
<!--
    The detail view: Overview (CPU with its cores, memory, GPU, disks, network), Processes (with the Processes
    permission), and GEM Shell's own use. Shown in the toolbar's popover (📌 pins it as a window), in its pinned window,
    and as the panel of the grid and the sidebar. Each tab needs only its own sets (store.need): the backend reads
    what is on screen, nothing else.
    For benchmarking: a program in Processes can be followed (◎, or right-click): its own tab then shows it with the
    programs it started; any graph can be measured (drag across it: min, average, max, 95th percentile); ⏺ records
    a run for a set time (markers ⚑ while it records), saved as an HTML report or CSV (recorder.ts, report.ts).
-->
<template>
    <div class="gm-detail" :class="['m-' + mode, { narrow }]" ref="rootEl">
        <div class="gm-bar">
            <div class="gm-tabs" role="tablist">
                <button v-for="t in TABS" :key="t.id" type="button" role="tab" class="gm-tab" :class="{ on: tab === t.id }"
                        :aria-selected="tab === t.id" :title="t.title" @click="tab = t.id">{{ t.label }}</button>
            </div>
            <span class="gm-spacer"></span>
            <button v-if="recorder && recorder.st.state !== 'recording'" ref="recBtn" type="button" class="gm-ib gm-rec-btn"
                    title="Record a run (a report with graphs, saved where you choose)" aria-label="Record" @click="chooseRecord">⏺</button>
            <button ref="moreBtn" type="button" class="gm-ib" title="Refresh rate" aria-label="Refresh rate" @click="chooseInterval">⏱ {{ intervalLabel }}</button>
            <button v-if="mode === 'popover'" type="button" class="gm-ib" title="Pin: keep it open in a window" aria-label="Pin" @click="emit('pin')">📌</button>
            <!-- where ☰ is on the tiles: the two swap in place -->
            <button v-if="onBack" type="button" class="gm-ib gm-corner" title="Back to the tiles" aria-label="Back to the tiles" @click="onBack()">▦</button>
        </div>

        <!-- the recording: its clock, ⚑ and ■ while it runs; saving once it's done -->
        <div v-if="recorder && recorder.st.state === 'recording'" class="gm-rec on" role="status">
            <span class="gm-rec-dot"></span>
            <span>Recording <b>{{ recClock }}</b> <span class="gm-dim">of {{ recLimit }} · {{ recorder.st.count }} samples{{ recorder.st.markers ? ` · ${recorder.st.markers} markers` : '' }}</span></span>
            <span class="gm-spacer"></span>
            <button type="button" class="gm-ib" title="Put a marker here (it shows on the report's graphs)" @click="recorder.mark()">⚑ Mark</button>
            <button type="button" class="gm-ib gm-rec-stop" title="Stop recording" @click="recorder.stop()">■ Stop</button>
        </div>
        <div v-else-if="recorder && recorder.st.state === 'done'" class="gm-rec done" role="status">
            <span>Recorded <b>{{ recClock }}</b> <span class="gm-dim">· {{ recorder.st.count }} samples</span></span>
            <span class="gm-spacer"></span>
            <button type="button" class="gm-ib" :disabled="recorder.st.saving" title="A web page with the graphs and the figures" @click="recorder.save('html')">💾 Report…</button>
            <button type="button" class="gm-ib" :disabled="recorder.st.saving" title="The raw figures, for a spreadsheet" @click="recorder.save('csv')">CSV…</button>
            <button type="button" class="gm-ib" title="Forget this recording" @click="discardRec">Discard</button>
        </div>

        <div v-if="store.st.state !== 'ready'" class="gm-empty">
            <p v-if="store.st.state === 'no-api'">This version of GEM Shell can't read the computer's resources yet.</p>
            <p v-else-if="store.st.state === 'unavailable'">{{ store.st.reason || 'Not available on this system yet.' }}</p>
            <template v-else-if="store.st.state === 'declined'">
                <p>GEM Monitor needs your permission to see this computer's resources.</p>
                <button type="button" class="gm-btn" @click="store.retry()">Allow…</button>
            </template>
            <span v-else class="gm-dim">Reading…</span>
        </div>

        <!-- ── Overview ── -->
        <Pages v-else-if="tab === 'overview'" :key="'overview'" class="gm-overview" :tick="tick" label="Overview pages">
            <div class="gm-prow">
            <section class="gm-card gm-cpu">
                <Gauge :value="s?.cpu?.total ?? 0" label="CPU" :size="gaugeSize" />
                <div class="gm-card-side">
                    <div class="gm-title" :title="info?.cpuName">{{ info?.cpuName || 'Processor' }}</div>
                    <KvPaged :rows="cpuRows" :tick="tick" />
                    <Spark :values="hist.cpu" :values2="hist.kernel" :tick="tick" :max="100" selectable :step-ms="interval.value" />
                    <CoreStrip :cores="s?.cpu?.cores ?? []" :columns="coreColumns" />
                </div>
            </section>

            <section class="gm-card">
                <Gauge :value="ramPct" label="Memory" :text="pct(ramPct)" :size="gaugeSize" />
                <div class="gm-card-side">
                    <div class="gm-title">{{ bytes(ramUsed) }} of {{ bytes(s?.memory?.total) }} in use</div>
                    <KvPaged :rows="memRows" :tick="tick" />
                    <Spark :values="hist.ram" :tick="tick" :max="100" color="var(--gm-mem)" selectable :step-ms="interval.value" />
                </div>
            </section>
            </div>

            <div v-if="s?.gpu?.length" class="gm-prow">
            <section v-for="g in s?.gpu ?? []" :key="g.name" class="gm-card">
                <Gauge :value="g.total" label="GPU" :size="gaugeSize" />
                <div class="gm-card-side">
                    <div class="gm-title">{{ g.name }}</div>
                    <KvPaged :rows="gpuRows(g)" :tick="tick" />
                    <Spark :values="hist.gpu" :tick="tick" :max="100" color="var(--gm-gpu)" selectable :step-ms="interval.value" />
                </div>
            </section>
            </div>

            <section class="gm-card gm-wide">
                <div class="gm-title">Disks <span class="gm-dim">read {{ rate(sumRead) }} · write {{ rate(sumWrite) }}</span></div>
                <Spark :values="hist.diskRead" :values2="hist.diskWrite" :tick="tick" color="var(--gm-disk)" selectable :format="rate" :step-ms="interval.value" />
                <RowPaged :items="s?.disks ?? []" :key-of="(d: any) => d.name" :tick="tick" label="Disks">
                    <template #default="{ item: d }">
                        <div class="gm-row">
                            <span class="gm-row-name" :title="d.name">{{ d.name }}</span>
                            <span class="gm-bar-mini"><span :style="{ width: `${d.active}%` }"></span></span>
                            <span class="gm-num">{{ pct(d.active) }}</span>
                            <span class="gm-num">↓ {{ rate(d.read) }}</span>
                            <span class="gm-num">↑ {{ rate(d.write) }}</span>
                        </div>
                    </template>
                </RowPaged>
            </section>

            <section class="gm-card gm-wide">
                <div class="gm-title">Network <span class="gm-dim">in {{ rate(sumIn) }} · out {{ rate(sumOut) }}</span></div>
                <Spark :values="hist.netIn" :values2="hist.netOut" :tick="tick" color="var(--gm-net)" selectable :format="rate" :step-ms="interval.value" />
                <RowPaged :items="s?.network ?? []" :key-of="(n: any) => n.id" :tick="tick" label="Network adapters">
                    <template #default="{ item: n }">
                        <div class="gm-row gm-row-net">
                            <span class="gm-row-name" :title="n.name">{{ n.name }}</span>
                            <span class="gm-num">↓ {{ rate(n.received) }}</span>
                            <span class="gm-num">↑ {{ rate(n.sent) }}</span>
                            <span class="gm-num gm-dim">{{ n.linkBits ? bits(n.linkBits) : '' }}</span>
                        </div>
                    </template>
                </RowPaged>
            </section>
        </Pages>

        <!-- ── Processes ── -->
        <div v-else-if="tab === 'processes'" ref="procBody" class="gm-body gm-procs" @wheel="procWheel">
            <template v-if="store.st.processesDenied">
                <div class="gm-empty">
                    <p>Listing the programs that run needs the Processes permission.</p>
                    <button type="button" class="gm-btn" @click="store.retry(true)">Allow…</button>
                </div>
            </template>
            <template v-else>
                <div class="gm-filter">
                    <input v-model="filter" type="search" class="gm-input" placeholder="Filter by name" aria-label="Filter by name" />
                    <button type="button" class="gm-ib gm-freeze" :class="{ on: frozen }" :aria-pressed="frozen"
                            :title="frozen ? 'The rows keep their place (their figures still change). Click: sort them again' : 'Keep the rows in place (they also stay put while the mouse is over the list)'"
                            @click="toggleFreeze">{{ frozen ? '❄ Frozen' : '❄' }}</button>
                    <span class="gm-dim">{{ shownProcs.length }} of {{ s?.processes?.length ?? 0 }}</span>
                </div>
                <table class="gm-table gm-fit">
                    <colgroup><col v-for="c in COLUMNS" :key="c.id" :style="c.w ? { width: c.w + 'px' } : undefined" /></colgroup>
                    <thead>
                        <tr>
                            <th v-for="c in COLUMNS" :key="c.id" :class="[c.num ? 'num' : '', { on: sortBy === c.id }]" @click="sortOn(c.id)">
                                {{ c.label }}<span v-if="sortBy === c.id">{{ sortDesc ? ' ▾' : ' ▴' }}</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody @pointerenter="hoverFreeze(true)" @pointerleave="hoverFreeze(false)">
                        <tr v-for="p in pagedProcs" :key="p.pid" :class="{ followed: store.st.follow?.pid === p.pid }" @contextmenu.prevent="rowMenu($event, p)">
                            <td class="name" v-gex-tooltip="{ content: p.name, detail: `pid ${p.pid} · right-click to follow it` }">
                                <button type="button" class="gm-follow-btn" :class="{ on: store.st.follow?.pid === p.pid }"
                                        :title="store.st.follow?.pid === p.pid ? 'Stop following' : `Follow ${p.name} (with the programs it starts)`"
                                        :aria-label="store.st.follow?.pid === p.pid ? 'Stop following' : `Follow ${p.name}`" @click="toggleFollow(p)">◎</button>{{ p.name }}
                            </td>
                            <td v-if="!narrow" class="num">{{ p.pid }}</td>
                            <td class="num" :class="heat(p.cpu)">{{ p.cpu.toFixed(1) }}</td>
                            <td class="num">{{ bytes(p.priv) }}</td>
                            <td class="num">{{ rate(p.read + p.write) }}</td>
                            <td class="num">{{ p.gpu ? p.gpu.toFixed(1) : '' }}</td>
                            <td v-if="!narrow" class="num">{{ p.threads }}</td>
                        </tr>
                    </tbody>
                </table>
                <span class="gm-spacer"></span>
                <Pager :page="procPage" :count="procPages" label="Pages of programs" @go="p => procPage = p" />
            </template>
        </div>

        <!-- ── The program followed (and the ones it started) ── -->
        <Pages v-else-if="tab === 'follow' && store.st.follow" :key="'follow'" class="gm-self gm-followed" :tick="tick" label="Pages">
            <div v-if="store.st.follow.gone" class="gm-banner">
                <span><b>{{ store.st.follow.name }}</b> ended.</span>
                <button type="button" class="gm-ib" @click="followAgain">Follow the next {{ store.st.follow.name }}</button>
                <button type="button" class="gm-ib" @click="store.follow(null)">Stop following</button>
            </div>
            <div v-else-if="store.st.processesDenied" class="gm-banner">
                <span>Following a program needs the Processes permission.</span>
                <button type="button" class="gm-btn" @click="store.retry(true)">Allow…</button>
            </div>
            <section class="gm-card">
                <Gauge :value="ft?.cpu ?? 0" :label="gaugeName" :text="`${(ft?.cpu ?? 0).toFixed(1)}%`" :size="gaugeSize" />
                <div class="gm-card-side">
                    <div class="gm-title" :title="`pid ${store.st.follow.pid}`">{{ store.st.follow.name }} <span class="gm-dim">pid {{ store.st.follow.pid }}{{ ft && ft.count > 1 ? ` · ${ft.count} processes` : '' }}</span></div>
                    <KvPaged :rows="followRows" :tick="tick" />
                </div>
            </section>
            <section class="gm-card gm-wide gm-free">
                <div class="gm-title">CPU <span class="gm-dim">and GPU (dashed)</span></div>
                <Spark :values="hist.followCpu" :values2="hist.followGpu" :tick="tick" color="var(--gm-disk)" color2="var(--gm-gpu)" selectable :step-ms="interval.value" />
                <div class="gm-title">Memory</div>
                <Spark :values="hist.followMem" :tick="tick" color="var(--gm-mem)" selectable :format="fmtBytes" :step-ms="interval.value" />
                <div class="gm-title" :title="IO_TITLE">I/O</div>
                <Spark :values="hist.followIo" :tick="tick" color="var(--gm-disk)" selectable :format="rate" :step-ms="interval.value" />
            </section>
            <table v-if="(ft?.parts.length ?? 0) > 1" class="gm-table gm-fit">
                <colgroup><col /><col style="width: 50px" /><col style="width: 64px" /><col style="width: 50px" /><col v-if="!narrow" style="width: 50px" /></colgroup>
                <thead><tr><th>Part</th><th class="num">CPU %</th><th class="num">Memory</th><th class="num">GPU %</th><th v-if="!narrow" class="num">pid</th></tr></thead>
                <tbody>
                    <tr v-for="p in ft?.parts ?? []" :key="p.pid">
                        <td class="name" v-gex-tooltip="{ content: p.name, detail: `pid ${p.pid}` }">{{ p.name }}</td>
                        <td class="num">{{ p.cpu.toFixed(1) }}</td>
                        <td class="num">{{ bytes(p.priv) }}</td>
                        <td class="num">{{ p.gpu ? p.gpu.toFixed(1) : '' }}</td>
                        <td v-if="!narrow" class="num">{{ p.pid }}</td>
                    </tr>
                </tbody>
            </table>
            <p class="gm-foot gm-dim">Drag across a graph to measure a stretch. ⏺ records a run with this program in it.</p>
        </Pages>

        <!-- ── GEM Shell's own use ── -->
        <Pages v-else :key="'self'" class="gm-self" :tick="tick" label="Pages">
            <section class="gm-card">
                <Gauge :value="s?.self?.cpu ?? 0" label="GEM Shell" :text="`${(s?.self?.cpu ?? 0).toFixed(1)}%`" :size="gaugeSize" />
                <div class="gm-card-side">
                    <div class="gm-title">{{ bytes(s?.self?.priv) }} of memory, in {{ s?.self?.count ?? 0 }} processes</div>
                    <KvPaged :rows="selfRows" :tick="tick" />
                    <Spark :values="hist.self" :tick="tick" color="var(--gm-accent)" selectable :step-ms="interval.value" />
                </div>
            </section>
            <table class="gm-table gm-fit">
                <colgroup><col /><col style="width: 46px" /><col style="width: 62px" /><col style="width: 66px" /><col style="width: 66px" /><col v-if="!narrow" style="width: 50px" /></colgroup>
                <thead><tr><th>Part</th><th class="num">CPU %</th><th class="num">Memory</th><th class="num" :title="IO_TITLE">Read</th><th class="num" :title="IO_TITLE">Write</th><th v-if="!narrow" class="num">pid</th></tr></thead>
                <tbody>
                    <tr v-for="p in s?.self?.parts ?? []" :key="p.pid">
                        <td class="name" v-gex-tooltip="{ content: p.name, detail: `pid ${p.pid}` }">{{ p.name }}</td>
                        <td class="num">{{ p.cpu.toFixed(1) }}</td>
                        <td class="num">{{ bytes(p.priv) }}</td>
                        <td class="num">{{ rate(p.read) }}</td>
                        <td class="num">{{ rate(p.write) }}</td>
                        <td v-if="!narrow" class="num">{{ p.pid }}</td>
                    </tr>
                </tbody>
            </table>
            <p class="gm-foot gm-dim">GEM Shell itself and the processes it started (its web view runs in processes of its own). I/O counts every
                read and write, files and also the pipes between those processes: not only the disk.</p>
        </Pages>

        <InlineMenu :menu="imenu" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { WidgetSdk, MonitorSet, MonitorProcess } from 'gexplorer/widgets'
import Gauge from './Gauge.vue'
import Spark from './Spark.vue'
import CoreStrip from './CoreStrip.vue'
import { pct, bytes, rate, bits, clock, followTree, type Store } from './store'
import { DURATIONS, type Recorder } from './recorder'
import InlineMenu from './InlineMenu.vue'
import Pages from './Pages.vue'
import KvPaged, { type KvRow } from './KvPaged.vue'
import RowPaged from './RowPaged.vue'
import Pager from './Pager.vue'
import { useInlineMenu } from './inlineMenu'

const props = defineProps<{
    store: Store
    mode: 'popover' | 'window' | 'panel'
    /** The refresh rate (ms: read live, the instance's view) and its setter. */
    interval: { readonly value: number }
    onInterval?: (ms: number) => void
    /** In a hub, over the tiles: back to them. */
    onBack?: () => void
    /** This copy's recorder (⏺). */
    recorder?: Recorder
}>()
const emit = defineEmits<{ (e: 'pin'): void }>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const store = props.store
const hist = store.hist
const rootEl = ref<HTMLElement | null>(null)
const moreBtn = ref<HTMLElement | null>(null)
const recBtn = ref<HTMLElement | null>(null)
/** Its menus, drawn inside its own box: the shell's ui.menu needs a fresh press in the widget, which a toolbar popover
 *  left open a while no longer counts as (GEM Shell's popover rule). */
const imenu = useInlineMenu(() => rootEl.value)
const width = ref(600)

type TabId = 'overview' | 'processes' | 'follow' | 'self'
const TABS = computed<Array<{ id: TabId; label: string; title?: string }>>(() => [
    // (the note was a line under the cards: it took a page of its own once the cards filled theirs)
    { id: 'overview', label: 'Overview', title: 'Temperatures and frame rates aren\'t shown: on Windows they need administrator rights or the hardware\'s own drivers' },
    { id: 'processes', label: 'Processes' },
    ...(store.st.follow ? [{ id: 'follow' as const, label: `◎ ${store.st.follow.name.replace(/\.exe$/i, '')}`, title: `Following ${store.st.follow.name}` }] : []),
    { id: 'self', label: 'GEM Shell' },
])
const tab = ref<TabId>(store.st.follow ? 'follow' : 'overview')
watch(() => store.st.follow?.pid, pid => { if (!pid && tab.value === 'follow') tab.value = 'processes' })

const s = computed(() => { void store.st.tick; return store.last.value })
const tick = computed(() => store.st.tick)
const info = computed(() => store.st.info)
const narrow = computed(() => width.value < 520)
/** The gauges fit the page (a short panel: smaller gauges; the bars and the pager counted). */
const gaugeSize = computed(() => {
    const room = height.value - 33 - (props.recorder && props.recorder.st.state !== 'idle' ? 29 : 0) - 16 - 22 - 20
    return Math.max(64, Math.min(narrow.value ? 92 : 108, room))
})
const height = ref(600)
const IO_TITLE = 'Every read and write: files, and also the pipes between programs (Task Manager\'s I/O columns), not only the disk'

// ── The figures (KvPaged: in parts when a card would be taller than its page) ──

const cpuRows = computed<KvRow[]>(() => [
    { k: 'Kernel', v: pct(s.value?.cpu?.kernel) },
    { k: 'Cores', v: String(info.value?.logicalCores ?? s.value?.cpu?.cores.length ?? '–') },
])
const memRows = computed<KvRow[]>(() => {
    const m = s.value?.memory
    return [
        { k: 'Available', v: bytes(m?.available) },
        { k: 'Commit', v: pair(m?.committed, m?.commitLimit), title: 'Committed of the commit limit (memory and page file)' },
        { k: 'Cached', v: bytes(m?.cached) },
        { k: 'Paged pool', v: bytes(m?.pagedPool) },
        { k: 'Non-paged', v: bytes(m?.nonPagedPool) },
        { k: 'Processes', v: String(m?.processes ?? '–') },
        { k: 'Threads', v: m?.threads?.toLocaleString() ?? '–' },
        { k: 'Handles', v: m?.handles?.toLocaleString() ?? '–' },
    ]
})
function gpuRows(g: { engines: Record<string, number>; dedicated: number; shared: number }): KvRow[] {
    return [
        ...Object.entries(g.engines).map(([k, v]) => ({ k: engineName(k), v: pct(v) })),
        { k: 'Dedicated memory', v: bytes(g.dedicated) },
        { k: 'Shared memory', v: bytes(g.shared) },
    ]
}
const followRows = computed<KvRow[]>(() => {
    const t = ft.value
    return [
        { k: 'CPU', v: `${(t?.cpu ?? 0).toFixed(1)}% · ${oneCore.value} of a core`, title: 'Its share of the whole computer, then of one core' },
        { k: 'Memory', v: bytes(t?.priv) },
        { k: 'Working set', v: bytes(t?.ws) },
        { k: 'GPU', v: t ? `${t.gpu.toFixed(1)}% · ${bytes(t.gpuMem)}` : '–' },
        { k: 'I/O', v: `↓ ${rate(t?.read)} ↑ ${rate(t?.write)}`, title: IO_TITLE },
        { k: 'Threads · handles', v: `${t?.threads ?? '–'} · ${t?.handles ?? '–'}` },
        { k: 'Following since', v: followSince.value },
    ]
})
const selfRows = computed<KvRow[]>(() => {
    const x = s.value?.self
    return [
        { k: 'Working set', v: bytes(x?.ws) },
        { k: 'Threads · handles', v: `${x?.threads ?? '–'} · ${x?.handles ?? '–'}` },
        { k: 'I/O read', v: rate(x?.read), title: IO_TITLE },
        { k: 'I/O write', v: rate(x?.write), title: IO_TITLE },
    ]
})
const coreColumns = computed(() => {
    const n = s.value?.cpu?.cores.length ?? 0
    return n <= 8 ? n || 1 : n <= 16 ? 8 : n <= 32 ? 16 : 16
})
const ramUsed = computed(() => s.value?.memory ? s.value.memory.total - s.value.memory.available : 0)
const ramPct = computed(() => s.value?.memory?.total ? ramUsed.value * 100 / s.value.memory.total : 0)
const sumRead = computed(() => (s.value?.disks ?? []).reduce((a, d) => a + d.read, 0))
const sumWrite = computed(() => (s.value?.disks ?? []).reduce((a, d) => a + d.write, 0))
const sumIn = computed(() => (s.value?.network ?? []).reduce((a, n) => a + n.received, 0))
const sumOut = computed(() => (s.value?.network ?? []).reduce((a, n) => a + n.sent, 0))

/** "22.4 / 37.3 GB" */
function pair(a?: number, b?: number): string {
    const B = bytes(b)
    const unit = B.split(' ')[1] ?? ''
    const A = bytes(a)
    return A.endsWith(` ${unit}`) ? `${A.split(' ')[0]} / ${B}` : `${A} / ${B}`
}

function engineName(k: string): string {
    const m: Record<string, string> = { '3D': '3D', Copy: 'Copy', VideoDecode: 'Video decode', VideoEncode: 'Video encode', Compute: 'Compute' }
    return m[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2')
}

// ── What this tab needs (only that is read) ──────────────────────────────────

const SETS: Record<TabId, MonitorSet[]> = {
    overview: ['cpu', 'memory', 'gpu', 'disks', 'network'],
    processes: ['processes', 'gpu'],
    // the program itself comes with the watch's pid (store.follow); its GPU needs the gpu set
    follow: ['gpu'],
    self: ['self'],
}
let release: (() => void) | null = null
watch(tab, t => { release?.(); release = store.need(SETS[t]) }, { immediate: true })
onBeforeUnmount(() => { release?.(); release = null })

// ── Processes ───────────────────────────────────────────────────────────────

const ALL_COLUMNS: Array<{ id: ColId; label: string; num: boolean; w?: number; wide?: true }> = [
    { id: 'name', label: 'Name', num: false },
    { id: 'pid', label: 'pid', num: true, w: 54, wide: true },
    { id: 'cpu', label: 'CPU %', num: true, w: 62 },
    { id: 'priv', label: 'Memory', num: true, w: 66 },
    { id: 'io', label: 'I/O', num: true, w: 74 },
    { id: 'gpu', label: 'GPU %', num: true, w: 52 },
    { id: 'threads', label: 'Threads', num: true, w: 58, wide: true },
]
/** Narrow: pid and threads give their room to the names (a name too long: … and the tooltip). */
const COLUMNS = computed(() => ALL_COLUMNS.filter(c => !c.wide || !narrow.value))
type ColId = 'name' | 'pid' | 'cpu' | 'priv' | 'io' | 'gpu' | 'threads'
const sortBy = ref<ColId>('cpu')
const sortDesc = ref(true)
const filter = ref('')
function sortOn(id: ColId) {
    if (sortBy.value === id) sortDesc.value = !sortDesc.value
    else { sortBy.value = id; sortDesc.value = id !== 'name' }
}
const keyOf = (p: MonitorProcess, c: ColId): number | string =>
    c === 'name' ? p.name.toLowerCase() : c === 'io' ? p.read + p.write : (p as any)[c] as number
const shownProcs = computed(() => {
    const q = filter.value.trim().toLowerCase()
    const list = (s.value?.processes ?? []).filter(p => !q || p.name.toLowerCase().includes(q))
    const c = sortBy.value, d = sortDesc.value ? -1 : 1
    const sorted = [...list].sort((a, b) => { const x = keyOf(a, c), y = keyOf(b, c); return x < y ? -d : x > y ? d : a.pid - b.pid })
    if (!frozen.value && !hovering.value) { order = sorted.map(p => p.pid); return sorted }
    // frozen: the rows keep the order they had; new programs come at the end, ended ones leave
    const at = new Map(order.map((pid, i) => [pid, i]))
    const kept = sorted.filter(p => at.has(p.pid)).sort((a, b) => at.get(a.pid)! - at.get(b.pid)!)
    const added = sorted.filter(p => !at.has(p.pid))
    return [...kept, ...added]
})

// ── Rows that stay put: ❄ (until clicked again), and while the mouse is over the list (to click the right one) ──

const frozen = ref(false)
const hovering = ref(false)
let order: number[] = []
function toggleFreeze() { frozen.value = !frozen.value }
function hoverFreeze(on: boolean) { hovering.value = on }

// Pages of programs instead of a scrollbar: as many rows as the panel holds (measured), ‹ › / the wheel to turn them
const procBody = ref<HTMLElement | null>(null)
const procPage = ref(0)
const perPage = ref(20)
const procPages = computed(() => Math.max(1, Math.ceil(shownProcs.value.length / perPage.value)))
const pagedProcs = computed(() => {
    const p = Math.min(procPage.value, procPages.value - 1)
    return shownProcs.value.slice(p * perPage.value, (p + 1) * perPage.value)
})
watch([filter, sortBy, sortDesc], () => { procPage.value = 0 })
function measureProcs() {
    const b = procBody.value
    if (!b) return
    const head = b.querySelector('.gm-filter') as HTMLElement | null
    const th = b.querySelector('thead') as HTMLElement | null
    const row = b.querySelector('tbody tr') as HTMLElement | null
    const cs = getComputedStyle(b)
    const room = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        - (head?.offsetHeight ?? 28) - (th?.offsetHeight ?? 22) - 26 /* the pager */ - 16 /* gaps */
    const rh = row?.offsetHeight || 21
    const n = Math.max(3, Math.floor(room / rh))
    if (n !== perPage.value) perPage.value = n
}
let procObs: ResizeObserver | null = null
watch(procBody, el => {
    procObs?.disconnect()
    procObs = null
    if (!el) return
    procObs = new ResizeObserver(() => measureProcs())
    procObs.observe(el)
    void nextTick(measureProcs)
})
let procWheelAt = 0
function procWheel(e: WheelEvent) {
    if (procPages.value < 2 || Math.abs(e.deltaY) < 4) return
    e.preventDefault()
    const now = Date.now()
    if (now - procWheelAt < 250) return
    procWheelAt = now
    procPage.value = Math.max(0, Math.min(procPages.value - 1, procPage.value + (e.deltaY > 0 ? 1 : -1)))
}
onBeforeUnmount(() => procObs?.disconnect())
// a row's height can change once the readings fill it
watch(() => store.st.tick, () => { if (tab.value === 'processes') measureProcs() })
const heat = (v: number) => v >= 50 ? 'hot' : v >= 15 ? 'warm' : ''
const fmtBytes = (v: number) => bytes(v)

// ── Following a program ─────────────────────────────────────────────────────

function toggleFollow(p: MonitorProcess) {
    if (store.st.follow?.pid === p.pid) { store.follow(null); return }
    store.follow(p.pid, p.name)
    tab.value = 'follow'
}
async function rowMenu(e: MouseEvent, p: MonitorProcess) {
    const anchor = e.currentTarget as HTMLElement
    const on = store.st.follow?.pid === p.pid
    const id = await imenu.open(anchor, [
        { id: 'follow', label: on ? 'Stop following' : `Follow ${p.name}`, title: 'Its own tab: it and the programs it starts' },
        { id: 'filter', label: `Show only ${p.name}` },
    ], p.name)
    if (id === 'follow') toggleFollow(p)
    else if (id === 'filter') filter.value = p.name
}
const ft = computed(() => followTree(s.value))
const gaugeName = computed(() => (store.st.follow?.name ?? '').replace(/\.exe$/i, '').slice(0, 12))
const oneCore = computed(() => `${Math.round((ft.value?.cpu ?? 0) * (info.value?.logicalCores ?? 1))}%`)
const followSince = computed(() => store.st.follow ? new Date(store.st.follow.since).toLocaleTimeString() : '')
/** It ended: the next program of that name (a game restarted), if one runs. */
function followAgain() {
    const f = store.st.follow
    const next = (s.value?.processes ?? []).filter(p => p.name === f?.name && p.pid !== f?.pid).sort((a, b) => b.cpu - a.cpu)[0]
    if (next) store.follow(next.pid, next.name)
    else void ui.snack({ id: 'gem-monitor', text: `No ${f?.name} runs right now: Processes lists what does.`, dedupe: 'replace', timeoutMs: 4000 })
}

// ── Recording ───────────────────────────────────────────────────────────────

const recClock = computed(() => { void props.recorder?.st.count; void props.recorder?.st.state; return clock(props.recorder?.elapsed() ?? 0) })
const recLimit = computed(() => clock(props.recorder?.st.limitMs ?? 0))
async function chooseRecord() {
    const r = props.recorder
    if (!r || !recBtn.value) return
    if (r.st.state === 'done' && !(await ui.confirm('Start a new recording? The one you made and didn\'t save is forgotten.', { title: 'Record again', okLabel: 'Record' }))) return
    const id = await imenu.open(recBtn.value, DURATIONS.map(d => ({ id: String(d.ms), label: `For ${d.label}` })), 'Record a run')
    if (!id) return
    r.discard()
    r.start(Number(id))
}
async function discardRec() {
    if (await ui.confirm('Forget this recording?', { title: 'Discard', okLabel: 'Discard', danger: true })) props.recorder?.discard()
}

// ── The refresh rate ────────────────────────────────────────────────────────

const INTERVALS = [500, 1000, 2000, 5000]
const intervalLabel = computed(() => props.interval.value < 1000 ? `${props.interval.value / 1000}s` : `${props.interval.value / 1000}s`)
async function chooseInterval() {
    if (!moreBtn.value) return
    const id = await imenu.open(moreBtn.value, INTERVALS.map(ms => ({ id: String(ms), check: ms === props.interval.value ? 'on' as const : false, label: `Every ${ms < 1000 ? `${ms} ms` : `${ms / 1000} s`}` })), 'Refresh rate')
    if (id) props.onInterval?.(Number(id))
}

let obs: ResizeObserver | null = null
onMounted(() => {
    if (!rootEl.value) return
    obs = new ResizeObserver(() => { width.value = rootEl.value?.clientWidth ?? width.value; height.value = rootEl.value?.clientHeight ?? height.value })
    obs.observe(rootEl.value)
})
onBeforeUnmount(() => obs?.disconnect())
</script>
