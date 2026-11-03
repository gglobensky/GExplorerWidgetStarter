<!-- widgets/corkboard/dialogs/CopyDialog.vue
     Export: a stack or a board as a Corkboard copy (paste it on any board, in any copy of the widget: a standalone
     duplicate) or as Markdown, with Copy. Import: paste a copy and Import. (A centred popover.)
     0.2.2: Save as a file (.gembrd for a board, .gemstk for a stack, .md), and Open a file in Import. -->
<template>
    <div class="cb-dlg">
        <template v-if="mode === 'export'">
            <p class="cb-muted">Paste the Corkboard copy onto any board, in any copy of GEM Corkboard, to add it there as a separate duplicate. It won't stay in sync.</p>
            <div class="cb-row">
                <span class="cb-seg" role="group" aria-label="Format">
                    <button type="button" :aria-pressed="fmt === 'json'" @click="fmt = 'json'">Corkboard copy</button>
                    <button type="button" :aria-pressed="fmt === 'md'" @click="fmt = 'md'">Markdown</button>
                </span>
                <span class="cb-sp"></span><span class="cb-muted">{{ size }}</span>
            </div>
            <textarea ref="textEl" class="cb-copytext" readonly :value="text" aria-label="Export"></textarea>
            <div class="cb-row">
                <button v-if="onSave" class="cb-btn" type="button" :disabled="busy" @click="save">Save as a file (.{{ fmt === 'md' ? 'md' : fileExt }})…</button>
                <span class="cb-sp"></span>
                <button class="cb-btn" type="button" @click="close()">Done</button>
                <button class="cb-btn primary" type="button" @click="copy">{{ copied }}</button>
            </div>
        </template>
        <template v-else>
            <p class="cb-muted">Paste a Corkboard copy of a stack or a whole board, or open a .gembrd / .gemstk file. You can also paste a copy straight onto a board.</p>
            <textarea ref="textEl" v-model="input" class="cb-copytext" placeholder='{"corkboard":1, …}' aria-label="Corkboard copy"></textarea>
            <div class="cb-row">
                <button v-if="onOpenFile" class="cb-btn" type="button" :disabled="busy" @click="openFile">Open a file…</button>
                <span class="cb-sp"></span>
                <button class="cb-btn" type="button" @click="close()">Cancel</button>
                <button class="cb-btn primary" type="button" :disabled="!input.trim() || busy" @click="doImport">Import</button>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const props = defineProps<{
    mode: 'export' | 'import'
    json?: string
    markdown?: string
    onImport?: (text: string) => Promise<boolean>
    /** 0.2.2: the extension a Corkboard copy file gets ('gembrd', 'gemstk'). */
    fileExt?: string
    onSave?: (fmt: 'json' | 'md') => Promise<void>
    onOpenFile?: () => Promise<boolean>
    close: () => void
}>()
const fmt = ref<'json' | 'md'>('json')
const text = computed(() => (fmt.value === 'json' ? props.json : props.markdown) ?? '')
const size = computed(() => (new Blob([text.value]).size / 1024).toFixed(1) + ' KB')
const textEl = ref<HTMLTextAreaElement | null>(null)
const copied = ref('Copy')
const input = ref('')
const busy = ref(false)

async function copy() {
    try { await navigator.clipboard.writeText(text.value); copied.value = 'Copied'; setTimeout(() => { copied.value = 'Copy' }, 1500) }
    catch { textEl.value?.focus(); textEl.value?.select(); copied.value = 'Press Ctrl+C' }
}
async function doImport() {
    if (!props.onImport) return
    busy.value = true
    const ok = await props.onImport(input.value)
    busy.value = false
    if (ok) props.close()
}
async function save() {
    if (!props.onSave) return
    busy.value = true
    try { await props.onSave(fmt.value) } finally { busy.value = false }
}
async function openFile() {
    if (!props.onOpenFile) return
    busy.value = true
    const ok = await props.onOpenFile().finally(() => { busy.value = false })
    if (ok) props.close()
}
onMounted(() => { if (props.mode === 'import') textEl.value?.focus() })
</script>
