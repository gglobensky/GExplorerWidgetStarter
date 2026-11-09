<!-- widgets/forge/Output.vue -->
<!-- GEM FORGE 0.1: what the project writes to the console (and its uncaught errors), with GEM Forge's own notes (a file changed on disk...). -->
<!-- 0.2.5: a project file's place in a line (a stack's "Widget.vue:14:9") is a link: a click opens it there. -->
<template>
    <div ref="box" class="gf-list gf-out">
        <div v-if="!s.logs.length" class="gf-empty">What your widget writes with console.log shows here.</div>
        <div v-for="(l, i) in s.logs" :key="i" class="gf-log" :class="l.level"><span class="gf-time">{{ l.time }}</span><template
            v-for="(part, j) in pieces(l.text)" :key="j"><button v-if="part.at" type="button" class="gf-out-link" :title="`Open ${part.at.path} at line ${part.at.line}`"
            @click="open(part.at!)">{{ part.text }}</button><template v-else>{{ part.text }}</template></template></div>
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

type At = { path: string; line: number; column: number }
/** A line's text, with the project's files' places (path:line:col) as links. */
function pieces(text: string): { text: string; at?: At }[] {
    const out: { text: string; at?: At }[] = []
    const re = /([\w@$.\-/]+\.(?:vue|ts|js|mts|mjs|json)):(\d+)(?::(\d+))?/g
    let last = 0
    for (const m of text.matchAll(re)) {
        if (!props.project.file(m[1])) continue
        if (m.index! > last) out.push({ text: text.slice(last, m.index) })
        out.push({ text: m[0], at: { path: m[1], line: Number(m[2]), column: Number(m[3] ?? 1) } })
        last = m.index! + m[0].length
    }
    if (last < text.length) out.push({ text: text.slice(last) })
    return out
}
const open = (at: At) => props.project.open(at.path, { line: at.line, column: at.column })
</script>
