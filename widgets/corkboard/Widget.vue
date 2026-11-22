<!-- widgets/corkboard/Widget.vue (0.5.0) -->
<!--
    GEM CORKBOARD: which face this copy shows (claude/plan-2026-11-22-corkboard-pad.md).
      grid      the full board (BoardApp.vue).
      sidebar   its layout (the header's layout button): the full board, or the pad (Pad.vue), a notepad you tear
                pages from to send them to any board's stack, which can also keep any note open, live.
      toolbar   a 📝 button: the pad in a popover under it.
    Keys (onCommand) and right-click menus (onMenuItem) go to the face shown.
    In Add widget ▸ Removed (sdk.previewKind() 'removed'): the board when the copy kept one, else its pad (its page).
-->
<template>
    <button v-if="context === 'toolbar'" ref="toolBtn" class="cb-toolbtn" :class="{ open: popOpen }" type="button"
            title="Quick note (GEM Corkboard)" aria-label="Quick note" @click="togglePad">📝</button>
    <template v-else-if="layout === 'wait'"></template>
    <Pad v-else-if="layout === 'pad'" ref="padRef" :config="config" can-board @board="showBoard" />
    <BoardApp v-else ref="boardRef" :source-id="sourceId" :config="config" :placement="placement" />
</template>

<script setup lang="ts">
import { ref, computed, inject, onBeforeUnmount } from 'vue'
import type { WidgetSdk, WidgetMenuItemMessage, WidgetPopoverHandle } from 'gexplorer/widgets'
import BoardApp from './BoardApp.vue'
import Pad from './Pad.vue'

const props = defineProps<{
    sourceId: string
    config?: Record<string, any>
    placement?: { context?: 'grid' | 'sidebar' | 'toolbar' | 'embedded'; size?: any }
}>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const context = computed(() => props.placement?.context ?? 'grid')
/** The sidebar's choice (entry.ts contexts.sidebar.layouts: the pad unless the board is chosen); the hub always shows the board. */
const removed = sdk.previewKind?.() === 'removed'
/** A removed copy shown in Add widget ▸ Removed: did it keep a board? (null: not read yet) */
const keptBoard = ref<boolean | null>(removed ? null : true)
if (removed) void sdk.instanceData!().read('desk').then(d => { keptBoard.value = !!d }).catch(() => { keptBoard.value = false })
const layout = computed(() => {
    if (removed) return keptBoard.value === null ? 'wait' : keptBoard.value ? 'board' : 'pad'
    return context.value === 'sidebar' && props.config?.view?.layout !== 'board' ? 'pad' : 'board'
})

type FaceApi = { onCommand(id: string): void; onMenuItem(m: WidgetMenuItemMessage): void }
const boardRef = ref<FaceApi | null>(null)
const padRef = ref<{ command(id: string): void } | null>(null)
/** The pad in the toolbar's popover (registers itself: a popover's component has no ref). */
let popPad: { command(id: string): void } | null = null

function showBoard() { void sdk.setView?.({ layout: 'board' }) }

// ── The toolbar's pad ───────────────────────────────────────────────────────
const toolBtn = ref<HTMLElement | null>(null)
const popOpen = ref(false)
let pop: WidgetPopoverHandle | null = null
function togglePad() {
    if (pop) { pop.close(); return }
    if (!toolBtn.value) return
    const h = ui.openPopover({
        anchor: toolBtn.value, component: Pad,
        // read when it opens: the page not sent yet, the last stack, the note kept open
        props: { config: props.config, inPop: true, register: (api: { command(id: string): void } | null) => { popPad = api } },
        placement: 'below', maxWidth: 360, maxHeight: 440, style: { padding: 0, radius: 8 },
        onClose: () => { pop = null; popPad = null; popOpen.value = false },
    })
    if (!h) return
    pop = h
    popOpen.value = true
}
onBeforeUnmount(() => pop?.close())

// ── Keys and menus: to the face shown ───────────────────────────────────────
function onCommand(id: string) {
    if (context.value === 'toolbar') { popPad?.command(id); return }
    if (layout.value === 'pad') { padRef.value?.command(id); return }
    if (id === 'pad-send') return
    boardRef.value?.onCommand(id)
}
function onMenuItem(m: WidgetMenuItemMessage) {
    boardRef.value?.onMenuItem(m)
}
defineExpose({ onCommand, onMenuItem })
</script>
