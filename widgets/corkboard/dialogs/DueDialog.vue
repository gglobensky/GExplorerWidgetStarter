<!-- widgets/corkboard/dialogs/DueDialog.vue: "Pick a date…" for a stack or a group (a centred popover). -->
<template>
    <form class="cb-dlg" @submit.prevent="save">
        <input ref="dateEl" v-model="d" type="date" aria-label="Due date" />
        <div class="cb-row"><span class="cb-sp"></span>
            <button class="cb-btn" type="button" @click="close()">Cancel</button>
            <button class="cb-btn primary" type="submit">Set</button>
        </div>
    </form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{ due: string | null; onSave: (due: string | null) => void; close: () => void }>()
const d = ref(props.due ?? '')
const dateEl = ref<HTMLInputElement | null>(null)
function save() { props.onSave(d.value || null); props.close() }
onMounted(() => dateEl.value?.focus())
</script>
