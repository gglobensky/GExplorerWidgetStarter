<!-- docs/forge-samples/clock/Widget.vue -->
<!--
    A clock that shows more as it grows: the time; then the date; then world clocks (zones.ts). What it shows depends
    on its own box (placement.size), so it fits a toolbar popover, a crowded sidebar or a large hub tile.
-->
<template>
    <div class="clock" :data-size="size">
        <div class="time">{{ time }}</div>
        <div v-if="size !== 's'" class="date">{{ date }}</div>
        <ul v-if="size === 'l'" class="zones">
            <li v-for="z in zones" :key="z.city"><span>{{ z.city }}</span> {{ z.time }}</li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { WidgetPlacement } from 'gexplorer/widgets'
import { CITIES, fmt } from './zones'

const props = defineProps<{ sourceId: string; placement?: WidgetPlacement }>()
const now = ref(new Date())
const timer = setInterval(() => { now.value = new Date() }, 1000)
onUnmounted(() => clearInterval(timer))

/** s: the time only; m: and the date; l: and the world clocks. Width and height both count. */
const size = computed(() => {
    const w = props.placement?.size?.width ?? 300, h = props.placement?.size?.height ?? 200
    return w < 160 || h < 80 ? 's' : w < 320 || h < 150 ? 'm' : 'l'
})
const time = computed(() => fmt(now.value))
const date = computed(() => now.value.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))
const zones = computed(() => CITIES.map(([city, tz]) => ({ city, time: fmt(now.value, tz) })))
</script>

<style scoped>
.clock { height: 100%; display: grid; place-content: center; text-align: center; gap: 4px; padding: 8px; box-sizing: border-box; }
.time { font: 600 2.1em/1 var(--gex-font-mono, ui-monospace, Consolas, monospace); font-variant-numeric: tabular-nums; }
.clock[data-size="s"] .time { font-size: 1.4em; }
.clock[data-size="l"] .time { font-size: 2.8em; }
.date { opacity: .7; }
.zones { list-style: none; margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid color-mix(in oklab, currentColor 20%, transparent); display: grid; gap: 2px; font-variant-numeric: tabular-nums; }
.zones li { display: flex; justify-content: space-between; gap: 18px; }
.zones span { opacity: .7; }
</style>
