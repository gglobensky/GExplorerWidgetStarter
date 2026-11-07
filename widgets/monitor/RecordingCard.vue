<!-- widgets/monitor/RecordingCard.vue -->
<!--
    The recording's card in the operations tray (entry.ts jobs.recording), shown while it runs (or waits to be saved)
    and no GEM Monitor of this instance is on screen. The host frames it (title, Open, Stop: Stop ends the recording,
    what was recorded is kept). It reads the same recorder (live.ts) through this instance's SDK.
-->
<template>
    <div class="gm-card-rec">
        <template v-if="state === 'recording'">
            <span class="gm-rec-dot"></span>
            <span class="gm-card-rec-text">Recording <b>{{ time }}</b> of {{ limit }}<span class="gm-card-rec-dim"> · {{ count }} samples{{ markers ? ` · ${markers} markers` : '' }}</span></span>
            <button type="button" class="gm-card-rec-btn" title="Put a marker here (it shows on the report's graphs)" @click="rec?.mark()">⚑ Mark</button>
        </template>
        <span v-else-if="state === 'done'" class="gm-card-rec-text">Recorded <b>{{ time }}</b>: open GEM Monitor to save the report.</span>
        <span v-else class="gm-card-rec-text gm-card-rec-dim">Nothing is recording.</span>
    </div>
</template>

<script setup lang="ts">
import './monitor.css'
import { computed, inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { peekLive } from './live'
import { clock } from './store'

const sdk = inject<WidgetSdk>('widgetSdk')
const live = sdk ? peekLive(sdk) : null
const rec = live?.rec ?? null
const time = computed(() => { void rec?.st.count; void rec?.st.state; return clock(rec?.elapsed() ?? 0) })
const limit = computed(() => clock(rec?.st.limitMs ?? 0))
const state = computed(() => rec?.st.state ?? 'idle')
const count = computed(() => rec?.st.count ?? 0)
const markers = computed(() => rec?.st.markers ?? 0)
</script>
