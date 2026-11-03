// widgets/corkboard/layout.ts
//
// WHERE THINGS GO ON A BOARD (0.1.0). A view (a board, or a group opened) is one tall grid of `cols` columns, shown
// a page of `rows` rows at a time: rows 0..rows-1 are page 1, and so on. The pushing is GEM Shell's own hub engine
// (gridDrag / gridResize from 'gexplorer/widgets'); what this file adds:
//   - pages: nothing straddles two pages (a stack pushed across the line goes to the next page's top);
//   - the widget changing width: positions are kept for the column count they were made with, and re-flowed in
//     reading order when the board shows another count (nothing saved until the user moves something);
//   - free places (Alt): fractions of cells on a page, outside the engine (they may overlap).
// Pure: no DOM.
import { gridSnapshot, gridDrag, gridResize, type GridRect } from 'gexplorer/widgets'
import { MAX_SPAN, clamp, type Place } from './model'

export type Geometry = {
    cols: number
    /** Rows per page. */
    rows: number
    /** A cell's side, px. */
    cell: number
    /** Where the grid starts in the board, px (centred horizontally; below the group's bar). */
    ox: number
    oy: number
    /** Stacks too small to read: drawn as their initials. */
    icon: boolean
}
export type FreeSpot = { page: number; x: number; y: number }
export type ViewLayout = { rects: Map<string, GridRect>; free: Map<string, FreeSpot>; pages: number }

/** The grid for a board W × H px (top: a bar above the grid; bottom: the pager's room). */
export function measure(W: number, H: number, top = 0, bottom = 30): Geometry {
    const w = Math.max(120, W), h = Math.max(120, H - top - bottom)
    let cols = Math.max(2, Math.round(w / 165)), cell = w / cols, rows = Math.floor(h / cell)
    if (rows < 1) { cell = Math.max(64, h - 4); cols = Math.max(1, Math.floor(w / cell)); rows = 1 }
    return { cols, rows, cell, ox: (w - cols * cell) / 2, oy: top, icon: cell < 118 }
}

export const pageOf = (r: GridRect, rows: number) => Math.floor(r.row / rows)
const straddles = (r: GridRect, rows: number) => Math.floor(r.row / rows) !== Math.floor((r.row + r.rowSpan - 1) / rows)
const key = (c: number, r: number) => c + ',' + r

function fits(occ: Set<string>, r: GridRect, cols: number, rows: number): boolean {
    if (r.col < 0 || r.row < 0 || r.col + r.colSpan > cols || straddles(r, rows)) return false
    for (let y = r.row; y < r.row + r.rowSpan; y++) for (let x = r.col; x < r.col + r.colSpan; x++) if (occ.has(key(x, y))) return false
    return true
}
function occupy(occ: Set<string>, r: GridRect) {
    for (let y = r.row; y < r.row + r.rowSpan; y++) for (let x = r.col; x < r.col + r.colSpan; x++) occ.add(key(x, y))
}
/** The first free spot of colSpan × rowSpan from `fromRow`, reading order, never across a page line. */
function firstFree(occ: Set<string>, cols: number, rows: number, colSpan: number, rowSpan: number, fromRow: number): GridRect {
    for (let row = Math.max(0, fromRow); ; row++)
        for (let col = 0; col + colSpan <= cols; col++) {
            const r = { col, row, colSpan, rowSpan }
            if (fits(occ, r, cols, rows)) return r
        }
}
const spanFor = (r: GridRect, cols: number, rows: number) => ({
    colSpan: clamp(r.colSpan, 1, Math.min(MAX_SPAN.cols, cols)),
    rowSpan: clamp(r.rowSpan, 1, Math.min(MAX_SPAN.rows, rows)),
})

/**
 * Where each item of a view shows now. Items on the grid keep their rect when it is still valid for these
 * columns and pages; the others (another column count, a page line crossed, an overlap) are placed in reading
 * order. Every rect is whole cells, inside the columns, on one page, none overlapping.
 */
export function layoutView(items: readonly { id: string; place: Place }[], storedCols: number, cols: number, rows: number): ViewLayout {
    const rects = new Map<string, GridRect>(), free = new Map<string, FreeSpot>()
    const occ = new Set<string>()
    const grid = items.filter((i): i is { id: string; place: { rect: GridRect } } => 'rect' in i.place)
        .map((i, n) => ({ id: i.id, r: i.place.rect, n }))
        .sort((a, b) => (a.r.row - b.r.row) || (a.r.col - b.r.col) || (a.n - b.n))
    const sameCols = storedCols === cols
    const later: typeof grid = []
    for (const g of grid) {
        const s = spanFor(g.r, cols, rows)
        const r = { col: clamp(g.r.col, 0, cols - s.colSpan), row: Math.max(0, g.r.row), ...s }
        if (sameCols && fits(occ, r, cols, rows)) { occupy(occ, r); rects.set(g.id, r) }
        else later.push(g)
    }
    for (const g of later) {
        const s = spanFor(g.r, cols, rows)
        const from = sameCols ? Math.floor(Math.max(0, g.r.row) / rows) * rows : 0
        const r = firstFree(occ, cols, rows, s.colSpan, s.rowSpan, from)
        occupy(occ, r); rects.set(g.id, r)
    }
    let pages = 1
    for (const r of rects.values()) pages = Math.max(pages, pageOf(r, rows) + 1)
    for (const i of items) {
        if (!('free' in i.place)) continue
        const f = i.place.free
        const spot = { page: Math.max(0, Math.floor(f.page)), x: clamp(f.x, 0, Math.max(0, cols - 1)), y: clamp(f.y, 0, Math.max(0, rows - 1)) }
        free.set(i.id, spot)
        pages = Math.max(pages, spot.page + 1)
    }
    return { rects, free, pages }
}

/** Moves whatever crosses a page line to the next page's top (the engine pushing others as it goes). */
function settlePages(out: Map<string, GridRect>, cols: number, rows: number): Map<string, GridRect> {
    for (let guard = 0; guard < 64; guard++) {
        let hit: [string, GridRect] | null = null
        for (const e of out) if (straddles(e[1], rows)) { hit = e; break }
        if (!hit) return out
        const [id, r] = hit
        out = gridDrag(gridSnapshot([...out].map(([i, rect]) => ({ id: i, rect }))), cols, id, { col: r.col, row: (pageOf(r, rows) + 1) * rows })
    }
    return out
}

/**
 * The layout while `id` is dragged with its top-left on `cell` (a row of the tall grid): it lands there, kept on
 * that cell's page; the stacks it covers are pushed as on a hub.
 */
export function dragPreview(rects: Map<string, GridRect>, cols: number, rows: number, id: string, cell: { col: number; row: number }): Map<string, GridRect> {
    const me = rects.get(id)
    if (!me) return rects
    const pageTop = Math.floor(Math.max(0, cell.row) / rows) * rows
    const row = clamp(cell.row, pageTop, pageTop + rows - me.rowSpan)
    const out = gridDrag(gridSnapshot([...rects].map(([i, rect]) => ({ id: i, rect }))), cols, id, { col: cell.col, row })
    return settlePages(out, cols, rows)
}

/**
 * The layout while `id`'s corner is dragged by (dCols, dRows) cells from its size when the drag began: at most
 * MAX_SPAN, never past its page's bottom; the stacks it now covers are pushed. null: the size can't change.
 */
export function resizePreview(rects: Map<string, GridRect>, cols: number, rows: number, id: string, dCols: number, dRows: number): Map<string, GridRect> | null {
    const me = rects.get(id)
    if (!me) return null
    const roomBelow = (pageOf(me, rows) + 1) * rows - me.row
    const limits = { maxCols: Math.min(MAX_SPAN.cols, cols), maxRows: Math.min(MAX_SPAN.rows, roomBelow) }
    const out = gridResize(gridSnapshot([...rects].map(([i, rect]) => ({ id: i, rect }))), cols, id, 'se', Math.round(dCols), Math.round(dRows), limits)
    return out ? settlePages(out, cols, rows) : null
}

/** A spot for a new 1 × 1 item: `want` when free, else the first free on its page, else on the pages after. */
export function placeNew(rects: Map<string, GridRect>, cols: number, rows: number, page: number, want?: { col: number; row: number }): GridRect {
    const occ = new Set<string>()
    for (const r of rects.values()) occupy(occ, r)
    if (want) {
        const r = { col: clamp(want.col, 0, cols - 1), row: Math.max(0, want.row), colSpan: 1, rowSpan: 1 }
        if (fits(occ, r, cols, rows)) return r
    }
    return firstFree(occ, cols, rows, 1, 1, Math.max(0, page) * rows)
}

/** The cell under a point of the board (px), on page `page`: column, and row of the tall grid. */
export function cellAt(g: Geometry, page: number, x: number, y: number): { col: number; row: number } {
    return {
        col: clamp(Math.floor((x - g.ox) / g.cell), 0, g.cols - 1),
        row: page * g.rows + clamp(Math.floor((y - g.oy) / g.cell), 0, g.rows - 1),
    }
}
