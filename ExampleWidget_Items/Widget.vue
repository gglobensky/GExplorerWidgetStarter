<script setup lang="ts">
/* -----------------------------------------------
   Items widget (L3b: listings + virtual rows)

   DATA       sdk.openListing(cwd) -> ListingSource (backend-sorted pages).
              useListing adapts it to Vue and keeps the view in place across
              re-sorts / refreshes. The listing watches the folder itself.
   ROWS       useVirtualList renders only the visible rows (+ overscan);
              layouts get item indices and look rows up with rowAt(i).
   SELECTION  createListSelection (names; "all except"; ranges resolved in
              the background). Marquee = createMarqueeDriver over
              createVirtualGeometry (hit ranges from row math).
   KEYS       one KEYMAP table -> named actions (to be replaced by the app's
              input controller; nothing else hard-codes keys).
   PAGING     (L4) per-folder view.paging from the host. The virtual list
              shows one page (a window of the source); everything else keeps
              using source indices, so selection, keep-my-place and reveal
              work across pages (they switch page when needed). The pager
              lives in the host's pane chrome (useWidgetChrome).
   RESTORE    the listing and the view (page, place, selection) are kept on
              the lifecycle shelf: a tab switch remounts without rescanning.
------------------------------------------------ */
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import {
  fsValidate,
  getEntryStyle,
  ensureIconsFor,
  createMarqueeDriver,
  createListSelection,
  createVirtualGeometry,
  useVirtualList,
  useListing,
  startRename,
  createWidgetMessaging,
  createLifecycle,
  useWidgetChrome,
  show as showSnack,
  showOnce,
  type ScrollerAdapter,
  type Rect,
  type WidgetSdk,
  type ListingSource,
  type ListingEntry,
  type ListingFilter,
  type ListingSortKey,
  type ListingSortDir,
  type ListingSnapshot,
  type SelectMods,
  type FocusAction,
  type ViewPaging,
} from 'gexplorer/widgets'

import ItemsListLayout from './ItemsListLayout.vue'
import ItemsGridLayout from './ItemsGridLayout.vue'
import ItemsDetailsLayout from './ItemsDetailsLayout.vue'
import ItemsPager from './ItemsPager.vue'
import { useItemsDragDrop } from './useItemsDragDrop'

const sdk = inject<WidgetSdk>('widgetSdk')
const {
  openListing,
  shortcutsProbe,
  fsRename,
  fsCopy,
  fsMove,
  loadIconPack,
  clipboardGetFiles,
  openEntry: sdkOpenEntry,
  openFolder: sdkOpenFolder
} = sdk ?? {}

const props = defineProps<{
  sourceId: string
  instanceId: string
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded' | 'dialog'
    size: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean
}>()

/* -----------------------------------------------
   Types
------------------------------------------------ */
type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string; entry: string }
  | { type: 'setView'; patch: Record<string, unknown> }

type DetailWeights = { name: number; ext: number; size: number; mod: number }

const emit = defineEmits<{
  (e: 'updateConfig', config: any): void
  (e: 'event', payload: any): void
}>()

const messaging = createWidgetMessaging(props.sourceId)
const { on, cleanup } = messaging

const policy: 'mac' | 'windows' = /Mac/i.test(navigator.platform) ? 'mac' : 'windows'

/* -----------------------------------------------
   Path helpers
------------------------------------------------ */
function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return idx < 0 ? normalized : normalized.slice(idx + 1)
}

function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return idx < 0 ? '' : normalized.slice(0, idx)
}

function joinPath(parent: string, name: string): string {
  const sep = parent.includes('\\') || /^[A-Za-z]:/.test(parent) ? '\\' : '/'
  return parent.replace(/[\\/]+$/, '') + sep + name
}

function normalizeDir(p: string | null | undefined): string {
  if (!p) return ''
  return p.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

/* -----------------------------------------------
   Config / view
------------------------------------------------ */
const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

type ItemsFilter = { exts?: string[]; activeOptions?: string[] }

const activeFilter = computed<ItemsFilter | null>(() => {
  const raw = cfg.value.data?.filters
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as ItemsFilter : null
})

const autoColumns = computed(() => {
  if (props.placement?.context === 'sidebar') return 1
  const gridCols = props.placement?.size?.cols || 4
  if (gridCols <= 2) return 1
  if (gridCols <= 3) return 2
  if (gridCols <= 5) return 3
  if (gridCols <= 8) return 4
  return 5
})

const autoItemSize = computed(() => {
  const gridCols = props.placement?.size?.cols || 4
  if (gridCols <= 3) return 'sm'
  if (gridCols <= 6) return 'md'
  return 'lg'
})

const cwd = ref<string>('')

const merged = computed(() => ({
  // Fallback to the live CWD if the static config is empty
  rpath: String(cfg.value.data.rpath || cwd.value || ''),
  layout: String(cfg.value.view.layout ?? 'list'),
  columns: cfg.value.view.columns || autoColumns.value,
  itemSize: cfg.value.view.itemSize || autoItemSize.value,
  showHidden: !!(cfg.value.view.showHidden ?? false),
  navigateMode: String(cfg.value.view.navigateMode ?? 'tab').toLowerCase(),
}))

function sizeTokens(size?: string) {
  const s = (size || 'md').toLowerCase()
  if (s === 'sm') return { padY: 8, padX: 10, radius: 8, gap: 6, font: 0.95, title: 600 }
  if (s === 'lg') return { padY: 14, padX: 14, radius: 12, gap: 10, font: 1.05, title: 650 }
  return { padY: 10, padX: 12, radius: 10, gap: 8, font: 1.0, title: 600 }
}
const S = computed(() => sizeTokens(merged.value.itemSize))

const layout = computed(() => merged.value.layout)
const isGrid = computed(() => layout.value === 'grid')
const cols = computed(() => (isGrid.value ? Math.max(1, Number(merged.value.columns) || 1) : 1))

// ---- PathBar ownership announce ----
watch(cwd, (v) => {
  emit('event', { type: 'cwd-changed', payload: { sourceId: props.sourceId, cwd: v } })
})

/* -----------------------------------------------
   Listing
------------------------------------------------ */
const sortKey = ref<ListingSortKey>((props.config?.view?.sortKey as any) || 'name')
const sortDir = ref<ListingSortDir>((props.config?.view?.sortDir as any) || 'asc')

const source = shallowRef<ListingSource | null>(null)

// The host file dialog is a one-off: its listing is not kept for a remount.
const inDialog = computed(() => props.placement?.context === 'dialog')

/* Lifecycle shelf: survives unmount (tab switch) until the pane is gone for
   good; then `dispose` closes the kept listing. */
type SavedView = {
  page: number
  anchor: { name: string; offset: number; edge: 'top' | 'bottom' } | null
  selection: { all: boolean; ids: string[]; focusId: string | null; anchorId: string | null } | null
}
type Shelf = { path: string; key: string; source: ListingSource; view: SavedView | null }

const RESTORE_SELECTION_MAX = 50_000
const life = createLifecycle(props.sourceId)
const shelf = life.persistRef<Shelf | null>('items.listing', null, { dispose: (s) => s?.source.close() })
let pendingRestore: SavedView | null = null
// What the current source was opened for: openDir skips a second open of the
// same folder with the same filter (navigation sets the cwd and the host's
// rpath at once, which used to open, and scan, every folder twice).
let openedFor: { path: string; key: string } | null = null

function listingFilter(): ListingFilter {
  const f = activeFilter.value
  return {
    exts: f?.exts?.length ? f.exts : undefined,
    guiOnly: !!f?.activeOptions?.includes('guiOnly'),
    showHidden: merged.value.showHidden,
  }
}

/**
 * Opens `path` (replaces the current listing; useListing closes the old one).
 * First open after a remount: reuses the shelved listing of the same folder
 * (no rescan) and queues the saved view for restoreView().
 */
function openDir(path: string) {
  lnkIconKeys.clear()
  lnkProbed.clear()
  const key = JSON.stringify(listingFilter())
  if (source.value && openedFor && openedFor.path === path && openedFor.key === key &&
      source.value.snapshot().status !== 'closed') return
  const kept = shelf.value

  if (kept && !source.value) {
    const reusable = !inDialog.value && path && kept.path === path && kept.key === key &&
      kept.source.snapshot().status !== 'closed'
    if (reusable) {
      const cur = kept.source.snapshot().sort
      if (cur.key !== sortKey.value || cur.dir !== sortDir.value) kept.source.setSort({ key: sortKey.value, dir: sortDir.value })
      pendingRestore = kept.view
      kept.view = null
      pageIndex.value = pendingRestore?.page ?? 0
      source.value = kept.source
      openedFor = { path, key }
      return
    }
    kept.source.close()          // not attached to anything: close it here
    shelf.value = null
  }

  selection.clear()
  pageIndex.value = 0
  if (!path) { source.value = null; openedFor = null; return }
  openedFor = { path, key }
  source.value = openListing?.(path, {
    // One owner per pane: the backend closes the pane's previous listing when
    // it opens a new one (instanceId is not passed by every host placement).
    owner: props.instanceId || props.sourceId,
    sort: { key: sortKey.value, dir: sortDir.value, foldersFirst: true },
    filter: listingFilter(),
  }) ?? null
  shelf.value = source.value && !inDialog.value ? { path, key, source: source.value, view: null } : null
}

function refresh() {
  source.value?.refresh()
}

/* -----------------------------------------------
   Virtual rows
------------------------------------------------ */
const rootEl = ref<HTMLElement | null>(null)
const scrollEl = ref<HTMLElement | null>(null)          // List / Grid scroller
const detailsLayoutRef = ref<any>(null)
const detailsScrollEl = ref<HTMLElement | null>(null)   // Details scroller (inside the layout)

watch(detailsLayoutRef, (component) => {
  detailsScrollEl.value = component?.detailsScrollEl ?? null
}, { flush: 'post' })

const scrollerEl = computed<HTMLElement | null>(() =>
  layout.value === 'details' ? detailsScrollEl.value : scrollEl.value)

const sizerEl = shallowRef<HTMLElement | null>(null)
const rowsEl = shallowRef<HTMLElement | null>(null)
const bindSizer = (el: any) => { sizerEl.value = (el as HTMLElement) ?? null }
const bindRows = (el: any) => { rowsEl.value = (el as HTMLElement) ?? null }

// useListing needs the list, the list needs the total: the listing API is
// published through this ref once created.
const listingRef = shallowRef<ReturnType<typeof useListing> | null>(null)
const total = computed(() => listingRef.value?.total.value ?? 0)

/* -----------------------------------------------
   Paging (L4)
   view.paging (from the host, per folder):
     undefined = not known yet, null = no record, else the user's choice.
   Everything outside this block works in source indices; the virtual list
   shows the window [pageStart, pageStart + pageLen).
------------------------------------------------ */
const PAGE_SIZE_DEFAULT = 500          // matches entry.ts paging.defaultPageSize

type PagingState = 'unknown' | 'none' | 'single' | 'paged'
const pagingState = computed<PagingState>(() => {
  const p = props.config?.view?.paging as ViewPaging | null | undefined
  if (p === undefined) return 'unknown'
  if (p === null) return 'none'
  return p.mode === 'paged' ? 'paged' : 'single'
})
const isPaged = computed(() => pagingState.value === 'paged')
const pageSize = computed(() => {
  const n = Number(props.config?.view?.paging?.pageSize)
  return Number.isInteger(n) && n > 0 ? n : PAGE_SIZE_DEFAULT
})
const pagerJump = computed(() => {
  const n = Number(props.config?.view?.pagerJump)      // settings later
  return Number.isInteger(n) && n > 0 ? n : 5
})

/** Wanted page; the shown page is clamped (totals grow while a folder loads). */
const pageIndex = ref(0)
const pageCount = computed(() => isPaged.value ? Math.max(1, Math.ceil(total.value / pageSize.value)) : 1)
const currentPage = computed(() => isPaged.value ? Math.min(pageIndex.value, pageCount.value - 1) : 0)
const pageStart = computed(() => currentPage.value * (isPaged.value ? pageSize.value : 0))
const pageLen = computed(() => isPaged.value
  ? Math.max(0, Math.min(pageSize.value, total.value - pageStart.value))
  : total.value)

function pageOf(index: number): number {
  return isPaged.value ? Math.floor(Math.max(0, index) / pageSize.value) : 0
}

const LIST_TOP_PAD = 6   // was the scroller's padding-block; now inside the rows

const vlist = useVirtualList({
  scrollEl: scrollerEl,
  sizerEl,
  count: () => Math.ceil(pageLen.value / cols.value),
  gap: () => {
    if (isGrid.value) return S.value.gap
    const g = rowsEl.value ? parseFloat(getComputedStyle(rowsEl.value).rowGap) : 0
    return Number.isFinite(g) ? g : 0
  },
  contentOffset: () => (layout.value === 'details' ? 0 : isGrid.value ? S.value.gap : LIST_TOP_PAD),
  overscan: 6,
  // Runs immediately, inside useVirtualList: must not touch `vlist` itself.
  onRange: (s, e) => ensureRows(s, e),
})

/** Loads the rows of visual rows [s, e) of the current page window (source indices). */
function ensureRows(s: number, e: number) {
  const c = cols.value
  source.value?.ensure(pageStart.value + s * c, pageStart.value + Math.min(pageLen.value, e * c))
}
// Same rendered range on another page still needs that page's rows.
watch(pageStart, () => ensureRows(vlist.start.value, vlist.end.value))

// Re-measure when the layout, item size or column count changes the rows.
watch([layout, () => merged.value.itemSize, cols], () => nextTick(() => vlist.measure()))

/** Visual row (in the current page window) of source index `i`. */
function localRow(i: number): number {
  return Math.floor((i - pageStart.value) / cols.value)
}

/** Runs `then` with source index `index` on the current page (switches page first if needed). */
function withIndexOnPage(index: number, then: () => void) {
  const p = pageOf(index)
  if (isPaged.value && p !== currentPage.value) {
    pageIndex.value = p
    void nextTick(then)        // the list re-renders with the new window first
  } else {
    then()
  }
}

/**
 * Item-index view of the list, in source indices (grid rows hold `cols`
 * items; paged lists show one page). useListing, selection and reveal use it.
 */
const itemView = {
  start: computed(() => pageStart.value + vlist.start.value * cols.value),
  end: computed(() => pageStart.value + Math.min(pageLen.value, vlist.end.value * cols.value)),
  captureAnchor: (prefer?: number | null) => {
    const onPage = prefer != null && prefer >= pageStart.value && prefer < pageStart.value + pageLen.value
    const a = vlist.captureAnchor(onPage ? localRow(prefer!) : null)
    return a ? { ...a, index: pageStart.value + a.index * cols.value } : null
  },
  restoreAnchor: (a: { index: number; offset: number; edge: 'top' | 'bottom' }, index?: number) => {
    const target = index ?? a.index
    withIndexOnPage(target, () => {
      const row = localRow(target)
      vlist.restoreAnchor({ ...a, index: row }, row)
    })
  },
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end' | 'nearest') =>
    withIndexOnPage(index, () => vlist.scrollToIndex(localRow(index), align)),
}

const itemIndices = computed(() => {
  const out: number[] = []
  const c = cols.value
  const base = pageStart.value
  const end = base + pageLen.value
  for (const r of vlist.indices.value) {
    for (let i = base + r * c; i < Math.min(end, base + (r + 1) * c); i++) out.push(i)
  }
  return out
})

/** User page change (pager / keys): new page from its top. */
function goToPage(p: number) {
  if (!isPaged.value) return
  const t = Math.min(Math.max(0, Math.floor(p)), pageCount.value - 1)
  if (t === currentPage.value) return
  pageIndex.value = t
  void nextTick(() => vlist.scrollToIndex(0, 'start'))
}

// Switching Single <-> Paged (or the page size) in the same folder keeps the
// focused item, else the first visible one, in view. Transitions from
// 'unknown' are a folder loading its setting: openDir already chose the page.
watch(
  () => `${pagingState.value}|${pageSize.value}`,
  (now, before) => {
    const [was] = (before ?? '').split('|')
    if (!before || was === 'unknown' || pagingState.value === 'unknown') return
    const [oldState, oldSize] = before.split('|')
    const oldPaged = oldState === 'paged'
    const oldPageSize = Number(oldSize) || PAGE_SIZE_DEFAULT
    const oldStart = oldPaged
      ? Math.min(pageIndex.value, Math.max(0, Math.ceil(total.value / oldPageSize) - 1)) * oldPageSize
      : 0
    const oldLen = oldPaged ? Math.min(oldPageSize, total.value - oldStart) : total.value
    const pitch = vlist.rowPitch.value
    const firstRow = pitch > 0 ? Math.floor(vlist.logicalTop.value / pitch) : 0
    const focus = selection.focusIndex()
    const anchor = focus != null && focus >= oldStart && focus < oldStart + oldLen
      ? focus
      : Math.min(Math.max(0, total.value - 1), oldStart + firstRow * cols.value)
    pageIndex.value = pageOf(anchor)
    void nextTick(() => vlist.scrollToIndex(localRow(anchor), focus === anchor ? 'nearest' : 'start'))
  }
)

/* -----------------------------------------------
   Selection
------------------------------------------------ */
const selection = createListSelection({
  source: () => source.value,
  columns: () => cols.value,
  pageSize: () => Math.max(1, Math.floor(vlist.viewportHeight.value / Math.max(1, vlist.rowPitch.value)) - 1),
  policy,
  onLimit: (l) => {
    showSnack({
      id: 'items-selection-limit',
      text: l.kind === 'range'
        ? `Selecting ${l.count.toLocaleString()} items with one range isn't supported yet (up to ${l.max.toLocaleString()}). Ctrl+A selects everything.`
        : `This action handles up to ${l.max.toLocaleString()} items; ${l.count.toLocaleString()} are selected.`,
      timeoutMs: 7000,
      dedupe: 'replace',
    })
  },
  onFocusMove: (index) => itemView.scrollToIndex(index, 'nearest'),
})

const selState = shallowRef(selection.state())
const selTick = ref(0)
let selectionEventTimer: number | null = null
selection.subscribe((s) => {
  selState.value = s
  selTick.value++
  scheduleSelectionEvent()
})

const listing = useListing(source, {
  vlist: itemView,
  focusName: () => selState.value.focusId,
  // Outside the dialog the listing is shelved on unmount (tab switch) and
  // closed by the shelf's dispose when the pane is gone for good.
  closeOnDispose: inDialog.value,
})
listingRef.value = listing

function rowAt(i: number): ListingEntry | undefined { return listing.rowAt(i) }
function isSelected(i: number): boolean {
  void selTick.value                      // re-render on selection changes
  void listing.snapshot.value.rowsTick    // ...and when rows (names) arrive
  return selection.isSelected(i)
}

/** Selected paths without any fetch (explicit selections); null = too large / unresolved. */
function selectedPathsNow(): string[] | null {
  const st = selState.value
  if (st.all) return null
  const base = listing.basePath.value || cwd.value
  return [...st.ids].map(n => joinPath(base, n))
}

/** Selected rows that are on screen (kinds for the context resolver). */
function visibleSelectedEntries(): ListingEntry[] {
  const out: ListingEntry[] = []
  for (const i of itemIndices.value) {
    const e = rowAt(i)
    if (e && selection.isSelected(i)) out.push(e)
  }
  return out
}

function scheduleSelectionEvent() {
  if (selectionEventTimer) clearTimeout(selectionEventTimer)
  selectionEventTimer = window.setTimeout(() => {
    selectionEventTimer = null
    emitSelectionChanged()
  }, 50)
}

function emitSelectionChanged() {
  const paths = selectedPathsNow() ?? []
  const byPath = new Map(visibleSelectedEntries().map(e => [e.FullPath, e]))
  const payload = paths.map(path => {
    const e = byPath.get(path)
    return e
      ? { path, kind: e.Kind === 'dir' ? 'folder' as const : 'file' as const, name: e.Name, size: e.Size ?? undefined, mtime: e.ModifiedAt ?? undefined }
      : { path, kind: 'file' as const }
  })
  emit('event', { type: 'selectionChanged', payload })
}

/** Ctrl+A: instant "all"; folders up to the resolve cap become explicit names in the background. */
const SELECT_ALL_RESOLVE_MAX = 200_000
async function selectAllItems() {
  selection.selectAll()
  const s = source.value
  if (!s || total.value === 0 || total.value > SELECT_ALL_RESOLVE_MAX) return
  const version = s.snapshot().version
  try {
    const rows = await s.rows(0, s.snapshot().total, version)
    if (source.value !== s || !selState.value.all || selState.value.ids.size) return   // changed meanwhile
    const focusId = selState.value.focusId
    selection.setIds(rows.map(r => r.Name), { focusId, anchorId: selState.value.anchorId ?? focusId })
  } catch { /* order changed: stays "all" */ }
}

/* -----------------------------------------------
   Context menu (evaluated at right-click)
------------------------------------------------ */
function contextMenuOptions() {
  const paths = selectedPathsNow()
  if (!paths) {
    const n = selection.count()
    showSnack({
      id: 'items-selection-limit',
      text: n <= SELECT_ALL_RESOLVE_MAX
        ? 'The selection is still being prepared; try again in a moment.'
        : `Actions on all ${n.toLocaleString()} items of this folder aren't supported yet (up to ${SELECT_ALL_RESOLVE_MAX.toLocaleString()}).`,
      timeoutMs: 6000,
      dedupe: 'replace',
    })
    return null
  }
  return {
    widgetType:   'items',
    widgetId:     props.sourceId,
    location:     { area: 'grid' as const },
    target:       paths.length > 0 ? ('selection' as const) : ('background' as const),
    path:         cwd.value || merged.value.rpath || '',   // host resolves VFS
    selection:    paths,
    widgetConfig: props.config,
    entries:      visibleSelectedEntries(),
  }
}

/* -----------------------------------------------
   Icons (visible rows only)
------------------------------------------------ */
const iconsTick = ref(0)
const requestedIconKeys = new Set<string>()
const lnkIconKeys = new Map<string, string>()   // FullPath -> resolved shortcut icon key
const lnkProbed = new Set<string>()

function iconKeyOf(e: ListingEntry): string {
  return lnkIconKeys.get(e.FullPath) ?? e.IconKey
}

let iconsRaf = 0
watch([itemIndices, () => listing.snapshot.value.rowsTick], () => {
  if (iconsRaf) return
  iconsRaf = requestAnimationFrame(() => { iconsRaf = 0; void loadVisibleIcons() })
})

async function loadVisibleIcons() {
  const keys: string[] = []
  const lnks: string[] = []
  for (const i of itemIndices.value) {
    const e = rowAt(i)
    if (!e) continue
    if (!requestedIconKeys.has(e.IconKey)) { requestedIconKeys.add(e.IconKey); keys.push(e.IconKey) }
    if (e.Kind === 'link' && e.Ext === '.lnk' && !lnkProbed.has(e.FullPath)) { lnkProbed.add(e.FullPath); lnks.push(e.FullPath) }
  }

  let changed = false
  if (lnks.length && shortcutsProbe) {
    try {
      const r: any = await shortcutsProbe(lnks)
      // shortcuts:probe replies { path, iconKey } (camelCase)
      for (const x of (r?.results ?? []) as Array<{ path: string; iconKey: string }>) {
        if (!x.iconKey) continue
        lnkIconKeys.set(x.path, x.iconKey)
        changed = true
        if (!requestedIconKeys.has(x.iconKey)) { requestedIconKeys.add(x.iconKey); keys.push(x.iconKey) }
      }
    } catch { /* keep the generic shortcut icon */ }
  }

  if (keys.length) {
    const n = await ensureIconsFor(keys.map(iconKey => ({ iconKey })), 32)
    if (n > 0) changed = true
  }
  if (changed) iconsTick.value++
}

void loadIconPack?.()

/* -----------------------------------------------
   Marquee
------------------------------------------------ */
const marqueeRect = ref<Rect | null>(null)
let squelchNextPlaneClick = false
let lastClientX = 0, lastClientY = 0

const geo = createVirtualGeometry({
  vlist,
  scrollEl: scrollerEl,
  count: () => pageLen.value,           // the page window…
  offset: () => pageStart.value,        // …hit ranges come back as source indices
  columns: () => cols.value,
  cell: () => {
    // Grid cell geometry from the first rendered cell (viewport-relative).
    const sc = scrollerEl.value
    const cell = rowsEl.value?.firstElementChild as HTMLElement | null
    if (!sc || !cell) return { x0: 0, width: 0, gapX: 0 }
    const r = cell.getBoundingClientRect()
    const scR = sc.getBoundingClientRect()
    return { x0: r.left - scR.left - sc.clientLeft, width: r.width, gapX: S.value.gap }
  },
})

const scroller: ScrollerAdapter = {
  scrollTop: () => scrollerEl.value?.scrollTop ?? 0,
  maxScrollTop: () => {
    const el = scrollerEl.value
    return el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0
  },
  scrollBy: (dy) => {
    // The driver decides when (edge zone + outside); this just scrolls.
    const el = scrollerEl.value
    if (el) el.scrollTop += dy
  },
}

function pointerInsideScroller(cx: number, cy: number) {
  const r = scrollerEl.value?.getBoundingClientRect()
  return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
}

const driver = createMarqueeDriver(
  {
    enabled: true,
    startThresholdPx: 6,
    fps: 30,
    guardTopPx: 0,
    autoscroll: { enabled: true, baseSpeed: 2400, speedMultiplier: 1.75, maxDistancePx: 240 },
    combine: 'auto',           // Shift→add, Ctrl/Cmd→toggle, else replace
    policy,
  },
  geo,
  scroller,
  selection,
  {
    rectChanged: (r) => {
      if (r) {
        const st = scrollerEl.value?.scrollTop ?? 0
        marqueeRect.value = { x: r.x, y: r.y + st, w: r.w, h: r.h }
        squelchNextPlaneClick = r.w > 0 || r.h > 0
      } else {
        marqueeRect.value = null
      }
    },
  }
)

const marqueeActive = computed(() => {
  const r = marqueeRect.value
  return !!r && (r.w > 0 || r.h > 0)
})

function modsFromEvent(e: PointerEvent | MouseEvent | KeyboardEvent): SelectMods & { alt: boolean } {
  return { ctrl: e.ctrlKey || false, meta: (e as any).metaKey || false, shift: e.shiftKey || false, alt: e.altKey || false }
}

function onPlaneScroll() {
  // Keep the marquee's start point anchored in list space (every scroll,
  // not only while dragging, so the delta never accumulates stale).
  driver.adjustForScroll(geo.consumeScrollDelta())
}

function isOnScrollbar(el: HTMLElement, ev: PointerEvent) {
  const r = el.getBoundingClientRect()
  const sb = Math.max(0, el.offsetWidth - el.clientWidth)
  return sb > 0 && ev.clientX >= r.right - sb - 1
}

function onScrollContainerPointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  if (layout.value === 'list' || layout.value === 'grid') onSurfacePointerDown(ev)
  else (ev.currentTarget as HTMLElement)?.focus?.({ preventScroll: true })
}

function onSurfacePointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  const fromDetails = layout.value === 'details' && ev.currentTarget === detailsScrollEl.value
  const fromOuter = layout.value !== 'details' && ev.currentTarget === scrollEl.value
  if (!fromDetails && !fromOuter) return

  const t = ev.target as HTMLElement | null
  const plane = scrollerEl.value
  if (!plane) return
  if (t?.closest('.row[data-index]')) return      // rows handle their own presses
  if (isOnScrollbar(plane, ev)) return

  ;(ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId)
  scrollEl.value?.focus({ preventScroll: true })

  lastClientX = ev.clientX; lastClientY = ev.clientY
  geo.consumeScrollDelta()
  driver.pointerDown(ev, modsFromEvent(ev))

  window.addEventListener('pointerup', onSurfacePointerUp, { once: true })
  ev.preventDefault()
}

function onSurfacePointerMove(ev: PointerEvent) {
  if (layout.value === 'details' && ev.currentTarget === scrollEl.value) return
  lastClientX = ev.clientX; lastClientY = ev.clientY
  driver.pointerMove(ev)
}

function onSurfacePointerUp(ev: PointerEvent) {
  if (ev.button !== 0) return
  if (layout.value === 'details' && ev.currentTarget === scrollEl.value) return

  const wasMarquee = marqueeActive.value
  if (wasMarquee) {
    driver.adjustForScroll(geo.consumeScrollDelta())
    driver.recomputeNow('plane:flush-before-up')
  }
  driver.pointerUp(ev)
  window.removeEventListener('pointerup', onSurfacePointerUp)

  // A plain click on the background (no marquee) clears the selection.
  if (!wasMarquee && pointerInsideScroller(ev.clientX, ev.clientY) && !isOverSelectedRowAtPoint(ev.clientX, ev.clientY)) {
    selection.clear()
  }
}

function isOverSelectedRowAtPoint(cx: number, cy: number) {
  const row = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest('.row[data-index]') as HTMLElement | null
  if (!row) return false
  const i = Number(row.dataset.index)
  return Number.isFinite(i) && selection.isSelected(i)
}

function onSurfaceClick(ev: MouseEvent) {
  if (ev.button !== 0) return
  if (layout.value === 'details' && ev.currentTarget === scrollEl.value) return
  if (squelchNextPlaneClick) { squelchNextPlaneClick = false; return }
  const t = ev.target as HTMLElement | null
  if (!t?.closest('.row[data-index]')) selection.clear()
}

/* -----------------------------------------------
   Row gestures
------------------------------------------------ */
function onRowDown({ index, ev }: { index: number; ev: PointerEvent }) {
  if (ev.button === 1) return
  // Right press: select the row unless it is already part of the selection
  // (the context menu then acts on the whole selection); no modifiers.
  const mods = ev.button === 2 ? { ctrl: false, meta: false, shift: false } : modsFromEvent(ev)
  selection.rowDown(index, mods)
}

function onRowMove({ x, y }: { x: number; y: number }) { selection.rowMove(x, y) }
function onRowUp({ index }: { index: number }) { selection.rowUp(index) }

function onRowDblClick({ index }: { index: number }) {
  const e = rowAt(index)
  if (e) void openEntry(e)
}

// Capture-phase row pointerdown — fires before the rows' own handlers,
// starting the drag threshold watch.
function onRowPointerDownCapture(ev: PointerEvent) {
  if (ev.button !== 0) return
  const row = (ev.target as HTMLElement | null)?.closest('.row[data-path]') as HTMLElement | null
  if (!row) return
  const e = rowAt(Number(row.dataset.index))
  if (e) onItemPointerDown(e, ev)
}

/* -----------------------------------------------
   Keyboard: one keymap, named actions
   The input controller (rebindable keys) will replace KEYMAP; the actions
   stay. Keys are "Ctrl+Shift+Alt+Key" with Ctrl = Cmd on macOS.
------------------------------------------------ */
type ItemsAction =
  | `focus.${FocusAction}` | `extend.${FocusAction}` | `move.${FocusAction}`
  | 'select.all' | 'select.toggleFocused' | 'select.clear'
  | 'open.focused' | 'rename.focused'
  | 'page.next' | 'page.prev' | 'page.goto'

const FOCUS_KEYS: Record<string, FocusAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  PageUp: 'pageUp', PageDown: 'pageDown', Home: 'home', End: 'end',
}

const KEYMAP: Record<string, ItemsAction> = {
  ...Object.fromEntries(Object.entries(FOCUS_KEYS).flatMap(([key, a]) => [
    [key, `focus.${a}`],              // select the next item
    [`Shift+${key}`, `extend.${a}`],  // range from the anchor
    [`Ctrl+${key}`, `move.${a}`],     // move the focus only
  ])),
  'Ctrl+A': 'select.all',
  'Ctrl+Space': 'select.toggleFocused',
  'Escape': 'select.clear',
  'Enter': 'open.focused',
  'F2': 'rename.focused',
  'Alt+PageDown': 'page.next',
  'Alt+PageUp': 'page.prev',
  'Ctrl+G': 'page.goto',
}

function keyCombo(ev: KeyboardEvent): string {
  const ctrl = policy === 'mac' ? ev.metaKey : ev.ctrlKey
  const key = ev.key === ' ' ? 'Space' : ev.key.length === 1 ? ev.key.toUpperCase() : ev.key
  return `${ctrl ? 'Ctrl+' : ''}${ev.shiftKey ? 'Shift+' : ''}${ev.altKey ? 'Alt+' : ''}${key}`
}

function runItemsAction(action: ItemsAction): void {
  const [group, arg] = action.split('.') as [string, string]
  switch (group) {
    case 'focus': return selection.focusMove(arg as FocusAction)
    case 'extend': return selection.focusMove(arg as FocusAction, { extend: true })
    case 'move': return selection.focusMove(arg as FocusAction, { keepSelection: true })
  }
  switch (action) {
    case 'select.all': void selectAllItems(); return
    case 'select.toggleFocused': selection.toggleFocused(); return
    case 'select.clear': selection.clear(); return
    case 'open.focused': {
      const i = selection.focusIndex()
      const e = i == null ? undefined : rowAt(i)
      if (e) void openEntry(e)
      return
    }
    case 'rename.focused': {
      const paths = selectedPathsNow()
      if (paths?.length === 1) void startItemRename(paths[0])
      return
    }
    case 'page.next': goToPage(currentPage.value + 1); return
    case 'page.prev': goToPage(currentPage.value - 1); return
    case 'page.goto': {
      if (!isPaged.value) return
      chrome.reveal()                      // overlay mode: expand the pager first
      void nextTick(() => pagerRef.value?.focusInput())
      return
    }
  }
}

function onKeyDown(ev: KeyboardEvent) {
  const action = KEYMAP[keyCombo(ev)]
  if (!action) return
  ev.preventDefault()
  ev.stopPropagation()
  runItemsAction(action)
}

/* -----------------------------------------------
   Opening entries
------------------------------------------------ */
async function openEntry(e: ListingEntry) {
  const FullPath = e.FullPath
  if (!FullPath) return
  try {
    const v = await fsValidate(FullPath)
    if (v?.ok && v.exists === false) {
      // Renamed or deleted since the listing was read.
      showSnack({ id: 'items-missing', text: `"${e.Name}" no longer exists.`, timeoutMs: 5000, dedupe: 'replace' })
      refresh()
      return
    }
    if (v?.isDir) {
      await sdkOpenFolder?.(e)
    } else if (merged.value.navigateMode === 'dialog') {
      // Inside a host file dialog (DialogHost sets navigateMode: 'dialog'):
      // opening a file means "choose this file". WidgetHost turns the action
      // into an 'activate' event the dialog accepts (B-003).
      props.runAction?.({ type: 'open', path: FullPath, entry: FullPath })
    } else {
      await sdkOpenEntry?.(e)
    }
  } catch (result: any) {
    // openFolder signals nav via thrown sentinel
    if (result?.__nav) props.runAction?.({ type: 'nav', to: result.to })
    else console.error('[items] openEntry failed:', result)
  }
}

/* -----------------------------------------------
   Revealing a row by name (after rename / create / external reveal)
------------------------------------------------ */
function waitForVersion(s: ListingSource, after: number, timeoutMs = 10_000): Promise<ListingSnapshot> {
  return new Promise(resolve => {
    const now = s.snapshot()
    if (now.version > after || now.status === 'error' || now.status === 'closed') return resolve(now)
    let off: () => void = () => {}
    const timer = window.setTimeout(() => { off(); resolve(s.snapshot()) }, timeoutMs)
    off = s.subscribe(snap => {
      if (snap.version > after || snap.status === 'error' || snap.status === 'closed') {
        clearTimeout(timer); off(); resolve(snap)
      }
    })
  })
}

/**
 * Selects and scrolls to `name`. `reload`: refresh first (the name is new).
 * Returns false if the name is not in the listing.
 */
async function revealName(name: string, opts: { reload?: boolean } = {}): Promise<boolean> {
  const s = source.value
  if (!s) return false
  if (opts.reload) {
    const before = s.snapshot().version
    s.refresh()
    await waitForVersion(s, before)
  } else if (s.snapshot().version === 0) {
    await waitForVersion(s, 0)
  }
  if (s !== source.value) return false
  await listing.settled()            // let keep-my-place finish first
  const [index] = await s.find([name])
  if (index < 0 || s !== source.value) return false
  selection.setIds([name], { focusId: name, anchorId: name })
  itemView.scrollToIndex(index, 'nearest')
  await nextTick()
  return true
}

/* -----------------------------------------------
   Rename
------------------------------------------------ */
async function handleRenameCommit(oldPath: string, newName: string): Promise<void> {
  const newPath = joinPath(dirname(oldPath), newName)
  try {
    const res: any = await fsRename?.(oldPath, newPath)
    if (res && res.ok === false) throw new Error(res.error || 'Rename failed')
    await revealName(newName, { reload: true })
  } catch (err: any) {
    console.error('[items] Rename failed:', err)
    const missing = /not.?found|no longer exists|cannot find/i.test(String(err?.message ?? err))
    showSnack({
      id: 'items-rename',
      text: missing ? `"${basename(oldPath)}" no longer exists.` : `Rename failed: ${err?.message ?? err}`,
      timeoutMs: 6000,
      dedupe: 'replace',
    })
    if (missing) refresh()
  }
}

async function startItemRename(itemPath: string): Promise<void> {
  // The rename overlay attaches to the row's element: make sure it is rendered.
  await revealName(basename(itemPath))
  startRename(itemPath, {
    widgetId: props.sourceId,
    selectBasename: true,
    onCommit: async (newName: string) => { await handleRenameCommit(itemPath, newName) },
    onCancel: () => {},
  })
}

/* -----------------------------------------------
   Clipboard paste
------------------------------------------------ */
async function pasteFromClipboard() {
  try {
    const state = await clipboardGetFiles?.()
    if (!state) return
    if (!state.hasFiles || state.count === 0) return
    const targetDir = cwd.value
    if (!targetDir) return

    const items = state.paths.map((sourcePath: string) => ({ from: sourcePath, to: joinPath(targetDir, basename(sourcePath)) }))

    // One refresh after the whole batch, not one per file event.
    const s = source.value
    const release = s?.holdRefresh?.()
    try {
      if (state.operation === 'cut') await fsMove?.(items)
      else await fsCopy?.(items)
      selection.clear()
    } catch (err: any) {
      console.error('[Items] Paste operation failed:', err?.message ?? err)
    } finally {
      s?.refresh()      // deferred while held: runs once on release
      release?.()
    }
  } catch (err: any) {
    console.error('[Items] Failed to paste:', err?.message ?? err)
  }
}

/* -----------------------------------------------
   Sorting
------------------------------------------------ */
function onHeaderClick(nextKey: ListingSortKey) {
  if (sortKey.value === nextKey) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = nextKey; sortDir.value = 'asc' }
  source.value?.setSort({ key: sortKey.value, dir: sortDir.value })
}

// Watch primitive keys, not arrays / objects: hosts may pass `config` as an
// inline literal (DialogHost does), which is a new object on every render.
watch(
  () => `${props.config?.view?.sortKey ?? ''}|${props.config?.view?.sortDir ?? ''}`,
  () => {
    const k = props.config?.view?.sortKey, d = props.config?.view?.sortDir
    if (k && ['name', 'kind', 'ext', 'size', 'modified'].includes(k as string)) sortKey.value = k as ListingSortKey
    if (d === 'asc' || d === 'desc') sortDir.value = d
    source.value?.setSort({ key: sortKey.value, dir: sortDir.value })
  }
)

/* -----------------------------------------------
   Details column weights (persisted)
------------------------------------------------ */
const NAME_MIN = 140, EXT_MIN = 70, SIZE_MIN = 90, MIN_MOD_PX = 150
const defaultPx = { name: 420, ext: 110, size: 130, mod: 220 }

function normalizeWeights(o: Record<string, number>): DetailWeights {
  const sum = Math.max(1, (o.name ?? 0) + (o.ext ?? 0) + (o.size ?? 0) + (o.mod ?? 0))
  const scale = 100 / sum
  return { name: (o.name ?? 0) * scale, ext: (o.ext ?? 0) * scale, size: (o.size ?? 0) * scale, mod: (o.mod ?? 0) * scale }
}

function initialWeights(): DetailWeights {
  const saved = props.config?.view?.detailWeights as Partial<DetailWeights> | undefined
  if (saved && typeof saved.name === 'number') return normalizeWeights(saved as any)
  return normalizeWeights(defaultPx)
}

const colW = ref<DetailWeights>(initialWeights())
void NAME_MIN; void EXT_MIN; void SIZE_MIN; void MIN_MOD_PX   // mins live in the Details layout

watch(colW, (w) => {
  emit('updateConfig', {
    ...props.config,
    view: { ...props.config?.view, detailWeights: { ...normalizeWeights(w) } },
  })
}, { deep: true })

/* -----------------------------------------------
   Drag & drop
------------------------------------------------ */
const {
  isDragging,
  isDropActive,
  folderDropTarget,
  onItemPointerDown,
  dispose
} = useItemsDragDrop({
  sourceId: props.sourceId,
  messaging,
  cwd,
  merged,
  marqueeActive,
  dragEntries: async (entry) =>
    selection.isSelectedId(entry.Name) ? await selection.selectedEntries() : [entry],
  onDragStarted: () => selection.dragStart(),
  refresh,
  emit: emit as (event: string, payload: any) => void,
})

/* -----------------------------------------------
   Navigation
------------------------------------------------ */
async function applyExternalCwd(path: string) {
  if (!path) return
  cwd.value = path
  openDir(path)
}

watch(
  () => merged.value.rpath,
  (rp) => {
    if (!rp) return
    cwd.value = rp
    openDir(rp)
  },
  { immediate: true }
)

// Filters / hidden files are applied by the backend: a change reopens. The
// key is a string so an equal-but-new config object (DialogHost re-renders
// pass a fresh literal) does not reopen the folder and lose the selection.
watch(
  () => `${JSON.stringify(cfg.value.data?.filters ?? null)}|${merged.value.showHidden}`,
  () => { if (cwd.value) openDir(cwd.value) }
)

function onWidgetAction(msg: any) {
  if (msg.topic !== 'widget:action') return
  if (msg.payload.actionId === 'navigate') {
    const folder = msg.payload.tokens?.path ?? msg.payload.args?.path
    if (folder) void applyExternalCwd(folder)
  }
  if (msg.payload.actionId === 'reveal') {
    const file = msg.payload.tokens?.path ?? msg.payload.args?.path
    if (file) {
      void applyExternalCwd(dirname(file)).then(() => revealName(basename(file)))
    }
  }
}

function getNavState() { return { canGoBack: false, canGoForward: false, cwd: cwd.value } }

/* -----------------------------------------------
   Pager in the pane chrome
------------------------------------------------ */
const chrome = useWidgetChrome(() => isPaged.value)
const pagerRef = ref<InstanceType<typeof ItemsPager> | null>(null)

// Overlay mode hides the pager until Ctrl is held: say so once per session
// when a paged folder gets focus (the "never" choice is remembered).
let ctrlHintShown = false
function onRootFocusIn() {
  if (ctrlHintShown || !isPaged.value || chrome.mode.value !== 'overlay') return
  ctrlHintShown = true
  void showOnce('hint.items.ctrlPager', {
    id: 'items-ctrl-pager',
    text: 'Hold Ctrl to show the page controls.',
    timeoutMs: 8000,
    dedupe: 'replace',
  })
}

/* -----------------------------------------------
   Suggesting pages for very large folders
   Once per visit of a folder with no paging record. "Use pages" / "Not now"
   are recorded for that folder (as if chosen in the Layout menu); "Never"
   turns the suggestion off everywhere.
------------------------------------------------ */
const pagingSuggestAt = computed(() => {
  const n = Number(props.config?.view?.pagingSuggestAt)   // settings later
  return Number.isInteger(n) && n > 0 ? n : 50_000
})
let suggestedFor = ''

watch(
  () => `${listing.status.value}|${pagingState.value}|${cwd.value}|${total.value > pagingSuggestAt.value}`,
  () => {
    if (inDialog.value || props.placement?.context === 'sidebar') return
    if (listing.status.value !== 'ready' || pagingState.value !== 'none') return
    const n = total.value
    const path = cwd.value
    if (n <= pagingSuggestAt.value || !path || suggestedFor === path) return
    suggestedFor = path
    void showOnce('hint.items.suggestPaging', {
      id: 'items-suggest-paging',
      text: `This folder has ${n.toLocaleString()} items. Show it in pages?`,
      actions: [
        { id: 'paged', label: 'Use pages' },
        { id: 'single', label: 'Not now' },
      ],
      timeoutMs: 15000,
      dedupe: 'replace',
    }).then((res) => {
      if (res.type !== 'action' || cwd.value !== path) return
      const mode: ViewPaging['mode'] = res.actionId === 'paged' ? 'paged' : 'single'
      props.runAction?.({ type: 'setView', patch: { paging: { mode, pageSize: pageSize.value } } })
    })
  }
)

/* -----------------------------------------------
   Keeping the view across a remount (tab switch)
------------------------------------------------ */
function saveView() {
  const kept = shelf.value
  if (inDialog.value || !kept || kept.source !== source.value) return
  const a = itemView.captureAnchor(selection.focusIndex())
  const name = a ? rowAt(a.index)?.Name : undefined
  const st = selState.value
  const keepSelection = (!st.all && st.ids.size <= RESTORE_SELECTION_MAX) || (st.all && st.ids.size === 0)
  kept.view = {
    page: currentPage.value,
    anchor: a && name ? { name, offset: a.offset, edge: a.edge } : null,
    selection: keepSelection
      ? { all: st.all, ids: st.all ? [] : [...st.ids], focusId: st.focusId, anchorId: st.anchorId }
      : null,
  }
}

/** Resolves once the host has told us this folder's paging (or after `ms`). */
function pagingKnown(ms = 2000): Promise<void> {
  if (pagingState.value !== 'unknown') return Promise.resolve()
  return new Promise(resolve => {
    const timer = window.setTimeout(() => { stop(); resolve() }, ms)
    const stop = watch(pagingState, (st) => {
      if (st !== 'unknown') { clearTimeout(timer); stop(); resolve() }
    })
  })
}

async function restoreView(v: SavedView) {
  const s = source.value
  if (!s) return
  if (s.snapshot().version === 0) await waitForVersion(s, 0)
  await pagingKnown()               // page math needs the folder's paging
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))   // list measured
  if (s !== source.value) return

  if (v.selection) {
    if (v.selection.all) selection.selectAll()
    else if (v.selection.ids.length) {
      selection.setIds(v.selection.ids, { focusId: v.selection.focusId, anchorId: v.selection.anchorId })
    }
  }

  if (v.anchor) {
    const [index] = await s.find([v.anchor.name])
    if (s !== source.value) return
    if (index >= 0) {
      itemView.restoreAnchor({ index, offset: v.anchor.offset, edge: v.anchor.edge }, index)
      return
    }
  }
  pageIndex.value = v.page
}

/* -----------------------------------------------
   Status line
------------------------------------------------ */
const statusText = computed(() => {
  const s = listing.snapshot.value
  if (!merged.value.rpath) return '(no path)'
  if (s.status === 'error') {
    switch (s.error?.code) {
      case 'E_ACCESS_DENIED': return 'Access to this folder was denied.'
      case 'E_NOT_FOUND': return 'This folder no longer exists.'
      default: return s.error?.message || 'The folder could not be read.'
    }
  }
  if (s.status === 'loading' && s.total === 0) {
    return s.progress ? `Reading folder… ${s.progress.scanned.toLocaleString()} items` : 'Loading…'
  }
  return ''
})
const statusIsError = computed(() => listing.snapshot.value.status === 'error')

/* -----------------------------------------------
   Theme
------------------------------------------------ */
const hostVars = computed(() => ({
  '--items-border':     props.theme?.border    || 'var(--border, #555)',
  '--items-fg':         props.theme?.fg        || 'var(--fg, #eee)',
  '--items-bg':         props.theme?.bg        || 'var(--surface-2, transparent)',
  '--items-header-sep': props.theme?.headerSep || 'rgba(255,255,255,.22)',
}) as Record<string, string>)

/* -----------------------------------------------
   Messages / lifecycle
------------------------------------------------ */
onMounted(() => {
  if (pendingRestore) {
    const v = pendingRestore
    pendingRestore = null
    void restoreView(v)
  }
  on('fs:refresh-after-drop', (msg: any) => {
    const current = cwd.value || merged.value.rpath || ''
    const target = String(msg.payload?.target || '')
    if (current && target && normalizeDir(target) !== normalizeDir(current)) refresh()
  })
})

on('items:refresh', () => refresh())

on('items:startRename', (msg: any) => {
  const path = msg.payload?.path
  if (path) void startItemRename(path)
})

on('items:paste', () => { void pasteFromClipboard() })

on('items:reloadAndRename', async (msg: any) => {
  // A new file / folder was created: show it, then rename it in place.
  const path = msg.payload?.path
  if (!path) return
  if (await revealName(basename(path), { reload: true })) void startItemRename(path)
})

onBeforeUnmount(() => {
  saveView()      // before the selection goes away
  if (iconsRaf) cancelAnimationFrame(iconsRaf)
  if (selectionEventTimer) clearTimeout(selectionEventTimer)
  try { driver.destroy() } catch {}
  try { selection.destroy() } catch {}
  try { dispose() } catch {}
  cleanup()   // unregisters all on() subscriptions including those in useItemsDragDrop
  // The listing stays open on the lifecycle shelf (closed when the pane is
  // released); in the dialog useListing closes it.
})

defineExpose({ applyExternalCwd, getNavState, onWidgetAction })
</script>

<template>
  <div
    ref="rootEl"
    class="items-root"
    v-context-menu="contextMenuOptions"
    :style="hostVars"
    :class="{
      dragging: isDragging,
      'drag-selecting': marqueeActive,
      'drop-active': isDropActive,
    }"
    @focusin="onRootFocusIn"
  >
    <!-- Pager: rendered into the host's pane chrome (header strip or overlay slot) -->
    <Teleport v-if="isPaged && chrome.target.value" :to="chrome.target.value">
      <ItemsPager
        ref="pagerRef"
        :page="currentPage"
        :page-count="pageCount"
        :jump="pagerJump"
        :expanded="chrome.expanded.value"
        @go="goToPage"
      />
    </Teleport>

    <!-- Focusable scroller; captures keyboard for every layout -->
    <div
      class="items-scroll-container"
      :class="{ 'is-details': layout === 'details' }"
      ref="scrollEl"
      tabindex="0"
      @keydown="onKeyDown"
      @pointerdown.capture="onRowPointerDownCapture"
      @pointerdown="onScrollContainerPointerDown"
      @pointermove="onSurfacePointerMove"
      @pointerup="onSurfacePointerUp"
      @click.capture="onSurfaceClick"
      @scroll.passive="onPlaneScroll"
    >
      <!-- Marquee overlay for List/Grid (Details renders its own internally) -->
      <div
        v-if="layout !== 'details' && marqueeRect && (marqueeRect.w > 0 || marqueeRect.h > 0)"
        class="marquee"
        :style="{
          left: marqueeRect.x + 'px',
          top: marqueeRect.y + 'px',
          width: marqueeRect.w + 'px',
          height: marqueeRect.h + 'px'
        }"
      />

      <!-- Rows stay mounted while re-listing; only an empty view shows a message. -->
      <div v-if="statusText" :class="statusIsError ? 'err' : 'msg'">{{ statusText }}</div>

      <!-- DETAILS VIEW -->
      <ItemsDetailsLayout
        v-if="layout === 'details'"
        ref="detailsLayoutRef"
        :indices="itemIndices"
        :row-at="rowAt"
        :is-selected="isSelected"
        :icon-key-of="iconKeyOf"
        :total-height="vlist.totalHeight.value"
        :offset-y="vlist.offsetY.value"
        :bind-sizer="bindSizer"
        :bind-rows="bindRows"
        :icons-tick="iconsTick"
        :source-id="props.sourceId"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :initial-weights="colW"
        :folder-drop-target="folderDropTarget"
        :get-entry-style="getEntryStyle"
        :marquee-rect="marqueeRect"
        @row-down="onRowDown"
        @row-move="onRowMove"
        @row-up="onRowUp"
        @dblclick="onRowDblClick"
        @header-click="(key) => onHeaderClick(key)"
        @surface-pointer-down="onSurfacePointerDown"
        @surface-pointer-move="onSurfacePointerMove"
        @surface-pointer-up="onSurfacePointerUp"
        @surface-click="onSurfaceClick"
        @plane-scroll="onPlaneScroll"
        @weights-changed="(w) => colW = w"
      />

      <!-- LIST VIEW -->
      <ItemsListLayout
        v-else-if="layout === 'list'"
        :indices="itemIndices"
        :row-at="rowAt"
        :is-selected="isSelected"
        :icon-key-of="iconKeyOf"
        :total-height="vlist.totalHeight.value"
        :offset-y="vlist.offsetY.value"
        :bind-sizer="bindSizer"
        :bind-rows="bindRows"
        :icons-tick="iconsTick"
        :source-id="props.sourceId"
        :folder-drop-target="folderDropTarget"
        @row-down="onRowDown"
        @row-move="onRowMove"
        @row-up="onRowUp"
        @dblclick="onRowDblClick"
      />

      <!-- GRID VIEW -->
      <ItemsGridLayout
        v-else-if="layout === 'grid'"
        :indices="itemIndices"
        :row-at="rowAt"
        :is-selected="isSelected"
        :icon-key-of="iconKeyOf"
        :total-height="vlist.totalHeight.value"
        :offset-y="vlist.offsetY.value"
        :bind-sizer="bindSizer"
        :bind-rows="bindRows"
        :icons-tick="iconsTick"
        :source-id="props.sourceId"
        :columns="cols"
        :folder-drop-target="folderDropTarget"
        :S="S"
        @row-down="onRowDown"
        @row-move="onRowMove"
        @row-up="onRowUp"
        @dblclick="onRowDblClick"
      />
    </div>
  </div>
</template>

<style scoped>
.items-root.drop-active {
  outline: 2px dashed rgba(255, 255, 255, 0.4);
  outline-offset: -2px;
}

/* ================= THEME / ROOT ================= */
.items-root{
  font-size:var(--font-md);
  color:var(--items-fg);
  --local-font-sm:calc(1em * .85);
  --local-font-md:1em;
  --local-font-lg:calc(1em * 1.15);
  --local-spacing:var(--space-sm);
  --local-radius:var(--radius-md);

  /* gutters for marquee space inside the scroller */
  --items-gutter-left: 5%;
  --items-gutter-right: 5%;

  /* column separator color */
  --items-col-sep: color-mix(in oklab, var(--fg, #fff) 12%, transparent);

  /* Alignment hooks (app can override per-widget via CSS vars) */
  --items-row-text-align: left;
  --items-name-text-align: left;

  height:100%;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  box-sizing:border-box;
  position:relative;
}

/* Scroller: focusable, with left/right gutters. No block padding: the top
   gap is part of the virtual rows (contentOffset), so row math stays exact. */
.items-scroll-container{
  flex:1;
  overflow-y:auto;
  overflow-x:hidden;
  position:relative;
  padding-inline: var(--items-gutter-left, 5%) var(--items-gutter-right, 5%);
  z-index:1;
  outline:none;
  border-top: 1px solid var(--items-header-sep);
  border-bottom: 1px solid var(--items-header-sep);
  border-radius: var(--local-radius);
}
.items-scroll-container:hover{ overscroll-behavior:contain; }

.items-scroll-container.is-details{
  overflow: hidden;            /* the Details layout scrolls its own rows */
  padding: 0;
  border-top: 0;
  border-bottom: 0;
}

.marquee{
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 2;
  border: 1px solid var(--accent,#4ea1ff);
  background: color-mix(in oklab, var(--accent,#4ea1ff) 18%, transparent);
  border-radius: 4px;
}

.items-root.dragging{ user-select:none; }

.drag-selecting { user-select: none; }

/* ================ Messages ================ */
.msg,.err{ padding:var(--space-md); font-size:var(--local-font-md); }
.err{ color:#f77; }
</style>