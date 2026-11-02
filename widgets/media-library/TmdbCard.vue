<!--
  TMDB matching's card in GEM Shell's operations tray (entry.ts `jobs.tmdb`, 0.12.0), shown while the Video Club is off
  screen and still matching its titles. The host frames it (title, Open, Stop: Stop ends the job, and the matching
  stops after the titles it's on; what was matched is kept). It reads the run's progress from the lifecycle's cell.
-->
<script setup lang="ts">
import { computed, inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import type { TmdbProgress } from './tmdb'
import { TMDB_PROGRESS_CELL } from './useTmdbMatching'

const sdk = inject<WidgetSdk>('widgetSdk')
const progress = sdk?.lifecycle?.().persistRef<TmdbProgress | null>(TMDB_PROGRESS_CELL, null, { transient: true })
const done = computed(() => progress?.value?.completed ?? 0)
const total = computed(() => progress?.value?.total ?? 0)
const current = computed(() => progress?.value?.title ?? '')
const percent = computed(() => total.value ? Math.min(100, (done.value / total.value) * 100) : 0)
</script>

<template>
  <div class="mtc">
    <div class="mtc-row">
      <span class="mtc-title" :title="current">{{ current || 'Matching with TMDB' }}</span>
      <span class="mtc-count">{{ done.toLocaleString() }} of {{ total.toLocaleString() }}</span>
    </div>
    <div class="mtc-bar" role="progressbar" :aria-valuenow="done" aria-valuemin="0" :aria-valuemax="total"><div class="mtc-fill" :style="{ width: percent + '%' }"></div></div>
    <small class="mtc-note">Titles, posters and synopses from TMDB · Stop keeps what's matched</small>
  </div>
</template>

<style scoped>
.mtc { display:flex; flex-direction:column; gap:5px; min-width:0; font-size:12px; }
.mtc-row { display:flex; align-items:baseline; gap:8px; min-width:0; }
.mtc-title { overflow:hidden; opacity:.9; text-overflow:ellipsis; white-space:nowrap; }
.mtc-count { flex:0 0 auto; margin-left:auto; font-size:11px; font-variant-numeric:tabular-nums; opacity:.7; }
.mtc-bar { height:3px; overflow:hidden; border-radius:2px; background:var(--gex-op-bar-bg, rgba(255,255,255,.12)); }
.mtc-fill { height:100%; background:var(--accent, #4ea1ff); transition:width 200ms linear; }
.mtc-note { font-size:10px; opacity:.55; }
@media (prefers-reduced-motion: reduce) { .mtc-fill { transition:none; } }
</style>
