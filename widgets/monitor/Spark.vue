<!-- widgets/monitor/Spark.vue -->
<!--
    A graph of the recent values (store.ts HISTORY points, newest on the right), drawn to its box. max: the top of the
    scale (100 for percentages); absent: the largest value seen (a rate). A second series (`values2`) is drawn dashed.
    selectable: drag across it to measure a stretch (min, average, max, 95th percentile: a snapshot, as the graph
    keeps moving); a click or Esc clears it.
-->
<template>
    <div class="gm-spark" :class="{ selectable }" ref="el" @pointerdown="down" @keydown.escape="sel = null">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
            <g v-if="grid" class="gm-grid">
                <line v-for="y in [0.25, 0.5, 0.75]" :key="y" x1="0" :x2="W" :y1="H * y" :y2="H * y" />
            </g>
            <path v-if="area" :d="areaPath" class="gm-area" :style="{ fill: color }" />
            <path :d="linePath" class="gm-line" :style="{ stroke: color }" vector-effect="non-scaling-stroke" />
            <path v-if="values2" :d="line2Path" class="gm-line gm-line2" :style="{ stroke: color2 ?? color }" vector-effect="non-scaling-stroke" />
            <rect v-if="sel" class="gm-sel" :x="Math.min(sel.a, sel.b) * W" :width="Math.max(0.004, Math.abs(sel.b - sel.a)) * W" y="0" :height="H" />
        </svg>
        <div v-if="sel?.stats" class="gm-sel-stats" :class="{ right: Math.min(sel.a, sel.b) > 0.5 }" @pointerdown.stop>
            <span>min <b>{{ show(sel.stats.min) }}</b></span><span>avg <b>{{ show(sel.stats.avg) }}</b></span>
            <span>max <b>{{ show(sel.stats.max) }}</b></span><span title="95th percentile: what the busiest 5% of the moments reached">p95 <b>{{ show(sel.stats.p95) }}</b></span>
            <span v-if="sel.stats.seconds" class="gm-dim">{{ sel.stats.seconds }}</span>
            <button type="button" class="gm-sel-x" title="Clear" aria-label="Clear the selection" @click="sel = null">×</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { HISTORY } from './store'

const props = withDefaults(defineProps<{
    values: number[]
    values2?: number[]
    /** Re-read on each sample (the arrays are the store's, changed in place). */
    tick?: number
    max?: number
    color?: string
    color2?: string
    area?: boolean
    grid?: boolean
    /** Drag across it to measure a stretch. */
    selectable?: boolean
    /** How a value is written in the measures (default: a percentage). */
    format?: (v: number) => string
    /** The time between two points (ms): the stretch's length is shown. */
    stepMs?: number
}>(), { color: 'var(--gm-accent)', area: true, grid: true })

const W = 240, H = 60

const top = computed(() => {
    void props.tick
    if (props.max) return props.max
    const m = Math.max(1, ...props.values, ...(props.values2 ?? []))
    return m * 1.1
})

function points(vs: number[]): string[] {
    void props.tick
    const n = vs.length
    const step = W / Math.max(1, HISTORY - 1)
    const x0 = W - (n - 1) * step
    return vs.map((v, i) => `${(x0 + i * step).toFixed(1)},${(H - Math.min(1, Math.max(0, v / top.value)) * (H - 2) - 1).toFixed(1)}`)
}
const linePath = computed(() => { const p = points(props.values); return p.length ? `M ${p.join(' L ')}` : '' })
const line2Path = computed(() => { const p = points(props.values2 ?? []); return p.length ? `M ${p.join(' L ')}` : '' })
const areaPath = computed(() => {
    const p = points(props.values)
    if (p.length < 2) return ''
    const x0 = p[0].split(',')[0]
    return `M ${x0},${H} L ${p.join(' L ')} L ${W},${H} Z`
})

// ── Measuring a stretch ─────────────────────────────────────────────────────

type Stats = { min: number; avg: number; max: number; p95: number; seconds: string }
const el = ref<HTMLElement | null>(null)
const sel = ref<{ a: number; b: number; stats: Stats | null } | null>(null)
const show = (v: number) => props.format ? props.format(v) : `${v.toFixed(v < 10 ? 1 : 0)}%`

/** The points under [a, b] (fractions of the width), as drawn now. */
function measure(a: number, b: number): Stats | null {
    const vs = props.values, n = vs.length
    if (!n) return null
    const step = 1 / Math.max(1, HISTORY - 1)
    const x0 = 1 - (n - 1) * step
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const picked = vs.filter((_, i) => { const x = x0 + i * step; return x >= lo - step / 2 && x <= hi + step / 2 })
    if (!picked.length) return null
    const sorted = [...picked].sort((x, y) => x - y)
    const sum = picked.reduce((x, y) => x + y, 0)
    const secs = props.stepMs ? (picked.length * props.stepMs) / 1000 : 0
    return {
        min: sorted[0], max: sorted[sorted.length - 1], avg: sum / picked.length,
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        seconds: secs ? (secs >= 60 ? `${Math.floor(secs / 60)} min ${Math.round(secs % 60)} s` : `${Math.round(secs)} s`) : '',
    }
}

let box: DOMRect | null = null
const frac = (x: number) => box ? Math.max(0, Math.min(1, (x - box.left) / box.width)) : 0
function down(e: PointerEvent) {
    if (!props.selectable || e.button !== 0 || !el.value) return
    // a tile being arranged moves instead
    if ((e.target as HTMLElement).closest('.gm-tiles.arranging')) return
    e.stopPropagation()
    e.preventDefault()
    box = el.value.getBoundingClientRect()
    const a = frac(e.clientX)
    sel.value = { a, b: a, stats: null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
}
function move(e: PointerEvent) { if (sel.value) sel.value = { ...sel.value, b: frac(e.clientX) } }
function up() {
    window.removeEventListener('pointermove', move)
    const s = sel.value
    if (!s) return
    // a click (no stretch): clears
    if (Math.abs(s.b - s.a) * (box?.width ?? 0) < 4) { sel.value = null; return }
    sel.value = { ...s, stats: measure(s.a, s.b) }
}
onBeforeUnmount(() => window.removeEventListener('pointermove', move))
</script>
