<!-- widgets/console/ConsoleView.vue -->
<!--
    One view of the instance's consoles (consoles.ts): the tabs (＋ the default shell, ▾ another one, ⋯ more), the path
    field and favorites outside a pane (the sidebar, the toolbar's popover), a move waiting for the prompt, and the
    active terminal. The keys inside the terminal are the console's (sdk.terminal().captureKeys) while you work in it.
-->
<template>
    <div class="gc-root" :class="['m-' + mode, { narrow }]">
        <div class="gc-bar">
            <div class="gc-tabs" role="tablist" aria-label="Consoles">
                <button v-for="t in tabs" :key="t.key" class="gc-tab" type="button" role="tab"
                        :class="{ on: t.key === con.st.active, ended: t.ended }" :aria-selected="t.key === con.st.active"
                        :title="tabTip(t)" @click="pick(t.key)" @auxclick="(e: MouseEvent) => e.button === 1 && closeTab(t.key)">
                    <span v-if="t.busy" class="gc-busy" aria-label="Running a command"></span>
                    <span class="gc-tl">{{ tabTitle(t) }}</span>
                    <span class="gc-x" role="button" aria-label="Close" title="Close this console" @click.stop="closeTab(t.key)">×</span>
                </button>
                <!-- 0.1.4: a console starting beside the others -->
                <div v-if="con.st.starting && tabs.length" class="gc-tab gc-tab-starting" role="status" :title="`Starting ${con.st.starting}…`">
                    <span class="gc-spin gc-spin-sm"></span>
                    <span class="gc-tl">{{ con.st.starting }}</span>
                </div>
            </div>
            <button class="gc-ib" type="button" :disabled="!canStart" :title="newTip" aria-label="New console" @click="startDefault">＋</button>
            <button ref="shellBtn" class="gc-ib gc-caret" type="button" :disabled="!canStart" title="New console in another shell"
                    aria-label="Choose a shell" @click="pickShell(shellBtn)">▾</button>
            <button ref="moreBtn" class="gc-ib" type="button" title="More" aria-label="More" @click="more">⋯</button>
            <button v-if="mode === 'toolbar'" class="gc-ib" type="button" title="Fold (the consoles keep running)" aria-label="Fold" @click="emit('fold')">⌃</button>
        </div>

        <div v-if="mode !== 'grid'" class="gc-path">
            <gex-path-input class="gc-pin" :model-value="typed" kind="folder" placeholder="Folder (Enter to go there)"
                            @update:model-value="(v: string) => typed = v" @enter="go" />
            <button v-if="hasFavorites" ref="favBtn" class="gc-ib" type="button" title="Go to a favorite" aria-label="Favorites" @click="favorites">★</button>
        </div>

        <div v-if="pending" class="gc-pending" role="status">
            <span class="gc-pt" :title="pendingWhy">Moves to <b>{{ pendingName }}</b> {{ current?.busy ? 'when the command ends' : 'at the next prompt' }}</span>
            <button class="gc-link" type="button" @click="con.cancelPending()">Cancel</button>
        </div>

        <div class="gc-main">
            <div ref="termEl" class="gc-term" :class="{ hidden: !current }" @contextmenu="onRightClick"></div>
            <div v-if="!current" class="gc-empty">
                <template v-if="con.st.state === 'loading'"><span class="gc-spin" aria-label="Loading"></span></template>
                <template v-else-if="con.st.starting">
                    <div class="gc-starting" role="status">
                        <span class="gc-spin"></span>
                        <span>Starting {{ con.st.starting }}…</span>
                    </div>
                    <p v-if="con.st.state === 'declined'" class="gc-dim gc-note">GEM Shell asks you first: a console runs any command as you.</p>
                </template>
                <template v-else-if="con.st.state === 'no-api'">
                    <p>This version of GEM Shell can't run consoles yet.</p>
                </template>
                <template v-else-if="con.st.state === 'unavailable'">
                    <p>{{ con.st.reason || 'Consoles aren\'t available on this computer.' }}</p>
                </template>
                <template v-else>
                    <div class="gc-split">
                        <button class="gc-start" type="button" @click="startDefault">
                            <span class="gc-prompt">&gt;_</span>
                            <span>{{ startLabel }}</span>
                        </button>
                        <button ref="startPickBtn" class="gc-start gc-start-pick" type="button" title="Start another shell"
                                aria-label="Choose the shell to start" @click="pickShell(startPickBtn)">▾</button>
                    </div>
                    <p v-if="con.st.startIn" class="gc-dim gc-where" :title="con.st.startIn">in {{ con.st.startIn }}</p>
                    <p v-if="con.st.state === 'declined'" class="gc-dim gc-note">GEM Shell asks you first: a console runs any command as you.</p>
                    <p v-if="error" class="gc-err">{{ error }}</p>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { WidgetSdk, FavoriteTreeNode } from 'gexplorer/widgets'
import { folderName, isFolderPath, samePath, type Consoles, type Tab } from './consoles'

const props = defineProps<{
    con: Consoles
    mode: 'grid' | 'sidebar' | 'toolbar'
    /** The user's last shell (view.shell). */
    savedShell?: string
}>()
const emit = defineEmits<{
    (e: 'shell', id: string): void
    (e: 'fold'): void
}>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const con = props.con
const termEl = ref<HTMLElement | null>(null)
const shellBtn = ref<HTMLElement | null>(null)
const startPickBtn = ref<HTMLElement | null>(null)
const moreBtn = ref<HTMLElement | null>(null)
const favBtn = ref<HTMLElement | null>(null)
const error = ref('')
const typed = ref('')
const width = ref(600)

const tabs = computed(() => con.tabs.value)
const current = computed(() => con.active.value)
const pending = computed(() => current.value?.pending ?? null)
const pendingName = computed(() => pending.value ?? '')
const pendingWhy = computed(() => current.value?.busy
    ? 'A program is running in this console: it moves once the program ends.'
    : 'Something is typed at the prompt: it moves after you run or clear it (Enter, or Esc in PowerShell).')
const narrow = computed(() => width.value < 360)
const hasFavorites = typeof sdk.getGlobalFavorites === 'function'
const canStart = computed(() => (con.st.state === 'ready' || con.st.state === 'declined') && !con.st.starting)
const defaultId = computed(() => con.defaultShell(props.savedShell) ?? (con.st.state === 'declined' ? (props.savedShell || USUAL_SHELLS[0].id) : null))
const startLabel = computed(() => {
    const id = defaultId.value
    if (!id) return 'Start a console'
    return `Start ${con.st.shells.length ? con.shellLabel(id) : 'a console'}`
})
const newTip = computed(() => defaultId.value && con.st.shells.length ? `New console (${con.shellLabel(defaultId.value)})` : 'New console')

function tabTitle(t: Tab): string {
    const where = t.cwd ? folderName(t.cwd) : ''
    if (narrow.value || props.mode !== 'grid') return where || shortShell(t.shell)
    return where ? `${shortShell(t.shell)} · ${where}` : t.label
}
function tabTip(t: Tab): string {
    return [t.label, t.cwd, t.busy ? 'Running a command' : '', t.ended ? 'Ended' : ''].filter(Boolean).join('\n')
}
function shortShell(id: string): string {
    if (id === 'pwsh' || id === 'powershell') return 'PS'
    if (id === 'cmd') return 'cmd'
    if (id === 'bash') return 'bash'
    if (id.startsWith('wsl:')) return id.slice(4)
    return id
}

// The path field follows the active console (unless you're typing in it)
watch(() => current.value?.cwd, cwd => {
    const el = document.activeElement
    if (cwd && !(el && el.closest('.gc-path'))) typed.value = cwd
}, { immediate: true })

async function start(shell: string | null) {
    error.value = ''
    const err = await con.open(shell)
    if (err) { error.value = err; return }
    if (shell) emit('shell', shell)
    await nextTick()
    con.focus()
}
function startDefault() { void start(defaultId.value) }

// Before the first permission, GEM Shell doesn't list this computer's shells to the widget: the usual ones are offered
// (one that isn't installed says so when started). 0.1.4: Linux's, on a Linux GEM Shell.
// The OS from GEM Shell's backend (sdk.platform, 2026-11-06): the web view's user agent didn't say Windows. An older
// GEM Shell without it ran on Windows only.
const ON_WINDOWS = (sdk.platform?.() ?? 'win32') === 'win32'
const USUAL_SHELLS = ON_WINDOWS ? [
    { id: 'powershell', label: 'Windows PowerShell' },
    { id: 'pwsh', label: 'PowerShell 7' },
    { id: 'cmd', label: 'Command Prompt' },
    { id: 'bash', label: 'Git Bash' },
] : [
    { id: 'bash', label: 'Bash' },
    { id: 'zsh', label: 'Zsh' },
    { id: 'fish', label: 'Fish' },
]

/** ▾ (the tab bar's, or the Start button's): a console in the shell you choose, remembered as your usual one. */
async function pickShell(anchor: HTMLElement | null) {
    if (!anchor) return
    const list = con.st.shells.length ? con.st.shells : USUAL_SHELLS
    const id = await ui.menu(anchor, list.map((s: { id: string; label: string; version?: string }) => ({ id: s.id, label: s.label, title: s.version || undefined })), { preferred: defaultId.value ?? undefined, label: 'Shells' })
    if (id) void start(id)
}

function pick(key: number) {
    con.select(key)
    void nextTick(() => con.focus())
}

async function closeTab(key: number) {
    const t = tabs.value.find((x: Tab) => x.key === key)
    if (t?.busy && !t.ended) {
        const ok = await ui.confirm('It is running a command: closing it ends the command too.', { title: 'Close this console?', okLabel: 'Close it', danger: true })
        if (!ok) return
    }
    await con.close(key)
}

async function more() {
    if (!moreBtn.value) return
    const t = current.value
    const items = [
        { id: 'copy', label: 'Copy the selection', disabled: !t?.rt.term.hasSelection() },
        { id: 'clear', label: 'Clear the screen', disabled: !t },
        { id: 'restart', label: 'Restart this console', disabled: !t?.ended },
        { id: 'close', label: 'Close this console', disabled: !t },
    ]
    const id = await ui.menu(moreBtn.value, items, { label: 'Console' })
    if (!t) return
    if (id === 'copy') void con.copySelection(t)
    else if (id === 'clear') t.rt.term.clear()
    else if (id === 'restart') { const err = await con.restart(t.key); if (err) error.value = err }
    else if (id === 'close') void closeTab(t.key)
}

// Right-click: copies the selection (as Windows Terminal does)
function onRightClick(e: MouseEvent) {
    const t = current.value
    if (!t || !t.rt.term.hasSelection()) return
    e.preventDefault()
    void con.copySelection(t)
}

/** The path field: Enter moves the active console there (or the next one starts there). */
function go(text?: string) {
    const folder = String(text ?? typed.value ?? '').trim()
    if (!folder) return
    if (!isFolderPath(folder)) { error.value = 'Type a folder\'s full path.'; return }
    error.value = ''
    if (!current.value || current.value.ended) { con.st.startIn = folder; return }
    if (samePath(folder, current.value.cwd)) return
    void con.moveTo(folder)
    con.focus()
}

/** ★: your favorite folders (one folder each), the active console goes there. */
async function favorites() {
    if (!favBtn.value || !sdk.getGlobalFavorites) return
    let tree: FavoriteTreeNode[] = []
    try { tree = await sdk.getGlobalFavorites() } catch { error.value = 'Your favorites could not be read.'; return }
    const items: Array<{ id: string; label: string; title?: string }> = []
    const walk = (nodes: FavoriteTreeNode[], prefix: string) => {
        for (const n of nodes) {
            if (items.length >= 30) return
            if (n.kind === 'folder') walk(n.children, `${prefix}${n.label} ▸ `)
            else if (n.locations.length === 1 && isFolderPath(n.locations[0])) items.push({ id: n.locations[0], label: `${prefix}${n.label}`.slice(0, 80), title: n.locations[0] })
        }
    }
    walk(tree, '')
    if (!items.length) { error.value = 'No favorite folders yet.'; return }
    const id = await ui.menu(favBtn.value, items, { label: 'Favorites' })
    if (id) { typed.value = id; go(id) }
}

let releaseKeys: (() => void) | null = null
let sizeObs: ResizeObserver | null = null
onMounted(() => {
    const el = termEl.value
    if (!el) return
    con.attach(el)
    releaseKeys = con.captureKeys(el)
    sizeObs = new ResizeObserver(() => { width.value = el.parentElement?.clientWidth ?? width.value })
    if (el.parentElement) sizeObs.observe(el.parentElement)
})
onBeforeUnmount(() => {
    releaseKeys?.()
    sizeObs?.disconnect()
    if (termEl.value) con.detach(termEl.value)
})

defineExpose({ focus: () => con.focus() })
</script>
