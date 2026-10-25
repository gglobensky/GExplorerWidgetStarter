// widgets/media-library/useParkedPlayback.ts
//
// Playback through the shell's video rack (sdk.video(), GEM Shell 2026-10-25): the movie plays
// in a <video> GEM Shell owns, shown in the player with <gex-video-surface>. With "Keep playing
// when hidden" on, a background job (entry.ts `jobs.background`, AudioCard.vue) holds it: when
// the widget leaves the screen the shell parks the same element and it plays on (sound only:
// its picture stops decoding while parked), and the widget back on screen shows the same
// element again. Nothing is handed over, so nothing can drift or stutter.
// With the setting off nothing holds it: the shell releases it with the widget, and the player
// reopens paused where it was (the position is kept as it plays).
// Older shells (no sdk.video()): useBackgroundPlayback.ts's muted twin does the job instead.
import type { VideoHandle, VideoReleaseReason } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'
import type { LibraryContext } from './context'

export const BACKGROUND_JOB = 'background'
export const MOVIE_VIDEO_KEY = 'movie'
export const PARKED_CELL = 'media-library.parked-session'

/** What plays (plain data: a lifecycle cell, read by the widget remounting and by the job's card). */
export type ParkedSession = {
  item: LibraryItem
  url: string
  positionMs: number
  durationMs: number
  playing: boolean
  /** A background job holds the video: it plays on while the widget is off screen. */
  held: boolean
}

/** What to reopen when the widget comes back. live: the same video, still alive (maybe playing). */
export type ParkedReturn =
  | { live:true; item:LibraryItem; url:string; handle:VideoHandle }
  | { live:false; item:LibraryItem; positionMs:number }

const REPORT_EVERY_MS = 5000

/** Listeners left on a parked video by the instance that left (the next one removes them). */
const hiddenWatchers = new WeakMap<VideoHandle, () => void>()

/** context.ts's trace, kept here so this module has no runtime import (its tests run in plain Node). */
function trace(step: string, detail?: unknown) {
  console.info(`[Media Library] ${new Date().toISOString().slice(11, 23)} ${step}`, ...(detail === undefined ? [] : [detail]))
}

/** Minimal copy of an item for the cell (no extras: they could be many). */
function sessionItem(item: LibraryItem): LibraryItem {
  const { extras: _extras, ...rest } = item
  return { ...rest, genres:[...item.genres], previews:item.previews.map(cue => ({ ...cue })), artwork:{ ...item.artwork } }
}

function titleOf(item: LibraryItem): string {
  return item.seriesTitle ? `${item.seriesTitle} · ${item.title}` : item.title
}

export function useParkedPlayback(
  ctx: Pick<LibraryContext, 'sdk' | 'life'>,
  onPosition: (item: LibraryItem, positionMs: number, durationMs: number, final: boolean) => void,
  keepPlaying: () => boolean,
) {
  const { sdk, life } = ctx
  const video = sdk?.video?.() ?? null
  /** The shell has a video rack: this path is used (else useBackgroundPlayback's). */
  const available = !!video
  const session: { value:ParkedSession | null } = life?.persistRef<ParkedSession | null>(PARKED_CELL, null) ?? { value:null }
  /** The video this instance shows, and how to stop watching it. */
  let current: { handle:VideoHandle; stop:() => void } | null = null

  function currentJob() {
    return sdk?.jobs?.().current(BACKGROUND_JOB) ?? null
  }

  /** Remembers where it is (cheap, on every timeupdate): a release with the widget keeps the place. */
  function note(handle: VideoHandle) {
    const s = session.value
    const el = handle.element
    if (!s || !Number.isFinite(el.currentTime) || el.readyState === 0) return
    s.positionMs = el.currentTime * 1000
    if (Number.isFinite(el.duration)) s.durationMs = el.duration * 1000
    s.playing = !el.paused && !el.ended
  }

  /** The shell let the video go (closed here, made room for another, the widget left unheld). */
  function released(handle: VideoHandle, reason: VideoReleaseReason) {
    trace('video: released by GEM Shell', { reason })
    if (current?.handle === handle) { current.stop(); current = null }
    hiddenWatchers.get(handle)?.()
    hiddenWatchers.delete(handle)
    const s = session.value
    if (s) { s.held = false; s.playing = false }
    if (reason === 'released' || reason === 'destroyed') session.value = null
    currentJob()?.end()
  }

  /** Watching the video this instance shows (the player reports progress itself). */
  function watchShown(handle: VideoHandle) {
    current?.stop()
    const update = () => note(handle)
    handle.element.addEventListener('timeupdate', update)
    handle.element.addEventListener('pause', update)
    const offRelease = handle.onRelease(reason => released(handle, reason))
    current = {
      handle,
      stop:() => {
        handle.element.removeEventListener('timeupdate', update)
        handle.element.removeEventListener('pause', update)
        offRelease()
      },
    }
  }

  /** A held video playing on while no Video Club is on screen: progress, and its end. */
  function watchHidden(handle: VideoHandle) {
    const el = handle.element
    let lastReport = 0
    const report = (final: boolean) => {
      note(handle)
      const s = session.value
      if (s) onPosition(s.item, s.positionMs, s.durationMs, final)
    }
    const timeUpdate = () => { if (Date.now() - lastReport >= REPORT_EVERY_MS) { lastReport = Date.now(); report(false) } }
    const pause = () => report(true)
    const ended = () => {
      report(true)
      session.value = null
      handle.release()   // released() ends the job
    }
    el.addEventListener('timeupdate', timeUpdate)
    el.addEventListener('pause', pause)
    el.addEventListener('ended', ended)
    const offRelease = handle.onRelease(reason => released(handle, reason))
    hiddenWatchers.set(handle, () => {
      el.removeEventListener('timeupdate', timeUpdate)
      el.removeEventListener('pause', pause)
      el.removeEventListener('ended', ended)
      offRelease()
    })
  }

  /** Holds the video in the background job while the setting is on; lets it go when off. */
  function syncJob() {
    const s = session.value
    const handle = current?.handle
    if (!handle?.alive || !s || !sdk?.jobs) return
    if (keepPlaying()) {
      const job = sdk.jobs().ensure(BACKGROUND_JOB, { title:titleOf(s.item), params:{ path:s.item.path } })
      job.update({ title:titleOf(s.item) })
      job.hold(handle)
      s.held = true
    } else {
      currentJob()?.end()   // mounted: the job only lets go of it
      s.held = false
    }
  }

  /** The player plays `item` from `url`: the shell's video for it (the same element as before, if any). */
  function start(item: LibraryItem, url: string): VideoHandle | null {
    if (!video) return null
    const handle = video.acquire({ key:MOVIE_VIDEO_KEY, decodeWhileParked:false })
    if (handle.element.getAttribute('src') !== url) handle.element.pause()   // the previous title, until the player sets the new one
    if (current?.handle !== handle) watchShown(handle)
    session.value = { item:sessionItem(item), url, positionMs:0, durationMs:0, playing:true, held:false }
    syncJob()
    trace('video: playing through GEM Shell', { held:session.value?.held, canPauseDecoding:video.canPauseDecoding() })
    return handle
  }

  /** The player closed (the user's Back, an error): the video goes, the job ends. */
  function release() {
    const handle = current?.handle ?? video?.find(MOVIE_VIDEO_KEY) ?? null
    const s = session.value
    if (handle && s) {
      note(handle)
      onPosition(s.item, s.positionMs, s.durationMs, true)
    }
    session.value = null
    if (handle?.alive) handle.release()
    else currentJob()?.end()
    current?.stop()
    current = null
  }

  /** The widget is leaving the screen. Held: the shell parks the video and it plays on. */
  function leave() {
    const handle = current?.handle
    current?.stop()
    current = null
    if (!handle?.alive || !session.value) return
    note(handle)
    trace('video: leaving the screen', { held:session.value.held, playing:session.value.playing })
    if (session.value.held) watchHidden(handle)
  }

  /** Back on screen: what to reopen (the same live video, or a place to resume paused), or null. */
  function takeBack(): ParkedReturn | null {
    const s = session.value
    if (!s) return null
    const handle = video?.find(MOVIE_VIDEO_KEY) ?? null
    if (handle) {
      hiddenWatchers.get(handle)?.()
      hiddenWatchers.delete(handle)
    }
    if (handle?.alive && handle.element.getAttribute('src') === s.url) {
      note(handle)
      onPosition(s.item, s.positionMs, s.durationMs, !s.playing)
      watchShown(handle)
      trace('video: back on screen, same video', { playing:s.playing, pictureSuspended:handle.pictureSuspended })
      return { live:true, item:s.item, url:s.url, handle }
    }
    session.value = null
    if (!s.positionMs) return null
    return { live:false, item:s.item, positionMs:s.positionMs }
  }

  return { available, session, start, release, leave, takeBack, syncJob }
}
