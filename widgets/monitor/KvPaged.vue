<!-- widgets/monitor/KvPaged.vue -->
<!--
    A card's figures (label: value), in pages of their own when the card would be taller than the page it sits on
    (Pages.vue provides the page's height): the gauge, the title and the graph keep their room, the figures take what
    is left, ● ○ (or a click on them) turns them. Outside Pages: all of them.
    In Pages every gauge card has the same height (the page's, at most CARD_H: monitor.css), so the room is the card's.
-->
<template>
    <div class="gm-kvp" ref="root" :style="reserve">
        <div class="gm-kv" :class="{ turns: pages > 1 }" :title="pages > 1 ? 'Click: the next figures' : undefined" @click="pages > 1 && (page = (page + 1) % pages)">
            <template v-for="r in shown" :key="r.k"><span :title="r.title">{{ r.k }}</span><b>{{ r.v }}</b></template>
            <!-- a shorter last part is filled with blank rows: every part is as tall, nothing below moves -->
            <template v-for="i in blanks" :key="'blank' + i"><span class="gm-kv-blank" aria-hidden="true">&nbsp;</span><b class="gm-kv-blank" aria-hidden="true">&nbsp;</b></template>
        </div>
        <div v-if="pages > 1" class="gm-kvp-dots" role="radiogroup" aria-label="Figures">
            <button v-for="i in pages" :key="i" type="button" role="radio" class="gm-kvp-dot" :class="{ on: i - 1 === page }"
                    :aria-checked="i - 1 === page" :aria-label="`Figures, part ${i} of ${pages}`" @click="page = i - 1"></button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, nextTick, onMounted, onBeforeUnmount, type Ref } from 'vue'

export type KvRow = { k: string; v: string; title?: string }
const props = defineProps<{ rows: KvRow[]; tick?: number }>()
const pageH = inject<Ref<number> | null>('gmPageH', null)
const root = ref<HTMLElement | null>(null)
const perPage = ref(Infinity)
const page = ref(0)
const DOTS_H = 14

/** While in parts: the room of a full part, so a shorter last part doesn't move the graph under it. */
const rowH = ref(16)
const reserve = computed(() => pages.value > 1 ? { minHeight: `${perPage.value * rowH.value + DOTS_H}px` } : undefined)
const pages = computed(() => Number.isFinite(perPage.value) ? Math.max(1, Math.ceil(props.rows.length / perPage.value)) : 1)
const blanks = computed(() => pages.value > 1 ? Math.max(0, perPage.value - shown.value.length) : 0)
const shown = computed(() => {
    if (pages.value <= 1) return props.rows
    const p = Math.min(page.value, pages.value - 1)
    return props.rows.slice(p * perPage.value, (p + 1) * perPage.value)
})

/** The room left in the card once everything else in it is counted (none of which depends on the figures). */
function measure() {
    const el = root.value
    const cardEl = el?.closest('.gm-card') as HTMLElement | null
    // the card's own height when it is fixed (a gauge card in Pages), else the page's
    const H = pageH?.value ? Math.min(pageH.value, cardEl?.offsetHeight || pageH.value) : 0
    if (!el || !H) { perPage.value = Infinity; return }
    const side = el.parentElement, card = side?.closest('.gm-card') as HTMLElement | null
    if (!side || !card) { perPage.value = Infinity; return }
    const sideCs = getComputedStyle(side), cardCs = getComputedStyle(card)
    const gap = parseFloat(sideCs.rowGap) || 0
    let other = 0, n = 0
    for (const c of Array.from(side.children) as HTMLElement[]) {
        n++
        if (c !== el) other += c.offsetHeight
    }
    const frame = parseFloat(cardCs.paddingTop) + parseFloat(cardCs.paddingBottom) + parseFloat(cardCs.borderTopWidth) + parseFloat(cardCs.borderBottomWidth)
    const room = H - frame - other - gap * Math.max(0, n - 1) - 2
    const first = el.querySelector('.gm-kv > span') as HTMLElement | null
    const h = (first?.offsetHeight || 15) + 1
    rowH.value = h
    const all = Math.floor(room / h)
    if (all >= props.rows.length) { perPage.value = Infinity; return }
    perPage.value = Math.max(1, Math.floor((room - DOTS_H) / h))
}

watch(() => [props.tick, props.rows.length, pageH?.value], () => void nextTick(measure))
let ro: ResizeObserver | null = null
onMounted(() => {
    measure()
    const card = root.value?.closest('.gm-card')
    if (card) { ro = new ResizeObserver(() => measure()); ro.observe(card) }
})
onBeforeUnmount(() => ro?.disconnect())
</script>
