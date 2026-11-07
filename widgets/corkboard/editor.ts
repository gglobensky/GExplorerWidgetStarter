// widgets/corkboard/editor.ts
//
// THE NOTE EDITOR (0.1.0): a note's blocks drawn into its page and edited in place. One contenteditable per
// text block, so the caret, Enter and Backspace are the editor's own and lists behave as agreed with Guillaume:
//   - "- ", "[ ] ", "1. ", "# " at the start of a line make a bullet, a checkbox, a number, a heading;
//   - Enter on an empty item steps out one level; Shift+Enter ends the list at once and goes on as plain text
//     lined up under the item; Backspace at an item's start makes it plain text, then outdents;
//     0.2.5: Shift+Enter is a new line in the same item (line-break); ending the list: Down on the last item, Enter
//     on an empty one, or End the list (end-list, no key by default);
//   - Tab / Shift+Tab indent from anywhere in the line.
// Keys with Ctrl / Alt (and Shift+Enter, Tab) are the key mapper's: entry.ts commands with whileTyping, run here
// through command(id). The editor's own element listens to Enter, Backspace, Delete and the arrows only (a
// control's own keys: README "Keys"), and never to a key the shell already took (defaultPrevented).
// Not handled (known limits): a selection across several lines, the browser's undo after a structural change.
// NEW (0.2.0): tables (table.ts), one contenteditable per cell. In a cell, the list commands move the caret:
// Indent (Tab) to the next cell (a new row after the last), Outdent to the previous, End the list (0.2.5: no key by default)
// out of the table; Enter goes down a row (a new row at the bottom; on an empty last row: out of the table); the
// arrows cross cells at their edges and step out of the table above and below.
import { type Note, type Block, type TextBlock, type TableBlock, type Stroke, type BlockType, blk, isText, hasInk, newTable, uid, textOf, cleanHtml, prefixRule, parseLine, esc } from './model'
import { tableHTML, addRow, addCol, delRow, delCol, moveRow, rowEmpty, parseTSV, fillFrom, colsOf } from './table'
import { beginInk, drawInk, type InkUndo, type InkGesture } from 'gexplorer/widgets'
import { CB_LOOK, type InkTool } from './model'

const BUL = ['•', '◦', '▪']

export type EditorHost = {
    note(): Note
    /** Something changed (save). structural: the blocks changed, not only a text (tabs, title, stack name). */
    changed(structural: boolean): void
    /** A hint's key or gesture was used (hints fade once learned). */
    used(id: string): void
    tool(): InkTool
    penMode(): boolean
    inkDone(u: InkUndo): void
    /** A picture pasted or dropped into the note, after block `afterId` (null: at the end). */
    picture(file: File, afterId: string | null): void
    /** A right-click: on text, on a drawing, on a table's cell (0.2.0): its block. */
    menu(e: MouseEvent, kind: 'text' | 'ink' | 'table', blockId: string): void
    /** Where the caret is changed (the footer's hints follow it). */
    moved(): void
    /**
     * NEW (0.1.1): the key is one of the Corkboard's commands now (the user's keys): the editor leaves it to the key
     * mapper. Plain keys (Down, Enter, Tab...) reach GEM Shell's dispatcher after the widget's own listeners: the
     * editor handling one first (Down moving to the next line) kept a command bound to it from running.
     */
    isCommandKey(e: KeyboardEvent): boolean
}

export type CaretState = { kind: 'none' | 'text' | 'media' | 'cell'; t?: BlockType; lvl?: number; empty?: boolean }
type CellCtx = { cell: HTMLElement; n: Note; i: number; b: TableBlock; r: number; c: number }

export class NoteEditor {
    private blocksEl: HTMLElement
    private marginSvg: SVGSVGElement
    private lastBlock: string | null = null
    private gesture: InkGesture | null = null
    /** While the blocks are drawn again: a focusout then is the old element going, not the user leaving a line. */
    private rendering = false
    /** The note drawn last (its empty lines are dropped when another one is drawn). */
    private shown: Note | null = null
    /** The table cell last focused or right-clicked (the table menu acts there). */
    private lastCell: { id: string; r: number; c: number } | null = null
    overMedia = false

    constructor(private page: HTMLElement, private host: EditorHost) {
        page.replaceChildren()
        this.blocksEl = document.createElement('div')
        this.blocksEl.className = 'cb-blocks'
        this.marginSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        this.marginSvg.setAttribute('class', 'cb-margin-ink')
        this.marginSvg.setAttribute('aria-hidden', 'true')
        page.append(this.blocksEl, this.marginSvg)
        page.addEventListener('input', this.onInput)
        page.addEventListener('keydown', this.onKey)
        page.addEventListener('paste', this.onPaste)
        page.addEventListener('drop', this.onDrop)
        page.addEventListener('dragover', this.onDragOver)
        page.addEventListener('focusin', this.onFocusIn)
        page.addEventListener('focusout', this.onFocusOut)
        page.addEventListener('click', this.onClick)
        page.addEventListener('pointerdown', this.onPointerDown)
        page.addEventListener('contextmenu', this.onContextMenu)
        page.addEventListener('pointerover', this.onPointerOver)
        page.addEventListener('keyup', this.onCaret)
        page.addEventListener('mouseup', this.onCaret)
    }

    destroy() {
        if (this.shown && pruneEmpty(this.shown)) this.host.changed(true)
        const p = this.page
        p.removeEventListener('focusout', this.onFocusOut)
        p.removeEventListener('input', this.onInput); p.removeEventListener('keydown', this.onKey); p.removeEventListener('paste', this.onPaste)
        p.removeEventListener('drop', this.onDrop); p.removeEventListener('dragover', this.onDragOver); p.removeEventListener('focusin', this.onFocusIn)
        p.removeEventListener('click', this.onClick); p.removeEventListener('pointerdown', this.onPointerDown); p.removeEventListener('contextmenu', this.onContextMenu)
        p.removeEventListener('pointerover', this.onPointerOver); p.removeEventListener('keyup', this.onCaret); p.removeEventListener('mouseup', this.onCaret)
    }

    // ── Drawing ─────────────────────────────────────────────────────────────

    render(focus?: { id: string; off: number }, noScroll = false) {
        const n = this.host.note()
        if (this.shown && this.shown !== n && pruneEmpty(this.shown)) this.host.changed(true)
        this.shown = n
        if (!n.blocks.some(isText)) n.blocks.push(blk())
        this.rendering = true
        try { this.draw(n, focus, noScroll) } finally { this.rendering = false }
    }
    private draw(n: Note, focus?: { id: string; off: number }, noScroll = false) {
        const cnt: number[] = []
        const parts: string[] = []
        for (const b of n.blocks) {
            const L = b.lvl || 0
            cnt.length = L + 1
            let num = 0
            if (b.t === 'n') { cnt[L] = (cnt[L] || 0) + 1; num = cnt[L] } else cnt[L] = 0
            parts.push(blockHTML(b, num))
        }
        this.blocksEl.innerHTML = parts.join('')
        this.updateBlank()
        for (const m of this.blocksEl.querySelectorAll<HTMLElement>('.cb-media')) {
            const b = n.blocks.find(x => x.id === m.dataset.id)
            if (b && hasInk(b)) drawInk(m.querySelector('svg'), b.ink, CB_LOOK)
        }
        drawInk(this.marginSvg, n.ink, CB_LOOK)
        if (focus) this.focusBlock(focus.id, focus.off, noScroll)
    }

    private updateBlank() {
        const n = this.host.note()
        const only = n.blocks.length === 1 ? n.blocks[0] : null
        this.blocksEl.classList.toggle('blank', !!only && isText(only) && !textOf(only.html).trim())
    }

    // ── Caret ───────────────────────────────────────────────────────────────

    private tx(id: string) { return this.blocksEl.querySelector<HTMLElement>(`.cb-blk[data-id="${id}"] .cb-tx`) }
    focusBlock(id: string, off: number, noScroll = false) {
        const tx = this.tx(id); if (!tx) return
        tx.focus({ preventScroll: noScroll }); setCaret(tx, off)
    }
    /** The caret at the end of the last text block, the page scrolled to its top (a stack or a note opened). */
    focusEnd() {
        const t = [...this.host.note().blocks].reverse().find(isText)
        if (t) this.focusBlock(t.id, Infinity, true)
    }
    private active(): { tx: HTMLElement; n: Note; i: number; b: TextBlock } | null {
        const a = document.activeElement as HTMLElement | null
        const tx = a?.closest?.<HTMLElement>('.cb-tx')
        if (!tx || !this.page.contains(tx)) return null
        return this.ctx(tx)
    }
    private ctx(tx: HTMLElement) {
        const id = tx.closest<HTMLElement>('.cb-blk')!.dataset.id
        const n = this.host.note()
        const i = n.blocks.findIndex(b => b.id === id)
        return { tx, n, i, b: n.blocks[i] as TextBlock }
    }
    caretState(): CaretState {
        if (this.overMedia) return { kind: 'media' }
        if (this.activeCell()) return { kind: 'cell' }
        const c = this.active()
        if (!c) return { kind: 'none' }
        return { kind: 'text', t: c.b.t, lvl: c.b.lvl || 0, empty: !c.tx.textContent?.trim() }
    }
    /** The block the user last had the caret in (where a sketch or picture is inserted). */
    get currentBlock() { return this.lastBlock }

    // ── Commands (entry.ts, run by the key mapper or a menu) ────────────────

    /** Runs an editor command on the line with the caret (or `blockId`'s). false: no line to run it on. */
    command(id: string, blockId?: string): boolean {
        const cc = this.activeCell()
        if (cc && (!blockId || blockId === cc.b.id)) { const done = this.cellCommand(id, cc); if (done) this.host.used(id); return done }
        let c = this.active()
        if (blockId && (!c || c.b.id !== blockId)) { const tx = this.tx(blockId); if (!tx) return false; c = this.ctx(tx) }
        if (!c) return false
        switch (id) {
            case 'end-list': this.enter(c, true); break
            case 'line-break': lineBreak(c.tx); break
            case 'indent': this.indent(c, 1); break
            case 'outdent': this.indent(c, -1); break
            case 'check': this.toggleCheck(c); break
            case 'bullet': this.setType(c, 'b'); break
            case 'numbered': this.setType(c, 'n'); break
            case 'checklist': this.setType(c, 'c'); break
            case 'heading': this.setType(c, 'h'); break
            case 'plain': this.setType(c, 'p'); break
            case 'line-up': this.moveLine(c, -1); break
            case 'line-down': this.moveLine(c, 1); break
            default: return false
        }
        this.host.used(id)
        return true
    }

    private indent(c: { tx: HTMLElement; b: TextBlock }, dir: number) {
        const off = textOffset(c.tx); c.b.html = c.tx.innerHTML
        c.b.lvl = clamp((c.b.lvl || 0) + dir, 0, 6)
        if (c.b.t === 'h') c.b.t = 'p'
        this.structural({ id: c.b.id, off })
    }
    private toggleCheck(c: { tx: HTMLElement; b: TextBlock }) {
        const off = textOffset(c.tx); c.b.html = c.tx.innerHTML
        if (c.b.t === 'c') c.b.checked = !c.b.checked
        else { if (c.b.t === 'p') c.b.lvl = Math.max(0, (c.b.lvl || 0) - 1); c.b.t = 'c'; c.b.checked = false }
        this.structural({ id: c.b.id, off })
    }
    /** To type t (the same type again: plain text). Plain text stays lined up with where the item's text was. */
    private setType(c: { tx: HTMLElement; b: TextBlock }, t: BlockType) {
        const off = textOffset(c.tx); const b = c.b; b.html = c.tx.innerHTML
        if (b.t === t && t !== 'p') t = 'p'
        if (t === 'p') { if (b.t !== 'p' && b.t !== 'h') b.lvl = Math.min(6, (b.lvl || 0) + 1); b.t = 'p'; b.checked = false }
        else if (t === 'h') { b.t = 'h'; b.lvl = 0; b.checked = false }
        else { if (b.t === 'p') b.lvl = Math.max(0, (b.lvl || 0) - 1); if (b.t === 'h') b.lvl = 0; b.t = t; if (t !== 'c') b.checked = false }
        this.structural({ id: b.id, off })
    }
    private moveLine(c: { tx: HTMLElement; n: Note; i: number; b: TextBlock }, dir: number) {
        const j = c.i + dir
        if (j < 0 || j >= c.n.blocks.length) return
        const off = textOffset(c.tx); c.b.html = c.tx.innerHTML
        ;[c.n.blocks[c.i], c.n.blocks[j]] = [c.n.blocks[j], c.n.blocks[c.i]]
        this.structural({ id: c.b.id, off })
    }
    private enter(c: { tx: HTMLElement; n: Note; i: number; b: TextBlock }, shift: boolean) {
        const { tx, n, i, b } = c
        const empty = !(tx.textContent ?? '').replace(/ /g, ' ').trim()
        if (empty && !shift && (b.t !== 'p' || b.lvl > 0)) {
            if (b.t === 'h') b.t = 'p'
            else if (b.t !== 'p') { if (b.lvl > 0) b.lvl--; else { b.t = 'p'; b.checked = false } }
            else b.lvl--
            this.host.used('step-out')
            b.html = ''
            this.structural({ id: b.id, off: 0 })
            return
        }
        const tail = tailFrom(tx); b.html = cleanHtml(tx.innerHTML)
        const nb = shift ? blk('p', b.t === 'p' || b.t === 'h' ? b.lvl : Math.min(6, b.lvl + 1)) : blk(b.t === 'h' ? 'p' : b.t, b.lvl)
        nb.html = cleanHtml(tail)
        n.blocks.splice(i + 1, 0, nb)
        this.structural({ id: nb.id, off: 0 })
    }
    private structural(focus?: { id: string; off: number }) {
        this.render(focus)
        this.host.changed(true)
    }

    // ── Inserting ───────────────────────────────────────────────────────────

    /** A block after `afterId` (default: the line last edited, else the end), with a text line after it. */
    insertAfter(nb: Block, afterId?: string | null): TextBlock {
        const n = this.host.note()
        let i = n.blocks.findIndex(b => b.id === (afterId ?? this.lastBlock))
        if (i < 0) i = n.blocks.length - 1
        const cur = n.blocks[i]
        if (cur && isText(cur)) { const tx = this.tx(cur.id); if (tx) cur.html = tx.innerHTML }
        n.blocks.splice(i + 1, 0, nb)
        let next = n.blocks[i + 2]
        if (!next || !isText(next)) { next = blk(); n.blocks.splice(i + 2, 0, next) }
        this.render()
        this.host.changed(true)
        this.blocksEl.querySelector(`.cb-blk[data-id="${nb.id}"]`)?.scrollIntoView({ block: 'nearest' })
        return next as TextBlock
    }
    insertSketch(afterId?: string | null) {
        const next = this.insertAfter({ id: uid(), t: 'ink', lvl: 0, h: 380, ink: [] }, afterId)
        this.focusBlock(next.id, 0, true)
    }
    removeBlock(id: string) {
        const n = this.host.note()
        n.blocks = n.blocks.filter(b => b.id !== id)
        this.structural()
    }

    // ── Tables (0.2.0) ──────────────────────────────────────────────────────

    private cellEl(id: string, r: number, c: number) {
        return this.blocksEl.querySelector<HTMLElement>(`.cb-blk[data-id="${id}"] .cb-cell[data-r="${r}"][data-c="${c}"]`)
    }
    focusCell(id: string, r: number, c: number, off = 0) {
        const el = this.cellEl(id, r, c); if (!el) return
        el.focus({ preventScroll: false }); setCaret(el, off)
        this.lastCell = { id, r, c }
    }
    private cellCtx(cell: HTMLElement): CellCtx {
        const id = cell.closest<HTMLElement>('.cb-blk')!.dataset.id
        const n = this.host.note()
        const i = n.blocks.findIndex(b => b.id === id)
        return { cell, n, i, b: n.blocks[i] as TableBlock, r: +(cell.dataset.r ?? 0), c: +(cell.dataset.c ?? 0) }
    }
    private activeCell(): CellCtx | null {
        const a = document.activeElement as HTMLElement | null
        const cell = a?.closest?.<HTMLElement>('.cb-cell')
        if (!cell || !this.page.contains(cell)) return null
        return this.cellCtx(cell)
    }
    /** Out of the table, above (dir -1, the caret at the end of the line) or below (+1: a line made when none). */
    private leaveTable(n: Note, i: number, dir: number) {
        if (dir < 0) { const t = prevText(n, i); if (t) this.focusBlock(t.id, Infinity); return }
        const nx = n.blocks[i + 1]
        if (nx && isText(nx)) { this.focusBlock(nx.id, 0); return }
        const nb = blk('p', n.blocks[i].lvl || 0)
        n.blocks.splice(i + 1, 0, nb)
        this.structural({ id: nb.id, off: 0 })
    }
    private cellCommand(id: string, cc: CellCtx): boolean {
        const { n, i, b, r, c } = cc, cols = colsOf(b)
        switch (id) {
            case 'indent':
                if (c < cols - 1) this.focusCell(b.id, r, c + 1, Infinity)
                else if (r < b.rows.length - 1) this.focusCell(b.id, r + 1, 0, Infinity)
                else if (addRow(b, b.rows.length)) { this.structural(); this.focusCell(b.id, r + 1, 0) }
                return true
            case 'outdent':
                if (c > 0) this.focusCell(b.id, r, c - 1, Infinity)
                else if (r > 0) this.focusCell(b.id, r - 1, cols - 1, Infinity)
                return true
            case 'end-list': this.leaveTable(n, i, 1); return true
            case 'line-break': lineBreak(this.cellEl(b.id, r, c)); return true
            case 'line-up': case 'line-down': {
                const j = moveRow(b, r, id === 'line-up' ? -1 : 1)
                if (j !== r) { this.structural(); this.focusCell(b.id, j, c, Infinity) }
                return true
            }
            default: return false
        }
    }
    private cellKey(e: KeyboardEvent, cell: HTMLElement) {
        if (this.host.isCommandKey(e)) return
        const cc = this.cellCtx(cell), { n, i, b, r, c } = cc, k = e.key, last = b.rows.length - 1, cols = colsOf(b)
        const plain = !e.ctrlKey && !e.altKey && !e.metaKey
        if (k === 'Enter') {
            e.preventDefault()   // no line breaks in a cell
            if (!plain || e.shiftKey) return
            if (r < last) { this.focusCell(b.id, r + 1, c, Infinity); return }
            if (rowEmpty(b, r) && b.rows.length > 1) { b.rows.pop(); this.host.used('table-out'); this.render(); this.host.changed(true); this.leaveTable(this.host.note(), i, 1); return }
            if (addRow(b, b.rows.length)) { this.structural(); this.focusCell(b.id, r + 1, c) }
            return
        }
        if (!plain || e.shiftKey) return
        const len = (cell.textContent ?? '').length
        if (k === 'ArrowUp' && onEdgeLine(cell, 'top')) { e.preventDefault(); if (r > 0) this.focusCell(b.id, r - 1, c, Infinity); else this.leaveTable(n, i, -1); return }
        if (k === 'ArrowDown' && onEdgeLine(cell, 'bottom')) { e.preventDefault(); if (r < last) this.focusCell(b.id, r + 1, c, Infinity); else this.leaveTable(n, i, 1); return }
        if (k === 'ArrowLeft' && collapsed() && textOffset(cell) === 0) {
            e.preventDefault()
            if (c > 0) this.focusCell(b.id, r, c - 1, Infinity); else if (r > 0) this.focusCell(b.id, r - 1, cols - 1, Infinity); else this.leaveTable(n, i, -1)
            return
        }
        if (k === 'ArrowRight' && collapsed() && textOffset(cell) === len) {
            e.preventDefault()
            if (c < cols - 1) this.focusCell(b.id, r, c + 1, 0); else if (r < last) this.focusCell(b.id, r + 1, 0, 0); else this.leaveTable(n, i, 1)
        }
    }
    /** A table where the caret is (an empty plain line becomes the table), the caret in its first cell. */
    insertTable(afterId?: string | null) {
        const n = this.host.note()
        const i = n.blocks.findIndex(x => x.id === (afterId ?? this.lastBlock))
        const cur = i >= 0 ? n.blocks[i] : null
        const t = newTable()
        if (cur && isText(cur)) {
            const tx = this.tx(cur.id); if (tx) cur.html = tx.innerHTML
            t.lvl = cur.lvl || 0
            if (cur.t === 'p' && !textOf(cur.html).trim()) {
                n.blocks.splice(i, 1, t)
                if (!n.blocks[i + 1] || !isText(n.blocks[i + 1])) n.blocks.splice(i + 1, 0, blk('p', t.lvl))
                this.structural()
                this.focusCell(t.id, 0, 0)
                return
            }
        }
        this.insertAfter(t, cur?.id ?? null)
        this.focusCell(t.id, 0, 0)
    }
    /** The table menu's changes, at the cell last focused or right-clicked. */
    tableOp(op: string, blockId: string) {
        const b = this.host.note().blocks.find(x => x.id === blockId)
        if (!b || b.t !== 'table') return
        const at = this.lastCell?.id === blockId ? this.lastCell : { r: 0, c: 0 }
        let r = Math.min(at.r, b.rows.length - 1), c = Math.min(at.c, colsOf(b) - 1)
        switch (op) {
            case 'row-above': if (!addRow(b, r)) return; break
            case 'row-below': if (!addRow(b, r + 1)) return; r++; break
            case 'col-left': if (!addCol(b, c)) return; break
            case 'col-right': if (!addCol(b, c + 1)) return; c++; break
            case 'del-row': if (!delRow(b, r)) return; r = Math.min(r, b.rows.length - 1); break
            case 'del-col': if (!delCol(b, c)) return; c = Math.min(c, colsOf(b) - 1); break
            case 'header': b.head = !b.head; break
            default: return
        }
        this.structural()
        this.focusCell(b.id, r, c, Infinity)
    }
    private pasteCells(cc: CellCtx, cells: string[][]) {
        fillFrom(cc.b, cc.r, cc.c, cells)
        this.structural()
        this.focusCell(cc.b.id, Math.min(cc.b.rows.length - 1, cc.r + cells.length - 1), Math.min(colsOf(cc.b) - 1, cc.c + cells[0].length - 1), Infinity)
    }
    private colDrag(e: PointerEvent, grip: HTMLElement) {
        e.preventDefault()
        const id = grip.closest<HTMLElement>('.cb-blk')!.dataset.id
        const b = this.host.note().blocks.find(x => x.id === id)
        if (!b || b.t !== 'table') return
        const c = +(grip.dataset.c ?? 0), table = grip.closest('table')!
        const W = table.getBoundingClientRect().width || 1, x0 = e.clientX
        const a0 = b.widths[c], b0 = b.widths[c + 1], cols = table.querySelectorAll<HTMLElement>('col')
        const mv = (ev: PointerEvent) => {
            const na = clamp(a0 + (ev.clientX - x0) / W * 100, 6, a0 + b0 - 6)
            b.widths[c] = +na.toFixed(2); b.widths[c + 1] = +(a0 + b0 - na).toFixed(2)
            cols[c].style.width = b.widths[c] + '%'; cols[c + 1].style.width = b.widths[c + 1] + '%'
        }
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.host.used('table-width'); this.host.changed(false) }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
    }

    // ── Events ──────────────────────────────────────────────────────────────

    private onFocusIn = (e: FocusEvent) => {
        const t = e.target as HTMLElement
        const b = t.closest?.<HTMLElement>('.cb-blk')
        if (b) this.lastBlock = b.dataset.id ?? null
        const cell = t.closest?.<HTMLElement>('.cb-cell')
        if (cell && b) this.lastCell = { id: b.dataset.id!, r: +(cell.dataset.r ?? 0), c: +(cell.dataset.c ?? 0) }
        this.host.moved()
    }
    private onCaret = () => this.host.moved()

    /**
     * NEW (0.1.1): an emptied line goes when the caret moves to another line of the note (Guillaume: the lines Enter
     * made stayed once emptied). Not when the focus leaves the note (a menu, a dialog: the line may be what it is
     * about); the note's other empty lines go when another note is shown or the stack closes (pruneEmpty).
     */
    private onFocusOut = (e: FocusEvent) => {
        if (this.rendering) return
        const tx = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-tx')
        const to = e.relatedTarget as HTMLElement | null
        if (!tx || !tx.isConnected || !to || !this.page.contains(to)) return
        const el = tx.closest<HTMLElement>('.cb-blk')!
        const n = this.host.note()
        const i = n.blocks.findIndex(b => b.id === el.dataset.id)
        if (i < 0 || !removable(n, i, tx.innerHTML)) return
        n.blocks.splice(i, 1)
        el.remove()
        this.renumber()
        this.updateBlank()
        this.host.changed(true)
    }
    /** The numbers of numbered items, after a line went without drawing the note again. */
    private renumber() {
        const cnt: number[] = []
        for (const b of this.host.note().blocks) {
            const L = b.lvl || 0
            cnt.length = L + 1
            if (b.t !== 'n') { cnt[L] = 0; continue }
            cnt[L] = (cnt[L] || 0) + 1
            const mk = this.blocksEl.querySelector(`.cb-blk[data-id="${b.id}"] .cb-mk`)
            if (mk) mk.textContent = cnt[L] + '.'
        }
    }

    private onInput = (e: Event) => {
        const cell = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-cell')
        if (cell) { const { b, r, c } = this.cellCtx(cell); if (b?.t === 'table' && b.rows[r]) b.rows[r][c] = cell.innerHTML; this.host.changed(false); return }
        const tx = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-tx')
        if (!tx) return
        const { b } = this.ctx(tx)
        const rule = prefixRule(tx.textContent ?? '', textOffset(tx), b.t, b.lvl || 0)
        if (rule) {
            const [n1, o1] = pointAt(tx, 0), [n2, o2] = pointAt(tx, rule.len)
            const r = document.createRange(); r.setStart(n1, o1); r.setEnd(n2, o2); r.deleteContents()
            const fromP = b.t === 'p'
            b.t = rule.t; b.checked = rule.checked
            if (rule.t === 'h') b.lvl = 0; else if (fromP) b.lvl = Math.max(0, (b.lvl || 0) - 1)
            this.host.used(rule.t === 'c' ? 'md-check' : rule.t === 'h' ? 'md-heading' : 'md-list')
            b.html = cleanHtml(tx.innerHTML)
            this.structural({ id: b.id, off: 0 })
            return
        }
        b.html = tx.innerHTML
        this.updateBlank()
        this.host.changed(false)
    }

    private onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.isComposing) return
        const cell = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-cell')
        if (cell) { this.cellKey(e, cell); return }
        const tx = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-tx')
        if (!tx) return
        if (this.host.isCommandKey(e)) return   // the key mapper's (it runs right after this listener)
        const c = this.ctx(tx), { n, i, b } = c, k = e.key
        const plain = !e.ctrlKey && !e.altKey && !e.metaKey
        if (k === 'Enter' && plain && !e.shiftKey) { e.preventDefault(); this.enter(c, false); return }
        if (k === 'Backspace' && plain && collapsed() && textOffset(tx) === 0) {
            b.html = tx.innerHTML
            if (b.t !== 'p') {
                e.preventDefault()
                if (b.t !== 'h') b.lvl = Math.min(6, (b.lvl || 0) + 1)
                b.t = 'p'; b.checked = false
                this.host.used('unlist')
                this.structural({ id: b.id, off: 0 }); return
            }
            if (b.lvl > 0) { e.preventDefault(); b.lvl--; this.structural({ id: b.id, off: 0 }); return }
            if (i > 0) {
                e.preventDefault()
                const prev = n.blocks[i - 1]
                if (isText(prev)) {
                    const off = textOf(prev.html).length
                    prev.html = cleanHtml(prev.html) + cleanHtml(tx.innerHTML)
                    n.blocks.splice(i, 1)
                    this.structural({ id: prev.id, off })
                } else if (!textOf(tx.innerHTML)) {
                    n.blocks.splice(i, 1)
                    const t = prevText(n, i) ?? nextText(n, i - 1)
                    this.structural(t ? { id: t.id, off: Infinity } : undefined)
                }
            }
            return
        }
        if (k === 'Delete' && plain && collapsed() && textOffset(tx) === (tx.textContent ?? '').length) {
            const nx = n.blocks[i + 1]
            if (nx && isText(nx)) {
                e.preventDefault()
                const off = (tx.textContent ?? '').length
                b.html = cleanHtml(tx.innerHTML) + cleanHtml(nx.html)
                n.blocks.splice(i + 1, 1)
                this.structural({ id: b.id, off })
            }
            return
        }
        if (!plain || e.shiftKey) return
        const pv = n.blocks[i - 1], nx = n.blocks[i + 1]
        const intoPrev = (off: number) => { if (pv?.t === 'table') { e.preventDefault(); this.focusCell(pv.id, pv.rows.length - 1, off ? colsOf(pv) - 1 : 0, Infinity); return true } return false }
        const intoNext = () => { if (nx?.t === 'table') { e.preventDefault(); this.focusCell(nx.id, 0, 0, 0); return true } return false }
        if (k === 'ArrowUp' && onEdgeLine(tx, 'top')) { if (intoPrev(0)) return; const t = prevText(n, i); if (t) { e.preventDefault(); this.focusBlock(t.id, Infinity) } return }
        if (k === 'ArrowDown' && onEdgeLine(tx, 'bottom')) {
            if (intoNext()) return
            const t = nextText(n, i)
            if (t) { e.preventDefault(); this.focusBlock(t.id, 0); return }
            // 0.2.5 (Guillaume): Down on the last line of a list item (or a heading) with nothing under it ends the list
            if (b.t !== 'p') {
                e.preventDefault(); b.html = tx.innerHTML
                const nb = blk('p', b.t === 'h' ? 0 : Math.min(6, b.lvl + 1))
                n.blocks.splice(i + 1, 0, nb)
                this.host.used('end-down')
                this.structural({ id: nb.id, off: 0 })
            }
            return
        }
        if (k === 'ArrowLeft' && collapsed() && textOffset(tx) === 0) { if (intoPrev(1)) return; const t = prevText(n, i); if (t) { e.preventDefault(); this.focusBlock(t.id, Infinity) } return }
        if (k === 'ArrowRight' && collapsed() && textOffset(tx) === (tx.textContent ?? '').length) { if (intoNext()) return; const t = nextText(n, i); if (t) { e.preventDefault(); this.focusBlock(t.id, 0) } }
    }

    private onPaste = (e: ClipboardEvent) => {
        const cd = e.clipboardData
        if (!cd) return
        const file = [...cd.items].find(it => it.kind === 'file' && it.type.startsWith('image/'))?.getAsFile()
        const tx = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-tx')
        const cell = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-cell')
        if (file) { e.preventDefault(); this.host.picture(file, tx ? this.ctx(tx).b.id : cell ? this.cellCtx(cell).b.id : null); return }
        const text = cd.getData('text/plain')
        if (cell && text) {
            e.preventDefault()
            const cells = parseTSV(text)
            if (cells && (cells.length > 1 || cells[0].length > 1)) { this.host.used('paste-table'); this.pasteCells(this.cellCtx(cell), cells); return }
            document.execCommand('insertText', false, text.replace(/\s*[\r\n]+\s*/g, ' ').trim())
            return
        }
        if (!text || !tx) return
        if (/^\s*\{\s*"corkboard"/.test(text)) return   // a Corkboard copy: the widget adds it to the board
        e.preventDefault()
        this.pasteText(tx, text)
    }
    private pasteText(tx: HTMLElement, text: string) {
        const lines = text.replace(/\r/g, '').split('\n')
        while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop()
        // NEW (0.2.0): cells copied from a spreadsheet (every line with the same tabs) become a table
        const tabs = (l: string) => l.split('\t').length - 1
        if (lines.length > 1 && tabs(lines[0]) > 0 && lines.every(l => tabs(l) === tabs(lines[0]))) {
            const cells = parseTSV(lines.join('\n'))
            if (cells) { this.pasteTable(tx, cells); return }
        }
        if (lines.length === 1) { document.execCommand('insertText', false, lines[0]); return }
        const { n, i, b } = this.ctx(tx)
        if (!(tx.textContent ?? '').trim() && b.t === 'p') {
            const nbs = lines.map(parseLine)
            nbs.forEach(x => { x.lvl = Math.min(6, x.lvl + (b.lvl || 0)) })
            n.blocks.splice(i, 1, ...nbs)
            this.structural({ id: nbs[nbs.length - 1].id, off: Infinity })
            return
        }
        const tail = tailFrom(tx)
        tx.appendChild(document.createTextNode(lines[0]))
        b.html = cleanHtml(tx.innerHTML)
        const nbs = lines.slice(1).map(parseLine)
        const last = nbs[nbs.length - 1], off = textOf(last.html).length
        last.html += cleanHtml(tail)
        n.blocks.splice(i + 1, 0, ...nbs)
        this.structural({ id: last.id, off })
    }
    private pasteTable(tx: HTMLElement, cells: string[][]) {
        const { n, i, b } = this.ctx(tx)
        b.html = tx.innerHTML
        const t = newTable(cells[0].length, cells.length)
        t.lvl = b.lvl || 0
        t.head = false
        fillFrom(t, 0, 0, cells)
        if (b.t === 'p' && !textOf(b.html).trim()) n.blocks.splice(i, 1, t)
        else n.blocks.splice(i + 1, 0, t)
        const j = n.blocks.indexOf(t)
        if (!n.blocks[j + 1] || !isText(n.blocks[j + 1])) n.blocks.splice(j + 1, 0, blk('p', t.lvl))
        this.host.used('paste-table')
        this.structural({ id: (n.blocks[j + 1] as TextBlock).id, off: 0 })
    }
    private onDragOver = (e: DragEvent) => {
        if ([...(e.dataTransfer?.items ?? [])].some(i => i.kind === 'file')) e.preventDefault()
    }
    private onDrop = (e: DragEvent) => {
        const f = [...(e.dataTransfer?.files ?? [])].find(x => x.type.startsWith('image/'))
        if (!f) return
        e.preventDefault()
        const blkEl = (e.target as HTMLElement).closest?.<HTMLElement>('.cb-blk')
        this.host.picture(f, blkEl?.dataset.id ?? null)
    }

    private onClick = (e: MouseEvent) => {
        const t = e.target as HTMLElement
        const mk = t.closest?.<HTMLElement>('.cb-mk')
        if (mk) {
            const tx = mk.parentElement!.querySelector<HTMLElement>('.cb-tx')!
            const { b } = this.ctx(tx)
            b.html = tx.innerHTML
            if (b.t === 'c') b.checked = !b.checked
            else if (b.t === 'b') { b.t = 'c'; b.checked = false }
            else if (b.t === 'n') b.t = 'b'
            this.structural()
            return
        }
        const add = t.closest?.<HTMLElement>('.cb-tadd')
        if (add) {
            const id = add.closest<HTMLElement>('.cb-blk')!.dataset.id
            const b = this.host.note().blocks.find(x => x.id === id)
            if (!b || b.t !== 'table') return
            const row = add.classList.contains('cb-tadd-r')
            if (row ? !addRow(b, b.rows.length) : !addCol(b, colsOf(b))) return
            this.structural()
            this.focusCell(b.id, row ? b.rows.length - 1 : 0, row ? 0 : colsOf(b) - 1)
            return
        }
        const rm = t.closest?.<HTMLElement>('.cb-mx')
        if (rm) { const id = rm.closest<HTMLElement>('.cb-blk')?.dataset.id; if (id) this.removeBlock(id) }
    }

    private onPointerOver = (e: PointerEvent) => {
        const over = !!(e.target as HTMLElement).closest?.('.cb-media')
        if (over !== this.overMedia) { this.overMedia = over; this.host.moved() }
    }

    private onPointerDown = (e: PointerEvent) => {
        const t = e.target as HTMLElement
        const grip = t.closest?.<HTMLElement>('.cb-grip')
        if (grip) { this.gripDrag(e, grip); return }
        const cg = t.closest?.<HTMLElement>('.cb-colgrip')
        if (cg) { this.colDrag(e, cg); return }
        if (t.closest?.('.cb-mx')) return
        const svg = t.closest?.<SVGSVGElement>('.cb-media svg')
        const n = this.host.note()
        if (svg) {
            if (this.host.penMode() && e.pointerType === 'touch') return
            if (![0, 2, 5].includes(e.button)) return
            const b = n.blocks.find(x => x.id === svg.closest<HTMLElement>('.cb-blk')!.dataset.id)
            if (!b || !hasInk(b)) return
            this.ink(e, svg, b.ink, false)
            return
        }
        if ((e.altKey && e.pointerType !== 'touch') || (this.host.penMode() && e.pointerType === 'pen')) this.ink(e, this.marginSvg, n.ink, true)
    }
    private ink(e: PointerEvent, svg: SVGSVGElement, arr: Stroke[], margin: boolean) {
        const tool = this.host.tool()
        beginInk(e, svg, arr, {
            mode: tool === 'erase' ? 'erase' : 'draw', color: tool, look: CB_LOOK,
            gesture: g => { this.gesture = g },
            done: u => {
                if (u.removed) this.host.used('erase'); else if (margin) this.host.used('scribble')
                this.host.inkDone(u)
            },
        })
    }
    private onContextMenu = (e: MouseEvent) => {
        const t = e.target as HTMLElement
        if (e.altKey) { e.preventDefault(); return }
        const media = t.closest?.<HTMLElement>('.cb-media')
        if (media) {
            e.preventDefault()
            const g = this.gesture
            if (g && g.right && (g.moved || g.removed)) return   // that right-press was an erase
            this.host.menu(e, 'ink', media.dataset.id!)
            return
        }
        const cell = t.closest?.<HTMLElement>('.cb-cell')
        if (cell) {
            if (e.shiftKey) return
            e.preventDefault()
            const cc = this.cellCtx(cell)
            this.lastBlock = cc.b.id; this.lastCell = { id: cc.b.id, r: cc.r, c: cc.c }
            this.host.menu(e, 'table', cc.b.id)
            return
        }
        const tx = t.closest?.<HTMLElement>('.cb-tx')
        if (tx) {
            if (e.shiftKey) return   // the browser's own menu (spelling)
            e.preventDefault()
            const id = this.ctx(tx).b.id
            this.lastBlock = id
            this.host.menu(e, 'text', id)
        }
    }
    private gripDrag(e: PointerEvent, grip: HTMLElement) {
        e.preventDefault()
        const id = grip.closest<HTMLElement>('.cb-blk')!.dataset.id
        const b = this.host.note().blocks.find(x => x.id === id)
        if (!b || b.t !== 'ink') return
        const frame = grip.parentElement!, svg = frame.querySelector('svg')!
        const k = 1000 / (frame.getBoundingClientRect().width || 1), h0 = b.h, y0 = e.clientY
        const mv = (ev: PointerEvent) => {
            b.h = clamp(Math.round(h0 + (ev.clientY - y0) * k), 150, 2400)
            frame.style.aspectRatio = `1000/${b.h}`
            svg.setAttribute('viewBox', `0 0 1000 ${b.h}`)
        }
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.host.changed(false) }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
    }
}

// ── Empty lines ─────────────────────────────────────────────────────────────

/**
 * An empty line that may go: not the note's only line of text, not the line under a picture or a sketch at the end
 * (where the user types after it). html: the line's text now (its element may be ahead of the note's copy).
 */
function removable(n: Note, i: number, html: string): boolean {
    const b = n.blocks[i]
    if (!b || !isText(b) || textOf(html).trim()) return false
    if (n.blocks.filter(isText).length <= 1) return false
    const prev = n.blocks[i - 1], next = n.blocks[i + 1]
    if (prev && !isText(prev) && (!next || !isText(next))) return false
    return true
}
/** Drops a note's empty lines (another note shown, the stack closed). true: some went. */
export function pruneEmpty(n: Note): boolean {
    let gone = false
    for (let i = n.blocks.length - 1; i >= 0; i--) {
        const b = n.blocks[i]
        if (isText(b) && removable(n, i, b.html)) { n.blocks.splice(i, 1); gone = true }
    }
    return gone
}

// ── Blocks as HTML ──────────────────────────────────────────────────────────

function blockHTML(b: Block, num: number): string {
    const L = b.lvl || 0
    if (b.t === 'img') {
        return `<div class="cb-blk cb-media" data-id="${b.id}" style="--lvl:${L}"><div class="cb-frame"><img src="${esc(b.url)}" alt="Pasted picture" draggable="false">` +
            `<svg viewBox="0 0 1000 ${Math.round(1000 * b.h / Math.max(1, b.w))}" preserveAspectRatio="none"></svg>` +
            `<button class="cb-mx" type="button" title="Remove the picture" aria-label="Remove the picture">✕</button></div></div>`
    }
    if (b.t === 'table') return tableHTML(b)
    if (b.t === 'ink') {
        return `<div class="cb-blk cb-media cb-sketch" data-id="${b.id}" style="--lvl:${L}"><div class="cb-frame" style="aspect-ratio:1000/${b.h}">` +
            `<svg viewBox="0 0 1000 ${b.h}" preserveAspectRatio="none"></svg>` +
            `<button class="cb-mx" type="button" title="Remove the sketch" aria-label="Remove the sketch">✕</button><div class="cb-grip" title="Drag to resize"></div></div></div>`
    }
    const mk = b.t === 'b' ? BUL[L % 3] : b.t === 'n' ? num + '.' : b.t === 'c' ? '<span class="cb-box"></span>' : ''
    const marker = b.t === 'p' || b.t === 'h' ? '' :
        `<span class="cb-mk" contenteditable="false" title="${b.t === 'c' ? 'Tick' : 'Click to make it a checkbox'}">${mk}</span>`
    return `<div class="cb-blk t-${b.t}${b.checked ? ' done' : ''}" data-id="${b.id}" style="--lvl:${L}">${marker}<div class="cb-tx" contenteditable="true" spellcheck="true">${b.html}</div></div>`
}

// ── Caret helpers ───────────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
function textOffset(el: HTMLElement): number {
    const s = getSelection(); if (!s || !s.rangeCount) return 0
    const r = s.getRangeAt(0); if (!el.contains(r.startContainer)) return 0
    const p = document.createRange(); p.selectNodeContents(el); p.setEnd(r.startContainer, r.startOffset)
    return p.toString().length
}
function pointAt(el: HTMLElement, off: number): [Node, number] {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n: Node | null, last: Text | null = null
    while ((n = w.nextNode())) { const t = n as Text; if (off <= t.length) return [t, off]; off -= t.length; last = t }
    return last ? [last, last.length] : [el, 0]
}
function setCaret(el: HTMLElement, off: number) {
    const [n, o] = pointAt(el, off === Infinity ? 1e9 : off)
    const r = document.createRange(); r.setStart(n, o); r.collapse(true)
    const s = getSelection(); s?.removeAllRanges(); s?.addRange(r)
}
const collapsed = () => { const s = getSelection(); return !!s && s.rangeCount > 0 && s.isCollapsed }
function tailFrom(el: HTMLElement): string {
    const s = getSelection(); if (!s || !s.rangeCount) return ''
    const r = s.getRangeAt(0); r.deleteContents()
    const t = document.createRange(); t.setStart(r.startContainer, r.startOffset); t.setEnd(el, el.childNodes.length)
    const d = document.createElement('div'); d.appendChild(t.extractContents())
    return d.innerHTML
}
/**
 * 0.2.5: a line break at the caret in `el` (a list item or a table cell): the browser's own, so its undo has it.
 * (Chromium writes it as a newline in the text: the editable lines keep white space. textOf reads it as a space.)
 */
function lineBreak(el: HTMLElement | null) {
    if (!el) return
    const s = getSelection()
    if (!s || !s.rangeCount || !el.contains(s.getRangeAt(0).startContainer)) return
    if (document.execCommand('insertLineBreak')) return
    const r = s.getRangeAt(0); r.deleteContents()
    const br = document.createElement('br'); r.insertNode(br)
    if (!br.nextSibling || (br.nextSibling.nodeType === 3 && !br.nextSibling.textContent)) br.after(document.createElement('br'))   // a line break at the end shows only with another after it
    r.setStartAfter(br); r.collapse(true); s.removeAllRanges(); s.addRange(r)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}
function onEdgeLine(tx: HTMLElement, edge: 'top' | 'bottom'): boolean {
    const s = getSelection(); if (!s || !s.rangeCount) return true
    const r = s.getRangeAt(0).cloneRange(); r.collapse(edge === 'top')
    const rect = r.getClientRects()[0]; if (!rect) return true
    const er = tx.getBoundingClientRect(), lh = parseFloat(getComputedStyle(tx).lineHeight) || 24
    return edge === 'top' ? rect.top - er.top < lh * 0.7 : er.bottom - rect.bottom < lh * 0.7
}
const prevText = (n: Note, i: number) => { for (let j = i - 1; j >= 0; j--) { const b = n.blocks[j]; if (isText(b)) return b } return null }
const nextText = (n: Note, i: number) => { for (let j = i + 1; j < n.blocks.length; j++) { const b = n.blocks[j]; if (isText(b)) return b } return null }
