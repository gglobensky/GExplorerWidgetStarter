// GEM YT 1.0, part 3 (2026-11-24): a video's likes and dislikes, from Return YouTube Dislike
// (https://returnyoutubedislikeapi.com/votes?videoId=…; credit: returnyoutubedislike.com). Its dislikes are ESTIMATES
// (archived counts, then extrapolated from its extension's users), so they're shown with "~". Its terms: 100 requests
// a minute and 10,000 a day per client; we ask once per video played, keep the answer for the day, and back off on 429.
// Fetched by GEM Shell (sdk.networkFetch: the Network permission, asked once).

export type Votes = { likes: number; dislikes: number; at: number }
export type VotesFetch = (url: string) => Promise<{ json: () => Promise<any> }>

export const VOTES_API = 'https://returnyoutubedislikeapi.com/votes?videoId='
export const VOTES_CREDIT = 'https://returnyoutubedislike.com/'
const DAY = 24 * 60 * 60 * 1000
const MAX_KEPT = 300
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function createVotes(fetch: VotesFetch) {
  const kept = new Map<string, Votes>()
  const asking = new Map<string, Promise<Votes | null>>()
  let pausedUntil = 0
  /** The permission refused (or no network here): no more requests this session. */
  let refused = false

  async function ask(id: string): Promise<Votes | null> {
    try {
      const r = await fetch(VOTES_API + encodeURIComponent(id))
      const j = await r.json()
      const likes = Number(j?.likes), dislikes = Number(j?.dislikes)
      if (!Number.isFinite(likes) || !Number.isFinite(dislikes) || likes < 0 || dislikes < 0) return null
      const v = { likes: Math.round(likes), dislikes: Math.round(dislikes), at: Date.now() }
      kept.set(id, v)
      if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value as string)
      return v
    } catch (e: any) {
      const status = Number(e?.status)
      if (status === 429) pausedUntil = Date.now() + 10 * 60 * 1000
      else if (status >= 500) pausedUntil = Date.now() + 60 * 1000
      else if (!status && /NEEDS_NETWORK|denied|refused|declined/i.test(String(e?.code ?? e?.message ?? ''))) refused = true
      return null
    }
  }

  return {
    /** The votes of a video: kept ones (today's), or asked once; null: none (not known, paused, refused). */
    get(id: string | null | undefined): Promise<Votes | null> {
      if (!id || !VIDEO_ID.test(id)) return Promise.resolve(null)
      const k = kept.get(id)
      if (k && Date.now() - k.at < DAY) return Promise.resolve(k)
      if (refused || Date.now() < pausedUntil) return Promise.resolve(k ?? null)
      let p = asking.get(id)
      if (!p) { p = ask(id).finally(() => asking.delete(id)); asking.set(id, p) }
      return p
    },
    get refused() { return refused },
  }
}

/** The like share, 0 to 1 (null: no votes). */
export function likeShare(v: Votes | null | undefined): number | null {
  if (!v) return null
  const all = v.likes + v.dislikes
  return all > 0 ? v.likes / all : null
}
