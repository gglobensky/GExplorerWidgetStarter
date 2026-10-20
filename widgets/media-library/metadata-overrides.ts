import type { WidgetSdk } from 'gexplorer/widgets'
import type { LibraryItem } from '../../shared/library-ui'

export type MediaMetadataOverride = {
  synopsis?: string
  genres?: string[]
}

type MetadataOverrideStore = {
  version: 1
  records: Record<string,MediaMetadataOverride>
}

type ConfigStorage = Pick<WidgetSdk,'configRead'|'configWrite'>

export const METADATA_OVERRIDE_STORE = 'metadata-overrides'

export async function loadMetadataOverrides(storage: ConfigStorage | undefined): Promise<Record<string,MediaMetadataOverride>> {
  if (!storage?.configRead) return {}
  const saved = await storage.configRead<MetadataOverrideStore>(METADATA_OVERRIDE_STORE)
  return saved?.version === 1 && saved.records && typeof saved.records === 'object' ? saved.records : {}
}

export async function saveMetadataOverrides(
  storage: ConfigStorage | undefined,
  records: Record<string,MediaMetadataOverride>,
): Promise<void> {
  if (!storage?.configWrite) return
  await storage.configWrite(METADATA_OVERRIDE_STORE,{ version:1, records } satisfies MetadataOverrideStore)
}

export function applyMetadataOverride(item: LibraryItem, override: MediaMetadataOverride | undefined): LibraryItem {
  if (!override) return item
  const genres = override.genres?.map(genre => genre.trim()).filter(Boolean)
  return {
    ...item,
    synopsis:override.synopsis ?? item.synopsis,
    genres:genres?.length ? genres : item.genres,
    primaryGenre:genres?.[0] || item.primaryGenre,
    localMetadataOverride:true,
  }
}
