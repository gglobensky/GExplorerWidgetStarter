// widgets/media-library/context.ts
//
// What the Media Library's composables share: the scanned library, the media sources, the
// lifecycle cache of the last completed scan, and the scan revision that lets async work started
// for an older scan drop its result.
import { ref, type Ref } from 'vue'
import type { WidgetLifecycle, WidgetSdk } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'
import type { ScannedVideo } from './scanner'

export type ScanShelf = { sourceKey:string; videos:ScannedVideo[]; items:LibraryItem[]; warnings:string[]; truncated:boolean }
export type Progress = { completed:number; total:number }
export type LibraryMode = 'shelf' | 'store'
export type DetailMode = 'classic' | 'movie-store'
/** The library's look: Video Club (showroom aisle, movie-store case) or Classic (shelves, details page). */
export type DisplayMode = 'video-club' | 'classic'

export type LibraryContext = {
  sdk: WidgetSdk | undefined
  life: WidgetLifecycle | undefined
  /** This placement's owner id: sources and scan history are kept per owner. */
  owner: string
  /** The scanned local library (empty while the sample collection shows). */
  items: Ref<LibraryItem[]>
  sources: Ref<string[]>
  /** The last completed scan, kept by the lifecycle: remounting with the same sources does not scan again. */
  scanShelf: Ref<ScanShelf | null>
  revision: () => number
  nextRevision: () => number
  sourceKey: () => string
  /** Copies the items into the lifecycle cache after a change (when it belongs to the current sources). */
  sync: () => void
  /** The scanned file at this path, from the last completed scan. */
  videoFor: (path: string) => ScannedVideo | undefined
  snack: (id: string, text: string, timeoutMs?: number) => void
}

/** Playback trace (2026-10-25: chasing a whole-app freeze on one laptop): the last line before a freeze says where it stopped. */
export function trace(step: string, detail?: unknown) {
  console.info(`[Media Library] ${new Date().toISOString().slice(11, 23)} ${step}`, ...(detail === undefined ? [] : [detail]))
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function copyItems(items: LibraryItem[]): LibraryItem[] {
  return items.map(item => ({
    ...item,
    genres:[...item.genres],
    previews:item.previews.map(cue => ({ ...cue })),
    artwork:{ ...item.artwork },
    extras:item.extras ? copyItems(item.extras) : undefined,
  }))
}

export function createLibraryContext(sdk: WidgetSdk | undefined, owner: string, initialSources: string[]): LibraryContext {
  const life = sdk?.lifecycle?.()
  const items = ref<LibraryItem[]>([])
  const sources = ref<string[]>([...initialSources])
  const scanShelf = life?.persistRef<ScanShelf | null>('media-library.scan-shelf',null) ?? ref<ScanShelf | null>(null)
  let revision = 0

  const sourceKey = () => sources.value.map(path => path.replace(/[\\/]+$/,'').toLocaleLowerCase()).join('\n')

  return {
    sdk,
    life,
    owner,
    items,
    sources,
    scanShelf,
    revision:() => revision,
    nextRevision:() => ++revision,
    sourceKey,
    sync() {
      const cached = scanShelf.value
      if (cached?.sourceKey === sourceKey()) scanShelf.value = { ...cached, items:copyItems(items.value) }
    },
    videoFor:path => scanShelf.value?.videos.find(video => video.path === path),
    snack(id, text, timeoutMs = 5000) {
      void sdk?.ui?.().snack({ id:`media-library-${id}`, dedupe:'replace', text, timeoutMs })
    },
  }
}
