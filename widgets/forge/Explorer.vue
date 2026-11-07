<!-- widgets/forge/Explorer.vue -->
<!--
    GEM FORGE 0.1: the project's files as a tree (folders first, folded and unfolded with a click). ● marks a file with
    unsaved edits, ⚠ one that changed on disk while edited here. A click opens it in the editor.
-->
<template>
    <div class="gf-explorer">
        <div class="gf-ex-head">
            <span class="gf-proj">{{ project.state.name || 'No project' }}</span>
            <span v-if="project.state.watching" class="gf-dot" title="GEM Forge watches this folder: what an AI or another editor writes there reloads it." />
        </div>
        <div v-if="!rows.length" class="gf-empty">Open a folder or a sample.</div>
        <button v-for="r in rows" :key="r.key" type="button"
                class="gf-row" :class="{ on: r.path === project.state.active, dir: r.dir }"
                :style="{ paddingLeft: `${8 + r.depth * 14}px` }"
                :title="r.path"
                @click="r.dir ? toggle(r.path) : project.open(r.path)">
            <span class="gf-ico">{{ r.dir ? (folded.has(r.path) ? '▸' : '▾') : icon(r.name) }}</span>
            <span class="gf-name">{{ r.name }}</span>
            <span v-if="!r.dir && project.state.conflicts.includes(r.path)" class="gf-warn" title="Changed on disk while you edited it">⚠</span>
            <span v-else-if="!r.dir && project.isDirty(r.path)" class="gf-dirty" title="Not saved">●</span>
        </button>
        <div v-if="project.state.folder" class="gf-ex-foot" :title="project.state.folder">{{ project.state.folder }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Project } from './project'

const props = defineProps<{ project: Project }>()
const folded = reactive(new Set<string>())

type Row = { key: string; path: string; name: string; depth: number; dir: boolean }

const rows = computed<Row[]>(() => {
    // A tree from the paths: folders first, then files, each sorted by name
    type Node = { dirs: Map<string, Node>; files: string[] }
    const root: Node = { dirs: new Map(), files: [] }
    for (const f of props.project.state.files) {
        const parts = f.path.split('/')
        let n = root
        for (const d of parts.slice(0, -1)) {
            if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), files: [] })
            n = n.dirs.get(d)!
        }
        n.files.push(f.path)
    }
    const out: Row[] = []
    const walk = (n: Node, prefix: string, depth: number) => {
        for (const [name, child] of [...n.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
            const path = prefix ? `${prefix}/${name}` : name
            out.push({ key: `d:${path}`, path, name, depth, dir: true })
            if (!folded.has(path)) walk(child, path, depth + 1)
        }
        for (const p of [...n.files].sort((a, b) => a.localeCompare(b)))
            out.push({ key: `f:${p}`, path: p, name: p.split('/').pop() ?? p, depth, dir: false })
    }
    walk(root, '', 0)
    return out
})

function toggle(path: string) {
    if (folded.has(path)) folded.delete(path)
    else folded.add(path)
}

function icon(name: string): string {
    if (name.endsWith('.vue')) return '◆'
    if (/\.(ts|js|mjs)$/.test(name)) return '◇'
    if (name.endsWith('.css')) return '#'
    if (name.endsWith('.json')) return '{}'
    if (name.endsWith('.md')) return '¶'
    return '·'
}
</script>
