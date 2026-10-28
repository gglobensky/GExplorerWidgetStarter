import type { ListingEntry, ListingSnapshot, ListingSource, WidgetSdk } from 'gexplorer/widgets'

export const VIDEO_EXTENSIONS = ['mp4','m4v','mkv','avi','mov','wmv','webm','mpg','mpeg','ts','m2ts'] as const
export const COVER_EXTENSIONS = ['jpg','jpeg','png','webp'] as const

const videoExts = new Set(VIDEO_EXTENSIONS.map(ext => `.${ext}`))
const coverExts = new Set(COVER_EXTENSIONS.map(ext => `.${ext}`))
// `.ts` is both an MPEG transport-stream suffix and the standard TypeScript suffix.
// Only keep it when the host can identify actual media content.
const ambiguousVideoExts = new Set(['.ts'])

export type MediaProbe = {
  path: string
  durationMs?: number | null
  title?: string | null
  year?: number | null
  width?: number | null
  height?: number | null
}

export type ScannedVideo = {
  path: string
  name: string
  extension: string
  size: number | null
  modifiedAt: number | null
  sourceRoot: string
  coverPath?: string
  probe?: MediaProbe
}

export type ScanProgress = {
  phase: 'folders' | 'metadata'
  folders: number
  /** folders: videos found so far; metadata: videos whose details were read. */
  videos: number
  /** metadata: how many videos there are to read. */
  total?: number
  current: string
}

export type ScanResult = {
  videos: ScannedVideo[]
  warnings: string[]
  truncated: boolean
}

function hasVideoEvidence(probe: MediaProbe | undefined): boolean {
  return !!probe && (
    (probe.durationMs != null && probe.durationMs > 0)
    || (probe.width != null && probe.width > 0)
    || (probe.height != null && probe.height > 0)
  )
}

/**
 * No cap on folders or videos (2026-10-26: the old 400 folders / 1,500 videos are gone). Junctions are
 * links, never followed, so a folder loop cannot happen; the depth limit is a last safety net.
 */
const MAX_DEPTH = 32
/** A folder's rows are read in pages of this many. */
const ROWS_PAGE = 1000
/** Media details are asked for this many files at a time. */
const DETAILS_BATCH = 100

/** What identifies one version of a file: a changed size or date means it was replaced. */
export function videoFingerprint(video: Pick<ScannedVideo, 'size' | 'modifiedAt'>): string {
  return `${video.size ?? '?'}:${video.modifiedAt ?? '?'}`
}

function settled(source: ListingSource): Promise<ListingSnapshot> {
  return new Promise(resolve => {
    const current = source.snapshot()
    if (current.status !== 'loading') { resolve(current); return }
    const off = source.subscribe(snapshot => {
      if (snapshot.status !== 'loading') { off(); resolve(snapshot) }
    })
  })
}

async function listFolder(sdk: WidgetSdk, path: string, owner: string): Promise<ListingEntry[]> {
  if (!sdk.openListing) throw new Error('The Read API is unavailable for this widget.')
  const source = sdk.openListing(path, {
    owner,
    autoRefresh:false,
    consent:true,
    sort:{ key:'name', dir:'asc', foldersFirst:true },
    filter:{ exts:[...VIDEO_EXTENSIONS, ...COVER_EXTENSIONS], showHidden:false },
  })
  try {
    const snapshot = await settled(source)
    if (snapshot.status !== 'ready') throw new Error(snapshot.error?.message || `Could not read ${path}`)
    const entries: ListingEntry[] = []
    for (let start = 0; start < snapshot.total; start += ROWS_PAGE) {
      entries.push(...await source.rows(start, Math.min(snapshot.total, start + ROWS_PAGE), snapshot.version))
    }
    return entries
  } finally {
    source.close()
  }
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').toLocaleLowerCase()
}

export function chooseCover(videoName: string, images: ListingEntry[]): string | undefined {
  const stem = fileStem(videoName)
  const exact = images.find(image => fileStem(image.Name) === stem)
  if (exact) return exact.FullPath
  const conventional = images.find(image => /^(poster|cover|folder|front)$/i.test(fileStem(image.Name)))
  if (conventional) return conventional.FullPath
  return images.length === 1 ? images[0].FullPath : undefined
}

export async function scanVideoSources(
  sdk: WidgetSdk,
  roots: string[],
  owner: string,
  onProgress: (progress: ScanProgress) => void,
  isCancelled: () => boolean,
  /** The previous scan's videos: an unchanged file (same size and date) keeps its media details. */
  previous: ScannedVideo[] = [],
): Promise<ScanResult> {
  const known = new Map(previous.filter(video => video.probe).map(video => [video.path.toLocaleLowerCase(), video]))
  const queue = roots.map(path => ({ path, sourceRoot:path, depth:0 }))
  const seen = new Set<string>()
  const videos: ScannedVideo[] = []
  const warnings: string[] = []
  let folders = 0
  let truncated = false

  for (let head = 0; head < queue.length; head += 1) {
    if (isCancelled()) break
    const next = queue[head]
    const identity = next.path.toLocaleLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    onProgress({ phase:'folders', folders, videos:videos.length, current:next.path })
    try {
      const entries = await listFolder(sdk, next.path, `${owner}:${folders}`)
      folders += 1
      const images = entries.filter(entry => entry.Kind === 'file' && coverExts.has(entry.Ext.toLocaleLowerCase()))
      for (const entry of entries) {
        if (entry.Kind === 'dir') {
          if (next.depth < MAX_DEPTH) queue.push({ path:entry.FullPath, sourceRoot:next.sourceRoot, depth:next.depth + 1 })
          else truncated = true
        }
        if (entry.Kind !== 'file' || !videoExts.has(entry.Ext.toLocaleLowerCase())) continue
        videos.push({
          path:entry.FullPath,
          name:entry.Name,
          extension:entry.Ext.toLocaleLowerCase(),
          size:entry.Size,
          modifiedAt:entry.ModifiedAt,
          sourceRoot:next.sourceRoot,
          coverPath:chooseCover(entry.Name, images),
        })
      }
    } catch (error) {
      if (warnings.length < 8) warnings.push(`${next.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const unread: ScannedVideo[] = []
  for (const video of videos) {
    const before = known.get(video.path.toLocaleLowerCase())
    if (before?.probe && videoFingerprint(before) === videoFingerprint(video)) video.probe = { ...before.probe }
    else unread.push(video)
  }
  if (sdk.mediaInfo && unread.length && !isCancelled()) {
    for (let start = 0; start < unread.length; start += DETAILS_BATCH) {
      if (isCancelled()) break
      const batch = unread.slice(start, start + DETAILS_BATCH)
      onProgress({ phase:'metadata', folders, videos:start, total:unread.length, current:batch[0].path })
      try {
        const probes = await sdk.mediaInfo(batch.map(video => video.path))
        const byPath = new Map(probes.map(probe => [probe.path.toLocaleLowerCase(), probe]))
        for (const video of batch) video.probe = byPath.get(video.path.toLocaleLowerCase())
      } catch (error) {
        if (warnings.length < 8) warnings.push(`Media details: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  const accepted = videos.filter(video => !ambiguousVideoExts.has(video.extension) || hasVideoEvidence(video.probe))
  onProgress({ phase:'metadata', folders, videos:accepted.length, total:accepted.length, current:'' })
  return { videos:accepted, warnings, truncated }
}

export function videoMime(extension: string): string {
  const ext = extension.toLocaleLowerCase()
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.m4v') return 'video/x-m4v'
  if (ext === '.mpeg' || ext === '.mpg') return 'video/mpeg'
  if (ext === '.m2ts' || ext === '.ts') return 'video/mp2t'
  if (ext === '.avi') return 'video/x-msvideo'
  if (ext === '.wmv') return 'video/x-ms-wmv'
  if (ext === '.mkv') return 'video/x-matroska'
  return 'video/mp4'
}

export function imageMime(path: string): string {
  const ext = path.split('.').pop()?.toLocaleLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}
