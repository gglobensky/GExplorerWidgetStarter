import type { WidgetSdk } from 'gexplorer/widgets'

export const SCAN_HISTORY_STORE = 'scan-history'

type ScanHistoryStore = { version:1; pathsByOwner:Record<string,string[]> }
type ConfigStorage = Pick<WidgetSdk, 'configRead' | 'configWrite'>

export function mediaPathKey(path: string): string {
  return path.toLocaleLowerCase()
}

export function mergeScanHistory(previous: Iterable<string>, current: string[], complete: boolean): string[] {
  const next = new Set(current.map(mediaPathKey))
  if (!complete) for (const path of previous) next.add(mediaPathKey(path))
  return [...next].sort()
}

export async function loadScanHistory(storage: ConfigStorage | undefined, owner: string): Promise<string[]> {
  if (!storage?.configRead) return []
  const saved = await storage.configRead<ScanHistoryStore>(SCAN_HISTORY_STORE)
  return saved?.version === 1 && Array.isArray(saved.pathsByOwner?.[owner])
    ? mergeScanHistory([],saved.pathsByOwner[owner],true)
    : []
}

export async function saveScanHistory(storage: ConfigStorage | undefined, owner: string, paths: string[]): Promise<void> {
  if (!storage?.configWrite) return
  const saved = storage.configRead
    ? await storage.configRead<ScanHistoryStore>(SCAN_HISTORY_STORE)
    : null
  await storage.configWrite(SCAN_HISTORY_STORE, {
    version:1,
    pathsByOwner:{ ...(saved?.pathsByOwner ?? {}), [owner]:mergeScanHistory([],paths,true) },
  } satisfies ScanHistoryStore)
}
