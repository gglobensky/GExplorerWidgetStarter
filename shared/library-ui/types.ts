export type LibraryArtwork = {
  src: string
  x: number
  y: number
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
  /** How far into it the user stopped (0..1), when it can be resumed. */
  progress?: number
  /** Where Resume starts, in seconds. */
  resumeSeconds?: number
  /** Played to the end. */
  watched?: boolean
  /** When it was last played (ms since 1970). */
  lastWatchedAt?: number
  addedRank: number
  /** Discovered in the most recent completed Media Library scan. */
  newArrival?: boolean
  path?: string
  /** Scan root containing this file. Used to distinguish movie folders from broad source roots. */
  sourceRoot?: string
  mimeType?: string
  resolution?: string
  mediaKind?: 'movie' | 'episode'
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  /** Local title candidates used when an optional metadata provider cannot match the display title. */
  metadataSearchTitles?: string[]
  /** A movie's last resort: titles its folders give, searched when its file name finds nothing. */
  folderSearchTitles?: string[]
  /** In an extras folder: the folder it belongs to (its titles list it among their extras; never asked of TMDB). */
  extraOf?: string
  /** The user replaced provider or inferred description/genre data on this device. */
  localMetadataOverride?: boolean
  /** A synthetic collection card navigates to this shelf instead of opening details. */
  targetShelfId?: string
  metadataSource?: 'tmdb'
  tmdbId?: number
  tmdbType?: 'movie' | 'tv'
  tmdbPosterPath?: string
  tmdbStillPath?: string
  previewImageSrc?: string
  tmdbRating?: number
  /** The TMDB collection (sequels, a franchise) this movie belongs to. */
  tmdbCollectionId?: number
  tmdbCollectionName?: string
  /** TMDB was queried for this file, whether or not it produced an accepted title match. */
  tmdbMatchAttempted?: boolean
  /** Extras of this title: unmatched videos beside it, and its folder's extras folders. */
  extras?: LibraryItem[]
}

export type LibraryShelf = {
  id: string
  title: string
  note: string
  items: LibraryItem[]
  /** The shelf's sets, each on its own shelf where the view can (Collections in the showroom). */
  groups?: Array<{ id:string; title:string; items:LibraryItem[] }>
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

const EXTRA_SUFFIX_WORDS: Record<string, string> = {
  behindthescenes:'Behind the scenes', deleted:'Deleted scene', deletedscene:'Deleted scene', deletedscenes:'Deleted scenes',
  featurette:'Featurette', interview:'Interview', scene:'Scene', short:'Short', trailer:'Trailer', teaser:'Teaser',
  other:'Extra', extra:'Extra', sample:'Sample',
}

function wordsOf(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * A short name for an extra of `movieTitle`: its file name, readable, without the movie's title (and
 * its year) when they start or end it: "Heat (1995) - The Making of" -> "The Making of",
 * "Heat-trailer" -> "Trailer". The whole name stays when nothing else would be left.
 */
export function extraDisplayName(extra: Pick<LibraryItem, 'title' | 'path'>, movieTitle: string): string {
  const stem = (extra.path?.split(/[\\/]/).pop() ?? extra.title).replace(/\.[^.]+$/, '')
  const readable = stem.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
  const title = wordsOf(movieTitle)
  let name = readable
  if (title) {
    const tokens = readable.split(' ')
    const titleWords = title.split(' ')
    const year = /^[([]?(?:19|20)\d{2}[)\]]?$/
    const separator = /^[-:–—|,]+$/
    // Leading: the title's words, then a year or separators.
    if (tokens.length > titleWords.length && wordsOf(tokens.slice(0, titleWords.length).join(' ')) === title) {
      let rest = tokens.slice(titleWords.length)
      while (rest.length && (year.test(rest[0]) || separator.test(rest[0]))) rest = rest.slice(1)
      if (rest.length) name = rest.join(' ')
    } else if (tokens.length > titleWords.length && wordsOf(tokens.slice(-titleWords.length).join(' ')) === title) {
      let rest = tokens.slice(0, -titleWords.length)
      while (rest.length && (year.test(rest[rest.length - 1]) || separator.test(rest[rest.length - 1]))) rest = rest.slice(0, -1)
      if (rest.length) name = rest.join(' ')
    }
    // "Heat-trailer" (no space before the dash): the title glued to a Plex suffix.
    const glued = readable.match(/^(.+?)\s*-\s*([a-z]+)$/i)
    if (glued && wordsOf(glued[1]).replace(/\s*(?:19|20)\d{2}$/, '') === title && EXTRA_SUFFIX_WORDS[glued[2].toLocaleLowerCase()]) {
      name = EXTRA_SUFFIX_WORDS[glued[2].toLocaleLowerCase()]
    }
  }
  const suffix = EXTRA_SUFFIX_WORDS[name.replace(/^-+/, '').toLocaleLowerCase()]
  if (suffix) name = suffix
  name = name.replace(/^[-:–—|,\s]+|[-:–—|,\s]+$/g, '')
  return name ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : readable
}
