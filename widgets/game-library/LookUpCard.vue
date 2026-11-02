<!--
  The look-up's card in GEM Shell's operations tray (entry.ts `jobs.lookup`, 0.14.0), shown while the Game Shop is off
  screen and still looking up its games' details. The host frames it (title, Open, Stop: Stop ends the job, and the
  look-up stops after the games it's on). It reads the run's progress from the lifecycle's cells (online/lookup-job.ts).
-->
<script setup lang="ts">
import { computed, inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { LOOKUP_PROGRESS_CELL, timeLeft, type LookUpProgress } from './online/lookup-job'

const sdk = inject<WidgetSdk>('widgetSdk')
const progress = sdk?.lifecycle?.().persistRef<LookUpProgress | null>(LOOKUP_PROGRESS_CELL, null, { transient: true })
const done = computed(() => progress?.value?.done ?? 0)
const total = computed(() => progress?.value?.total ?? 0)
const force = computed(() => !!progress?.value?.force)
const percent = computed(() => total.value ? Math.min(100, (done.value / total.value) * 100) : 0)
</script>

<template>
  <div class="glc">
    <div class="glc-row">
      <span>{{ force ? 'Looking up every game again' : 'Looking up covers and details' }}</span>
      <span class="glc-count">{{ done }} of {{ total }}</span>
    </div>
    <div class="glc-bar" role="progressbar" :aria-valuenow="done" aria-valuemin="0" :aria-valuemax="total"><div class="glc-fill" :style="{ width: percent + '%' }"></div></div>
    <small class="glc-note">{{ total ? timeLeft(done, total) : '' }} · Steam, SteamGridDB and IGDB · Stop: the rest at the next start</small>
  </div>
</template>

<style scoped>
.glc { display:flex; flex-direction:column; gap:5px; min-width:0; font-size:12px; }
.glc-row { display:flex; align-items:baseline; gap:8px; opacity:.9; }
.glc-count { margin-left:auto; font-size:11px; font-variant-numeric:tabular-nums; opacity:.7; }
.glc-bar { height:3px; overflow:hidden; border-radius:2px; background:var(--gex-op-bar-bg, rgba(255,255,255,.12)); }
.glc-fill { height:100%; background:var(--accent, #4ea1ff); transition:width 200ms linear; }
.glc-note { font-size:10px; opacity:.55; }
@media (prefers-reduced-motion: reduce) { .glc-fill { transition:none; } }
</style>
