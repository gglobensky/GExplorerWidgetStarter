// widgets/corkboard/table.ts
//
// NEW (0.2.0): TABLES IN A NOTE, a simple grid with no formulas (Guillaume, 2026-11-02). A cell holds short text
// (b / i / u / s, as lines do). The editor (editor.ts) draws them and moves the caret between cells; here: the
// table's HTML, its changes (rows, columns, widths), pasting cells copied from a spreadsheet (tab-separated), and its
// plain text (search, Markdown).
import { type TableBlock, TABLE_MAX, esc, textOf, clamp } from './model'

export const colsOf = (b: TableBlock) => b.rows[0]?.length ?? 0

/** The widths made right for the column count again (an import, a column added or removed): they add up to 100. */
export function fitWidths(b: TableBlock) {
    const n = colsOf(b)
    let w = b.widths.slice(0, n).map(x => (Number.isFinite(x) && x > 0 ? x : 100 / Math.max(1, n)))
    while (w.length < n) w.push(100 / n)
    const sum = w.reduce((a, x) => a + x, 0) || 1
    w = w.map(x => +(x * 100 / sum).toFixed(2))
    b.widths = w
}

export function addRow(b: TableBlock, at: number): boolean {
    if (b.rows.length >= TABLE_MAX.rows) return false
    b.rows.splice(clamp(at, 0, b.rows.length), 0, Array.from({ length: colsOf(b) }, () => ''))
    return true
}
export function addCol(b: TableBlock, at: number): boolean {
    const n = colsOf(b)
    if (n >= TABLE_MAX.cols) return false
    at = clamp(at, 0, n)
    for (const r of b.rows) r.splice(at, 0, '')
    // the new column takes a fair share from the others
    const share = 100 / (n + 1)
    b.widths = b.widths.map(w => w * (100 - share) / 100)
    b.widths.splice(at, 0, share)
    fitWidths(b)
    return true
}
/** false: the table's last row (the table goes instead, from the menu). */
export function delRow(b: TableBlock, r: number): boolean {
    if (b.rows.length <= 1) return false
    b.rows.splice(r, 1)
    return true
}
export function delCol(b: TableBlock, c: number): boolean {
    if (colsOf(b) <= 1) return false
    for (const r of b.rows) r.splice(c, 1)
    b.widths.splice(c, 1)
    fitWidths(b)
    return true
}
export function moveRow(b: TableBlock, r: number, dir: number): number {
    const j = r + dir
    if (j < 0 || j >= b.rows.length) return r
    ;[b.rows[r], b.rows[j]] = [b.rows[j], b.rows[r]]
    return j
}
export const rowEmpty = (b: TableBlock, r: number) => (b.rows[r] ?? []).every(h => !textOf(h).trim())

/**
 * Cells copied from Excel, Google Sheets, a web page's table as text: tab-separated lines (a quoted cell may hold
 * tabs or line breaks). null: not cells (no tab anywhere). Bounded by TABLE_MAX.
 */
export function parseTSV(text: string): string[][] | null {
    text = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
    if (!text.includes('\t')) return null
    const rows: string[][] = []
    let row: string[] = [], cell = '', i = 0, quoted = false
    while (i < text.length) {
        const ch = text[i]
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue }
            if (ch === '"') { quoted = false; i++; continue }
            cell += ch; i++; continue
        }
        if (ch === '"' && cell === '') { quoted = true; i++; continue }
        if (ch === '\t') { row.push(cell); cell = ''; i++; continue }
        if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; if (rows.length >= TABLE_MAX.rows) break; continue }
        cell += ch; i++
    }
    if (rows.length < TABLE_MAX.rows) { row.push(cell); rows.push(row) }
    const cols = Math.min(TABLE_MAX.cols, Math.max(...rows.map(r => r.length)))
    return rows.map(r => Array.from({ length: cols }, (_, c) => (r[c] ?? '').replace(/\n/g, ' ').slice(0, TABLE_MAX.cell)))
}

/** Plain text cells into a table's cells from (r, c), the table growing as needed (bounded). */
export function fillFrom(b: TableBlock, r0: number, c0: number, cells: string[][]) {
    const needCols = Math.min(TABLE_MAX.cols, c0 + Math.max(...cells.map(x => x.length)))
    while (colsOf(b) < needCols && addCol(b, colsOf(b))) { /* grows */ }
    const needRows = Math.min(TABLE_MAX.rows, r0 + cells.length)
    while (b.rows.length < needRows && addRow(b, b.rows.length)) { /* grows */ }
    cells.forEach((row, i) => row.forEach((t, j) => {
        const r = r0 + i, c = c0 + j
        if (r < b.rows.length && c < colsOf(b)) b.rows[r][c] = esc(t)
    }))
}

export function tableHTML(b: TableBlock): string {
    const n = colsOf(b)
    const cols = b.widths.map(w => `<col style="width:${w}%">`).join('')
    const body = b.rows.map((row, r) => '<tr>' + row.map((h, c) =>
        `<td><div class="cb-cell" contenteditable="true" spellcheck="true" data-r="${r}" data-c="${c}">${h}</div>` +
        (r === 0 && c < n - 1 ? `<span class="cb-colgrip" data-c="${c}" title="Drag to change the width"></span>` : '') + '</td>').join('') + '</tr>').join('')
    return `<div class="cb-blk cb-table" data-id="${b.id}" style="--lvl:${b.lvl || 0}"><div class="cb-tw">` +
        `<table class="${b.head ? 'hd' : ''}"><colgroup>${cols}</colgroup><tbody>${body}</tbody></table>` +
        `<button class="cb-tadd cb-tadd-c" type="button" tabindex="-1" title="Add a column" aria-label="Add a column">＋</button></div>` +
        `<button class="cb-tadd cb-tadd-r" type="button" tabindex="-1" title="Add a row" aria-label="Add a row">＋</button></div>`
}

/** The table as text: cells by tabs, rows by lines (search, the board's preview). */
export const tableText = (b: TableBlock) => b.rows.map(r => r.map(h => textOf(h).trim()).join('\t')).join('\n')

/** The table in Markdown (export), indented by pad. */
export function tableMd(b: TableBlock, pad = ''): string {
    const cell = (h: string) => textOf(h).trim().replace(/\|/g, '\\|') || ' '
    const line = (r: string[]) => pad + '| ' + r.map(cell).join(' | ') + ' |\n'
    const sep = pad + '|' + b.rows[0].map(() => ' --- ').join('|') + '|\n'
    if (b.head) return line(b.rows[0]) + sep + b.rows.slice(1).map(line).join('')
    return line(b.rows[0].map(() => '')) + sep + b.rows.map(line).join('')
}
