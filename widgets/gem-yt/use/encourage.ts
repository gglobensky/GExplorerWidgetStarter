// GEM Shell's Encourage this creator: GEM Shell keeps the list and decides; GEM YT knows how many you encourage (the
// plaque), whether the playing video's creator is one (the Channel part's 💛), and which of your channels are (the
// 💛 Encouraged filter: GEM Shell answers for the ones GEM YT names, under its PageData permission).
import { ref, type Ref } from 'vue'

export function useEncourage(o: { web: any; surface: () => any; channelIds: () => string[]; status: Ref<string> }) {
  const encouragedCount = ref<number | null>(null)
  const creatorEncouraged = ref<boolean | null>(null)
  const encouragedIds = ref(new Set<string>())
  let asked = ''

  async function readEncouraged() {
    if (typeof o.web?.encouraged !== 'function') return
    const n = await o.web.encouraged().catch(() => null)
    if (typeof n === 'number') encouragedCount.value = n
  }
  /** Asked again when the count changes or the channels are read */
  async function readEncouragedIds() {
    const ids = o.channelIds()
    if (typeof o.web?.encouragedAmong !== 'function' || !ids.length) return
    const key = `${encouragedCount.value ?? '?'}|${ids.length}`
    if (key === asked) return
    asked = key
    const r = await o.web.encouragedAmong('youtube', ids).catch(() => null)
    if (r?.ok && Array.isArray(r.ids)) encouragedIds.value = new Set(r.ids as string[])
    else asked = ''
  }
  /** The Channel part's 💛: at once (GEM Shell's encourage, after this click; its snackbar says so, with Undo); an
   *  older GEM Shell: its blocking menu beside the chip */
  async function encourageMenu(at: HTMLElement) {
    const s = o.surface()
    if (typeof s?.encourage === 'function') {
      const r = await s.encourage(!creatorEncouraged.value)
      if (r && !r.ok) o.status.value = `Not changed: ${r.error ?? r.reason}`
      return
    }
    const r = await s?.showBlocking?.(at)
    if (r && !r.ok) o.status.value = `No menu: ${r.error ?? r.reason}`
  }
  return { encouragedCount, creatorEncouraged, encouragedIds, readEncouraged, readEncouragedIds, encourageMenu }
}
