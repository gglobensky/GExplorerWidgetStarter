// GEM YT 1.0, part 1 (2026-11-24): the watch page's tiles. Where each tile is, in cells of a grid that fills the view
// (CHANGED 0.5.2: the hub grid's own columns and rows, so a splitter moves in the steps widgets move in on a hub;
// gridPlace turns cells into px: GEM Shell's grid, collapsible panels), which parts it holds (tabs), which one is shown,
// and which tiles are panels (they fold to a strip along their edge). Kept per copy (its state), with the grid it was
// made on (another grid: scaled to it). Pure.
//
// Parts: YouTube's own (regions of the ONE page shown: the video, Up next, the comments, the description) and ours
// (Channel: the playing video's creator, from GEM YT's ledger).

/** The hub grid's default (sdk.ui().hubGrid(): 12 columns, the rows of Settings ▸ Layout). */
export const DEFAULT_GRID = { cols: 12, rows: 8 }
/** A tile is never smaller than this, in cells (a splitter stops there). */
const MIN_SPAN = 1

export type PartId = 'player' | 'upNext' | 'queue' | 'comments' | 'description' | 'channel'
/** YouTube's own parts: placed by GEM Shell (rules: "regions"). 0.5.2: its own queue too. */
export const PAGE_PARTS: ReadonlySet<PartId> = new Set<PartId>(['player', 'upNext', 'queue', 'comments', 'description'])
export const PART_LABELS: Record<PartId, string> = {
  player: 'Player', upNext: 'Up next', queue: 'Queue', comments: 'Comments', description: 'Description', channel: 'Channel',
}
export const PART_ICONS: Record<PartId, string> = { player: '▶', upNext: '☰', queue: '≣', comments: '💬', description: '≡', channel: '◉' }

export type Rect = { col: number; row: number; colSpan: number; rowSpan: number }
export type Tile = {
  id: string
  rect: Rect
  parts: PartId[]
  active: PartId
  /** a panel: folds toward its edge */
  panel?: { edge: 'left' | 'right' | 'top' | 'bottom'; folded?: boolean; opened?: boolean }
}
/** cols, rows: the grid it's made on (0.5.2; 0.5.0's had none: 48 x 48). */
export type WatchLayout = { version: 1; cols: number; rows: number; tiles: Tile[]; /** 0.12.0: parts you closed (＋ Part brings them back) */ closed?: PartId[] }

export function defaultLayout(cols = DEFAULT_GRID.cols, rows = DEFAULT_GRID.rows): WatchLayout {
  const left = Math.min(cols - 1, Math.max(1, Math.round(cols * 0.72)))
  const top = Math.min(rows - 1, Math.max(1, Math.round(rows * 0.62)))
  const side = Math.min(rows - 1, Math.max(1, Math.round(rows * 0.66)))
  return {
    version: 1, cols, rows,
    tiles: [
      { id: 'main', rect: { col: 0, row: 0, colSpan: left, rowSpan: top }, parts: ['player'], active: 'player' },
      { id: 'below', rect: { col: 0, row: top, colSpan: left, rowSpan: rows - top }, parts: ['comments', 'description'], active: 'comments' },
      { id: 'side', rect: { col: left, row: 0, colSpan: cols - left, rowSpan: side }, parts: ['upNext', 'queue'], active: 'upNext', panel: { edge: 'right' } },
      { id: 'info', rect: { col: left, row: side, colSpan: cols - left, rowSpan: rows - side }, parts: ['channel'], active: 'channel', panel: { edge: 'right' } },
    ],
  }
}

// ── 0.11.0 (2026-11-25): three sizes ────────────────────────────────────────────────────────────────────────────
// Guillaume: when the widget is too small for its layout, change the layout, and say once that this size can be
// arranged too (kept). Each copy keeps a layout per size; a size never arranged gets its own default.
export type LayoutSize = 'wide' | 'medium' | 'narrow'
export const LAYOUT_SIZES: readonly LayoutSize[] = ['wide', 'medium', 'narrow']
/** The widths (px) between sizes, and the margin before going back (a widget resized near a line doesn't flicker). */
// 0.11.1: wide from 1180 (at 1030 the right column was ~150 px: Up next and Channel cut, Guillaume)
const WIDE_FROM = 1180, MEDIUM_FROM = 640, MARGIN = 40
/** The size for a width, from the size shown now (going up needs the line; going down, the line minus the margin). */
export function sizeFor(width: number, now: LayoutSize | null): LayoutSize {
  const fresh: LayoutSize = width >= WIDE_FROM ? 'wide' : width >= MEDIUM_FROM ? 'medium' : 'narrow'
  if (!now) return fresh
  if (now === 'wide') return width >= WIDE_FROM - MARGIN ? 'wide' : width >= MEDIUM_FROM - MARGIN ? 'medium' : 'narrow'
  if (now === 'medium') return width >= WIDE_FROM ? 'wide' : width >= MEDIUM_FROM - MARGIN ? 'medium' : 'narrow'
  return fresh
}
/** A size's default: wide, the video with Up next beside it; medium, the video over two tiles; narrow, the video over one. */
export function defaultLayoutFor(size: LayoutSize, cols = DEFAULT_GRID.cols, rows = DEFAULT_GRID.rows): WatchLayout {
  if (size === 'wide') return defaultLayout(cols, rows)
  const top = Math.min(rows - 1, Math.max(1, Math.round(rows * (size === 'medium' ? 0.6 : 0.45))))
  if (size === 'narrow') {
    return {
      version: 1, cols, rows,
      tiles: [
        { id: 'main', rect: { col: 0, row: 0, colSpan: cols, rowSpan: top }, parts: ['player'], active: 'player' },
        { id: 'below', rect: { col: 0, row: top, colSpan: cols, rowSpan: rows - top }, parts: ['upNext', 'comments', 'queue', 'description', 'channel'], active: 'upNext' },
      ],
    }
  }
  const left = Math.min(cols - 1, Math.max(1, Math.round(cols * 0.58)))
  return {
    version: 1, cols, rows,
    tiles: [
      { id: 'main', rect: { col: 0, row: 0, colSpan: cols, rowSpan: top }, parts: ['player'], active: 'player' },
      { id: 'below', rect: { col: 0, row: top, colSpan: left, rowSpan: rows - top }, parts: ['comments', 'description'], active: 'comments' },
      { id: 'side', rect: { col: left, row: top, colSpan: cols - left, rowSpan: rows - top }, parts: ['upNext', 'queue', 'channel'], active: 'upNext' },
    ],
  }
}

const isPart = (v: unknown): v is PartId => typeof v === 'string' && v in PART_LABELS
const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null)

/**
 * A saved layout on this grid (cols x rows), checked (anything wrong: the default). Every part once at most; tiles
 * inside the grid, not overlapping. Made on another grid: its lines scaled to this one (tiles still meeting).
 */
export function readLayout(raw: unknown, cols = DEFAULT_GRID.cols, rows = DEFAULT_GRID.rows, size: LayoutSize = 'wide'): WatchLayout {
  const d = defaultLayoutFor(size, cols, rows)
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1 || !Array.isArray((raw as any).tiles)) return d
  const from = { cols: int((raw as any).cols, 1, 96) ?? 48, rows: int((raw as any).rows, 1, 96) ?? 48 }
  const COLS = from.cols, ROWS = from.rows
  const tiles: Tile[] = []
  const seen = new Set<PartId>()
  // 0.12.0: the parts you closed (never the player): not put back, and not in a tile
  const closed = (Array.isArray((raw as any).closed) ? (raw as any).closed : [])
    .filter((p: unknown): p is PartId => isPart(p) && p !== 'player')
    .filter((p: PartId, i: number, a: PartId[]) => a.indexOf(p) === i)
  closed.forEach((p: PartId) => seen.add(p))
  for (const t of (raw as any).tiles.slice(0, 8)) {
    const col = int(t?.rect?.col, 0, COLS - 1), row = int(t?.rect?.row, 0, ROWS - 1)
    if (col === null || row === null) return d
    const colSpan = int(t.rect.colSpan, 1, COLS - col), rowSpan = int(t.rect.rowSpan, 1, ROWS - row)
    if (colSpan === null || rowSpan === null || typeof t.id !== 'string' || !/^[\w-]{1,20}$/.test(t.id)) return d
    const parts = (Array.isArray(t.parts) ? t.parts : []).filter((p: unknown): p is PartId => isPart(p) && !seen.has(p))
    if (!parts.length) continue
    parts.forEach((p: PartId) => seen.add(p))
    const edge = t.panel?.edge
    tiles.push({
      id: t.id, rect: { col, row, colSpan, rowSpan }, parts, active: parts.includes(t.active) ? t.active : parts[0],
      ...(edge === 'left' || edge === 'right' || edge === 'top' || edge === 'bottom' ? { panel: { edge, folded: t.panel.folded === true } } : {}),
    })
  }
  if (!tiles.some(t => t.parts.includes('player'))) return d
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) if (overlap(tiles[i].rect, tiles[j].rect)) return d
  // Parts added since (0.5.2: Queue): with Up next, else in the last panel
  for (const part of Object.keys(PART_LABELS) as PartId[]) {
    if (seen.has(part)) continue
    const home = tiles.find(t => t.parts.includes('upNext')) ?? [...tiles].reverse().find(t => t.panel) ?? tiles[tiles.length - 1]
    home.parts.push(part)
  }
  const extra = closed.length ? { closed } : {}
  if (from.cols === cols && from.rows === rows) return { version: 1, cols, rows, tiles, ...extra }
  // Another grid: each line scaled (a tile's start and end apart: tiles that met still meet)
  const sc = (v: number, a: number, b: number) => Math.round((v * b) / a)
  const scaled = tiles.map(t => {
    const c0 = sc(t.rect.col, from.cols, cols), c1 = sc(t.rect.col + t.rect.colSpan, from.cols, cols)
    const r0 = sc(t.rect.row, from.rows, rows), r1 = sc(t.rect.row + t.rect.rowSpan, from.rows, rows)
    return { ...t, rect: { col: c0, row: r0, colSpan: c1 - c0, rowSpan: r1 - r0 } }
  })
  if (scaled.some(t => t.rect.colSpan < 1 || t.rect.rowSpan < 1)) return d
  return { version: 1, cols, rows, tiles: scaled, ...extra }
}

function overlap(a: Rect, b: Rect) {
  return a.col < b.col + b.colSpan && b.col < a.col + a.colSpan && a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan
}

/** A splitter: a line between tiles (a column line `at`, or a row line), and the tiles it moves on each side. */
export type Splitter = { id: string; axis: 'cols' | 'rows'; at: number; before: string[]; after: string[]; from: number; to: number }

/**
 * The splitters: for a column line, every pair of tiles that meet there (a tile ending at it, one starting at it, their
 * rows overlapping); the whole line moves together. For a row line, the same, grouped by the columns where they meet
 * (the left column's line moves apart from the right column's).
 */
export function splittersOf(layout: WatchLayout): Splitter[] {
  const out: Splitter[] = []
  const COLS = layout.cols, ROWS = layout.rows
  const tiles = layout.tiles
  // Column lines: one splitter per line, all its tiles
  const colLines = new Set(tiles.map(t => t.rect.col + t.rect.colSpan).filter(c => c < COLS))
  for (const at of colLines) {
    const before = tiles.filter(t => t.rect.col + t.rect.colSpan === at)
    const after = tiles.filter(t => t.rect.col === at)
    const meets = before.some(a => after.some(b => a.rect.row < b.rect.row + b.rect.rowSpan && b.rect.row < a.rect.row + a.rect.rowSpan))
    if (!meets) continue
    const rows = [...before, ...after]
    out.push({ id: `c${at}`, axis: 'cols', at, before: before.map(t => t.id), after: after.map(t => t.id),
      from: Math.min(...rows.map(t => t.rect.row)), to: Math.max(...rows.map(t => t.rect.row + t.rect.rowSpan)) })
  }
  // Row lines: per pair of tiles meeting there, merged when they share columns
  for (const a of tiles) {
    const at = a.rect.row + a.rect.rowSpan
    if (at >= ROWS) continue
    for (const b of tiles) {
      if (b.rect.row !== at) continue
      const from = Math.max(a.rect.col, b.rect.col), to = Math.min(a.rect.col + a.rect.colSpan, b.rect.col + b.rect.colSpan)
      if (from >= to) continue
      // 0.11.2: one splitter per line for the tiles that share one: the video over Comments and Up next is ONE line
      // (two splitters moved the video's tile over Comments: Guillaume, its header hidden under the video)
      const same = out.find(s => s.axis === 'rows' && s.at === at && (s.before.includes(a.id) || s.after.includes(b.id) || (s.from < to && from < s.to)))
      if (same) {
        if (!same.before.includes(a.id)) same.before.push(a.id)
        if (!same.after.includes(b.id)) same.after.push(b.id)
        same.from = Math.min(same.from, from); same.to = Math.max(same.to, to)
      } else out.push({ id: `r${at}:${from}`, axis: 'rows', at, before: [a.id], after: [b.id], from, to })
    }
  }
  return out
}

/** The layout with a splitter moved to `to` (a column or row line), as far as every tile keeps MIN_SPAN. */
export function moveSplitter(layout: WatchLayout, s: Splitter, to: number): WatchLayout {
  const byId = new Map(layout.tiles.map(t => [t.id, t]))
  const before = s.before.map(id => byId.get(id)!).filter(Boolean)
  const after = s.after.map(id => byId.get(id)!).filter(Boolean)
  const start = (t: Tile) => (s.axis === 'cols' ? t.rect.col : t.rect.row)
  const end = (t: Tile) => start(t) + (s.axis === 'cols' ? t.rect.colSpan : t.rect.rowSpan)
  const lo = Math.max(...before.map(t => start(t) + MIN_SPAN))
  const hi = Math.min(...after.map(t => end(t) - MIN_SPAN))
  const at = Math.round(Math.min(hi, Math.max(lo, to)))
  if (at === s.at || lo > hi) return layout
  const next: WatchLayout = {
    ...layout,
    tiles: layout.tiles.map(t => {
      if (s.before.includes(t.id)) {
        return { ...t, rect: s.axis === 'cols' ? { ...t.rect, colSpan: at - t.rect.col } : { ...t.rect, rowSpan: at - t.rect.row } }
      }
      if (s.after.includes(t.id)) {
        return { ...t, rect: s.axis === 'cols' ? { ...t.rect, col: at, colSpan: end(t) - at } : { ...t.rect, row: at, rowSpan: end(t) - at } }
      }
      return t
    }),
  }
  // 0.11.2: never a layout whose tiles overlap (a splitter that didn't carry every tile on its line)
  for (let i = 0; i < next.tiles.length; i++)
    for (let j = i + 1; j < next.tiles.length; j++) if (overlap(next.tiles[i].rect, next.tiles[j].rect)) return layout
  return next
}

// ── 0.12.0 (2026-11-25): the tile menu: Detach, Attach to, Close, ＋ Part ─────────────────────────────────────────
// Each answers the new layout, or null when it can't be done (no room to split, no neighbour to take a tile's place).
type Edge = 'left' | 'right' | 'top' | 'bottom'
const tileOf = (l: WatchLayout, id: string) => l.tiles.find(t => t.id === id)
const newId = (l: WatchLayout) => { let n = l.tiles.length + 1; while (l.tiles.some(t => t.id === `t${n}`)) n++; return `t${n}` }

/** A tile gone: a neighbour sharing one whole side takes its place (the one on the panel's side last). */
function absorb(l: WatchLayout, id: string): WatchLayout | null {
  const t = tileOf(l, id)
  if (!t) return null
  const r = t.rect
  const others = l.tiles.filter(x => x.id !== id)
  const grow = (n: Tile): Rect | null => {
    const q = n.rect
    if (q.row === r.row && q.rowSpan === r.rowSpan && q.col + q.colSpan === r.col) return { ...q, colSpan: q.colSpan + r.colSpan }
    if (q.row === r.row && q.rowSpan === r.rowSpan && r.col + r.colSpan === q.col) return { ...q, col: r.col, colSpan: q.colSpan + r.colSpan }
    if (q.col === r.col && q.colSpan === r.colSpan && q.row + q.rowSpan === r.row) return { ...q, rowSpan: q.rowSpan + r.rowSpan }
    if (q.col === r.col && q.colSpan === r.colSpan && r.row + r.rowSpan === q.row) return { ...q, row: r.row, rowSpan: q.rowSpan + r.rowSpan }
    return null
  }
  // The player's tile first (the video gets the room), then any
  const order = [...others].sort((a, b) => Number(b.parts.includes('player')) - Number(a.parts.includes('player')))
  for (const n of order) {
    const g = grow(n)
    if (g) return { ...l, tiles: others.map(x => (x.id === n.id ? { ...x, rect: g } : x)) }
  }
  return null
}

/** A part out of its tile into a tile of its own (the tile halved: across when it's wider, else down). */
export function detachPart(l: WatchLayout, tileId: string, part: PartId): WatchLayout | null {
  const t = tileOf(l, tileId)
  if (!t || t.parts.length < 2 || !t.parts.includes(part)) return null
  const r = t.rect
  const canCols = r.colSpan >= 2 * MIN_SPAN, canRows = r.rowSpan >= 2 * MIN_SPAN
  // a panel keeps its edge: split along it (stacked, for a right or left panel)
  const across = t.panel ? (t.panel.edge === 'top' || t.panel.edge === 'bottom') && canCols : canCols && (r.colSpan >= r.rowSpan * 1.5 || !canRows)
  if (!(across ? canCols : canRows)) return null
  let keep: Rect, give: Rect
  if (across) {
    const w = Math.floor(r.colSpan / 2)
    keep = { ...r, colSpan: r.colSpan - w }; give = { col: r.col + r.colSpan - w, row: r.row, colSpan: w, rowSpan: r.rowSpan }
  } else {
    const h = Math.floor(r.rowSpan / 2)
    keep = { ...r, rowSpan: r.rowSpan - h }; give = { col: r.col, row: r.row + r.rowSpan - h, colSpan: r.colSpan, rowSpan: h }
  }
  const rest = t.parts.filter(p => p !== part)
  const panel = t.panel ? { panel: { edge: t.panel.edge as Edge, folded: false } } : {}
  return {
    ...l,
    tiles: [
      ...l.tiles.map(x => (x.id === tileId ? { ...x, rect: keep, parts: rest, active: x.active === part ? rest[0] : x.active } : x)),
      { id: newId(l), rect: give, parts: [part], active: part, ...panel },
    ],
  }
}

/** A part moved into another tile (shown there); its tile, emptied, gives its place to a neighbour. */
export function attachPart(l: WatchLayout, fromId: string, part: PartId, toId: string): WatchLayout | null {
  const from = tileOf(l, fromId), to = tileOf(l, toId)
  if (!from || !to || fromId === toId || !from.parts.includes(part)) return null
  const rest = from.parts.filter(p => p !== part)
  let next: WatchLayout = {
    ...l,
    tiles: l.tiles.map(x =>
      x.id === toId ? { ...x, parts: [...x.parts, part], active: part }
      : x.id === fromId ? { ...x, parts: rest, active: x.active === part ? rest[0] ?? part : x.active } : x),
  }
  if (!rest.length) {
    const absorbed = absorb(next, fromId)
    if (!absorbed) return null
    next = absorbed
  }
  return next
}

/** A part closed (never the player): ＋ Part brings it back. Its tile, emptied, gives its place to a neighbour. */
export function closePart(l: WatchLayout, tileId: string, part: PartId): WatchLayout | null {
  const t = tileOf(l, tileId)
  if (!t || part === 'player' || !t.parts.includes(part)) return null
  const rest = t.parts.filter(p => p !== part)
  let next: WatchLayout = {
    ...l, closed: [...(l.closed ?? []).filter(p => p !== part), part],
    tiles: l.tiles.map(x => (x.id === tileId ? { ...x, parts: rest, active: x.active === part ? rest[0] ?? part : x.active } : x)),
  }
  if (!rest.length) {
    const absorbed = absorb(next, tileId)
    if (!absorbed) return null
    next = absorbed
  }
  return next
}

/** A closed part back, in a tile (shown there). */
export function reopenPart(l: WatchLayout, part: PartId, toId: string): WatchLayout | null {
  const to = tileOf(l, toId)
  if (!to || !(l.closed ?? []).includes(part)) return null
  const closed = (l.closed ?? []).filter(p => p !== part)
  return {
    ...l, ...(closed.length ? { closed } : { closed: undefined }),
    tiles: l.tiles.map(x => (x.id === toId ? { ...x, parts: [...x.parts, part], active: part } : x)),
  }
}

/** A tile's name in a menu: its parts. */
export const tileName = (t: Tile) => t.parts.map(p => PART_LABELS[p]).join(' · ')

/** A tile changed (its tab, folded or not). */
export function withTile(layout: WatchLayout, id: string, change: (t: Tile) => Tile): WatchLayout {
  return { ...layout, tiles: layout.tiles.map(t => (t.id === id ? change(t) : t)) }
}

/** A watch page's address (tiles there; the whole page elsewhere). */
export function isWatchUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try { const u = new URL(url); return /(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === '/watch' && !!u.searchParams.get('v') } catch { return false }
}
