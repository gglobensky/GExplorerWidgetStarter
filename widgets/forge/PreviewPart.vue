<!-- widgets/forge/PreviewPart.vue -->
<!--
    GEM FORGE 0.1: the project running, shown by GEM Shell over this part's box (sdk.dev().preview: a real placement,
    its own copy; GEM Forge never touches it). The placement: grid (this box's size), sidebar, toolbar; or a window.
    A build with problems leaves the last good one running: the banner says so.
-->
<template>
    <div class="gf-preview">
        <div class="gf-pv-bar">
            <span class="gf-dim">Real placement:</span>
            <button v-for="c in CONTEXTS" :key="c" type="button" class="gf-seg" :class="{ on: context === c }" @click="setContext(c)">{{ c }}</button>
            <span class="gf-grow" />
            <button type="button" class="gf-ib" title="In a window of its own" :disabled="!s.build" @click="openWindow">⧉</button>
        </div>
        <div v-if="s.build && s.errors.length" class="gf-pv-banner">
            Showing the last build that worked ({{ new Date(s.lastOkAt).toLocaleTimeString() }}) · {{ s.errors.length }} problem{{ s.errors.length === 1 ? '' : 's' }}
        </div>
        <div ref="area" class="gf-pv-area">
            <span v-if="!s.build" class="gf-empty">{{ s.building ? 'Building…' : 'Run the project to see it here.' }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { DevPreviewContext, DevPreviewHandle } from 'gexplorer/widgets'
import type { Project } from './project'

const props = defineProps<{ project: Project }>()
const s = props.project.state
const CONTEXTS: DevPreviewContext[] = ['grid', 'sidebar', 'toolbar']
const context = ref<DevPreviewContext>('grid')
const area = ref<HTMLElement | null>(null)
let handle: DevPreviewHandle | null = null
let shownFor = ''

async function show() {
    const dev = props.project.dev
    if (!dev || !area.value || !s.build || !s.id) return
    if (handle && shownFor === s.id) return          // a new build remounts it by itself
    handle?.close()
    handle = null
    const r = await dev.preview(area.value, s.id, { context: context.value })
    if (r.ok) { handle = r.preview; shownFor = s.id }
    else props.project.log('warn', `Preview: ${r.error}`)
}
function setContext(c: DevPreviewContext) {
    context.value = c
    if (handle && !handle.set({ context: c })) { handle = null; void show() }
}
async function openWindow() {
    const r = await props.project.dev?.openWindow(s.id)
    if (r && !r.ok) props.project.log('warn', r.error)
}

// Shown once the project first runs; closed when another project opens
watch(() => [s.build, s.id] as const, ([build, id]) => {
    if (id !== shownFor) { handle?.close(); handle = null; shownFor = '' }
    if (build) void show()
}, { immediate: true })
onBeforeUnmount(() => handle?.close())
</script>
