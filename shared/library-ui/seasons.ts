import type { LibraryItem } from './types'

export type SeasonFilter = 'all' | number

/** Uses scanned metadata first, then common episode and season-folder forms. */
export function inferredSeasonNumber(item: LibraryItem): number | undefined {
  if (Number.isInteger(item.seasonNumber) && (item.seasonNumber ?? -1) >= 0) return item.seasonNumber
  const value = `${item.title}\n${item.path ?? ''}`
  const tagged = value.match(/(?:^|[\\/\s._-])(?:season[\s._-]*|s)(\d{1,3})(?=$|[\\/\s._-]|e\d)/i)
    ?? value.match(/(?:^|[\\/\s._-])(\d{1,3})x\d{1,4}(?=$|[\\/\s._-])/i)
  return tagged ? Number(tagged[1]) : undefined
}

export function seasonsFor(items: LibraryItem[]): number[] {
  return [...new Set(items.flatMap(item => {
    const season = inferredSeasonNumber(item)
    return season === undefined ? [] : [season]
  }))].sort((a,b) => a - b)
}

export function itemsForSeason(items: LibraryItem[], season: SeasonFilter): LibraryItem[] {
  return season === 'all' ? items : items.filter(item => inferredSeasonNumber(item) === season)
}

export function seasonLabel(season: number): string {
  return season === 0 ? 'Specials' : `Season ${season}`
}
