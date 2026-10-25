// widgets/media-library/useBackgroundPlayback.ts
//
// A movie outlives the widget leaving the screen (another tab, the sidebar folded), without a
// seam in its sound. While the player shows a movie, a shell audio element (sdk.audio(): it lives
// in GEM Shell, not in the widget) plays the same stream MUTED, following the <video> (play,
// pause, seeks, speed; its drift corrected by nudging its speed). A background job (entry.ts
// `jobs.background`, AudioCard.vue in the operations tray) holds it.
//   - Leaving the screen (handOff): the <video> goes, the element is unmuted: it is already
//     playing at the same place, so the sound carries on.
//   - Back on screen (takeBack, then follow with the new <video>): the video starts muted at the
//     element's time, catches up, and takes the sound back (the element is muted again).
// With "Keep playing when hidden" off, nothing follows: the player reopens paused where it was.
import type { AudioHandle } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'
import type { LibraryContext } from './context'

export const BACKGROUND_JOB = 'background'
export const BACKGROUND_AUDIO_KEY = 'movie-audio'
export const SESSION_CELL = 'media-library.playback-session'

/** Drift (s) corrected by a seek of the muted element; below it, by nudging its speed. */
const SEEK_DRIFT = 0.35
const NUDGE_DRIFT = 0.04
/** At the hand-over, a drift beyond this (s) is corrected by a seek (a short jump in the sound). */
const HANDOFF_DRIFT = 0.08
/** Taking the sound back: the video's drift accepted (s), and its tries. */
const REJOIN_DRIFT = 0.12
const REJOIN_TRIES = 3
/** Taking the sound back: the crossfade from the shell element to the video (ms). */
const CROSSFADE_MS = 350
/**
 * The muted element joins this long after the video started playing: two decoders of the same
 * (often heavy) file starting at once is what old GPUs and their drivers handle worst.
 */
const ARM_DELAY_MS = 3000

/** The next animation frame (a timer where there is none: tests). */
const nextFrame = (fn: () => void) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)

/** What played when the widget left the screen (plain data: a lifecycle cell). */
export type PlaybackSession = {
  item: LibraryItem
  url: string
  positionMs: number
  durationMs: number
  playing: boolean
  /** The sound went on in the background. */
  background: boolean
}

export type PlayerSnapshot = { positionMs:number; durationMs:number; paused:boolean; volume?:number; muted?:boolean }

type Detachable = AudioHandle & { __mlDetach?: () => void }

/** context.ts's trace, kept here so this module has no runtime import (its tests run in plain Node). */
function trace(step: string, detail?: unknown) {
  console.info(`[Media Library] ${new Date().toISOString().slice(11, 23)} ${step}`, ...(detail === undefined ? [] : [detail]))
}

/** Minimal copy of an item for the cell (no extras: they could be many). */
function sessionItem(item: LibraryItem): LibraryItem {
  const { extras: _extras, ...rest } = item
  return { ...rest, genres:[...item.genres], previews:item.previews.map(cue => ({ ...cue })), artwork:{ ...item.artwork } }
}

function seekTo(media: { currentTime:number }, seconds: number) {
  try { media.currentTime = Math.max(0, seconds) } catch { /* not seekable yet */ }
}

export function useBackgroundPlayback(
  ctx: LibraryContext,
  onPosition: (item: LibraryItem, positionMs: number, durationMs: number, final: boolean) => void,
  options: { armDelayMs?: number } = {},
) {
  const armDelay = options.armDelayMs ?? ARM_DELAY_MS
  const { sdk, life } = ctx
  // Without a lifecycle (the preview) a plain holder: nothing outlives the component there anyway.
  const session: { value:PlaybackSession | null } = life?.persistRef<PlaybackSession | null>(SESSION_CELL, null) ?? { value:null }
  /** The element following the video now, and how to stop following. */
  let following: { element:AudioHandle; video:HTMLVideoElement; stop:() => void } | null = null
  /** takeBack left the sound playing: the next followed video takes it back. */
  let rejoining = false

  function acquire(src?: string): AudioHandle | null {
    const audio = sdk?.audio?.()
    if (!audio) return null
    return audio.acquireElement({
      key:BACKGROUND_AUDIO_KEY,
      category:'custom',
      suspendPolicy:'continue',
      initialProps:src ? { src, preload:'auto' } : undefined,
    })
  }

  function currentJob() {
    return sdk?.jobs?.().current(BACKGROUND_JOB) ?? null
  }

  function stopFollowing() {
    following?.stop()
    following = null
  }

  /**
   * The player shows `item` in `video`: the muted element follows it (or, after takeBack, hands
   * the sound back to it). `enabled`: the "Keep playing when hidden" setting.
   */
  function follow(video: HTMLVideoElement, item: LibraryItem, url: string, enabled: boolean) {
    stopFollowing()
    if (!enabled || !item.path || !sdk?.jobs || !sdk.audio) {
      if (rejoining) release()
      return
    }
    const element = acquire(url)
    if (!element) return
    const job = sdk.jobs().ensure(BACKGROUND_JOB, { title:`${item.title} · sound only`, params:{ path:item.path } })
    job.hold(element)
    ;(element as Detachable).__mlDetach?.()

    let rejoin = rejoining && !element.paused
    rejoining = false
    let tries = 0
    // Back from the background the element is already playing; otherwise it loads the stream only
    // once the video has played for ARM_DELAY_MS (arm).
    let armed = rejoin
    let armTimer: ReturnType<typeof setTimeout> | undefined
    if (rejoin) video.muted = true
    else {
      element.muted = true
      if (element.src && element.src !== url) element.pause()   // the previous title's sound, until armed
    }
    const arm = () => {
      armTimer = undefined
      if (armed || following?.video !== video) return
      armed = true
      trace('background: muted sound joins the video')
      if (element.src !== url) element.src = url
      element.muted = true
      seekTo(element, video.currentTime)
      sync()
    }
    const armSoon = () => { if (!armed && !armTimer) armTimer = setTimeout(arm, armDelay) }

    const sync = () => {
      if (rejoin || !armed) return
      if (video.paused !== element.paused) {
        if (video.paused) element.pause()
        else void element.play().catch(() => {})
      }
      if (video.paused || video.seeking) return
      const drift = element.currentTime - video.currentTime
      if (Math.abs(drift) > SEEK_DRIFT) {
        seekTo(element, video.currentTime)
        element.playbackRate = video.playbackRate
      } else if (Math.abs(drift) > NUDGE_DRIFT) {
        element.playbackRate = video.playbackRate * (1 - Math.max(-.08, Math.min(.08, drift * .5)))
      } else {
        element.playbackRate = video.playbackRate
      }
    }
    /** Back from the background: the video plays muted until it is where the sound is. */
    const catchUp = () => {
      if (!rejoin) return
      const drift = element.currentTime - video.currentTime
      if (Math.abs(drift) > REJOIN_DRIFT && tries < REJOIN_TRIES && !element.paused) {
        tries += 1
        seekTo(video, element.currentTime + .15)   // a little ahead: the seek takes time
        return
      }
      handBack()
    }
    /**
     * Once the picture is really on screen (the first frame presented: requestVideoFrameCallback,
     * later than 'playing'), the sound crossfades from the shell element to the video.
     */
    let handing = false
    const handBack = () => {
      if (handing) return
      handing = true
      const crossfade = () => {
        const target = element.volume
        const start = Date.now()
        video.volume = 0
        video.muted = false
        const step = () => {
          if (following?.video !== video) return   // the player closed meanwhile
          const t = Math.min(1, (Date.now() - start) / CROSSFADE_MS)
          video.volume = target * t
          element.volume = target * (1 - t)
          if (t < 1) { nextFrame(step); return }
          element.muted = true
          element.volume = target
          rejoin = false
          handing = false
          trace('background: the video has the sound back')
          sync()
        }
        nextFrame(step)
      }
      const onFrame = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback
      if (typeof onFrame === 'function') onFrame.call(video, crossfade)
      else crossfade()
    }
    const seeked = () => {
      if (rejoin) { catchUp(); return }
      seekTo(element, video.currentTime)
      sync()
    }
    const playing = () => {
      if (rejoin) catchUp()
      else { armSoon(); sync() }
    }
    const volume = () => { if (!rejoin) element.volume = video.volume }
    const listeners: Array<[string, () => void]> = [
      ['play', sync], ['pause', sync], ['playing', playing], ['waiting', () => { if (!rejoin) element.pause() }],
      ['seeked', seeked], ['ratechange', sync], ['volumechange', volume], ['timeupdate', sync],
    ]
    for (const [name, fn] of listeners) video.addEventListener(name, fn)
    following = {
      element,
      video,
      stop:() => {
        clearTimeout(armTimer)
        for (const [name, fn] of listeners) video.removeEventListener(name, fn)
      },
    }
  }

  /** The player closed (the user's Back, or another title starts): no sound left behind. */
  function release() {
    stopFollowing()
    rejoining = false
    const job = currentJob()
    if (job) {
      const element = acquire()
      if (element) {
        ;(element as Detachable).__mlDetach?.()
        element.pause()
      }
      job.end()
    }
    session.value = null
  }

  /** Keeps the cell and the watch progress up to date while nothing is on screen. */
  function reportWhileHidden(element: AudioHandle) {
    const job = currentJob()
    let lastReport = 0
    const report = (final: boolean) => {
      const current = session.value
      if (!current || !Number.isFinite(element.currentTime)) return
      const durationMs = Number.isFinite(element.duration) ? element.duration * 1000 : current.durationMs
      current.positionMs = element.currentTime * 1000
      current.durationMs = durationMs
      current.playing = !element.paused
      onPosition(current.item, current.positionMs, durationMs, final)
    }
    const timeUpdate = () => { if (Date.now() - lastReport >= 5000) { lastReport = Date.now(); report(false) } }
    const pause = () => report(true)
    const end = () => {
      report(true)
      session.value = null
      job?.end()
      detach()
    }
    const detach = () => {
      element.removeEventListener('timeupdate', timeUpdate)
      element.removeEventListener('pause', pause)
      element.removeEventListener('ended', end)
      element.removeEventListener('error', end)
      ;(element as Detachable).__mlDetach = undefined
    }
    element.addEventListener('timeupdate', timeUpdate)
    element.addEventListener('pause', pause)
    element.addEventListener('ended', end)
    element.addEventListener('error', end)
    ;(element as Detachable).__mlDetach = detach
  }

  /** The widget is leaving the screen while the player is open. */
  function handOff(item: LibraryItem, url: string, snapshot: PlayerSnapshot, keepPlaying: boolean) {
    const playing = !snapshot.paused
    const followed = following
    stopFollowing()
    trace('background: leaving the screen', { playing:!snapshot.paused, keepPlaying, positionMs:Math.round(snapshot.positionMs) })
    const background = keepPlaying && playing && !!item.path && !!sdk?.jobs && !!sdk.audio
    session.value = { item:sessionItem(item), url, positionMs:snapshot.positionMs, durationMs:snapshot.durationMs, playing, background }
    if (!background) {
      if (followed) { followed.element.pause(); currentJob()?.end() }
      return
    }
    const element = followed?.element ?? acquire(url)
    if (!element) return
    if (!followed) {
      const job = sdk!.jobs!().ensure(BACKGROUND_JOB, { title:`${item.title} · sound only`, params:{ path:item.path } })
      job.hold(element)
    }
    // Not armed yet (the video had just started): the sound starts from where the video was.
    const fresh = element.src !== url
    if (fresh) element.src = url
    const position = snapshot.positionMs / 1000
    element.playbackRate = followed?.video.playbackRate ?? 1
    if (snapshot.volume != null) element.volume = snapshot.volume
    // Muted only if the user muted the movie (mid-rejoin the element is the one sounding: kept).
    element.muted = fresh ? !!snapshot.muted : !!snapshot.muted && element.muted
    const start = () => {
      if (Math.abs(element.currentTime - position) > HANDOFF_DRIFT) seekTo(element, position)
      if (element.paused) void element.play().catch(error => {
        console.warn('[Media Library] The sound could not go on in the background:', error)
        currentJob()?.end()
      })
    }
    if (element.readyState >= 1) start()
    else element.addEventListener('loadedmetadata', start, { once:true })
    reportWhileHidden(element)
  }

  /**
   * Back on screen: what to reopen, or null. live: the sound is still going (it carries on; the
   * next followed video takes it back), else the player reopens there.
   */
  function takeBack(): { item:LibraryItem; positionMs:number; playing:boolean; live:boolean } | null {
    const current = session.value
    if (!current) return null
    trace('background: back on screen', { background:current.background })
    session.value = null
    let { positionMs, playing } = current
    if (!current.background) return { item:current.item, positionMs, playing, live:false }
    const job = currentJob()
    if (!job) return null   // stopped from the operations tray (or it ended): nothing to bring back
    const element = acquire()
    if (!element) { job.end(); return { item:current.item, positionMs, playing, live:false } }
    ;(element as Detachable).__mlDetach?.()
    if (Number.isFinite(element.currentTime) && element.currentTime > 0) positionMs = element.currentTime * 1000
    playing = !element.paused
    onPosition(current.item, positionMs, Number.isFinite(element.duration) ? element.duration * 1000 : current.durationMs, !playing)
    rejoining = playing
    if (!playing) element.muted = true
    return { item:current.item, positionMs, playing, live:playing }
  }

  return { session, follow, release, handOff, takeBack }
}
