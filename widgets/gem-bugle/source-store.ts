import { BUGLE_SECTIONS, type BugleSource, type SourceDisplay, type SourceDocument, type SourceSection } from './model'

const DOCUMENT = 'sources-v1'
const sectionSet = new Set<string>(['auto', ...BUGLE_SECTIONS])

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function validSource(value: unknown): BugleSource | null {
  const source = record(value)
  if (typeof source.id !== 'string' || typeof source.feedUrl !== 'string' || typeof source.title !== 'string') return null
  if (!sectionSet.has(source.section) || !['headlines', 'summary'].includes(source.display)) return null
  return {
    id: source.id.slice(0, 100),
    feedUrl: source.feedUrl,
    ...(typeof source.siteUrl === 'string' ? { siteUrl: source.siteUrl } : {}),
    title: source.title.slice(0, 180),
    ...(source.customTitle === true ? { customTitle: true } : {}),
    ...(typeof source.description === 'string' ? { description: source.description.slice(0, 500) } : {}),
    ...(typeof source.language === 'string' ? { language: source.language.slice(0, 40) } : {}),
    section: source.section as SourceSection,
    display: source.display as SourceDisplay,
    enabled: source.enabled !== false,
    addedAt: Number.isFinite(source.addedAt) ? source.addedAt : Date.now(),
    ...(Number.isFinite(source.lastFetchedAt) ? { lastFetchedAt: source.lastFetchedAt } : {}),
    ...(Number.isFinite(source.lastCheckedAt) ? { lastCheckedAt: source.lastCheckedAt } : {}),
    ...(Number.isFinite(source.lastItemCount) ? { lastItemCount: Math.max(0, Math.floor(source.lastItemCount)) } : {}),
    ...(typeof source.lastError === 'string' && source.lastError.trim() ? { lastError: source.lastError.trim().slice(0, 300) } : {}),
  }
}

export async function loadSources(read?: <T = any>(name: string) => Promise<T | null>): Promise<BugleSource[]> {
  if (!read) return []
  try {
    const document = record(await read<SourceDocument>(DOCUMENT))
    return (Array.isArray(document.sources) ? document.sources : []).map(validSource).filter((source): source is BugleSource => !!source)
  } catch (error) {
    console.warn('[gem-bugle] could not read sources', error)
    return []
  }
}

export async function saveSources(sources: BugleSource[], write?: (name: string, data: any) => Promise<void>): Promise<void> {
  if (!write) throw new Error('GEM Shell did not provide configuration storage.')
  const document: SourceDocument = { version: 1, sources }
  await write(DOCUMENT, document)
}

export function sourceId(feedUrl: string): string {
  let hash = 2166136261
  for (let i = 0; i < feedUrl.length; i++) {
    hash ^= feedUrl.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `feed-${(hash >>> 0).toString(36)}`
}
