// widgets/items/iconSizes.ts
//
// The Icons layout (2026-10-27, replaces the old Grid: same layout id 'grid'): icons flowing in
// rows like Windows' large icons, as many columns as the pane holds. The size is the view's
// itemSize (Small / Medium / Large / Extra large), per folder like the layout.
//
// System icons are asked for at the size they show (times the screen's pixel ratio): the icon key
// carries its size ('ext:.pdf/32' -> 'ext:.pdf/96'), so each size is fetched and cached on its own,
// and GEM Shell draws icons above 32 px from Windows' large icon lists (2026-10-27).

export type IconSize = 'sm' | 'md' | 'lg' | 'xl'
export const ICON_SIZE_IDS: IconSize[] = ['sm', 'md', 'lg', 'xl']
export const ICON_SIZE_LABELS: Record<IconSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra large' }

/** Icon (px) and cell width (px) of each size; a cell holds the icon and two lines of name. */
export const ICON_SIZES: Record<IconSize, { icon: number; cell: number }> = {
  sm: { icon: 32, cell: 84 },
  md: { icon: 48, cell: 104 },
  lg: { icon: 72, cell: 132 },
  xl: { icon: 112, cell: 176 },
}

export function iconSizeOf(value: unknown, fallback: IconSize = 'md'): IconSize {
  return ICON_SIZE_IDS.includes(value as IconSize) ? value as IconSize : fallback
}

/** One step bigger or smaller (Ctrl + wheel), stopping at the ends. */
export function stepIconSize(size: IconSize, step: 1 | -1): IconSize {
  const index = Math.min(ICON_SIZE_IDS.length - 1, Math.max(0, ICON_SIZE_IDS.indexOf(size) + step))
  return ICON_SIZE_IDS[index]
}

/** How many cells fit in `width` px with `gap` px between them (at least one). */
export function columnsFor(width: number, cell: number, gap: number): number {
  return Math.max(1, Math.floor((Math.max(0, width) + gap) / (cell + gap)))
}

/** The pixel size to ask the system for: the shown size times the pixel ratio, rounded up to a size icons come in (≤ 256). */
export function requestPx(shown: number, pixelRatio = 1): number {
  const want = shown * Math.max(1, pixelRatio)
  return [16, 24, 32, 48, 64, 96, 128, 256].find(px => px >= want) ?? 256
}

/** An icon key for another size: 'ext:.pdf/32' -> 'ext:.pdf/96'. Keys without a size are kept. */
export function sizedIconKey(key: string, px: number): string {
  return /\/\d+$/.test(key) ? key.replace(/\/\d+$/, `/${px}`) : key
}


/**
 * The Media layout (2026-10-27, Items 0.8.0): the same four sizes, bigger. `icon` is the square
 * a thumbnail fits in; folders and other files show their icon at about half of it.
 */
export const MEDIA_SIZES: Record<IconSize, { icon: number; cell: number }> = {
  sm: { icon: 96, cell: 116 },
  md: { icon: 144, cell: 164 },
  lg: { icon: 208, cell: 228 },
  xl: { icon: 288, cell: 308 },
}
/** The icon shown in a Media cell for a folder or a file without a thumbnail. */
export const mediaIconOf = (box: number) => Math.round(box * 0.5)
