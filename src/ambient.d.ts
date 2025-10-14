// Use Vue types when importing the host's shim.
declare module '/src/runtime/vue.ts' {
  export * from 'vue'
}

// Host IPC helpers (minimal surface mirrored for types).
declare module '/src/bridge/ipc.ts' {
  export type DirEntry = { name: string; fullPath: string }

  export function fsValidate(path: string): Promise<{
    ok: boolean; exists: boolean; isDir: boolean; path: string; error?: string
  }>

  export function fsListDir(path: string): Promise<{
    ok: boolean; basePath?: string; entries: DirEntry[]; error?: string
  }>

  export function fsListDirWithAuth(widgetType: string, widgetId: string, path: string): Promise<{
    ok: boolean; basePath?: string; entries: DirEntry[]; error?: string
  }>

  export function fsDriveStats(roots: string[]): Promise<Array<{
    root: string; ready: boolean; total: number; free: number; used: number; error?: string
  }>>
  
  export function fsOpen(path: string): Promise<{ ok: boolean; error?: string }>

  export function shortcutsProbe(paths: string[]): Promise<{
    results: Array<{ path: string; IconKey: string }>
  }>
}

// Network bridge (gated by permissions)
declare module '/src/bridge/network.ts' {
  export function networkFetch(
    widgetType: string,
    widgetId: string,
    url: string,
    options?: {
      method?: string
      headers?: Record<string, string>
      body?: string
    }
  ): Promise<{
    ok: boolean
    status: number
    statusText: string
    json: () => Promise<any>
    text: () => Promise<string>
  }>
}

// Consent service
declare module '/src/consent/service' {
  export function ensureConsent(
    widgetType: string,
    widgetId: string,
    path: string,
    caps: string[],
    options?: { afterDenied?: boolean }
  ): Promise<boolean>
}

// Example host shared lib
declare module '/src/runtime/libs/dayjs.ts' {
  import dayjs from 'dayjs'
  export { dayjs }
}