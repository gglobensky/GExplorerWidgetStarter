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
const ringing = computed(() => runtime?.timers.value.find(t => t.status === 'ringing') ?? null)
const next = computed(() => runtime?.nextTimer() ?? null)
const paused = computed(() => runtime?.timers.value.find(t => t.status === 'paused') ?? null)
const shown = computed(() => ringing.value ?? next.value ?? paused.value)
const remaining = computed(() => !shown.value ? 0 : shown.value.status === 'running' ? Math.max(0, shown.value.endAt - viewStamp.value) : shown.value.remainingMs)
</script>
<template><div class="job-card" :class="{ ringing }" role="status" :aria-live="ringing ? 'assertive' : 'polite'"><b>{{ ringing ? 'Time!' : durationText(remaining, 2) }}</b><span>{{ shown?.label ?? 'Clock timer' }}</span><button v-if="ringing" type="button" @click="runtime?.snoozeTimer(ringing.id)">Snooze 5m</button><button v-if="ringing" type="button" @click="runtime?.dismissTimer(ringing.id)">Dismiss</button><button v-else-if="next" type="button" @click="runtime?.pauseTimer(next.id)">Pause</button><button v-else-if="paused" type="button" @click="runtime?.resumeTimer(paused.id)">Resume</button></div></template>
<style scoped>.job-card{display:flex;align-items:center;gap:7px;font:11px/1.2 system-ui}.job-card b{font:700 16px/1 ui-monospace,monospace;font-variant-numeric:tabular-nums}.job-card span{overflow:hidden;margin-right:auto;opacity:.7;text-overflow:ellipsis;white-space:nowrap}.job-card.ringing b{color:#ffb052}.job-card button{padding:3px 7px;border:1px solid #ffffff28;border-radius:4px;color:inherit;background:transparent;cursor:pointer}</style>
