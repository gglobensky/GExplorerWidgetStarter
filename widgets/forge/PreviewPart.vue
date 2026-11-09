<!-- widgets/forge/PreviewPart.vue -->
<!--
    GEM FORGE 0.1: the project running, shown by GEM Shell over this part's box (sdk.dev().preview: a real placement,
    its own copy; GEM Forge never touches it). The placement: grid (this box's size), sidebar, toolbar; or a window.
    A build with problems leaves the last good one running: the banner says so.
    0.1.7: there may be several (a small one on Code, a big one on its own page: layout v2, part ids preview:n); each
    keeps its options in the layout (Widget.vue provides gfPreviewOpts). SIMULATING a placement (the prototype's lab):
      sidebar  the height the sidebar gives it, between the smallest and the largest it may give (starting from
               entry.ts's sidebar minHeight / maxHeight when it declares them); Squeeze / Stretch;
      toolbar  the width the toolbar row gives it (auto: as wide as it wants).
    0.1.10: in grid, this box is a whole hub (its columns, the user's rows): the widget takes whole cells, its corner
    grip snaps to them (⤢: the whole hub). The size says cells and the px they make here.
    0.1.12: ✥ (its bottom-left grip) moves it to another place in the hub, by whole cells.
-->
<template>
    <div class="gf-preview">
        <div class="gf-pv-bar">
            <span class="gf-dim">Real placement:</span>
            <button v-for="c in CONTEXTS" :key="c" type="button" class="gf-seg" :class="{ on: o.context === c }" @click="setContext(c)">{{ c }}</button>
            <span class="gf-grow" />
            <button v-if="o.context !== 'grid'" type="button" class="gf-ib" :class="{ on: simOpen }" title="Simulate the space it gets" @click="simOpen = !simOpen">⇕</button>
            <button v-if="o.context === 'grid' && (o.gridCols || o.gridRows || o.gridCol || o.gridRow)" type="button" class="gf-ib" title="The whole hub" @click="setOpt({ gridCols: undefined, gridRows: undefined, gridCol: undefined, gridRow: undefined })">⤢</button>
            <button type="button" class="gf-ib" title="In a window of its own" :disabled="!s.build" @click="openWindow">⧉</button>
        </div>
        <div v-if="simOpen && o.context === 'sidebar'" class="gf-pv-sim">
            <label>Height <input type="range" :min="minH" :max="maxH" step="5" :value="curH" @input="setOpt({ height: num($event) })"><b>{{ curH }} px</b></label>
            <label>Smallest <input type="range" min="40" max="600" step="5" :value="minH" @input="setOpt({ minHeight: Math.min(num($event), maxH) })"><b>{{ minH }}</b></label>
            <label>Largest <input type="range" min="60" max="1200" step="5" :value="maxH" @input="setOpt({ maxHeight: Math.max(num($event), minH) })"><b>{{ maxH }}</b></label>
            <span class="gf-pv-sim-btns">
                <button type="button" class="gf-btn" @click="setOpt({ height: minH })">Squeeze to min</button>
                <button type="button" class="gf-btn" @click="setOpt({ height: maxH })">Stretch to max</button>
            </span>
        </div>
        <div v-else-if="simOpen && o.context === 'toolbar'" class="gf-pv-sim">
            <label>Width <input type="range" min="36" max="600" step="4" :value="o.width ?? 200" @input="setOpt({ width: num($event) })"><b>{{ o.width ? `${o.width} px` : 'auto' }}</b></label>
            <span class="gf-pv-sim-btns"><button type="button" class="gf-btn" :disabled="!o.width" @click="setOpt({ width: undefined })">As wide as it wants</button></span>
        </div>
        <div v-if="s.build && s.errors.length" class="gf-pv-banner">
            Showing the last build that worked ({{ new Date(s.lastOkAt).toLocaleTimeString() }}) · {{ s.errors.length }} problem{{ s.errors.length === 1 ? '' : 's' }}
        </div>
        <div ref="area" class="gf-pv-area" :class="{ sized: o.context === 'grid' }">
            <!-- 0.1.10: in grid, this box is a whole hub (its columns and rows, Settings ▸ Layout): the widget takes
                 whole cells, resized by its corner grip -->
            <div v-if="o.context === 'grid'" class="gf-pv-cells" :style="cellsStyle">
                <span v-for="i in hub.columns * hub.rows" :key="i" />
            </div>
            <div ref="frame" class="gf-pv-frame" :style="frameStyle">
                <span v-if="!s.build" class="gf-empty">{{ s.building ? 'Building…' : 'Run the project to see it here.' }}</span>
            </div>
            <template v-if="o.context === 'grid' && s.build">
                <span class="gf-pv-grip" :style="gripStyle" title="Drag: the cells it takes in a hub" @pointerdown="startGrip" />
                <span class="gf-pv-grip gf-pv-move" :style="moveStyle" title="Drag: where it sits in the hub" @pointerdown="startMove">✥</span>
                <span class="gf-pv-size">{{ span.c }} × {{ span.r }} cells of {{ hub.columns }} × {{ hub.rows }} · {{ frameSize.w }} × {{ frameSize.h }} px here</span>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { DevPreviewContext, DevPreviewHandle, WidgetSdk } from 'gexplorer/widgets'
import type { Project } from './project'
import { previewOptsInit, type PreviewOpts } from './layout'

// partId: which preview (preview, preview:2…); the playground's own has none (its options stay here)
const props = defineProps<{ project: Project; partId?: string }>()
const s = props.project.state
const CONTEXTS: DevPreviewContext[] = ['grid', 'sidebar', 'toolbar']
type OptsApi = { get(id: string): PreviewOpts; set(id: string, o: Partial<PreviewOpts>): void }
const api = inject<OptsApi | null>('gfPreviewOpts', null)
const local = ref<PreviewOpts>(previewOptsInit())
const o = computed<PreviewOpts>(() => (api && props.partId ? api.get(props.partId) : local.value))
function setOpt(p: Partial<PreviewOpts>) {
    if (api && props.partId) api.set(props.partId, p)
    else local.value = { ...local.value, ...p }
}
const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const simOpen = ref(false)

// The sidebar's bounds: the options, else entry.ts's own (contexts.sidebar), else 120..480
function declared(key: 'minHeight' | 'maxHeight'): number | undefined {
    const m = new RegExp(`sidebar\\s*:\\s*\\{[^}]*\\b${key}\\s*:\\s*(\\d+)`).exec(props.project.file('entry.ts')?.text ?? '')
    return m ? Number(m[1]) : undefined
}
const minH = computed(() => o.value.minHeight ?? declared('minHeight') ?? 120)
const maxH = computed(() => Math.max(minH.value, o.value.maxHeight ?? declared('maxHeight') ?? 480))
const curH = computed(() => Math.min(maxH.value, Math.max(minH.value, o.value.height ?? Math.min(280, maxH.value))))

const area = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)

// ── The grid (0.1.10): this box stands for a whole hub; the widget takes whole cells (kept in the options) ─────────
const sdk = inject<WidgetSdk>('widgetSdk')!
const hub = computed(() => sdk.ui?.().hubGrid?.() ?? { columns: 12, rows: 10, gap: 8 })
const areaSize = ref({ w: 0, h: 0 })
const cell = computed(() => {
    const { columns, rows, gap } = hub.value
    return {
        w: Math.max(4, (areaSize.value.w - gap * (columns + 1)) / columns),
        h: Math.max(4, (areaSize.value.h - gap * (rows + 1)) / rows),
        gap,
    }
})
const span = computed(() => ({
    c: Math.min(hub.value.columns, Math.max(1, o.value.gridCols ?? hub.value.columns)),
    r: Math.min(hub.value.rows, Math.max(1, o.value.gridRows ?? hub.value.rows)),
}))
/** 0.1.12: its top-left cell (moved with ✥), kept inside the hub. */
const pos = computed(() => ({
    col: Math.min(hub.value.columns - span.value.c, Math.max(0, o.value.gridCol ?? 0)),
    row: Math.min(hub.value.rows - span.value.r, Math.max(0, o.value.gridRow ?? 0)),
}))
const cellsStyle = computed(() => ({
    gridTemplateColumns: `repeat(${hub.value.columns}, 1fr)`, gridTemplateRows: `repeat(${hub.value.rows}, 1fr)`,
    gap: `${hub.value.gap}px`, padding: `${hub.value.gap}px`,
}))
const frameStyle = computed(() => {
    if (o.value.context !== 'grid') return { left: '0', top: '0', width: '100%', height: '100%' }
    const c = cell.value
    return {
        left: `${Math.round(c.gap + pos.value.col * (c.w + c.gap))}px`, top: `${Math.round(c.gap + pos.value.row * (c.h + c.gap))}px`,
        width: `${Math.round(span.value.c * c.w + (span.value.c - 1) * c.gap)}px`,
        height: `${Math.round(span.value.r * c.h + (span.value.r - 1) * c.gap)}px`,
    }
})
const frameSize = ref({ w: 0, h: 0 })
const origin = computed(() => ({ x: cell.value.gap + pos.value.col * (cell.value.w + cell.value.gap), y: cell.value.gap + pos.value.row * (cell.value.h + cell.value.gap) }))
const gripStyle = computed(() => ({ left: `${origin.value.x + frameSize.value.w - 7}px`, top: `${origin.value.y + frameSize.value.h - 7}px` }))
const moveStyle = computed(() => ({ left: `${origin.value.x - 7}px`, top: `${origin.value.y + frameSize.value.h - 7}px` }))
let frameObs: ResizeObserver | null = null
onMounted(() => {
    frameObs = new ResizeObserver(() => {
        const el = frame.value, a = area.value
        if (el) frameSize.value = { w: el.offsetWidth, h: el.offsetHeight }
        if (a) areaSize.value = { w: a.clientWidth, h: a.clientHeight }
    })
    if (frame.value) frameObs.observe(frame.value)
    if (area.value) frameObs.observe(area.value)
})
onBeforeUnmount(() => frameObs?.disconnect())
function startGrip(e: PointerEvent) {
    if (e.button !== 0 || !area.value) return
    e.preventDefault()
    const box = area.value.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
        const c = cell.value
        // The corner's cell, counted from its top-left cell
        const cols = Math.round((ev.clientX - box.left) / (c.w + c.gap)) - pos.value.col
        const rows = Math.round((ev.clientY - box.top) / (c.h + c.gap)) - pos.value.row
        const next = { gridCols: Math.min(hub.value.columns - pos.value.col, Math.max(1, cols)), gridRows: Math.min(hub.value.rows - pos.value.row, Math.max(1, rows)) }
        if (next.gridCols !== span.value.c || next.gridRows !== span.value.r) setOpt(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
}
// ✥ (0.1.12): its place in the hub, by whole cells (the grip under it, where the preview doesn't cover)
function startMove(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const c = cell.value
    const x0 = e.clientX, y0 = e.clientY, col0 = pos.value.col, row0 = pos.value.row
    const move = (ev: PointerEvent) => {
        const col = Math.min(hub.value.columns - span.value.c, Math.max(0, col0 + Math.round((ev.clientX - x0) / (c.w + c.gap))))
        const row = Math.min(hub.value.rows - span.value.r, Math.max(0, row0 + Math.round((ev.clientY - y0) / (c.h + c.gap))))
        if (col !== pos.value.col || row !== pos.value.row) setOpt({ gridCol: col, gridRow: row })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
}
let handle: DevPreviewHandle | null = null
let shownFor = ''

/** What the preview frame gets: the box (grid), the simulated sidebar height, the toolbar width. */
function sizes(): { width: number | null; height: number | null } {
    if (o.value.context === 'sidebar') return { width: null, height: curH.value }
    if (o.value.context === 'toolbar') return { width: o.value.width ?? null, height: null }
    return { width: null, height: null }
}

async function show() {
    const dev = props.project.dev
    if (!dev || !area.value || !s.build || !s.id) return
    if (handle && shownFor === s.id) return          // a new build remounts it by itself
    handle?.close()
    handle = null
    const sz = sizes()
    const r = await dev.preview(frame.value ?? area.value, s.id, { context: o.value.context, width: sz.width ?? undefined, height: sz.height ?? undefined })
    if (r.ok) { handle = r.preview; shownFor = s.id }
    else props.project.log('warn', `Preview: ${r.error}`)
}
function setContext(c: DevPreviewContext) {
    setOpt({ context: c })
}
// The options changed (here or restored): the frame follows
watch(() => [o.value.context, curH.value, o.value.width] as const, () => {
    if (!handle) return
    const sz = sizes()
    if (!handle.set({ context: o.value.context, ...sz })) { handle = null; void show() }
})
async function openWindow() {
    // Its title on the window and its card (0.1.5): the playground's result, or the project's preview
    const r = await props.project.dev?.openWindow(s.id, { title: s.id.startsWith('pg-') ? 'Result' : 'Preview' })
    if (r && !r.ok) props.project.log('warn', r.error)
}

// Shown once the project first runs; closed when another project opens
watch(() => [s.build, s.id] as const, ([build, id]) => {
    if (id !== shownFor) { handle?.close(); handle = null; shownFor = '' }
    if (build) void show()
}, { immediate: true })
// FIXED (0.1c): this part on another page mounts after the project ran: the watch above came before its box
onMounted(() => { if (s.build) void show() })
onBeforeUnmount(() => handle?.close())
</script>
