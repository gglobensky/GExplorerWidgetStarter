// The video outlives GEM YT (GEM Shell's jobs): while a video is open in Standard mode, a job "watching" holds the
// page. Leaving GEM YT (another tab) then only lets go of it, and GEM Shell keeps it as the setting says (its sound,
// the video in the job's card, or paused); coming back takes the same page back (no reload). Picture in picture keeps
// playing whatever the setting.
import { watch, type Ref } from 'vue'

type Hidden = 'audio' | 'video' | 'pause'

export function useWatchJob(o: {
  sdk: unknown
  surface: () => any
  settings: () => Record<string, unknown> | undefined
  standard: () => boolean
  nowInfo: Ref<Record<string, string | null>>
  pipOn: Ref<boolean>
}) {
  let job: any = null
  let refused = false
  function hiddenSetting(): Hidden {
    const v = o.settings()?.hidden
    return v === 'video' || v === 'pause' ? v : 'audio'
  }
  function syncJob() {
    const jobs = (o.sdk as any)?.jobs?.()
    const s = o.surface()
    if (!jobs || !s || refused) return
    const vid = o.standard() ? o.nowInfo.value.videoId : null
    if (!vid) {
      const running = job ?? jobs.current?.('watching')
      if (running?.alive) running.end()
      job = null
      return
    }
    const title = `Watching: ${o.nowInfo.value.title || 'a YouTube video'}`
    try {
      job = jobs.ensure('watching', { title })
      job.update({ title })
      job.hold(s, { whenHidden: o.pipOn.value ? 'audio' : hiddenSetting(), show: 'player' })
    } catch (err) {
      refused = true   // an older GEM Shell (no web pages in jobs): as before, the page closes with GEM YT
      console.warn('[GEM YT] the video can’t outlive GEM YT here', err)
    }
  }
  watch([() => o.nowInfo.value.videoId, () => o.nowInfo.value.title, o.standard, o.pipOn], () => syncJob())
  return { syncJob }
}
