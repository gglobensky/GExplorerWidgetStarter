// widgets/items/detailColumns.ts
//
// Details view columns (2026-10-27): which columns show and how wide each is, in pixels, computed
// once for the header and the rows alike (they used to size themselves separately and drift apart
// once a scrollbar or a narrow pane bit).
//
// Which columns: Name always, then the user's chosen columns (Ext, Size, Modified) in the order they
// were chosen, most recent first, as many as the row has room for at their compact widths. A
// column chosen in the header's menu goes first; with no room for all, the one chosen longest ago
// gives way. The choice is saved per folder (with the folder's view).
//
// Widths: the room is shared by the user's weights (the resize handles), each column at least its
// compact width (names get "…"; under MOD_TIME_PX Modified shows its date only).

export type DetailCol = 'name' | 'ext' | 'size' | 'mod'
export type OptionalCol = Exclude<DetailCol, 'name'>
export type DetailWeights = Record<DetailCol, number>

export const DETAIL_COLUMNS: readonly DetailCol[] = ['name', 'ext', 'size', 'mod']
export const OPTIONAL_COLUMNS: readonly OptionalCol[] = ['ext', 'size', 'mod']
export const COLUMN_LABELS: Record<DetailCol, string> = { name: 'Name', ext: 'Ext', size: 'Size', mod: 'Modified' }

/** The least a column can be: below this it gives way (Name never does). Also the resize handles' limit. */
export const COMPACT_PX: Record<DetailCol, number> = { name: 96, ext: 36, size: 58, mod: 78 }
/** Below this, Modified shows its date only. */
export const MOD_TIME_PX = 136
/** The columns shown when the folder has no choice saved: most useful first. */
export const DEFAULT_SHOWN: readonly OptionalCol[] = ['mod', 'size', 'ext']

export type ColumnFit = {
  /** The columns shown, in display order. */
  visible: DetailCol[]
  /** Pixel width of each shown column. */
  widths: Partial<Record<DetailCol, number>>
  /** Chosen columns with no room now. */
  squeezed: OptionalCol[]
  /** How many of the chosen columns this row has room for. */
  room: number
  /** Modified has no room for the time. */
  dateOnly: boolean
}

/**
 * Shares `room` between `cols` by weight, never giving a column less than its compact width; what
 * a column held at its minimum cannot take goes to the others.
 */
function share(room: number, cols: DetailCol[], weights: DetailWeights): Record<DetailCol, number> {
  const out = {} as Record<DetailCol, number>
  let free = [...cols]
  let left = room
  for (let guard = 0; guard <= cols.length && free.length; guard += 1) {
    const total = free.reduce((sum, col) => sum + Math.max(0.0001, weights[col] ?? 1), 0)
    const pinned = free.filter(col => left * Math.max(0.0001, weights[col] ?? 1) / total < COMPACT_PX[col])
    if (!pinned.length) {
      for (const col of free) out[col] = left * Math.max(0.0001, weights[col] ?? 1) / total
      return out
    }
    for (const col of pinned) { out[col] = COMPACT_PX[col]; left -= COMPACT_PX[col] }
    free = free.filter(col => !pinned.includes(col))
  }
  for (const col of free) out[col] = COMPACT_PX[col]
  return out
}

/**
 * The columns and their widths for a row `rowWidth` pixels wide; `overhead(n)` is what a row with
 * n columns spends on padding, borders and gaps. `shown`: the chosen columns, most recent first.
 */
export function fitColumns(
  rowWidth: number,
  overhead: (count: number) => number,
  weights: DetailWeights,
  shown: readonly OptionalCol[] = DEFAULT_SHOWN,
): ColumnFit {
  const kept: OptionalCol[] = []
  let used = COMPACT_PX.name
  for (const col of shown) {
    if (rowWidth - overhead(kept.length + 2) < used + COMPACT_PX[col]) break
    kept.push(col)
    used += COMPACT_PX[col]
  }
  const visible = DETAIL_COLUMNS.filter(col => col === 'name' || kept.includes(col as OptionalCol))
  const room = Math.max(0, rowWidth - overhead(visible.length))
  const widths = room >= used ? share(room, visible, weights) : { name: room } as Record<DetailCol, number>
  const rounded: Partial<Record<DetailCol, number>> = {}
  let total = 0
  visible.forEach((col, index) => {
    // Whole pixels, the last column taking the rounding, so the tracks fill the row exactly.
    const px = index === visible.length - 1 ? Math.max(0, Math.round(room) - total) : Math.floor(widths[col])
    rounded[col] = px
    total += px
  })
  return {
    visible,
    widths: rounded,
    squeezed: shown.filter(col => !kept.includes(col)),
    room: kept.length,
    dateOnly: (rounded.mod ?? Infinity) < MOD_TIME_PX,
  }
}

/**
 * The chosen columns once `col` is ticked or unticked in the menu. Ticked: it goes first (so it
 * shows; when there is no room for all, the one chosen longest ago gives way). Unticked while on
 * screen: removed from the choice.
 */
export function toggleColumn(shown: readonly OptionalCol[], col: OptionalCol, visible: readonly DetailCol[]): OptionalCol[] {
  const rest = shown.filter(candidate => candidate !== col)
  return visible.includes(col) ? rest : [col, ...rest]
}

/**
 * A folder's saved choice, cleaned: `detailShown` (this version), else the first version's
 * `detailHidden` (hidden columns), else the default.
 */
export function shownColumnsOf(view: { detailShown?: unknown; detailHidden?: unknown } | undefined | null): OptionalCol[] {
  const pick = (value: unknown[]) => value.filter((col, index): col is OptionalCol =>
    OPTIONAL_COLUMNS.includes(col as OptionalCol) && value.indexOf(col) === index)
  if (Array.isArray(view?.detailShown)) return pick(view!.detailShown)
  if (Array.isArray(view?.detailHidden)) return DEFAULT_SHOWN.filter(col => !(view!.detailHidden as unknown[]).includes(col))
  return [...DEFAULT_SHOWN]
}
