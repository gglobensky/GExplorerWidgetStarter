// widgets/media-library/useMetadataEdits.ts
//
// The user's own title / synopsis / genre edits, kept by media path above whatever a provider
// (TMDB) or the scan supplied (metadata-overrides.ts holds the document format).
import { ref } from 'vue'
import type { LibraryItem } from '../../shared/library-ui'
import type { LibraryContext } from './context'
import { applyMetadataOverride, loadMetadataOverrides, saveMetadataOverrides, type MediaMetadataOverride } from './metadata-overrides'

export function useMetadataEdits(ctx: LibraryContext) {
  const { sdk, items } = ctx
  const overrides = ref<Record<string,MediaMetadataOverride>>({})

  async function load() {
    try {
      overrides.value = await loadMetadataOverrides(sdk)
    } catch (error) {
      console.warn('[Media Library] Could not load local metadata edits:', error)
    }
  }

  /** The item with the user's edits for its path applied. */
  function apply(item: LibraryItem): LibraryItem {
    return item.path ? applyMetadataOverride(item, overrides.value[item.path]) : item
  }

  async function update(targets: LibraryItem[], patch: MediaMetadataOverride) {
    const paths = new Set(targets.flatMap(item => item.path ? [item.path] : []))
    if (!paths.size) return
    const next = { ...overrides.value }
    for (const path of paths) next[path] = { ...next[path], ...patch }
    overrides.value = next
    items.value = items.value.map(candidate => candidate.path && paths.has(candidate.path)
      ? applyMetadataOverride(candidate, next[candidate.path])
      : candidate)
    ctx.sync()
    try {
      await saveMetadataOverrides(sdk, next)
    } catch (error) {
      console.warn('[Media Library] Could not save local metadata edits:', error)
      ctx.snack('metadata', 'The local media edits could not be saved.', 6000)
    }
  }

  /** Genres of an episode: asks whether they apply to that episode or to the whole series. */
  async function updateGenres(item: LibraryItem, genres: string[]) {
    const seriesItems = item.seriesTitle
      ? items.value.filter(candidate => candidate.seriesTitle === item.seriesTitle && candidate.path)
      : []
    if (seriesItems.length < 2 || !sdk?.ui) {
      await update([item], { genres })
      return
    }
    const result = await sdk.ui().messageBox({
      title:'Apply genres to the whole series?',
      message:`${item.seriesTitle} has ${seriesItems.length} local episodes.`,
      detail:`Use ${genres.join(', ')} for this episode only, or for every episode in the series.`,
      buttons:[
        { label:'Cancel', cancel:true },
        { label:'This episode', id:'episode' },
        { label:'Whole series', id:'series', default:true },
      ],
    })
    if (result.button === 'series') await update(seriesItems, { genres })
    else if (result.button === 'episode') await update([item], { genres })
  }

  return { overrides, load, apply, update, updateGenres }
}

export type MetadataEdits = ReturnType<typeof useMetadataEdits>
