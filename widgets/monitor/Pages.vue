<!-- widgets/monitor/Pages.vue -->
<!--
    Content in pages instead of a scrollbar: the slot flows into columns as tall and as wide as the box (CSS columns:
    each "column" is a page), and the box shows one at a time; Pager toggles them. A block (.gm-card, a table…) stays
    whole when it fits a page (break-inside: avoid); one taller than a page is split across two.
    The mouse wheel turns the pages too; so do Page Up / Page Down. Re-measured when the box changes size and when
    `tick` changes (new readings can make a card taller).
-->
<template>
    <div class="gm-paged" ref="root" @wheel="wheel" @keydown="keys">
        <div class="gm-paged-view" ref="view">
            <div class="gm-paged-track" ref="track" :style="trackStyle"><slot /></div>
        </div>
        <Pager :page="page" :count="count" :label="label" @go="go" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, provide } from 'vue'
import Pager from './Pager.vue'

const props = withDefaults(defineProps<{ tick?: number; label?: string; gap?: number }>(), { label: 'Pages', gap: 8 })
const root = ref<HTMLElement | null>(null)
const view = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const W = ref(0), H = ref(0)
const count = ref(1)
// a page's height, for the cards' figures (KvPaged: they share what's left so a card fits one page)
provide('gmPageH', H)
const page = ref(0)

const trackStyle = computed(() => ({
    height: `${H.value}px`,
    '--gm-page-h': `${H.value}px`,
    // the cards' height: two rows of them fill a page when the page can hold two decent ones, else one fills it
    '--gm-card-h': `${H.value >= 2 * 200 + props.gap ? Math.min(260, Math.floor((H.value - props.gap) / 2)) : Math.min(H.value, 226)}px`,
    columnWidth: `${W.value}px`,
    columnGap: `${props.gap}px`,
    transform: `translateX(${-page.value * (W.value + props.gap)}px)`,
}))

/** How many pages the content takes now. */
function measure() {
    const v = view.value, t = track.value
    if (!v || !t) return
    const w = v.clientWidth, h = v.clientHeight
    if (w !== W.value || h !== H.value) { W.value = w; H.value = h; void nextTick(measure); return }
    const n = w > 0 ? Math.max(1, Math.round((t.scrollWidth + props.gap) / (w + props.gap))) : 1
    if (n !== count.value) count.value = n
    if (page.value > n - 1) page.value = n - 1
}
function go(p: number) { page.value = Math.max(0, Math.min(count.value - 1, p)) }

let lastWheel = 0
function wheel(e: WheelEvent) {
    if (count.value < 2 || Math.abs(e.deltaY) < 4) return
    e.preventDefault()
    const now = Date.now()
    if (now - lastWheel < 350) return
    lastWheel = now
    go(page.value + (e.deltaY > 0 ? 1 : -1))
}
function keys(e: KeyboardEvent) {
    if (e.key === 'PageDown') { e.preventDefault(); go(page.value + 1) }
    else if (e.key === 'PageUp') { e.preventDefault(); go(page.value - 1) }
}

watch(() => props.tick, () => measure())
let ro: ResizeObserver | null = null
onMounted(() => {
    measure()
    ro = new ResizeObserver(() => measure())
    if (view.value) ro.observe(view.value)
    if (track.value) for (const c of Array.from(track.value.children)) ro.observe(c)
})
onBeforeUnmount(() => ro?.disconnect())
defineExpose({ go, measure })
</script>
