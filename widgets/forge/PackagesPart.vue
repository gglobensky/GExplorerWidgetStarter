<!-- widgets/forge/PackagesPart.vue -->
<!--
    GEM FORGE 0.2.0: NPM PACKAGES (＋ Part ▸ Packages). What package.json lists, with Remove; Add (a name, or
    name@version, several separated by spaces); Install all (what package.json lists, e.g. after a git clone). npm is
    the one of Node.js on the computer (sdk.dev().packages: GEM Shell asks first; install scripts never run). Their code
    is bundled into the widget when it builds (build's packagesFrom); their licences go into its notices.
    0.2.3: a moving bar and the seconds while npm works (it says nothing until it's done; its output follows).
    0.2.4: npm runs in the project (project.packagesOp), so Problems' "＋ Add date-fns" uses it too; this part shows it.
-->
<template>
    <div class="gf-pkgs">
        <div v-if="!project.state.folder" class="gf-empty">Packages need a project folder (New ▾ or Open a folder…).</div>
        <template v-else>
            <div class="gf-dim gf-pkgs-node">{{ nodeLine }}</div>
            <div class="gf-search-bar">
                <input v-model="names" class="gf-search-in" spellcheck="false" placeholder="date-fns   or   chart.js@4   (several: spaces)"
                       :disabled="pkg.busy || !npmOk" @keydown.enter="add">
                <button type="button" class="gf-btn" :disabled="pkg.busy || !npmOk || !names.trim()" @click="add">Add</button>
            </div>
            <div class="gf-list gf-pkgs-list">
                <div v-if="!deps.length" class="gf-empty">No package yet. Add one above; then import it in your code: <code>import {{ '{' }} format {{ '}' }} from 'date-fns'</code>.</div>
                <div v-for="d in deps" :key="d.name" class="gf-pkg-row">
                    <b>{{ d.name }}</b><span class="gf-dim">{{ d.range }}</span><span v-if="d.dev" class="gf-dim">(dev)</span>
                    <span class="gf-grow" />
                    <button type="button" class="gf-ib" title="Remove it (npm uninstall)" :disabled="pkg.busy || !npmOk" @click="remove(d.name)">✕</button>
                </div>
            </div>
            <div class="gf-search-bar">
                <button type="button" class="gf-btn" :disabled="pkg.busy || !npmOk || !deps.length" title="npm install: what package.json lists" @click="installAll">Install all</button>
                <span class="gf-grow" />
                <span class="gf-dim">{{ pkg.busy ? `${pkg.doing}… ${elapsed} s` : '' }}</span>
            </div>
            <!-- npm says nothing until it's done: a bar that moves meanwhile -->
            <div v-if="pkg.busy" class="gf-pkgs-bar" role="progressbar" :aria-label="pkg.doing"><span /></div>
            <pre v-if="pkg.output" class="gf-pkgs-out">{{ pkg.output }}</pre>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Project } from './project'

const props = defineProps<{ project: Project }>()
const pkg = props.project.state.pkg
const names = ref('')
const elapsed = ref(0)
let tick = 0
const node = ref<{ ok: boolean; node?: string; npm?: string; error?: string } | null>(null)
const npmOk = computed(() => !!node.value?.ok)
const nodeLine = computed(() => !node.value ? 'Looking for Node.js…'
    : node.value.ok ? `npm ${node.value.npm} (Node.js ${node.value.node}): packages come from the npm registry; their install scripts never run.`
        : node.value.error ?? 'Node.js was not found.')

onMounted(async () => {
    const dev = props.project.dev
    if (!dev?.packages) { node.value = { ok: false, error: 'This GEM Shell has no npm packages yet.' }; return }
    const r = await dev.packages('version')
    node.value = r.ok ? { ok: true, node: r.node, npm: r.npm } : { ok: false, error: r.error }
})

// The seconds while npm works (here or started from Problems)
function count() {
    window.clearInterval(tick)
    if (!pkg.busy) return
    const at = () => { elapsed.value = Math.max(0, Math.round((Date.now() - pkg.started) / 1000)) }
    at()
    tick = window.setInterval(at, 500)
}
watch(() => pkg.busy, count, { immediate: true })
onBeforeUnmount(() => window.clearInterval(tick))

/** package.json's dependencies (and devDependencies), as GEM Forge has it. */
const deps = computed(() => {
    const text = props.project.file('package.json')?.text
    if (!text) return []
    try {
        const p = JSON.parse(text)
        const list = (o: unknown, dev: boolean) => Object.entries((o && typeof o === 'object' ? o : {}) as Record<string, unknown>)
            .map(([name, range]) => ({ name, range: String(range), dev }))
        return [...list(p.dependencies, false), ...list(p.devDependencies, true)].sort((a, b) => a.name.localeCompare(b.name))
    } catch {
        return []
    }
})

function add() {
    const list = names.value.split(/[\s,]+/).map(n => n.trim()).filter(Boolean)
    if (!list.length) return
    names.value = ''
    void props.project.packagesOp('add', list)
}
const remove = (name: string) => void props.project.packagesOp('remove', [name])
const installAll = () => void props.project.packagesOp('install')
</script>
