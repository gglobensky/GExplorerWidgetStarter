<!-- widgets/forge/CodeEditor.vue -->
<!--
    GEM FORGE 0.1: the editor (CodeMirror 6, bundled into GEM Forge as xterm is in GEM Console). One EditorView; each
    open file keeps its own EditorState (its undo history, its selection, its scroll), swapped in when its tab is
    chosen. TypeScript / JavaScript, Vue, CSS, JSON; the last build's problems drawn on the lines; a problem clicked
    elsewhere (project.state.reveal) brings its line into view.
    Keys: GEM Shell hides shortcut combos from widget code, so undo, find, comment... come as commands (commands.ts)
    and run here (exec). Typing, arrows, Tab, Enter, copy and paste reach the editor as usual.
-->
<template>
    <div class="gf-code">
        <div class="gf-tabs">
            <button v-for="p in s.openTabs" :key="p" type="button" class="gf-tab" :class="{ on: p === s.active }"
                    :title="p" @click="project.open(p)" @auxclick.middle="project.closeTab(p)">
                <span>{{ p.split('/').pop() }}</span>
                <span v-if="project.isDirty(p)" class="gf-dirty">●</span>
                <span class="gf-x" title="Close" @click.stop="project.closeTab(p)">×</span>
            </button>
        </div>
        <div v-if="s.active && s.conflicts.includes(s.active)" class="gf-conflict">
            <span>{{ s.active }} changed on disk while you edited it here.</span>
            <button type="button" @click="project.keepMine(s.active)">Keep mine</button>
            <button type="button" @click="project.takeDisk(s.active)">Take the disk's</button>
        </div>
        <div v-show="activeIsText" ref="host" class="gf-cm" />
        <div v-if="s.active && !activeIsText" class="gf-empty">{{ s.active }}: a picture or a font (not edited here).</div>
        <div v-if="!s.active" class="gf-empty">Open a file from the Explorer.</div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars, rectangularSelection } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab, undo, redo, selectAll, toggleComment, moveLineUp, moveLineDown, copyLineDown } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { search, searchKeymap, openSearchPanel, findNext, findPrevious, selectNextOccurrence, gotoLine, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, closeBrackets, completionKeymap, closeBracketsKeymap, startCompletion } from '@codemirror/autocomplete'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { javascript } from '@codemirror/lang-javascript'
import { vue } from '@codemirror/lang-vue'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import type { Project } from './project'

const props = defineProps<{ project: Project }>()
const s = props.project.state
const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null
// Each file's state lives in the project (0.1b): the editor remounts (a tab switch, a tile moved) and finds them
const states = props.project.editorStates as Map<string, EditorState>
let shown = ''
let applying = false
const theme = new Compartment()

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
    const st = EditorState.create({
        doc,
        ...(typeof at === 'number' ? { selection: { anchor: Math.min(Math.max(0, at), doc.length) } } : {}),
        extensions: [
            lineNumbers(), highlightActiveLineGutter(), foldGutter(), highlightSpecialChars(), history(), drawSelection(),
            EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(darkHighlight),
            bracketMatching(), closeBrackets(), autocompletion(), rectangularSelection(), highlightActiveLine(),
            highlightSelectionMatches(), search({ top: true }), lintGutter(),
            keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
            EditorState.tabSize.of(4),
            language(path),
            theme.of(darkTheme),
            EditorView.updateListener.of(u => {
                if (u.docChanged && !applying && shown === path) props.project.setText(path, u.state.doc.toString())
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
    markProblems()
}

// The last build's problems, set on the file shown (they follow its edits until the next build)
function markProblems() {
    if (!view || !shown) return
    view.dispatch(setDiagnostics(view.state, diagnostics(shown, view)))
}

// The text changed outside the editor (the disk, Take the disk's): the editor follows, keeping its history
function syncFromProject(path: string) {
    const f = props.project.file(path)
    if (!f) return
    const st = path === shown && view ? view.state : states.get(path)
    if (!st || st.doc.toString() === f.text) return
    if (path === shown && view) {
        applying = true
        try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: f.text } }) } finally { applying = false }
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
    }
    const fn = run[id]
    if (!fn) return false
    fn(v)
    v.focus()
    return true
}
defineExpose({ exec })

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
})
onBeforeUnmount(() => {
    // The file shown keeps its state (undo, selection) for the next mount
    if (view && shown && activeIsText.value) states.set(shown, view.state)
    props.project.clearEditor(api)
    view?.destroy()
    view = null
})

watch(() => s.active, p => show(p))
// A new project (the project cleared its states): the editor starts over
watch(() => s.id + '\u0000' + s.folder, () => { shown = ''; show(s.active) })
// Text changed by the project (disk, conflict): follow
watch(() => s.files.map(f => f.text.length + ':' + f.saved.length + ':' + f.path).join('|'), () => {
    for (const f of s.files) if (f.base64 === undefined) syncFromProject(f.path)
})
// New problems: redrawn
watch(() => [s.errors, s.warnings], () => markProblems())
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
