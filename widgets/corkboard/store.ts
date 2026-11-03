// widgets/corkboard/store.ts
//
// ONE COPY'S DESK (0.1.0): its boards, groups, stacks and notes, kept in the widget's own document
// 'desk-<sourceId>' (configRead / configWrite: per copy, as the Video Club's library). Saved shortly after a
// change (debounced) and at once when the widget is suspended, hidden or unmounted.
//
// Everything that changes the desk goes through here, so the board, the open stack and the menus agree:
// views (board ▸ group ▸ stack), stacks, notes, groups and their pins, boards, flags and due dates. A change
// that removes things takes a snapshot first: the snackbar's Undo puts it back.
// Pictures are GEM Shell image assets ('persistent'): made from pasted or dropped pictures and from copies;
// deleted a while after the last note using them is gone (not at once: Undo may bring the note back).
import { ref, computed, shallowRef, triggerRef, type Ref } from 'vue'
import type { WidgetSdk, GridRect } from 'gexplorer/widgets'
import {
    type DeskData, type Stack, type Group, type Board, type Note, type Block, type Item, type Place, type FlagId, type Photo,
    type PinColor, type Surface, type PaperColor,
    emptyDesk, newNote, newStack, uid, PHOTO_CAPTION_MAX, rndTilt, isEmptyNote, noteLabel, shorten, viewKey, okDate, PINS, FLAG_NAMES, dueInfo,
} from './model'
import { layoutView, placeNew, type Geometry } from './layout'
import { seedDesk } from './exchange'

const SAVE_MS = 700
const PICTURE_GRACE_MS = 20_000

export type Desk = ReturnType<typeof createDesk>
/** A picture to make an asset of: a pasted / dropped file, a copy's data: URL, or (0.2.1) a path from ui.openFiles. */
export type PictureSource = Blob | string | { path: string }

export function createDesk(sdk: WidgetSdk, sourceId: string) {
    const docName = 'desk-' + String(sourceId || 'default').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)
    const d: Ref<DeskData> = shallowRef(emptyDesk())
    const ready = ref(false)
    /** The board's last grid (Board.vue measures it): where new stacks go while a stack is open. */
    const geo = ref<Geometry>({ cols: 4, rows: 3, cell: 150, ox: 0, oy: 0, icon: false })
    /** Bumped on every change: what the views recompute from (the desk object is not deeply reactive). */
    const tick = ref(0)
    const changed = () => { tick.value++; triggerRef(d) }

    // ── Load / save ─────────────────────────────────────────────────────────
    let saveT: ReturnType<typeof setTimeout> | null = null
    let dirty = false

    async function load() {
        try {
            const doc = await sdk.configRead?.<DeskData>(docName)
            if (doc && doc.schema === 1 && Array.isArray(doc.boards) && doc.boards.length) d.value = normalize(doc)
            else { const fresh = emptyDesk(); seedDesk(fresh); d.value = fresh; dirty = true; void flush() }
        } catch (err) {
            console.warn('[corkboard] could not read the desk', err)
            const fresh = emptyDesk(); seedDesk(fresh); d.value = fresh
        }
        ready.value = true
        changed()
    }

    function save() {
        dirty = true
        changed()
        if (saveT) clearTimeout(saveT)
        saveT = setTimeout(() => { void flush() }, SAVE_MS)
    }

    async function flush() {
        if (saveT) { clearTimeout(saveT); saveT = null }
        if (!dirty || !sdk.configWrite) return
        dirty = false
        try { await sdk.configWrite(docName, d.value) }
        catch (err) { dirty = true; console.warn('[corkboard] could not save the desk', err) }
    }

    // ── Undo ────────────────────────────────────────────────────────────────
    let undoJson: string | null = null
    function snapshot() { undoJson = JSON.stringify(d.value) }
    /** A snackbar saying what happened, with Undo when a snapshot was taken just before. */
    function told(text: string, undo = false) {
        const ui = sdk.ui?.()
        if (!ui) return
        const json = undo ? undoJson : null
        void ui.snack({ id: 'corkboard', text, dedupe: 'replace', timeoutMs: undo ? 8000 : 3500, actions: json ? [{ id: 'undo', label: 'Undo' }] as any : undefined })
            .then(r => { if (json && r.type === 'action' && r.actionId === 'undo') { d.value = normalize(JSON.parse(json)); save() } })
    }

    // ── Views ───────────────────────────────────────────────────────────────
    const board = computed(() => { void tick.value; return d.value.boards.find(b => b.id === d.value.board) ?? d.value.boards[0] })
    const stackById = (id: string | null | undefined) => d.value.stacks.find(s => s.id === id) ?? null
    const groupById = (id: string | null | undefined) => d.value.groups.find(g => g.id === id) ?? null
    const photoById = (id: string | null | undefined) => d.value.photos.find(p => p.id === id) ?? null
    const itemById = (id: string): Item | null => stackById(id) ?? groupById(id) ?? photoById(id)
    const viewStacks = () => d.value.stacks.filter(s => s.board === d.value.board && (s.group ?? null) === (d.value.group ?? null))
    const viewGroups = () => d.value.group ? [] : d.value.groups.filter(g => g.board === d.value.board)
    const viewPhotos = () => d.value.photos.filter(p => p.board === d.value.board && (p.group ?? null) === (d.value.group ?? null))
    const viewItems = (): Item[] => [...viewGroups(), ...viewStacks(), ...viewPhotos()]
    /** NEW (0.2.0): the picture opened large (on the board shown), or null. */
    const openPhotoObj = computed(() => { void tick.value; const p = photoById(d.value.photo); return p && p.board === d.value.board ? p : null })
    const focused = computed(() => { void tick.value; return stackById(d.value.focus) })
    const openGroupObj = computed(() => { void tick.value; return groupById(d.value.group) })
    function activeNote(s: Stack): Note {
        if (!s.active || !s.notes.includes(s.active)) s.active = s.notes[0] ?? null
        if (!s.active) { const n = newNote(d.value, s); s.active = n.id }
        return d.value.notes[s.active!]
    }
    /** The column count the view's places were made with (the board's, or the open group's). */
    const viewCols = () => (d.value.group ? groupById(d.value.group)?.cols : board.value.cols) || 0
    const page = () => d.value.pages[viewKey(d.value.board, d.value.group)] ?? 0
    function setPage(p: number) { d.value.pages[viewKey(d.value.board, d.value.group)] = Math.max(0, p); save() }

    /** The view's layout now (Board.vue draws it; new stacks are placed against it). */
    function layoutNow(g = geo.value) {
        return layoutView(viewItems().map(i => ({ id: i.id, place: i.place })), viewCols(), g.cols, g.rows)
    }
    /** Saves the view's grid as shown (after a move or a resize), with the column count it was made for. */
    function commitView(rects: Map<string, GridRect>, cols: number) {
        for (const it of viewItems()) { const r = rects.get(it.id); if (r && 'rect' in it.place) it.place = { rect: { ...r } } }
        if (d.value.group) { const g = groupById(d.value.group); if (g) g.cols = cols } else board.value.cols = cols
        save()
    }
    /** A place for a new item in the current view: the cell asked for when free, else the first free one. */
    function newPlace(want?: { col: number; row: number }): Place {
        const L = layoutNow()
        if (viewCols() !== geo.value.cols) commitView(L.rects, geo.value.cols)
        return { rect: placeNew(L.rects, geo.value.cols, geo.value.rows, page(), want) }
    }

    // ── Moving an item to another page (0.2.2) ───────────────────────────────
    /**
     * Where `id` fits on page `to` of the view, the other items as they are in `rects`: its own size first, then
     * smaller (2 × 2 → 2 × 1 → 1 × 2 → 1 × 1). null: not even 1 × 1.
     */
    function spotOnPage(rects: Map<string, GridRect>, id: string, want: GridRect, to: number): GridRect | null {
        const { cols, rows } = geo.value
        const taken = new Set<string>()
        for (const [k, r] of rects) if (k !== id) for (let y = r.row; y < r.row + r.rowSpan; y++) for (let x = r.col; x < r.col + r.colSpan; x++) taken.add(x + ',' + y)
        const sizes = [[want.colSpan, want.rowSpan], [want.colSpan, 1], [1, want.rowSpan], [1, 1]]
            .filter(([c, r], i, a) => c <= cols && r <= rows && a.findIndex(o => o[0] === c && o[1] === r) === i)
        for (const [cs, rs] of sizes)
            for (let row = to * rows; row + rs <= (to + 1) * rows; row++)
                for (let col = 0; col + cs <= cols; col++) {
                    let free = true
                    for (let y = row; y < row + rs && free; y++) for (let x = col; x < col + cs; x++) if (taken.has(x + ',' + y)) { free = false; break }
                    if (free) return { col, row, colSpan: cs, rowSpan: rs }
                }
        return null
    }
    /**
     * Moves an item of the view to page `to` (the page count: a new page). Shrinks it to fit when it must. When it
     * can't fit even 1 × 1: { full, othersCould } — othersCould: making the larger items there smaller would make
     * room, which the widget offers; shrinkOthers: true does it (the largest first, as few as needed).
     */
    function moveToPage(it: Item, to: number, shrinkOthers = false): { ok: true } | { ok: false; othersCould: boolean } {
        const L = layoutNow(), rows = geo.value.rows
        if ('free' in it.place) {
            snapshot(); it.place = { free: { ...it.place.free, page: to } }; it.z = ++d.value.z
            save(); told(`Moved “${labelOf(it)}” to page ${to + 1}`, true); return { ok: true }
        }
        const rects = new Map(L.rects)
        const mine = rects.get(it.id) ?? { col: 0, row: 0, colSpan: 1, rowSpan: 1 }
        let spot = spotOnPage(rects, it.id, mine, to)
        const shrunk: string[] = []
        if (!spot) {
            const big = [...rects].filter(([k, r]) => k !== it.id && Math.floor(r.row / rows) === to && r.colSpan * r.rowSpan > 1)
                .sort((a, b) => b[1].colSpan * b[1].rowSpan - a[1].colSpan * a[1].rowSpan)
            const trial = new Map(rects)
            for (const [k, r] of big) {
                trial.set(k, { ...r, colSpan: 1, rowSpan: 1 }); shrunk.push(k)
                spot = spotOnPage(trial, it.id, mine, to)
                if (spot) break
            }
            if (!spot) return { ok: false, othersCould: false }
            if (!shrinkOthers) return { ok: false, othersCould: true }
            for (const k of shrunk) rects.set(k, trial.get(k)!)
        }
        snapshot()
        rects.set(it.id, spot)
        it.place = { rect: { ...spot } }; it.z = ++d.value.z
        commitView(rects, geo.value.cols)
        const smaller = spot.colSpan * spot.rowSpan < mine.colSpan * mine.rowSpan
        told(`Moved “${labelOf(it)}” to page ${to + 1}${smaller ? ', smaller to fit' : ''}${shrunk.length ? `; made ${shrunk.length} other${shrunk.length === 1 ? '' : 's'} there smaller` : ''}`, true)
        return { ok: true }
    }

    // ── Navigation ──────────────────────────────────────────────────────────
    function cleanupEmpty(s: Stack | null, keep?: string | null) {
        if (!s || !d.value.stacks.includes(s)) return
        s.notes = s.notes.filter(id => {
            if (id === keep) return true
            const n = d.value.notes[id]
            if (n && isEmptyNote(n)) { delete d.value.notes[id]; return false }
            return !!n
        })
        if (!s.notes.length && !s.flags.length && !s.due) d.value.stacks = d.value.stacks.filter(x => x !== s)
        else if (!s.notes.length) { const n = newNote(d.value, s); s.active = n.id }
    }
    function openStack(id: string, note?: string) {
        const prev = stackById(d.value.focus)
        if (prev && prev.id !== id) cleanupEmpty(prev)
        const s = stackById(id)
        if (!s) return
        d.value.board = s.board; d.value.group = s.group ?? null; d.value.focus = s.id; d.value.photo = null
        s.z = ++d.value.z
        if (note && s.notes.includes(note)) s.active = note
        save()
    }
    function closeStack() { cleanupEmpty(stackById(d.value.focus)); d.value.focus = null; save() }
    function openGroup(id: string) { d.value.group = id; d.value.focus = null; d.value.photo = null; save() }
    function leaveGroup() { d.value.group = null; d.value.focus = null; d.value.photo = null; save() }
    /** Back one level: the open stack, then the open group. false: nothing to go back from. */
    function goBack(): boolean {
        if (d.value.photo) { closePhoto(); return true }
        if (d.value.focus) { closeStack(); return true }
        if (d.value.group) { leaveGroup(); return true }
        return false
    }
    function switchBoard(id: string) {
        cleanupEmpty(stackById(d.value.focus))
        d.value.board = id; d.value.group = null; d.value.focus = null; d.value.photo = null; save()
    }
    function selectNote(id: string) {
        const s = focused.value
        if (!s || s.active === id) return
        cleanupEmpty(s, id); s.active = id; save()
    }
    function stepNote(dir: number) {
        const s = focused.value; if (!s) return
        const i = s.notes.indexOf(s.active ?? '')
        const j = Math.max(0, Math.min(s.notes.length - 1, i + dir))
        if (j !== i) selectNote(s.notes[j])
    }

    // ── Stacks and notes ────────────────────────────────────────────────────
    function addStack(blocks?: Block[] | null, o: Partial<Stack> = {}, want?: { col: number; row: number }): Stack {
        const s = newStack(d.value, { place: o.place ?? newPlace(want), ...o })
        d.value.stacks.push(s)
        const n = newNote(d.value, s, blocks)
        s.active = n.id
        if (s.autoName) { const t = noteLabel(n); if (t) s.name = shorten(t) }
        save()
        return s
    }
    /** A new note in the open stack (at its end), or a new stack on the board. */
    function addNote(): Stack {
        const s = focused.value
        if (!s) { const ns = addStack(); openStack(ns.id); return ns }
        const n = newNote(d.value, s)
        cleanupEmpty(s, n.id)
        s.active = n.id; save()
        return s
    }
    /** The stack's name follows its first line until the user names it. */
    function autoName(s: Stack) {
        if (!s.autoName || s.notes.length !== 1) return
        const t = noteLabel(d.value.notes[s.notes[0]])
        s.name = t ? shorten(t) : 'New stack'
    }
    function mergeInto(src: Stack, dst: Stack) {
        snapshot()
        const k = src.notes.length
        for (const id of src.notes) { const n = d.value.notes[id]; if (n && dst.numbered) n.num = dst.nextNum++; dst.notes.push(id) }
        dst.flags = [...new Set([...dst.flags, ...src.flags])]
        if (!dst.due) dst.due = src.due
        d.value.stacks = d.value.stacks.filter(x => x !== src)
        dst.z = ++d.value.z
        save(); told(`Piled ${k} note${k === 1 ? '' : 's'} onto “${dst.name}”`, true)
    }
    function swapPlaces(a: Item, b: Item, rects: Map<string, GridRect>) {
        const pa: Place = 'rect' in a.place ? { rect: { ...rects.get(a.id)! } } : a.place
        const pb: Place = 'rect' in b.place ? { rect: { ...rects.get(b.id)! } } : b.place
        if ('rect' in pa && 'rect' in pb) {
            a.place = { rect: { ...pb.rect, colSpan: pa.rect.colSpan, rowSpan: pa.rect.rowSpan } }
            b.place = { rect: { ...pa.rect, colSpan: pb.rect.colSpan, rowSpan: pb.rect.rowSpan } }
        } else { a.place = pb; b.place = pa }
        save()
    }
    function itemsOf(boardId: string, groupId: string | null): Item[] {
        return [...(groupId ? [] : d.value.groups.filter(g => g.board === boardId)), ...d.value.stacks.filter(s => s.board === boardId && (s.group ?? null) === groupId),
            ...d.value.photos.filter(p => p.board === boardId && (p.group ?? null) === groupId)]
    }
    /** A place at the end of another view (a group, a board): first free spot after what it holds. */
    function placeIn(boardId: string, groupId: string | null, except?: Item): Place {
        const cols = (groupId ? groupById(groupId)?.cols : d.value.boards.find(b => b.id === boardId)?.cols) || geo.value.cols
        const L = layoutView(itemsOf(boardId, groupId).filter(i => i !== except).map(i => ({ id: i.id, place: i.place })), cols, cols, geo.value.rows)
        return { rect: placeNew(L.rects, cols, geo.value.rows, 0) }
    }
    function joinGroup(s: Stack | Photo, g: Group) {
        snapshot()
        s.place = placeIn(g.board, g.id, s); s.group = g.id; s.board = g.board
        save(); told(`Pinned “${labelOf(s)}” to “${g.name}”`, true)
    }
    function leaveGroupWith(s: Stack | Photo) {
        snapshot()
        const g = groupById(s.group)
        s.place = placeIn(s.board, null, s); s.group = null
        if (d.value.focus === s.id || d.value.photo === s.id) d.value.group = null
        save(); told(`Took “${labelOf(s)}” out of “${g?.name ?? 'the group'}”`, true)
    }
    function moveStackToBoard(s: Stack, b: Board) {
        snapshot()
        s.place = placeIn(b.id, null, s); s.board = b.id; s.group = null
        if (d.value.focus === s.id) d.value.focus = null
        save(); told(`Moved “${s.name}” to “${b.title || 'Untitled board'}”`, true)
    }
    function stackOfNote(noteId: string) { return d.value.stacks.find(x => x.notes.includes(noteId)) ?? null }
    /** A note to another stack of the view, or (dstId null) into a new stack of its own. */
    function moveNote(noteId: string, dstId: string | null) {
        const s = stackOfNote(noteId), n = d.value.notes[noteId]
        if (!s || !n) return
        snapshot()
        const from = s.notes.indexOf(noteId)
        s.notes.splice(from, 1)
        let dst = stackById(dstId)
        if (dst) { if (dst.numbered) n.num = dst.nextNum++; dst.notes.push(noteId); dst.active = noteId }
        else {
            dst = newStack(d.value, { board: s.board, group: s.group, place: placeIn(s.board, s.group) })
            d.value.stacks.push(dst); dst.notes.push(noteId); dst.active = noteId
            const t = noteLabel(n); if (t) dst.name = shorten(t)
        }
        if (!s.notes.length) { d.value.stacks = d.value.stacks.filter(x => x !== s); if (d.value.focus === s.id) d.value.focus = dst.id }
        else s.active = s.notes[Math.min(from, s.notes.length - 1)]
        save(); told(`Moved to “${dst.name}”`, true)
    }
    function reorderNote(noteId: string, to: number) {
        const s = stackOfNote(noteId); if (!s) return
        const from = s.notes.indexOf(noteId)
        s.notes.splice(from, 1)
        s.notes.splice(to > from ? to - 1 : to, 0, noteId)
        save()
    }
    function duplicateNote(noteId: string) {
        const s = stackOfNote(noteId), n = d.value.notes[noteId]
        if (!s || !n) return
        const copy: Note = JSON.parse(JSON.stringify(n))
        copy.id = uid(); copy.blocks.forEach(b => { b.id = uid() }); copy.num = s.numbered ? s.nextNum++ : 0; copy.updated = Date.now()
        d.value.notes[copy.id] = copy
        s.notes.splice(s.notes.indexOf(noteId) + 1, 0, copy.id); s.active = copy.id
        save(); told('Note duplicated')
    }
    function deleteNote(noteId: string) {
        const s = stackOfNote(noteId); if (!s) return
        snapshot()
        const i = s.notes.indexOf(noteId)
        s.notes.splice(i, 1); forgetNote(noteId)
        if (!s.notes.length) { d.value.stacks = d.value.stacks.filter(x => x !== s); if (d.value.focus === s.id) d.value.focus = null }
        else s.active = s.notes[Math.min(i, s.notes.length - 1)]
        save(); told('Note deleted', true)
    }
    function deleteStack(s: Stack) {
        snapshot()
        d.value.stacks = d.value.stacks.filter(x => x !== s)
        s.notes.forEach(forgetNote)
        if (d.value.focus === s.id) d.value.focus = null
        save(); told(`Deleted “${s.name}”`, true)
    }
    function forgetNote(id: string) {
        const n = d.value.notes[id]; if (!n) return
        for (const b of n.blocks) if (b.t === 'img') forgetPictureLater(b.asset)
        delete d.value.notes[id]
    }
    function toggleFlag(s: Stack, f: FlagId) {
        const i = s.flags.indexOf(f)
        if (i >= 0) s.flags.splice(i, 1); else s.flags.push(f)
        save(); told(`${i >= 0 ? 'Removed' : 'Flagged'} “${FLAG_NAMES[f]}”`)
    }
    function setDue(t: Stack | Group, date: string | null) {
        t.due = okDate(date); save()
        const i = dueInfo(t.due); if (i) told(`Due ${i.long}`)
    }
    function setColor(s: Stack, c: PaperColor) { s.color = c; save() }

    // ── Groups (a pin with an optional due date) ────────────────────────────
    function createGroup(o: { name: string; due: string | null; stack?: Stack; want?: { col: number; row: number } }): Group {
        snapshot()
        const g: Group = { id: uid(), kind: 'group', board: d.value.board, name: o.name.trim().slice(0, 40) || 'Group', pin: PINS[d.value.groups.length % PINS.length], due: okDate(o.due), place: { rect: { col: 0, row: 0, colSpan: 1, rowSpan: 1 } }, tilt: rndTilt(), z: ++d.value.z, cols: 0 }
        if (o.stack && 'rect' in o.stack.place) {
            const L = layoutNow(); const r = L.rects.get(o.stack.id)
            g.place = { rect: { ...(r ?? o.stack.place.rect), colSpan: 1, rowSpan: 1 } }
            o.stack.group = g.id; o.stack.place = { rect: { col: 0, row: 0, colSpan: 1, rowSpan: 1 } }
        } else g.place = newPlace(o.want)
        d.value.groups.push(g)
        save(); told(o.stack ? `Pinned “${o.stack.name}” in the new group “${g.name}”` : `Created the group “${g.name}”: drop stacks on its pin`, true)
        return g
    }
    function editGroup(g: Group, name: string, due: string | null) { g.name = name.trim().slice(0, 40) || g.name; g.due = okDate(due); save() }
    function setPin(g: Group, pin: PinColor) { g.pin = pin; save() }
    function ungroup(g: Group) {
        snapshot()
        const keep = 'rect' in g.place ? g.place.rect : null
        d.value.groups = d.value.groups.filter(x => x !== g)
        ;[...d.value.stacks.filter(s => s.group === g.id), ...d.value.photos.filter(p => p.group === g.id)].forEach((s, i) => {
            s.group = null
            s.place = i === 0 && keep ? { rect: { ...keep, colSpan: 1, rowSpan: 1 } } : placeIn(g.board, null, s)
        })
        if (d.value.group === g.id) d.value.group = null
        save(); told(`Ungrouped “${g.name}”`, true)
    }
    function deleteGroup(g: Group) {
        snapshot()
        for (const s of d.value.stacks.filter(x => x.group === g.id)) s.notes.forEach(forgetNote)
        d.value.stacks = d.value.stacks.filter(x => x.group !== g.id)
        for (const p of d.value.photos.filter(x => x.group === g.id)) forgetPictureLater(p.asset)
        d.value.photos = d.value.photos.filter(x => x.group !== g.id)
        d.value.groups = d.value.groups.filter(x => x !== g)
        if (d.value.group === g.id) { d.value.group = null; d.value.focus = null }
        save(); told(`Deleted “${g.name}”`, true)
    }

    // ── Boards ──────────────────────────────────────────────────────────────
    function createBoard(title: string, surface: Surface): Board {
        const b: Board = { id: uid(), title: title.trim().slice(0, 40), surface, cols: 0 }
        d.value.boards.push(b)
        switchBoard(b.id); told(`Created “${b.title || 'Untitled board'}”`)
        return b
    }
    function editBoard(b: Board, title: string, surface: Surface) { b.title = title.trim().slice(0, 40); b.surface = surface; save() }
    function deleteBoard(b: Board) {
        if (d.value.boards.length < 2) return
        snapshot()
        for (const s of d.value.stacks.filter(x => x.board === b.id)) s.notes.forEach(forgetNote)
        d.value.stacks = d.value.stacks.filter(x => x.board !== b.id)
        d.value.groups = d.value.groups.filter(x => x.board !== b.id)
        for (const p of d.value.photos.filter(x => x.board === b.id)) forgetPictureLater(p.asset)
        d.value.photos = d.value.photos.filter(x => x.board !== b.id)
        if (d.value.photo && !d.value.photos.some(p => p.id === d.value.photo)) d.value.photo = null
        d.value.boards = d.value.boards.filter(x => x !== b)
        d.value.board = d.value.boards[0].id; d.value.group = null; d.value.focus = null
        save(); told(`Deleted “${b.title || 'Untitled board'}”`, true)
    }

    // ── Pictures ────────────────────────────────────────────────────────────
    /** A picture asset from a pasted / dropped file or a copy's data (null: refused, told to the user). */
    async function makePicture(data: PictureSource): Promise<{ asset: string; url: string; w: number; h: number } | null> {
        if (!sdk.mediaImageCreate) { told('Pictures need the Media permission for GEM Corkboard.'); return null }
        try {
            const opts = { width: 1600, format: 'png' as const, storage: 'persistent' as const }
            const img = typeof data === 'object' && 'path' in data
                ? await sdk.mediaImageCreate({ type: 'file', path: data.path }, opts)   // chosen in GEM Shell's file dialog
                : await sdk.mediaImageCreate({ type: 'bytes', data: typeof data === 'string' ? await (await fetch(data)).blob() : data }, opts)
            return { asset: img.assetId, url: img.url, w: img.width, h: img.height }
        } catch (err: any) {
            console.warn('[corkboard] picture refused', err)
            told(err?.code === 'E_QUOTA' ? 'The Corkboard is out of room for pictures.' : "That picture couldn't be added.")
            return null
        }
    }
    /**
     * A picture as data: for a copy (null: unreadable, left out of the copy). compact (0.2.2, a file): WebP when that
     * is smaller, so a board of photos stays under the 8 MB a Corkboard opens.
     */
    async function inlinePicture(url: string, compact = false): Promise<string | null> {
        try {
            let blob = await (await fetch(url)).blob()
            if (compact && typeof OffscreenCanvas !== 'undefined') {
                try {
                    const bm = await createImageBitmap(blob), c = new OffscreenCanvas(bm.width, bm.height)
                    c.getContext('2d')!.drawImage(bm, 0, 0); bm.close()
                    const w = await c.convertToBlob({ type: 'image/webp', quality: 0.9 })
                    if (w.type === 'image/webp' && w.size < blob.size) blob = w
                } catch { /* the original */ }
            }
            return await new Promise<string | null>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(blob) })
        } catch { return null }
    }
    function forgetPictureLater(asset: string) {
        setTimeout(() => {
            const used = Object.values(d.value.notes).some(n => n.blocks.some(b => b.t === 'img' && b.asset === asset)) || d.value.photos.some(p => p.asset === asset)
            if (!used) void sdk.mediaImageDelete?.(asset).catch(() => { })
        }, PICTURE_GRACE_MS)
    }

    // ── Pictures pinned on the board (0.2.0) ─────────────────────────────────
    /** A picture file pinned on the view (at a cell when asked), as a print. A wide one takes two cells when free. */
    async function addPhoto(file: PictureSource, want?: { col: number; row: number } | null, caption = ''): Promise<Photo | null> {
        const pic = await makePicture(file)
        if (!pic) return null
        const place = newPlace(want ?? undefined)
        if ('rect' in place && pic.w > pic.h * 1.45) {
            const L = layoutNow(), r = place.rect
            const taken = [...L.rects.values()].some(o => o.row <= r.row && r.row < o.row + o.rowSpan && o.col <= r.col + 1 && r.col + 1 < o.col + o.colSpan)
            if (r.col + 1 < geo.value.cols && !taken) r.colSpan = 2
        }
        const p: Photo = { id: uid(), kind: 'photo', board: d.value.board, group: d.value.group, ...pic, caption: caption.slice(0, PHOTO_CAPTION_MAX), ink: [], place, tilt: rndTilt(), z: ++d.value.z }
        d.value.photos.push(p)
        used('pin-picture')
        save(); told('Picture pinned: click it to see it large and draw on it')
        return p
    }
    function openPhoto(id: string) { const p = photoById(id); if (!p) return; p.z = ++d.value.z; d.value.photo = id; save() }
    function closePhoto() { d.value.photo = null; save() }
    function setCaption(p: Photo, text: string) { p.caption = text.replace(/\s+/g, ' ').slice(0, PHOTO_CAPTION_MAX); save() }
    function deletePhoto(p: Photo) {
        snapshot()
        d.value.photos = d.value.photos.filter(x => x !== p)
        if (d.value.photo === p.id) d.value.photo = null
        forgetPictureLater(p.asset)
        save(); told('Picture taken off the board', true)
    }
    function labelOf(it: Item): string { return it.kind === 'photo' ? (it.caption || 'Picture') : it.name }

    // ── Hints learned ───────────────────────────────────────────────────────
    function used(id: string) { d.value.learned[id] = (d.value.learned[id] ?? 0) + 1; dirty = true }
    const learned = (id: string) => (d.value.learned[id] ?? 0) >= 3

    return {
        d, ready, geo, tick, load, save, flush, snapshot, told,
        board, focused, openGroupObj, stackById, groupById, photoById, itemById, viewStacks, viewGroups, viewPhotos, viewItems, activeNote,
        openPhotoObj, addPhoto, openPhoto, closePhoto, setCaption, deletePhoto, labelOf,
        viewCols, page, setPage, layoutNow, commitView, newPlace, moveToPage,
        openStack, closeStack, openGroup, leaveGroup, goBack, switchBoard, selectNote, stepNote,
        addStack, addNote, autoName, mergeInto, swapPlaces, joinGroup, leaveGroupWith, moveStackToBoard, moveNote, reorderNote,
        duplicateNote, deleteNote, deleteStack, toggleFlag, setDue, setColor, cleanupEmpty, stackOfNote,
        createGroup, editGroup, setPin, ungroup, deleteGroup, createBoard, editBoard, deleteBoard,
        makePicture, inlinePicture, forgetPictureLater, used, learned,
    }
}

/** A document read back: the fields this version knows, with safe defaults (an older or hand-edited one). */
import { fitWidths } from './table'
function normalize(doc: DeskData): DeskData {
    const base = emptyDesk()
    const o: DeskData = { ...base, ...doc }
    o.boards = (o.boards ?? []).filter(b => b && b.id)
    if (!o.boards.length) o.boards = base.boards
    if (!o.boards.some(b => b.id === o.board)) o.board = o.boards[0].id
    o.stacks = (o.stacks ?? []).filter(s => s && s.id && Array.isArray(s.notes)).map(s => ({ ...s, flags: s.flags ?? [], due: s.due ?? null, group: s.group ?? null }))
    o.groups = (o.groups ?? []).filter(g => g && g.id)
    o.notes = o.notes ?? {}
    // NEW (0.2.0): a 0.1 desk has no pictures on its boards; a table's widths are made to fit its columns
    o.photos = (Array.isArray(o.photos) ? o.photos : []).filter(p => p && p.id && p.url && o.boards.some(b => b.id === p.board)).map(p => ({ ...p, caption: p.caption ?? '', ink: p.ink ?? [], group: p.group ?? null }))
    if (o.photo && !o.photos.some(p => p.id === o.photo)) o.photo = null
    for (const n of Object.values(o.notes)) for (const b of n?.blocks ?? []) if (b.t === 'table') fitWidths(b)
    o.learned = o.learned ?? {}
    o.pages = o.pages ?? {}
    if (o.group && !o.groups.some(g => g.id === o.group)) o.group = null
    if (o.focus && !o.stacks.some(s => s.id === o.focus)) o.focus = null
    return o
}

export type { DeskData, Stack, Group, Board, Note }
