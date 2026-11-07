<!-- widgets/monitor/Pager.vue -->
<!--
    The page toggles that replace scrollbars: ‹ ● ○ ○ › (radio dots; "3 / 12" past PAGER_DOTS pages). Keys: ← → Home End.
-->
<template>
    <div v-if="count > 1" class="gm-pager" role="radiogroup" :aria-label="label" @keydown="keys">
        <button type="button" class="gm-pager-arrow" :disabled="page <= 0" aria-label="Previous page" tabindex="-1" @click="go(page - 1)">‹</button>
        <template v-if="count <= PAGER_DOTS">
            <button v-for="i in count" :key="i" type="button" role="radio" class="gm-pager-dot" :class="{ on: i - 1 === page }"
                    :aria-checked="i - 1 === page" :aria-label="`Page ${i} of ${count}`" :title="`Page ${i} of ${count}`"
                    :tabindex="i - 1 === page ? 0 : -1" @click="go(i - 1)"></button>
        </template>
        <span v-else class="gm-pager-n" role="radio" aria-checked="true" tabindex="0" :aria-label="`Page ${page + 1} of ${count}`">{{ page + 1 }} / {{ count }}</span>
        <button type="button" class="gm-pager-arrow" :disabled="page >= count - 1" aria-label="Next page" tabindex="-1" @click="go(page + 1)">›</button>
    </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ page: number; count: number; label?: string }>(), { label: 'Pages' })
const emit = defineEmits<{ (e: 'go', page: number): void }>()
const PAGER_DOTS = 8

function go(p: number) { emit('go', Math.max(0, Math.min(props.count - 1, p))) }
function keys(e: KeyboardEvent) {
    const to = e.key === 'ArrowRight' ? props.page + 1 : e.key === 'ArrowLeft' ? props.page - 1
        : e.key === 'Home' ? 0 : e.key === 'End' ? props.count - 1 : null
    if (to === null) return
    e.preventDefault()
    go(to)
    requestAnimationFrame(() => ((e.currentTarget as HTMLElement | null)?.querySelector('.gm-pager-dot.on, .gm-pager-n') as HTMLElement | null)?.focus())
}
</script>
