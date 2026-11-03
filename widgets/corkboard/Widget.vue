<!-- widgets/corkboard/Widget.vue -->
<!--
    GEM CORKBOARD (0.1.0): the toolbar (board switcher, search, new note, snap, ⋯), then the board (Board.vue) or
    the open stack (StackView.vue). The desk (store.ts) is provided to both. Keys arrive as commands (onCommand),
    right-click menus are GEM Shell's (menus.ts, onMenuItem), dialogs are GEM Shell popovers and message boxes.
-->
<template>
    <div ref="rootEl" class="cb-root" :class="['surf-' + (board?.surface ?? 'cork'), { narrow }]" tabindex="-1" @paste="onPaste">
        <div class="cb-bar">
            <button ref="boardBtn" class="cb-boardchip" type="button" :title="`Boards (${desk.d.value.boards.length})`" @click="boardMenu">
                <span class="cb-bsw" :class="'surf-' + board?.surface"></span>
                <span class="cb-bt">{{ board?.title || 'Untitled board' }}</span>
                <span v-if="due" class="cb-bdue" :title="`${due} due today or late`">{{ due }}</span>
                <span class="cb-caret">▾</span>
            </button>
            <div class="cb-search">
                <input ref="searchEl" v-model="query" type="search" placeholder="Search notes" aria-label="Search notes"
                       autocomplete="off" @keydown="onSearchKey" @focus="searchOpen = true" @blur="closeSearchSoon" />
                <div v-if="searchOpen && query.trim()" class="cb-results">
                    <button v-for="(r, k) in results" :key="r.n.id" class="cb-res" :class="{ on: k === resultAt }" type="button"
                            @mousedown.prevent="openResult(r)">
                        <span class="cb-rs" :class="'c-' + r.s.color">{{ r.where }}</span>
                        <span class="cb-rt">{{ r.title }}</span>
                        <span class="cb-rx"><template v-for="(p, i) in r.parts" :key="i"><mark v-if="i === 1">{{ p }}</mark><template v-else>{{ p }}</template></template></span>
                    </button>
                    <div v-if="!results.length" class="cb-none">No notes contain “{{ query.trim() }}”</div>
                </div>
            </div>
            <button class="cb-ib" type="button" v-gex-command="'new-note'" aria-label="New note">＋</button>
            <button v-if="!desk.focused.value" class="cb-ib" type="button" :aria-pressed="desk.d.value.snap"
                    :title="desk.d.value.snap ? 'Snapping to the grid (Alt while dragging: freely)' : 'Placing freely (Alt while dragging: snap)'"
                    aria-label="Snap to the grid" @click="toggleSnap">▦</button>
            <button ref="moreBtn" class="cb-ib" type="button" title="More" aria-label="More" @click="appMenu">⋯</button>
        </div>
        <div class="cb-main">
            <template v-if="desk.ready.value">
                <StackView v-if="focusedId" ref="stackView" :key="focusedId" />
                <template v-else>
                    <Board ref="boardView" />
                    <PhotoView v-if="photoId" ref="photoView" :key="photoId" />
                </template>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, inject, onMounted, onBeforeUnmount, markRaw } from 'vue'
import type { WidgetSdk, WidgetMenuItemMessage } from 'gexplorer/widgets'
import Board from './Board.vue'
import StackView from './StackView.vue'
import PhotoView from './PhotoView.vue'
import BoardDialog from './dialogs/BoardDialog.vue'
import GroupDialog from './dialogs/GroupDialog.vue'
import CopyDialog from './dialogs/CopyDialog.vue'
import DueDialog from './dialogs/DueDialog.vue'
import { createDesk, type PictureSource } from './store'
import { SHARED, type Shared } from './shared'
import { createMenus } from './menus'
import { dueCount, noteText, noteLabel, parseText, blk, uid, type Stack, type Group, type Block, type Photo, type Item } from './model'
import { exportStack, exportBoard, stackMarkdown, boardMarkdown, importStack, importBoard, copyKind, type InlinePicture } from './exchange'
import type { InkTool, InkUndo } from './ink'
import { undoInk } from './ink'

const props = defineProps<{
    sourceId: string
    config?: Record<string, any>
    placement?: { context?: 'grid' | 'sidebar' | 'toolbar' | 'embedded'; size?: any }
}>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const desk = createDesk(sdk, props.sourceId)

// ── Shared with Board.vue and StackView.vue ─────────────────────────────────
const tool = ref<InkTool>('k')
const inkHistory: InkUndo[] = []
const shared: Shared = {
    desk, sdk, ui, tool,
    inkDone(u: InkUndo) { inkHistory.push(u); if (inkHistory.length > 200) inkHistory.shift(); desk.save() },
    inkUndo() {
        const u = inkHistory.pop()
        if (!u) { desk.told('Nothing to undo on the ink'); return }
        undoInk(u); desk.save(); stackView.value?.redraw(); photoView.value?.redraw()
    },
    menus: null as unknown as Shared['menus'],
    async pickPictures(o) {
        const paths = await ui.openFiles({ title: o.title, acceptLabel: o.acceptLabel, multiple: !!o.multiple, access: 'read',
            filters: [{ label: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] })
        return paths ?? []
    },
    /** A picture file into the open note (after a block), or (0.2.0) pinned on the board. */
    async addPicture(file: PictureSource, afterId: string | null) {
        if (!desk.focused.value || !stackView.value) { await desk.addPhoto(file); return }
        const pic = await desk.makePicture(file)
        if (!pic) return
        const block: Block = { id: uid(), t: 'img', lvl: 0, ...pic, ink: [] }
        if (desk.focused.value && stackView.value) { stackView.value.insertBlock(block, afterId); desk.told('Picture added: draw on it to mark it up') }
    },
    pages: () => boardView.value?.pages() ?? 1,
}
provide(SHARED, shared)

const rootEl = ref<HTMLElement | null>(null)
const boardBtn = ref<HTMLElement | null>(null)
const moreBtn = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
/** What the open stack and the board expose (StackView.vue / Board.vue defineExpose). */
type StackViewApi = {
    editorCommand(id: string, blockId?: string): void
    insertBlock(b: Block, afterId: string | null): void
    clearInk(blockId: string): void
    removeBlock(blockId: string): void
    appendText(text: string): void
    focusSoon(): void
    redraw(): void
    titleNote(id: string): void
    tableOp(op: string, blockId: string): void
}
type BoardApi = { flip(dir: number): void; pages(): number }
const stackView = ref<StackViewApi | null>(null)
const boardView = ref<BoardApi | null>(null)
const photoView = ref<{ redraw(): void } | null>(null)
const photoId = computed(() => desk.openPhotoObj.value?.id ?? null)
/** 0.2.1: pictures to pin chosen in GEM Shell's own file dialog (several at once: each on the next free cell). */
async function pickPhotos(at: { col: number; row: number } | null) {
    const paths = await shared.pickPictures({ title: 'Pin pictures on the board', acceptLabel: 'Pin', multiple: true })
    for (const [i, path] of paths.entries()) await desk.addPhoto({ path }, i === 0 ? at : null)
}
async function captionAsk(p: Photo) {
    const v = await ui.prompt('Caption', { value: p.caption, placeholder: 'What is it? Who, where, when…', okLabel: 'Save' })
    if (v != null) desk.setCaption(p, v)
}
async function deletePhotoAsk(p: Photo) {
    const ok = await ui.confirm(p.caption ? `Take “${p.caption}” off the board?` : 'Take this picture off the board?', {
        detail: `The picture${p.ink.length ? ' and what is drawn on it' : ''} goes. You can undo right after.`, okLabel: 'Take it off', danger: true,
    })
    if (ok) desk.deletePhoto(p)
}
const focusedId = computed(() => desk.focused.value?.id ?? null)

const board = computed(() => desk.board.value)
const due = computed(() => { void desk.tick.value; return board.value ? dueCount(desk.d.value, board.value.id) : 0 })
const narrow = computed(() => props.placement?.context === 'sidebar')

// ── Dialogs (GEM Shell popovers) ─────────────────────────────────────────────
function center(component: any, title: string, p: Record<string, unknown>) {
    const anchor = rootEl.value
    if (!anchor) return
    ui.openPopover({ anchor, component: markRaw(component), placement: 'center', title, props: p, maxWidth: 560 })
}
function newBoard() {
    center(BoardDialog, 'New board', { title: '', surface: 'felt', create: true,
        onSave: (title: string, surface: any) => desk.createBoard(title, surface) })
}
function editBoardDialog() {
    const b = board.value
    center(BoardDialog, 'Edit board', { title: b.title, surface: b.surface, create: false,
        onSave: (title: string, surface: any) => desk.editBoard(b, title, surface) })
}
async function deleteBoardAsk() {
    const b = board.value
    if (desk.d.value.boards.length < 2) return
    const st = desk.d.value.stacks.filter(s => s.board === b.id)
    const notes = st.reduce((a, s) => a + s.notes.length, 0)
    const ok = await ui.confirm(`Delete “${b.title || 'Untitled board'}”?`, {
        detail: `Its ${st.length} stack${st.length === 1 ? '' : 's'} and ${notes} note${notes === 1 ? '' : 's'} are deleted with it. You can undo right after.`,
        okLabel: 'Delete board', danger: true,
    })
    if (ok) desk.deleteBoard(b)
}
function groupDialog(o: { group?: Group; stack?: Stack; want?: { col: number; row: number } | null }) {
    center(GroupDialog, o.group ? 'Edit group' : 'New group', {
        name: o.group?.name ?? '', due: o.group?.due ?? null, create: !o.group,
        onSave: (name: string, dueDate: string | null) => {
            if (o.group) desk.editGroup(o.group, name, dueDate)
            else desk.createGroup({ name, due: dueDate, stack: o.stack, want: o.want ?? undefined })
        },
    })
}
function dueDialog(t: Stack | Group) {
    center(DueDialog, `Due date for “${t.name}”`, { due: t.due, onSave: (v: string | null) => desk.setDue(t, v) })
}
async function exportDialog(kind: CopyFileKind, name: string, json: (inline: InlinePicture) => Promise<string>, md: () => string) {
    center(CopyDialog, `Export “${name}”`, {
        mode: 'export', json: await json(desk.inlinePicture), markdown: md(), fileExt: FILE_KINDS[kind].ext,
        onSave: (fmt: 'json' | 'md') => saveCopyFile(kind, name, json, md, fmt),
    })
}
function importDialog() {
    center(CopyDialog, 'Import', { mode: 'import', onImport: (text: string) => importText(text), onOpenFile: openCopyFile })
}

// ── Files (0.2.2): a board as a .gembrd file, a stack as a .gemstk file, opened by another Corkboard ──
type CopyFileKind = 'board' | 'stack'
const FILE_KINDS: Record<CopyFileKind, { ext: string; label: string }> = {
    board: { ext: 'gembrd', label: 'GEM Corkboard board' },
    stack: { ext: 'gemstk', label: 'GEM Corkboard stack' },
}
/** What fsReadText opens at most: a larger file couldn't be opened again. */
const FILE_MAX = 8 * 1024 * 1024
const fileName = (s: string) => (s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Corkboard').slice(0, 80)
/** Saves a copy where the user picks (GEM Shell's save dialog); pictures go in as WebP when that's smaller. */
async function saveCopyFile(kind: CopyFileKind, name: string, json: (inline: InlinePicture) => Promise<string>, md: () => string, fmt: 'json' | 'md' = 'json') {
    const ext = fmt === 'md' ? 'md' : FILE_KINDS[kind].ext
    const path = await ui.saveFile({
        title: `Save “${name}”`, suggestedName: fileName(name) + '.' + ext,
        filters: [fmt === 'md' ? { label: 'Markdown', extensions: ['md'] } : { label: FILE_KINDS[kind].label, extensions: [ext] }],
    })
    if (!path) return
    const text = fmt === 'md' ? md() : await json(u => desk.inlinePicture(u, true))
    const bytes = new Blob([text]).size
    if (fmt === 'json' && bytes > FILE_MAX) {
        const ok = await ui.confirm('This file is too large to open again', {
            detail: `It's ${(bytes / 1048576).toFixed(1)} MB with its pictures; a Corkboard opens files up to 8 MB. Save it anyway, or take a few pictures off first.`,
            okLabel: 'Save anyway',
        })
        if (!ok) return
    }
    if (!sdk.fsWriteText) { desk.told('Saving files needs the Write permission for GEM Corkboard.'); return }
    try { await sdk.fsWriteText(path, text, { overwrite: true }); desk.told(`Saved “${path.split(/[\\/]/).pop()}”`) }
    catch (err: any) { console.warn('[corkboard] save failed', err); desk.told("The file couldn't be saved.") }
}
/** Opens a .gembrd / .gemstk file (GEM Shell's file dialog, those two types only) and adds it as a separate copy. */
async function openCopyFile(): Promise<boolean> {
    const [path] = (await ui.openFiles({
        title: 'Open a Corkboard file', acceptLabel: 'Open', access: 'read',
        filters: [{ label: 'GEM Corkboard boards and stacks', extensions: ['gembrd', 'gemstk'] }],
    })) ?? []
    if (!path) return false
    if (!sdk.fsReadText) { desk.told('Opening files needs the Read permission for GEM Corkboard.'); return false }
    try { const { text } = await sdk.fsReadText(path, { maxBytes: FILE_MAX }); return await importText(text) }
    catch (err: any) { desk.told(err?.code === 'E_TOO_LARGE' ? 'That file is over 8 MB: too large to open.' : "That file couldn't be read."); return false }
}
const saveBoardFile = () => { const b = board.value; void saveCopyFile('board', b.title || 'Untitled board', inline => exportBoard(desk.d.value, b, inline), () => boardMarkdown(desk.d.value, b)) }

/** 0.2.2: an item of the view to another page; when there's no room even small, offers to shrink the others there. */
async function moveToPage(it: Item, to: number) {
    const r = desk.moveToPage(it, to)
    if (r.ok) return
    if (!r.othersCould) { desk.told(`Page ${to + 1} is full: there's no room for “${desk.labelOf(it)}”, even 1 × 1. Nothing moved.`); return }
    const ok = await ui.confirm(`Page ${to + 1} is full`, {
        detail: `Making some of the larger items there smaller (1 × 1) would make room for “${desk.labelOf(it)}”. You can undo right after.`,
        okLabel: 'Make room',
    })
    if (ok) desk.moveToPage(it, to, true)
}
async function deleteStackAsk(s: Stack) {
    const ok = await ui.confirm(`Delete “${s.name}”?`, { detail: `Its ${s.notes.length} note${s.notes.length === 1 ? '' : 's'} are deleted. You can undo right after.`, okLabel: 'Delete stack', danger: true })
    if (ok) desk.deleteStack(s)
}
async function deleteGroupAsk(g: Group) {
    const n = desk.d.value.stacks.filter(s => s.group === g.id).length
    const ok = await ui.confirm(`Delete “${g.name}”?`, { detail: `Its ${n} stack${n === 1 ? '' : 's'} are deleted with it. You can undo right after.`, okLabel: 'Delete group', danger: true })
    if (ok) desk.deleteGroup(g)
}

/** A Corkboard copy pasted or imported: a stack into this view, a board as a new board. false: not a copy. */
async function importText(text: string): Promise<boolean> {
    const kind = copyKind(text)
    try {
        if (kind === 'board') { const b = await importBoard(desk.d.value, text, desk.makePicture); desk.switchBoard(b.id); desk.told(`Added the board “${b.title || 'Untitled board'}” as a separate copy`); return true }
        if (kind === 'stack') {
            const s = await importStack(desk.d.value, text, desk.d.value.board, desk.d.value.group, desk.makePicture)
            s.place = desk.newPlace(); desk.save(); desk.told(`Added “${s.name}” as a separate copy`); return true
        }
    } catch (err: any) { desk.told(err?.message || "That copy couldn't be read."); return false }
    desk.told("That isn't a Corkboard copy. Use Export to make one.")
    return false
}

// ── Menus ───────────────────────────────────────────────────────────────────
shared.menus = createMenus(sdk, desk, {
    newHere(kind, at) {
        const blocks: Block[] | null = kind === 'checklist' ? [blk('c')] : kind === 'drawing' ? [blk(), { id: uid(), t: 'ink', lvl: 0, h: 380, ink: [] }, blk()] : null
        const s = desk.addStack(blocks, {}, at ?? undefined)
        desk.openStack(s.id)
    },
    newGroupHere: at => groupDialog({ want: at }),
    pickPhoto: at => void pickPhotos(at),
    captionPhoto: p => void captionAsk(p),
    deletePhoto: p => void deletePhotoAsk(p),
    importCopy: importDialog,
    exportBoard: () => { const b = board.value; void exportDialog('board', b.title || 'Untitled board', inline => exportBoard(desk.d.value, b, inline), () => boardMarkdown(desk.d.value, b)) },
    exportStack: s => void exportDialog('stack', s.name, inline => exportStack(desk.d.value, s, inline), () => stackMarkdown(desk.d.value, s)),
    saveBoardFile,
    openFile: () => void openCopyFile(),
    moveToPage: (it, to) => void moveToPage(it, to),
    deleteStack: s => void deleteStackAsk(s),
    editGroup: g => groupDialog({ group: g }),
    deleteGroup: g => void deleteGroupAsk(g),
    newGroupWith: s => groupDialog({ stack: s }),
    pickDue: dueDialog,
    titleNote: id => stackView.value?.titleNote(id),
    editor: (id, blockId) => stackView.value?.editorCommand(id, blockId),
    tableOp: (op, blockId) => stackView.value?.tableOp(op, blockId),
    inkUndo: () => shared.inkUndo(),
    inkClear: blockId => stackView.value?.clearInk(blockId),
    removeMedia: blockId => stackView.value?.removeBlock(blockId),
    setTool: t => { tool.value = t },
    tool: () => tool.value,
    flipPage: dir => boardView.value?.flip(dir),
    pages: () => shared.pages(),
})

async function boardMenu() {
    const el = boardBtn.value; if (!el) return
    const d = desk.d.value
    const items = [
        ...d.boards.map(b => {
            const n = dueCount(d, b.id)
            return { id: 'board.' + b.id, label: `${b.id === d.board ? '✓ ' : '   '}${b.title || 'Untitled board'}${n ? `  ·  ${n} due` : ''}` }
        }),
        { id: 'new', label: 'New board…' },
        { id: 'edit', label: 'Rename or recolour this board…' },
        { id: 'export', label: 'Export this board…' },
        { id: 'save-file', label: 'Save this board as a file…' },
        { id: 'open-file', label: 'Open a board file…' },
        { id: 'delete', label: 'Delete this board…', disabled: d.boards.length < 2, title: d.boards.length < 2 ? 'Keep at least one board' : undefined },
    ]
    const id = await ui.menu(el, items, { label: 'Boards' })
    if (!id) return
    if (id.startsWith('board.')) desk.switchBoard(id.slice(6))
    else if (id === 'new') newBoard()
    else if (id === 'edit') editBoardDialog()
    else if (id === 'export') shared.menus.handle('export-board', 'corkboard.board')
    else if (id === 'save-file') saveBoardFile()
    else if (id === 'open-file') void openCopyFile()
    else if (id === 'delete') void deleteBoardAsk()
}
async function appMenu() {
    const el = moreBtn.value; if (!el) return
    const d = desk.d.value
    const id = await ui.menu(el, [
        { id: 'pen', label: `${d.penMode ? '✓ ' : ''}Pen mode`, title: 'A pen draws anywhere on a note; touch scrolls; the mouse types.' },
        { id: 'hints', label: `${d.hints ? '✓ ' : ''}Key hints`, title: 'Small reminders of the keys and gestures where you are; each goes once you have used it a few times.' },
        { id: 'keys', label: 'Keyboard shortcuts and gestures…' },
        { id: 'import', label: 'Import a stack or a board…' },
    ])
    if (id === 'pen') { d.penMode = !d.penMode; desk.save() }
    else if (id === 'hints') { d.hints = !d.hints; desk.save() }
    else if (id === 'keys') void sdk.navigate?.('sys:keyboard', { newTab: true })
    else if (id === 'import') importDialog()
}
function toggleSnap() {
    desk.d.value.snap = !desk.d.value.snap; desk.save()
    desk.told(desk.d.value.snap ? 'Stacks snap to the grid. Hold Alt while dragging to place one freely.' : 'Stacks go where you drop them. Hold Alt while dragging to snap one.')
}

// ── Search ──────────────────────────────────────────────────────────────────
const query = ref('')
const searchOpen = ref(false)
const resultAt = ref(0)
let closeT: ReturnType<typeof setTimeout> | null = null
function closeSearchSoon() { closeT = setTimeout(() => { searchOpen.value = false }, 150) }
const results = computed(() => {
    void desk.tick.value
    const v = query.value.trim().toLowerCase()
    if (!v) return []
    const d = desk.d.value
    const out: { s: Stack; n: any; title: string; where: string; parts: string[]; here: boolean }[] = []
    for (const s of d.stacks) {
        const tags = [s.name, ...s.flags, s.due ? 'due' : ''].join(' ').toLowerCase()
        for (const id of s.notes) {
            const n = d.notes[id]; if (!n) continue
            const txt = ((n.title ? n.title + ' ' : '') + noteText(n)).replace(/\s+/g, ' ')
            const j = txt.toLowerCase().indexOf(v)
            if (j < 0 && !tags.includes(v)) continue
            const b = d.boards.find(x => x.id === s.board)
            const a = Math.max(0, j - 24)
            out.push({
                s, n, title: noteLabel(n) || 'Empty note', here: s.board === d.board,
                where: (s.board !== d.board ? (b?.title || 'Untitled board') + ' › ' : '') + s.name,
                parts: j < 0 ? [txt.slice(0, 80)] : [(a ? '…' : '') + txt.slice(a, j), txt.slice(j, j + v.length), txt.slice(j + v.length, j + v.length + 60)],
            })
        }
    }
    out.sort((x, y) => Number(y.here) - Number(x.here))
    return out.slice(0, 8)
})
function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); resultAt.value = Math.max(0, Math.min(results.value.length - 1, resultAt.value + (e.key === 'ArrowDown' ? 1 : -1))) }
    else if (e.key === 'Enter' && results.value[resultAt.value]) { e.preventDefault(); openResult(results.value[resultAt.value]) }
    else if (e.key === 'Escape' && query.value) { e.preventDefault(); query.value = '' }
    else resultAt.value = 0
}
function openResult(r: { s: Stack; n: any }) {
    query.value = ''; searchOpen.value = false; searchEl.value?.blur()
    desk.openStack(r.s.id, r.n.id)
}

// ── Paste on the board (a copy, a picture, some text) ────────────────────────
function onPaste(e: ClipboardEvent) {
    const t = e.target as HTMLElement
    if (t.closest?.('input, textarea, .cb-tx, .cb-sh-name')) {
        // a note's text: the editor takes text and pictures; only a copy is the widget's
        const text = e.clipboardData?.getData('text/plain') ?? ''
        if (t.closest('.cb-tx') && copyKind(text)) { e.preventDefault(); void importText(text) }
        return
    }
    const cd = e.clipboardData; if (!cd) return
    const file = [...cd.items].find(it => it.kind === 'file' && it.type.startsWith('image/'))?.getAsFile()
    if (file) { e.preventDefault(); void shared.addPicture(file, null); return }
    const text = cd.getData('text/plain'); if (!text) return
    e.preventDefault()
    if (copyKind(text)) { void importText(text); return }
    if (desk.focused.value) { stackView.value?.appendText(text); return }
    const s = desk.addStack(parseText(text)); desk.openStack(s.id)
}

// ── Commands (the key mapper) and menu choices ──────────────────────────────
function onCommand(id: string) {
    switch (id) {
        case 'new-note': desk.addNote(); stackView.value?.focusSoon(); return
        case 'find': searchEl.value?.focus(); searchEl.value?.select(); return
        case 'sketch': stackView.value?.editorCommand('sketch'); return
        case 'next-note': desk.stepNote(1); return
        case 'prev-note': desk.stepNote(-1); return
        case 'flag-important': { const s = desk.focused.value; if (s) desk.toggleFlag(s, 'important'); return }
        case 'ink-undo': if (desk.focused.value || photoId.value) shared.inkUndo(); return
        case 'next-page': boardView.value?.flip(1); return
        case 'prev-page': boardView.value?.flip(-1); return
        default: stackView.value?.editorCommand(id)
    }
}
function onMenuItem(m: WidgetMenuItemMessage) {
    shared.menus.handle(m.itemId, m.context, m.ref)
}
defineExpose({ onCommand, onMenuItem })

// ── Load, save ──────────────────────────────────────────────────────────────
const offs: Array<() => void> = []
onMounted(async () => {
    await desk.load()
    const life = sdk.lifecycle?.()
    if (life) { offs.push(life.onSuspend(() => { void desk.flush() })) }
})
onBeforeUnmount(() => { if (closeT) clearTimeout(closeT); offs.forEach(f => f()); void desk.flush() })
</script>

<!-- not scoped: the dialogs (GEM Shell popovers) use the same cb-* classes -->
<style src="./corkboard.css"></style>
