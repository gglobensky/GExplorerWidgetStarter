export type WidgetSdk = {
  networkFetch?: (url: string) => Promise<{ ok: boolean; status: number; statusText?: string; text(): Promise<string> }>
  configRead?: <T = any>(name: string) => Promise<T | null>
  configWrite?: (name: string, data: any) => Promise<void>
  openUrl?: (url: string, options?: { title?: string }) => Promise<{ ok: true }>
  setView?: (patch: Record<string, unknown>) => Promise<{ ok: true }>
  lifecycle?: () => any
  settings?: () => any
  ui?: () => any
}
