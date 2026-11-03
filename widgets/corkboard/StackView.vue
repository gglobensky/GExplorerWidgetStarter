<!-- widgets/corkboard/StackView.vue -->
<!--
    AN OPEN STACK (0.1.0): the other stacks of the view shrunk to a strip (the dock: left, or along the top when
    narrow), the note as a sheet of paper, and divider tabs on its right edge to switch notes.
      Tabs: click to open; drag to reorder, onto a stack of the strip to move the note there, onto + to make it a
      stack of its own. Right-click a tab: its menu.
      The sheet: the note editor (editor.ts), its ink tools, and the key hints of where the caret is (the keys the
      user chose: sdk.keys()); each hint goes once used a few times.
      Esc: back to the board (or the group).
-->
<template>
    <div ref="rootEl" class="cb-focus" :class="{ compact }" @keydown="onKey">
        <nav v-if="!compact" class="cb-dock" aria-label="Stacks">
            <button class="cb-dk-back" type="button" :title="group ? 'Back to the group (Esc)' : 'Back to the board (Esc)'" aria-label="Back" @click="desk.closeStack()">▦</button>
            <button v-for="x in dockStacks" :key="x.id" class="cb-dicon" :class="['c-' + x.color, { on: x.id === stack.id }]" :data-id="x.id"
                    type="button" :title="x.name" :aria-label="`${x.name}, ${x.notes.length} notes`" :style="{ '--tilt': x.tilt + 'deg' }"
                    @click="desk.openStack(x.id)" @contextmenu.prevent="dockCtx($event, x)">
                {{ initials(x.name) }}<span class="cb-badge">{{ x.notes.length }}</span>
                <span v-if="x.flags.length" class="cb-flags"><span v-for="f in x.flags" :key="f" class="cb-flag" :style="{ '--fc': `var(--cb-fl-${f})` }"></span></span>
                <span v-if="x.due" class="cb-head p-red"></span>
            </button>
            <button class="cb-dk-add" type="button" title="New stack. Drop a tab here to move a note into a new stack." aria-label="New stack" @click="newStack">＋</button>
        </nav>

        <div class="cb-stage">
            <div class="cb-sheetwrap" :class="['c-' + stack.color, 'paper-' + stack.paper]">
                <section class="cb-sheet" aria-label="Note" @contextmenu="onSheetCtx">
                    <header class="cb-sh-head">
                        <span ref="nameEl" class="cb-sh-name" title="Double-click to rename" @dblclick="rename">{{ stack.name }}</span>
                        <span v-if="stack.numbered && note.num" class="cb-sh-num">#{{ note.num }}</span>
                        <span class="cb-sh-pos">{{ index + 1 }}/{{ stack.notes.length }}</span>
                        <button v-if="note.title" class="cb-sh-note" type="button" title="The note's title (on its tab): click to change it" @click="titleNote(note.id)">{{ note.title }}</button>
                        <span class="cb-chips">
                            <button v-for="f in stack.flags" :key="f" class="cb-chip" type="button" :style="{ '--fc': `var(--cb-fl-${f})` }" :title="FLAG_NAMES[f] + ': click for the stack’s options'" @click="panel"><span class="cb-fd"></span><span class="cb-cl">{{ FLAG_NAMES[f] }}</span></button>
                            <button v-if="due" class="cb-chip" :class="'s-' + due.state" type="button" :title="'Due ' + due.long + ': click for the stack’s options'" @click="panel"><span class="cb-head p-red"></span><span class="cb-cl">{{ due.short }}</span></button>
                        </span>
                        <span class="cb-sp"></span>
                        <button ref="panelBtn" class="cb-ib" type="button" title="Stack options" aria-label="Stack options" @click="panel">⋯</button>
                        <button class="cb-ib" type="button" title="Back (Esc)" aria-label="Back" @click="desk.closeStack()">✕</button>
                    </header>
                    <div class="cb-sh-body"><div ref="pageEl" class="cb-page"></div></div>
                    <footer class="cb-sh-foot">
                        <button class="cb-fb" type="button" v-gex-command="'sketch'" aria-label="Insert a drawing">✎<span class="cb-lbl">Sketch</span></button>
                        <button class="cb-fb" type="button" v-gex-command="'table'" aria-label="Insert a table">▦<span class="cb-lbl">Table</span></button>
                        <button v-if="hints.length" class="cb-hint" type="button" title="Every key and gesture: Keyboard shortcuts" @click="openKeys">
                            <span v-for="h in hints" :key="h.id"><kbd>{{ h.key }}</kbd> {{ h.text }}</span>
                        </button>
                        <span class="cb-sp"></span>
                        <div class="cb-tools" role="group" aria-label="Ink">
                            <button v-for="t in TOOLS" :key="t.id" class="cb-tool" type="button" :title="t.label" :aria-label="t.label" :aria-pressed="sh.tool.value === t.id" @click="sh.tool.value = t.id">
                                <span v-if="t.id === 'hl'" class="cb-hlbar"></span><span v-else-if="t.id === 'erase'">⌫</span><span v-else class="cb-dot" :style="{ '--c': `var(--cb-ink-${t.id})` }"></span>
                            </button>
                            <button class="cb-tool" type="button" v-gex-command="'ink-undo'" aria-label="Undo ink">↶</button>
                        </div>
                    </footer>
                </section>
                <nav ref="tabsEl" class="cb-tabs" :class="{ numbered: stack.numbered }" aria-label="Notes in this stack">
                    <button v-for="(id, i) in stack.notes" :key="id" class="cb-tab" :class="{ on: id === stack.active, lifting: tabDrag?.id === id, 'ins-before': tabDrag?.ins === i }"
                            type="button" :data-note="id" :title="titleOf(id) + ' (double-click: its title)'" @pointerdown="tabDown($event, id)" @dblclick="titleNote(id)" @contextmenu.prevent="tabCtx($event, id)">
                        <span class="cb-tn">{{ stack.numbered && notes[id]?.num ? '#' + notes[id].num : i + 1 }}</span>
                        <span class="cb-tl">{{ titleOf(id) }}</span>
                        <span v-if="doneOf(id)" class="cb-tk" aria-label="all done">✓</span>
                    </button>
                    <button class="cb-tab add" :class="{ 'ins-before': tabDrag?.ins === stack.notes.length }" type="button" v-gex-command="'new-note'" aria-label="New note" @contextmenu.prevent="newTitled">＋</button>
                </nav>
            </div>
        </div>
        <div v-if="tabDrag?.moved" class="cb-tab cb-ghost" :class="['c-' + stack.color, { nodrop: !tabDrag.drop }]" :style="{ left: tabDrag.x + 'px', top: tabDrag.y + 'px' }">{{ titleOf(tabDrag.id) }}</div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, onBeforeUnmount, nextTick, markRaw } from 'vue'
import { SHARED } from './shared'
import { NoteEditor } from './editor'
import StackPanel from './dialogs/StackPanel.vue'
import { FLAG_NAMES, dueInfo, initials, noteLabel, progress, parseText, NOTE_TITLE_MAX, type Block, type Stack } from './model'
import { TYPING_COMMANDS } from './commands'
import type { InkTool } from './ink'

const sh = inject(SHARED)!
const desk = sh.desk
const TOOLS: { id: InkTool; label: string }[] = [{ id: 'k', label: 'Ink' }, { id: 'b', label: 'Blue' }, { id: 'r', label: 'Red' }, { id: 'hl', label: 'Highlighter' }, { id: 'erase', label: 'Eraser (or drag with the right button)' }]

const rootEl = ref<HTMLElement | null>(null)
const pageEl = ref<HTMLElement | null>(null)
const nameEl = ref<HTMLElement | null>(null)
const panelBtn = ref<HTMLElement | null>(null)
const tabsEl = ref<HTMLElement | null>(null)

const stack = computed<Stack>(() => { void desk.tick.value; return desk.focused.value! })
const note = computed(() => { void desk.tick.value; return desk.activeNote(stack.value) })
const notes = computed(() => { void desk.tick.value; return desk.d.value.notes })
const index = computed(() => stack.value.notes.indexOf(stack.value.active ?? ''))
const group = computed(() => desk.openGroupObj.value)
const due = computed(() => dueInfo(stack.value.due))
const dockStacks = computed(() => { void desk.tick.value; return desk.viewStacks() })
const titleOf = (id: string) => { const n = notes.value[id]; return (n && noteLabel(n)) || 'Empty note' }
const doneOf = (id: string) => { const n = notes.value[id]; const p = n && progress(n); return !!p && p.done === p.all }

// ── The editor ──────────────────────────────────────────────────────────────
let editor: NoteEditor | null = null
const caretTick = ref(0)
function mountEditor() {
    if (!pageEl.value) return
    editor?.destroy()
    editor = new NoteEditor(pageEl.value, {
        note: () => desk.activeNote(stack.value),
        changed: () => { desk.autoName(stack.value); desk.save() },
        used: id => desk.used(id),
        tool: () => sh.tool.value,
        penMode: () => desk.d.value.penMode,
        inkDone: u => sh.inkDone(u),
        picture: (file, after) => { void sh.addPicture(file, after) },
        menu: (e, kind, id) => { desk.used('menu'); if (kind === 'text') sh.menus.openText(e, id); else if (kind === 'table') sh.menus.openTable(e, id); else sh.menus.openInk(e, id) },
        moved: () => { caretTick.value++ },
        isCommandKey,
    })
    editor.render()
    editor.focusEnd()
}
// another note, or the desk put back by Undo: draw it again
watch([() => stack.value.active, () => desk.d.value], () => { editor?.render(); nextTick(() => editor?.focusEnd()) })

/** Commands for the open note (Widget.vue's onCommand and the menus). */
function editorCommand(id: string, blockId?: string) {
    if (!editor) return
    if (id === 'sketch') { editor.insertSketch(blockId ?? editor.currentBlock); desk.used('sketch'); return }
    if (id === 'table') { editor.insertTable(blockId ?? editor.currentBlock); desk.used('table'); return }
    if (id === 'picture') { void pickPicture(blockId ?? editor.currentBlock); return }
    editor.command(id, blockId)
}
/** 0.2.1: a picture chosen in GEM Shell's own file dialog, into the note after the line. */
async function pickPicture(after: string | null) {
    const [path] = await sh.pickPictures({ title: 'Insert a picture', acceptLabel: 'Insert' })
    if (path) await sh.addPicture({ path }, after)
}
function insertBlock(b: Block, afterId: string | null) {
    if (!editor) return
    const next = editor.insertAfter(b, afterId)
    editor.focusBlock(next.id, 0, true)
}
function clearInk(blockId: string) {
    const b = note.value.blocks.find(x => x.id === blockId)
    if (!b || !('ink' in b)) return
    desk.snapshot(); b.ink = []; desk.save(); editor?.render(); desk.told('Ink cleared', true)
}
function removeBlock(blockId: string) {
    const b = note.value.blocks.find(x => x.id === blockId)
    desk.snapshot()
    editor?.removeBlock(blockId)
    if (b?.t === 'img') desk.forgetPictureLater(b.asset)
    desk.told(b?.t === 'img' ? 'Picture removed' : b?.t === 'table' ? 'Table removed' : 'Sketch removed', true)
}
function tableOp(op: string, blockId: string) {
    if (op === 'del-row' || op === 'del-col') desk.snapshot()
    editor?.tableOp(op, blockId)
    if (op === 'del-row' || op === 'del-col') desk.told(op === 'del-row' ? 'Row deleted' : 'Column deleted', true)
}
function appendText(text: string) {
    note.value.blocks.push(...parseText(text)); desk.save(); editor?.render()
}
function focusSoon() { nextTick(() => editor?.focusEnd()) }
function redraw() { editor?.render() }

// ── Header: rename, the stack's options ─────────────────────────────────────
function rename() {
    const el = nameEl.value; if (!el) return
    el.contentEditable = 'true'; el.focus()
    const r = document.createRange(); r.selectNodeContents(el)
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
    const done = (keep: boolean) => {
        el.removeEventListener('keydown', kd); el.removeEventListener('blur', bl)
        el.contentEditable = 'false'
        const v = (el.textContent ?? '').trim().slice(0, 40)
        if (keep && v) { stack.value.name = v; stack.value.autoName = false; desk.save() }
        el.textContent = stack.value.name
    }
    const kd = (e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); done(true) }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false) }
    }
    const bl = () => done(true)
    el.addEventListener('keydown', kd); el.addEventListener('blur', bl)
}
function panel() {
    const anchor = panelBtn.value; if (!anchor) return
    const s = stack.value
    sh.ui.openPopover({
        anchor, component: markRaw(StackPanel), placement: 'below', maxWidth: 300,
        props: {
            stack: s,
            onChange: () => { s.autoName = false; desk.save() },
            onFlag: (f: any) => desk.toggleFlag(s, f),
            onDue: (v: string | null) => desk.setDue(s, v),
            onNumbered: (on: boolean) => { s.numbered = on; if (on) s.notes.forEach(id => { const n = desk.d.value.notes[id]; if (n && !n.num) n.num = s.nextNum++ }); desk.save() },
            onExport: () => sh.menus.handle('save-stack-file', 'corkboard.stack', s.id),
            onDelete: () => sh.menus.handle('delete-stack', 'corkboard.stack', s.id),
        },
    })
}
function onSheetCtx(e: MouseEvent) {
    const t = e.target as HTMLElement
    if (t.closest('.cb-page, .cb-tabs')) return   // the editor's or a tab's own menu
    e.preventDefault(); desk.used('menu'); sh.menus.openStack(e, stack.value)
}
function dockCtx(e: Event, x: Stack) { desk.used('menu'); sh.menus.openStack(e as MouseEvent, x) }
function tabCtx(e: Event, id: string) { desk.used('menu'); sh.menus.openTab(e as MouseEvent, id) }
/** A note's own title (on its tab): asked in GEM Shell's box; empty clears it. */
async function titleNote(id: string) {
    const n = desk.d.value.notes[id]; if (!n) return
    const v = await sh.ui.prompt('Title of the note', {
        detail: 'Shown on its tab. Leave it empty to use the note’s first line.',
        value: n.title ?? '', placeholder: 'Bug #12, Monday’s call…', okLabel: 'Save',
        validate: t => t.length > NOTE_TITLE_MAX ? `At most ${NOTE_TITLE_MAX} characters` : null,
    })
    if (v === null) return
    n.title = v.trim() || undefined
    desk.save()
}
/** Right-click on ＋: a new note with its title, asked first. */
async function newTitled() {
    const v = await sh.ui.prompt('Title of the new note', { detail: 'Shown on its tab.', placeholder: 'Bug #12, Monday’s call…', okLabel: 'Add note',
        validate: t => t.length > NOTE_TITLE_MAX ? `At most ${NOTE_TITLE_MAX} characters` : null })
    if (v === null) return
    desk.addNote()
    const n = desk.activeNote(stack.value)
    if (v.trim()) n.title = v.trim()
    desk.save(); focusSoon()
}

// ── Keys the key mapper has: the editor leaves them alone ──────────────────
const SHOWN: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', ' ': 'Space', PageUp: 'Page Up', PageDown: 'Page Down' }
const NAMED: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', ' ': 'Space' }
/** The pressed key in both forms the shell writes keys in ("Shift+↓" as shown, "Shift+Down" as stored). */
function combosOf(e: KeyboardEvent): string[] {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return []
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean).join('+')
    const base = e.key.length === 1 ? e.key.toUpperCase() : e.key
    return [...new Set([SHOWN[e.key] ?? base, NAMED[e.key] ?? base])].map(k => (mods ? mods + '+' : '') + k)
}
function isCommandKey(e: KeyboardEvent): boolean {
    const keys = sh.sdk.keys?.()
    if (!keys) return false
    const pressed = combosOf(e).map(c => c.toLowerCase())
    if (!pressed.length) return false
    return TYPING_COMMANDS.some(id => keys.of(id).some(k => pressed.includes(k.toLowerCase())))
}

function newStack() { const s = desk.addStack(); desk.openStack(s.id) }
function openKeys() { void sh.sdk.navigate?.('sys:keyboard', { newTab: true }) }

function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey) {
        if ((e.target as HTMLElement).closest?.('.cb-sh-name[contenteditable="true"]')) return
        e.preventDefault(); desk.closeStack()
    }
}

// ── Hints: the keys of where the caret is (the user's keys) ─────────────────
const keyTick = ref(0)
let offKeys: (() => void) | null = null
const keyOf = (id: string) => { void keyTick.value; return sh.sdk.keys?.().of(id)?.[0] ?? '' }
type Hint = { id: string; key: string; text: string }
const hints = computed<Hint[]>(() => {
    void caretTick.value; void desk.tick.value
    if (!desk.d.value.hints || !editor) return []
    const c = editor.caretState()
    const list: Hint[] = []
    const cmd = (id: string, text: string) => { const k = keyOf(id); if (k) list.push({ id, key: k, text }) }
    if (c.kind === 'media') list.push({ id: 'erase', key: 'Right-drag', text: 'erases' }, { id: 'menu', key: 'Right-click', text: 'for options' })
    else if (c.kind === 'cell') { cmd('indent', 'next cell'); cmd('end-list', 'leaves the table'); list.push({ id: 'menu', key: 'Right-click', text: 'rows, columns' }) }
    else if (c.kind === 'text') {
        if (c.t === 'b' || c.t === 'n' || c.t === 'c') {
            if (c.empty) list.push({ id: 'step-out', key: 'Enter', text: 'steps out' })
            cmd('end-list', 'ends the list'); cmd('indent', 'indents')
            if (c.t === 'c') cmd('check', 'ticks')
        } else if (c.empty && !c.lvl) {
            list.push({ id: 'md-list', key: '-', text: 'list' }, { id: 'md-check', key: '[ ]', text: 'checklist' }, { id: 'md-heading', key: '#', text: 'heading' })
        } else if ((c.lvl ?? 0) > 0) cmd('outdent', 'outdents')
    }
    list.push({ id: 'scribble', key: 'Alt + drag', text: 'scribbles' }, { id: 'menu', key: 'Right-click', text: 'for options' })
    const seen = new Set<string>()
    return list.filter(h => !desk.learned(h.id) && !seen.has(h.id) && seen.add(h.id)).slice(0, 2)
})

// ── Dragging a tab ──────────────────────────────────────────────────────────
type TabDrag = { id: string; moved: boolean; x: number; y: number; ins: number | null; drop: { kind: 'order' | 'stack' | 'new'; to?: string; at?: number } | null }
const tabDrag = ref<TabDrag | null>(null)
function tabDown(e: PointerEvent, id: string) {
    if (e.button !== 0) return
    const sx = e.clientX, sy = e.clientY
    const st: TabDrag = { id, moved: false, x: 0, y: 0, ins: null, drop: null }
    let lastTarget: HTMLElement | null = null
    const mark = (el: HTMLElement | null) => { if (lastTarget !== el) { lastTarget?.classList.remove('drop-target'); el?.classList.add('drop-target'); lastTarget = el } }
    const mv = (ev: PointerEvent) => {
        if (!st.moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
        st.moved = true
        const r = rootEl.value!.getBoundingClientRect()
        st.x = ev.clientX - r.left + 10; st.y = ev.clientY - r.top - 14
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => !(n as HTMLElement).classList?.contains('cb-ghost'))
        const icon = under?.closest<HTMLElement>('.cb-dicon, .cb-dk-add')
        const tabs = under?.closest('.cb-tabs')
        st.drop = null; st.ins = null; mark(null)
        if (icon && icon.dataset.id !== stack.value.id) {
            st.drop = icon.dataset.id ? { kind: 'stack', to: icon.dataset.id } : { kind: 'new' }
            mark(icon)
        } else if (tabs) {
            const list = [...tabsEl.value!.querySelectorAll<HTMLElement>('.cb-tab[data-note]')]
            let at = list.length
            for (let j = 0; j < list.length; j++) { const b = list[j].getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { at = j; break } }
            st.drop = { kind: 'order', at }; st.ins = at
        }
        tabDrag.value = { ...st }
    }
    const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
        mark(null)
        const done = { ...st }
        tabDrag.value = null
        if (!done.moved) { desk.selectNote(id); return }
        if (!done.drop) return
        if (done.drop.kind === 'order') desk.reorderNote(id, done.drop.at!)
        else desk.moveNote(id, done.drop.kind === 'stack' ? done.drop.to! : null)
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
}

// ── A very small view (0.2.1): the note takes it all, no dock of the other stacks (✕ goes back to them) ──
const compact = ref(false)
let ro: ResizeObserver | null = null
function measureRoom() {
    const el = rootEl.value; if (!el) return
    const w = el.clientWidth, h = el.clientHeight
    compact.value = w < 460 || h < 360
}

onMounted(() => {
    mountEditor()
    offKeys = sh.sdk.keys?.().onChange(() => { keyTick.value++ }) ?? null
    measureRoom()
    ro = new ResizeObserver(measureRoom)
    if (rootEl.value) ro.observe(rootEl.value)
})
onBeforeUnmount(() => { ro?.disconnect(); editor?.destroy(); editor = null; offKeys?.() })

defineExpose({ editorCommand, insertBlock, clearInk, removeBlock, appendText, focusSoon, redraw, titleNote, tableOp })
</script>
