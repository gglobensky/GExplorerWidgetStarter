// shared/library-ui/types.ts
//
// What every shop of boxes shares (2.0.0, 2026-10-31): the Video Club (movies and series) and the Game Library (games,
// later old consoles). A widget extends LibraryItem with its own fields (the Video Club's MovieItem: runtime, scene
// previews, seasons, extras, TMDB...) and the shared components keep them: they are generic over the item type.

export type LibraryArtwork = {
  src: string
  x: number
  y: number
  /** 3.10.0: 'loading': its picture is on its way (a shimmer, not "No cover"). */
  mode?: 'atlas' | 'cover' | 'placeholder' | 'loading'
  /**
   * 2.9.0: a placeholder's icon (a program's own, made by GEM Shell): drawn in the middle of the plain box, at most
   * twice its own size (an icon only drawn small stays crisp enough).
   */
  icon?: { src: string; width: number; height: number }
}

/**
 * The look of a box on the shelf. 'dvd' (movies), 'bigbox' (PC games, 2.1.0), 'video' (3.9.0: a DVD case lying on its
 * side, 16:9 art under its sleeve and a printed title band: online videos, GEM YT); consoles come later.
 */
export type LibraryCaseVariant = 'dvd' | 'bigbox' | 'video'

/**
 * 3.9.0: a poster on top of a rack, in place of its sign (a channel: its picture, its name, a line under it). src: a
 * GEM Shell image address; round: the picture in a circle (an avatar).
 */
export type LibraryPoster = {
  src: string; caption?: string; round?: boolean
  /**
   * 3.11.0: a little bar chart under the caption (oldest first), each 0 to 1 of the poster's height for it; null: not
   * known (drawn faint). GEM YT: videos a week. Up to 26.
   */
  bars?: Array<number | null>
  /** 3.11.0: a sticker on the poster's corner ("Overdue", "Quiet 8 mo"). */
  flag?: string
}

export type LibraryItem = {
  id: string
  title: string
  year: number
  primaryGenre: string
  genres: string[]
  synopsis: string
  artwork: LibraryArtwork
  /** Where it belongs on the floor when the widget has platform sections ('pc', a console...). */
  platform?: string
  addedRank: number
  /** Discovered in the most recent completed scan. */
  newArrival?: boolean
  /** A file or folder of it on this computer. */
  path?: string
  /** The scan root containing it. */
  sourceRoot?: string
  /** The user replaced provider or inferred description/genre data on this device. */
  localMetadataOverride?: boolean
  /** A synthetic card (a series, a set) that navigates to this shelf instead of opening details. */
  targetShelfId?: string
}

/** One of a shelf's sets (Collections), each on its own row where the view can. */
export type LibraryShelfGroup<T extends LibraryItem = LibraryItem> = { id: string; title: string; items: T[] }

export type LibraryShelf<T extends LibraryItem = LibraryItem> = {
  id: string
  title: string
  note: string
  items: T[]
  /** The shelf's sets, each on its own shelf where the view can (Collections in the showroom). */
  groups?: Array<LibraryShelfGroup<T>>
  /** 3.9.0: a poster on the rack's top instead of its sign (and beside the department's title). */
  poster?: LibraryPoster
  /** 3.10.0: its items are on their way: the rack says so (a spinner over its shelves), and its department. */
  loading?: boolean
  /** 3.11.0: put away: its rack faded and dusty (GEM YT: a channel gone quiet). */
  dim?: boolean
}

/** A row of a rack on the store floor: some of its boxes, and how many there are in all. */
export type LibraryFloorRow<T extends LibraryItem = LibraryItem> = {
  id: string
  /** Shown above the row (a series' name, a set's name). */
  label?: string
  /** What the row's count counts: the widget's word for it (the floor passes it to rowCount). */
  unit?: string
  total: number
  items: T[]
}

export function formatYear(year: number): string {
  return year > 1800 ? String(year) : 'Year unknown'
}
