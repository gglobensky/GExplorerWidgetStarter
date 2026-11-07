// widgets/forge/layout.ts
//
// GEM FORGE 0.1b: PAGES OF TILES (the prototype's docking, as GEM Monitor's hub). The user makes pages (with an
// optional name) and switches between them; a page is a grid of tiles laid out with GEM Shell's own engine (gridDrag /
// gridResize / gridFirstFree: the hubs' maths). A tile holds one part, or several as tabs. Each part is in one tile
// at most, on one page at most (one editor, one preview... for now).
//   On a tab (its ⋯ button or a right-click): Detach (its own tile), Attach to… (a tab of another tile), Move to
//   page…, Close. ＋ Part: the parts; ✓ on this page, "✓ (on <page>)" elsewhere (picking it moves it here).
//   ✎ arranges the page: drag a tile by its head to move it (the others make room), its corner to resize it.
// The grid always has COLS columns (they stretch with the box); rows share the height. Saved in this copy's view
// (view.forge: { pages, page }), as GEM Monitor's tiles: each copy of GEM Forge keeps its own arrangement.
import { gridSnapshot, gridDrag, gridResize, gridFirstFree } from 'gexplorer/widgets'
import type { GridRect } from 'gexplorer/widgets'

export type PartKind = 'explorer' | 'code' | 'preview' | 'problems' | 'output'
export const PARTS: PartKind[] = ['explorer', 'code', 'preview', 'problems', 'output']
export const PART_TITLES: Record<PartKind, string> = { explorer: 'Explorer', code: 'Code', preview: 'Preview', problems: 'Problems', output: 'Output' }

export type Tile = { id: string; rect: GridRect; parts: PartKind[]; active: PartKind }
export type Page = { id: string; name: string; tiles: Tile[] }
export type Layout = { pages: Page[]; page: string }

export const COLS = 12
export const MAX_PAGES = 8
const MAX_ROWS = 24

let seq = 0
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`
const r = (col: number, row: number, colSpan: number, rowSpan: number): GridRect => ({ col, row, colSpan, rowSpan })

/** The usual pages: Code (Explorer | Code | Preview over Problems + Output) and Preview (big, with the console). */
export function usualLayout(): Layout {
    const code: Page = {
        id: newId('p'), name: 'Code', tiles: [
            { id: newId('t'), rect: r(0, 0, 2, 6), parts: ['explorer'], active: 'explorer' },
            { id: newId('t'), rect: r(2, 0, 6, 6), parts: ['code'], active: 'code' },
            { id: newId('t'), rect: r(8, 0, 4, 3), parts: ['preview'], active: 'preview' },
            { id: newId('t'), rect: r(8, 3, 4, 3), parts: ['problems', 'output'], active: 'problems' },
        ],
    }
    return { pages: [code, { id: newId('p'), name: 'Preview', tiles: [] }], page: code.id }
}

/** A saved layout, checked (it comes from the view): odd entries dropped, each part once at most. */
export function cleanLayout(v: unknown): Layout {
    const raw = v as any
    if (!raw || !Array.isArray(raw.pages)) return usualLayout()
    const seen = new Set<PartKind>()
    const n = (x: any, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(x) || 0)))
    const pages: Page[] = []
    for (const p of raw.pages.slice(0, MAX_PAGES)) {
        if (!p || typeof p.id !== 'string') continue
        const tiles: Tile[] = []
        for (const t of Array.isArray(p.tiles) ? p.tiles.slice(0, 20) : []) {
            if (!t || typeof t.id !== 'string') continue
            const parts = (Array.isArray(t.parts) ? t.parts : []).filter((k: any) => PARTS.includes(k) && !seen.has(k)) as PartKind[]
            if (!parts.length) continue
            parts.forEach(k => seen.add(k))
            const rc = t.rect ?? {}
            const col = n(rc.col, 0, COLS - 1)
            tiles.push({
                id: t.id.slice(0, 40), parts, active: parts.includes(t.active) ? t.active : parts[0],
                rect: { col, row: n(rc.row, 0, MAX_ROWS - 1), colSpan: n(rc.colSpan, 1, COLS - col), rowSpan: n(rc.rowSpan, 1, MAX_ROWS) },
            })
        }
        pages.push({ id: p.id.slice(0, 40), name: typeof p.name === 'string' ? p.name.slice(0, 24) : '', tiles })
    }
    if (!pages.length) return usualLayout()
    return { pages, page: pages.some(p => p.id === raw.page) ? raw.page : pages[0].id }
}

const snapOf = (tiles: Tile[]) => gridSnapshot(tiles.map(t => ({ id: t.id, rect: t.rect })))
const withRects = (tiles: Tile[], rects: Map<string, GridRect>) => tiles.map(t => ({ ...t, rect: rects.get(t.id) ?? t.rect }))

/** Where a part is: its page and tile, or null. */
export function findPart(l: Layout, kind: PartKind): { page: Page; tile: Tile } | null {
    for (const page of l.pages) for (const tile of page.tiles) if (tile.parts.includes(kind)) return { page, tile }
    return null
}

/** The layout without <kind> (a tile left empty goes). */
function without(l: Layout, kind: PartKind): Layout {
    return {
        ...l,
        pages: l.pages.map(p => ({
            ...p,
            tiles: p.tiles.flatMap(t => {
                if (!t.parts.includes(kind)) return [t]
                const parts = t.parts.filter(k => k !== kind)
                return parts.length ? [{ ...t, parts, active: t.active === kind ? parts[0] : t.active }] : []
            }),
        })),
    }
}

/** <kind> in a tile of its own on page <pageId>, at the first free spot (half the width, three rows). */
export function placeAlone(l: Layout, kind: PartKind, pageId = l.page): Layout {
    const out = without(l, kind)
    return {
        ...out,
        pages: out.pages.map(p => {
            if (p.id !== pageId) return p
            const span = kind === 'code' ? 6 : kind === 'explorer' ? 2 : 4
            const rect = gridFirstFree(snapOf(p.tiles), COLS, span, 3, 0)
            return { ...p, tiles: [...p.tiles, { id: newId('t'), rect, parts: [kind], active: kind }] }
        }),
    }
}

/** Detach: <kind> out of its tile, into one of its own on the same page. */
export function detach(l: Layout, kind: PartKind): Layout {
    const at = findPart(l, kind)
    if (!at || at.tile.parts.length < 2) return l
    return placeAlone(l, kind, at.page.id)
}

/** Attach to…: <kind> becomes a tab of tile <tileId>. */
export function attach(l: Layout, kind: PartKind, tileId: string): Layout {
    const out = without(l, kind)
    return {
        ...out,
        pages: out.pages.map(p => ({
            ...p,
            tiles: p.tiles.map(t => (t.id === tileId ? { ...t, parts: [...t.parts, kind], active: kind } : t)),
        })),
    }
}

/** Move to page…: <kind> in a tile of its own on <pageId>. */
export const moveToPage = (l: Layout, kind: PartKind, pageId: string): Layout => placeAlone(l, kind, pageId)

/** Close: <kind> leaves the layout (＋ Part brings it back). */
export const closePart = (l: Layout, kind: PartKind): Layout => without(l, kind)

export function setActive(l: Layout, tileId: string, kind: PartKind): Layout {
    return { ...l, pages: l.pages.map(p => ({ ...p, tiles: p.tiles.map(t => (t.id === tileId && t.parts.includes(kind) ? { ...t, active: kind } : t)) })) }
}

/** The current page's tiles moved (a drag): gridDrag's result. */
export function dragTile(tiles: Tile[], id: string, cell: { col: number; row: number }): Tile[] {
    return withRects(tiles, gridDrag(snapOf(tiles), COLS, id, cell, { maxBottomRow: MAX_ROWS - 1 }))
}
/** Resized from its corner by whole cells, or null when it can't. */
export function resizeTile(tiles: Tile[], id: string, dCols: number, dRows: number): Tile[] | null {
    const rects = gridResize(snapOf(tiles), COLS, id, 'se', dCols, dRows, { minCols: 1, minRows: 1, maxCols: COLS, maxRows: MAX_ROWS })
    return rects ? withRects(tiles, rects) : null
}

export function setTiles(l: Layout, pageId: string, tiles: Tile[]): Layout {
    return { ...l, pages: l.pages.map(p => (p.id === pageId ? { ...p, tiles } : p)) }
}

export function addPage(l: Layout): Layout {
    if (l.pages.length >= MAX_PAGES) return l
    const p: Page = { id: newId('p'), name: '', tiles: [] }
    return { pages: [...l.pages, p], page: p.id }
}
export function renamePage(l: Layout, pageId: string, name: string): Layout {
    return { ...l, pages: l.pages.map(p => (p.id === pageId ? { ...p, name: name.trim().slice(0, 24) } : p)) }
}
/** A page removed: its parts leave the layout too (＋ Part brings them back). The last page stays. */
export function removePage(l: Layout, pageId: string): Layout {
    if (l.pages.length < 2) return l
    const i = l.pages.findIndex(p => p.id === pageId)
    const pages = l.pages.filter(p => p.id !== pageId)
    return { pages, page: l.page === pageId ? pages[Math.max(0, i - 1)].id : l.page }
}
export const pageName = (l: Layout, p: Page) => p.name || `Page ${l.pages.indexOf(p) + 1}`
