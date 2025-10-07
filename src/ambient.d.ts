// Use Vue types when importing the host's shim.
declare module '/src/runtime/vue.ts' {
  export * from 'vue'
}

// Host IPC helpers (minimal surface mirrored for types).
declare module '/src/bridge/ipc.ts' {
  export type DirEntry = { name: string; fullPath: string }

  export function send<T = any>(type: string, payload?: any, timeoutMs?: number): Promise<T>

  export function fsValidate(path: string): Promise<{
    ok: boolean; exists: boolean; isDir: boolean; path: string; error?: string
  }>

  export function fsListDir(path: string): Promise<{
    ok: boolean; basePath?: string; entries: DirEntry[]; error?: string
  }>

  export function fsDriveStats(roots: string[]): Promise<Array<{
    root: string; ready: boolean; total: number; free: number; used: number; error?: string
  }>>
}

// Example host shared lib
declare module '/src/runtime/libs/dayjs.ts' {
  import dayjs from 'dayjs'
  export { dayjs }
}
