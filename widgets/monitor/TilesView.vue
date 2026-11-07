<!-- widgets/monitor/TilesView.vue -->
<!--
    The grid's tiles: one gauge, graph or list each, on a grid of cells laid out with GEM Shell's own engine (gridDrag /
    gridResize: the hubs' maths). ✎ arranges them: drag a tile to move it (the others make room), its corner to resize
    it, × to remove it, ＋ to add one (✓ the kinds already on the page: picking one removes it).
    Pages: several layouts, switched with the radio pills at the bottom (a colour, a name if you give one); while
    arranging, ＋ adds a page, the current one is renamed, recoloured or removed there.
    Saved in this copy's view (view.pages, view.page); two monitors in one hub show different tiles and share the
    readings. Only the current page's sets are read (store.need).
-->
<template>
    <div class="gm-tiles" :class="{ arranging }" ref="rootEl">
        <!-- the bar, on top like the details' (its ☰ where their ▦ is: the two swap in place): the pages (when there
             are several, or while arranging), then the tools; never over a tile -->
        <div v-if="store.st.state === 'ready'" class="gm-pages">
            <div v-if="showPages" class="gm-pages-list" role="radiogroup" aria-label="Pages" @keydown="pageKeys">
                <button v-for="(pg, i) in pages" :key="pg.id" type="button" role="radio" class="gm-page"
                        :class="{ on: pg.id === current.id, named: !!pg.name }" :aria-checked="pg.id === current.id"
                        :tabindex="pg.id === current.id ? 0 : -1" :title="pageTitle(pg, i)" :aria-label="pageTitle(pg, i)"
                        :style="{ '--pg': PAGE_COLORS[pg.color % PAGE_COLORS.length] }" @click="goPage(pg.id)">
                    <span class="gm-page-dot"></span><span v-if="pg.name" class="gm-page-name">{{ pg.name }}</span>
                </button>
            </div>
            <template v-if="arranging">
                <span class="gm-pages-sep"></span>
                <button type="button" class="gm-ib gm-page-color" title="This page's colour" aria-label="This page's colour"
                        :style="{ '--pg': PAGE_COLORS[current.color % PAGE_COLORS.length] }" @click="recolor"><span class="gm-page-dot"></span></button>
                <input v-model="nameDraft" class="gm-input gm-page-input" maxlength="24" placeholder="Name (optional)"
                       aria-label="This page's name" @change="rename(nameDraft)" @keydown.enter="($event.target as HTMLInputElement).blur()"
                       @keydown.escape.stop="nameDraft = current.name; ($event.target as HTMLInputElement).blur()" />
                <button v-if="pages.length > 1" type="button" class="gm-ib" title="Remove this page" aria-label="Remove this page" @click="removePage">🗑</button>
                <button v-if="pages.length < MAX_PAGES" type="button" class="gm-ib" title="Add a page" aria-label="Add a page" @click="addPage">＋ Page</button>
            </template>
            <span class="gm-spacer"></span>
            <span class="gm-tiles-tools">
                <button v-if="recorder && recorder.st.state !== 'idle'" type="button" class="gm-ib gm-tb-rec" :class="{ done: recorder.st.state === 'done' }"
                        :title="recorder.st.state === 'recording' ? 'Recording (the details: stop, markers)' : 'A recording waits to be saved'"
                        @click="emit('details')"><span v-if="recorder.st.state === 'recording'" class="gm-rec-dot"></span>{{ recorder.st.state === 'recording' ? recClock : '💾' }}</button>
                <button v-if="arranging" ref="addBtn" type="button" class="gm-ib" title="Tiles on this page" aria-label="Tiles on this page" @click="addTile">＋</button>
                <button type="button" class="gm-ib" :class="{ on: arranging }" :title="arranging ? 'Done' : 'Arrange the tiles and pages'"
                        :aria-label="arranging ? 'Done' : 'Arrange the tiles'" @click="arranging = !arranging">{{ arranging ? '✓' : '✎' }}</button>
                <button type="button" class="gm-ib gm-corner" title="Details (tabs: overview, processes, GEM Shell)"
                        aria-label="Details" @click="arranging = false; emit('details')">☰</button>
            </span>
        </div>

        <div v-if="store.st.state !== 'ready'" class="gm-empty">
            <template v-if="store.st.state === 'declined'">
                <p>GEM Monitor needs your permission to see this computer's resources.</p>
                <button type="button" class="gm-btn" @click="store.retry()">Allow…</button>
            </template>
            <p v-else-if="store.st.state === 'unavailable' || store.st.state === 'no-api'">{{ store.st.reason || 'Not available on this system yet.' }}</p>
            <span v-else class="gm-dim">Reading…</span>
        </div>

        <div v-else class="gm-tiles-grid" :style="gridStyle">
            <div v-for="t in placed" :key="t.id" class="gm-tile" :class="['k-' + t.kind, { dragging: drag?.id === t.id }]"
                 :style="cellStyle(t.rect)" @pointerdown="startMove($event, t.id)">
                <!-- a gauge -->
                <template v-if="t.kind === 'cpu' || t.kind === 'ram' || t.kind === 'gpu' || t.kind === 'self' || t.kind === 'follow'">
                    <Gauge :value="gaugeValue(t.kind)" :label="t.kind === 'follow' ? (followName().slice(0, 11) || 'Followed') : GAUGE_LABEL[t.kind]" :text="gaugeText(t.kind)" :size="gaugeSize(t.rect)" />
                    <div v-if="t.rect.colSpan > 1 || t.rect.rowSpan > 1" class="gm-tile-sub" :title="tileSub(t.kind)">{{ tileSub(t.kind) }}</div>
                </template>
                <!-- a graph: its title and value, what it is behind it (the processor's name, the memory in use…) -->
                <template v-else-if="isGraph(t.kind)">
                    <div class="gm-tile-head"><span>{{ GRAPH_TITLE[t.kind] }}</span><b>{{ graphText(t.kind, t.rect.colSpan < 2) }}</b></div>
                    <div class="gm-tile-bg" :title="graphInfo(t.kind)">{{ graphInfo(t.kind) }}</div>
                    <Spark :values="graph(t.kind)[0]" :values2="graph(t.kind)[1]" :tick="tick" :max="graphMax(t.kind)" :color="graphColor(t.kind)" class="gm-tile-spark"
                           selectable :format="graphFormat(t.kind)" />
                </template>
                <!-- the cores -->
                <template v-else-if="t.kind === 'cores'">
                    <div class="gm-tile-head"><span>Cores</span><b>{{ s?.cpu?.cores.length ?? 0 }}</b></div>
                    <CoreStrip :cores="s?.cpu?.cores ?? []" :columns="coreColumns(t.rect)" class="gm-tile-cores" />
                </template>
                <!-- the busiest programs -->
                <template v-else-if="t.kind === 'top'">
                    <div class="gm-tile-head"><span>Busiest programs</span></div>
                    <div v-if="store.st.processesDenied" class="gm-tile-ask">
                        <button type="button" class="gm-btn" @pointerdown.stop @click="store.retry(true)">Allow…</button>
                    </div>
                    <ol v-else class="gm-top">
                        <li v-for="p in topProcs(t.rect)" :key="p.pid" :title="`${p.name} (pid ${p.pid})`">
                            <span class="gm-top-name">{{ p.name }}</span><b>{{ p.cpu.toFixed(1) }}%</b><span class="gm-dim">{{ bytes(p.priv, 0) }}</span>
                        </li>
                    </ol>
                </template>
                <!-- GEM Shell's processes (itself, its web view's) -->
                <template v-else-if="t.kind === 'gem'">
                    <div class="gm-tile-head"><span>GEM Shell's processes</span><b>{{ s?.self?.count ?? 0 }}</b></div>
                    <ol class="gm-top">
                        <li v-for="p in gemProcs(t.rect)" :key="p.pid" :title="`${p.name} (pid ${p.pid})`">
                            <span class="gm-top-name">{{ p.name }}</span><b>{{ p.cpu.toFixed(1) }}%</b><span class="gm-dim">{{ bytes(p.priv, 0) }}</span>
                        </li>
                    </ol>
                </template>

                <template v-if="arranging">
                    <button type="button" class="gm-tile-x" title="Remove this tile" aria-label="Remove this tile" @pointerdown.stop @click="remove(t.id)">×</button>
                    <span class="gm-tile-grip" title="Resize" @pointerdown.stop="startResize($event, t.id)"></span>
                </template>
            </div>
            <div v-if="!placed.length" class="gm-empty gm-tiles-none">
                <p>No tiles on this page.</p>
                <button v-if="pages.length === 1" type="button" class="gm-btn" @click="resetTiles">Put the usual ones back</button>
                <span v-else class="gm-dim">✎ then ＋ adds some.</span>
            </div>
        </div>

        <InlineMenu :menu="imenu" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onBeforeUnmount } from 'vue'
import { gridSnapshot, gridDrag, gridResize, gridFirstFree } from 'gexplorer/widgets'
import type { WidgetSdk, MonitorSet, GridRect, GridSizeLimits } from 'gexplorer/widgets'
import Gauge from './Gauge.vue'
import Spark from './Spark.vue'
import CoreStrip from './CoreStrip.vue'
import { pct, bytes, rate, clock, followTree, type Store } from './store'
import type { Recorder } from './recorder'
import InlineMenu from './InlineMenu.vue'
import { useInlineMenu, type InlineMenuItem } from './inlineMenu'

export type TileKind = 'cpu' | 'cpu-graph' | 'cores' | 'ram' | 'ram-graph' | 'gpu' | 'gpu-graph' | 'disk' | 'net'
    | 'self' | 'self-graph' | 'self-mem' | 'gem' | 'top' | 'follow' | 'follow-graph'
export type Tile = { id: string; kind: TileKind; rect: GridRect }
export type TilePage = { id: string; name: string; color: number; tiles: Tile[] }
export type TileLayout = { pages: TilePage[]; page: string }

const props = defineProps<{
    store: Store
    /** The saved pages (this copy's view.pages; view.tiles, 0.2.0's single page, is read too); absent: the usual ones. */
    pages?: unknown
    legacyTiles?: unknown
    /** The page shown (view.page). */
    page?: string
    onSave?: (layout: TileLayout) => void
    /** This copy's recorder: its clock in the bar while it records. */
    recorder?: Recorder
}>()
const emit = defineEmits<{ (e: 'details'): void }>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const store = props.store
const rootEl = ref<HTMLElement | null>(null)
/** The ＋ menu, drawn inside the widget (✓ on this page, a fainter ✓ on another: more than the shell's plain menus). */
const imenu = useInlineMenu(() => rootEl.value)
const addBtn = ref<HTMLElement | null>(null)
const arranging = ref(false)
const width = ref(600)
const height = ref(400)

/** A column is at least CELL_W wide; rows share the height (MIN_H to MAX_H each), so the usual tiles fit without a scrollbar. */
const CELL_W = 150, MIN_H = 96, MAX_H = 230, GAP = 6, PAD = 6, PAGES_H = 33
const KINDS: TileKind[] = ['cpu', 'cpu-graph', 'cores', 'ram', 'ram-graph', 'gpu', 'gpu-graph', 'disk', 'net', 'top', 'follow', 'follow-graph', 'self', 'self-graph', 'self-mem', 'gem']
const TITLES: Record<TileKind, string> = {
    cpu: 'CPU gauge', 'cpu-graph': 'CPU graph', cores: 'Cores', ram: 'Memory gauge', 'ram-graph': 'Memory graph', gpu: 'GPU gauge',
    'gpu-graph': 'GPU graph', disk: 'Disks graph', net: 'Network graph', top: 'Busiest programs',
    self: 'GEM Shell gauge', 'self-graph': 'GEM Shell CPU graph', 'self-mem': 'GEM Shell memory graph', gem: 'GEM Shell\'s processes',
    follow: 'Followed program gauge', 'follow-graph': 'Followed program graph',
}
const GRAPH_TITLE: Partial<Record<TileKind, string>> = {
    'cpu-graph': 'CPU', 'ram-graph': 'Memory', 'gpu-graph': 'GPU', disk: 'Disks', net: 'Network', 'self-graph': 'GEM Shell CPU', 'self-mem': 'GEM Shell memory',
    'follow-graph': 'Followed',
}
const GRAPHS: TileKind[] = ['cpu-graph', 'ram-graph', 'gpu-graph', 'disk', 'net', 'self-graph', 'self-mem', 'follow-graph']
const isGraph = (k: TileKind) => GRAPHS.includes(k)
const GAUGE_LABEL: Partial<Record<TileKind, string>> = { cpu: 'CPU', ram: 'Memory', gpu: 'GPU', self: 'GEM Shell', follow: 'Followed' }
const SETS: Record<TileKind, MonitorSet[]> = {
    cpu: ['cpu'], 'cpu-graph': ['cpu'], cores: ['cpu'], ram: ['memory'], 'ram-graph': ['memory'], gpu: ['gpu'], 'gpu-graph': ['gpu'],
    disk: ['disks'], net: ['network'], self: ['self'], 'self-graph': ['self'], 'self-mem': ['self'], gem: ['self'], top: ['processes'],
    // the followed program comes with the watch's pid (store.follow): nothing more to read
    follow: [], 'follow-graph': [],
}
const GAUGE_LIMITS: GridSizeLimits = { maxCols: 3, maxRows: 3 }
const GRAPH_LIMITS: GridSizeLimits = { maxRows: 3 }
const LIMITS: Record<TileKind, GridSizeLimits> = {
    cpu: GAUGE_LIMITS, ram: GAUGE_LIMITS, gpu: GAUGE_LIMITS, self: GAUGE_LIMITS, follow: GAUGE_LIMITS, 'follow-graph': GRAPH_LIMITS,
    'cpu-graph': GRAPH_LIMITS, 'ram-graph': GRAPH_LIMITS, 'gpu-graph': GRAPH_LIMITS, disk: GRAPH_LIMITS, net: GRAPH_LIMITS,
    'self-graph': GRAPH_LIMITS, 'self-mem': GRAPH_LIMITS, cores: { maxRows: 3 },
    top: { minCols: 2, minRows: 1, maxRows: 4 }, gem: { minCols: 2, minRows: 1, maxRows: 4 },
}
/** New tiles: a graph or a list two columns wide (narrower works: it's only cramped). */
const NEW_COLS: Partial<Record<TileKind, number>> = { 'follow-graph': 2, cores: 2, 'cpu-graph': 2, 'ram-graph': 2, 'gpu-graph': 2, disk: 2, net: 2, 'self-graph': 2, 'self-mem': 2, top: 2, gem: 2 }
const PAGE_COLORS = ['#5aa9d6', '#b07ee8', '#6fc28b', '#e0a84a', '#e36f8f', '#4fc1c1', '#d8d25a', '#9a9aa6']
const MAX_PAGES = 8
const r = (col: number, row: number, colSpan = 1, rowSpan = 1): GridRect => ({ col, row, colSpan, rowSpan })
const USUAL_GEM: Array<{ kind: TileKind; rect: GridRect }> = [
    { kind: 'self', rect: r(0, 0) }, { kind: 'self-graph', rect: r(1, 0, 3) },
    { kind: 'gem', rect: r(0, 1, 2, 2) }, { kind: 'self-mem', rect: r(2, 1, 2, 2) },
]
const USUAL: Array<{ kind: TileKind; rect: GridRect }> = [
    { kind: 'cpu', rect: { col: 0, row: 0, colSpan: 1, rowSpan: 1 } },
    { kind: 'cores', rect: { col: 1, row: 0, colSpan: 2, rowSpan: 1 } },
    { kind: 'ram', rect: { col: 3, row: 0, colSpan: 1, rowSpan: 1 } },
    { kind: 'cpu-graph', rect: { col: 0, row: 1, colSpan: 2, rowSpan: 1 } },
    { kind: 'net', rect: { col: 2, row: 1, colSpan: 2, rowSpan: 1 } },
    { kind: 'disk', rect: { col: 0, row: 2, colSpan: 2, rowSpan: 1 } },
    { kind: 'gpu', rect: { col: 2, row: 2, colSpan: 1, rowSpan: 1 } },
    { kind: 'self', rect: { col: 3, row: 2, colSpan: 1, rowSpan: 1 } },
]
let seq = 0
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`

const cols = computed(() => Math.max(1, Math.min(12, Math.floor((width.value - 2 * PAD + GAP) / (CELL_W + GAP)))))

const fresh = (list: Array<{ kind: TileKind; rect: GridRect }>): Tile[] => list.map(u => ({ id: newId(), kind: u.kind, rect: { ...u.rect } }))
const usualPages = (): TilePage[] => [
    { id: newId(), name: 'Overview', color: 0, tiles: fresh(USUAL) },
    { id: newId(), name: 'GEM Shell', color: 1, tiles: fresh(USUAL_GEM) },
]

/** The saved pages, checked (they come from the view: anything odd is dropped). 0.2.0's single list becomes one page. */
function cleanPages(pages: unknown, legacy: unknown): TilePage[] {
    if (!Array.isArray(pages)) return Array.isArray(legacy) ? [{ id: newId(), name: '', color: 0, tiles: clean(legacy) }] : usualPages()
    const out: TilePage[] = []
    for (const p of pages as any[]) {
        if (!p || typeof p.id !== 'string') continue
        out.push({ id: p.id.slice(0, 40), name: typeof p.name === 'string' ? p.name.slice(0, 24) : '',
            color: Math.abs(Math.floor(Number(p.color) || 0)) % PAGE_COLORS.length, tiles: clean(p.tiles) })
        if (out.length >= MAX_PAGES) break
    }
    return out.length ? out : usualPages()
}

function clean(list: unknown): Tile[] {
    if (!Array.isArray(list)) return []
    const out: Tile[] = []
    for (const t of list as any[]) {
        if (!t || !KINDS.includes(t.kind) || typeof t.id !== 'string') continue
        const r = t.rect ?? {}
        const n = (v: any, min: number) => Math.max(min, Math.floor(Number(v) || 0))
        out.push({ id: t.id.slice(0, 40), kind: t.kind, rect: { col: n(r.col, 0), row: n(r.row, 0), colSpan: n(r.colSpan, 1), rowSpan: n(r.rowSpan, 1) } })
        if (out.length >= 40) break
    }
    return out
}

/** Saved rects for another width: tiles wider than the columns shrink, those past the edge move to the first free spot. */
function fit(list: Tile[], c: number): Tile[] {
    const kept: Tile[] = []
    const snapOf = () => gridSnapshot(kept.map(t => ({ id: t.id, rect: t.rect })))
    for (const t of [...list].sort((a, b) => a.rect.row - b.rect.row || a.rect.col - b.rect.col)) {
        const colSpan = Math.min(t.rect.colSpan, c)
        let rect = { ...t.rect, colSpan }
        const overlaps = kept.some(k => k.rect.col < rect.col + rect.colSpan && rect.col < k.rect.col + k.rect.colSpan && k.rect.row < rect.row + rect.rowSpan && rect.row < k.rect.row + k.rect.rowSpan)
        if (rect.col + rect.colSpan > c || overlaps) rect = gridFirstFree(snapOf(), c, colSpan, rect.rowSpan, 0)
        kept.push({ ...t, rect })
    }
    return kept
}

const pages = ref<TilePage[]>(cleanPages(props.pages, props.legacyTiles))
const pageId = ref<string>(props.page ?? '')
watch(() => props.pages, p => { if (!drag.value && p) pages.value = cleanPages(p, undefined) })
watch(() => props.page, p => { if (p) pageId.value = p })
const current = computed<TilePage>(() => pages.value.find(p => p.id === pageId.value) ?? pages.value[0])
const committed = computed<Tile[]>(() => current.value.tiles)
const showPages = computed(() => arranging.value || pages.value.length > 1)
/** The name being typed: its own state (a :value binding was reset by each sample's re-render while typing). */
const nameDraft = ref('')
watch(() => current.value.id + '\u0000' + current.value.name, () => { nameDraft.value = current.value.name }, { immediate: true })
const preview = ref<Map<string, GridRect> | null>(null)
const placed = computed<Tile[]>(() => {
    const base = fit(committed.value, cols.value)
    const p = preview.value
    return p ? base.map(t => ({ ...t, rect: p.get(t.id) ?? t.rect })) : base
})
const rows = computed(() => Math.max(1, ...placed.value.map(t => t.rect.row + t.rect.rowSpan)))
/** Frozen while a tile is dragged (a row that appears under it must not change the cells' size mid-gesture). */
let frozenH = 0
const rowH = computed(() => {
    if (drag.value && frozenH) return frozenH
    const fitH = Math.floor((height.value - PAGES_H - 2 * PAD - GAP * (rows.value - 1)) / rows.value)
    return Math.max(MIN_H, Math.min(MAX_H, fitH))
})
const cellW = computed(() => (width.value - 2 * PAD - GAP * (cols.value - 1)) / cols.value)
const gridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${cols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows.value}, ${rowH.value}px)`,
    gap: `${GAP}px`,
}))
const cellStyle = (r: GridRect) => ({ gridColumn: `${r.col + 1} / span ${r.colSpan}`, gridRow: `${r.row + 1} / span ${r.rowSpan}` })

function persist(next: TilePage[], page = current.value.id) {
    pages.value = next
    pageId.value = page
    props.onSave?.({
        pages: next.map(p => ({ ...p, tiles: p.tiles.map(t => ({ id: t.id, kind: t.kind, rect: { ...t.rect } })) })),
        page,
    })
}
/** The current page's tiles, changed. */
function save(list: Tile[]) {
    const id = current.value.id
    persist(pages.value.map(p => p.id === id ? { ...p, tiles: list } : p))
}

// ── Pages ───────────────────────────────────────────────────────────────────

const pageTitle = (p: TilePage, i: number) => `${p.name || `Page ${i + 1}`} (${p.tiles.length} tiles)`
function goPage(id: string) {
    if (id === current.value.id) return
    persist(pages.value, id)
}
function pageKeys(e: KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const i = pages.value.findIndex(p => p.id === current.value.id)
    const next = pages.value[(i + d + pages.value.length) % pages.value.length]
    goPage(next.id)
    requestAnimationFrame(() => (rootEl.value?.querySelector('.gm-page.on') as HTMLElement | null)?.focus())
}
function addPage() {
    if (pages.value.length >= MAX_PAGES) return
    const used = new Set(pages.value.map(p => p.color))
    const color = PAGE_COLORS.findIndex((_, i) => !used.has(i))
    const p: TilePage = { id: newId(), name: '', color: color < 0 ? pages.value.length % PAGE_COLORS.length : color, tiles: [] }
    persist([...pages.value, p], p.id)
}
function rename(name: string) {
    const id = current.value.id
    persist(pages.value.map(p => p.id === id ? { ...p, name: name.trim().slice(0, 24) } : p))
}
function recolor() {
    const id = current.value.id
    persist(pages.value.map(p => p.id === id ? { ...p, color: (p.color + 1) % PAGE_COLORS.length } : p))
}
async function removePage() {
    if (pages.value.length < 2) return
    const p = current.value
    if (p.tiles.length && !(await ui.confirm(`Remove the page "${p.name || 'this page'}" and its ${p.tiles.length} tiles?`, { title: 'Remove a page', okLabel: 'Remove', danger: true }))) return
    const i = pages.value.findIndex(x => x.id === p.id)
    const next = pages.value.filter(x => x.id !== p.id)
    persist(next, next[Math.max(0, i - 1)].id)
}

// ── What the tiles need (only that is read) ──────────────────────────────────

let release: (() => void) | null = null
watch(() => [...new Set(placed.value.flatMap(t => SETS[t.kind]))].sort().join(','), sets => {
    release?.()
    release = sets ? store.need(sets.split(',') as MonitorSet[]) : null
}, { immediate: true })

// ── Values ──────────────────────────────────────────────────────────────────

const s = computed(() => { void store.st.tick; return store.last.value })
const tick = computed(() => store.st.tick)
const hist = store.hist
const ramPct = () => s.value?.memory?.total ? (s.value.memory.total - s.value.memory.available) * 100 / s.value.memory.total : 0
const gpuPct = () => Math.max(0, ...(s.value?.gpu ?? []).map(g => g.total))

const ft = computed(() => followTree(s.value))
const followName = () => (store.st.follow?.name ?? '').replace(/\.exe$/i, '')
const recClock = computed(() => { void props.recorder?.st.count; return clock(props.recorder?.elapsed() ?? 0) })

function gaugeValue(k: TileKind): number {
    if (k === 'follow') return ft.value?.cpu ?? 0
    if (k === 'cpu') return s.value?.cpu?.total ?? 0
    if (k === 'ram') return ramPct()
    if (k === 'gpu') return gpuPct()
    return s.value?.self?.cpu ?? 0
}
function gaugeText(k: TileKind): string {
    if (k === 'self') return `${(s.value?.self?.cpu ?? 0).toFixed(1)}%`
    if (k === 'follow') return store.st.follow ? `${(ft.value?.cpu ?? 0).toFixed(1)}%` : '–'
    return pct(gaugeValue(k))
}
function tileSub(k: TileKind): string {
    const x = s.value
    if (k === 'cpu') return store.st.info?.cpuName ?? ''
    if (k === 'ram') return x?.memory ? `${bytes(x.memory.total - x.memory.available)} of ${bytes(x.memory.total)}` : ''
    if (k === 'gpu') return x?.gpu?.[0] ? `${x.gpu[0].name} · ${bytes(x.gpu[0].dedicated)}` : 'No GPU reading'
    if (k === 'follow') return !store.st.follow ? 'Follow a program: ☰, Processes, ◎' : store.st.follow.gone ? `${store.st.follow.name} ended` : `${store.st.follow.name} · ${bytes(ft.value?.priv)}`
    return x?.self ? `${bytes(x.self.priv)} in ${x.self.count} processes` : ''
}
function gaugeSize(r: GridRect): number {
    const w = r.colSpan * cellW.value + (r.colSpan - 1) * GAP, h = r.rowSpan * rowH.value + (r.rowSpan - 1) * GAP - (r.colSpan > 1 || r.rowSpan > 1 ? 26 : 12)
    return Math.max(60, Math.min(w - 12, h))
}
function graph(k: TileKind): [number[], number[] | undefined] {
    switch (k) {
        case 'cpu-graph': return [hist.cpu, hist.kernel]
        case 'ram-graph': return [hist.ram, undefined]
        case 'gpu-graph': return [hist.gpu, undefined]
        case 'disk': return [hist.diskRead, hist.diskWrite]
        case 'self-graph': return [hist.self, undefined]
        case 'self-mem': return [hist.selfMem, undefined]
        case 'follow-graph': return [hist.followCpu, hist.followGpu]
        default: return [hist.netIn, hist.netOut]
    }
}
function graphMax(k: TileKind): number | undefined {
    if (k === 'cpu-graph' || k === 'ram-graph' || k === 'gpu-graph') return 100
    // GEM Shell's memory barely moves: headroom, so the line isn't pinned to the top
    if (k === 'self-mem') return Math.max(1, ...hist.selfMem) * 1.25
    return undefined
}
const graphColor = (k: TileKind) => ({
    'cpu-graph': 'var(--gm-accent)', 'ram-graph': 'var(--gm-mem)', 'gpu-graph': 'var(--gm-gpu)', disk: 'var(--gm-disk)', net: 'var(--gm-net)',
    'self-graph': 'var(--gm-accent)', 'self-mem': 'var(--gm-mem)', 'follow-graph': 'var(--gm-disk)',
} as Record<string, string>)[k]
/** How a measured stretch is written. */
const graphFormat = (k: TileKind) => (k === 'disk' || k === 'net') ? rate : k === 'self-mem' ? (v: number) => bytes(v) : undefined
/** The value in the tile's title; `narrow` (one column): a single figure. */
function graphText(k: TileKind, narrow = false): string {
    const x = s.value
    const io = (a: number, b: number) => narrow ? rate(a + b) : `↓ ${rate(a)}  ↑ ${rate(b)}`
    switch (k) {
        case 'cpu-graph': return pct(x?.cpu?.total)
        case 'ram-graph': return pct(ramPct())
        case 'gpu-graph': return pct(gpuPct())
        case 'disk': return x?.disks ? io(x.disks.reduce((a, d) => a + d.read, 0), x.disks.reduce((a, d) => a + d.write, 0)) : ''
        case 'self-graph': return x?.self ? `${x.self.cpu.toFixed(1)}%` : ''
        case 'self-mem': return x?.self ? bytes(x.self.priv) : ''
        case 'follow-graph': return store.st.follow ? `${followName().slice(0, 14)} ${(ft.value?.cpu ?? 0).toFixed(1)}%` : '–'
        default: return x?.network ? io(x.network.reduce((a, n) => a + n.received, 0), x.network.reduce((a, n) => a + n.sent, 0)) : ''
    }
}
/** What the graph is about, written faintly behind it along the top. */
function graphInfo(k: TileKind): string {
    const x = s.value, info = store.st.info
    switch (k) {
        case 'cpu-graph': return info ? `${info.cpuName} · ${info.logicalCores} threads · kernel ${pct(x?.cpu?.kernel)}` : ''
        case 'ram-graph': return x?.memory ? `${bytes(x.memory.total - x.memory.available)} of ${bytes(x.memory.total)} · commit ${bytes(x.memory.committed)}` : ''
        case 'gpu-graph': return x?.gpu?.length ? x.gpu.map(g => `${g.name} · ${bytes(g.dedicated)}`).join(' / ') : (info?.gpus.join(' / ') ?? '')
        case 'disk': return x?.disks?.length ? x.disks.map(d => `${d.name} ${Math.round(d.active)}%`).join(' · ') : ''
        case 'net': return x?.network?.length ? x.network.map(n => n.name).join(' · ') : ''
        case 'self-graph': return x?.self ? `${x.self.count} processes · ${x.self.threads} threads` : ''
        case 'self-mem': return x?.self ? `working set ${bytes(x.self.ws)}` : ''
        case 'follow-graph': {
            const f = store.st.follow
            if (!f) return 'Follow a program: ☰, Processes, ◎'
            if (f.gone) return `${f.name} ended`
            const t = ft.value
            return t ? `${f.name} · ${bytes(t.priv)} · GPU ${t.gpu.toFixed(0)}% (dashed)${t.count > 1 ? ` · ${t.count} processes` : ''}` : f.name
        }
        default: return ''
    }
}
function coreColumns(r: GridRect): number {
    const n = s.value?.cpu?.cores.length ?? 1
    const perRow = Math.max(1, Math.floor(r.colSpan * cellW.value / 18))
    return Math.min(n, Math.max(Math.ceil(n / Math.max(1, r.rowSpan * 2)), Math.min(perRow, n)))
}
/** As many rows as the tile has room for. */
const listRows = (rect: GridRect) => Math.max(2, Math.floor((rect.rowSpan * rowH.value + (rect.rowSpan - 1) * GAP - 30) / 16))
function topProcs(rect: GridRect) {
    return [...(s.value?.processes ?? [])].sort((a, b) => b.cpu - a.cpu).slice(0, listRows(rect))
}
function gemProcs(rect: GridRect) {
    return [...(s.value?.self?.parts ?? [])].sort((a, b) => b.priv - a.priv).slice(0, listRows(rect))
}

// ── Arranging: move, resize, add, remove ────────────────────────────────────

const drag = ref<{ id: string; kind: 'move' | 'resize'; x: number; y: number } | null>(null)

function cellAt(e: PointerEvent): { col: number; row: number } {
    const grid = rootEl.value?.querySelector('.gm-tiles-grid') as HTMLElement | null
    const box = grid?.getBoundingClientRect()
    if (!box) return { col: 0, row: 0 }
    const cw = cellW.value + GAP
    return {
        col: Math.max(0, Math.min(cols.value - 1, Math.floor((e.clientX - box.left - PAD) / cw))),
        row: Math.max(0, Math.floor((e.clientY - box.top - PAD + grid!.scrollTop) / (rowH.value + GAP))),
    }
}

let grabOffset = { col: 0, row: 0 }
function startMove(e: PointerEvent, id: string) {
    if (!arranging.value || e.button !== 0) return
    const t = placed.value.find(x => x.id === id)
    if (!t) return
    const c = cellAt(e)
    grabOffset = { col: c.col - t.rect.col, row: c.row - t.rect.row }
    frozenH = rowH.value
    drag.value = { id, kind: 'move', x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    e.preventDefault()
}
function startResize(e: PointerEvent, id: string) {
    if (e.button !== 0) return
    frozenH = rowH.value
    drag.value = { id, kind: 'resize', x: e.clientX, y: e.clientY }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    e.preventDefault()
}
function onMove(e: PointerEvent) {
    const d = drag.value
    if (!d) return
    const base = fit(committed.value, cols.value)
    const snap = gridSnapshot(base.map(t => ({ id: t.id, rect: t.rect })))
    if (d.kind === 'move') {
        const c = cellAt(e)
        preview.value = gridDrag(snap, cols.value, d.id, { col: Math.max(0, c.col - grabOffset.col), row: Math.max(0, c.row - grabOffset.row) })
    } else {
        const cw = cellW.value + GAP
        const dCols = Math.round((e.clientX - d.x) / cw), dRows = Math.round((e.clientY - d.y) / (rowH.value + GAP))
        const kind = base.find(t => t.id === d.id)?.kind ?? 'cpu'
        const next = dCols || dRows ? gridResize(snap, cols.value, d.id, 'se', dCols, dRows, { maxCols: cols.value, ...LIMITS[kind] }) : null
        if (next || (!dCols && !dRows)) preview.value = next
    }
}
function onUp() {
    window.removeEventListener('pointermove', onMove)
    const p = preview.value
    drag.value = null
    preview.value = null
    if (p) save(fit(committed.value, cols.value).map(t => ({ ...t, rect: p.get(t.id) ?? t.rect })))
}

function remove(id: string) { save(committed.value.filter(t => t.id !== id)) }

/**
 * ＋: the kinds; ✓ those on this page, a fainter ✓ (and the page's colour) those placed on another page only.
 * Picking a ✓ one removes it from this page, another adds it here at the first free spot.
 */
async function addTile() {
    if (!addBtn.value) return
    const on = new Set(committed.value.map(t => t.kind))
    const elsewhere = new Map<TileKind, TilePage[]>()
    for (const p of pages.value) {
        if (p.id === current.value.id) continue
        for (const t of p.tiles) if (!on.has(t.kind)) elsewhere.set(t.kind, [...(elsewhere.get(t.kind) ?? []).filter(x => x.id !== p.id), p])
    }
    const pageName = (p: TilePage) => p.name || `page ${pages.value.indexOf(p) + 1}`
    const items: InlineMenuItem[] = KINDS.map(k => {
        const other = elsewhere.get(k)
        return {
            id: k, label: TITLES[k],
            check: on.has(k) ? 'on' as const : other ? 'faint' as const : false,
            dot: !on.has(k) && other ? PAGE_COLORS[other[0].color % PAGE_COLORS.length] : undefined,
            title: on.has(k) ? 'On this page: pick it to remove it' : other ? `On ${other.map(pageName).join(', ')}: pick it to add it here too` : undefined,
        }
    })
    const id = await imenu.open(addBtn.value, items, 'Tiles on this page')
    if (!id) return
    const kind = id as TileKind
    if (on.has(kind)) { save(committed.value.filter(t => t.kind !== kind)); return }
    const lim = LIMITS[kind]
    const base = fit(committed.value, cols.value)
    const rect = gridFirstFree(gridSnapshot(base.map(t => ({ id: t.id, rect: t.rect }))), cols.value,
        Math.min(cols.value, Math.max(NEW_COLS[kind] ?? 1, lim.minCols ?? 1)), lim.minRows ?? 1, 0)
    save([...base, { id: newId(), kind, rect }])
}

function resetTiles() { save(fresh(USUAL)) }

let obs: ResizeObserver | null = null
onMounted(() => {
    if (!rootEl.value) return
    const measure = () => {
        width.value = rootEl.value?.clientWidth || width.value
        height.value = rootEl.value?.clientHeight || height.value
    }
    measure()
    obs = new ResizeObserver(measure)
    obs.observe(rootEl.value)
})
onBeforeUnmount(() => {
    obs?.disconnect()
    release?.()
    window.removeEventListener('pointermove', onMove)
})
</script>
