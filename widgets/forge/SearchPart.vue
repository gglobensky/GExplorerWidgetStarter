<!-- widgets/forge/SearchPart.vue -->
<!--
    GEM FORGE 0.1.11: FIND IN FILES (Ctrl+Shift+F, or ＋ Part ▸ Search). The project's text files as GEM Forge has them
    (unsaved edits included), searched as you type: Aa (match case), W (whole words), .* (a regular expression).
    Results by file, each line with its matches marked; a click opens the file at that line. Replace all (in the files
    shown) rewrites them in the editor: they stay unsaved until you save (Save all).
-->
<template>
    <div class="gf-search">
        <div class="gf-search-bar">
            <input ref="box" v-model="q" class="gf-search-in" spellcheck="false" placeholder="Find in files…" @keydown.enter="run(true)">
            <button type="button" class="gf-ib" :class="{ on: o.caseSensitive }" title="Match case" @click="o.caseSensitive = !o.caseSensitive">Aa</button>
            <button type="button" class="gf-ib" :class="{ on: o.word }" title="Whole words" @click="o.word = !o.word">W</button>
            <button type="button" class="gf-ib" :class="{ on: o.regex }" title="A regular expression" @click="o.regex = !o.regex">.*</button>
        </div>
        <div class="gf-search-bar">
            <input v-model="rep" class="gf-search-in" spellcheck="false" placeholder="Replace with…">
            <button type="button" class="gf-btn" :disabled="!total || !q" title="In every file listed (unsaved until you save)" @click="replaceAll">Replace all</button>
        </div>
        <div class="gf-dim gf-search-sum">{{ summary }}</div>
        <div class="gf-list gf-search-list">
            <template v-for="f in results" :key="f.path">
                <button type="button" class="gf-search-file" @click="toggle(f.path)">
                    <span>{{ folded.has(f.path) ? '▸' : '▾' }}</span><b>{{ f.path.split('/').pop() }}</b>
                    <span class="gf-dim">{{ f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '' }}</span>
                    <span class="gf-count">{{ f.hits.length }}</span>
                </button>
                <template v-if="!folded.has(f.path)">
                    <button v-for="(h, i) in f.hits" :key="i" type="button" class="gf-search-hit" @click="project.open(f.path, { line: h.line, column: h.column })">
                        <span class="gf-dim gf-search-ln">{{ h.line }}</span>
                        <span class="gf-search-text">{{ h.before }}<mark>{{ h.match }}</mark>{{ h.after }}</span>
                    </button>
                </template>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { TEXT_FILE, type Project } from './project'

const props = defineProps<{ project: Project }>()
const s = props.project.state
const q = ref('')
const rep = ref('')
const o = reactive({ caseSensitive: false, word: false, regex: false })
const box = ref<HTMLInputElement | null>(null)
const folded = reactive(new Set<string>())
const error = ref('')
type Hit = { line: number; column: number; before: string; match: string; after: string }
const results = ref<{ path: string; hits: Hit[] }[]>([])
const total = computed(() => results.value.reduce((n, f) => n + f.hits.length, 0))
const summary = computed(() => error.value || (!q.value ? 'Type to search the project\'s files.'
    : `${total.value}${total.value >= LIMIT ? '+' : ''} result${total.value === 1 ? '' : 's'} in ${results.value.length} file${results.value.length === 1 ? '' : 's'}`))
const LIMIT = 2000

// Asked to search (Ctrl+Shift+F): the box gets the focus, with the editor's selection when there is one
watch(() => s.searchFocus?.seq, () => {
    if (s.searchFocus?.text) q.value = s.searchFocus.text
    box.value?.focus()
    box.value?.select()
})
onMounted(() => { if (s.searchFocus) { if (s.searchFocus.text) q.value = s.searchFocus.text; box.value?.focus() } })

function pattern(): RegExp | null {
    if (!q.value) return null
    try {
        let src = o.regex ? q.value : q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (o.word) src = `\\b${src}\\b`
        error.value = ''
        return new RegExp(src, o.caseSensitive ? 'g' : 'gi')
    } catch (err) {
        error.value = `Not a regular expression: ${String((err as Error)?.message ?? err)}`
        return null
    }
}

function run(now = false) {
    window.clearTimeout(timer)
    const go = () => {
        const re = pattern()
        if (!re) { results.value = []; return }
        const out: { path: string; hits: Hit[] }[] = []
        let n = 0
        for (const f of s.files) {
            if (f.base64 !== undefined || !TEXT_FILE.test(f.path) || f.path === 'widgets-sdk.d.ts') continue
            const hits: Hit[] = []
            const lines = f.text.split('\n')
            for (let i = 0; i < lines.length && n < LIMIT; i++) {
                const line = lines[i]
                re.lastIndex = 0
                let m: RegExpExecArray | null
                while ((m = re.exec(line)) && n < LIMIT) {
                    if (!m[0].length) { re.lastIndex++; continue }
                    const from = Math.max(0, m.index - 40)
                    hits.push({ line: i + 1, column: m.index + 1, before: (from ? '…' : '') + line.slice(from, m.index).trimStart(), match: m[0], after: line.slice(m.index + m[0].length, m.index + m[0].length + 80) })
                    n++
                }
            }
            if (hits.length) out.push({ path: f.path, hits })
        }
        results.value = out
    }
    if (now) go()
    else timer = window.setTimeout(go, 200)
}
let timer = 0
watch(() => [q.value, o.caseSensitive, o.word, o.regex], () => run())
// The files changed (an edit, a save, a disk change): the results follow
watch(() => s.files.map((f: { text: string }) => f.text.length).join(','), () => { if (q.value) run() })

function toggle(path: string) { if (folded.has(path)) folded.delete(path); else folded.add(path) }

function replaceAll() {
    const re = pattern()
    if (!re) return
    let n = 0
    const texts: Record<string, string> = {}
    for (const r of results.value) {
        const f = props.project.file(r.path)
        if (!f || folded.has(r.path)) continue
        const next = f.text.replace(re, (m: string) => { n++; return o.regex ? m.replace(new RegExp(re.source, re.flags.replace('g', '')), rep.value) : rep.value })
        if (next !== f.text) texts[r.path] = next
    }
    // 0.1.12: with an Undo (GEM Shell's snackbar)
    props.project.replaceTexts(texts, n)
    run(true)
}
</script>
