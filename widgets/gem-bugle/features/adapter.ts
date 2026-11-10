export type FeatureTextFetch = (url: string) => Promise<{
  ok: boolean
  status: number
  statusText?: string
  text(): Promise<string>
}>

export type DailyFeatureBase = {
  kind: string
  provider: string
  dateKey: string
  sourceUrl: string
}

export type DailyFeatureAdapter<T extends DailyFeatureBase> = {
  id: string
  endpoint: string
  load: (fetchText: FeatureTextFetch, dateKey: string) => Promise<T>
}

export async function loadDailyFeature<T extends DailyFeatureBase>(adapter: DailyFeatureAdapter<T>, fetchText: FeatureTextFetch, dateKey: string): Promise<T> {
  return adapter.load(fetchText, dateKey)
}
