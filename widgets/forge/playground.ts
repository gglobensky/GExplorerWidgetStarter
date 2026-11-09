// widgets/forge/playground.ts
//
// GEM FORGE 0.1d: THE PLAYGROUND. One Vue file to try something, run at once. The same playground in three sizes:
//   toolbar  a line or two (a popover under GEM Forge's toolbar button); what the code shows opens in a 📌 window
//   sidebar  the editor, the result and the console in a column
//   full     a part of the IDE (＋ Part ▸ Playground), side by side
// What the user writes is either a whole .vue file (it starts with "<": <template>, <script setup>, <style>) or a
// script: lines run in an async function inside <script setup>, with `sdk` (GEM Shell's API for this try) and Vue's
// usual functions at hand; a single expression is printed (`1 + 1`, `await sdk.fsReadText?.('C:\\notes.txt')`).
// It is a project in memory (project.ts) of its own: id pg-<this copy>, run as dev-pg-<…> (a dev identity: what
// it is allowed lasts while GEM Shell runs). Its permissions: the ones ticked (Allowed ▾), declared in its entry.ts.
// Kept with the lifecycle: the code (the project's snapshot), the permissions and the history (store).
import type { WidgetSdk, DevProblem } from 'gexplorer/widgets'
import { createProject, type BuildFile, type Project } from './project'

export const PLAY_CAPS = ['Read', 'Write', 'Network', 'Clipboard'] as const
export type PlayStore = { caps: string[]; history: string[] }
export const playStoreInit = (): PlayStore => ({ caps: [], history: [] })

export const SNIPPETS: { id: string; label: string; code: string }[] = [
    { id: 'math', label: 'An expression', code: '[1, 2, 3].map(n => n * n)' },
    { id: 'log', label: 'Lines of script', code: "const now = new Date()\nconsole.log('Today is', now.toLocaleDateString([], { weekday: 'long' }))\nconsole.log('GEM Shell runs on', sdk.platform?.() ?? 'an older shell')" },
    {
        id: 'ui', label: 'A small UI (a Vue file)',
        code: `<template>
    <div class="box">
        <button type="button" @click="n++">Clicked {{ n }} times</button>
        <p>{{ size.width ?? '?' }} × {{ size.height ?? '?' }} px</p>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WidgetPlacement } from 'gexplorer/widgets'

const props = defineProps<{ placement?: WidgetPlacement }>()
const n = ref(0)
const size = computed(() => props.placement?.size ?? {})
</script>

<style scoped>
.box { height: 100%; display: grid; place-content: center; gap: 6px; text-align: center; }
</style>
`,
    },
    { id: 'clip', label: 'The clipboard (allow Clipboard)', code: "// Allowed ▾ ▸ Clipboard first: GEM Shell asks you once\nawait sdk.clipboardSetText?.('Hello from GEM Forge\\'s playground')\nconsole.log('It is on the clipboard: paste it somewhere')" },
]

/** A whole Vue file (else a script). */
export const isSfc = (code: string) => /^\s*</.test(code)

const KEYWORD = /^(const|let|var|if|for|while|do|switch|try|function|class|return|throw|import|export|console\.|\/\/)/

const PRELUDE = [
    '<template><div v-if="false" /></template>',
    '<script setup lang="ts">',
    "import { inject, ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'",
    "import type { WidgetSdk } from 'gexplorer/widgets'",
    "const sdk = inject<WidgetSdk>('widgetSdk')!",
    'void [ref, reactive, computed, watch, nextTick, onMounted, onUnmounted]',
    ';(async () => {',
]

/** A script as the Vue file built, and how many lines come before the user's first one. */
export function wrapScript(code: string): { text: string; offset: number } {
    const trimmed = code.trim()
    const single = !trimmed.includes('\n') && !trimmed.includes(';') && trimmed.length > 0 && !KEYWORD.test(trimmed)
    const body = single ? `console.log(await (${trimmed}))` : code
    return { text: [...PRELUDE, body, '})().catch(err => console.error(err))', '</script>', ''].join('\n'), offset: PRELUDE.length }
}

function entryOf(caps: string[]): string {
    const declared = caps.filter(c => (PLAY_CAPS as readonly string[]).includes(c))
    return `import Snippet from './Snippet.vue'
export default {
    api: '1.0',
    id: 'playground',
    version: '0.0.0',
    Component: Snippet,
    displayName: 'Playground',
    contexts: { grid: {}, sidebar: {}, toolbar: {} },
    capabilities: ${JSON.stringify(declared.map(cap => ({ cap, reason: 'You allowed it in GEM Forge\'s playground (Allowed ▾).' })))},
}
`
}

/** A short stable id for this copy of GEM Forge (its project id: pg-<it>). */
function shortId(s: string): string {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
    return (h >>> 0).toString(36)
}

export type Playground = ReturnType<typeof createPlayground>

export function createPlayground(sdk: WidgetSdk, sourceId: string, store: PlayStore) {
    const id = `pg-${shortId(sourceId || 'forge')}`
    const project: Project = createProject(sdk, {
        prepare(files: BuildFile[]) {
            const code = files.find(f => f.path === 'Snippet.vue')?.text ?? ''
            if (isSfc(code)) return { files: [{ path: 'entry.ts', text: entryOf(store.caps) }, { path: 'Snippet.vue', text: code }] }
            const w = wrapScript(code)
            const map = (p: DevProblem): DevProblem => (p.file === 'Snippet.vue' ? { ...p, line: Math.max(1, p.line - w.offset) } : p)
            return { files: [{ path: 'entry.ts', text: entryOf(store.caps) }, { path: 'Snippet.vue', text: w.text }], map }
        },
    })
    const s = project.state

    /** Opened (or brought back by restore) with this code: in memory, the editor on Snippet.vue only. */
    async function open(code: string) {
        s.liveReload = false
        await project.openSample('Playground', [{ path: 'Snippet.vue', text: code }], id)
        s.openTabs = ['Snippet.vue']
        s.active = 'Snippet.vue'
    }
    async function ensure() {
        if (!s.id) await open(SNIPPETS[0].code)
    }

    const code = () => project.file('Snippet.vue')?.text ?? ''
    function setCode(text: string) {
        const f = project.file('Snippet.vue')
        if (f) { f.text = text; f.saved = text; project.state.textRev++ }
    }

    /** Run what's written (the console notes the try); the history keeps the last 20 distinct ones. */
    async function run(): Promise<boolean> {
        await ensure()
        const c = code()
        if (!c.trim()) return false
        project.log('info', `▶ ${c.trim().split('\n')[0].slice(0, 80)}${c.includes('\n') ? ' …' : ''}`)
        store.history = [c, ...store.history.filter(h => h !== c)].slice(0, 20)
        const f = project.file('Snippet.vue')
        if (f) f.saved = f.text                    // a try is never "unsaved"
        return project.run()
    }

    function toggleCap(cap: string) {
        store.caps = store.caps.includes(cap) ? store.caps.filter(c => c !== cap) : [...store.caps, cap]
    }

    /** The files of a real project made from this try (New project's empty widget, its Widget.vue this file). */
    function asProjectFiles(): { path: string; text: string }[] {
        const c = code()
        const widget = isSfc(c) ? c : wrapScript(c).text
        return [{ path: 'Widget.vue', text: widget }]
    }

    return { id, project, store, open, ensure, code, setCode, run, toggleCap, asProjectFiles }
}
