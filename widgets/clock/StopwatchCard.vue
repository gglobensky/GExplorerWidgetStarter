<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { clockRuntime } from './runtime'
import { durationText } from './time'
const sdk = inject<WidgetSdk>('widgetSdk')
const runtime = sdk ? clockRuntime(sdk) : null
const viewStamp = ref(Date.now())
const tick = setInterval(() => { viewStamp.value = Date.now() }, 10)
onBeforeUnmount(() => clearInterval(tick))
const elapsed = computed(() => durationText(runtime?.stopwatchElapsed(viewStamp.value) ?? 0, 2))
</script>
<template><div class="job-card"><b>{{ elapsed }}</b><span>Stopwatch · {{ runtime?.stopwatch.status }}</span><button v-if="runtime?.stopwatch.status === 'running'" type="button" @click="runtime?.lapStopwatch()">Lap</button><button v-if="runtime?.stopwatch.status === 'running'" type="button" @click="runtime?.pauseStopwatch()">Pause</button><button v-else type="button" @click="runtime?.startStopwatch()">Resume</button></div></template>
<style scoped>.job-card{display:flex;align-items:center;gap:7px;font:11px/1.2 system-ui}.job-card b{font:700 16px/1 ui-monospace,monospace;font-variant-numeric:tabular-nums}.job-card span{opacity:.6;margin-right:auto}.job-card button{padding:3px 7px;border:1px solid #ffffff28;border-radius:4px;color:inherit;background:transparent;cursor:pointer}</style>
