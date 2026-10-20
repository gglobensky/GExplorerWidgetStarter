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
  videos: number
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

const MAX_DIRECTORIES = 400
const MAX_VIDEOS = 1500
const MAX_ENTRIES_PER_DIRECTORY = 3000

function settled(source: ListingSource): Promise<ListingSnapshot> {
  return new Promise(resolve => {
    const current = source.snapshot()
    if (current.status !== 'loading') { resolve(current); return }
    const off = source.subscribe(snapshot => {
      if (snapshot.status !== 'loading') { off(); resolve(snapshot) }
    })
  })
}

async function listFolder(sdk: WidgetSdk, path: string, owner: string): Promise<{ entries: ListingEntry[]; truncated: boolean }> {
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
    const count = Math.min(snapshot.total, MAX_ENTRIES_PER_DIRECTORY)
    return {
      entries:count ? await source.rows(0, count, snapshot.version) : [],
      truncated:snapshot.total > count,
    }
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
): Promise<ScanResult> {
  const queue = roots.map(path => ({ path, sourceRoot:path }))
  const seen = new Set<string>()
  const videos: ScannedVideo[] = []
  const warnings: string[] = []
  let folders = 0
  let truncated = false

  while (queue.length && folders < MAX_DIRECTORIES && videos.length < MAX_VIDEOS) {
    if (isCancelled()) break
    const next = queue.shift()!
    const identity = next.path.toLocaleLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    onProgress({ phase:'folders', folders, videos:videos.length, current:next.path })
    try {
      const listed = await listFolder(sdk, next.path, `${owner}:${folders}`)
      folders += 1
      truncated ||= listed.truncated
      const images = listed.entries.filter(entry => entry.Kind === 'file' && coverExts.has(entry.Ext.toLocaleLowerCase()))
      for (const entry of listed.entries) {
        if (entry.Kind === 'dir') queue.push({ path:entry.FullPath, sourceRoot:next.sourceRoot })
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
        if (videos.length >= MAX_VIDEOS) { truncated = true; break }
      }
    } catch (error) {
      if (warnings.length < 8) warnings.push(`${next.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (queue.length || folders >= MAX_DIRECTORIES) truncated = true

  if (sdk.mediaInfo && videos.length && !isCancelled()) {
    for (let start = 0; start < videos.length; start += 100) {
      if (isCancelled()) break
      const batch = videos.slice(start, start + 100)
      onProgress({ phase:'metadata', folders, videos:start, current:batch[0].path })
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
  onProgress({ phase:'metadata', folders, videos:accepted.length, current:'' })
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
