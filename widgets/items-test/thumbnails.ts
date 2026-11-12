// widgets/items/thumbnails.ts
//
// The Media layout's thumbnails (2026-10-27, Items 0.8.0): the system's thumbnail of pictures,
// videos, music (its cover) and PDFs, made by GEM Shell (sdk.mediaImageCreate, type 'thumbnail',
// Media capability) and served at a same-origin URL. Folders and other files keep their icon.
//
// Only what is on screen is asked for, in screen order, a few at a time; what scrolled away before
// its turn is dropped. A thumbnail is known by the file's path, size, date and the pixel size asked,
// so an edited file gets a new one (GEM Shell's cache uses the same facts: an unchanged file is
// served from its cache, across sessions). Files without a thumbnail are remembered (icons, no
// asking again) until the folder is listed again.

// No sibling imports here (node's test runner can't resolve extension-less ones): Widget.vue builds
// the extension set from quickFilter's TYPE_GROUPS (thumbExtsOf).

type EntryLike = { Kind: string; Ext: string; FullPath: string; Size: number | null; ModifiedAt: number | null }

/** The extensions to ask thumbnails for: pictures, videos, music (covers), and PDF. */
export function thumbExtsOf(groups: { pictures: { exts: string[] }; videos: { exts: string[] }; music: { exts: string[] } }): ReadonlySet<string> {
  return new Set([...groups.pictures.exts, ...groups.videos.exts, ...groups.music.exts, 'pdf'])
}
/** Kept as PNG (transparency); the rest as JPEG (smaller). */
const PNG_EXTS = new Set(['png', 'gif', 'ico', 'svg', 'webp'])

/** A file the system may have a thumbnail for (not a folder, not a shortcut). */
export function wantsThumbnail(e: EntryLike, exts: ReadonlySet<string>): boolean {
  return e.Kind === 'file' && exts.has(e.Ext.replace(/^\./, '').toLowerCase())
}

export function thumbFormat(e: EntryLike): 'png' | 'jpeg' {
  return PNG_EXTS.has(e.Ext.replace(/^\./, '').toLowerCase()) ? 'png' : 'jpeg'
}

/** The pixel size to ask for: the shown size times the pixel ratio, rounded up to a few steps (≤ 1024: GEM Shell's limit). */
export function thumbPx(shown: number, pixelRatio = 1): number {
  const want = shown * Math.max(1, pixelRatio)
  return [64, 96, 128, 192, 256, 384, 512, 768, 1024].find(px => px >= want) ?? 1024
}

export function thumbKey(e: EntryLike, px: number): string {
  return `${e.FullPath}|${e.Size ?? ''}|${e.ModifiedAt ?? ''}|${px}`
}

export type ThumbJob = { key: string; path: string; px: number; format: 'png' | 'jpeg' }

export type ThumbnailLoader = {
  /** The URL once made. */
  get(key: string): string | undefined
  /** No thumbnail for it (the icon shows). */
  failed(key: string): boolean
  /** What is on screen now, in screen order: asked for in that order; queued jobs not in it are dropped. */
  want(jobs: ThumbJob[]): void
  /** Its <img> failed to load (GEM Shell evicted it): made again, once. */
  broken(key: string): void
  /** Everything forgotten (another folder, a refresh). */
  clear(): void
  readonly inFlight: number
}

export function createThumbnailLoader(opts: {
  create: (job: ThumbJob) => Promise<string>
  onChange: () => void
  concurrency?: number
  maxEntries?: number
}): ThumbnailLoader {
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  const maxEntries = Math.max(16, opts.maxEntries ?? 3000)
  const urls = new Map<string, string>()      // insertion order = least recently used first
  const failures = new Set<string>()
  const retried = new Set<string>()
  const running = new Map<string, number>()   // key -> generation it was started in
  let queue: ThumbJob[] = []
  let generation = 0

  function remember(key: string, url: string) {
    urls.delete(key)
    urls.set(key, url)
    while (urls.size > maxEntries) urls.delete(urls.keys().next().value as string)
  }

  function pump() {
    while (running.size < concurrency && queue.length) {
      const job = queue.shift()!
      if (urls.has(job.key) || failures.has(job.key) || running.has(job.key)) continue
      const gen = generation
      running.set(job.key, gen)
      opts.create(job).then(
        (url) => { if (gen === generation) { remember(job.key, url); opts.onChange() } },
        () => { if (gen === generation) { failures.add(job.key); opts.onChange() } },
      ).finally(() => {
        if (running.get(job.key) === gen) running.delete(job.key)
        pump()
      })
    }
  }

  return {
    get(key) {
      const url = urls.get(key)
      if (url !== undefined) { urls.delete(key); urls.set(key, url) }   // recently used
      return url
    },
    failed: (key) => failures.has(key),
    want(jobs) {
      queue = jobs.filter(j => !urls.has(j.key) && !failures.has(j.key) && !running.has(j.key))
      pump()
    },
    broken(key) {
      if (!urls.delete(key)) return
      if (retried.has(key)) failures.add(key)
      else retried.add(key)
      opts.onChange()
    },
    clear() {
      generation++
      urls.clear(); failures.clear(); retried.clear(); running.clear()
      queue = []
    },
    get inFlight() { return running.size },
  }
}
