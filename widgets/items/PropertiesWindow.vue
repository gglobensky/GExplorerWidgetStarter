<script setup lang="ts">
// widgets/items/PropertiesWindow.vue
//
// NEW (0.12.0, GEM Shell 2026-11-05, H4b P3; claude/properties-window-design.md): the Properties window. Opened by
// Widget.vue (openProperties) in sdk.ui().openWindow: GEM Shell draws the frame ("GExplorer — <name>", drag, Fold
// into the operations tray, Close) and, since 0.12.1, its Discard / Save footer (saveFooter); this is its content,
// reading everything as this widget. 0.12.1: in TABS (always opening on General), so the window needs no scrollbar;
// the attribute boxes are a DRAFT (props.setDraft): nothing changes before Save, Discard puts them back, and closing
// with changes asks (GEM Shell's question).
//   General      name, type, location (Show: reveals it in this pane), size and size on disk, dates, link target
//   Attributes   read-only (files) and hidden (Windows) as boxes (fsSetAttributes: a Write grant on the item); the
//                others as plain words
//   Media        fs:mediaInfo (the OS's properties), plus media:probe's exact streams when ffmpeg is installed
//   Permissions  0.13.0: PermissionsTab.vue, EDITABLE (a draft in permissionsDraft.ts, saved by the same footer):
//                your access, the owner, who may use it in five words, Advanced (denied rows, inheritance, where
//                a folder's row applies; Linux: the mode). Older GEM Shell (no fsPermissions): the old read-only list
//   Checksums    SHA-256 and MD5 on demand (fsHash: progress, Stop), a field to compare one you paste
// Several items: how many, files / folders, the files' total size, where they are.
// A folder's size and contents: TODO(indexer), said in the window (never walked here).
// 0.16.0 (GEM Shell 2026-11-13, drive properties; claude/drive-properties-design.md):
//   Name         a field in the window's draft for files, folders and drives (saved with the footer, after the
//                attributes and permissions, which apply to the old path): fsRename, or a drive's label
//                (fsSetVolumeLabel). Checked as you type. The folder shown can't be renamed from here.
//   A drive      its own General (type, drive, share, file system, the space used as a pie, Windows' tools: Clean
//                up…, Optimize… / Defragment… for a hard disk) and a Hardware tab (device, bus, partition, serial,
//                what its file system supports, BitLocker read-only): fsVolumeInfo.
import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import type { WidgetSdk, FsPropertiesItem, MediaInfoItem, MediaProbe, FsHashRun, FsVolumeInfo } from 'gexplorer/widgets'
import { usePermissionsDraft } from './permissionsDraft'
import PermissionsTab from './PermissionsTab.vue'

const props = defineProps<{
  /** The items (or the folder shown). */
  paths: string[]
  /** How many in all (paths may be a sample until `more` answers). */
  count: number
  /** The folder shown (a right-click on empty space). */
  folder: boolean
  /** Asked from another widget's file menu (its name). */
  from?: string
  /** All the selected paths, when paths is a sample (Widget.vue resolves them). */
  more?: () => Promise<string[]>
  close: () => void
  /** 0.12.1: GEM Shell's save footer (openWindow saveFooter): this window's one draft. Older GEM Shell: absent. */
  setDraft?: (draft: { dirty: () => boolean; save: () => Promise<void>; discard: () => void } | null) => void
  /** 0.16.0: the window's title after a rename (Widget.vue: the window handle's setTitle). */
  retitle?: (title: string) => void
}>()

// ── Tabs (0.12.1): always General first ───────────────────────────────────────
type Tab = 'general' | 'hardware' | 'details' | 'permissions' | 'checksums'
const tab = ref<Tab>('general')

const sdk = inject<WidgetSdk>('widgetSdk')!

// ── The facts ──────────────────────────────────────────────────────────────────
const paths = ref<string[]>([...props.paths])
const items = ref<FsPropertiesItem[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const single = computed(() => paths.value.length === 1 && props.count <= 1)
const item = computed<FsPropertiesItem | null>(() => single.value ? items.value[0] ?? null : null)
const isFile = computed(() => !!item.value && item.value.exists !== false && !item.value.isDir)

// ── 0.16.0: a drive (GEM Shell 2026-11-13) ─────────────────────────────────────────
/** A drive's root ("C:\", "\\server\share\"): the window shows the drive itself. */
function isDriveRoot(p: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(p) || /^\\\\[^\\/]+[\\/][^\\/]+[\\/]?$/.test(p)
}
const isDrive = computed(() => single.value && !!paths.value[0] && isDriveRoot(paths.value[0]))
const volume = ref<FsVolumeInfo | null>(null)
const volumeError = ref<string | null>(null)

async function loadVolume(): Promise<void> {
  if (!isDrive.value) return
  if (!sdk.fsVolumeInfo) { volumeError.value = 'This GEM Shell can\'t describe drives yet.'; return }
  try {
    volume.value = await sdk.fsVolumeInfo(paths.value[0])
    volumeError.value = null
  } catch (err: any) {
    volumeError.value = `Couldn't read the drive: ${err?.message ?? err}`
  }
}

const driveType = computed(() => {
  const v = volume.value
  if (!v) return 'Drive'
  switch (v.type) {
    case 'fixed': return v.kind === 'ssd' ? 'Local disk (SSD)' : v.kind === 'hdd' ? 'Local disk (hard disk)' : 'Local disk'
    case 'removable': return v.device?.bus === 'usb' ? 'USB drive' : v.device?.bus === 'sd' || v.device?.bus === 'mmc' ? 'Memory card' : 'Removable drive'
    case 'floppy': return 'Floppy disk'
    case 'optical': return 'CD / DVD drive'
    case 'network': return 'Network drive'
    case 'ram': return 'RAM disk'
    default: return 'Drive'
  }
})

/** The space used, 0..1 (null: not known). */
const usedFraction = computed(() => {
  const v = volume.value
  return v && v.total && v.total > 0 && v.used != null ? Math.min(1, Math.max(0, v.used / v.total)) : null
})
// The pie: a circle's stroke (r = 15.9155: its length is 100)
const pieDash = computed(() => {
  const f = usedFraction.value ?? 0
  return `${(f * 100).toFixed(2)} ${(100 - f * 100).toFixed(2)}`
})
/** The Drives widget's colours: amber above 75 % used, red above 90 %. */
const spaceTone = computed(() => {
  const f = usedFraction.value
  return f == null ? '' : f >= 0.9 ? 'critical' : f >= 0.75 ? 'warning' : 'normal'
})

const BUS_NAMES: Record<string, string> = {
  usb: 'USB', sata: 'SATA', nvme: 'NVMe', sd: 'SD card', mmc: 'MMC', scsi: 'SCSI', sas: 'SAS', ata: 'ATA', atapi: 'ATAPI',
  raid: 'RAID', iscsi: 'iSCSI', virtual: 'Virtual disk', spaces: 'Storage Spaces', '1394': 'FireWire',
  fibre: 'Fibre Channel', ufs: 'UFS', unknown: 'Unknown',
}
const deviceName = computed(() => [volume.value?.device?.vendor, volume.value?.device?.product].filter(Boolean).join(' '))
const busText = computed(() => BUS_NAMES[volume.value?.device?.bus ?? 'unknown'] ?? volume.value?.device?.bus ?? 'Unknown')
const kindText = computed(() => ({ ssd: 'Solid-state drive (SSD)', hdd: 'Hard disk', network: 'Network', unknown: 'Unknown' } as const)[volume.value?.kind ?? 'unknown'])
const partitionText = computed(() => {
  const p = volume.value?.partition
  return p ? `${p.typeName ?? p.type} (${p.style}, partition ${p.number})` : ''
})
const bitLockerText = computed(() => ({ on: 'On', off: 'Off', locked: 'On, locked', unknown: 'Unknown' } as const)[volume.value?.bitLocker ?? 'unknown'])
const featureWords = computed(() => {
  const f = volume.value?.features
  if (!f) return []
  const words: [boolean, string][] = [
    [f.permissions, 'permissions'], [f.compression, 'compression'], [f.encryption, 'encryption (EFS)'],
    [f.quotas, 'quotas'], [f.hardLinks, 'hard links'], [f.sparse, 'sparse files'], [f.streams, 'alternate data streams'],
  ]
  const out = words.filter(([on]) => on).map(([, w]) => w)
  if (f.compressedVolume) out.push('compressed as a whole')
  if (f.readOnly) out.push('read-only')
  return out
})

const toolBusy = ref(false)
async function openTool(tool: 'cleanup' | 'optimize'): Promise<void> {
  const p = paths.value[0]
  if (!p || !sdk.volumeTool || toolBusy.value) return
  actionError.value = null
  toolBusy.value = true
  try { await sdk.volumeTool(p, tool) }
  catch (err: any) { actionError.value = err?.message ?? String(err) }
  finally { toolBusy.value = false }
}

// ── 0.16.0: the name, part of the window's draft (saved with GEM Shell's footer, like the attributes) ──────────
const nameId = `ipw-name-${Math.random().toString(36).slice(2, 10)}`
/** What the user typed; null: unchanged. */
const nameDraft = ref<string | null>(null)
const currentName = computed(() => isDrive.value ? (volume.value?.label ?? '') : baseName(paths.value[0] ?? ''))
const nameShown = computed(() => nameDraft.value ?? currentName.value)
const nameDirty = computed(() => nameDraft.value !== null && nameDraft.value !== currentName.value)
const canRename = computed(() => {
  if (!props.setDraft || !single.value || !item.value || item.value.exists === false) return false
  if (isDrive.value) return !!volume.value?.canLabel && !!sdk.fsSetVolumeLabel
  return !!sdk.fsRename && !props.folder && !item.value.limited
})
/** Why the name can't be changed here (its tooltip). */
const renameHint = computed(() => {
  if (canRename.value || !item.value) return ''
  if (isDrive.value) return volume.value && !volume.value.canLabel ? 'This drive can\'t be renamed (a disc, a network share, or not ready).' : ''
  if (props.folder) return 'This is the folder shown: rename it from the folder that holds it.'
  if (item.value.limited) return 'It needs administrator rights: rename it in the list (F2).'
  return ''
})
const isWindows = computed(() => (sdk.platform?.() ?? 'win32') === 'win32')

/** What's wrong with the name typed (null: fine, or unchanged). */
const nameProblem = computed<string | null>(() => {
  if (!nameDirty.value) return null
  const v = nameDraft.value ?? ''
  if (isDrive.value) {
    const r = volume.value?.labelRules
    if (!r) return null
    const s = v.trim()
    if (s.length > r.maxLength) return `A drive name here is at most ${r.maxLength} characters.`
    const bad = [...s].find(c => r.forbidden.includes(c) || c.charCodeAt(0) < 32)
    return bad ? `A drive name here can't contain ${bad.charCodeAt(0) < 32 ? 'control characters' : bad}.` : null
  }
  if (!v.trim()) return 'A name is needed.'
  if (!isWindows.value) return v.includes('/') ? 'A name can\'t contain /.' : null
  if (/[\\/:*?"<>|\x00-\x1f]/.test(v)) return 'A name can\'t contain \\ / : * ? " < > |'
  if (/[. ]$/.test(v)) return 'A name can\'t end with a dot or a space.'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(v)) return 'Windows keeps this name for itself.'
  if (v.length > 255) return 'A name is at most 255 characters.'
  return null
})

function onNameInput(ev: Event): void {
  nameDraft.value = (ev.target as HTMLInputElement).value
  actionError.value = null
}
/** A file's name is selected up to its extension, as in the list. */
function onNameFocus(ev: FocusEvent): void {
  const el = ev.target as HTMLInputElement
  const dot = !isDrive.value && isFile.value ? el.value.lastIndexOf('.') : -1
  requestAnimationFrame(() => { try { el.setSelectionRange(0, dot > 0 ? dot : el.value.length) } catch { /* gone */ } })
}
function discardName(): void { nameDraft.value = null }

/** Renames it (the last of the window's changes: the others apply to the old path). Throws for the footer. */
async function saveName(): Promise<void> {
  if (!nameDirty.value) return
  if (nameProblem.value) throw new Error(nameProblem.value)
  const p = paths.value[0]
  const value = nameDraft.value ?? ''
  try {
    if (isDrive.value) {
      await sdk.fsSetVolumeLabel!(p, value)
      nameDraft.value = null
      await loadVolume()
      const v = volume.value
      props.retitle?.(v ? (v.label ? `${v.label} (${v.name})` : v.name) : p)
    } else {
      const parent = parentOf(p)
      const sep = parent.includes('\\') || /^[A-Za-z]:/.test(parent) ? '\\' : '/'
      const newPath = /[\\/]$/.test(parent) ? parent + value : parent + sep + value
      const res = await sdk.fsRename!(p, newPath)
      if (res && res.ok === false) throw new Error(res.error || 'it could not be renamed.')
      paths.value = [newPath]
      nameDraft.value = null
      props.retitle?.(value)
      await loadFacts()
    }
  } catch (err: any) {
    if (err?.code === 'E_CANCELLED') throw new Error('it kept its name.')
    throw new Error(err?.code === 'E_PERMISSION' ? 'the permission was not granted.' : String(err?.message ?? err))
  }
}

async function loadFacts(): Promise<void> {
  if (!sdk.fsProperties) { loadError.value = 'This widget can\'t read properties (it needs the Metadata capability).'; loading.value = false; return }
  try {
    items.value = await sdk.fsProperties(paths.value)
    loadError.value = null
  } catch (err: any) {
    loadError.value = `Couldn't read the properties: ${err?.message ?? err}`
  } finally {
    loading.value = false
  }
}

function baseName(p: string): string {
  const t = p.replace(/[\\/]+$/, '')
  const name = t.slice(Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/')) + 1)
  return name || p
}
function parentOf(p: string): string {
  const t = p.replace(/[\\/]+$/, '')
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'))
  if (i < 0) return ''
  const dir = t.slice(0, i)
  return /^[A-Za-z]:$/.test(dir) ? dir + '\\' : dir || '/'
}
function extOf(p: string): string {
  const n = baseName(p)
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i + 1).toLowerCase() : ''
}

const typeLabel = computed(() => {
  const it = item.value
  if (!it) return ''
  if (it.exists === false) return 'Not found'
  if (it.isDir) return it.isLink ? 'Link to a folder' : (/^[A-Za-z]:[\\/]?$/.test(paths.value[0]) ? 'Drive' : 'Folder')
  const ext = extOf(paths.value[0])
  const base = ext ? `${ext.toUpperCase()} file` : 'File'
  return it.isLink ? `Link (${base})` : base
})

// ── Formatting ─────────────────────────────────────────────────────────────────
const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB']
function shortBytes(n: number): string {
  if (n < 1024) return `${n.toLocaleString()} ${n === 1 ? 'byte' : 'bytes'}`
  let v = n
  let u = 0
  while (v >= 1024 && u < UNITS.length - 1) { v /= 1024; u++ }
  return `${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 })} ${UNITS[u]}`
}
function bytes(n: number | null | undefined): string {
  if (typeof n !== 'number' || n < 0) return '—'
  return n < 1024 ? shortBytes(n) : `${shortBytes(n)} (${n.toLocaleString()} bytes)`
}
function when(ms: number | null | undefined): string {
  return typeof ms === 'number' ? new Date(ms).toLocaleString() : '—'
}
function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
function bitrate(bps: number): string {
  return bps >= 1_000_000 ? `${(bps / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} Mb/s` : `${Math.round(bps / 1000).toLocaleString()} kb/s`
}

// ── Show (the location in this pane) ─────────────────────────────────────────
async function showIt(): Promise<void> {
  const p = paths.value[0]
  if (!p || !sdk.reveal) return
  const r = await sdk.reveal(p)
  if (!r.ok) actionError.value = r.reason === 'not-found' ? 'It no longer exists.' : 'Couldn\'t show it here.'
}

// ── Attributes ───────────────────────────────────────────────────────────────
const attrBusy = ref(false)
const actionError = ref<string | null>(null)
const canEdit = computed(() => !!sdk.fsSetAttributes && !!item.value?.attributes && !item.value.limited)
const otherAttrs = computed(() => {
  const a = item.value?.attributes
  if (!a) return []
  const words: [boolean, string][] = [
    [a.system, 'System'], [a.archive, 'Archive'], [a.compressed, 'Compressed'], [a.encrypted, 'Encrypted'],
    [a.sparse, 'Sparse'], [a.offline, 'Offline'], [a.temporary, 'Temporary'], [a.notIndexed, 'Not indexed'], [a.reparse, 'Reparse point'],
  ]
  return words.filter(([on]) => on).map(([, w]) => w)
})

// 0.12.1: a draft. The boxes show the change; Save (GEM Shell's footer) applies what changed, in one call.
type AttrName = 'readOnly' | 'hidden'
const pendingAttrs = reactive<Partial<Record<AttrName, boolean>>>({})
const attrDirty = computed(() => Object.keys(pendingAttrs).length > 0)

function attrShown(name: AttrName): boolean {
  return pendingAttrs[name] ?? !!item.value?.attributes?.[name]
}

function setAttr(name: AttrName, ev: Event): void {
  const value = (ev.target as HTMLInputElement).checked
  actionError.value = null
  if (value === !!item.value?.attributes?.[name]) delete pendingAttrs[name]
  else pendingAttrs[name] = value
  if (!props.setDraft) void saveAttrs().catch(err => { actionError.value = err?.message ?? String(err) })   // older GEM Shell: no footer
}

function discardAttrs(): void {
  for (const k of Object.keys(pendingAttrs) as AttrName[]) delete pendingAttrs[k]
  actionError.value = null
}

/** Applies the boxes changed; throws (GEM Shell's footer shows why) and keeps them when it fails. */
async function saveAttrs(): Promise<void> {
  const p = paths.value[0]
  if (!attrDirty.value || !p || !sdk.fsSetAttributes) return
  attrBusy.value = true
  try {
    await sdk.fsSetAttributes(p, { ...pendingAttrs })
    discardAttrs()
    await loadFacts()
  } catch (err: any) {
    throw new Error(err?.code === 'E_PERMISSION' ? 'the permission was not granted.' : String(err?.message ?? err))
  } finally {
    attrBusy.value = false
  }
}

// ── Permissions (0.13.0): kept here so switching tabs keeps the draft ──────────
const permsDraft = usePermissionsDraft(sdk, () => single.value ? paths.value[0] ?? null : null, () => !!item.value?.isDir)
const permsShown = computed(() => permsDraft.canRead.value && (!!permsDraft.perms.value || !!permsDraft.loadError.value))
const oldPermsShown = computed(() => !permsDraft.canRead.value && !!item.value && !!(item.value.owner || item.value.access?.length || item.value.mode))

// The window's one draft (GEM Shell's footer): the attribute boxes, then the permissions
// 0.16.0: and the name, saved last (the others apply to the old path)
const dirty = () => attrDirty.value || permsDraft.dirty.value || nameDirty.value
async function saveAll(): Promise<void> {
  await saveAttrs()
  await permsDraft.save()
  await saveName()
}
function discardAll(): void {
  discardAttrs()
  permsDraft.discard()
  discardName()
}

// ── Media ──────────────────────────────────────────────────────────────────────
const media = ref<MediaInfoItem | null>(null)
const probe = ref<MediaProbe | null>(null)
const AV = new Set(['mp4', 'm4v', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'ts', 'm2ts', 'mpg', 'mpeg', 'flv', '3gp', 'ogv',
  'mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'wma', 'ac3', 'dts', 'mka'])

async function loadMedia(): Promise<void> {
  if (!isFile.value) return
  const p = paths.value[0]
  if (sdk.mediaInfo) {
    try { media.value = (await sdk.mediaInfo([p]))[0] ?? null } catch { media.value = null }
  }
  if (sdk.mediaProbe && AV.has(extOf(p))) {
    try { probe.value = await sdk.mediaProbe(p) } catch { probe.value = null }   // no ffmpeg: the OS's details only
  }
}

const mediaRows = computed<[string, string][]>(() => {
  const m = media.value
  const rows: [string, string][] = []
  if (!m) return rows
  if (m.width && m.height) rows.push(['Dimensions', `${m.width} × ${m.height}`])
  if (m.durationMs) rows.push(['Duration', duration(m.durationMs)])
  if (m.frameRate) rows.push(['Frame rate', `${m.frameRate.toLocaleString(undefined, { maximumFractionDigits: 3 })} fps`])
  if (m.videoFourCc) rows.push(['Video codec', m.videoFourCc])
  if (m.videoBitrate) rows.push(['Video bitrate', bitrate(m.videoBitrate)])
  if (m.audioBitrate) rows.push(['Audio bitrate', bitrate(m.audioBitrate)])
  if (m.audioChannels) rows.push(['Channels', m.audioChannels === 1 ? 'Mono' : m.audioChannels === 2 ? 'Stereo' : String(m.audioChannels)])
  if (m.sampleRateHz) rows.push(['Sample rate', `${(m.sampleRateHz / 1000).toLocaleString()} kHz`])
  if (m.bitDepth) rows.push(['Bit depth', String(m.bitDepth)])
  if (m.title) rows.push(['Title', m.title])
  if (m.artist) rows.push(['Artist', m.artist])
  if (m.album) rows.push(['Album', m.album])
  if (m.year) rows.push(['Year', String(m.year)])
  const camera = [m.cameraMake, m.cameraModel].filter(Boolean).join(' ')
  if (camera) rows.push(['Camera', camera])
  if (m.dateTaken) rows.push(['Taken', when(m.dateTaken)])
  if (m.exposureSeconds) rows.push(['Exposure', m.exposureSeconds < 1 ? `1/${Math.round(1 / m.exposureSeconds)} s` : `${m.exposureSeconds} s`])
  if (m.fNumber) rows.push(['Aperture', `f/${m.fNumber.toLocaleString(undefined, { maximumFractionDigits: 1 })}`])
  if (m.iso) rows.push(['ISO', String(m.iso)])
  if (m.focalLengthMm) rows.push(['Focal length', `${m.focalLengthMm.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm`])
  return rows
})

const probeRows = computed<[string, string][]>(() => {
  const p = probe.value
  if (!p) return []
  const rows: [string, string][] = [['Container', p.container]]
  if (p.bitRate) rows.push(['Overall bitrate', bitrate(p.bitRate)])
  const v = p.video
  if (v) rows.push(['Video', [v.codec, v.profile, `${v.bitDepth}-bit`, `${v.width} × ${v.height}`, v.fps ? `${v.fps.toLocaleString(undefined, { maximumFractionDigits: 3 })} fps` : null].filter(Boolean).join(', ')])
  p.audio.forEach((a, i) => rows.push([p.audio.length > 1 ? `Audio ${i + 1}` : 'Audio',
    [a.codec, a.profile, a.channels ? `${a.channels} ch` : null, a.language, a.title].filter(Boolean).join(', ')]))
  if (p.subtitles.length) rows.push(['Subtitles', p.subtitles.map(s => [s.language ?? '?', s.codec].join(' ')).join('; ')])
  return rows
})

// ── Checksums ─────────────────────────────────────────────────────────────────
const hashRun = ref<FsHashRun | null>(null)
const hashDone = ref(0)
const hashTotal = ref(-1)
const sha256 = ref<string | null>(null)
const md5 = ref<string | null>(null)
const hashError = ref<string | null>(null)
const hashStopped = ref(false)
const compareWith = ref('')

function startHash(): void {
  const p = paths.value[0]
  if (!p || !sdk.fsHash || hashRun.value) return
  sha256.value = md5.value = hashError.value = null
  hashStopped.value = false
  hashDone.value = 0
  hashTotal.value = -1
  const run = sdk.fsHash(p, { onProgress: (done, total) => { hashDone.value = done; hashTotal.value = total } })
  hashRun.value = run
  run.result.then(r => {
    if (r.stopped) hashStopped.value = true
    sha256.value = r.sha256 ?? null
    md5.value = r.md5 ?? null
  }).catch((err: any) => {
    hashError.value = err?.code === 'E_BUSY' ? 'Other checksums are running: try again in a moment.' : `Couldn't compute them: ${err?.message ?? err}`
  }).finally(() => { hashRun.value = null })
}

function stopHash(): void { hashRun.value?.cancel() }

const hashPercent = computed(() => hashTotal.value > 0 ? Math.min(100, Math.round(100 * hashDone.value / hashTotal.value)) : null)
const compareResult = computed<'sha256' | 'md5' | 'none' | null>(() => {
  const want = compareWith.value.replace(/[\s:-]/g, '').toLowerCase()
  if (!want || (!sha256.value && !md5.value)) return null
  if (want === sha256.value) return 'sha256'
  if (want === md5.value) return 'md5'
  return 'none'
})

const copied = ref<string | null>(null)
async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    setTimeout(() => { if (copied.value === what) copied.value = null }, 1500)
  } catch {
    actionError.value = 'Couldn\'t copy: select the text and press Ctrl+C.'
  }
}

// ── Several items ───────────────────────────────────────────────────────────────
const totals = computed(() => {
  let files = 0, folders = 0, size = 0, missing = 0
  for (const it of items.value) {
    if (it.exists === false || it.error) { missing++; continue }
    if (it.isDir) folders++
    else { files++; size += it.size ?? 0 }
  }
  const parents = new Set(paths.value.map(p => parentOf(p).toLowerCase()))
  return { files, folders, size, missing, where: parents.size === 1 ? parentOf(paths.value[0]) : null }
})
const partial = computed(() => !single.value && props.count > items.value.length)

// ── The tabs shown (General always; the others when they have something) ───────────
const tabs = computed<{ id: Tab; label: string }[]>(() => {
  const it = item.value
  const out: { id: Tab; label: string }[] = [{ id: 'general', label: 'General' }]
  if (isDrive.value && volume.value) out.push({ id: 'hardware', label: 'Hardware' })   // 0.16.0
  if (mediaRows.value.length || probeRows.value.length) out.push({ id: 'details', label: 'Details' })
  if (it && it.exists !== false && (permsShown.value || oldPermsShown.value)) out.push({ id: 'permissions', label: 'Permissions' })
  if (isFile.value && sdk.fsHash) out.push({ id: 'checksums', label: 'Checksums' })
  return out
})

onMounted(async () => {
  // 0.12.1: GEM Shell's footer saves / discards this window's changes (every tab's)
  props.setDraft?.({ dirty, save: saveAll, discard: discardAll })
  if (props.more && props.count > paths.value.length) {
    try {
      const all = await props.more()
      if (all.length) paths.value = all
    } catch (err) { console.warn('[items] Properties: the whole selection could not be read', err) }
  }
  await loadFacts()
  void loadVolume()   // 0.16.0: a drive
  void loadMedia()
  if (single.value && item.value?.exists !== false) void permsDraft.load()
})

onBeforeUnmount(() => {
  hashRun.value?.cancel()
  props.setDraft?.(null)
})
</script>

<template>
  <div class="ipw">
    <p v-if="from" class="ipw-note">Asked from {{ from }}.</p>
    <p v-if="loading" class="ipw-note">Reading…</p>
    <p v-else-if="loadError" class="ipw-error">{{ loadError }}</p>

    <!-- ── One item, in tabs (0.12.1) ────────────────────────────────────── -->
    <template v-else-if="item">
      <div v-if="tabs.length > 1" class="ipw-tabs" role="tablist">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" class="ipw-tab"
                :class="{ on: tab === t.id }" :aria-selected="tab === t.id" @click="tab = t.id">{{ t.label }}</button>
      </div>

      <template v-if="tab === 'general'">
      <section>
        <dl class="ipw-rows">
          <!-- 0.16.0: the name is part of the window's draft (Save in the footer) -->
          <dt><label :for="nameId">Name</label></dt>
          <dd>
            <input v-if="canRename" :id="nameId" class="ipw-name" :class="{ bad: !!nameProblem }" type="text" spellcheck="false"
                   :value="nameShown" :maxlength="isDrive ? (volume?.labelRules?.maxLength ?? 32) : 255"
                   :placeholder="isDrive ? 'No name' : ''" :aria-invalid="!!nameProblem || undefined"
                   @input="onNameInput" @focus="onNameFocus" />
            <span v-else class="ipw-strong" :title="renameHint || paths[0]">{{ isDrive ? (volume?.label || 'No name') : baseName(paths[0]) }}</span>
          </dd>
          <template v-if="nameProblem"><dt></dt><dd class="ipw-error">{{ nameProblem }}</dd></template>
          <template v-else-if="isDrive && nameDirty && volume?.labelRules?.upperCase"><dt></dt><dd class="ipw-muted">Saved in capitals (its file system's rule).</dd></template>
          <template v-if="isDrive">
            <dt>Type</dt><dd>{{ driveType }}</dd>
            <dt>Drive</dt><dd>{{ volume?.name ?? paths[0] }}</dd>
            <template v-if="volume?.remotePath"><dt>Share</dt><dd class="ipw-path" :title="volume.remotePath">{{ volume.remotePath }}</dd></template>
            <template v-if="volume?.fileSystem"><dt>File system</dt><dd>{{ volume.fileSystem }}</dd></template>
          </template>
          <template v-else>
          <dt>Type</dt><dd>{{ typeLabel }}</dd>
          <dt>Location</dt>
          <dd class="ipw-loc">
            <span class="ipw-path" :title="parentOf(paths[0])">{{ parentOf(paths[0]) || '—' }}</span>
            <button v-if="sdk.reveal && item.exists !== false && !folder" type="button" class="ipw-btn" title="Show it in this pane" @click="showIt">Show</button>
          </dd>
          <template v-if="item.isLink">
            <dt>Points to</dt><dd class="ipw-path" :title="item.linkTarget ?? ''">{{ item.linkTarget || 'Unknown' }}</dd>
          </template>
          <template v-if="isFile">
            <dt>Size</dt><dd>{{ bytes(item.size) }}</dd>
            <template v-if="item.sizeOnDisk != null"><dt>Size on disk</dt><dd>{{ bytes(item.sizeOnDisk) }}</dd></template>
          </template>
          <template v-else-if="item.isDir">
            <!-- TODO(indexer): a folder's size and contents (claude/properties-window-design.md, decision 5) -->
            <dt>Size</dt><dd class="ipw-muted">Folder size and contents come with the indexer (a later update).</dd>
          </template>
          <dt>Created</dt><dd>{{ when(item.created) }}</dd>
          <dt>Modified</dt><dd>{{ when(item.modified) }}</dd>
          <template v-if="item.accessed != null"><dt>Accessed</dt><dd>{{ when(item.accessed) }}</dd></template>
          </template>
        </dl>
        <p v-if="item.limited && !isDrive" class="ipw-note">This item needs administrator rights: only its size and dates are shown.</p>
      </section>

      <!-- 0.16.0: a drive's space and Windows' tools for it -->
      <section v-if="isDrive && volume">
        <p v-if="!volume.ready" class="ipw-note">{{ volume.bitLocker === 'locked' ? 'The drive is locked (BitLocker): unlock it in Windows to see what is on it.' : 'The drive isn\'t ready (no disc, or disconnected).' }}</p>
        <div v-else-if="usedFraction != null" class="ipw-space">
          <svg class="ipw-pie" viewBox="0 0 36 36" role="img" :aria-label="`${Math.round(usedFraction * 100)}% used`">
            <circle class="ipw-pie-free" cx="18" cy="18" r="15.9155" />
            <circle class="ipw-pie-used" :class="spaceTone" cx="18" cy="18" r="15.9155" :stroke-dasharray="pieDash" />
            <text x="18" y="20.5" text-anchor="middle" class="ipw-pie-text">{{ Math.round(usedFraction * 100) }}%</text>
          </svg>
          <dl class="ipw-rows">
            <dt><span class="ipw-key used" :class="spaceTone"></span>Used</dt><dd>{{ bytes(volume.used) }}</dd>
            <dt><span class="ipw-key free"></span>Free</dt><dd>{{ bytes(volume.free) }}</dd>
            <dt>Capacity</dt><dd>{{ bytes(volume.total) }}</dd>
          </dl>
        </div>
        <div v-if="volume.tools.length && sdk.volumeTool" class="ipw-tools">
          <button v-if="volume.tools.includes('cleanup')" type="button" class="ipw-btn" :disabled="toolBusy"
                  title="Windows' Disk Cleanup for this drive: temporary files, the Recycle Bin, old updates"
                  @click="openTool('cleanup')">Clean up…</button>
          <button v-if="volume.tools.includes('optimize')" type="button" class="ipw-btn" :disabled="toolBusy"
                  :title="volume.kind === 'hdd' ? 'Windows\' Optimize Drives: defragments this hard disk (pick it in the list there)' : 'Windows\' Optimize Drives: optimizes this drive (an SSD is trimmed; pick it in the list there)'"
                  @click="openTool('optimize')">{{ volume.kind === 'hdd' ? 'Defragment…' : 'Optimize…' }}</button>
          <span class="ipw-muted">Windows' own tools</span>
        </div>
      </section>
      <p v-if="isDrive && volumeError" class="ipw-error">{{ volumeError }}</p>

      <section v-if="item.attributes && !isDrive">
        <h3>Attributes</h3>
        <div class="ipw-checks">
          <label v-if="isFile" class="ipw-check" title="Programs may read it but not change it">
            <input type="checkbox" :checked="attrShown('readOnly')" :disabled="!canEdit || attrBusy" @change="setAttr('readOnly', $event)" />
            Read-only
          </label>
          <label class="ipw-check" title="Hidden in lists unless you show hidden files">
            <input type="checkbox" :checked="attrShown('hidden')" :disabled="!canEdit || attrBusy" @change="setAttr('hidden', $event)" />
            Hidden
          </label>
        </div>
        <p v-if="otherAttrs.length" class="ipw-muted">Also: {{ otherAttrs.join(', ') }}</p>
      </section>
      </template>

      <!-- 0.16.0: a drive's hardware -->
      <section v-if="tab === 'hardware' && volume">
        <dl class="ipw-rows">
          <template v-if="deviceName"><dt>Device</dt><dd>{{ deviceName }}</dd></template>
          <template v-if="volume.device"><dt>Connected by</dt><dd>{{ busText }}</dd></template>
          <template v-if="volume.device?.revision"><dt>Firmware</dt><dd>{{ volume.device.revision }}</dd></template>
          <dt>Kind</dt><dd>{{ kindText }}</dd>
          <template v-if="volume.partition">
            <dt>Partition</dt><dd>{{ partitionText }}</dd>
            <dt>Partition size</dt><dd>{{ bytes(volume.partition.length) }}</dd>
            <template v-if="volume.partition.systemReason"><dt>Kept by the OS</dt><dd>{{ volume.partition.systemReason }}</dd></template>
          </template>
          <template v-if="volume.serial"><dt>Serial number</dt><dd class="ipw-mono">{{ volume.serial }}</dd></template>
          <template v-if="volume.clusterSize"><dt>Cluster size</dt><dd>{{ bytes(volume.clusterSize) }}</dd></template>
          <template v-if="volume.maxNameLength"><dt>Longest name</dt><dd>{{ volume.maxNameLength }} characters</dd></template>
          <dt>BitLocker</dt><dd>{{ bitLockerText }}</dd>
        </dl>
        <template v-if="featureWords.length">
          <h3>Its file system supports</h3>
          <p>{{ featureWords.join(', ') }}</p>
        </template>
      </section>

      <section v-if="tab === 'details'">
        <dl class="ipw-rows">
          <template v-for="[k, v] in mediaRows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
        </dl>
        <template v-if="probeRows.length">
          <h4>Streams</h4>
          <dl class="ipw-rows">
            <template v-for="[k, v] in probeRows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
          </dl>
        </template>
      </section>

      <PermissionsTab v-if="tab === 'permissions' && permsShown" :d="permsDraft" :is-dir="!!item.isDir" />
      <section v-else-if="tab === 'permissions'">
        <dl class="ipw-rows">
          <template v-if="item.owner"><dt>Owner</dt><dd>{{ item.owner }}</dd></template>
          <template v-if="item.mode"><dt>Mode</dt><dd class="ipw-mono">{{ item.mode }}</dd></template>
        </dl>
        <table v-if="item.access?.length" class="ipw-acl">
          <thead><tr><th>Who</th><th>Access</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in item.access" :key="i" :class="{ deny: !r.allow }">
              <td :title="r.who">{{ r.who }}</td>
              <td>{{ r.allow ? '' : 'Denied: ' }}{{ r.rights }}</td>
              <td class="ipw-muted">{{ r.inherited ? 'inherited' : '' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="ipw-muted">Read-only here: this GEM Shell can't change them.</p>
      </section>

      <section v-if="tab === 'checksums'">
        <div class="ipw-hash-bar">
          <button v-if="!hashRun" type="button" class="ipw-btn" @click="startHash">{{ sha256 || md5 ? 'Compute again' : 'Compute SHA-256 and MD5' }}</button>
          <template v-else>
            <progress class="ipw-progress" :value="hashPercent ?? undefined" max="100"></progress>
            <span class="ipw-muted">{{ hashPercent != null ? `${hashPercent}%` : shortBytes(hashDone) }}</span>
            <button type="button" class="ipw-btn" @click="stopHash">Stop</button>
          </template>
        </div>
        <p v-if="hashStopped" class="ipw-muted">Stopped.</p>
        <p v-if="hashError" class="ipw-error">{{ hashError }}</p>
        <dl v-if="sha256 || md5" class="ipw-rows">
          <template v-if="sha256">
            <dt>SHA-256</dt>
            <dd class="ipw-hash"><span class="ipw-mono">{{ sha256 }}</span><button type="button" class="ipw-btn" @click="copy(sha256!, 'sha256')">{{ copied === 'sha256' ? 'Copied' : 'Copy' }}</button></dd>
          </template>
          <template v-if="md5">
            <dt>MD5</dt>
            <dd class="ipw-hash"><span class="ipw-mono">{{ md5 }}</span><button type="button" class="ipw-btn" @click="copy(md5!, 'md5')">{{ copied === 'md5' ? 'Copied' : 'Copy' }}</button></dd>
          </template>
        </dl>
        <label v-if="sha256 || md5" class="ipw-compare">
          <span>Compare with</span>
          <input v-model="compareWith" type="text" spellcheck="false" placeholder="Paste a checksum (Ctrl+V)" />
        </label>
        <p v-if="compareResult === 'sha256' || compareResult === 'md5'" class="ipw-ok">✓ It matches the {{ compareResult === 'sha256' ? 'SHA-256' : 'MD5' }}.</p>
        <p v-else-if="compareResult === 'none'" class="ipw-error">✗ It matches neither checksum.</p>
      </section>

      <p v-if="actionError" class="ipw-error">{{ actionError }}</p>
    </template>

    <!-- ── Several items ────────────────────────────────────────────────── -->
    <template v-else>
      <section>
        <h3>Selection</h3>
        <dl class="ipw-rows">
          <dt>Items</dt><dd class="ipw-strong">{{ count.toLocaleString() }}</dd>
          <dt>Files</dt><dd>{{ totals.files.toLocaleString() }}</dd>
          <dt>Folders</dt><dd>{{ totals.folders.toLocaleString() }}</dd>
          <dt>Files' size</dt><dd>{{ bytes(totals.size) }}</dd>
          <template v-if="totals.where"><dt>Location</dt><dd class="ipw-path" :title="totals.where">{{ totals.where }}</dd></template>
          <template v-if="totals.missing"><dt>Not found</dt><dd>{{ totals.missing.toLocaleString() }}</dd></template>
        </dl>
        <p v-if="totals.folders" class="ipw-muted">Folders' sizes come with the indexer (a later update).</p>
        <p v-if="partial" class="ipw-note">Counted from the first {{ items.length.toLocaleString() }} items of {{ count.toLocaleString() }}.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ipw {
  --ipw-muted: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent);
  display: flex; flex-direction: column; gap: 14px;
  padding: 10px 14px 14px; box-sizing: border-box;
  color: var(--fg, #e8e8e8); font-size: var(--local-font-sm, 12px);
}
.ipw section { display: flex; flex-direction: column; gap: 6px; }
/* 0.12.1: the tabs */
.ipw-tabs { display: flex; gap: 2px; margin: -2px 0 -4px; border-bottom: 1px solid var(--items-border, #ffffff1f); }
.ipw-tab {
  padding: 5px 10px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: inherit;
  font-size: 12px; opacity: .7; cursor: pointer;
}
.ipw-tab:hover { opacity: 1; }
.ipw-tab.on { opacity: 1; border-bottom-color: var(--accent, #4ea1ff); font-weight: 600; }
.ipw h3 { margin: 0; color: color-mix(in oklab, var(--fg, #e8e8e8) 62%, transparent); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.ipw h4 { margin: 4px 0 0; color: var(--ipw-muted); font-size: 11px; font-weight: 600; }
.ipw p { margin: 0; }
.ipw-note, .ipw-muted { color: var(--ipw-muted); font-size: 11px; }
.ipw-error { color: #f87171; font-size: 11px; }
.ipw-ok { color: #4ade80; font-size: 11px; }
.ipw-rows { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; }
.ipw-rows dt { color: var(--ipw-muted); }
.ipw-rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.ipw-strong { font-weight: 600; }
.ipw-mono { font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px; }
.ipw-loc, .ipw-hash { display: flex; align-items: center; gap: 6px; }
.ipw-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipw-hash .ipw-mono { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; user-select: text; }
.ipw-btn {
  flex: 0 0 auto; padding: 2px 8px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 6%, transparent); color: inherit; font-size: 11px; cursor: pointer;
}
.ipw-btn:hover { background: color-mix(in oklab, var(--fg, #fff) 12%, transparent); }
.ipw-checks { display: flex; gap: 16px; }
.ipw-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.ipw-check input { margin: 0; accent-color: var(--accent, #4ea1ff); }
.ipw-acl { width: 100%; border-collapse: collapse; font-size: 11px; }
.ipw-acl th { text-align: left; color: var(--ipw-muted); font-weight: 600; padding: 2px 6px 2px 0; }
.ipw-acl td { padding: 2px 6px 2px 0; border-top: 1px solid var(--items-border, #ffffff14); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipw-acl tr.deny td { color: #fca5a5; }
.ipw-hash-bar { display: flex; align-items: center; gap: 8px; }
.ipw-progress { flex: 1 1 auto; height: 8px; accent-color: var(--accent, #4ea1ff); }
.ipw-compare { display: flex; align-items: center; gap: 8px; }
.ipw-compare span { color: var(--ipw-muted); white-space: nowrap; }
/* 0.16.0: the name field, a drive's space */
.ipw-name {
  width: 100%; box-sizing: border-box; padding: 3px 6px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 4%, transparent); color: inherit; font: inherit; font-weight: 600;
}
.ipw-name:focus { outline: none; border-color: var(--accent, #4ea1ff); }
.ipw-name.bad { border-color: #f87171; }
.ipw-space { display: flex; align-items: center; gap: 16px; }
.ipw-pie { flex: 0 0 auto; width: 88px; height: 88px; transform: rotate(-90deg); }
.ipw-pie circle { fill: none; stroke-width: 6; }
.ipw-pie-free { stroke: color-mix(in oklab, var(--fg, #fff) 14%, transparent); }
.ipw-pie-used { stroke: var(--accent, #4ea1ff); stroke-dashoffset: 0; }
.ipw-pie-text { transform: rotate(90deg); transform-origin: 18px 18px; fill: currentColor; font-size: 7px; font-weight: 600; }
.ipw-pie-used.normal, .ipw-key.used.normal { stroke: #22c55e; background: #22c55e; }
.ipw-pie-used.warning, .ipw-key.used.warning { stroke: #f59e0b; background: #f59e0b; }
.ipw-pie-used.critical, .ipw-key.used.critical { stroke: #ef4444; background: #ef4444; }
.ipw-key { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 2px; background: var(--accent, #4ea1ff); }
.ipw-key.free { background: color-mix(in oklab, var(--fg, #fff) 14%, transparent); }
.ipw-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ipw-btn:disabled { opacity: .5; cursor: default; }
.ipw-compare input {
  flex: 1 1 auto; min-width: 0; padding: 3px 6px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 4%, transparent); color: inherit; font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px;
}
</style>
