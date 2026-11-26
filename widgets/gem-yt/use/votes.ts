// Dislikes from Return YouTube Dislike (core/votes.ts): one request per video played (kept for the day), only while the
// tiles show it and Settings' Show dislikes is on. And 💬 Comment: YouTube's comments over the video while the comments'
// tile doesn't show them; closed on the next video.
import { ref, watch, type Ref } from 'vue'
import { VOTES_CREDIT, createVotes, type Votes } from '../core/votes'

export function useVotes(o: { sdk: any; on: () => boolean; videoId: () => string | null | undefined; tilesShown: Ref<boolean> }) {
  const store = o.sdk?.networkFetch ? createVotes((url: string) => o.sdk.networkFetch(url)) : null
  const votes = ref<Votes | null>(null)
  watch(() => [o.videoId(), o.on(), o.tilesShown.value] as const, async ([id, on, tiles]) => {
    votes.value = null
    if (!on || !tiles || !store || !id) return
    const v = await store.get(id)
    if (o.videoId() === id && o.on() && o.tilesShown.value) votes.value = v
  }, { immediate: true })
  /** The credit Return YouTube Dislike asks for: its site (GEM Shell asks before opening it) */
  function openVotesCredit() { void o.sdk?.openUrl?.(VOTES_CREDIT, { title: 'Return YouTube Dislike' }) }

  const quickComment = ref(false)
  watch(o.videoId, () => { quickComment.value = false })
  watch(o.tilesShown, on => { if (!on) quickComment.value = false })

  return { votes, openVotesCredit, quickComment }
}
