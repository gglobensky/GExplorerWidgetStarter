<!-- widgets/console/Widget.vue -->
<!--
    GEM CONSOLE: where the consoles show depends on the place.
      grid      the consoles (ConsoleView), as a PANE of the hub (role 'navigable'): GEM Shell's path bar, Back / Forward /
                Up and Favorites move the active console (applyExternalCwd); its `cd`s move the pane (sdk.navigate).
      sidebar   the consoles with their own path field and favorites.
      toolbar   a button; a click grows it into the consoles (a console popover: GEM Shell keeps its clicks and Escape
                for it), with a path field. Folding it leaves them running.
    "Open console here" (entry.ts actions) moves the active console; with none open, the next one starts there.
    0.3.0: the action is one row per shell on other widgets' menus ("GEM Console ▸ Open in Git Bash": GEM Shell's
    ui.setActionChoices); choosing one moves a console of that shell there, or starts one there (the menu click is the
    click a console needs to start).
-->
<template>
    <div ref="rootEl" class="gc-widget" :class="'p-' + context" :style="boxStyle">
        <template v-if="context === 'toolbar'">
            <button ref="toolBtn" class="gc-toolbtn" type="button" :class="{ open: popOpen, busy: anyBusy }"
                    :title="toolTip" aria-label="GEM Console" :aria-expanded="popOpen" @click="togglePopover">
                <span class="gc-prompt">&gt;_</span>
                <span v-if="anyBusy" class="gc-busy" aria-hidden="true"></span>
            </button>
        </template>
        <ConsoleView v-else ref="view" :con="con" :mode="context === 'grid' ? 'grid' : 'sidebar'" :saved-shell="savedShell"
                     @shell="saveShell" />
    </div>
</template>

<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import './console.css'
import { ref, computed, inject, onMounted, onBeforeUnmount, markRaw, watch, nextTick } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import ConsoleView from './ConsoleView.vue'
import ToolbarPanel from './ToolbarPanel.vue'
import { createConsoles, isFolderPath, samePath } from './consoles'
import { termColors } from './termTheme'

const props = defineProps<{
    sourceId: string
    config?: Record<string, any>
    placement?: { context?: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'window' | 'dialog'; size?: any }
}>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const context = computed<'grid' | 'sidebar' | 'toolbar'>(() => {
    const c = props.placement?.context
    return c === 'toolbar' ? 'toolbar' : c === 'grid' ? 'grid' : 'sidebar'
})
const view = ref<{ focus(): void } | null>(null)
const toolBtn = ref<HTMLElement | null>(null)
const savedShell = computed<string | undefined>(() => {
    const s = props.config?.view?.shell
    return typeof s === 'string' ? s : undefined
})

// The terminal's colours: the widget's own CSS variables (console.css), resolved by a probe in its box
// (0.2.0: in termTheme.ts, shared with the terminal part)
const rootEl = ref<HTMLElement | null>(null)
const themeColors = () => termColors(rootEl.value)

// In a hub's grid the console is a pane: its moves are the pane's (no click needed for its own pane, one folder).
// Elsewhere the pane isn't ours: nothing is reported.
function report(folder: string, how: { replace: boolean }) {
    if (context.value !== 'grid' || !isFolderPath(folder)) return
    void sdk.navigate?.(folder, { replace: how.replace })
}

const con = markRaw(createConsoles(sdk, {
    onFolder: report,
    notify: text => { void ui.snack({ id: 'gem-console', text, dedupe: 'replace', timeoutMs: 5000 }) },
    theme: themeColors,
    key: props.sourceId,
    // 0.1.6: a link Ctrl+clicked in the output: GEM Shell asks before opening it (the click is the gesture)
    openLink: url => { void sdk.openUrl?.(url) },
    // 0.1.10: the terminal's text follows GEM Shell's Text size
    textScale: () => Number(props.placement?.size?.textScale) || 1,
}))
watch(() => props.placement?.size?.textScale, () => con.applyTextScale())

// The sidebar sizes its place from the content: the console takes the height GEM Shell measured for the place (the
// user's choice, within entry.ts minHeight / maxHeight), never less than SIDEBAR_MIN (else only the path field showed).
// 0.1.2: as min-height too: GEM Shell's host makes its child `flex: 1` in a column of no fixed height, where a flex
// item's `height` is ignored (its basis is its content: the terminal is absolutely placed, so none), but not its
// min-height.
const SIDEBAR_MIN = 220
const boxStyle = computed(() => {
    if (context.value !== 'sidebar') return undefined
    const h = Number(props.placement?.size?.height)
    const px = `${Math.max(SIDEBAR_MIN, Number.isFinite(h) ? Math.round(h) : 0)}px`
    return { height: px, minHeight: px }
})

const anyBusy = computed(() => con.tabs.value.some(t => t.busy && !t.ended))
const toolTip = computed(() => {
    const n = con.tabs.value.length
    if (!n) return 'GEM Console'
    const busy = con.tabs.value.filter(t => t.busy && !t.ended).length
    return `GEM Console: ${n} console${n > 1 ? 's' : ''}${busy ? `, ${busy} running a command` : ''}`
})

function saveShell(id: string) {
    if (id && id !== savedShell.value) void sdk.setView?.({ shell: id })
}

// ── The pane (a hub's grid): GEM Shell moves it ─────────────────────────────
// Where the pane was before the consoles were known (it says so as the widget mounts)
let early: string | null = null
let ready = false

function applyExternalCwd(locator: string) {
    if (!ready) { early = locator; return }
    const t = con.active.value
    if (!isFolderPath(locator)) {
        // A page or a hub: the console stays, and the pane says where it is
        if (t?.cwd) report(t.cwd, { replace: true })
        return
    }
    if (!t || t.ended) { con.st.startIn = locator; return }
    if (samePath(locator, t.cwd)) return
    void con.moveTo(locator)
}

function getNavState() {
    return { cwd: con.active.value?.cwd || null }
}

// ── "Open console here" (other widgets' folder menus) ───────────────────────
// 0.3.0: one row per shell (GEM Shell keeps them for the menus, also while GEM Console isn't on screen)
watch(() => con.st.shells, shells => {
    if (!shells.length) return
    ui.setActionChoices?.('open-here', shells.map(s => ({ id: s.id, label: `Open in ${s.label}`, icon: '>_' })))
}, { deep: true })

const say = (text: string, ms = 5000) => void ui.snack({ id: 'gem-console', text, dedupe: 'replace', timeoutMs: ms })
/** 0.3.1 (Guillaume): in the toolbar, the console grows out of its button to show what was done (it said to click it). */
async function showConsole() {
    if (context.value !== 'toolbar' || popOpen.value) return
    await nextTick()   // a folded toolbar was unfolded for the action (GEM Shell): its button may be new
    if (!popOpen.value) togglePopover()
}

/**
 * 0.3.0: a shell chosen (payload.choiceId) or not (an older menu): a console of that shell (the active one first)
 * moves there; none of that shell: one starts there, at once (the menu click lent by GEM Shell is the gesture it
 * needs; a console that can't start yet leaves Start pointing there, as before).
 */
async function onWidgetAction(msg: any) {
    if (msg?.topic !== 'widget:action' || msg.payload?.actionId !== 'open-here') return
    const args = msg.payload?.args ?? {}
    const paths: string[] = Array.isArray(args.paths) ? args.paths : String(msg.payload?.tokens?.path ?? '').split('\n').filter(Boolean)
    const folder = paths.find(isFolderPath)
    if (!folder) return
    await initDone   // brought on screen for it: the shells and the live consoles first
    const wanted = typeof msg.payload?.choiceId === 'string' && con.st.shells.some(s => s.id === msg.payload.choiceId) ? msg.payload.choiceId as string : null
    const live = con.tabs.value.filter(t => t.kind === 'shell' && !t.ended)
    const a = con.active.value
    const target = wanted
        ? (a && a.kind === 'shell' && !a.ended && a.shell === wanted ? a : [...live].reverse().find(t => t.shell === wanted) ?? null)
        : (a && a.kind === 'shell' && !a.ended ? a : live[live.length - 1] ?? null)
    if (target) {
        if (target.key !== con.st.active) con.select(target.key)
        await con.moveTo(folder)
        await showConsole()   // 0.3.1: a move waiting for a command to end shows as such in it
        return
    }
    // permission not given yet: no shells listed; the usual one (GEM Shell asks first, as Start does)
    const shell = wanted ?? con.defaultShell(savedShell.value) ?? (con.st.state === 'declined' ? (savedShell.value || 'powershell') : null)
    const err = await con.open(shell, folder)
    if (err) {
        // Not started (no click to start it with any more, the permission declined…): Start points there
        con.st.startIn = folder
        say(err, 6000)
        await showConsole()   // 0.3.1: its Start, pointing there
        return
    }
    await showConsole()
}

// ── The toolbar: a console popover growing out of the button ────────────────
const popOpen = ref(false)
let pop: { close(): void } | null = null

function togglePopover() {
    if (pop) { pop.close(); return }
    const anchor = toolBtn.value
    if (!anchor) return
    const h = ui.openPopover({
        anchor,
        component: ToolbarPanel,
        props: { con, savedShell: savedShell.value, onShell: saveShell },
        placement: 'below',
        maxWidth: 640,
        maxHeight: 440,
        // GEM Shell 2026-11-06: a console lives in it (its clicks count, Escape in it is the console's)
        console: true,
        style: { padding: 0, radius: 8 },
        onClose: () => { pop = null; popOpen.value = false },
    })
    if (!h) return
    pop = h
    popOpen.value = true
}

let initDoneResolve: () => void = () => { }
const initDone = new Promise<void>(r => { initDoneResolve = r })

onMounted(async () => {
    try { await con.init() } finally { initDoneResolve() }
    ready = true
    const t = con.active.value
    if (early !== null) {
        const where = early
        early = null
        // Live consoles: the pane follows them; none: the next one starts where the pane is
        if (t) { if (t.cwd) report(t.cwd, { replace: true }) }
        else if (isFolderPath(where)) con.st.startIn = where
    }
})

onBeforeUnmount(() => {
    pop?.close()
    con.dispose()
})

defineExpose({ applyExternalCwd, getNavState, onWidgetAction })
</script>
