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
import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import type { WidgetSdk, FsPropertiesItem, MediaInfoItem, MediaProbe, FsHashRun } from 'gexplorer/widgets'
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
}>()

// ── Tabs (0.12.1): always General first ───────────────────────────────────────
type Tab = 'general' | 'details' | 'permissions' | 'checksums'
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
const dirty = () => attrDirty.value || permsDraft.dirty.value
async function saveAll(): Promise<void> {
  await saveAttrs()
  await permsDraft.save()
}
function discardAll(): void {
  discardAttrs()
  permsDraft.discard()
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
          <dt>Name</dt><dd class="ipw-strong" :title="paths[0]">{{ baseName(paths[0]) }}</dd>
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
        </dl>
        <p v-if="item.limited" class="ipw-note">This item needs administrator rights: only its size and dates are shown.</p>
      </section>

      <section v-if="item.attributes">
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
.ipw-compare input {
  flex: 1 1 auto; min-width: 0; padding: 3px 6px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 4%, transparent); color: inherit; font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px;
}
</style>
