<!-- widgets/forge/Playground.vue -->
<!--
    GEM FORGE 0.1d: the playground (playground.ts) in the sidebar (size "side": a column) and as a part of the IDE
    (size "full": the editor beside the result and the console). One Vue file or a script; ▶ Run (F5, or Ctrl+S
    while typing in it) builds it and shows it in the Result box (a script shows nothing there: it runs, the console
    says what it printed). Tries ▾: examples and the last 20 tries. Allowed ▾: the permissions it declares.
    Open as a project… (in the IDE): a real project from this try (New project's empty widget, in a folder).
-->
<template>
    <div class="gf-play" :class="size">
        <div class="gf-play-bar">
            <button type="button" class="gf-run" :disabled="s.building" title="Run it (F5)" @click="play.run()">{{ s.building ? '…' : '▶ Run' }}</button>
            <button ref="triesBtn" type="button" class="gf-btn" title="Examples and your last tries" @click="triesMenu">Tries ▾</button>
            <button ref="capsBtn" type="button" class="gf-btn" :title="`What it may use: ${play.store.caps.join(', ') || 'nothing yet'}`" @click="capsMenu">Allowed ▾</button>
            <span class="gf-grow" />
            <button type="button" class="gf-ib" title="Clear the console" @click="s.logs = []">⌫</button>
            <button v-if="size === 'side' && expand" type="button" class="gf-ib" title="The whole playground in a window" @click="expand?.()">⤢</button>
            <button v-if="size === 'full' && asProject" type="button" class="gf-btn" title="A real project from this try, in a folder you pick" @click="asProject?.()">Open as a project…</button>
        </div>
        <div class="gf-play-main">
            <div class="gf-play-code"><CodeEditor :project="play.project" single /></div>
            <div class="gf-play-side">
                <div class="gf-play-result"><PreviewPart :project="play.project" /></div>
                <div ref="box" class="gf-list gf-out gf-play-out">
                    <button v-for="(p, i) in s.errors" :key="'e' + i" type="button" class="gf-prob err" @click="go(p)">
                        <span class="gf-pi">✘</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">line {{ p.line }}</span>
                    </button>
                    <div v-if="!s.logs.length && !s.errors.length" class="gf-empty">What it prints shows here. A single expression is printed: try <code>1 + 1</code>.</div>
                    <div v-for="(l, i) in s.logs" :key="i" class="gf-log" :class="l.level">{{ l.text }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { inject, nextTick, onMounted, ref, watch } from 'vue'
import type { WidgetSdk, DevProblem } from 'gexplorer/widgets'
import CodeEditor from './CodeEditor.vue'
import PreviewPart from './PreviewPart.vue'
import { PLAY_CAPS, SNIPPETS, type Playground } from './playground'
import type { Project } from './project'

// project: given by the IDE's grid to every part (this one uses the playground's own project)
// close: given by GEM Shell when it is the content of a window (sdk.ui().openWindow)
const props = withDefaults(defineProps<{ play?: Playground; size?: 'side' | 'full'; project?: Project; close?: () => void }>(), { size: 'full' })
// Open as a project… (the IDE: Widget.vue provides it)
const asProject = inject<(() => void) | null>('gfPlayAsProject', null)
// ⤢ (0.1.5, the sidebar): the full playground in a window (Widget.vue provides it)
const expand = inject<(() => void) | null>('gfPlayExpand', null)
const sdk = inject<WidgetSdk>('widgetSdk')!
const play = props.play ?? inject<Playground>('gfPlay')!
const s = play.project.state
onMounted(() => void play.ensure())

const triesBtn = ref<HTMLElement | null>(null)
async function triesMenu() {
    if (!triesBtn.value) return
    const first = (c: string) => c.trim().split('\n')[0].slice(0, 60) + (c.includes('\n') ? ' …' : '')
    const items = [
        ...SNIPPETS.map(x => ({ id: `ex:${x.id}`, label: `Example: ${x.label}` })),
        ...play.store.history.map((h, i) => ({ id: `h:${i}`, label: first(h), title: h.slice(0, 200) })),
    ]
    const id = await sdk.ui?.().menu(triesBtn.value, items, { label: 'Tries' })
    if (!id) return
    const text = id.startsWith('ex:') ? SNIPPETS.find(x => `ex:${x.id}` === id)?.code : play.store.history[Number(id.slice(2))]
    if (text !== undefined) play.setCode(text)
}

const capsBtn = ref<HTMLElement | null>(null)
async function capsMenu() {
    if (!capsBtn.value) return
    const id = await sdk.ui?.().menu(capsBtn.value, PLAY_CAPS.map(c => ({
        id: c, label: `${play.store.caps.includes(c) ? '✓' : '  '} ${c}`, title: 'Declared on the next run; GEM Shell asks you at its first use',
    })), { label: 'Allowed' })
    if (id) play.toggleCap(id)
}

function go(p: DevProblem) {
    if (p.file === 'Snippet.vue') play.project.open('Snippet.vue', { line: p.line, column: p.column })
}

const box = ref<HTMLElement | null>(null)
watch(() => s.logs.length, async () => {
    await nextTick()
    if (box.value) box.value.scrollTop = box.value.scrollHeight
})
</script>
