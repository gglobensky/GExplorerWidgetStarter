<!-- widgets/monitor/RowPaged.vue -->
<!--
    A card's list (the disks, the network adapters), in parts when the card can't hold all of it: the card keeps the
    size of the others (monitor.css), its title and graph keep their room, the rows take what is left, ● ○ turns them.
    A shorter last part is filled with blank rows: nothing moves. Outside Pages: all of them.
-->
<template>
    <div class="gm-rowp" ref="root">
        <template v-for="it in shown" :key="keyOf(it)"><slot :item="it" /></template>
        <div v-for="i in blanks" :key="'blank' + i" class="gm-row gm-row-blank" aria-hidden="true">&nbsp;</div>
        <div v-if="pages > 1" class="gm-kvp-dots" role="radiogroup" :aria-label="label">
            <button v-for="i in pages" :key="i" type="button" role="radio" class="gm-kvp-dot" :class="{ on: i - 1 === page }"
                    :aria-checked="i - 1 === page" :aria-label="`${label}, part ${i} of ${pages}`" @click="page = i - 1"></button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, nextTick, onMounted, onBeforeUnmount, type Ref } from 'vue'

const props = defineProps<{ items: any[]; keyOf: (it: any) => string | number; tick?: number; label?: string }>()
const pageH = inject<Ref<number> | null>('gmPageH', null)
const root = ref<HTMLElement | null>(null)
const perPage = ref(Infinity)
const page = ref(0)
const DOTS_H = 14
const label = computed(() => props.label ?? 'Rows')

const pages = computed(() => Number.isFinite(perPage.value) ? Math.max(1, Math.ceil(props.items.length / perPage.value)) : 1)
const shown = computed(() => {
    if (pages.value <= 1) return props.items
    const p = Math.min(page.value, pages.value - 1)
    return props.items.slice(p * perPage.value, (p + 1) * perPage.value)
})
const blanks = computed(() => pages.value > 1 ? Math.max(0, perPage.value - shown.value.length) : 0)

/** The room left in the card (its fixed height in Pages) once its title and graph are counted. */
function measure() {
    const el = root.value
    const card = el?.closest('.gm-card') as HTMLElement | null
    const parent = el?.parentElement
    if (!el || !card || !parent || !pageH?.value) { perPage.value = Infinity; return }
    const H = Math.min(pageH.value, card.offsetHeight || pageH.value)
    const ps = getComputedStyle(parent), cs = getComputedStyle(card)
    const gap = parseFloat(ps.rowGap) || 0
    let other = 0, n = 0
    // a graph that grows into the free space counts at its least (44 px): the rows get the rest
    for (const c of Array.from(parent.children) as HTMLElement[]) { n++; if (c !== el) other += c.classList.contains('gm-spark') ? 44 : c.offsetHeight }
    const frame = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    const room = H - frame - other - gap * Math.max(0, n - 1) - 2
    const first = el.querySelector('.gm-row') as HTMLElement | null
    const rowH = (first?.offsetHeight || 17) + (parseFloat(getComputedStyle(el).rowGap) || 0)
    if (Math.floor(room / rowH) >= props.items.length) { perPage.value = Infinity; return }
    perPage.value = Math.max(1, Math.floor((room - DOTS_H) / rowH))
}

watch(() => [props.tick, props.items.length, pageH?.value], () => void nextTick(measure))
let ro: ResizeObserver | null = null
onMounted(() => {
    measure()
    const card = root.value?.closest('.gm-card')
    if (card) { ro = new ResizeObserver(() => measure()); ro.observe(card) }
})
onBeforeUnmount(() => ro?.disconnect())
</script>
