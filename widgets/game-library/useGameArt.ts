// widgets/game-library/useGameArt.ts
//
// The games' pictures made into images by GEM Shell (sdk.mediaImageCreate, kept in this widget's cache room: it can
// make them again), a few at a time. Each picture has a key ("box:game:portal 2") and its sources, best first: a
// file on this computer (Steam's cached art) or an https url (SteamGridDB, Steam's servers; 0.4.0). A source that
// fails gives way to the next. want(jobs) asks (from a watch, never while rendering); urlFor(key) only reads.
// A picture whose source is no longer among its sources (SteamGridDB forgotten, 0.5.0) is dropped and asked again.
// 0.17.1: what was made is kept by the lifecycle (Guillaume: leaving the hub and coming back made every picture again,
// slowly): a remounted Game Shop finds its pictures at once, and a run still going goes on into the same place. New
// pictures reach the boxes in batches (every 60 ms), not one re-render per picture.
// 0.15.0: a source may be a program's icon: games.ts iconSource({ path }) or iconSource({ appId }) (GEM Shell's 'icon' images).
// 0.20.0: remembered between starts (art-memory.ts): at a start, the pictures made before are shown at once and each
// checked in the background (loaded once, quietly); one the cache let go is made again. Until the memory is read
// (a moment), what's asked waits.
import { markRaw, ref } from 'vue'
import type { WidgetLifecycle, WidgetSdk } from 'gexplorer/widgets'
import { ICON_APP, ICON_FILE } from './games'
import { ART_DOC, normalizeArt, sourceHash, withChanges, type ArtMemory, type SavedPicture } from './art-memory'

export type ArtSize = 'box' | 'hero' | 'logo' | 'shot' | 'shot-full' | 'pick' | 'icon' | 'badge'
export type ArtJob = { key: string; sources: Array<string | undefined>; size: ArtSize }

const AT_ONCE = 6
/** How often new pictures are handed to the boxes (ms). */
const FLUSH_MS = 60
/** 0.20.0: the memory written this long after the last picture made (ms). */
const SAVE_MS = 2000
/** 0.20.0: remembered pictures checked at once. */
const CHECK_AT_ONCE = 8
const SIZES: Record<ArtSize, { width?: number; height?: number; fit?: 'cover' | 'contain'; format?: 'jpeg' | 'png' }> = {
  // Steam's 600x900 box art as is (drawn at most ~300 px wide on a 2x screen)
  box: { width: 600, height: 900, fit: 'cover' },
  hero: { width: 1600 },
  logo: { width: 640, height: 260, fit: 'contain', format: 'png' },
  shot: { width: 480 },
  'shot-full': { width: 1920 },
  // 0.11.1: a cover in the list of IGDB's games to link a box to
  pick: { width: 132, height: 176, fit: 'cover' },
  // 0.15.0: a program's icon on a plain box (GEM Shell trims its margin: smaller when it's only drawn small)
  icon: { width: 256, height: 256, fit: 'contain', format: 'png' },
  // 0.23.0: a small badge on a box (Minecraft's icon on the modpacks)
  badge: { width: 96, height: 96, fit: 'contain', format: 'png' },
}

type ImageSource = Parameters<NonNullable<WidgetSdk['mediaImageCreate']>>[0]
function sourceOf(source: string): ImageSource {
  if (source.startsWith(ICON_APP)) return { type: 'icon', appId: source.slice(ICON_APP.length) }
  if (source.startsWith(ICON_FILE)) return { type: 'icon', path: source.slice(ICON_FILE.length) }
  return /^https:\/\//i.test(source) ? { type: 'url', url: source } : { type: 'file', path: source }
}

type ArtState = {
  /** Key → the image's size (px), once made. */
  sizes: Map<string, { width: number; height: number }>
  /** 0.16.0: the keys none of whose sources worked (a box with dead links: its icon instead). */
  failedKeys: Set<string>
  /** Key → the hash of the source its image was made from (0.20.0: art-memory.ts sourceHash). */
  madeFrom: Map<string, string>
  /** Key → the sources it was asked with ('\n'-joined): asked again only when they change and none worked. */
  asked: Map<string, string>
  queue: ArtJob[]
  running: number
  /** Made, not yet handed to the boxes. */
  pending: Record<string, string>
  flushTimer: ReturnType<typeof setTimeout> | undefined
  // 0.20.0: the memory between starts
  memoryState: 'unread' | 'reading' | 'read'
  memory: ArtMemory
  /** Asked while the memory was being read: asked again once it is. */
  waiting: ArtJob[]
  /** Remembered pictures shown but not checked yet (key → url); those asked for, to check; and how many are. */
  unchecked: Map<string, string>
  toCheck: string[]
  checking: number
  /** The last ask of each key (made again from it when a remembered picture is gone). */
  jobs: Map<string, ArtJob>
  /** Made or gone since the memory was last written. */
  toSave: Record<string, SavedPicture>
  toForget: Set<string>
  saveTimer: ReturnType<typeof setTimeout> | undefined
}
const freshState = (): ArtState => ({
  sizes: new Map(), failedKeys: new Set(), madeFrom: new Map(), asked: new Map(), queue: [], running: 0, pending: {}, flushTimer: undefined,
  memoryState: 'unread', memory: { version: 1, pictures: {} }, waiting: [], unchecked: new Map(), toCheck: [], checking: 0, jobs: new Map(),
  toSave: {}, toForget: new Set(), saveTimer: undefined,
})

export function useGameArt(sdk: WidgetSdk | undefined, life?: WidgetLifecycle) {
  /** Key → image url, once made (the lifecycle's: the same across remounts). */
  // Transient (0.18.1): the pictures' addresses are this session's (the cache may let one go between sessions)
  const urls = life?.persistRef<Record<string, string>>('game-library.art-urls', {}, { transient: true }) ?? ref<Record<string, string>>({})
  const failures = life?.persistRef<number>('game-library.art-failures', 0, { transient: true }) ?? ref(0)
  /** 0.17.2: pictures still to make (asked, not yet made or given up): "Stocking shelves…". */
  const remaining = life?.persistRef<number>('game-library.art-remaining', 0, { transient: true }) ?? ref(0)
  // Plain (not reactive) state, kept by the lifecycle across remounts. 0.21.1: a resource cell (dispose), never copied
  // when GEM Shell puts the widget away: its Maps, Sets and timers aren't plain data ("part of its state can't be
  // kept", Guillaume 2026-11-02). After that, it starts again from the remembered pictures (readMemory).
  const holder = life?.persistRef<{ state: ArtState }>('game-library.art-state', () => markRaw({ state: freshState() }), {
    dispose: h => {
      const s = h.state
      if (s.flushTimer) clearTimeout(s.flushTimer)
      if (s.saveTimer) { clearTimeout(s.saveTimer); save() }
    },
  }) ?? { value: { state: freshState() } }
  const st = holder.value.state
  const { sizes, failedKeys, madeFrom, asked, queue } = st

  function flush() {
    st.flushTimer = undefined
    if (!Object.keys(st.pending).length) return
    urls.value = { ...urls.value, ...st.pending }
    st.pending = {}
  }
  function handOver(key: string, url: string) {
    st.pending[key] = url
    if (!st.flushTimer) st.flushTimer = setTimeout(flush, FLUSH_MS)
  }

  // ── 0.20.0: the memory between starts ─────────────────────────────────────────────────────────────────────────
  function save() {
    st.saveTimer = undefined
    if (!sdk?.configWrite || (!Object.keys(st.toSave).length && !st.toForget.size)) return
    st.memory = withChanges(st.memory, st.toSave, st.toForget)
    st.toSave = {}
    st.toForget = new Set()
    void sdk.configWrite(ART_DOC, st.memory).catch(() => { /* kept for next time: made again then */ })
  }
  function saveSoon() {
    if (!st.saveTimer) st.saveTimer = setTimeout(save, SAVE_MS)
  }
  function remember(key: string, source: string, image: { url: string; width: number; height: number }) {
    st.toForget.delete(key)
    st.toSave[key] = { url: image.url, from: sourceHash(source), width: image.width, height: image.height, at: Date.now() }
    saveSoon()
  }
  function forget(key: string) {
    delete st.toSave[key]
    if (st.memory.pictures[key]) { st.toForget.add(key); saveSoon() }
  }

  /** Reads the memory once a session: what was made before is shown at once, then what was asked meanwhile. */
  async function readMemory() {
    st.memoryState = 'reading'
    let doc: ArtMemory = { version: 1, pictures: {} }
    try { doc = normalizeArt(await sdk?.configRead?.(ART_DOC)) } catch { /* none yet */ }
    st.memory = doc
    const shown: Record<string, string> = {}
    for (const [key, p] of Object.entries(doc.pictures)) {
      if (madeFrom.has(key)) continue
      const now = urls.value[key]
      if (now && now !== p.url) continue   // made again this session: that one
      madeFrom.set(key, p.from)
      sizes.set(key, { width: p.width, height: p.height })
      // Already shown (the pictures' addresses outlived this state: the widget was put away): only its facts back
      if (now) continue
      shown[key] = p.url
      st.unchecked.set(key, p.url)
    }
    if (Object.keys(shown).length) urls.value = { ...shown, ...urls.value }
    st.memoryState = 'read'
    const waiting = st.waiting
    st.waiting = []
    want(waiting)
  }

  /** Loads remembered pictures in the background, those asked first; one that doesn't load is made again. */
  function check() {
    // Only the pictures asked for (a box no longer here: never loaded)
    while (st.checking < CHECK_AT_ONCE && st.toCheck.length) {
      const asked = st.toCheck.shift()!
      const url = urls.value[asked]
      if (!url) continue
      st.checking += 1
      loads(url).then(ok => {
        st.checking -= 1
        if (!ok && urls.value[asked] === url) {
          // Gone from GEM Shell's cache (cleared, or let go): made again from its sources
          madeFrom.delete(asked)
          sizes.delete(asked)
          const { [asked]: _gone, ...rest } = urls.value
          urls.value = rest
          forget(asked)
          const job = st.jobs.get(asked)
          if (job) want([job])
        }
        check()
      })
    }
  }
  function loads(url: string): Promise<boolean> {
    if (typeof Image === 'undefined') return Promise.resolve(true)
    return new Promise(resolve => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = url
    })
  }

  async function make(job: ArtJob) {
    for (const source of job.sources) {
      if (!source || !sdk?.mediaImageCreate) continue
      try {
        const image = await sdk.mediaImageCreate(sourceOf(source), { ...SIZES[job.size], storage: 'cache' })
        // Asked again meanwhile with other sources: this one is stale unless still among them
        const now = asked.get(job.key)
        if (now !== undefined && !now.split('\n').includes(source)) return
        madeFrom.set(job.key, sourceHash(source))
        sizes.set(job.key, { width: image.width, height: image.height })
        handOver(job.key, image.url)
        remember(job.key, source, image)
        return
      } catch {
        // the next source (none: the plain box stays)
      }
    }
    // None worked (still the same ask): said, for a fallback
    const now = asked.get(job.key)
    if (now === undefined || now === job.sources.join('\n')) { failedKeys.add(job.key); failures.value += 1 }
  }

  function pump() {
    while (st.running < AT_ONCE && queue.length) {
      const job = queue.shift()!
      st.running += 1
      void make(job).finally(() => { st.running -= 1; remaining.value = queue.length + st.running; pump() })
    }
  }

  /** Asks for these pictures (each once per session, again when its sources change before one worked). */
  function want(jobs: ArtJob[]) {
    // 0.20.0: the memory first (once a session)
    if (st.memoryState !== 'read' && sdk?.configRead) {
      st.waiting.push(...jobs)
      if (st.memoryState === 'unread') void readMemory()
      return
    }
    for (const job of jobs) {
      const sources = job.sources.filter((s): s is string => !!s)
      st.jobs.set(job.key, job)
      if (st.unchecked.delete(job.key)) st.toCheck.push(job.key)
      const made = madeFrom.get(job.key)
      if (made !== undefined && !sources.some(s => sourceHash(s) === made)) {
        // Its source went: the image goes (the next source, if any, is asked below)
        madeFrom.delete(job.key)
        asked.delete(job.key)
        st.unchecked.delete(job.key)
        const { [job.key]: _gone, ...rest } = urls.value
        urls.value = rest
        delete st.pending[job.key]
        forget(job.key)
      }
      if (!sources.length || urls.value[job.key]) continue
      const sig = sources.join('\n')
      if (asked.get(job.key) === sig) continue
      asked.set(job.key, sig)
      failedKeys.delete(job.key)
      queue.push({ ...job, sources })
    }
    if (sdk?.mediaImageCreate) { remaining.value = queue.length + st.running; pump() }
    check()
  }

  /** The image's url when it's made, else ''. */
  function urlFor(key: string | undefined): string {
    return key ? urls.value[key] ?? '' : ''
  }

  /** 0.16.0: every source of <key> failed (reactive: read in a watch or a computed). */
  function hasFailed(key: string): boolean {
    void failures.value
    return failedKeys.has(key)
  }

  /** The image's size (px) when it's made. */
  function sizeFor(key: string | undefined): { width: number; height: number } | undefined {
    return key && urls.value[key] ? sizes.get(key) : undefined
  }

  /** How many asks have failed so far (reactive: a watch on it hears each). */
  const failureCount = () => failures.value

  return { want, urlFor, sizeFor, hasFailed, failureCount, remaining }
}
