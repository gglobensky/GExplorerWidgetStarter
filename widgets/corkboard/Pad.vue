<!-- widgets/corkboard/Pad.vue -->
<!--
    THE PAD (0.5.0, claude/plan-2026-11-22-corkboard-pad.md): a small notepad, the Corkboard's layout for the sidebar and
    the toolbar. Write a page, then Send to… (Corkboards ▸ boards ▸ stacks, or a new stack): it is torn off and lands as
    a note in that stack. Open… shows any note of any board here, live: the board and the pad hold the same desk
    (GEM Shell's live document, sdk.instanceData), so an edit on either is on the other at once. The page not sent yet, the last place sent to and the
    note opened are this copy's (its view), kept after a restart.
-->
<template>
    <div ref="rootEl" class="cb-pad" :class="{ torn: tearing, opened: !!opened, 'in-pop': inPop }" @keydown="onKey">
        <div class="cb-pad-bar">
            <template v-if="opened">
                <button class="cb-ib" type="button" title="Back to my page" aria-label="Back to my page" @click="closeOpened()">←</button>
                <span class="cb-pad-where" :title="opened.where">{{ opened.where }}</span>
            </template>
            <span v-else class="cb-pad-where">Quick note</span>
            <span class="cb-sp"></span>
            <button ref="openBtn" class="cb-ib" type="button" title="Open a note of any board here" aria-label="Open a note" @click="openMenu">▤</button>
            <button v-if="canBoard" class="cb-ib" type="button" title="Show the full board here" aria-label="Show the full board" @click="emit('board')">▦</button>
        </div>
        <div class="cb-pad-sheet" :class="opened ? 'c-' + opened.color : 'c-sun'">
            <div class="cb-pad-holes" aria-hidden="true"></div>
            <div ref="pageEl" class="cb-page cb-pad-page" @focusout="onPageFocusOut"></div>
        </div>
        <div v-if="!opened" class="cb-pad-foot">
            <button v-if="last" class="cb-pad-send" type="button" :title="`Send this page to ${last.label} (Alt+Enter)`" :disabled="empty" @click="sendTo(last)">
                Send to {{ last.stack }}
            </button>
            <button ref="sendBtn" class="cb-pad-send" :class="{ alt: !!last }" type="button" :title="last ? 'Send to another stack' : 'Choose the board and the stack (Alt+Enter)'"
                    :disabled="empty" @click="sendMenu">{{ last ? '▸' : 'Send to…' }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, inject, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import type { WidgetSdk, WidgetMenuEntry } from 'gexplorer/widgets'
import { NoteEditor } from './editor'
import { createDesk } from './store'
import { TYPING_COMMANDS } from './commands'
import { blk, uid, isEmptyNote, noteLabel, newNote, newStack, type Note, type Block, type Stroke, type PaperColor, type DeskData } from './model'
import type { Desk } from './store'

const props = defineProps<{
    config?: Record<string, any>
    /** The sidebar can show the full board instead (the toolbar's popover can't). */
    canBoard?: boolean
    /** In the toolbar's popover (a fixed size). */
    inPop?: boolean
    /** Widget.vue's way to send it the commands (a popover's component can't be reached by a ref). */
    register?: (api: { command(id: string): void } | null) => void
}>()
const emit = defineEmits<{ (e: 'board'): void }>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const rootEl = ref<HTMLElement | null>(null)
const pageEl = ref<HTMLElement | null>(null)
const sendBtn = ref<HTMLElement | null>(null)
const openBtn = ref<HTMLElement | null>(null)
const PAD_TAG = Symbol('pad')
const say = (text: string, ms = 3500) => void ui.snack({ id: 'corkboard-pad', text, dedupe: 'replace', timeoutMs: ms })

// ── This copy's own page (its view: padDraft), and where it was sent last (padLast) ──
type Place = { copyId: string; boardId: string; stackId: string; stack: string; label: string }
const view = () => props.config?.view ?? {}
function blankDraft(): Note { return { id: 'pad', num: 0, blocks: [blk()], ink: [], updated: Date.now() } }
function draftFrom(v: any): Note {
    const blocks = Array.isArray(v?.blocks) && v.blocks.length ? v.blocks as Block[] : null
    return blocks ? { id: 'pad', num: 0, blocks, ink: Array.isArray(v.ink) ? v.ink as Stroke[] : [], updated: Date.now() } : blankDraft()
}
const draft = ref<Note>(draftFrom(view().padDraft))
const last = ref<Place | null>(view().padLast?.copyId ? view().padLast as Place : null)
const draftTick = ref(0)
const empty = computed(() => { void draftTick.value; return isEmptyNote(draft.value) && !draft.value.ink.length })
let saveT: ReturnType<typeof setTimeout> | null = null
function saveDraft(now = false) {
    if (saveT) clearTimeout(saveT)
    const write = () => { saveT = null; void sdk.setView?.({ padDraft: { blocks: draft.value.blocks, ink: draft.value.ink } }) }
    if (now) write(); else saveT = setTimeout(write, 600)
}

// ── A note opened here, live (another copy's desk, held while it's open) ──
type Opened = { desk: Desk; copyId: string; noteId: string; where: string; color: PaperColor; off: () => void }
// shallow: a ref() would unwrap the desk's own refs (d, tick) inside it
const opened = shallowRef<Opened | null>(null)

// ── The editor: the page, or the note opened ──
let editor: NoteEditor | null = null
let stale = false
const SHOWN: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', ' ': 'Space', PageUp: 'Page Up', PageDown: 'Page Down' }
const NAMED: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', ' ': 'Space' }
function isCommandKey(e: KeyboardEvent): boolean {
    const keys = sdk.keys?.()
    if (!keys || ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return false
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean).join('+')
    const base = e.key.length === 1 ? e.key.toUpperCase() : e.key
    const pressed = [...new Set([SHOWN[e.key] ?? base, NAMED[e.key] ?? base])].map(k => ((mods ? mods + '+' : '') + k).toLowerCase())
    return TYPING_COMMANDS.some(id => keys.of(id).some(k => pressed.includes(k.toLowerCase())))
}
function currentNote(): Note {
    const o = opened.value
    if (o) return o.desk.d.value.notes[o.noteId] ?? draft.value
    return draft.value
}
function mountEditor() {
    if (!pageEl.value) return
    editor?.destroy()
    editor = new NoteEditor(pageEl.value, {
        note: currentNote,
        changed: () => {
            const o = opened.value
            if (o) { o.desk.save(); o.desk.noteEdited(o.noteId, PAD_TAG) }
            else { draftTick.value++; saveDraft() }
        },
        used: () => { },
        tool: () => 'k',
        penMode: () => false,
        inkDone: () => { const o = opened.value; if (o) o.desk.save(); else saveDraft() },
        picture: () => say('Pictures go on the board itself: open its stack there.'),
        menu: () => { },
        moved: () => { },
        isCommandKey,
    })
    editor.render()
}
function onPageFocusOut(e: FocusEvent) {
    if (!stale || pageEl.value?.contains(e.relatedTarget as Node | null)) return
    stale = false
    editor?.render()
}

/** Widget.vue's onCommand while the pad shows: the editor's commands; Alt+Enter (pad-send) sends. */
let sentAt = 0
function command(id: string) {
    if (id === 'pad-send') {
        // the key mapper and (in the toolbar's popover) the pad's own Alt+Enter may both see the key: once
        if (opened.value || Date.now() - sentAt < 400) return
        sentAt = Date.now()
        void (last.value ? sendTo(last.value) : sendMenu())
        return
    }
    if (['new-note', 'find', 'next-note', 'prev-note', 'flag-important', 'next-page', 'prev-page', 'ink-undo', 'table', 'sketch'].includes(id)) return
    editor?.command(id)
}
function onKey(e: KeyboardEvent) {
    // in the toolbar's popover the key mapper may not see the pad's keys: Alt+Enter, Alt+Enter as declared
    if (props.inPop && e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.shiftKey && !opened.value) { e.preventDefault(); command('pad-send'); return }
    if (e.key === 'Escape' && opened.value && !e.defaultPrevented) { e.preventDefault(); closeOpened() }
}
defineExpose({ command })
props.register?.({ command })

// ── The Corkboards, their boards, their stacks (menus loaded level by level) ──
/** A copy's desk (another Corkboard's: GEM Shell's live document, the same its board edits), null when it has none. */
async function hold(copyId: string): Promise<Desk | null> {
    const desk = createDesk(sdk, copyId)
    await desk.load({ create: false })
    if (desk.missing.value) { desk.release(); return null }
    return desk
}
/** Reads a copy's desk, then lets it go. */
async function withDesk<T>(copyId: string, f: (desk: Desk) => T): Promise<T | null> {
    const desk = await hold(copyId)
    if (!desk) return null
    try { return f(desk) } finally { desk.release() }
}
function stacksOf(desk: Desk, boardId: string) {
    const d = desk.d.value
    const groupName = (id: string | null) => (id && d.groups.find(g => g.id === id)?.name) || ''
    return d.stacks.filter(s => s.board === boardId).map(s => ({ s, group: groupName(s.group ?? null) }))
}
/** CHANGED (0.5.0): the Corkboards placed now that have boards (GEM Shell's list of this widget's copies). */
type CopyRow = { copyId: string; label: string; boards: { id: string; title: string }[] }
async function corkboards(): Promise<CopyRow[]> {
    const data = sdk.instanceData!()
    const copies = await data.copies()
    const rows: CopyRow[] = []
    for (const c of copies) {
        const desk = await data.of(c.id).read<DeskData>('desk').catch(() => null)
        if (!desk || !Array.isArray(desk.boards) || !desk.boards.length) continue   // a pad, or a copy never shown as a board
        const twin = copies.filter(o => o.label === c.label).length > 1
        rows.push({ copyId: c.id, label: twin ? `${c.label} (${c.where})` : c.label, boards: desk.boards.map(b => ({ id: b.id, title: b.title })) })
    }
    return rows
}
/** A Corkboard in a menu: its place, then its boards ("Home hub: Projects, Home"). */
function copyLabel(c: CopyRow): string {
    const names = c.boards.map(b => b.title || 'Untitled board')
    return `${c.label}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
}
/** The levels down to a board's stacks; leaf(...) makes a stack's row (Send: chosen; Open: its notes). */
async function deskRows(leaf: (c: CopyRow, boardId: string, boardTitle: string, desk: Desk) => WidgetMenuEntry[]): Promise<WidgetMenuEntry[]> {
    const copies = await corkboards()
    if (!copies.length) return [{ type: 'header', label: 'No Corkboard yet: place one in a hub first' }]
    const boardRows = (c: CopyRow): WidgetMenuEntry[] => c.boards.map(b => ({
        id: `b:${c.copyId}:${b.id}`, label: b.title || 'Untitled board', icon: '▦',
        loadChildren: async () => (await withDesk(c.copyId, desk => leaf(c, b.id, b.title || 'Untitled board', desk)))
            ?? [{ type: 'header', label: 'This Corkboard was removed' }],
    }))
    // One Corkboard: its boards straight away
    if (copies.length === 1) return boardRows(copies[0])
    return copies.map(c => ({ id: `c:${c.copyId}`, label: copyLabel(c), icon: '📌', children: boardRows(c) }))
}

async function sendMenu() {
    if (empty.value || !sendBtn.value) return
    const at = sendBtn.value
    const items = await deskRows((e, boardId, boardTitle, desk) => [
        ...stacksOf(desk, boardId).map(({ s, group }) => ({
            id: `s:${s.id}`, label: s.name, detail: group || undefined,
            data: { copyId: e.copyId, boardId, stackId: s.id, stack: s.name, label: `“${s.name}” on ${boardTitle}` } satisfies Place,
        })),
        { type: 'separator' },
        { id: `new:${e.copyId}:${boardId}`, label: 'New stack…', icon: '＋', data: { copyId: e.copyId, boardId, stackId: '', stack: '', label: boardTitle } satisfies Place },
    ])
    ui.openMenu?.({
        at, items, label: 'Send to',
        onPick: row => {
            const p = row.data as Place | undefined
            if (!p) return
            if (!p.stackId) void newStackThenSend(p)
            else void sendTo(p)
        },
    })
}

async function newStackThenSend(p: Place) {
    const name = await ui.prompt('New stack', { value: 'Quick notes', okLabel: 'Send' })
    if (!name?.trim()) return
    await sendTo({ ...p, stackId: '', stack: name.trim().slice(0, 40) })
}

/** The page into stack <p> (a new one named p.stack when p.stackId is empty), torn off; that place remembered. */
let sending = false
async function sendTo(p: Place) {
    if (empty.value || sending) return
    sending = true
    const desk = await hold(p.copyId).catch(() => null)
    try {
        const d = desk?.d.value
        if (!desk || !d || !d.boards.some(b => b.id === p.boardId)) { say('That board is gone: choose another one.'); last.value = null; void sdk.setView?.({ padLast: null }); return }
        let s = p.stackId ? d.stacks.find(x => x.id === p.stackId && x.board === p.boardId) : undefined
        if (p.stackId && !s) { say(`“${p.stack}” is gone: choose another stack.`); last.value = null; void sdk.setView?.({ padLast: null }); return }
        if (!s) {
            // a new stack at the end of the board (its first free spot)
            s = newStack(d, { board: p.boardId, group: null, name: p.stack, autoName: false, place: desk.placeIn(p.boardId, null) })
            d.stacks.push(s)
        }
        // a copy with ids of its own (the page stays the pad's until it's cleared)
        const blocks: Block[] = JSON.parse(JSON.stringify(draft.value.blocks)).map((b: Block) => ({ ...b, id: uid() }))
        const n = newNote(d, s, blocks)
        n.ink = JSON.parse(JSON.stringify(draft.value.ink))
        n.updated = Date.now()
        s.active = n.id
        desk.save()
        desk.noteEdited(null, PAD_TAG)
        const board = d.boards.find(b => b.id === p.boardId)?.title || 'Untitled board'
        const place: Place = { copyId: p.copyId, boardId: p.boardId, stackId: s.id, stack: s.name, label: `“${s.name}” on ${board}` }
        last.value = place
        void sdk.setView?.({ padLast: place })
        await tear()
        say(`Sent to ${place.label}`)
    } finally { desk?.release(); sending = false }
}

/** The page torn off (a short animation), a fresh one under it. */
const tearing = ref(false)
async function tear() {
    tearing.value = true
    await new Promise(r => setTimeout(r, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 320))
    draft.value = blankDraft()
    draftTick.value++
    saveDraft(true)
    tearing.value = false
    editor?.render()
    await nextTick()
    editor?.focusEnd()
}

// ── Open a note here, live ──
async function openMenu() {
    if (!openBtn.value) return
    const at = openBtn.value
    const items = await deskRows((c, boardId, boardTitle, desk) => {
        const rows = stacksOf(desk, boardId).map(({ s, group }) => ({
            id: `os:${s.id}`, label: s.name, detail: group || undefined,
            children: s.notes.map(id => desk.d.value.notes[id]).filter(Boolean).map(n => ({
                id: `on:${n.id}`, label: noteLabel(n) || 'Empty note',
                data: { copyId: c.copyId, noteId: n.id, where: `${s.name} · ${boardTitle}` },
            })) as WidgetMenuEntry[],
        }))
        return rows.length ? rows : [{ type: 'header', label: 'No stacks on this board' }]
    })
    ui.openMenu?.({
        at, items, label: 'Open a note',
        onPick: row => { const o = row.data as { copyId: string; noteId: string; where: string } | undefined; if (o) void openNote(o.copyId, o.noteId, o.where) },
    })
}

async function openNote(copyId: string, noteId: string, where?: string, quiet = false) {
    closeOpened(false)
    const desk = await hold(copyId).catch(() => null)
    const d = desk?.d.value
    const s = d?.stacks.find(x => x.notes.includes(noteId))
    if (!desk || !d || !d.notes[noteId] || !s) {
        desk?.release()
        if (!quiet) say('That note is gone.')
        void sdk.setView?.({ padOpen: null })
        return
    }
    const board = d.boards.find(b => b.id === s.board)?.title || 'Untitled board'
    // the board edited it (GEM Shell's live document: the same data): drawn again now, or once the caret leaves it
    const off = desk.onNoteEdited((id, source) => {
        if (source === PAD_TAG || (id && id !== noteId)) return
        if (!desk.d.value.notes[noteId]) { closeOpened(); say('The note was deleted on its board.'); return }
        if (pageEl.value?.contains(document.activeElement)) { stale = true; return }
        editor?.render()
    })
    opened.value = { desk, copyId, noteId, where: where ?? `${s.name} · ${board}`, color: s.color, off }
    void sdk.setView?.({ padOpen: { copyId, noteId } })
    editor?.render()
}

/** Back to the pad's own page (the note stays on its board). */
function closeOpened(remember = true) {
    const o = opened.value
    if (!o) return
    o.off()
    o.desk.release()
    opened.value = null
    stale = false
    if (remember) void sdk.setView?.({ padOpen: null })
    editor?.render()
}

// A note deleted on the board while not being edited here: closed with a word
watch(() => { const o = opened.value; if (!o) return true; void o.desk.tick.value; return !!o.desk.d.value.notes[o.noteId] }, ok => {
    if (!ok) { closeOpened(); say('The note was deleted on its board.') }
})

onMounted(async () => {
    mountEditor()
    const o = view().padOpen
    if (o?.copyId && o?.noteId) await openNote(o.copyId, o.noteId, undefined, true)
    if (props.inPop) editor?.focusEnd()
})
onBeforeUnmount(() => {
    if (saveT) saveDraft(true)
    const o = opened.value
    if (o) { o.off(); o.desk.release() }
    props.register?.(null)
    editor?.destroy()
    editor = null
})
</script>
