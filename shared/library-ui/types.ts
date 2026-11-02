// shared/library-ui/types.ts
//
// What every shop of boxes shares (2.0.0, 2026-10-31): the Video Club (movies and series) and the Game Library (games,
// later old consoles). A widget extends LibraryItem with its own fields (the Video Club's MovieItem: runtime, scene
// previews, seasons, extras, TMDB...) and the shared components keep them: they are generic over the item type.

export type LibraryArtwork = {
  src: string
  x: number
  y: number
  mode?: 'atlas' | 'cover' | 'placeholder'
  /**
   * 2.9.0: a placeholder's icon (a program's own, made by GEM Shell): drawn in the middle of the plain box, at most
   * twice its own size (an icon only drawn small stays crisp enough).
   */
  icon?: { src: string; width: number; height: number }
}

/** The look of a box on the shelf. 'dvd' (movies), 'bigbox' (PC games, 2.1.0); consoles come later. */
export type LibraryCaseVariant = 'dvd' | 'bigbox'

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
