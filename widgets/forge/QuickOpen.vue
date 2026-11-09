<!-- widgets/forge/QuickOpen.vue -->
<!--
    GEM FORGE 0.1.11: GO TO FILE (Ctrl+P, a popover in the middle: sdk.ui().openPopover placement 'center'). Type a
    few letters of a file's name or path (in order, not necessarily together: "wvue" finds Widget.vue); ↑ ↓ choose,
    Enter opens, Escape closes. With nothing typed: the open tabs, the last used first. Everything comes as props: a
    popover is drawn by GEM Shell.
-->
<template>
    <div class="gf-pop gf-quick">
        <input ref="box" v-model="q" class="gf-pop-in gf-quick-in" spellcheck="false" placeholder="A file's name or path…"
               @keydown="onKey">
        <div class="gf-list gf-quick-list">
            <button v-for="(r, i) in shown" :key="r.path" type="button" class="gf-quick-row" :class="{ on: i === at }"
                    @mouseenter="at = i" @click="pick(r.path)">
                <span class="gf-quick-name"><template v-for="(c, j) in r.parts" :key="j"><b v-if="c.hit">{{ c.t }}</b><template v-else>{{ c.t }}</template></template></span>
                <span class="gf-dim gf-quick-dir">{{ r.dir }}</span>
            </button>
            <div v-if="!shown.length" class="gf-empty">No file matches.</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{ files: string[]; recent: string[]; onPick: (path: string) => void; onCancel: () => void }>()
const q = ref('')
const at = ref(0)
const box = ref<HTMLInputElement | null>(null)
onMounted(async () => { await nextTick(); box.value?.focus() })

type Part = { t: string; hit: boolean }
type Row = { path: string; dir: string; parts: Part[]; score: number }

/** <q>'s letters in order in <text> (case ignored): a score (higher: better), the hits; null: no match. */
function match(text: string, query: string): { score: number; hits: Set<number> } | null {
    const t = text.toLowerCase(), s = query.toLowerCase()
    const hits = new Set<number>()
    let score = 0, from = 0, last = -2
    for (const ch of s) {
        if (ch === ' ') continue
        const i = t.indexOf(ch, from)
        if (i < 0) return null
        hits.add(i)
        score += i === last + 1 ? 5 : 1                        // together
        if (i === 0 || '/._- '.includes(t[i - 1])) score += 3    // at a word's start
        last = i
        from = i + 1
    }
    return { score, hits }
}

const shown = computed<Row[]>(() => {
    const query = q.value.trim()
    const split = (p: string) => ({ name: p.split('/').pop() ?? p, dir: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '' })
    if (!query) {
        const order = [...props.recent.filter((p: string) => props.files.includes(p)), ...props.files.filter((p: string) => !props.recent.includes(p))]
        return order.slice(0, 50).map(p => ({ path: p, dir: split(p).dir, parts: [{ t: split(p).name, hit: false }], score: 0 }))
    }
    const out: Row[] = []
    for (const p of props.files) {
        const { name, dir } = split(p)
        // The name first (worth more), else the whole path
        const onName = match(name, query)
        const m = onName ? { score: onName.score + 10, hits: onName.hits } : match(p, query)
        if (!m) continue
        const offset = onName ? 0 : p.length - name.length
        const parts: Part[] = [...name].map((t, i) => ({ t, hit: m.hits.has(i + offset) }))
        out.push({ path: p, dir, parts, score: m.score - p.length / 100 })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 50)
})
watch(q, () => { at.value = 0 })

function pick(path: string) { props.onPick(path) }
function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); at.value = Math.min(shown.value.length - 1, at.value + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at.value = Math.max(0, at.value - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = shown.value[at.value]; if (r) pick(r.path) }
    else if (e.key === 'Escape') { e.preventDefault(); props.onCancel() }
}
</script>
