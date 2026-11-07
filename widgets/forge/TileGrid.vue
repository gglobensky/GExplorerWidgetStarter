<!-- widgets/forge/TileGrid.vue -->
<!--
    GEM FORGE 0.1b: one page of tiles (layout.ts). A tile's head holds its parts as tabs; each tab's ⋯ (or a right-click
    on it) offers Detach, Attach to…, Move to page…, Close (GEM Shell's own menu). Arranging (✎ in the bar): drag a
    tile by its head to move it, the others make room (gridDrag); drag its corner to resize it (gridResize).
    Narrow: the page's parts as tabs above one part at a time (one arrangement per page, folded when there's no room).
-->
<template>
    <div ref="root" class="gf-grid-host">
        <template v-if="narrow">
            <nav class="gf-narrow-tabs">
                <button v-for="k in pageParts" :key="k" type="button" :class="{ on: k === narrowPart }" @click="narrowPart = k"
                        @contextmenu.prevent="partMenu($event, k)">
                    {{ PART_TITLES[k] }}<span v-if="k === 'problems' && errors" class="gf-count">{{ errors }}</span>
                </button>
            </nav>
            <section v-if="narrowPart" class="gf-tile gf-narrow-tile">
                <component :is="components[narrowPart]" :project="project" />
            </section>
            <div v-else class="gf-empty">This page is empty: ＋ Part adds one.</div>
        </template>
        <div v-else class="gf-grid" :style="gridStyle">
            <section v-for="t in shown" :key="t.id" class="gf-tile" :class="{ dragging: drag?.id === t.id }" :style="cellStyle(t.rect)">
                <div class="gf-tile-head gf-tabbed" :class="{ grab: arranging }" @pointerdown="arranging && startMove($event, t)">
                    <button v-for="k in t.parts" :key="k" type="button" :class="{ on: k === t.active }"
                            @pointerdown.stop="arranging && startMove($event, t)"
                            @click="emit('change', setActive(layout, t.id, k))" @contextmenu.prevent="partMenu($event, k)">
                        {{ PART_TITLES[k] }}<span v-if="k === 'problems' && errors" class="gf-count">{{ errors }}</span>
                    </button>
                    <span class="gf-grow" />
                    <button type="button" class="gf-more" title="Detach, attach, move, close" @pointerdown.stop @click="partMenu($event, t.active)">⋯</button>
                </div>
                <div class="gf-tile-body">
                    <component :is="components[t.active]" :project="project" />
                    <div v-if="arranging" class="gf-arrange-cover" />
                </div>
                <span v-if="arranging" class="gf-resize" title="Resize" @pointerdown.stop="startResize($event, t)" />
            </section>
            <div v-if="!shown.length" class="gf-empty gf-page-empty">This page is empty: ＋ Part adds one.</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import type { WidgetSdk, GridRect } from 'gexplorer/widgets'
import type { Project } from './project'
import {
    COLS, PART_TITLES, type Layout, type PartKind, type Tile,
    setActive, detach, attach, moveToPage, closePart, dragTile, resizeTile, setTiles, findPart, pageName,
} from './layout'
import Explorer from './Explorer.vue'
import CodeEditor from './CodeEditor.vue'
import PreviewPart from './PreviewPart.vue'
import Problems from './Problems.vue'
import Output from './Output.vue'

const props = defineProps<{ project: Project; layout: Layout; arranging: boolean; narrow: boolean }>()
const emit = defineEmits<{ (e: 'change', l: Layout): void }>()
const sdk = inject<WidgetSdk>('widgetSdk')!
const components: Record<PartKind, Component> = { explorer: Explorer, code: CodeEditor, preview: PreviewPart, problems: Problems, output: Output }

const root = ref<HTMLElement | null>(null)
const height = ref(500)
const GAP = 8
const errors = computed(() => props.project.state.errors.length)

const page = computed(() => props.layout.pages.find(p => p.id === props.layout.page) ?? props.layout.pages[0])
const preview = ref<Tile[] | null>(null)
const shown = computed(() => preview.value ?? page.value.tiles)
const rows = computed(() => Math.max(6, ...shown.value.map(t => t.rect.row + t.rect.rowSpan)))
/** Rows share the height (at least 48 px each: past that, the page scrolls). */
const rowH = computed(() => Math.max(48, Math.floor((height.value - GAP * (rows.value - 1)) / rows.value)))
const gridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows.value}, ${rowH.value}px)`,
    gap: `${GAP}px`,
}))
const cellStyle = (r: GridRect) => ({ gridColumn: `${r.col + 1} / span ${r.colSpan}`, gridRow: `${r.row + 1} / span ${r.rowSpan}` })

// Narrow: the page's parts, one at a time
const pageParts = computed<PartKind[]>(() => page.value.tiles.flatMap(t => t.parts))
const narrowPart = ref<PartKind | null>(null)
watch(pageParts, ps => { if (!narrowPart.value || !ps.includes(narrowPart.value)) narrowPart.value = ps.includes('code') ? 'code' : ps[0] ?? null }, { immediate: true })

// ── A tab's menu: Detach / Attach to… / Move to page… / Close ──────────────────────────────────────────────────────
async function partMenu(e: MouseEvent, kind: PartKind) {
    const ui = sdk.ui?.()
    if (!ui) return
    const l = props.layout
    const at = findPart(l, kind)
    if (!at) return
    const others = at.page.tiles.filter(t => t.id !== at.tile.id)
    const items = [
        { id: 'detach', label: 'Detach (its own tile)', disabled: at.tile.parts.length < 2 },
        ...others.map(t => ({ id: `attach:${t.id}`, label: `Attach to ${t.parts.map(k => PART_TITLES[k]).join(' + ')}` })),
        ...l.pages.filter(p => p.id !== at.page.id).map(p => ({ id: `page:${p.id}`, label: `Move to page ${pageName(l, p)}` })),
        { id: 'close', label: `Close ${PART_TITLES[kind]}` },
    ]
    const id = await ui.menu(e, items, { label: PART_TITLES[kind] })
    if (!id) return
    if (id === 'detach') emit('change', detach(l, kind))
    else if (id === 'close') emit('change', closePart(l, kind))
    else if (id.startsWith('attach:')) emit('change', attach(l, kind, id.slice(7)))
    else if (id.startsWith('page:')) emit('change', moveToPage(l, kind, id.slice(5)))
}

// ── Arranging: drag a tile by its head, resize from its corner (the hubs' engine) ──────────────────────────────────
type Drag = { id: string; kind: 'move' | 'resize'; x: number; y: number; grab: { col: number; row: number } }
const drag = ref<Drag | null>(null)
let base: Tile[] = []

function cellAt(e: PointerEvent): { col: number; row: number } {
    const box = root.value!.querySelector('.gf-grid')!.getBoundingClientRect()
    const cw = (box.width + GAP) / COLS
    return { col: Math.max(0, Math.min(COLS - 1, Math.floor((e.clientX - box.left) / cw))), row: Math.max(0, Math.floor((e.clientY - box.top) / (rowH.value + GAP))) }
}
function startMove(e: PointerEvent, t: Tile) {
    if (e.button !== 0 || !props.arranging) return
    const c = cellAt(e)
    base = page.value.tiles
    drag.value = { id: t.id, kind: 'move', x: e.clientX, y: e.clientY, grab: { col: c.col - t.rect.col, row: c.row - t.rect.row } }
    listen(e)
}
function startResize(e: PointerEvent, t: Tile) {
    if (e.button !== 0) return
    base = page.value.tiles
    drag.value = { id: t.id, kind: 'resize', x: e.clientX, y: e.clientY, grab: { col: 0, row: 0 } }
    listen(e)
}
function listen(e: PointerEvent) {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    e.preventDefault()
}
function onMove(e: PointerEvent) {
    const d = drag.value
    if (!d) return
    if (d.kind === 'move') {
        const c = cellAt(e)
        preview.value = dragTile(base, d.id, { col: Math.max(0, c.col - d.grab.col), row: Math.max(0, c.row - d.grab.row) })
    } else {
        const box = root.value!.querySelector('.gf-grid')!.getBoundingClientRect()
        const dCols = Math.round((e.clientX - d.x) / ((box.width + GAP) / COLS))
        const dRows = Math.round((e.clientY - d.y) / (rowH.value + GAP))
        if (!dCols && !dRows) { preview.value = null; return }
        const next = resizeTile(base, d.id, dCols, dRows)
        if (next) preview.value = next
    }
}
function onUp() {
    window.removeEventListener('pointermove', onMove)
    const p = preview.value
    drag.value = null
    preview.value = null
    if (p) emit('change', setTiles(props.layout, page.value.id, p))
}

let obs: ResizeObserver | null = null
onMounted(() => {
    obs = new ResizeObserver(() => { if (root.value) height.value = root.value.clientHeight })
    if (root.value) { obs.observe(root.value); height.value = root.value.clientHeight }
})
onBeforeUnmount(() => { obs?.disconnect(); window.removeEventListener('pointermove', onMove) })
</script>
