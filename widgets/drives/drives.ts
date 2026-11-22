import type { DriveStats, FsVolumeInfo } from 'gexplorer/widgets'

export type DriveDensity = 'detailed' | 'expanded' | 'compact' | 'micro'

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

/**
 * Each density's card at 100 % text (Widget.vue's CSS): the widget's padding, a card's least width and height, the
 * gap between cards. 0.7.8: the heights are the real content (lines at line-height 1.25: expanded 20 padding + 2 border
 * + 16.25 name + 6 + 6 bar + 6 + 13.75 capacity = 70, plus 2 to spare), and the padding is taken off the box first.
 */
export const DENSITY_BOXES = {
  // 0.8.0: a card of medium width: the donut (44) beside the name and the capacity, the spec and the device under them:
  // 20 + 2 + 44 + 2 × (4 + 13.75) = 101.5. Wide (Widget.vue's container query): the donut beside all four lines.
  detailed: { padding: 8, minWidth: 160, minHeight: 104, gap: 8 },
  expanded: { padding: 8, minWidth: 154, minHeight: 72, gap: 8 },
  compact: { padding: 5, minWidth: 104, minHeight: 40, gap: 5 },
} as const

function fits(width: number, height: number, count: number, box: { padding: number; minWidth: number; minHeight: number; gap: number }): boolean {
  if (!width || !height) return true
  const innerWidth = width - 2 * box.padding
  const innerHeight = height - 2 * box.padding
  if (innerWidth < box.minWidth) return false   // 0.8.0: not even one card wide
  const columns = Math.max(1, Math.min(count, Math.floor((innerWidth + box.gap) / (box.minWidth + box.gap))))
  const rows = Math.ceil(count / columns)
  return rows * box.minHeight + Math.max(0, rows - 1) * box.gap <= innerHeight
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
  if (context === 'sidebar' || context === 'dialog') return 'compact'   // 0.7.3: the file dialog as the sidebar
  // 0.8.0: only the grid (and a page) has room for the details (the toolbar, the sidebar and the dialog returned above)
  if (fits(width, height, count, DENSITY_BOXES.detailed)) return 'detailed'
  if (fits(width, height, count, DENSITY_BOXES.expanded)) return 'expanded'
  if (fits(width, height, count, DENSITY_BOXES.compact)) return 'compact'
  return 'micro'
}

// ── 0.8.0: the detailed density's lines (sdk.fsVolumeInfo) ─────────────────────────────────────────────────────────

const BUS_NAMES: Record<string, string> = {
  usb: 'USB', sata: 'SATA', nvme: 'NVMe', sd: 'SD card', mmc: 'MMC', scsi: 'SCSI', sas: 'SAS', ata: 'ATA',
  atapi: 'ATAPI', raid: 'RAID', iscsi: 'iSCSI', virtual: 'Virtual', spaces: 'Storage Spaces', '1394': 'FireWire',
  fibre: 'Fibre Channel', ufs: 'UFS',
}

/** The connector's usual name ("NVMe", "USB"); null when unknown. */
export function busName(bus: string | null | undefined): string | null {
  if (!bus) return null
  return BUS_NAMES[bus.toLowerCase()] ?? null
}

/** How the drive is connected and what it is: "NVMe SSD", "USB HDD", "SATA", "SSD"; null when nothing is known. */
export function hardwareText(info: Pick<FsVolumeInfo, 'kind' | 'device' | 'type'>): string | null {
  const kind = info.kind === 'ssd' ? 'SSD' : info.kind === 'hdd' ? 'HDD' : null
  const bus = busName(info.device?.bus)
  if (info.type === 'network') return 'Network'
  if (info.type === 'optical') return bus ? `${bus} optical` : 'Optical'
  return [bus, kind].filter(Boolean).join(' ') || null
}

/** The spec line: "NTFS · GPT · NVMe SSD · BitLocker" (what is known, in that order). */
export function specText(info: Pick<FsVolumeInfo, 'fileSystem' | 'partition' | 'kind' | 'device' | 'type' | 'bitLocker'>): string {
  const style = info.partition && info.partition.style !== 'RAW' ? info.partition.style : null
  const locked = info.bitLocker === 'on' || info.bitLocker === 'locked' ? 'BitLocker' : null
  return [info.fileSystem, style, hardwareText(info), locked].filter(Boolean).join(' · ')
}

/** The device's name: vendor and product, without the vendor twice ("Samsung SSD 980 PRO 1TB"); null when unknown. */
export function deviceText(info: Pick<FsVolumeInfo, 'device' | 'remotePath'>): string | null {
  if (info.remotePath) return info.remotePath
  const vendor = info.device?.vendor?.trim() || ''
  const product = info.device?.product?.trim() || ''
  if (!product) return vendor || null
  if (!vendor || product.toLowerCase().startsWith(vendor.toLowerCase())) return product
  return `${vendor} ${product}`
}
