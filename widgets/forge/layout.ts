// widgets/forge/layout.ts
//
// GEM FORGE 0.1b: PAGES OF TILES (the prototype's docking, as GEM Monitor's hub). The user makes pages (with an
// optional name) and switches between them; a page is a grid of tiles laid out with GEM Shell's own engine (gridDrag /
// gridResize / gridFirstFree: the hubs' maths). A tile holds one part, or several as tabs.
//   On a tab (its ⋯ button or a right-click): Detach (its own tile), Attach to…, Move to page…, Close. ＋ Part: the
//   parts; ✓ on this page, "✓ (on <page>)" elsewhere (picking it moves it here).
//   ✎ arranges the page: drag a tile by its head to move it (the others make room), its corner to resize it.
// The grid always has COLS columns (they stretch with the box); rows share the height. Saved in this copy's view
// (view.forge: { v, pages, page, previews }), as GEM Monitor's tiles: each copy of GEM Forge keeps its own arrangement.
//
// LAYOUT v2 (0.1.7):
//   - a finer grid: 24 columns, rows half as tall (48 rows at most); (0.1.8: the one-time conversion of v1 layouts
//     went, Guillaume's were converted);
//   - parts have ids: the kind ('code') or, for a part that can be there several times (Preview), kind:n
//     ('preview:2'): a small preview on Code and a big one on its own page. Each preview keeps its options
//     (previews[id]: its placement and the simulated sizes).
import { gridSnapshot, gridDrag, gridResize, gridFirstFree } from 'gexplorer/widgets'
import type { GridRect, DevPreviewContext } from 'gexplorer/widgets'

// 'playground' (0.1d): the playground, full size (not in the usual layout: ＋ Part ▸ Playground); 'search' (0.1.11):
// Find in files (Ctrl+Shift+F places it); 'packages' (0.2.0): npm packages (＋ Part ▸ Packages)
export type PartKind = 'explorer' | 'code' | 'preview' | 'problems' | 'output' | 'playground' | 'search' | 'packages'
export const PARTS: PartKind[] = ['explorer', 'code', 'preview', 'problems', 'output', 'search', 'packages', 'playground']
export const PART_TITLES: Record<PartKind, string> = { explorer: 'Explorer', code: 'Code', preview: 'Preview', problems: 'Problems', output: 'Output', playground: 'Playground', search: 'Search', packages: 'Packages' }
/** Kinds a page can hold several of (each its own id). */
export const MULTI: PartKind[] = ['preview']
/** A part in the layout: its kind, or kind:n for another one of a MULTI kind. */
export type PartId = string

export const kindOf = (id: PartId): PartKind => id.split(':')[0] as PartKind
export function partTitle(id: PartId): string {
    const [k, n] = id.split(':')
    return `${PART_TITLES[k as PartKind] ?? k}${n ? ` ${n}` : ''}`
}
const validId = (id: unknown): id is PartId => {
    if (typeof id !== 'string') return false
    const [k, n, more] = id.split(':')
    if (more !== undefined || !PARTS.includes(k as PartKind)) return false
    return n === undefined || (MULTI.includes(k as PartKind) && /^[2-9]$|^1[0-9]$/.test(n))
}

/** A preview's own options: its placement, and the sizes it simulates (px; absent: the box's / the default). */
export type PreviewOpts = {
    context: DevPreviewContext
    /** sidebar: the height it gets now, between the smallest and the largest; toolbar: its width. */
    height?: number
    minHeight?: number
    maxHeight?: number
    width?: number
    /** 0.1.10, grid: the cells it takes in the simulated hub (absent: all of them). */
    gridCols?: number
    gridRows?: number
    /** 0.1.12, grid: its top-left cell (absent: 0, 0). */
    gridCol?: number
    gridRow?: number
}
export const previewOptsInit = (): PreviewOpts => ({ context: 'grid' })

export type Tile = { id: string; rect: GridRect; parts: PartId[]; active: PartId }
export type Page = { id: string; name: string; tiles: Tile[] }
export type Layout = { v: 2; pages: Page[]; page: string; previews: Record<PartId, PreviewOpts> }

export const COLS = 24
export const MAX_PAGES = 8
const MAX_ROWS = 48

let seq = 0
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`
const r = (col: number, row: number, colSpan: number, rowSpan: number): GridRect => ({ col, row, colSpan, rowSpan })

/** The usual pages: Code (Explorer | Code | Preview over Problems + Output) and Preview (big, with the console). */
export function usualLayout(): Layout {
    const code: Page = {
        id: newId('p'), name: 'Code', tiles: [
            { id: newId('t'), rect: r(0, 0, 4, 12), parts: ['explorer'], active: 'explorer' },
            { id: newId('t'), rect: r(4, 0, 12, 12), parts: ['code'], active: 'code' },
            { id: newId('t'), rect: r(16, 0, 8, 6), parts: ['preview'], active: 'preview' },
            { id: newId('t'), rect: r(16, 6, 8, 6), parts: ['problems', 'output'], active: 'problems' },
        ],
    }
    return { v: 2, pages: [code, { id: newId('p'), name: 'Preview', tiles: [] }], page: code.id, previews: {} }
}

/** A saved layout, checked (it comes from the view): odd entries dropped, each part once at most. */
export function cleanLayout(v: unknown): Layout {
    const raw = v as any
    if (!raw || !Array.isArray(raw.pages)) return usualLayout()
    const seen = new Set<PartId>()
    const n = (x: any, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(x) || 0)))
    const pages: Page[] = []
    for (const p of raw.pages.slice(0, MAX_PAGES)) {
        if (!p || typeof p.id !== 'string') continue
        const tiles: Tile[] = []
        for (const t of Array.isArray(p.tiles) ? p.tiles.slice(0, 24) : []) {
            if (!t || typeof t.id !== 'string') continue
            const parts = (Array.isArray(t.parts) ? t.parts : []).filter((id: any) => validId(id) && !seen.has(id)) as PartId[]
            if (!parts.length) continue
            parts.forEach(id => seen.add(id))
            const rc = t.rect ?? {}
            const col = n(rc.col, 0, COLS - 1)
            tiles.push({
                id: t.id.slice(0, 40), parts, active: parts.includes(t.active) ? t.active : parts[0],
                rect: {
                    col, row: n(rc.row, 0, MAX_ROWS - 1),
                    colSpan: n(rc.colSpan, 1, COLS - col), rowSpan: n(rc.rowSpan, 1, MAX_ROWS),
                },
            })
        }
        pages.push({ id: p.id.slice(0, 40), name: typeof p.name === 'string' ? p.name.slice(0, 24) : '', tiles })
    }
    if (!pages.length) return usualLayout()
    const previews: Record<PartId, PreviewOpts> = {}
    const CTX = ['grid', 'sidebar', 'toolbar']
    const px = (x: any) => (typeof x === 'number' && x >= 20 && x <= 4000 ? Math.round(x) : undefined)
    const cells = (x: any) => (typeof x === 'number' && x >= 1 && x <= 64 ? Math.round(x) : undefined)
    const at = (x: any) => (typeof x === 'number' && x >= 0 && x < 64 ? Math.round(x) : undefined)
    for (const [id, o] of Object.entries(raw.previews ?? {}) as [string, any][]) {
        if (!seen.has(id) || kindOf(id) !== 'preview' || !o) continue
        previews[id] = { context: CTX.includes(o.context) ? o.context : 'grid', height: px(o.height), minHeight: px(o.minHeight), maxHeight: px(o.maxHeight), width: px(o.width), gridCols: cells(o.gridCols), gridRows: cells(o.gridRows), gridCol: at(o.gridCol), gridRow: at(o.gridRow) }
    }
    return { v: 2, pages, page: pages.some(p => p.id === raw.page) ? raw.page : pages[0].id, previews }
}

/** A preview's options (its defaults when it has none yet). */
export const previewOpts = (l: Layout, id: PartId): PreviewOpts => l.previews[id] ?? previewOptsInit()
export function setPreviewOpts(l: Layout, id: PartId, o: Partial<PreviewOpts>): Layout {
    return { ...l, previews: { ...l.previews, [id]: { ...previewOpts(l, id), ...o } } }
}

/** Another preview's id (preview:2, preview:3…), or null when there are already 8. */
export function newPartId(l: Layout, kind: PartKind): PartId | null {
    const used = new Set(l.pages.flatMap(p => p.tiles.flatMap(t => t.parts)))
    if (!used.has(kind)) return kind
    if (!MULTI.includes(kind)) return null
    for (let i = 2; i <= 9; i++) if (!used.has(`${kind}:${i}`)) return `${kind}:${i}`
    return null
}

const snapOf = (tiles: Tile[]) => gridSnapshot(tiles.map(t => ({ id: t.id, rect: t.rect })))
const withRects = (tiles: Tile[], rects: Map<string, GridRect>) => tiles.map(t => ({ ...t, rect: rects.get(t.id) ?? t.rect }))

/** Where a part is: its page and tile, or null. */
export function findPart(l: Layout, kind: PartId): { page: Page; tile: Tile } | null {
    for (const page of l.pages) for (const tile of page.tiles) if (tile.parts.includes(kind)) return { page, tile }
    return null
}

/** The layout without <kind> (a tile left empty goes). */
function without(l: Layout, kind: PartId): Layout {
    const previews = { ...l.previews }
    delete previews[kind]
    return {
        ...l,
        previews,
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

/** <kind> in a tile of its own on page <pageId>, at the first free spot (its options kept when it moves). */
export function placeAlone(l: Layout, kind: PartId, pageId = l.page): Layout {
    const out = { ...without(l, kind), previews: l.previews }
    return {
        ...out,
        pages: out.pages.map(p => {
            if (p.id !== pageId) return p
            const k = kindOf(kind)
            const span = k === 'code' ? 12 : k === 'explorer' ? 4 : 8
            const rect = gridFirstFree(snapOf(p.tiles), COLS, span, 6, 0)
            return { ...p, tiles: [...p.tiles, { id: newId('t'), rect, parts: [kind], active: kind }] }
        }),
    }
}

/** Detach: <kind> out of its tile, into one of its own on the same page. */
export function detach(l: Layout, kind: PartId): Layout {
    const at = findPart(l, kind)
    if (!at || at.tile.parts.length < 2) return l
    return placeAlone(l, kind, at.page.id)
}

/** Attach to…: <kind> becomes a tab of tile <tileId>. */
export function attach(l: Layout, kind: PartId, tileId: string): Layout {
    const out = { ...without(l, kind), previews: l.previews }
    return {
        ...out,
        pages: out.pages.map(p => ({
            ...p,
            tiles: p.tiles.map(t => (t.id === tileId ? { ...t, parts: [...t.parts, kind], active: kind } : t)),
        })),
    }
}

/** Move to page…: <kind> in a tile of its own on <pageId>. */
export const moveToPage = (l: Layout, kind: PartId, pageId: string): Layout => placeAlone(l, kind, pageId)

/** Close: <kind> leaves the layout (＋ Part brings it back). */
export const closePart = (l: Layout, kind: PartId): Layout => without(l, kind)

export function setActive(l: Layout, tileId: string, kind: PartId): Layout {
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
    return { ...l, pages: [...l.pages, p], page: p.id }
}
export function renamePage(l: Layout, pageId: string, name: string): Layout {
    return { ...l, pages: l.pages.map(p => (p.id === pageId ? { ...p, name: name.trim().slice(0, 24) } : p)) }
}
/** A page removed: its parts leave the layout too (＋ Part brings them back). The last page stays. */
export function removePage(l: Layout, pageId: string): Layout {
    if (l.pages.length < 2) return l
    const i = l.pages.findIndex(p => p.id === pageId)
    const pages = l.pages.filter(p => p.id !== pageId)
    return { ...l, pages, page: l.page === pageId ? pages[Math.max(0, i - 1)].id : l.page }
}
export const pageName = (l: Layout, p: Page) => p.name || `Page ${l.pages.indexOf(p) + 1}`
