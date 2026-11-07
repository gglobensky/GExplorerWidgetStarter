<!-- widgets/monitor/Gauge.vue -->
<!--
    A valve gauge: a brass bezel, a 270° dial with ticks, a red zone at the top of the range, a needle that eases to the
    value. `mini`: the toolbar's icon (no text, the needle only).
-->
<template>
    <svg class="gm-gauge" :class="{ mini }" :viewBox="'0 0 100 100'" :width="size" :height="size" role="img"
         :aria-label="label ? `${label}: ${Math.round(clamped)}%` : `${Math.round(clamped)}%`">
        <defs>
            <radialGradient :id="uid + 'b'" cx="35%" cy="30%" r="80%">
                <stop offset="0" stop-color="#f3dc9a" />
                <stop offset=".45" stop-color="#c49a3f" />
                <stop offset="1" stop-color="#6e4f18" />
            </radialGradient>
            <radialGradient :id="uid + 'f'" cx="50%" cy="40%" r="70%">
                <stop offset="0" stop-color="var(--gm-face-1)" />
                <stop offset="1" stop-color="var(--gm-face-2)" />
            </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" :fill="`url(#${uid}b)`" />
        <circle cx="50" cy="50" r="42" :fill="`url(#${uid}f)`" stroke="rgba(0,0,0,.45)" stroke-width="1" />
        <!-- the red zone -->
        <path :d="arc(redFrom, 100, 35)" fill="none" stroke="#c0392b" :stroke-width="mini ? 7 : 5" opacity=".85" />
        <!-- the ticks -->
        <g v-if="!mini" stroke="var(--gm-tick)">
            <line v-for="t in ticks" :key="t.v" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" :stroke-width="t.major ? 1.6 : .8" />
        </g>
        <text v-if="!mini && label" x="50" y="70" text-anchor="middle" class="gm-g-label">{{ label }}</text>
        <text v-if="!mini" x="50" y="84" text-anchor="middle" class="gm-g-value">{{ text ?? `${Math.round(clamped)}%` }}</text>
        <!-- the needle -->
        <g class="gm-needle" :style="{ transform: `rotate(${angle}deg)` }">
            <polygon points="50,14 52.4,52 47.6,52" fill="#d9472b" />
            <polygon points="50,52 51.6,60 48.4,60" fill="#5a1e12" />
        </g>
        <circle cx="50" cy="50" :r="mini ? 7 : 5.5" :fill="`url(#${uid}b)`" stroke="rgba(0,0,0,.5)" stroke-width=".8" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
    value: number
    label?: string
    /** Shown instead of "N%". */
    text?: string
    size?: number
    mini?: boolean
    /** Where the red zone starts (0–100). */
    redFrom?: number
}>(), { size: 120, mini: false, redFrom: 85 })

let n = 0
const uid = `gm${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const clamped = computed(() => Math.max(0, Math.min(100, Number(props.value) || 0)))
/** -135° (0) … +135° (100) */
const angle = computed(() => -135 + clamped.value * 2.7)

function polar(v: number, r: number) {
    const a = ((-135 + v * 2.7) - 90) * Math.PI / 180
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) }
}
function arc(from: number, to: number, r: number) {
    const a = polar(from, r), b = polar(to, r)
    const large = (to - from) * 2.7 > 180 ? 1 : 0
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}
const ticks = computed(() => Array.from({ length: 21 }, (_, i) => {
    const v = i * 5, major = i % 2 === 0
    const o = polar(v, 40), inner = polar(v, major ? 33 : 36)
    return { v, major, x1: o.x, y1: o.y, x2: inner.x, y2: inner.y }
}))
</script>
