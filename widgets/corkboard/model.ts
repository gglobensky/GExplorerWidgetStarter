// widgets/corkboard/model.ts
//
// THE CORKBOARD'S DATA (0.1.0, 2026-11-02): boards of stacks of notes, groups held by a pin, flags, due dates.
// Pure: no DOM but the HTML helpers at the bottom (which need a document), no SDK. One document per copy of the
// widget ('desk-<sourceId>', store.ts). Pictures are GEM Shell image assets (a note keeps the asset id and url);
// an export inlines them as data so a copy pasted into another Corkboard is a standalone duplicate.
import type { GridRect } from 'gexplorer/widgets'

// ── Types ───────────────────────────────────────────────────────────────────

export type BlockType = 'p' | 'b' | 'c' | 'n' | 'h'
export type InkColor = 'k' | 'b' | 'r' | 'hl'
/** A stroke: points [x, y, pressure] in the surface's own units; p: drawn with a pen (width follows pressure). */
export type Stroke = { c: InkColor; w: number; pts: [number, number, number][]; p?: 1 }

export type TextBlock = { id: string; t: BlockType; lvl: number; checked?: boolean; html: string }
/** A pasted picture (a GEM Shell image asset) and the ink drawn on it (1000 units wide). */
export type PictureBlock = { id: string; t: 'img'; lvl: number; asset: string; url: string; w: number; h: number; ink: Stroke[] }
/** A blank drawing area, 1000 units wide and h high. */
export type SketchBlock = { id: string; t: 'ink'; lvl: number; h: number; ink: Stroke[] }
/**
 * NEW (0.2.0): a table (no formulas, Guillaume): cells hold short text (b / i only, as lines do). head: the first
 * row is a header. widths: each column's share of the table's width, in % (they add up to about 100).
 */
export type TableBlock = { id: string; t: 'table'; lvl: number; rows: string[][]; head: boolean; widths: number[] }
export type Block = TextBlock | PictureBlock | SketchBlock | TableBlock
export const TABLE_MAX = { rows: 200, cols: 20, cell: 2000 }

/** ink: the margin scribbles (Alt-drag), in CSS px of the page. title (0.1.1): the note's own short title, on its tab. */
export type Note = { id: string; num: number; blocks: Block[]; ink: Stroke[]; updated: number; title?: string }

export type FlagId = 'important' | 'doing' | 'waiting' | 'idea' | 'done'
export type PaperKind = 'plain' | 'lined' | 'grid'
export type PinColor = 'red' | 'blue' | 'green' | 'yellow' | 'black'
export type Surface = 'cork' | 'felt' | 'slate' | 'clay' | 'plum' | 'linen'

/** On the grid (whole cells of the view's tall grid), or placed freely on a page (in cells, fractions allowed). */
export type Place = { rect: GridRect } | { free: { page: number; x: number; y: number } }

export type Stack = {
    id: string; kind: 'stack'; board: string; group: string | null
    name: string; autoName: boolean; color: PaperColor; paper: PaperKind
    numbered: boolean; nextNum: number
    place: Place; tilt: number; z: number
    notes: string[]; active: string | null
    flags: FlagId[]; due: string | null
}
export type Group = { id: string; kind: 'group'; board: string; name: string; pin: PinColor; due: string | null; place: Place; tilt: number; z: number; cols: number }
export type Board = { id: string; title: string; surface: Surface; cols: number }
/**
 * NEW (0.2.0): a picture pinned on the board (a photo, a blueprint, a reference): a GEM Shell image asset, the ink
 * drawn on it (1000 units wide), a caption. On the grid like a stack (resizable), opened large to view and draw.
 */
export type Photo = {
    id: string; kind: 'photo'; board: string; group: string | null
    asset: string; url: string; w: number; h: number; caption: string; ink: Stroke[]
    place: Place; tilt: number; z: number
}
export type Item = Stack | Group | Photo
export const PHOTO_CAPTION_MAX = 120

export type DeskData = {
    schema: 1
    boards: Board[]
    board: string
    stacks: Stack[]
    groups: Group[]
    notes: Record<string, Note>
    /** Where the user was: the open group of the board, the open stack. */
    group: string | null
    focus: string | null
    /** NEW (0.2.0): the pinned pictures, and the one open (viewed large). */
    photos: Photo[]
    photo: string | null
    snap: boolean
    penMode: boolean
    hints: boolean
    /** How many times each hint's key or gesture was used (a hint goes once learned). */
    learned: Record<string, number>
    /** The page each view shows ('<board>:<group or empty>'). */
    pages: Record<string, number>
    z: number
}

// ── Constants ───────────────────────────────────────────────────────────────

export const PAPER_COLORS = ['sun', 'rose', 'mint', 'sky', 'lilac', 'kraft', 'chalk'] as const
export type PaperColor = typeof PAPER_COLORS[number]
export const COLOR_NAMES: Record<PaperColor, string> = { sun: 'Butter', rose: 'Rose', mint: 'Mint', sky: 'Sky', lilac: 'Lilac', kraft: 'Kraft', chalk: 'Chalk' }
export const SURFACES: [Surface, string][] = [['cork', 'Cork'], ['felt', 'Green felt'], ['slate', 'Slate'], ['clay', 'Clay'], ['plum', 'Plum'], ['linen', 'Linen']]
export const PINS: PinColor[] = ['red', 'blue', 'green', 'yellow', 'black']
export const FLAGS: [FlagId, string][] = [['important', 'Important'], ['doing', 'In progress'], ['waiting', 'Waiting'], ['idea', 'Idea'], ['done', 'Done']]
export const FLAG_NAMES = Object.fromEntries(FLAGS) as Record<FlagId, string>
/** A stack's size on the board, in cells. */
export const MAX_SPAN = { cols: 2, rows: 2 }

// ── Small helpers ───────────────────────────────────────────────────────────

export const uid = () => Math.random().toString(36).slice(2, 10)
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const rndTilt = () => +(Math.random() * 3.2 - 1.6).toFixed(2)
const TEXT_TYPES = new Set(['p', 'b', 'c', 'n', 'h'])
export const isText = (b: Block): b is TextBlock => TEXT_TYPES.has(b.t)
/** A block with ink (a picture, a sketch). */
export const hasInk = (b: Block): b is PictureBlock | SketchBlock => b.t === 'img' || b.t === 'ink'
/** A new table: 3 columns × 3 rows, the first a header. */
export const newTable = (cols = 3, rows = 3): TableBlock => ({
    id: uid(), t: 'table', lvl: 0, head: true,
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
    widths: Array.from({ length: cols }, () => +(100 / cols).toFixed(2)),
})
export const blk = (t: BlockType = 'p', lvl = 0, html = ''): TextBlock => ({ id: uid(), t, lvl, checked: false, html })
export const viewKey = (board: string, group: string | null) => `${board}:${group ?? ''}`

export function esc(s: unknown): string {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** The text of a block's HTML (entities decoded, tags dropped), without a DOM. */
export function textOf(html: string): string {
    return String(html || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;| /g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

export function noteText(n: Note): string {
    return n.blocks.map(b => isText(b) ? textOf(b.html) : b.t === 'table' ? b.rows.map(r => r.map(textOf).join('\t')).join('\n') : '').filter(Boolean).join('\n')
}
export function noteTitle(n: Note): string {
    for (const b of n.blocks) if (isText(b)) { const t = textOf(b.html).trim(); if (t) return t }
    const m = n.blocks.find(b => !isText(b))
    return m ? (m.t === 'img' ? 'Picture' : m.t === 'table' ? 'Table' : 'Sketch') : ''
}
/** What a note is called on its tab, in search and on the board: its own title, else its first line. */
export function noteLabel(n: Note): string {
    return n.title?.trim() || noteTitle(n)
}
export const NOTE_TITLE_MAX = 60
export function progress(n: Note): { all: number; done: number } | null {
    const c = n.blocks.filter((b): b is TextBlock => b.t === 'c')
    return c.length ? { all: c.length, done: c.filter(b => b.checked).length } : null
}
export function isEmptyNote(n: Note): boolean {
    return !n.ink.length && !n.title?.trim() && n.blocks.every(b => isText(b) && !textOf(b.html).trim())
}
export function shorten(t: string): string {
    const w = t.split(/\s+/).slice(0, 3).join(' ')
    return w.length > 22 ? w.slice(0, 21) + '…' : w
}
export function initials(name: string): string {
    const w = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean)
    if (!w.length) return '?'
    if (w.length === 1) return w[0].slice(0, 2).replace(/^./, c => c.toUpperCase())
    return (w[0][0] + w[1][0]).toUpperCase()
}

// ── Dates (local days, 'YYYY-MM-DD') ────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const day0 = (now = new Date()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d }
export const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const ymd = (days: number, now = new Date()) => { const d = day0(now); d.setDate(d.getDate() + days); return ymdOf(d) }
/** Days to the next weekday w (0 = Sunday), never today. */
export const nextWeekday = (w: number, now = new Date()) => { const n = (w - day0(now).getDay() + 7) % 7; return n === 0 ? 7 : n }
export const okDate = (d: unknown): string | null => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d) && !isNaN(new Date(d + 'T00:00').getTime()) ? d : null

export type DueState = 'late' | 'soon' | 'near' | 'later'
/** A due date as the pin's tag says it: "Today", "Fri", "Nov 12", "2d late"; state: its colour. */
export function dueInfo(s: string | null | undefined, now = new Date()): { short: string; long: string; state: DueState; diff: number } | null {
    if (!s || !okDate(s)) return null
    const d = new Date(s + 'T00:00')
    const diff = Math.round((d.getTime() - day0(now).getTime()) / 864e5)
    const md = `${MON[d.getMonth()]} ${d.getDate()}`
    const short = diff < 0 ? `${-diff}d late` : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff < 7 ? WD[d.getDay()] : md
    return { short, long: `${WD[d.getDay()]} ${md}`, state: diff < 0 ? 'late' : diff <= 1 ? 'soon' : diff <= 3 ? 'near' : 'later', diff }
}
/** Due today or late, on a board (the board switcher's count). */
export function dueCount(d: DeskData, boardId: string, now = new Date()): number {
    let n = 0
    for (const x of [...d.stacks, ...d.groups]) {
        if (x.board !== boardId) continue
        const i = dueInfo(x.due, now)
        if (i && i.diff <= 0) n++
    }
    return n
}

// ── Lines of text → blocks (paste, seed, import of plain text) ─────────────

export function inlineMd(t: string): string {
    return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}
/** "  - [ ] milk" → a checklist item one level in. Two spaces or a tab per level. */
export function parseLine(raw: string): TextBlock {
    const m = raw.match(/^([ \t]*)(.*)$/)!
    const L = Math.floor(m[1].replace(/\t/g, '  ').length / 2)
    let s = m[2], t: BlockType = 'p', ck = false, mm: RegExpMatchArray | null
    if ((mm = s.match(/^[-*•]\s+\[([ xX]?)\]\s+/)) || (mm = s.match(/^\[([ xX]?)\]\s+/))) { t = 'c'; ck = /x/i.test(mm[1]); s = s.slice(mm[0].length) }
    else if ((mm = s.match(/^[-*•]\s+/))) { t = 'b'; s = s.slice(mm[0].length) }
    else if ((mm = s.match(/^\d{1,3}[.)]\s+/))) { t = 'n'; s = s.slice(mm[0].length) }
    else if (L === 0 && (mm = s.match(/^#{1,3}\s+/))) { t = 'h'; s = s.slice(mm[0].length) }
    const b = blk(t, Math.min(L, 6), inlineMd(s)); b.checked = ck; return b
}
export function parseText(text: string): TextBlock[] {
    const lines = text.replace(/\r/g, '').split('\n')
    while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop()
    return lines.map(parseLine)
}

/** What the start of a line turns it into while typing ("- ", "[ ] ", "1. ", "# "). */
export function prefixRule(text: string, caret: number, t: BlockType, lvl: number): { len: number; t: BlockType; checked: boolean } | null {
    if (t !== 'p' && t !== 'b') return null
    const raw = text.replace(/ /g, ' ')
    const rules: [RegExp, BlockType, boolean][] = [[/^\[[xX]\] /, 'c', true], [/^\[ ?\] /, 'c', false]]
    if (t === 'p') rules.push([/^[-*•] /, 'b', false], [/^\d{1,3}[.)] /, 'n', false], [/^#{1,3} /, 'h', false])
    for (const [re, nt, ck] of rules) {
        const m = raw.match(re)
        if (m && caret === m[0].length && !(nt === 'h' && lvl > 0)) return { len: m[0].length, t: nt, checked: ck }
    }
    return null
}

// ── Factories ───────────────────────────────────────────────────────────────

export function emptyDesk(): DeskData {
    const b: Board = { id: uid(), title: 'General', surface: 'cork', cols: 0 }
    return { schema: 1, boards: [b], board: b.id, stacks: [], groups: [], notes: {}, group: null, focus: null, photos: [], photo: null, snap: true, penMode: false, hints: true, learned: {}, pages: {}, z: 5 }
}

export function newNote(d: DeskData, s: Stack, blocks?: Block[] | null, at?: number): Note {
    const n: Note = { id: uid(), num: 0, blocks: blocks && blocks.length ? blocks : [blk()], ink: [], updated: Date.now() }
    if (s.numbered) n.num = s.nextNum++
    d.notes[n.id] = n
    if (at == null) s.notes.push(n.id); else s.notes.splice(at, 0, n.id)
    return n
}

export function newStack(d: DeskData, o: Partial<Stack> & { place: Place }): Stack {
    return Object.assign({
        id: uid(), kind: 'stack' as const, board: d.board, group: d.group, name: 'New stack', autoName: true,
        color: PAPER_COLORS[d.stacks.length % 6], paper: 'plain' as PaperKind, numbered: false, nextNum: 1,
        tilt: rndTilt(), z: ++d.z, notes: [], active: null, flags: [], due: null,
    }, o)
}

// ── HTML of text blocks (needs a document: the editor's side) ──────────────

/** Only b, i, u, s, strong, em, br; no attributes. Everything else is unwrapped (its text kept). */
export function sanitize(h: unknown): string {
    const t = document.createElement('template')
    t.innerHTML = String(h ?? '')
    const walk = (node: Node) => [...node.childNodes].forEach(c => {
        if (c.nodeType === 1) {
            const el = c as Element
            walk(el)
            if (!/^(B|I|U|S|STRONG|EM|BR)$/.test(el.tagName)) el.replaceWith(...el.childNodes)
            else [...el.attributes].forEach(a => el.removeAttribute(a.name))
        } else if (c.nodeType !== 3) (c as ChildNode).remove()
    })
    walk(t.content)
    const d = document.createElement('div')
    d.appendChild(t.content)
    return d.innerHTML
}
/** A block's HTML without trailing line breaks; '' when it holds no text. */
export function cleanHtml(h: string): string {
    h = (h || '').replace(/(<br\s*\/?>)+$/i, '')
    return textOf(h).length ? h : ''
}
