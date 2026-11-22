// widgets/corkboard/exchange.ts
//
// FILES IN AND OUT: a stack (.gemstk) or a whole board (.gembrd) as a Corkboard file, or as Markdown. Opening a file
// on any board, in any copy of the widget, adds it as a standalone duplicate: new ids, new picture assets, nothing
// kept in sync (Guillaume, 2026-11-02). Everything read from a file is checked: known fields only, text sanitized,
// numbers bounded, pictures PNG / JPEG / WebP / GIF only (by their bytes).
// 0.4.0: a file is an archive (zip.ts): corkboard.json (`corkboard: 2`) and the pictures as files (pictures/1.webp…),
// each named in the JSON (`pic`). No data: address in a file: GEM Shell's page refuses fetching one (the "a connection
// from app/data" of the security log). The older formats (JSON text with base64 pictures, a copy pasted as text) are
// no longer read: there were no users yet (Guillaume, 2026-11-21).
// Also: what a new Corkboard starts with (the "Start here" stack).
import {
    type DeskData, type Stack, type Group, type Board, type Note, type Block, type Stroke, type Place, type PaperColor,
    type FlagId, type PinColor, type Surface, type PaperKind, type InkColor, type TableBlock,
    TABLE_MAX, PHOTO_CAPTION_MAX, PAPER_COLORS, PINS, SURFACES, FLAG_NAMES, GRID, NOTE_TITLE_MAX, uid, clamp, rndTilt, okDate, isText, noteLabel, textOf, blk,
    parseText, sanitize, newNote, newStack,
} from './model'
import { fitWidths, tableMd } from './table'

/** The JSON's format (0.4.0: 2, in an archive). */
const FORMAT = 2
/** The JSON's name inside a file (0.4.0). */
export const ARCHIVE_JSON = 'corkboard.json'
const MAX_NOTES = 2000
const MAX_STACKS = 1000
const MAX_STROKES = 4000
const MAX_POINTS = 4000

/** A picture asset put in the file: its name in the archive (null: unreadable, the picture is left out). */
export type InlinePicture = (url: string) => Promise<string | null>
/** Makes a picture asset from a picture file's bytes (null: refused, the picture is left out). */
export type MakePicture = (src: Blob) => Promise<{ asset: string; url: string; w: number; h: number } | null>
/** A file's other files (its pictures), by name (readZip). */
export type CopyFiles = Map<string, Uint8Array>

type NoteOut = { num: number; title?: string; ink: Stroke[]; blocks: Array<Omit<Block, 'id'> & { pic?: string }> }
type StackOut = {
    name: string; color: PaperColor; paper: PaperKind; numbered: boolean; flags: FlagId[]; due: string | null
    place: Place; group?: number | null; notes: NoteOut[]
}
type GroupOut = { name: string; pin: PinColor; due: string | null; place: Place }
export type StackCopy = { corkboard: 2; kind: 'stack'; stack: StackOut }
/** NEW (0.2.0): a picture pinned on the board, its file named (0.4.0). */
type PhotoOut = { caption: string; ink: Stroke[]; place: Place; group: number | null; pic: string }
export type BoardCopy = { corkboard: 2; kind: 'board'; board: { title: string; surface: Surface }; groups: GroupOut[]; stacks: StackOut[]; photos?: PhotoOut[] }

// ── Out ─────────────────────────────────────────────────────────────────────

async function noteOut(n: Note, inline: InlinePicture): Promise<NoteOut> {
    const blocks: NoteOut['blocks'] = []
    for (const b of n.blocks) {
        if (b.t === 'img') {
            const pic = await inline(b.url)
            if (!pic) continue
            const { id: _id, asset: _a, url: _u, ...rest } = b
            blocks.push({ ...rest, asset: '', url: '', pic } as any)
        } else {
            const { id: _id, ...rest } = b
            blocks.push(rest as any)
        }
    }
    return { num: n.num, ...(n.title ? { title: n.title } : {}), ink: n.ink, blocks }
}

async function stackOut(d: DeskData, s: Stack, inline: InlinePicture, group?: number | null): Promise<StackOut> {
    const notes: NoteOut[] = []
    for (const id of s.notes) if (d.notes[id]) notes.push(await noteOut(d.notes[id], inline))
    return { name: s.name, color: s.color, paper: s.paper, numbered: s.numbered, flags: [...s.flags], due: s.due, place: s.place, group, notes }
}

/** The JSON of a file (corkboard.json); `inline` puts each picture in the archive and names it. */
export async function exportStack(d: DeskData, s: Stack, inline: InlinePicture): Promise<string> {
    const copy: StackCopy = { corkboard: FORMAT, kind: 'stack', stack: await stackOut(d, s, inline) }
    return JSON.stringify(copy)
}

export async function exportBoard(d: DeskData, b: Board, inline: InlinePicture): Promise<string> {
    const groups = d.groups.filter(g => g.board === b.id)
    const gi = new Map(groups.map((g, i) => [g.id, i]))
    const stacks: StackOut[] = []
    for (const s of d.stacks.filter(x => x.board === b.id)) stacks.push(await stackOut(d, s, inline, s.group != null && gi.has(s.group) ? gi.get(s.group)! : null))
    const photos: PhotoOut[] = []
    for (const p of d.photos.filter(x => x.board === b.id)) {
        const pic = await inline(p.url)
        if (pic) photos.push({ caption: p.caption, ink: p.ink, place: p.place, group: p.group != null && gi.has(p.group) ? gi.get(p.group)! : null, pic })
    }
    const copy: BoardCopy = {
        corkboard: FORMAT, kind: 'board', board: { title: b.title, surface: b.surface },
        groups: groups.map(g => ({ name: g.name, pin: g.pin, due: g.due, place: g.place })), stacks, photos,
    }
    return JSON.stringify(copy)
}

/** A line's text as Markdown; `cont` (0.2.5): a line break inside it continues on the next line with that indent. */
function mdText(h: string, cont?: string): string {
    let s = String(h || '').replace(/<\/?(b|strong)>/gi, '**').replace(/<\/?(i|em)>/gi, '*')
    if (cont != null) s = s.replace(/(<br\s*\/?>|\n)+$/i, '').replace(/<br\s*\/?>|\n/gi, '\u0001')
    return textOf(s).replace(/\u0001/g, '  \n' + (cont ?? ''))
}

export function stackMarkdown(d: DeskData, s: Stack, level = 1): string {
    const tags = [...s.flags.map(f => FLAG_NAMES[f]), ...(s.due ? ['due ' + s.due] : [])]
    let out = `${'#'.repeat(level)} ${s.name}${tags.length ? ' (' + tags.join(', ') + ')' : ''}\n`
    for (const id of s.notes) {
        const n = d.notes[id]; if (!n) continue
        const title = noteLabel(n) || 'Empty note'
        out += `\n${'#'.repeat(level + 1)} ${s.numbered && n.num ? '#' + n.num + ' ' : ''}${title}\n\n`
        let skipped = !!n.title?.trim()   // with its own title, the first line is content
        const cnt: number[] = []
        for (const b of n.blocks) {
            const L = b.lvl || 0, pad = '  '.repeat(L)
            cnt.length = L + 1
            if (b.t === 'n') cnt[L] = (cnt[L] || 0) + 1; else cnt[L] = 0
            if (b.t === 'img') { out += pad + '[Picture]\n'; continue }
            if (b.t === 'ink') { out += pad + '[Sketch]\n'; continue }
            if (b.t === 'table') { out += '\n' + tableMd(b, pad) + '\n'; skipped = true; continue }
            const lead = b.t === 'b' ? '- ' : b.t === 'c' ? (b.round ? `- (${b.checked ? 'x' : ' '}) ` : `- [${b.checked ? 'x' : ' '}] `) : b.t === 'n' ? `${cnt[L]}. ` : ''
            const t = mdText(b.html, pad + ' '.repeat(lead.length))
            if (!t.trim()) continue
            if (!skipped && (b.t === 'p' || b.t === 'h') && t.replace(/\s+/g, ' ').trim() === title.replace(/\s+/g, ' ').trim()) { skipped = true; continue }
            skipped = true
            out += pad + lead + (b.t === 'h' ? `**${t}**` : t) + '\n'
        }
    }
    return out
}

export function boardMarkdown(d: DeskData, b: Board): string {
    let out = `# ${b.title || 'Untitled board'}\n`
    const pics = (group: string | null) => d.photos.filter(p => p.board === b.id && (p.group ?? null) === group).map(p => `\n[Picture${p.caption ? ': ' + p.caption : ''}]\n`).join('')
    out += pics(null)
    for (const g of d.groups.filter(x => x.board === b.id)) {
        out += `\n## 📌 ${g.name}${g.due ? ' (due ' + g.due + ')' : ''}\n` + pics(g.id)
        for (const s of d.stacks.filter(x => x.group === g.id)) out += '\n' + stackMarkdown(d, s, 3)
    }
    for (const s of d.stacks.filter(x => x.board === b.id && !x.group)) out += '\n' + stackMarkdown(d, s, 2)
    return out
}

// ── In ──────────────────────────────────────────────────────────────────────

const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list as readonly string[]).includes(v as string) ? v as T : dflt
const num = (v: unknown, a: number, b: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, a, b) : dflt }

function okInk(a: unknown): Stroke[] {
    if (!Array.isArray(a)) return []
    return a.slice(0, MAX_STROKES).filter(x => x && Array.isArray(x.pts)).map((x: any) => {
        const s: Stroke = {
            c: pick<InkColor>(x.c, ['k', 'b', 'r', 'hl'], 'k'),
            w: num(x.w, 0.2, 200, 3),
            pts: x.pts.slice(0, MAX_POINTS).map((p: any) => [num(p?.[0], -1e5, 1e5, 0), num(p?.[1], -1e5, 1e5, 0), num(p?.[2], 0, 1, 0.5)] as [number, number, number]),
        }
        if (x.p) s.p = 1
        return s
    })
}

/** A copy's place, checked. Sizes are bounded here, then by the page. */
function okPlace(p: any): Place {
    let out: Place
    if (p?.free) {
        const f = p.free, w = f.w == null ? undefined : num(f.w, 1, 128, 2), h = f.h == null ? undefined : num(f.h, 1, 128, 2)
        out = { free: { page: Math.floor(num(f.page, 0, 999, 0)), x: num(f.x, 0, 256, 0), y: num(f.y, 0, 256, 0), ...(w ? { w } : {}), ...(h ? { h } : {}) } }
    } else {
        const r = p?.rect ?? {}
        out = { rect: { col: Math.floor(num(r.col, 0, 255, 0)), row: Math.floor(num(r.row, 0, 1e5, 0)), colSpan: Math.floor(num(r.colSpan, 1, 128, 1)), rowSpan: Math.floor(num(r.rowSpan, 1, 128, 1)) } }
    }
    return out
}

/** NEW (0.2.0): a table from a copy: bounded (TABLE_MAX), rectangular, each cell sanitized. */
function tableIn(b: any, lvl: number): TableBlock | null {
    if (!Array.isArray(b.rows) || !b.rows.length) return null
    const rows = b.rows.slice(0, TABLE_MAX.rows).map((r: unknown) => Array.isArray(r) ? r.slice(0, TABLE_MAX.cols) : [])
    const cols = Math.max(1, ...rows.map((r: unknown[]) => r.length))
    const t: TableBlock = {
        id: uid(), t: 'table', lvl, head: !!b.head,
        rows: rows.map((r: unknown[]) => Array.from({ length: cols }, (_, c) => sanitize(String(r[c] ?? '')).slice(0, TABLE_MAX.cell))),
        widths: Array.isArray(b.widths) ? b.widths.slice(0, cols).map((w: unknown) => num(w, 1, 100, 100 / cols)) : [],
    }
    fitWidths(t)
    return t
}

/** NEW (0.4.0): a picture file's type from its first bytes: PNG, JPEG, WebP or GIF only (null: something else). */
export function pictureType(b: Uint8Array): string | null {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
    return null
}

/** NEW (0.4.0): a copy's picture, its file in the archive (`pic`), a picture by its bytes. null: missing or not one. */
function pictureIn(o: any, files: CopyFiles): Blob | null {
    if (typeof o?.pic !== 'string') return null
    const bytes = files.get(o.pic.replace(/\\/g, '/').replace(/^\.?\/+/, ''))
    const type = bytes && pictureType(bytes)
    return type ? new Blob([bytes as BlobPart], { type }) : null
}

async function blocksIn(list: unknown, make: MakePicture, files: CopyFiles): Promise<Block[]> {
    const out: Block[] = []
    for (const b of Array.isArray(list) ? list.slice(0, 2000) : []) {
        if (!b || typeof b !== 'object') continue
        const lvl = Math.floor(num((b as any).lvl, 0, 6, 0))
        if ((b as any).t === 'img') {
            const src = pictureIn(b, files)
            if (!src) continue
            const pic = await make(src)
            if (pic) out.push({ id: uid(), t: 'img', lvl, ...pic, ink: okInk((b as any).ink) })
        } else if ((b as any).t === 'table') {
            const t = tableIn(b, lvl)
            if (t) out.push(t)
        } else if ((b as any).t === 'ink') {
            out.push({ id: uid(), t: 'ink', lvl, h: Math.round(num((b as any).h, 150, 2400, 380)), ink: okInk((b as any).ink) })
        } else {
            out.push({ id: uid(), t: pick((b as any).t, ['p', 'b', 'c', 'n', 'h'] as const, 'p'), lvl, checked: !!(b as any).checked, ...((b as any).round === true ? { round: true } : {}), html: sanitize((b as any).html) })
        }
    }
    return out
}

async function stackIn(d: DeskData, so: any, board: string, group: string | null, make: MakePicture, files: CopyFiles): Promise<Stack> {
    const s = newStack(d, {
        board, group, place: okPlace(so?.place), autoName: false,
        name: String(so?.name ?? 'Imported stack').slice(0, 40) || 'Imported stack',
        color: pick(so?.color, PAPER_COLORS, 'chalk'), paper: pick<PaperKind>(so?.paper, ['plain', 'lined', 'grid'], 'plain'),
        numbered: !!so?.numbered, flags: Array.isArray(so?.flags) ? so.flags.filter((f: unknown) => typeof f === 'string' && f in FLAG_NAMES) : [],
        due: okDate(so?.due),
    })
    for (const no of Array.isArray(so?.notes) ? so.notes.slice(0, MAX_NOTES) : []) {
        const blocks = await blocksIn(no?.blocks, make, files)
        const n = newNote(d, s, blocks.length ? blocks : null)
        n.ink = okInk(no?.ink)
        if (typeof no?.title === 'string' && no.title.trim()) n.title = no.title.trim().slice(0, NOTE_TITLE_MAX)
        if (s.numbered && Number.isInteger(no?.num) && no.num > 0) { n.num = no.num; s.nextNum = Math.max(s.nextNum, n.num + 1) }
    }
    if (!s.notes.length) newNote(d, s)
    s.active = s.notes[0]
    return s
}

/** What a file's JSON is (parsed): a board, a stack, or not a Corkboard file of this format. */
export function copyKind(o: any): 'stack' | 'board' | null {
    if (o?.corkboard !== FORMAT) return null
    return o.kind === 'board' ? 'board' : o.kind === 'stack' && o.stack ? 'stack' : null
}

/**
 * Adds a stack copy to the view (board, group). The caller places it (its place in the copy is kept only as a
 * hint). `o`: the file's JSON, parsed (copyKind 'stack'); files: its pictures.
 */
export async function importStack(d: DeskData, o: any, files: CopyFiles, board: string, group: string | null, make: MakePicture): Promise<Stack> {
    if (copyKind(o) !== 'stack') throw new Error("That isn't a Corkboard stack file.")
    const s = await stackIn(d, o.stack, board, group, make, files)
    if (d.stacks.some(x => x.board === board && x.name === s.name)) s.name = (s.name + ' (copy)').slice(0, 40)
    d.stacks.push(s)
    return s
}

/** Adds a board file as a new board (its groups, stacks and notes with new ids). `o`: its JSON, parsed; files: its pictures. */
export async function importBoard(d: DeskData, o: any, files: CopyFiles, make: MakePicture): Promise<Board> {
    if (copyKind(o) !== 'board') throw new Error("That isn't a Corkboard board file.")
    let title = String(o.board?.title ?? '').slice(0, 40)
    if (d.boards.some(b => b.title === title)) title = ((title || 'Untitled board') + ' (copy)').slice(0, 40)
    const b: Board = { id: uid(), title, surface: pick(o.board?.surface, SURFACES.map(s => s[0]), 'cork'), cols: 0 }
    d.boards.push(b)
    const gids: string[] = []
    for (const go of Array.isArray(o.groups) ? o.groups.slice(0, 200) : []) {
        const g: Group = { id: uid(), kind: 'group', board: b.id, name: String(go?.name ?? 'Group').slice(0, 40) || 'Group', pin: pick(go?.pin, PINS, 'red'), due: okDate(go?.due), place: okPlace(go?.place), tilt: rndTilt(), z: ++d.z, cols: 0 }
        d.groups.push(g); gids.push(g.id)
    }
    for (const so of Array.isArray(o.stacks) ? o.stacks.slice(0, MAX_STACKS) : []) {
        const gi = Number.isInteger(so?.group) ? gids[so.group] ?? null : null
        d.stacks.push(await stackIn(d, so, b.id, gi, make, files))
    }
    for (const po of Array.isArray(o.photos) ? o.photos.slice(0, MAX_STACKS) : []) {
        const src = pictureIn(po, files)
        if (!src) continue
        const pic = await make(src)
        if (!pic) continue
        const gi = Number.isInteger(po?.group) ? gids[po.group] ?? null : null
        d.photos.push({ id: uid(), kind: 'photo', board: b.id, group: gi, ...pic, caption: String(po?.caption ?? '').replace(/\s+/g, ' ').slice(0, PHOTO_CAPTION_MAX), ink: okInk(po?.ink), place: okPlace(po?.place), tilt: rndTilt(), z: ++d.z })
    }
    return b
}

// ── A new Corkboard ─────────────────────────────────────────────────────────

/** The "Start here" stack: what the board does, written as notes (the user deletes it when done). */
export function seedDesk(d: DeskData): void {
    const s = newStack(d, { name: 'Start here', autoName: false, color: 'sky', place: { rect: { col: 0, row: 0, colSpan: GRID, rowSpan: GRID } } })
    d.stacks.push(s)
    newNote(d, s, parseText(`# How the board works
- Double-click the cork to start a note right there
- Click a stack to open it. The tabs on the right switch notes
- Right-click anything for its options: flags, due dates, colours
- Drop a stack on the middle of another to pile them
  - Drop it on an edge to push the other aside instead
  - Hold Alt while dragging to place it freely
- Drag a stack's corner to make it bigger or smaller (down to its name only)
- Drop a stack on a pin to put it in that group
- The board's name, top left, switches boards`))
    newNote(d, s, parseText(`# Lists that let go
- Type "- " for a bullet, "[ ] " for a checkbox, "1. " for numbers, "# " for a heading
- Tab and Shift+Tab indent from anywhere in the line
- Enter on an empty item steps out one level
- Shift+Enter starts a new line in the same item; ↓ on the last item ends the list
  Like this line: plain text, lined up with the bullet above
- Backspace at the start of an item turns it into plain text
- Alt+T adds a table: Tab goes to the next cell, Enter down a row
[ ] Click a box to tick it`))
    newNote(d, s, [...parseText(`# Ink and pictures
- Paste a screenshot into a note, then draw on it
- Paste or drop a picture on the board to pin it there; click it to see it large and draw on it
- Right-drag erases, or pick the eraser below
- Hold Alt and drag to scribble anywhere on the page
- Pen users: turn on Pen mode in the ⋯ menu
- Every key and gesture is in GEM Shell's Keyboard shortcuts: star the ones you want on your cheat sheet`), { id: uid(), t: 'ink', lvl: 0, h: 300, ink: [] }, blk()])
    s.active = s.notes[0]
}

export { isText }
