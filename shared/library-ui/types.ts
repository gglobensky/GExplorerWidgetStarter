export type LibraryArtwork = {
  src: string
  x: 0 | 50 | 100
  y: 0 | 100
  mode?: 'atlas' | 'cover' | 'placeholder'
}

export type LibraryPreviewCue = {
  label: string
  seconds: number
  tone: string
}

export type LibraryItem = {
  id: string
  title: string
  year: number
  runtimeMinutes: number
  rating: string
  primaryGenre: string
  genres: string[]
  synopsis: string
  artwork: LibraryArtwork
  previews: LibraryPreviewCue[]
  progress?: number
  addedRank: number
  path?: string
  mimeType?: string
  resolution?: string
  mediaKind?: 'movie' | 'episode'
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  metadataSource?: 'tmdb'
  tmdbId?: number
  tmdbType?: 'movie' | 'tv'
  tmdbPosterPath?: string
  tmdbStillPath?: string
  tmdbRating?: number
}

export type LibraryShelf = {
  id: string
  title: string
  note: string
  items: LibraryItem[]
}

export function formatRuntime(minutes: number): string {
  if (!minutes) return 'Runtime unknown'
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`
}

export function formatYear(year: number): string {
  return year > 1800 ? String(year) : 'Year unknown'
}

export function formatCue(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
