<!-- widgets/corkboard/dialogs/StackPanel.vue
     The open stack's ⋯ (a popover under the button): name, colour, paper, numbering, flags, due date, export,
     delete. What the right-click menu offers too, for a left click. -->
<template>
    <div class="cb-panel">
        <label class="cb-fl">Stack name
            <input v-model="name" type="text" maxlength="40" @input="setName" />
        </label>
        <div class="cb-fl">Colour
            <div class="cb-sw">
                <button v-for="c in PAPER_COLORS" :key="c" type="button" :class="'c-' + c" class="cb-swatch" :title="COLOR_NAMES[c]" :aria-label="COLOR_NAMES[c]"
                        :aria-pressed="color === c" @click="setColor(c)"></button>
            </div>
        </div>
        <div class="cb-fl">Paper
            <span class="cb-seg" role="group">
                <button v-for="p in PAPERS" :key="p[0]" type="button" :aria-pressed="paper === p[0]" @click="setPaper(p[0])">{{ p[1] }}</button>
            </span>
        </div>
        <label class="cb-chk"><input type="checkbox" :checked="numbered" @change="setNumbered(($event.target as HTMLInputElement).checked)" />
            <span>Number the notes<small>#1, #2… handy for bugs</small></span></label>
        <div class="cb-fl">Flags
            <div class="cb-quick">
                <button v-for="[f, label] in FLAGS" :key="f" type="button" class="cb-qb flag" :style="{ '--fc': `var(--cb-fl-${f})` }" :aria-pressed="flags.includes(f)" @click="flag(f)"><span class="cb-fd"></span>{{ label }}</button>
            </div>
        </div>
        <div class="cb-fl">Due date
            <div class="cb-quick">
                <button v-for="q in quick" :key="q.label" type="button" class="cb-qb" :aria-pressed="(due || '') === (q.value || '')" @click="setDue(q.value)">{{ q.label }}</button>
            </div>
            <input :value="due ?? ''" type="date" aria-label="Due date" @change="setDue(($event.target as HTMLInputElement).value || null)" />
        </div>
        <hr />
        <button class="cb-mi" type="button" @click="onExport(); close()">Save as a file…</button>
        <button class="cb-mi danger" type="button" @click="onDelete(); close()">Delete stack…</button>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PAPER_COLORS, COLOR_NAMES, FLAGS, ymd, nextWeekday, type Stack, type FlagId, type PaperColor, type PaperKind } from '../model'

const props = defineProps<{
    stack: Stack
    onChange: () => void
    onFlag: (f: FlagId) => void
    onDue: (v: string | null) => void
    onNumbered: (on: boolean) => void
    onExport: () => void
    onDelete: () => void
    close: () => void
}>()
const PAPERS: [PaperKind, string][] = [['plain', 'Plain'], ['lined', 'Lined'], ['grid', 'Grid']]
const s = props.stack
const name = ref(s.name), color = ref(s.color), paper = ref(s.paper), numbered = ref(s.numbered)
const flags = ref([...s.flags]), due = ref(s.due)
const quick = [{ label: 'None', value: null }, { label: 'Today', value: ymd(0) }, { label: 'Tomorrow', value: ymd(1) }, { label: 'Friday', value: ymd(nextWeekday(5)) }, { label: 'Next week', value: ymd(nextWeekday(1)) }]

function setName() { const v = name.value.trim(); if (v) { s.name = v.slice(0, 40); props.onChange() } }
function setColor(c: PaperColor) { color.value = c; s.color = c; props.onChange() }
function setPaper(p: PaperKind) { paper.value = p; s.paper = p; props.onChange() }
function setNumbered(on: boolean) { numbered.value = on; props.onNumbered(on) }
function flag(f: FlagId) { props.onFlag(f); flags.value = [...s.flags] }
function setDue(v: string | null) { due.value = v; props.onDue(v) }
</script>
