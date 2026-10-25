// widgets/media-library/useLibraryScan.ts
//
// The media folders and their scan: the list of sources (per owner, 'media-sources'), the
// bounded recursive scan, what the previous scans saw ('scan-history': New arrivals), and the
// lifecycle cache that spares a remount from scanning again.
import { ref } from 'vue'
import type { LibraryItem } from '../../shared/library-ui'
import { copyItems, errorText, type LibraryContext } from './context'
import { bundleMovieExtras, createScannedLibrary } from './media'
import { loadScanHistory, mediaPathKey, mergeScanHistory, saveScanHistory } from './scan-history'
import { scanVideoSources, type ScanProgress } from './scanner'
import { loadMediaSources, saveMediaSources } from './sources'
import { posterAtlases } from './fixtures'
import type { Covers } from './useCovers'
import type { MetadataEdits } from './useMetadataEdits'
import type { TmdbMatching } from './useTmdbMatching'
import { restorePersistedTmdbMetadata } from './tmdb'

export type ScanState = 'idle' | 'scanning' | 'ready' | 'error'

export function sourceLabel(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

export function useLibraryScan(ctx: LibraryContext, covers: Covers, edits: MetadataEdits, tmdb: TmdbMatching) {
  const { sdk, items, sources, scanShelf } = ctx
  const state = ref<ScanState>('idle')
  const progress = ref<ScanProgress | null>(null)
  const warnings = ref<string[]>([])
  const truncated = ref(false)
  const error = ref('')
  let knownPaths = new Set<string>()

  async function loadSources() {
    try {
      sources.value = await loadMediaSources(sdk, ctx.owner, sources.value)
    } catch (failure) {
      console.warn('[Media Library] Could not load saved media sources:', failure)
    }
  }

  async function persistSources() {
    try {
      await saveMediaSources(sdk, ctx.owner, sources.value)
    } catch (failure) {
      console.warn('[Media Library] Could not save media sources:', failure)
      ctx.snack('sources', 'The media folder list could not be saved.', 6000)
    }
  }

  async function loadHistory() {
    try {
      knownPaths = new Set(await loadScanHistory(sdk, ctx.owner))
    } catch (failure) {
      console.warn('[Media Library] Could not load scan history:', failure)
    }
  }

  /** The library's items as the user sees them: custom cover and local edits on top. */
  function decorate(item: LibraryItem): LibraryItem {
    const local = edits.apply(item)
    const artwork = covers.customArtwork(item.path)
    return artwork ? { ...local, artwork } : local
  }

  /** Scans the sources. Without `force`, the lifecycle cache of the same sources is used when there is one. */
  async function scan(force = false): Promise<boolean> {
    const revision = ctx.nextRevision()
    covers.resetForScan()
    warnings.value = []
    truncated.value = false
    error.value = ''
    if (!sources.value.length || !sdk?.openListing) {
      items.value = []
      scanShelf.value = null
      state.value = 'idle'
      return false
    }
    const key = ctx.sourceKey()
    const cached = scanShelf.value
    if (!force && cached?.sourceKey === key) {
      items.value = copyItems(cached.items).map(decorate)
      warnings.value = [...cached.warnings]
      truncated.value = cached.truncated
      state.value = 'ready'
      progress.value = null
      if (items.value.some(item => item.metadataSource === 'tmdb')) tmdb.noteRestored('cache')
      void covers.hydratePreferred(cached.videos, revision)
      return true
    }
    items.value = []
    state.value = 'scanning'
    progress.value = { phase:'folders', folders:0, videos:0, current:sources.value[0] }
    try {
      const result = await scanVideoSources(
        sdk,
        sources.value,
        `${ctx.owner}:scan:${revision}`,
        next => { if (revision === ctx.revision()) progress.value = next },
        () => revision !== ctx.revision(),
      )
      if (revision !== ctx.revision()) return false
      const discovered = new Set(result.videos.map(video => mediaPathKey(video.path)).filter(path => !knownPaths.has(path)))
      const restored = restorePersistedTmdbMetadata(createScannedLibrary(result.videos, posterAtlases, new Map()), tmdb.records.value)
      items.value = bundleMovieExtras(tmdb.markMisses(restored.items).map(item => {
        const decorated = decorate(item)
        return decorated.path ? { ...decorated, newArrival:discovered.has(mediaPathKey(decorated.path)) } : decorated
      }))
      tmdb.noteRestored(restored.restored)
      const history = mergeScanHistory(knownPaths, result.videos.map(video => video.path), !result.truncated && !result.warnings.length)
      knownPaths = new Set(history)
      try {
        await saveScanHistory(sdk, ctx.owner, history)
      } catch (failure) {
        console.warn('[Media Library] Could not save scan history:', failure)
      }
      if (revision !== ctx.revision()) return false
      warnings.value = result.warnings
      truncated.value = result.truncated
      state.value = 'ready'
      scanShelf.value = {
        sourceKey:key,
        videos:result.videos.map(video => ({ ...video, probe:video.probe ? { ...video.probe } : undefined })),
        items:copyItems(items.value),
        warnings:[...result.warnings],
        truncated:result.truncated,
      }
      void covers.hydratePreferred(result.videos, revision)
      return true
    } catch (failure) {
      if (revision !== ctx.revision()) return false
      error.value = errorText(failure)
      state.value = 'error'
      return false
    }
  }

  /** Asks for a folder and adds it. Resolves with the folder added, or null. */
  async function addSource(): Promise<string | null> {
    const ui = sdk?.ui?.()
    if (!ui) return null
    const path = await ui.pickFolder({ title:'Add a media source', startIn:sources.value[sources.value.length - 1], access:'read' })
    if (!path || sources.value.some(source => source.toLocaleLowerCase() === path.toLocaleLowerCase())) return null
    sources.value = [...sources.value, path]
    await persistSources()
    ctx.snack('source', `Added ${sourceLabel(path)}. Looking for videos now.`, 3200)
    return path
  }

  async function removeSource(path: string) {
    sources.value = sources.value.filter(source => source !== path)
    await persistSources()
  }

  return { state, progress, warnings, truncated, error, loadSources, loadHistory, scan, addSource, removeSource }
}

export type LibraryScan = ReturnType<typeof useLibraryScan>
