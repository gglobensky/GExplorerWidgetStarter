<!-- widgets/console/ToolbarPanel.vue -->
<!--
    The toolbar's console: GEM Shell's console popover under the button (ui.openPopover { console: true }), growing
    out of it. The instance's consoles (consoles.ts) live in Widget.vue: folding this leaves them running.
-->
<template>
    <div class="gc-panel" :class="{ grown }">
        <ConsoleView ref="view" :con="con" mode="toolbar" :saved-shell="savedShell" @shell="(id: string) => onShell?.(id)" @fold="close?.()" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ConsoleView from './ConsoleView.vue'
import type { Consoles } from './consoles'

const props = defineProps<{
    con: Consoles
    savedShell?: string
    onShell?: (id: string) => void
    close?: () => void
}>()

const view = ref<{ focus(): void } | null>(null)
const grown = ref(false)

onMounted(() => {
    // Grown on the next frame (the CSS transition runs from the button's size), then the terminal fits and has the keys
    requestAnimationFrame(() => {
        grown.value = true
        setTimeout(() => { props.con.fitNow(); view.value?.focus() }, 200)
    })
})
</script>
