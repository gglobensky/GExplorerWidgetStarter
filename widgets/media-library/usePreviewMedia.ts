// widgets/media-library/usePreviewMedia.ts
//
// What the opened title's "look inside" needs: four scene stills decoded by GEM Shell's ffmpeg
// service (cached image assets) and one stream URL the hover previews play from.
import { ref } from 'vue'
import type { LibraryItem } from '../../shared/library-ui'
import { errorText, type LibraryContext } from './context'
import { videoMime } from './scanner'

export type PreviewFrameState = { images:string[]; loading:boolean; message:string }

export function usePreviewMedia(ctx: LibraryContext) {
  const { sdk } = ctx
  const frames = ref<Record<string,PreviewFrameState>>({})
  const stream = ref<{ itemId:string; url:string } | null>(null)
  /** Thumbnails of the opened movie's extras, by media path. */
  const extraThumbs = ref<Record<string,string>>({})
  const frameRequests = new Map<string,Promise<void>>()
  const thumbRequests = new Set<string>()
  let streamRevision = 0

  /** Drops the current stream URL (the title closed or another opened). */
  function resetStream() {
    stream.value = null
    streamRevision += 1
  }

  /** A stream URL for the opened title; `stillOpen` says whether it is still the one shown. */
  async function ensureStream(item: LibraryItem, stillOpen: (id: string) => boolean) {
    if (!item.path || !sdk?.mintStreamHttp || stream.value?.itemId === item.id) return
    const revision = ++streamRevision
    try {
      const minted = await sdk.mintStreamHttp(item.path, videoMime(item.mimeType ?? ''))
      if (revision === streamRevision && stillOpen(item.id)) stream.value = { itemId:item.id, url:minted.url }
    } catch {
      // Unsupported files keep the still images instead of interrupting browsing.
    }
  }

  function ensureFrames(item: LibraryItem): Promise<void> {
    if (!item.path || !sdk?.mediaVideoFramesCreate || !item.previews.length) return Promise.resolve()
    const path = item.path
    const existing = frames.value[path]
    if (existing && !existing.loading && existing.images.some(Boolean)) return Promise.resolve()
    const pending = frameRequests.get(path)
    if (pending) return pending

    const timesMs = item.previews.map(cue => Math.max(0, Math.round(cue.seconds * 1000)))
    frames.value = { ...frames.value, [path]:{ images:existing?.images ?? [], loading:true, message:'' } }
    const task = sdk.mediaVideoFramesCreate(
      { path, timesMs },
      { width:640, height:360, fit:'cover', format:'jpeg', storage:'cache' },
    ).then(result => {
      const images = timesMs.map(time => result.frames.find(frame => frame.requestedMs === time)?.image?.url ?? '')
      const count = images.filter(Boolean).length
      const failures = result.frames.filter(frame => !frame.image)
      if (failures.length) console.warn(`[Media Library] ${failures.length} scene frame(s) unavailable for ${item.title}:`, failures)
      frames.value = {
        ...frames.value,
        [path]:{
          images,
          loading:false,
          message:count === timesMs.length ? 'Hover or focus to play' : count ? `${count} of ${timesMs.length} scene stills ready · hover to play` : 'Scene stills unavailable · hover to play',
        },
      }
    }).catch(error => {
      frames.value = { ...frames.value, [path]:{ images:existing?.images ?? [], loading:false, message:'Scene stills unavailable · hover to play' } }
      console.warn(`[Media Library] Could not prepare scene stills for ${item.title}:`, error)
      if ((error as { code?:string })?.code === 'E_UNSUPPORTED') ctx.snack('ffmpeg', errorText(error), 7000)
    }).finally(() => {
      frameRequests.delete(path)
    })
    frameRequests.set(path, task)
    return task
  }

  /**
   * A sharp picture of each extra, once per path: a frame decoded by GEM Shell's ffmpeg a fifth of
   * the way in (square, cached), else the OS thumbnail (often small: blurry on a chip).
   */
  function ensureExtraThumbs(item: LibraryItem) {
    if (!sdk?.mediaImageCreate) return
    const createImage = sdk.mediaImageCreate
    const createFrames = sdk.mediaVideoFramesCreate
    const square = { width:512, height:512, fit:'cover' as const, format:'jpeg' as const, storage:'cache' as const }
    for (const extra of item.extras ?? []) {
      const path = extra.path
      if (!path || extraThumbs.value[path] || thumbRequests.has(path)) continue
      thumbRequests.add(path)
      const timeMs = extra.runtimeMinutes > 0 ? Math.round(extra.runtimeMinutes * 60_000 * .2) : 30_000
      const thumbnail = () => createImage({ type:'thumbnail', path, size:1024 }, square).then(image => image.url)
      const picture = createFrames
        ? createFrames({ path, timesMs:[timeMs] }, square).then(result => result.frames[0]?.image?.url || thumbnail())
        : thumbnail()
      void picture
        .catch(thumbnail)
        .then(url => { if (url) extraThumbs.value = { ...extraThumbs.value, [path]:url } })
        .catch(() => { /* no picture: the chip keeps its plain face */ })
        .finally(() => thumbRequests.delete(path))
    }
  }

  return { frames, stream, extraThumbs, resetStream, ensureStream, ensureFrames, ensureExtraThumbs }
}
