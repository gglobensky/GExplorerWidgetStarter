export type DriveType = 'fixed' | 'removable' | 'floppy' | 'optical' | 'network' | 'ram' | 'unknown'
export type DriveMedia = 'present' | 'none' | 'unknown'
export type DriveRole = 'data' | 'system' | 'policy-hidden'

export type DriveSnapshot = {
  root: string
  name: string
  label?: string
  display: string
  fsType?: string
  type: DriveType
  media: DriveMedia
  ready: boolean
  role: DriveRole
}

export type DriveStats = {
  root: string
  ready: boolean
  total: number
  free: number
  used: number
  error?: string
}

export type WidgetSdk = {
  fsDriveStats?: (roots: string[]) => Promise<DriveStats[]>
  navigate?: (root: string) => Promise<{ ok: true }>
  onHostChange?: (topic: 'drives', handler: () => void) => () => void
  lifecycle?: () => {
    keepInterval: (fn: () => void, ms: number) => () => void
    onResume: (fn: () => void) => () => void
  }
  settings?: () => { values: Readonly<Record<string, boolean>> }
}

let previewDrives: DriveSnapshot[] = []

export function setPreviewDrives(drives: DriveSnapshot[]): void {
  previewDrives = drives
}

export function getDrives(): DriveSnapshot[] {
  return previewDrives.map(drive => ({ ...drive }))
}
