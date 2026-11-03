import { createApp, h } from 'vue'
import Widget from '../Widget.vue'
import { setPreviewDrives, type DriveSnapshot, type DriveStats, type WidgetSdk } from './widgets-shim'

const params = new URLSearchParams(location.search)
const context = params.get('context') === 'sidebar' || params.get('context') === 'toolbar'
  ? params.get('context') as 'sidebar' | 'toolbar'
  : 'grid'
const defaults = context === 'toolbar'
  ? { width: 280, height: 48 }
  : context === 'sidebar'
    ? { width: 280, height: 150 }
    : { width: 560, height: 176 }
const width = Math.max(40, Number(params.get('width')) || defaults.width)
const height = Math.max(32, Number(params.get('height')) || defaults.height)
const count = Math.max(0, Math.min(12, Number(params.get('count')) || 4))

const samples: DriveSnapshot[] = [
  { root: 'C:\\', name: 'C:', label: 'Windows', display: 'Windows (C:)', fsType: 'NTFS', type: 'fixed', media: 'present', ready: true, role: 'data' },
  { root: 'D:\\', name: 'D:', label: 'Projects and archives', display: 'Projects and archives (D:)', fsType: 'NTFS', type: 'fixed', media: 'present', ready: true, role: 'data' },
  { root: 'E:\\', name: 'E:', label: 'Nearly full', display: 'Nearly full (E:)', fsType: 'exFAT', type: 'removable', media: 'present', ready: true, role: 'data' },
  { root: 'F:\\', name: 'F:', display: 'DVD drive (F:)', type: 'optical', media: 'none', ready: false, role: 'data' },
  { root: 'G:\\', name: 'G:', label: 'Backup', display: 'Backup (G:)', fsType: 'NTFS', type: 'network', media: 'present', ready: true, role: 'data' },
  { root: 'H:\\', name: 'H:', label: 'Camera', display: 'Camera (H:)', fsType: 'FAT32', type: 'removable', media: 'present', ready: true, role: 'data' },
]

const drives = Array.from({ length: count }, (_, index) => samples[index % samples.length])
  .map((drive, index) => index < samples.length ? drive : {
    ...drive,
    root: `${String.fromCharCode(73 + index - samples.length)}:\\`,
    name: `${String.fromCharCode(73 + index - samples.length)}:`,
    display: `Extra drive ${index + 1}`,
  })
setPreviewDrives(drives)

const tebibyte = 1024 ** 4
const stats = new Map<string, DriveStats>(drives.filter(drive => drive.media === 'present').map((drive, index) => {
  const percent = [52, 78, 94, 31, 67, 12][index % 6]
  const total = tebibyte
  const used = total * percent / 100
  return [drive.root, { root: drive.root, ready: true, total, used, free: total - used }]
}))

const previewRoot = document.querySelector<HTMLElement>('#widget')
if (previewRoot) {
  previewRoot.style.width = `${width}px`
  previewRoot.style.height = `${height}px`
}

const sdk: WidgetSdk = {
  fsDriveStats: async roots => roots.flatMap(root => stats.get(root) ? [stats.get(root)!] : []),
  navigate: async () => ({ ok: true }),
  onHostChange: () => () => {},
  lifecycle: () => ({ keepInterval: () => () => {}, onResume: () => () => {} }),
  settings: () => ({ values: { colorByUsage: params.get('color') !== 'off' } }),
}

function tooltipText(value: string | { content?: string; detail?: string } | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return [value.content, value.detail].filter(Boolean).join('\n')
}

createApp({
  setup() {
    return () => h(Widget, {
      placement: { context, size: { width, height, cols: 6, rows: 2 }, layout: 'grid' },
      config: { view: { showFsType: true, showCapacity: true } },
    })
  },
})
  .directive('gex-tooltip', {
    mounted(el, binding) { el.title = tooltipText(binding.value) },
    updated(el, binding) { el.title = tooltipText(binding.value) },
  })
  .provide('widgetSdk', sdk)
  .mount('#widget')
