<!-- widgets/monitor/CoreStrip.vue -->
<!--
    One thin bar per logical processor, filled to its load: at a glance, whether the work is spread out or one core is
    pegged. `columns`: wrapped in rows (the detail view's grid of cores) instead of one strip.
-->
<template>
    <div class="gm-cores" :class="{ grid: columns }" :style="columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined"
         role="img" :aria-label="`Cores: ${cores.map(c => Math.round(c)).join(', ')} %`">
        <div v-for="(c, i) in cores" :key="i" class="gm-core" :title="`Core ${i}: ${Math.round(c)}%`">
            <div class="gm-core-fill" :class="level(c)" :style="{ height: `${Math.max(4, Math.min(100, c))}%` }"></div>
            <span v-if="columns" class="gm-core-n">{{ i }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{ cores: number[]; columns?: number }>()

function level(v: number): string {
    return v >= 90 ? 'hot' : v >= 60 ? 'warm' : 'ok'
}
</script>
