import type { WidgetSdk } from 'gexplorer/widgets'

export const MEDIA_SOURCES_STORE = 'media-sources'

type MediaSourcesStore = { version:1; sourcesByOwner:Record<string,string[]>; sources?:string[] }
type ConfigStorage = Pick<WidgetSdk, 'configRead' | 'configWrite'>

export function normalizeMediaSources(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const sources:string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue
    const identity = value.toLocaleLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    sources.push(value)
  }
  return sources
}

export async function loadMediaSources(storage: ConfigStorage | undefined, owner: string, fallback: string[]): Promise<string[]> {
  const normalizedFallback = normalizeMediaSources(fallback)
  if (!storage?.configRead) return normalizedFallback
  const saved = await storage.configRead<MediaSourcesStore>(MEDIA_SOURCES_STORE)
  const stored = saved?.version === 1
    ? saved.sourcesByOwner?.[owner] ?? saved.sources
    : undefined
  if (Array.isArray(stored)) return normalizeMediaSources(stored)
  if (normalizedFallback.length && storage.configWrite) {
    await storage.configWrite(MEDIA_SOURCES_STORE, {
      version:1,
      sourcesByOwner:{ ...(saved?.sourcesByOwner ?? {}), [owner]:normalizedFallback },
    } satisfies MediaSourcesStore)
  }
  return normalizedFallback
}

export async function saveMediaSources(storage: ConfigStorage | undefined, owner: string, sources: string[]): Promise<void> {
  if (!storage?.configWrite) return
  const saved = storage.configRead
    ? await storage.configRead<MediaSourcesStore>(MEDIA_SOURCES_STORE)
    : null
  await storage.configWrite(MEDIA_SOURCES_STORE, {
    version:1,
    sourcesByOwner:{ ...(saved?.sourcesByOwner ?? {}), [owner]:normalizeMediaSources(sources) },
  } satisfies MediaSourcesStore)
}
