import type { DriveStats } from 'gexplorer/widgets'

export type DriveDensity = 'expanded' | 'compact' | 'micro'

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function usedBytes(stat: DriveStats | undefined): number | null {
  if (!stat) return null
  if (finiteNumber(stat.used) && stat.used >= 0) return stat.used
  if (finiteNumber(stat.total) && finiteNumber(stat.free)) return Math.max(0, stat.total - stat.free)
  return null
}

export function usagePercent(stat: DriveStats | undefined): number | null {
  const used = usedBytes(stat)
  if (used === null || !finiteNumber(stat?.total) || stat.total <= 0) return null
  return Math.round(Math.max(0, Math.min(1, used / stat.total)) * 100)
}

export function formatBytes(value: number | undefined | null): string {
  if (!finiteNumber(value) || value < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let unit = 0
  let amount = value
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit++
  }
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function usageTone(percent: number | null): 'normal' | 'warning' | 'critical' | 'unknown' {
  if (percent === null) return 'unknown'
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'warning'
  return 'normal'
}

function fits(width: number, height: number, count: number, minWidth: number, minHeight: number, gap: number): boolean {
  if (!width || !height) return true
  const columns = Math.max(1, Math.min(count, Math.floor((width + gap) / (minWidth + gap))))
  const rows = Math.ceil(count / columns)
  return rows * minHeight + Math.max(0, rows - 1) * gap <= height
}

export function chooseDensity(
  context: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'dialog',
  width: number,
  height: number,
  driveCount: number,
): DriveDensity {
  const count = Math.max(1, driveCount)
  if (context === 'toolbar') {
    const perDrive = width / count
    if ((height > 0 && height < 40) || (perDrive > 0 && perDrive < 62)) return 'micro'
    return perDrive > 0 && perDrive < 128 ? 'compact' : 'expanded'
  }
  if (context === 'sidebar') return 'compact'
  if (fits(width, height, count, 154, 70, 8)) return 'expanded'
  if (fits(width, height, count, 104, 46, 5)) return 'compact'
  return 'micro'
}
