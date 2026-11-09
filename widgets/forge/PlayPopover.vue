<!-- widgets/forge/PlayPopover.vue -->
<!--
    GEM FORGE 0.1d: the toolbar's playground (a popover under GEM Forge's ⚒ button: sdk.ui().openPopover). A line or
    two: Enter runs it (Shift+Enter: a new line); a single expression is printed. A Vue file (it starts with "<")
    opens in a 📌 window of its own; a script runs out of sight (Widget.vue). ⤢ Full playground (0.1.5): the whole
    playground in a GEM Forge window (Playground.vue, as the IDE's part). Everything comes as props: a popover is drawn
    by GEM Shell, outside GEM Forge's box.
-->
<template>
    <div class="gf-pop gf-play">
        <textarea ref="input" v-model="code" class="gf-pop-in" rows="2" spellcheck="false"
                  placeholder="1 + 1   ·   console.log(sdk.platform?.())   ·   <template>…" @keydown="onKey" />
        <div class="gf-pop-bar">
            <button type="button" class="gf-run" :disabled="s.building" @click="onRun()">{{ s.building ? '…' : '▶ Run' }}</button>
            <button type="button" class="gf-btn" title="What it shows, in a window of its own" :disabled="!s.build" @click="onWindow()">📌 Result</button>
            <button type="button" class="gf-btn" title="The whole playground in a window: the editor, its examples, the result and the console" @click="onExpand()">⤢ Full playground</button>
            <span class="gf-grow" />
            <span class="gf-dim">{{ play.store.caps.length ? `Allowed: ${play.store.caps.join(', ')}` : '' }}</span>
            <button type="button" class="gf-ib" title="Clear" @click="s.logs = []">⌫</button>
        </div>
        <div ref="box" class="gf-list gf-out gf-pop-out">
            <div v-for="(p, i) in s.errors" :key="'e' + i" class="gf-log error">✘ line {{ p.line }}: {{ p.text }}</div>
            <div v-if="!s.logs.length && !s.errors.length" class="gf-empty">Enter runs it. More room: GEM Forge in the sidebar, or its Playground part in a hub.</div>
            <div v-for="(l, i) in s.logs" :key="i" class="gf-log" :class="l.level">{{ l.text }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Playground } from './playground'

const props = defineProps<{ play: Playground; onRun: () => void; onWindow: () => void; onExpand: () => void }>()
const s = props.play.project.state
const code = computed({ get: () => props.play.code(), set: v => props.play.setCode(v) })
const input = ref<HTMLTextAreaElement | null>(null)
onMounted(async () => {
    await props.play.ensure()
    input.value?.focus()
})
function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); props.onRun() }
}
const box = ref<HTMLElement | null>(null)
watch(() => s.logs.length + s.errors.length, async () => {
    await nextTick()
    if (box.value) box.value.scrollTop = box.value.scrollHeight
})
</script>
