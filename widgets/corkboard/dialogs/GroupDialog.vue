<!-- widgets/corkboard/dialogs/GroupDialog.vue: a group's name and its pin's due date (a centred popover). -->
<template>
    <form class="cb-dlg" @submit.prevent="save">
        <label class="cb-fl">Name
            <input ref="nameEl" v-model="n" type="text" maxlength="40" placeholder="Release 1.0" />
        </label>
        <div class="cb-fl">Due date
            <div class="cb-quick">
                <button v-for="q in quick" :key="q.label" type="button" class="cb-qb" :aria-pressed="(d || '') === (q.value || '')" @click="d = q.value">{{ q.label }}</button>
            </div>
            <input v-model="d" type="date" aria-label="Due date" />
        </div>
        <div class="cb-row"><span class="cb-sp"></span>
            <button class="cb-btn" type="button" @click="close()">Cancel</button>
            <button class="cb-btn primary" type="submit">{{ create ? 'Create group' : 'Save' }}</button>
        </div>
    </form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ymd, nextWeekday } from '../model'

const props = defineProps<{ name: string; due: string | null; create: boolean; onSave: (name: string, due: string | null) => void; close: () => void }>()
const n = ref(props.name)
const d = ref<string | null>(props.due)
const nameEl = ref<HTMLInputElement | null>(null)
const quick = [
    { label: 'None', value: null }, { label: 'Today', value: ymd(0) }, { label: 'Tomorrow', value: ymd(1) },
    { label: 'Friday', value: ymd(nextWeekday(5)) }, { label: 'Next week', value: ymd(nextWeekday(1)) },
]
function save() { props.onSave(n.value, d.value || null); props.close() }
onMounted(() => nameEl.value?.focus())
</script>
