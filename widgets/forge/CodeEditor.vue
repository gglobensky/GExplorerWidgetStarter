<!-- widgets/forge/CodeEditor.vue -->
<!--
    GEM FORGE 0.1: the editor (CodeMirror 6, bundled into GEM Forge as xterm is in GEM Console). One EditorView; each
    open file keeps its own EditorState (its undo history, its selection, its scroll), swapped in when its tab is
    chosen. TypeScript / JavaScript, Vue, CSS, JSON; the last build's problems drawn on the lines; a problem clicked
    elsewhere (project.state.reveal) brings its line into view.
    Keys: GEM Shell hides shortcut combos from widget code, so undo, find, comment... come as commands (commands.ts)
    and run here (exec). Typing, arrows, Tab, Enter, copy and paste reach the editor as usual.
    0.1.8, TABS: pinned ones first (📌, no ×); dragged to reorder (GEM Shell's sortable, as its own tabs); a right-click:
    Close, Close others, Close to the right, Close saved, Pin, Copy path, Copy relative path, Show in folder (GEM
    Shell's explorer), Show in the Explorer, Tab rows 1–3; a middle-click closes; the tabs that don't fit: ▾.
    The editor's right-click: Cut, Copy, Paste, Select all, Indent, Unindent, Toggle comment, Duplicate line, Move
    line up / down, Go to line…, Find, Replace.
-->
<template>
    <div class="gf-code">
        <div v-if="!single && s.openTabs.length" class="gf-tabbar">
            <div ref="tabsEl" class="gf-tabs" :style="{ maxHeight: `${s.tabRows * TAB_H}px` }">
                <button v-for="(p, i) in displayList" :key="p" type="button" class="gf-tab"
                        :class="{ on: p === s.active, pinned: s.pinned.includes(p), dragging: draggingId === p }"
                        :data-tab="p" :title="p"
                        @pointerdown="onTabDown(i, $event)" @click="project.open(p)"
                        @mousedown.middle.prevent @auxclick.middle.prevent="!s.pinned.includes(p) && project.closeTab(p)" @contextmenu.prevent="tabMenu($event, p)">
                    <span v-if="s.pinned.includes(p)" class="gf-pin" title="Pinned">📌</span>
                    <span>{{ p.split('/').pop() }}</span>
                    <span v-if="project.isDirty(p)" class="gf-dirty">●</span>
                    <span v-if="!s.pinned.includes(p)" class="gf-x" title="Close" @pointerdown.stop @click.stop="project.closeTab(p)">×</span>
                </button>
            </div>
            <button v-if="hidden.length" ref="moreBtn" type="button" class="gf-ib gf-tabs-more"
                    :class="{ on: hidden.includes(s.active) }" :title="`${hidden.length} more tab${hidden.length === 1 ? '' : 's'}`" @click="moreMenu">▾ {{ hidden.length }}</button>
        </div>
        <div v-if="s.active && s.conflicts.includes(s.active)" class="gf-conflict">
            <span>{{ s.active }} changed on disk while you edited it here.</span>
            <button type="button" @click="project.keepMine(s.active)">Keep mine</button>
            <button type="button" @click="project.takeDisk(s.active)">Take the disk's</button>
        </div>
        <div v-show="activeIsText" ref="host" class="gf-cm" @contextmenu="editorMenu" />
        <!-- 0.2.9: TypeScript busy with the packages' types (the page may pause a moment while it checks) -->
        <div v-if="s.typesNote && activeIsText" class="gf-ts-busy" role="status"><span class="gf-spin" />{{ s.typesNote }}</div>
        <div v-if="s.active && !activeIsText" class="gf-empty">{{ s.active }}: a picture or a font (not edited here).</div>
        <div v-if="!s.active" class="gf-empty">Open a file from the Explorer.</div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSortable } from 'gexplorer/widgets'
import type { WidgetSdk } from 'gexplorer/widgets'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars, rectangularSelection, tooltips } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab, undo, redo, selectAll, toggleComment, moveLineUp, moveLineDown, copyLineDown, indentMore, indentLess } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { search, searchKeymap, openSearchPanel, findNext, findPrevious, selectNextOccurrence, gotoLine, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, closeBrackets, completionKeymap, closeBracketsKeymap, startCompletion, acceptCompletion } from '@codemirror/autocomplete'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { javascript } from '@codemirror/lang-javascript'
import { vue } from '@codemirror/lang-vue'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import type { Project } from './project'
import { languageFor, TS_FILE } from './lang'
import { prettyFor, prettierDone, minimalChange, SUPPORTED } from './pretty'

// single (0.1d, the playground): one file, no tabs
const props = defineProps<{ project: Project; single?: boolean }>()
const s = props.project.state
const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null
// Each file's state lives in the project (0.1b): the editor remounts (a tab switch, a tile moved) and finds them
const states = props.project.editorStates as Map<string, EditorState>
let shown = ''
let applying = false
const theme = new Compartment()
// 0.2.1: TypeScript (lang.ts): completions, hovers, problems as you type, go to definition
const lang = languageFor(props.project)
const pretty = prettyFor(props.project)
let typeDiags: Diagnostic[] = []
let typeTimer = 0
let typeSeq = 0

const activeIsText = computed(() => {
    const f = props.project.file(s.active)
    return !!f && f.base64 === undefined
})

function language(path: string): Extension {
    if (path.endsWith('.vue')) return vue()
    if (/\.(ts|mts)$/.test(path)) return javascript({ typescript: true })
    if (/\.(js|mjs)$/.test(path)) return javascript()
    if (path.endsWith('.css')) return css()
    if (path.endsWith('.json')) return json()
    return []
}

// The last build's problems on this file's lines
function diagnostics(path: string, v: EditorView): Diagnostic[] {
    const doc = v.state.doc
    const at = (line: number, column: number) => {
        const l = doc.line(Math.min(Math.max(1, line), doc.lines))
        return Math.min(l.from + Math.max(0, column - 1), l.to)
    }
    const out: Diagnostic[] = []
    for (const [list, severity] of [[s.errors, 'error'], [s.warnings, 'warning']] as const) {
        for (const p of list) {
            // 0.2.13: not a problem of a file edited since that run (Problems hides it too)
            if (props.project.isStale(p)) continue
            if (p.file !== path) continue
            const from = at(p.line, p.column)
            const line = doc.lineAt(from)
            out.push({ from, to: Math.min(line.to, Math.max(from + 1, line.to)), severity, message: p.text })
        }
    }
    return out
}

function stateFor(path: string): EditorState {
    const had = states.get(path)
    if (had) return had
    const f = props.project.file(path)
    // A cursor kept while GEM Forge was away (restore)
    const at = props.project.cursors.get(path)
    const doc = f?.text ?? ''
    // .ts / .js / .vue: TypeScript's completions (its source falls back to the language's own without TypeScript)
    const typed = TS_FILE.test(path)
    const st = EditorState.create({
        doc,
        ...(typeof at === 'number' ? { selection: { anchor: Math.min(Math.max(0, at), doc.length) } } : {}),
        extensions: [
            lineNumbers(), highlightActiveLineGutter(), foldGutter(), highlightSpecialChars(), history(), drawSelection(),
            EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(darkHighlight),
            bracketMatching(), closeBrackets(), rectangularSelection(), highlightActiveLine(),
            // 0.2.1: TypeScript's completions in .ts / .js / a .vue file's scripts (the template keeps Vue's own)
            autocompletion(typed ? { override: [lang.completionSource(path)] } : {}),
            ...(typed ? [lang.hover(path), ...lang.signatureHelp(path)] : []),
            // Ctrl+click: go to definition (VS Code's way; Alt+click adds a cursor)
            EditorView.clickAddsSelectionRange.of(e => e.altKey),
            // 0.2.3: tooltips (a problem's, a hover's) fit in the editor's own box: on line 1 they open below, not
            // under the tab bar (CodeMirror measured the window, the part clips them)
            tooltips({ tooltipSpace: v => v.scrollDOM.getBoundingClientRect() }),
            EditorView.domEventHandlers({
                mousedown(e, v) {
                    if (!typed || !(e.ctrlKey || e.metaKey) || e.button !== 0) return false
                    const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
                    if (pos == null) return false
                    e.preventDefault()
                    void lang.goToDefinition(path, v.state.doc.toString(), pos)
                    return true
                },
            }),
            highlightSelectionMatches(), search({ top: true }), lintGutter(),
            keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap,
                // 0.2.2: Tab takes the completion selected (else it indents)
                { key: 'Tab', run: acceptCompletion }, indentWithTab]),
            EditorState.tabSize.of(4),
            language(path),
            theme.of(darkTheme),
            EditorView.updateListener.of(u => {
                if (u.docChanged && !applying && shown === path) props.project.setText(path, u.state.doc.toString())
                if (u.docChanged && shown === path) {
                    // 0.2.7: TypeScript's last problems follow the edit until they're computed again (they were put
                    // back as they were when the build's problems redrew: a line above removed, an underline 4 lines off)
                    if (typeDiags.length) typeDiags = typeDiags.map(d => ({ ...d, from: u.changes.mapPos(d.from, 1), to: u.changes.mapPos(d.to, -1) })).filter(d => d.to >= d.from)
                    scheduleTypes()
                }
            }),
        ],
    })
    states.set(path, st)
    return st
}

function show(path: string) {
    if (!view) return
    if (shown && shown !== path && states.has(shown)) states.set(shown, view.state)
    shown = path
    if (!path || !activeIsText.value) return
    view.setState(stateFor(path))
    typeDiags = []
    markProblems()
    scheduleTypes(0)
}

// 0.2.3: another file changed (package.json after Packages ▸ Add, a file the shown one imports): checked again
watch(() => s.files.map(f => (f.path === shown ? '' : `${f.path}:${f.text.length}:${f.text.slice(-32)}`)).join('|'), () => scheduleTypes(300))
// 0.2.2: TypeScript just became ready (it loads a few seconds the first time): the file shown is checked now
watch(() => s.types, v => { if (v === 'ready') scheduleTypes(0) })
// 0.2.8: the packages' types arrived: checked again
watch(() => s.typesRev, () => scheduleTypes(0))
// …and a project opened later loads it too
watch(() => s.id + '\u0000' + s.folder, () => { if (s.files.some(f => TS_FILE.test(f.path))) void lang.service() })

/** 0.2.2: TypeScript's formatting of <path>: in the editor when shown (undo, cursor kept), else on its text. */
/** 0.2.12: or Prettier's (the formatter chosen: the editor's right-click). */
const formats = (path: string) => (s.formatter === 'prettier' ? SUPPORTED.test(path) && pretty.available() : TS_FILE.test(path) && lang.on)
async function formatFile(path: string, say: boolean) {
    const f = props.project.file(path)
    if (!f || f.base64 !== undefined) return
    const live = path === shown && view ? view : null
    const text = live ? live.state.doc.toString() : f.text
    if (s.formatter === 'prettier') {
        if (!pretty.available()) { if (say) props.project.say('Prettier needs GEM Shell 2026-11-08 or later.', false); return }
        const r = await pretty.format(path, text)
        if (!r) { if (say) props.project.say(`Prettier doesn't format ${path}.`, false); return }
        if ('error' in r) {
            if (say) props.project.say(`${path}: not formatted: ${r.error}${r.line ? ` (line ${r.line})` : ''}`, false)
            else props.project.log('warn', `${path}: not formatted by Prettier: ${r.error}${r.line ? ` (line ${r.line})` : ''}`)
            return
        }
        const change = minimalChange(text, r.text)
        if (change && live && view === live && live.state.doc.toString() === text) {
            live.dispatch({ changes: change, userEvent: 'input.format' })
        } else if (change && props.project.file(path)?.text === text) {
            props.project.setText(path, r.text)
            s.textRev++
        } else if (change) return
        prettierDone(props.project, path)
        if (say) props.project.say(change ? `${path} formatted (Prettier).` : `${path}: already formatted.`)
        return
    }
    if (!TS_FILE.test(path)) return
    const edits = await lang.format(path, text)
    if (!edits) { if (say) props.project.say('Formatting needs TypeScript (GEM Shell 2026-11-08 or later).', false); return }
    if (!edits.length) { if (say) props.project.say(`${path}: already formatted.`); return }
    if (live && view === live && live.state.doc.toString() === text) {
        live.dispatch({ changes: edits.map(e => ({ from: e.from, to: e.to, insert: e.text })), userEvent: 'input.format' })
    } else if (props.project.file(path)?.text === text) {
        // Not shown: the edits on its text, last to first (two at one place keep their order)
        let out = text
        for (let i = edits.length - 1; i >= 0; i--) out = out.slice(0, edits[i].from) + edits[i].text + out.slice(edits[i].to)
        props.project.setText(path, out)
        s.textRev++
    }
    if (say) props.project.say(`${path} formatted.`)
}

// 0.2.1: TypeScript's problems in the file shown, a moment after typing stops
function scheduleTypes(ms = 500) {
    window.clearTimeout(typeTimer)
    const seq = ++typeSeq
    if (!view || !shown || !TS_FILE.test(shown) || !lang.on) {
        if (typeDiags.length) { typeDiags = []; markProblems() }
        return
    }
    const path = shown
    typeTimer = window.setTimeout(async () => {
        if (!view || shown !== path) return
        // 0.2.9: a frame first (a note just shown is drawn before TypeScript takes the page's thread)
        await new Promise<void>(res => requestAnimationFrame(() => window.setTimeout(res, 0)))
        if (seq !== typeSeq || !view || shown !== path) return
        const text = view.state.doc.toString()
        const diags = await lang.problems(path, text)
        // Computed for another text (an edit meanwhile): the next check has it; null: not checked yet
        if (diags === null || seq !== typeSeq || !view || shown !== path || view.state.doc.toString() !== text) return
        typeDiags = diags
        markProblems()
    }, ms)
}

// The last build's problems, set on the file shown (they follow its edits until the next build)
function markProblems() {
    if (!view || !shown) return
    const len = view.state.doc.length
    view.dispatch(setDiagnostics(view.state, [...diagnostics(shown, view), ...typeDiags.filter(d => d.to <= len)]))
}

// The text changed outside the editor (the disk, Take the disk's): the editor follows, keeping its history
function syncFromProject(path: string) {
    const f = props.project.file(path)
    if (!f) return
    const st = path === shown && view ? view.state : states.get(path)
    if (!st || st.doc.toString() === f.text) return
    if (path === shown && view) {
        // 0.2.6: only what changed (the common start and end kept): the cursor stays where it was
        const old = view.state.doc.toString(), next = f.text
        let a = 0
        while (a < old.length && a < next.length && old.charCodeAt(a) === next.charCodeAt(a)) a++
        let b = 0
        while (b < old.length - a && b < next.length - a && old.charCodeAt(old.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++
        applying = true
        try { view.dispatch({ changes: { from: a, to: old.length - b, insert: next.slice(a, next.length - b) } }) } finally { applying = false }
    } else {
        states.delete(path)      // made again from the project's text when shown
    }
}

// Colours for a dark background (CodeMirror's default style is made for a light one)
const darkHighlight = HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: '#c792ea' },
    { tag: [t.string, t.special(t.string), t.regexp], color: '#c3e88d' },
    { tag: [t.number, t.bool, t.null, t.atom], color: '#f78c6c' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#7f8a99', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#82aaff' },
    { tag: [t.typeName, t.className, t.namespace], color: '#ffcb6b' },
    { tag: [t.propertyName, t.attributeName], color: '#89ddff' },
    { tag: [t.tagName, t.angleBracket], color: '#f07178' },
    { tag: [t.definition(t.variableName)], color: '#eeffff' },
    { tag: [t.variableName], color: '#e6e6e6' },
    { tag: [t.punctuation, t.separator, t.bracket], color: '#a6accd' },
    { tag: t.invalid, color: '#ff5370' },
])

const darkTheme = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent', color: 'var(--fg, #e6e6e6)' },
    '.cm-scroller': { fontFamily: 'var(--gex-font-mono, "Cascadia Mono", Consolas, monospace)', lineHeight: '1.5' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'color-mix(in oklab, currentColor 40%, transparent)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, currentColor 6%, transparent)' },
    '.cm-cursor': { borderLeftColor: 'var(--accent, #5aa9d6)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in oklab, var(--accent, #5aa9d6) 35%, transparent)' },
    '.cm-panels': { backgroundColor: 'var(--surface-2, #26262b)', color: 'inherit' },
    '.cm-tooltip': { backgroundColor: 'var(--surface-2, #26262b)', border: '1px solid var(--border, rgba(255,255,255,.14))' },
}, { dark: true })

/** A command (commands.ts) on the editor; false: not the editor's. */
function exec(id: string): boolean {
    const v = view
    if (!v || !activeIsText.value) return false
    const run: Record<string, (view: EditorView) => boolean> = {
        undo, redo, 'select-all': selectAll, comment: toggleComment, 'line-up': moveLineUp, 'line-down': moveLineDown,
        'duplicate-line': copyLineDown, find: openSearchPanel, replace: openSearchPanel, 'find-next': findNext,
        'find-prev': findPrevious, 'select-next': selectNextOccurrence, 'go-to-line': gotoLine, autocomplete: startCompletion,
        'indent-more': indentMore, 'indent-less': indentLess,
        'format-document': () => {
            if (!formats(shown)) return false
            void formatFile(shown, true)
            return true
        },
        // 0.2.6: TypeScript's rename and references
        'rename-symbol': (ed: EditorView) => {
            if (!TS_FILE.test(shown)) return false
            void lang.renameSymbol(shown, ed.state.doc.toString(), ed.state.selection.main.head)
            return true
        },
        'find-references': (ed: EditorView) => {
            if (!TS_FILE.test(shown)) return false
            void lang.findReferences(shown, ed.state.doc.toString(), ed.state.selection.main.head, ed.dom)
            return true
        },
        'go-to-definition': (ed: EditorView) => {
            if (!TS_FILE.test(shown)) return false
            void lang.goToDefinition(shown, ed.state.doc.toString(), ed.state.selection.main.head)
            return true
        },
    }
    const fn = run[id]
    if (!fn) return false
    fn(v)
    v.focus()
    return true
}
defineExpose({ exec })

// ── Tabs (0.1.8) ─────────────────────────────────────────────────────────────────────────────────────────────────
const sdk = inject<WidgetSdk>('widgetSdk')!
const TAB_H = 29
const tabsEl = ref<HTMLElement | null>(null)
const moreBtn = ref<HTMLElement | null>(null)
const ordered = computed(() => props.project.orderedTabs())
// Dragged to reorder: GEM Shell's sortable (its own tabs' engine); a press under the threshold stays a click
const { displayList, draggingId, startDrag } = useSortable(ordered, {
    identity: (p: string) => p,
    orientation: 'horizontal',
    dragThresholdPx: 6,
    container: tabsEl,
    rowSelector: '[data-tab]',
    rowIdAttr: 'data-tab',
    onCommit: (order: string[]) => props.project.reorderTabs(order),
})
function onTabDown(i: number, e: PointerEvent) {
    if (e.button === 0) startDrag(i, e)
}

// The tabs that don't fit in the rows shown: ▾ lists them
const hidden = ref<string[]>([])
function measure() {
    const el = tabsEl.value
    if (!el) { hidden.value = []; return }
    const limit = el.clientHeight + 1
    hidden.value = [...el.querySelectorAll<HTMLElement>('[data-tab]')]
        .filter(b => b.offsetTop + b.offsetHeight > limit)
        .map(b => b.dataset.tab ?? '')
}
let tabsObs: ResizeObserver | null = null
watch(tabsEl, (el, old) => {
    if (old) tabsObs?.unobserve(old)
    if (el) { tabsObs ??= new ResizeObserver(() => measure()); tabsObs.observe(el) }
})
watch(() => [displayList.value.join('|'), s.tabRows, s.active], async () => { await nextTick(); measure() })
// The active tab out of sight: it comes first among the unpinned ones, in view
watch(() => s.active, async a => {
    await nextTick()
    if (a && hidden.value.includes(a) && !s.pinned.includes(a)) {
        const rest = props.project.orderedTabs().filter(p => p !== a && !s.pinned.includes(p))
        props.project.reorderTabs([...s.pinned.filter(p => s.openTabs.includes(p)), a, ...rest])
    }
})

async function moreMenu() {
    if (!moreBtn.value) return
    const id = await sdk.ui?.().menu(moreBtn.value, hidden.value.map(p => ({ id: p, label: `${p === s.active ? '● ' : ''}${p}` })), { label: 'More tabs' })
    if (id) props.project.open(id)
}

async function copyText(text: string) {
    try { await sdk.clipboardSetText?.(text) } catch (err) { props.project.log('warn', `Not copied: ${String((err as Error)?.message ?? err)}`) }
}

async function tabMenu(e: MouseEvent, path: string) {
    const ui = sdk.ui?.()
    if (!ui) return
    const pr = props.project
    const pinned = s.pinned.includes(path)
    const full = pr.pathOf(path)
    const t = pr.orderedTabs()
    const items = [
        { id: 'close', label: 'Close', disabled: pinned, title: pinned ? 'Unpin it first' : undefined },
        { id: 'others', label: 'Close others', disabled: t.length < 2 },
        { id: 'right', label: 'Close to the right', disabled: t.indexOf(path) === t.length - 1 },
        { id: 'saved', label: 'Close saved' },
        { id: 'pin', label: pinned ? 'Unpin' : 'Pin' },
        { id: 'copy', label: 'Copy path', disabled: !full },
        { id: 'copy-rel', label: 'Copy relative path' },
        { id: 'folder', label: 'Show in folder', disabled: !full, title: 'In GEM Shell\'s explorer' },
        { id: 'explorer', label: 'Show in the Explorer' },
        ...[1, 2, 3].map(n => ({ id: `rows:${n}`, label: `${s.tabRows === n ? '✓ ' : ''}Tab rows: ${n}` })),
    ]
    const id = await ui.menu(e, items, { label: path.split('/').pop() })
    if (!id) return
    if (id === 'close') pr.closeTab(path)
    else if (id === 'others') pr.closeOthers(path)
    else if (id === 'right') pr.closeToTheRight(path)
    else if (id === 'saved') pr.closeSaved()
    else if (id === 'pin') pr.togglePin(path)
    else if (id === 'copy') await copyText(full)
    else if (id === 'copy-rel') await copyText(path)
    else if (id === 'folder') await sdk.reveal?.(full)
    else if (id === 'explorer') pr.revealInExplorer(path)
    else if (id.startsWith('rows:')) pr.setTabRows(Number(id.slice(5)))
}

// ── The editor's right-click (0.1.8) ────────────────────────────────────────────────────────────────────────────
async function editorMenu(e: MouseEvent) {
    const ui = sdk.ui?.()
    const v = view
    if (!ui || !v) return
    e.preventDefault()
    const sel = v.state.selection.main
    const empty = sel.empty
    const items = [
        ...(TS_FILE.test(shown) && lang.on ? [
            { id: 'go-to-definition', label: 'Go to definition' },
            { id: 'find-references', label: 'Find references' },
            { id: 'rename-symbol', label: 'Rename symbol…' },
        ] : []),
        // 0.2.12: Format document by the formatter chosen (TypeScript, or Prettier: CSS, Markdown, JSON… too)
        ...(formats(shown) ? [
            { id: 'format-document', label: `Format document (${s.formatter === 'prettier' ? 'Prettier' : 'TypeScript'})` },
            { id: 'format-on-save', label: `${s.formatOnSave ? '✓ ' : ''}Format on save` },
        ] : []),
        ...(pretty.available() && (SUPPORTED.test(shown)) ? [
            { id: 'use-prettier', label: `${s.formatter === 'prettier' ? '✓ ' : ''}Format with Prettier`, title: 'Prettier formats (Format document, Format on save) instead of TypeScript; .prettierrc is read' },
        ] : []),
        { id: 'cut', label: 'Cut', disabled: empty },
        { id: 'copy', label: 'Copy', disabled: empty },
        { id: 'paste', label: 'Paste' },
        { id: 'select-all', label: 'Select all' },
        { id: 'indent-more', label: 'Indent' },
        { id: 'indent-less', label: 'Unindent' },
        { id: 'comment', label: 'Toggle comment' },
        { id: 'duplicate-line', label: 'Duplicate line' },
        { id: 'line-up', label: 'Move line up' },
        { id: 'line-down', label: 'Move line down' },
        { id: 'go-to-line', label: 'Go to line…' },
        { id: 'find', label: 'Find' },
        { id: 'replace', label: 'Replace' },
    ]
    const id = await ui.menu(e, items, { label: 'Editor' })
    if (!id) return
    if (id === 'format-on-save') {
        s.formatOnSave = !s.formatOnSave
        props.project.say(!s.formatOnSave ? 'Format on save: off.' : s.formatter === 'prettier'
            ? 'Format on save: on (Prettier formats every file it knows: .ts, .js, .vue, .css, .md, .json…).'
            : 'Format on save: on (TypeScript formats .ts, .js and a .vue file\'s scripts).')
        return
    }
    if (id === 'use-prettier') {
        s.formatter = s.formatter === 'prettier' ? 'typescript' : 'prettier'
        props.project.say(s.formatter === 'prettier' ? 'Prettier formats now (Format document, Format on save).' : 'TypeScript formats now (Format document, Format on save).')
        return
    }
    if (id === 'cut' || id === 'copy') {
        const text = v.state.sliceDoc(sel.from, sel.to)
        await copyText(text)
        if (id === 'cut') v.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' }, userEvent: 'delete.cut' })
        v.focus()
        return
    }
    if (id === 'paste') {
        // The page may read the clipboard's text (the user's own click); else Ctrl+V
        let text: string | null = null
        try { text = await navigator.clipboard.readText() } catch { text = null }
        if (text === null) { props.project.say('Paste with Ctrl+V (the clipboard can\'t be read from here).', false); v.focus(); return }
        v.dispatch(v.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true })
        v.focus()
        return
    }
    exec(id)
}
onBeforeUnmount(() => tabsObs?.disconnect())

/** Each open file's cursor (for the snapshot while away). */
function cursors(): Record<string, number> {
    const out: Record<string, number> = {}
    if (view && shown) states.set(shown, view.state)
    for (const [p, st] of states) out[p] = st.selection.main.head
    return out
}
const api = { exec, cursors }

onMounted(() => {
    view = new EditorView({ parent: host.value! })
    show(s.active)
    props.project.setEditor(api)
    props.project.setFormatter(path => formatFile(path, false))
    // 0.2.2: TypeScript loads with the project (not at the first keystroke)
    if (s.files.some(f => TS_FILE.test(f.path))) void lang.service()
})
onBeforeUnmount(() => {
    // The file shown keeps its state (undo, selection) for the next mount
    if (view && shown && activeIsText.value) states.set(shown, view.state)
    props.project.clearEditor(api)
    props.project.setFormatter(null)
    view?.destroy()
    view = null
})

watch(() => s.active, p => show(p))
// A new project (the project cleared its states): the editor starts over
watch(() => s.id + '\u0000' + s.folder, () => { shown = ''; show(s.active) })
// Text changed by the project (disk, conflict): follow
watch(() => s.textRev + '#' + s.files.map(f => f.text.length + ':' + f.saved.length + ':' + f.path).join('|'), () => {
    for (const f of s.files) if (f.base64 === undefined) syncFromProject(f.path)
})
// New problems: redrawn
watch(() => [s.errors, s.warnings], () => markProblems())
// 0.2.13: …and once the file shown is edited after the run that found them (they go)
watch(() => [...s.errors, ...s.warnings].some(p => p.file === shown && props.project.isStale(p)), stale => { if (stale) markProblems() })
// A problem clicked: its line, in view, selected
watch(() => s.reveal?.seq, () => {
    const r = s.reveal
    if (!r || !view || r.path !== shown) return
    const doc = view.state.doc
    const line = doc.line(Math.min(Math.max(1, r.line), doc.lines))
    const pos = Math.min(line.from + Math.max(0, r.column - 1), line.to)
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    view.focus()
}, { flush: 'post' })
</script>
