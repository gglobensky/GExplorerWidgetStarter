<!-- widgets/forge/Problems.vue -->
<!-- GEM FORGE 0.1: the last build's errors and warnings; a click opens the file at the line. The packaging rules found, explained once each. -->
<template>
    <div class="gf-list">
        <div v-if="!s.errors.length && !s.warnings.length" class="gf-empty">{{ s.build || s.lastOkAt ? 'No problems.' : 'Run the project to see its problems.' }}</div>
        <button v-for="(p, i) in s.errors" :key="'e' + i" type="button" class="gf-prob err" @click="go(p)">
            <span class="gf-pi">✘</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">{{ where(p) }}</span>
        </button>
        <button v-for="(p, i) in s.warnings" :key="'w' + i" type="button" class="gf-prob warn" @click="go(p)">
            <span class="gf-pi">▲</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">{{ where(p) }}</span>
        </button>
        <p v-for="(n, i) in s.notes" :key="'n' + i" class="gf-note">{{ n }}</p>
    </div>
</template>

<script setup lang="ts">
import type { DevProblem } from 'gexplorer/widgets'
import type { Project } from './project'

const props = defineProps<{ project: Project }>()
const s = props.project.state
const where = (p: DevProblem) => (p.file ? `${p.file}:${p.line}:${p.column}` : '')
function go(p: DevProblem) {
    if (p.file && props.project.file(p.file)) props.project.open(p.file, { line: p.line, column: p.column })
}
</script>
