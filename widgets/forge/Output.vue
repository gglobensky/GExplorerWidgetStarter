<!-- widgets/forge/Output.vue -->
<!-- GEM FORGE 0.1: what the project writes to the console (and its uncaught errors), with GEM Forge's own notes (a file changed on disk...). -->
<template>
    <div ref="box" class="gf-list gf-out">
        <div v-if="!s.logs.length" class="gf-empty">What your widget writes with console.log shows here.</div>
        <div v-for="(l, i) in s.logs" :key="i" class="gf-log" :class="l.level"><span class="gf-time">{{ l.time }}</span>{{ l.text }}</div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Project } from './project'

const props = defineProps<{ project: Project }>()
const s = props.project.state
const box = ref<HTMLElement | null>(null)
// Kept at the bottom while it is at the bottom
watch(() => s.logs.length, async () => {
    const el = box.value
    const atEnd = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 24
    await nextTick()
    if (atEnd && box.value) box.value.scrollTop = box.value.scrollHeight
})
</script>
