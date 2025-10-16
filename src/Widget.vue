<script setup lang="ts">
import { ref, computed, watch } from '/runtime/vue.js'
import { fsListDir, fsValidate, fsListDirWithAuth, shortcutsProbe  } from '/src/bridge/ipc.ts'
import { loadIconPack, iconFor, ensureIconsFor } from '/src/icons/index.ts'
import { ensureConsent } from '/src/consent/service'

type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

const props = defineProps<{
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    size: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean
}>()

// Emit config changes back to parent (for saving)
const emit = defineEmits<{
  (e: 'updateConfig', config: any): void
}>()

type SortKey = 'name' | 'kind' | 'ext'
type SortDir = 'asc' | 'desc'

const sortKey = ref<SortKey>((props.config?.view?.sortKey as SortKey) || 'name')
const sortDir = ref<SortDir>((props.config?.view?.sortDir as SortDir) || 'asc')

const iconsTick = ref(0)


void loadIconPack()

function iconText(e: any) {
  return iconFor({ kind: e?.Kind, ext: e?.Ext, iconKey: e?.IconKey }, 32)
}
function iconIsImg(e: any) {
  const v = iconFor({ kind: e?.Kind, ext: e?.Ext, iconKey: e?.IconKey }, 32)
  return typeof v === 'string' && v.startsWith('data:image/')
}
function iconSrc(e: any) {
  return iconFor({ kind: e?.Kind, ext: e?.Ext, iconKey: e?.IconKey }, 32)
}

/* --- helpers for aligned SIZE + MODIFIED --- */
function sizeParts(bytes?: number | null): { num: string; unit: string } {
  if (bytes == null || bytes < 0) return { num: '', unit: '' }
  const units = ['B','KB','MB','GB','TB','PB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  const num = i === 0
    ? Math.round(n).toString()
    : (n < 10 ? n.toFixed(1) : Math.round(n).toString())
  return { num, unit: units[i] }
}

// Keep user’s 12/24h preference, but make components 2-digit for alignment
const hour12Pref = new Intl.DateTimeFormat().resolvedOptions().hour12 ?? false
const FMT_DATE = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
const FMT_TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: hour12Pref })

function modParts(ms?: number | null): { date: string; time: string } {
  if (ms == null || ms <= 0) return { date: '', time: '' }
  const d = new Date(ms)
  return { date: FMT_DATE.format(d), time: FMT_TIME.format(d) }
}

// style tokens (sm/md/lg)
function sizeTokens(Size?: string) {
  const s = (Size || 'md').toLowerCase()
  if (s === 'sm') return { padY: 8, padX: 10, radius: 8, gap: 6, font: 0.95, title: 600 }
  if (s === 'lg') return { padY: 14, padX: 14, radius: 12, gap: 10, font: 1.05, title: 650 }
  return { padY: 10, padX: 12, radius: 10, gap: 8, font: 1.0, title: 600 } // md
}

const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

const autoColumns = computed(() => {
  // If in sidebar, always use 1 column
  if (props.placement?.context === 'sidebar') return 1
  
  // Otherwise, calculate based on grid columns allocated
  const gridCols = props.placement?.size?.cols || 4
  
  // More grid space = more item columns
  if (gridCols <= 2) return 1
  if (gridCols <= 3) return 2
  if (gridCols <= 5) return 3
  if (gridCols <= 8) return 4
  return 5
})

const autoItemSize = computed(() => {
  const gridCols = props.placement?.size?.cols || 4
  
  // Small allocation = small items
  if (gridCols <= 3) return 'sm'
  if (gridCols <= 6) return 'md'
  return 'lg'
})

const merged = computed(() => ({
  rpath: String(cfg.value.data.rpath ?? ''),
  layout: String(cfg.value.view.layout ?? 'list'),
  columns: cfg.value.view.columns || autoColumns.value,
  itemSize: cfg.value.view.itemSize || autoItemSize.value,  // ← Auto-adjust
  showHidden: !!(cfg.value.view.showHidden ?? false),
  navigateMode: String(cfg.value.view.navigateMode ?? 'internal').toLowerCase(),
}))

const cwd = ref<string>('')
const entries = ref<Array<{ name: string; FullPath: string }>>([])
const loading = ref(false)
const error = ref('')

// bytes -> nice string
function formatBytes(n?: number | null) {
  if (n == null || isNaN(n)) return ''
  const units = ['B','KB','MB','GB','TB','PB']
  let x = Math.max(0, Number(n)), i = 0
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++ }
  return `${x.toFixed(i ? 1 : 0)} ${units[i]}`
}

// epoch ms / dateish -> local date+time
function formatDateISO(v?: number | string | Date | null) {
  if (v == null) return ''
  const d = typeof v === 'number' ? new Date(v) : (v instanceof Date ? v : new Date(v))
  return isNaN(d.getTime()) ? '' : d.toLocaleString()
}


// REPLACE the previous loadDir implementation with this
async function loadDir(path: string) {
  if (!path) { entries.value = []; return }
  loading.value = true
  error.value = ''
  try {
    // 1) Try normal list first (optimistic)
    let res = await fsListDir(path)

    // 2) If it failed, check for access denied
    if (!res?.ok) {
      const raw = String(res?.error || '')
      const msg = raw.toLowerCase()
      const accessDenied =
        msg.includes('access denied') ||
        msg.includes('unauthorized') ||
        msg.includes('e_access_denied') ||
        /access.*denied/.test(msg) ||
        /denied/.test(msg)

      if (accessDenied) {
        console.log('[items] Access denied → requesting consent…', { path, raw })

        // IMPORTANT: widget identity comes from the app/registry, not from the widget
        const widgetType = 'items'     // if you have it from props/def, use that instead
        const widgetId   = 'items'     // same note: prefer registry-provided id if available

        // Ask for minimal caps for listing
        const granted = await ensureConsent(widgetType, widgetId, path, ['Read', 'Metadata'], { afterDenied: true })
        if (!granted) {
          throw new Error('Permission not granted')
        }

        // Retry the same operation after consent
        res = await fsListDirWithAuth(widgetType, widgetId, path)
        if (!res?.ok) {
          throw new Error(res?.error || 'list failed after consent')
        }
      } else {
        throw new Error(res?.error || 'list failed')
      }
    }

    // 3) Process entries
    let list = Array.isArray((res as any).entries) ? (res as any).entries : []
    if (!merged.value.showHidden) {
      list = list.filter(e => !String(e?.Name || '').startsWith('.'))
    }
    entries.value = list.sort((a: any, b: any) =>
      String(a?.Name ?? '').localeCompare(String(b?.Name ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    )

    // 4) Per-shortcut icon keys
    const lnks = (entries.value as any[])
      .filter(e => e?.Kind === 'link' && e?.Ext === '.lnk' && (!e.IconKey || !String(e.IconKey).startsWith('link:')))
      .map(e => e.FullPath)

    if (lnks.length) {
      try {
        const r = await shortcutsProbe(lnks)
        const arr = (r?.results ?? []) as Array<{ path: string; IconKey: string }>
        if (arr.length) {
          const map = new Map(arr.map(x => [x.path, x.IconKey]))
          for (const e of entries.value as any[]) {
            const k = map.get(e.FullPath)
            if (k) e.IconKey = k
          }
        }
      } catch { /* ignore */ }
    }

    // 5) Fetch icons
    const n = await ensureIconsFor(
      (entries.value as any[]).map(e => ({ iconKey: e.IconKey })), 32
    )
    if (n > 0) iconsTick.value++

  } catch (e: any) {
    error.value = String(e?.message ?? e ?? 'Error')
    entries.value = []
  } finally {
    loading.value = false
  }
}



async function openEntry(FullPath: string) {
  if (!FullPath) return
  try {
    const v = await fsValidate(FullPath)
    const isDir = !!v?.isDir
    const preferTab =
      merged.value.navigateMode === 'tab' ||
      (merged.value.navigateMode !== 'internal' && typeof props.runAction === 'function')

    if (isDir) {
      if (preferTab) {
        props.runAction?.({ type: 'nav', to: FullPath })
      } else {
        cwd.value = FullPath
        await loadDir(cwd.value)
      }
      return
    }

    // ========== FILE OPENING (was missing!) ==========
    // For files, send 'open' action to the host
    const ext = String(v?.path || FullPath).split('.').pop()?.toLowerCase() || ''
    
    // Check if it's a .lnk shortcut
    if (ext === 'lnk') {
      // Let the host resolve and open the shortcut target
      props.runAction?.({ type: 'open', path: FullPath })
      return
    }
    
    // Regular file - open with default application
    props.runAction?.({ type: 'open', path: FullPath })

  } catch (err) {
    console.error('[items] openEntry failed:', err)
  }
}


// react when rpath arrives/changes
watch(
  () => merged.value.rpath,
  (next) => {
    if (next && next !== cwd.value) { cwd.value = next; loadDir(next) }
  },
  { immediate: true }
)

watch(
  () => [props.config?.view?.sortKey, props.config?.view?.sortDir],
  ([k, d]) => {
    if (k && (k === 'name' || k === 'kind' || k === 'ext')) sortKey.value = k
    if (d && (d === 'asc' || d === 'desc')) sortDir.value = d
  }
)

const S = computed(() => sizeTokens(merged.value.itemSize))
const KIND_ORDER: Record<string, number> = { dir: 0, link: 1, file: 2 }

function cmp(a: string, b: string) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/* remove this whole sorter and replace with: */
const sortedEntries = computed(() => {
  const data = Array.isArray(entries.value) ? entries.value.slice() : []
  const k = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1

  const cmp = (a: string, b: string) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })

  data.sort((A: any, B: any) => {
    if (k === 'name') {
      return cmp(A?.Name, B?.Name) * dir
    }
    if (k === 'ext') {
      const c = cmp(A?.Ext || '', B?.Ext || '')
      return (c || cmp(A?.Name, B?.Name)) * dir
    }
    if (k === 'size') {
      const sa = (A?.Size ?? 0) as number
      const sb = (B?.Size ?? 0) as number
      const c = (sa === sb ? 0 : (sa < sb ? -1 : 1))
      return (c || cmp(A?.Name, B?.Name)) * dir
    }
    if (k === 'modified') {
      const ta = A?.ModifiedAt ? new Date(A.ModifiedAt).getTime() : 0
      const tb = B?.ModifiedAt ? new Date(B.ModifiedAt).getTime() : 0
      const c = (ta === tb ? 0 : (ta < tb ? -1 : 1))
      return (c || cmp(A?.Name, B?.Name)) * dir
    }
    return 0
  })

  return data
})


function onHeaderClick(nextKey: SortKey) {
  if (sortKey.value === nextKey) {
    sortDir.value = (sortDir.value === 'asc' ? 'desc' : 'asc')
  } else {
    sortKey.value = nextKey
    sortDir.value = 'asc'
  }
}

// theme → CSS vars for simple styling
const hostVars = computed(() => ({
  '--items-border': props.theme?.border || 'var(--border, #555)',
  '--items-fg':     props.theme?.fg || 'var(--fg, #eee)',
  '--items-bg':     props.theme?.bg || 'var(--surface-2, transparent)',
  '--items-header-sep': props.theme?.headerSep || 'rgba(255,255,255,.22)', // NEW
}) as Record<string, string>)

function updateColumns(delta: number) {
  if (!props.editMode) return
  
  const current = merged.value.columns
  const newColumns = Math.max(1, Math.min(8, current + delta))
  
  // Update config
  const newConfig = {
    ...props.config,
    view: {
      ...props.config?.view,
      columns: newColumns
    }
  }
  
  emit('updateConfig', newConfig)
}

function cycleItemSize() {
  if (!props.editMode) return
  
  const sizes = ['sm', 'md', 'lg']
  const currentIdx = sizes.indexOf(merged.value.itemSize)
  const nextIdx = (currentIdx + 1) % sizes.length
  
  const newConfig = {
    ...props.config,
    view: {
      ...props.config?.view,
      itemSize: sizes[nextIdx]
    }
  }
  
  emit('updateConfig', newConfig)
}

function cycleLayout() {
  if (!props.editMode) return
  
  const layouts = ['list', 'grid', 'details']
  const currentIdx = layouts.indexOf(merged.value.layout)
  const nextIdx = (currentIdx + 1) % layouts.length
  
  const newConfig = {
    ...props.config,
    view: {
      ...props.config?.view,
      layout: layouts[nextIdx]
    }
  }
  
  emit('updateConfig', newConfig)
}
</script>

<template>
  <div class="items-root" :style="hostVars">
    <!-- Edit mode toolbar -->
    <div v-if="editMode" class="edit-toolbar">
      <div class="edit-group">
        <span class="edit-label">Layout:</span>
        <button class="edit-btn" @click="cycleLayout" :title="`Current: ${merged.layout}`">
          {{ merged.layout === 'list' ? '☰' : merged.layout === 'grid' ? '▦' : '▤' }}
        </button>
      </div>
      
      <div v-if="merged.layout === 'grid'" class="edit-group">
        <span class="edit-label">Columns:</span>
        <button class="edit-btn" @click="updateColumns(-1)" :disabled="merged.columns <= 1">−</button>
        <span class="edit-value">{{ merged.columns }}</span>
        <button class="edit-btn" @click="updateColumns(1)" :disabled="merged.columns >= 8">+</button>
      </div>
      
      <div class="edit-group">
        <span class="edit-label">Size:</span>
        <button class="edit-btn" @click="cycleItemSize" :title="`Current: ${merged.itemSize}`">
          {{ merged.itemSize.toUpperCase() }}
        </button>
      </div>
    </div>
    
    <div class="items-scroll-container">
      <div v-if="loading" class="msg">Loading…</div>
      <div v-else-if="error" class="err">{{ error }}</div>
      <div v-else-if="!merged.rpath" class="msg">(no path)</div>
    
      <!-- Details view -->
      <div
        v-else-if="merged.layout === 'details'"
        class="details-root"
        :data-icons="iconsTick"
      >
        <!-- header -->
        <div class="details-header">
          <button class="th th-name" @click="onHeaderClick('name')">
            Name <span v-if="sortKey==='name'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
          <button class="th th-ext"  @click="onHeaderClick('ext')">
            Ext <span v-if="sortKey==='ext'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
          <button class="th th-size" @click="onHeaderClick('size')">
            Size <span v-if="sortKey==='size'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
          <button class="th th-mod"  @click="onHeaderClick('modified')">
            Modified <span v-if="sortKey==='modified'" class="caret">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </button>
        </div>

        <!-- rows -->
        <div class="details-body">
          <div
            v-for="e in sortedEntries"
            :key="e.FullPath"
            class="drow"
            :title="e.FullPath"
            @click.stop="openEntry(e.FullPath)"
          >
            <div class="td td-name">
            <span class="icon">
              <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
              <span v-else>{{ iconText(e) }}</span>
            </span>
            <span class="name">{{ e.Name || e.FullPath }}</span>
            </div>
            <div class="td td-ext">{{ e.Ext || '' }}</div>
            <!-- Size (right-aligned: number + fixed-width unit) -->
            <div class="td td-size">
              <span class="num">{{ sizeParts(e?.Size).num }}</span>
              <span class="unit">{{ sizeParts(e?.Size).unit }}</span>
            </div>

            <!-- Modified (right-aligned: date + time, both fixed widths) -->
            <div class="td td-mod">
              <span class="date">{{ modParts(e?.ModifiedAt).date }}</span>
              <span class="time">{{ modParts(e?.ModifiedAt).time }}</span>
            </div>

          </div>
        </div>
      </div>
      <!-- List view -->
      <div
        v-else-if="merged.layout === 'list'"
        class="list-root"
        :data-icons="iconsTick"
      >
        <button
        v-for="e in sortedEntries"
        :key="e.FullPath"
        class="row"
        :title="e.FullPath"
        @click.stop="openEntry(e.FullPath)"
        >
        <div class="icon">
          <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
          <span v-else>{{ iconText(e) }}</span>
        </div>
        <div class="name">{{ e.Name || e.FullPath }}</div>
        </button>
      </div>

      <!-- Grid view -->
      <div
        v-else-if="merged.layout === 'grid'"
        class="grid-root"
        :data-icons="iconsTick"
        :style="{
        display: 'grid',
        gap: S.gap + 'px',
        padding: S.gap + 'px',
        gridTemplateColumns: `repeat(${Math.max(1, merged.columns)}, minmax(0, 1fr))`
        }"
      >
        <button
        v-for="e in sortedEntries"
        :key="e.FullPath"
        class="row"
        :title="e.FullPath"
        @click.stop="openEntry(e.FullPath)"
        >
        <div class="icon">
          <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
          <span v-else>{{ iconText(e) }}</span>
        </div>
        <div class="name">{{ e.Name || e.FullPath }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== shared ========== */
.items-root {
  color: var(--items-fg);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

/* Edit mode toolbar */
.edit-toolbar {
  display: flex;
  gap: 12px;
  padding: 8px;
  background: var(--surface-1, #1a1a1a);
  border-bottom: 1px solid var(--border, #555);
  flex-shrink: 0;
  align-items: center;
}

.edit-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.edit-label {
  font-size: 0.85em;
  opacity: 0.7;
  font-weight: 500;
}

.edit-value {
  font-size: 0.9em;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

.edit-btn {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.15s ease;
  min-width: 28px;
  text-align: center;
}

.edit-btn:hover:not(:disabled) {
  background: var(--surface-3, #333);
  border-color: var(--accent, #4ea1ff);
}

.edit-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.edit-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.items-scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  box-sizing: border-box;
}
.msg { padding: 12px; opacity: .8; }
.err { padding: 12px; color: #f77; }

/* list & grid containers */
.list-root { display: grid; gap: 6px; padding: 6px; }
.grid-root { /* grid columns are set inline via :style in template */ }

/* row (used by list & grid) */
.row {
  cursor: pointer;
  border: 1px solid var(--items-border);
  background: var(--items-bg);
  color: inherit;
  border-radius: 10px;
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
  min-height: 34px;
  padding: 6px 10px;
  box-sizing: border-box;
}
.icon img { display: block; width: 1.2em; height: 1.2em; object-fit: contain; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ========== details view ========== */
/* 4 columns: Name | Ext | Size | Modified */
.details-root {
  --cols: 1fr minmax(90px,120px) minmax(110px,140px) minmax(180px,220px);
  --padX: 10px;    /* keep header/data horizontal padding identical */
  --padY: 6px;
  --iconW: 1.6em;  /* icon space used in the first column */
  --gap:   6px;

  display: grid;
  gap: 4px;
  padding: var(--padY);
}

/* header frame matches row frame so edges align perfectly */
.details-header {
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;

  border: 1px solid var(--items-border);
  background: var(--items-bg);
  border-radius: 10px;
  min-height: 34px;
  padding: var(--padY) var(--padX);
  box-sizing: border-box;
  position: relative; /* for separators */
}

/* header cells: NO extra horizontal padding (prevents width drift) */
.th {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  line-height: 1;
  background: transparent;
  color: inherit;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font-weight: 600;
}
.th:hover { background: rgba(255,255,255,0.04); }
.th:focus-visible { outline: 2px solid var(--items-border); outline-offset: 2px; }

/* keep Name text aligned with row icons */
.th-name { padding-left: calc(var(--iconW) + 10px); }

/* numeric headers align right */
.th-size, .th-mod { text-align: right; }

/* vertical separators between header cells (themeable) */
.details-header .th + .th { position: relative; }
.details-header .th + .th::before {
  content: "";
  position: absolute;
  left: -3px; /* center the 1px line in the 6px gap */
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: var(--items-header-sep, rgba(255,255,255,.22));
  opacity: 1;
  pointer-events: none;
}

/* data rows */
.drow {
  display: grid;
  grid-template-columns: var(--cols);
  gap: var(--gap);
  align-items: center;

  border: 1px solid var(--items-border);
  background: var(--items-bg);
  border-radius: 10px;
  min-height: 34px;
  padding: var(--padY) var(--padX);
  box-sizing: border-box;
  cursor: pointer;
}

/* name cell mirrors list/grid layout */
.td-name {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0; /* allow ellipsis */
}
.td-name .icon { width: var(--iconW); flex: 0 0 var(--iconW); text-align: center; }

/* common cells */
.td-ext, .td-size, .td-mod {
  opacity: .9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* SIZE: right-aligned number + fixed-width unit, tabular digits */
.td-size {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
.td-size .num { text-align: right; }
.td-size .unit { min-width: 3ch; text-align: left; opacity: .85; }

/* MODIFIED: right-aligned date + time, fixed widths, tabular digits */
.td-mod {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
.td-mod .date { min-width: 10ch; text-align: right; }
.td-mod .time { min-width: 8ch;  text-align: right; }

/* details-specific image sizing */
.details-root .icon img { display: block; width: 1.2em; height: 1.2em; object-fit: contain; }
.details-root .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.drow:hover {
  background: var(--items-hover-bg, var(--surface-3, #2a2a2a));
  border-color: var(--items-hover-border, var(--border-hover, #666));
}

.row:hover {
  background: var(--items-hover-bg, var(--surface-3, #2a2a2a));
  border-color: var(--items-hover-border, var(--border-hover, #666));
}
</style>
