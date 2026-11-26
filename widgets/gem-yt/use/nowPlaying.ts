// What the page shows now (GEM Shell's sdk.web() surface: its media, the rules' "now" fields, and whose video it is from
// YouTube's own player data), picture in picture, and the next video. Watched while tiles are on in Standard mode.
import { computed, ref, watch } from 'vue'

export type Media = { playing: boolean; time: number; duration: number; ended: boolean; pip?: boolean }

const clockOf = (s: number) => {
  const t = Math.floor(s); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t % 60
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`
}
const videoOfPage = (u: string) => { try { return new URL(u).searchParams.get('v') } catch { return null } }

export function useNowPlaying(o: { surface: () => any; snack: (text: string) => void }) {
  const nowInfo = ref<Record<string, string | null>>({})
  const media = ref<Media | null>(null)
  /** Whose video it is (its channel id), kept only when it's the address's video (an ad's player data names the ad). */
  const owner = ref<{ videoId: string; channelId: string; name?: string } | null>(null)

  let stopNow: (() => void) | null = null
  let stopMedia: (() => void) | null = null
  let stopData: (() => void) | null = null
  let watching = false
  async function watchNow() {
    const s = o.surface()
    if (watching || !s?.onMedia || !s.now) return
    watching = true
    stopMedia = s.onMedia((m: Media) => { media.value = m })
    const r = await s.now('youtube', (f: Record<string, string | null>) => { nowInfo.value = f })
    if (r.ok) stopNow = r.stop ?? null
    else console.warn('[GEM YT] what’s playing: not watched', r.error ?? r.reason)
    if (s.onData && watching) {
      const d = await s.onData('youtube', (x: { page: string; items: Record<string, Array<Record<string, unknown>>> }) => {
        const v = videoOfPage(x.page)
        for (const it of x.items.videoOwner ?? [])
          if (v && it.videoId === v && typeof it.channelId === 'string' && it.channelId)
            owner.value = { videoId: v, channelId: it.channelId, name: typeof it.name === 'string' ? it.name : undefined }
      })
      if (d.ok) stopData = d.stop ?? null
      else console.warn('[GEM YT] whose video: not read', d.error ?? d.reason)
    }
  }
  function stopWatching() {
    watching = false
    stopNow?.(); stopNow = null
    stopMedia?.(); stopMedia = null
    stopData?.(); stopData = null
    owner.value = null
    nowInfo.value = {}
    media.value = null
  }

  // The title and channel apart from the clock: the title scrolls in GEM Shell's marquee, and the clock changes every
  // second (it would restart the scroll)
  const nowWhat = computed(() => { const n = nowInfo.value; return [n.title, n.channelName ?? n.channelHandle].filter(Boolean).join(' — ') })
  const nowState = computed(() => {
    const m = media.value
    return !m ? '' : m.ended ? 'Ended' : !m.playing ? (m.time ? `Paused ${clockOf(m.time)}` : '') : m.duration ? `${clockOf(m.time)} / ${clockOf(m.duration)}` : ''
  })
  const nowLine = computed(() => [nowWhat.value, nowState.value].filter(Boolean).join(' · '))

  // Picture in picture (the page's own video in the system's floating window). Its state from the last answer, then
  // from the media watch (you may close its window). pipState null: this GEM Shell can't.
  const pipOn = ref(false)
  const canPip = ref(false)
  watch(() => media.value?.pip, v => { if (typeof v === 'boolean') pipOn.value = v })
  const pipState = computed(() => (canPip.value ? pipOn.value : null))
  async function togglePip() {
    const s = o.surface()
    if (!s?.pip) return
    const r = await s.pip('toggle')
    if (r.ok) { pipOn.value = r.on; return }
    const why = String(r.error ?? r.reason)
    o.snack(/^unsupported|NotSupportedError/.test(why)
      ? 'This GEM Shell’s browser doesn’t allow picture in picture.'
      : /^no-video/.test(why) ? 'No video to float yet: play one first.' : `Picture in picture didn’t start (${why}).`)
  }

  /** The player's next video (the rules' now "next": the ⏭ button's address), a youtube.com watch page only */
  const nextUrl = computed(() => {
    const h = nowInfo.value.next
    if (!h) return null
    try {
      const u = new URL(h, 'https://www.youtube.com')
      return /(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === '/watch' && u.searchParams.get('v') ? u.href : null
    } catch { return null }
  })
  function playNext() { if (nextUrl.value) void o.surface()?.load(nextUrl.value) }

  return { nowInfo, media, owner, watchNow, stopWatching, nowWhat, nowState, nowLine, pipOn, canPip, pipState, togglePip, nextUrl, playNext }
}
