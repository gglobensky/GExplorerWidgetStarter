<!-- widgets/forge/TerminalTile.vue -->
<!--
    GEM FORGE 0.6.0: the Terminal part's tile (terminal.ts). GEM Shell draws the provider's terminal over the box below
    the bar (sdk.parts().mount), never inside GEM Forge's own components; what shows in the box itself is only for
    when it can't be there yet (choosing a provider, allowing one you installed, none installed).
-->
<template>
    <div class="gf-term">
        <div class="gf-term-bar">
            <span class="gf-dim gf-term-who">{{ who }}</span>
            <button v-if="t.state.providers.length > 1 && t.state.state === 'ready'" ref="whoBtn" type="button" class="gf-btn"
                    title="Use another widget's terminal" @click="choose">Change…</button>
            <span class="gf-grow" />
            <label class="gf-check" title="npm's output (Packages: install, add, remove, a library's rebuild) also shows in the terminal's Tool output tab">
                <input type="checkbox" :checked="t.state.npmHere" @change="t.setNpmHere(($event.target as HTMLInputElement).checked)"> npm output here too
            </label>
        </div>
        <!-- 0.6.1: while the page is arranged the terminal steps aside (drawn above the page, it covered the tile's
             handles): the box isn't laid out, so GEM Shell hides it -->
        <div v-if="arranging" class="gf-empty gf-term-note">The terminal shows again when you're done arranging.</div>
        <div ref="box" class="gf-term-box" :class="{ away: arranging }">
            <div v-if="t.state.state !== 'ready'" class="gf-empty gf-term-note">
                <template v-if="t.state.state === 'loading' || t.state.state === 'idle'">Opening the terminal…</template>
                <template v-else-if="t.state.state === 'none'">No widget you have provides a terminal. GEM Console does: add it from the Widget browser.</template>
                <template v-else-if="t.state.state === 'pick'">
                    <p>Several widgets provide a terminal. Which one should GEM Forge use?</p>
                    <button v-for="p in t.state.providers" :key="p.type" type="button" class="gf-btn" @click="usePick(p.type)">
                        {{ p.name }}<span v-if="!p.builtin" class="gf-dim"> (installed by you)</span>
                    </button>
                </template>
                <template v-else-if="t.state.state === 'ask'">
                    <p>{{ chosenName }} is a widget you installed. GEM Forge can use its terminal: it would run with GEM Forge's permissions.</p>
                    <button type="button" class="gf-btn" @click="retry">Let GEM Forge use {{ chosenName }}'s terminal…</button>
                </template>
                <template v-else>
                    <p>{{ t.state.note }}</p>
                    <button v-if="t.state.state === 'failed'" type="button" class="gf-btn" @click="retry">Try again</button>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import type { ForgeTerminal } from './terminal'
import type { Project } from './project'

// The tile's props, as every part's (the terminal itself is terminal.ts's, kept with the project)
defineProps<{ project: Project; arranging?: boolean }>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const t = inject<ForgeTerminal>('gfTerminal')!
const box = ref<HTMLElement | null>(null)
const whoBtn = ref<HTMLElement | null>(null)

const chosen = computed(() => t.state.providers.find(p => p.type === t.state.provider) ?? null)
const chosenName = computed(() => chosen.value?.name ?? t.state.provider)
const who = computed(() => t.state.state === 'ready' && chosen.value ? `${chosen.value.name}'s terminal, as GEM Forge` : 'Terminal')

onMounted(() => { if (box.value) void t.show(box.value) })
function retry() { if (box.value) void t.show(box.value) }
function usePick(type: string) { if (box.value) void t.pick(type, box.value) }
async function choose() {
    if (!whoBtn.value || !box.value) return
    const id = await sdk.ui?.().menu(whoBtn.value, t.state.providers.map(p => ({ id: p.type, label: p.name, title: p.builtin ? 'Comes with GEM Shell' : 'A widget you installed' })), { preferred: t.state.provider, label: 'Terminals' })
    if (id && id !== t.state.provider) void t.pick(id, box.value)
}
</script>
