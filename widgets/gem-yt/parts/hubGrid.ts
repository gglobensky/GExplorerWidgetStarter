// The hub grid as GEM Shell's Settings ▸ Layout says (sdk.ui().hubGrid()): its columns and rows (the watch tiles'
// steps) and its gap (the space GEM YT's pages and tiles leave between things). Add widget's preview has an SDK that
// may refuse the call: the defaults then.
import { DEFAULT_GRID } from '../core/watchLayout'

function read(sdk: unknown): any {
  try { return (sdk as any)?.ui?.()?.hubGrid?.() ?? null } catch { return null }
}

/** Columns (4 to 48) and rows (3 to 48); else the watch layout's defaults. */
export function hubSteps(sdk: unknown): { cols: number; rows: number } {
  const g = read(sdk)
  const n = (v: unknown, lo: number, hi: number, d: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d)
  return { cols: n(g?.columns, 4, 48, DEFAULT_GRID.cols), rows: n(g?.rows, 3, 48, DEFAULT_GRID.rows) }
}

/** The gap in px, kept between min and max; `fallback` when there's none. */
export function hubGap(sdk: unknown, min: number, max: number, fallback: number): number {
  const g = Number(read(sdk)?.gap)
  return Number.isFinite(g) && g >= 0 ? Math.min(max, Math.max(min, g)) : fallback
}
