// widgets/media-library/useCovers.ts
//
// Case artwork: the user's own covers (persistent assets, kept by media path in the
// 'custom-covers' document) and the artwork the library prepares by itself, in priority order:
// custom > TMDB poster > sidecar image beside the video > the OS's video thumbnail.
import { ref } from 'vue'
import type { MediaImage, MediaImageOptions } from 'gexplorer/widgets'
import type { LibraryArtwork, LibraryItem } from '../../shared/library-ui'
import { errorText, type LibraryContext, type Progress } from './context'
import { preferredCoverSource } from './media'
import type { ScannedVideo } from './scanner'
import { tmdbImageUrl } from './tmdb'

type SavedCover = { assetId:string; url:string; x?:number; y?:number }
export type CoverPreference = string | SavedCover
type SavedCoverStore = { version:1; covers:Record<string,CoverPreference> }

const COVER_STORE = 'custom-covers'
const POSTER: MediaImageOptions = { width:600, height:900, fit:'cover', format:'jpeg', storage:'cache' }
const STILL: MediaImageOptions = { width:640, height:360, fit:'cover', format:'jpeg', storage:'cache' }
const PLACEHOLDER: LibraryArtwork = { src:'', x:0, y:0, mode:'placeholder' }

function savedCoverUrl(value: CoverPreference | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.url
}

function savedCoverAssetId(value: CoverPreference | undefined): string | undefined {
  return typeof value === 'string' ? undefined : value?.assetId
}

export function savedCoverArtwork(value: CoverPreference | undefined): LibraryArtwork | undefined {
  const src = savedCoverUrl(value)
  if (!src) return undefined
  return typeof value === 'string'
    ? { src, x:50, y:50, mode:'cover' }
    : { src, x:value?.x ?? 50, y:value?.y ?? 50, mode:'cover' }
}

function cover(src: string, x = 50, y = 50): LibraryArtwork {
  return { src, x, y, mode:'cover' }
}

export function useCovers(ctx: LibraryContext) {
  const { sdk, items } = ctx
  const customCovers = ref<Record<string,CoverPreference>>({})
  const artworkProgress = ref<Progress | null>(null)
  const tmdbArtworkProgress = ref<Progress | null>(null)
  const coverBusy = ref(false)
  /** Paths whose case shows a TMDB poster (the sidecar / thumbnail pass leaves them alone). */
  const remoteArtworkPaths = new Set<string>()
  const openRequests = new Set<string>()

  function setItems(map: (item: LibraryItem) => LibraryItem) {
    items.value = items.value.map(map)
  }

  function setArtworkAt(path: string, artwork: LibraryArtwork, onlyIfEmpty = false) {
    setItems(item => item.path === path && (!onlyIfEmpty || !item.artwork.src) ? { ...item, artwork } : item)
  }

  /** The cover saved for this path, if any. */
  function customArtwork(path: string | undefined): LibraryArtwork | undefined {
    return path ? savedCoverArtwork(customCovers.value[path]) : undefined
  }

  /**
   * Loads the saved covers. `legacy`: covers an older version kept in the placement's settings,
   * used (and moved into the document) only while the document does not exist yet.
   */
  async function load(legacy: Record<string,CoverPreference> | undefined) {
    if (!sdk?.configRead) {
      customCovers.value = { ...(legacy ?? {}) }
      return
    }
    try {
      const saved = await sdk.configRead<SavedCoverStore>(COVER_STORE)
      if (saved?.version === 1 && saved.covers && typeof saved.covers === 'object') {
        customCovers.value = { ...saved.covers }
      } else if (legacy && Object.keys(legacy).length) {
        customCovers.value = { ...legacy }
        await persist()
      }
    } catch (error) {
      console.warn('[Media Library] Could not load saved custom covers:', error)
    }
  }

  async function persist() {
    if (!sdk?.configWrite) return
    await sdk.configWrite(COVER_STORE, { version:1, covers:customCovers.value } satisfies SavedCoverStore)
  }

  /** A new scan starts: progress and the poster bookkeeping belong to the previous one. */
  function resetForScan() {
    artworkProgress.value = null
    tmdbArtworkProgress.value = null
    remoteArtworkPaths.clear()
  }

  function deleteUnusedAsset(assetId: string | undefined, exceptPath?: string) {
    if (!assetId || !sdk?.mediaImageDelete) return
    const stillUsed = Object.entries(customCovers.value).some(([path,value]) => path !== exceptPath && savedCoverAssetId(value) === assetId)
    if (!stillUsed) void sdk.mediaImageDelete(assetId).catch(() => {})
  }

  /** The thumbnail of the title just opened, when the scan's pass has not reached it yet. */
  async function ensureOpenArtwork(item: LibraryItem) {
    if (!item.path || item.artwork.src || !sdk?.mediaImageCreate || openRequests.has(item.path)) return
    const path = item.path
    openRequests.add(path)
    try {
      const image = await sdk.mediaImageCreate({ type:'thumbnail', path, size:768 }, POSTER)
      if (!customCovers.value[path]) setArtworkAt(path, cover(image.url), true)
    } catch {
      // Keep the neutral case when the platform has no thumbnail.
    } finally {
      openRequests.delete(path)
      ctx.sync()
    }
  }

  /** TMDB posters and stills first, then sidecars and thumbnails for what is still bare. */
  async function hydratePreferred(videos: ScannedVideo[], revision: number) {
    await hydrateTmdb(items.value, revision)
    if (revision === ctx.revision()) await hydrateLocal(videos, revision)
  }

  async function hydrateLocal(videos: ScannedVideo[], revision: number) {
    if (!sdk?.mediaImageCreate || !videos.length) return
    const create = sdk.mediaImageCreate
    const pending = videos.filter(video => {
      const source = preferredCoverSource({
        custom:!!customCovers.value[video.path],
        tmdb:remoteArtworkPaths.has(video.path),
        sidecar:!!video.coverPath,
      })
      return source === 'sidecar' || source === 'thumbnail'
    })
    if (!pending.length) return
    artworkProgress.value = { completed:0, total:pending.length }
    const shared = new Map<string,Promise<MediaImage>>()
    let cursor = 0

    function imageFor(video: ScannedVideo): Promise<MediaImage> {
      const key = video.coverPath ? `file:${video.coverPath}` : `thumbnail:${video.path}`
      let task = shared.get(key)
      if (!task) {
        const thumbnail = () => create({ type:'thumbnail', path:video.path, size:768 }, POSTER)
        task = video.coverPath
          ? create({ type:'file', path:video.coverPath }, POSTER).catch(thumbnail)
          : thumbnail()
        shared.set(key, task)
      }
      return task
    }

    async function worker() {
      while (cursor < pending.length && revision === ctx.revision()) {
        const video = pending[cursor++]
        try {
          const image = await imageFor(video)
          if (revision !== ctx.revision() || customCovers.value[video.path] || remoteArtworkPaths.has(video.path)) continue
          setArtworkAt(video.path, cover(image.url))
        } catch {
          // A codec or platform without a thumbnail keeps the neutral case.
        } finally {
          const progress = artworkProgress.value
          if (revision === ctx.revision() && progress) artworkProgress.value = { completed:Math.min(progress.completed + 1, progress.total), total:progress.total }
        }
      }
    }

    await Promise.all(Array.from({ length:Math.min(3, pending.length) }, () => worker()))
    if (revision === ctx.revision()) artworkProgress.value = null
    ctx.sync()
  }

  async function hydrateTmdb(list: LibraryItem[], revision: number): Promise<{ imported:number; failed:number }> {
    if (!sdk?.mediaImageCreate || revision !== ctx.revision()) return { imported:0, failed:0 }
    const create = sdk.mediaImageCreate
    type Job = { id:string; path?:string; kind:'poster'|'still'; url:string; options:MediaImageOptions }
    const jobs: Job[] = []
    for (const item of list) {
      const poster = tmdbImageUrl(item.tmdbPosterPath, 'w500')
      if (poster && item.path && preferredCoverSource({ custom:!!customCovers.value[item.path], tmdb:true }) === 'tmdb') {
        jobs.push({ id:item.id, path:item.path, kind:'poster', url:poster, options:POSTER })
      }
      const still = tmdbImageUrl(item.tmdbStillPath, 'w780')
      if (still) jobs.push({ id:item.id, path:item.path, kind:'still', url:still, options:STILL })
    }
    if (!jobs.length) return { imported:0, failed:0 }
    tmdbArtworkProgress.value = { completed:0, total:jobs.length }
    const shared = new Map<string,Promise<MediaImage>>()
    let cursor = 0
    let imported = 0
    let failed = 0
    let networkDenied = false

    async function worker(limit = Number.POSITIVE_INFINITY) {
      let processed = 0
      while (cursor < jobs.length && revision === ctx.revision() && processed < limit) {
        processed += 1
        const job = jobs[cursor++]
        try {
          const key = `${job.url}|${job.options.width}x${job.options.height}`
          let task = shared.get(key)
          if (!task) {
            task = create({ type:'url', url:job.url }, job.options)
            shared.set(key, task)
          }
          const image = await task
          if (revision !== ctx.revision()) return
          if (job.kind === 'poster' && job.path) remoteArtworkPaths.add(job.path)
          setItems(item => item.id !== job.id ? item
            : job.kind === 'still'
              ? { ...item, previewImageSrc:image.url }
              : item.path && preferredCoverSource({ custom:!!customCovers.value[item.path], tmdb:true }) === 'tmdb'
                ? { ...item, artwork:cover(image.url) }
                : item)
          imported += 1
        } catch (error) {
          failed += 1
          if (/network permission|not granted|declined|E_NEEDS_NETWORK/i.test(errorText(error))) networkDenied = true
          console.warn(`[Media Library] Could not import TMDB ${job.kind}:`, error)
        } finally {
          const progress = tmdbArtworkProgress.value
          if (revision === ctx.revision() && progress) tmdbArtworkProgress.value = { completed:Math.min(progress.completed + 1, progress.total), total:progress.total }
        }
      }
    }

    // Let the first image request finish its consent flow before issuing others: otherwise each
    // exact URL can queue a separate permission question.
    await worker(1)
    if (!networkDenied) await Promise.all(Array.from({ length:Math.min(3, jobs.length - cursor) }, () => worker()))
    if (revision === ctx.revision()) tmdbArtworkProgress.value = null
    ctx.sync()
    return { imported, failed }
  }

  async function replace(item: LibraryItem, image: MediaImage, focus = { x:50, y:50 }) {
    if (!item.path) return
    const path = item.path
    const previous = savedCoverAssetId(customCovers.value[path])
    customCovers.value = { ...customCovers.value, [path]:{ assetId:image.assetId, url:image.url, x:focus.x, y:focus.y } }
    setArtworkAt(path, cover(image.url, focus.x, focus.y))
    ctx.sync()
    await persist()
    if (previous !== image.assetId) deleteUnusedAsset(previous, path)
  }

  /** Back to the artwork the library finds by itself (TMDB poster, sidecar or thumbnail). */
  async function removeCustom(item: LibraryItem) {
    if (!item.path || !customCovers.value[item.path]) return
    const path = item.path
    const previous = savedCoverAssetId(customCovers.value[path])
    const next = { ...customCovers.value }
    delete next[path]
    customCovers.value = next
    setArtworkAt(path, PLACEHOLDER)
    await persist()
    deleteUnusedAsset(previous)
    const refreshed = items.value.find(candidate => candidate.path === path)
    if (refreshed?.tmdbPosterPath) await hydrateTmdb([refreshed], ctx.revision())
    else {
      const video = ctx.videoFor(path)
      if (video) await hydrateLocal([video], ctx.revision())
    }
    ctx.sync()
  }

  async function useTmdbPoster(item: LibraryItem) {
    if (!item.path || !item.tmdbPosterPath) return
    if (customCovers.value[item.path]) {
      await removeCustom(item)
      return
    }
    const path = item.path
    setArtworkAt(path, PLACEHOLDER)
    const refreshed = items.value.find(candidate => candidate.path === path)
    if (refreshed) await hydrateTmdb([refreshed], ctx.revision())
    ctx.sync()
  }

  /** Asks for an image file and makes it this title's cover. Resolves true when the cover changed. */
  async function chooseFile(item: LibraryItem, startIn?: string): Promise<boolean> {
    const ui = sdk?.ui?.()
    if (!item.path || !ui?.openFiles || !sdk?.mediaImageCreate || coverBusy.value) return false
    const paths = await ui.openFiles({
      title:`Choose cover for ${item.title}`,
      startIn,
      multiple:false,
      acceptLabel:'Use as cover',
      access:'read',
      filters:[{ label:'Images', extensions:['jpg','jpeg','png','gif','bmp','tif','tiff'] }],
    })
    if (!paths?.[0]) return false
    coverBusy.value = true
    try {
      const image = await sdk.mediaImageCreate({ type:'file', path:paths[0] }, { ...POSTER, storage:'persistent' })
      await replace(item, image)
      ctx.snack('cover', `Cover updated for ${item.title}.`, 3200)
      return true
    } catch (error) {
      ctx.snack('cover', `Could not use that cover: ${errorText(error)}`, 6000)
      return false
    } finally {
      coverBusy.value = false
    }
  }

  return {
    customCovers,
    artworkProgress,
    tmdbArtworkProgress,
    coverBusy,
    customArtwork,
    load,
    resetForScan,
    ensureOpenArtwork,
    hydratePreferred,
    hydrateTmdb,
    replace,
    removeCustom,
    useTmdbPoster,
    chooseFile,
    deleteAsset:(assetId: string) => { if (sdk?.mediaImageDelete) void sdk.mediaImageDelete(assetId).catch(() => {}) },
  }
}

export type Covers = ReturnType<typeof useCovers>
