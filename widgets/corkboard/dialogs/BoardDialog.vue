<!-- widgets/corkboard/dialogs/BoardDialog.vue: a new board, or this one renamed / recoloured (a centred popover). -->
<template>
    <form class="cb-dlg" @submit.prevent="save">
        <label class="cb-fl">Title, if you want one
            <input ref="titleEl" v-model="t" type="text" maxlength="40" placeholder="Untitled board" />
        </label>
        <div class="cb-fl">Surface
            <div class="cb-sw">
                <button v-for="[k, label] in SURFACES" :key="k" type="button" class="cb-bsw big" :class="'surf-' + k"
                        :title="label" :aria-label="label" :aria-pressed="s === k" @click="s = k"></button>
            </div>
        </div>
        <div class="cb-row"><span class="cb-sp"></span>
            <button class="cb-btn" type="button" @click="close()">Cancel</button>
            <button class="cb-btn primary" type="submit">{{ create ? 'Create board' : 'Save' }}</button>
        </div>
    </form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SURFACES, type Surface } from '../model'

const props = defineProps<{ title: string; surface: Surface; create: boolean; onSave: (title: string, surface: Surface) => void; close: () => void }>()
const t = ref(props.title)
const s = ref<Surface>(props.surface)
const titleEl = ref<HTMLInputElement | null>(null)
function save() { props.onSave(t.value, s.value); props.close() }
onMounted(() => titleEl.value?.focus())
</script>
