<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from '/runtime/vue.js'
import { createSingleResizer, createClickOrDrag } from '/src/widgets/resize-helper/resize-helper'
import type {
  FavoriteEntry,
  FavoritesConfig,
  FavoriteTreeNode,
} from '/src/widgets/contracts/favorites'
import {
  getFavorites,
  getGlobalFavorites,
  addFavorite,
  addFolder,
  removeFavorite,
  removeFolder,
  applyFavoritesMove,
} from '/src/widgets/favorites/service'

import { getCurrentPath } from '/src/widgets/nav/index'
import { sendWidgetMessage, onWidgetMessage } from '/src/widgets/instances'
import {
  snapshotFromNodes,
  type SortableNodeRef,
} from '/src/widgets/sortable/engine'

import {
  createSortableDriver,
  type SortableModelAdapter,
  type SortableGeometryAdapter,
  type MoveEvent,
  type SortableDriver,
  type DropIntent,
} from '/src/widgets/sortable/driver'

import {
  createSortableVisuals,
  type SortableVisuals,
} from '/src/widgets/sortable/ui-adapter'


type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

type MenuRow = {
  id: string
  type: 'folder' | 'item'
  label: string
  depth: number
  path?: string
}

type OpenMenu = {
  folderId: string | null
  label: string
  rows: MenuRow[]
  top: number
  left: number
}

// A "root row" in the sidebar list: either a folder node or a root-level item favorite
type RootRow =
  | { kind: 'folder'; node: FavoriteTreeNode }
  | { kind: 'item';   entry: FavoriteEntry }

type FavoritesNodeKind = 'folder' | 'item'

function parseRootRowId(id: RootRowId): { kind: FavoritesNodeKind; key: string } {
  if (id.startsWith('folder:')) {
    return { kind: 'folder', key: id.slice('folder:'.length) }
  }
  if (id.startsWith('item:')) {
    return { kind: 'item', key: id.slice('item:'.length) }
  }
  // Fallback: treat as item path
  return { kind: 'item', key: id }
}

// Standard widget props shape (same pattern as Items)
const props = defineProps<{
  sourceId: string
  config?: FavoritesConfig | { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'
    size?: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean
}>()

// Use the sourceId as our bus instance identifier for now
const instanceId = props.sourceId

function broadcastFavoritesChanged(
  reason: 'add' | 'remove' | 'move' | 'folder-add' | 'folder-remove' | 'other' = 'other'
) {
  sendWidgetMessage({
    from: instanceId,
    topic: 'favorites:changed',
    payload: { reason },
  })
}

const emit = defineEmits<{
  (e: 'updateConfig', config: FavoritesConfig | any): void
  (e: 'event', payload: any): void
}>()

const sidebarStripEl = ref<HTMLElement | null>(null)
const toolbarStripEl = ref<HTMLElement | null>(null)

// Optional: if you have a clear parent container that defines max available space
const sidebarContainerEl = ref<HTMLElement | null>(null)
const toolbarContainerEl = ref<HTMLElement | null>(null)
  
const toolbarRightHandle = createClickOrDrag({
  onClick: () => toolbarScrollByPage(1),
  onDragStart: (e) => onToolbarStripResizeDown(e),
})

// Ghost + insertion bar visuals
let ghostEl: HTMLElement | null = null
let insertBarEl: HTMLElement | null = null
let dragOffsetX = 0
let dragOffsetY = 0

const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const lastDropIntent = ref<DropIntent | null>(null)

// Hover-to-open while dragging
let hoverFolderId: RootRowId | null = null
let hoverTimer: number | null = null
const HOVER_OPEN_DELAY = 450 // ms

const toolbarHasOverflow = ref(false)
const toolbarAtStart = ref(true)
const toolbarAtEnd = ref(true)

let toolbarScrollScheduled = false
function updateToolbarOverflowState() {
  const el = toolbarStripEl.value?.querySelector('.favorites-toolbar') as HTMLElement | null
  if (!el) return

  const eps = 2
  const sw = Math.ceil(el.scrollWidth)
  const cw = Math.ceil(el.clientWidth)
  const sl = Math.ceil(el.scrollLeft)

  toolbarHasOverflow.value = sw - cw > eps
  toolbarAtStart.value = sl <= eps
  toolbarAtEnd.value = sw - (sl + cw) <= eps
}

function onToolbarScroll() {
  if (toolbarScrollScheduled) return
  toolbarScrollScheduled = true
  requestAnimationFrame(() => {
    toolbarScrollScheduled = false
    updateToolbarOverflowState()
  })
}

function toolbarScrollByPage(dir: -1 | 1) {
  const el = toolbarStripEl.value?.querySelector('.favorites-toolbar') as HTMLElement | null
  if (!el) return
  const step = Math.max(80, Math.round(el.clientWidth * 0.8))
  el.scrollBy({ left: dir * step, behavior: 'smooth' })
}

function onToolbarWheel(e: WheelEvent) {
  const el = toolbarStripEl.value?.querySelector('.favorites-toolbar') as HTMLElement | null
  if (!el) return
  if (!toolbarHasOverflow.value) return

  // Trackpads often send deltaX already; mouse wheels send deltaY.
  const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY

  // Only steal the wheel if we can actually scroll horizontally
  if (dx !== 0) {
    el.scrollLeft += dx
    e.preventDefault()
  }
}


// ---- Config plumbing ----
const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

// group still exists in config, but service ignores it for now
const group      = computed(() => (cfg.value.data as any).group ?? 'default')
const showLabels = computed(() => cfg.value.data.showLabels !== false)
const maxVisible = computed(() => cfg.value.data.maxVisible ?? 24)

const isSidebar  = computed(() => props.placement?.context === 'sidebar')
const layout     = computed(() =>
  cfg.value.view.layout ?? (isSidebar.value ? 'list' : 'toolbar')
)
const dense      = computed(() => !!cfg.value.view.dense)
const showIcons  = computed(() => cfg.value.view?.showIcons !== false)

// ---- Resizable strip (sidebar list height + toolbar width) ----
const BASE_ROW_HEIGHT = 26
const MIN_ROWS = 2
const MAX_ROWS = 20

// Per-widget "size" for the favorites strip
const favStripSize = ref<number | null>(null)
const sidebarRowCount = computed(() => displayRootRows.value.length)

function getSidebarMinPx() {
  return MIN_ROWS * BASE_ROW_HEIGHT
}

function getSidebarMaxPx() {
  const contentMax = Math.max(
    getSidebarMinPx(),
    sidebarRowCount.value * BASE_ROW_HEIGHT
  )

  const containerMax = sidebarContainerEl.value
    ? Math.max(getSidebarMinPx(), sidebarContainerEl.value.getBoundingClientRect().height - 16)
    : Number.POSITIVE_INFINITY

  return Math.min(contentMax, containerMax)
}


const sidebarListStyle = computed(() => {
  if (!isSidebar.value || layout.value !== 'list') return {}

  const px = favStripSize.value
  if (!px) {
    // default: fill available space via flex (current behavior)
    return {}
  }

  // When user has resized: force a fixed height & stop flex-stretch
  return {
    height: px + 'px',
    maxHeight: px + 'px',
    flex: '0 0 auto',
  }
})

const DEFAULT_STEP_PX = 64
let toolbarSnapPoints: number[] = []

function buildToolbarSnapPoints() {
  const strip = toolbarStripEl.value
  if (!strip) return []

  // IMPORTANT: give your toolbar items a class so we can query them reliably
  const kids = Array.from(strip.querySelectorAll<HTMLElement>('.fav-toolbar-item'))

  const pts: number[] = []
  let sum = 0
  for (const k of kids) {
    sum += k.getBoundingClientRect().width
    pts.push(sum)
  }
  return pts
}

function snapToolbarWidth(raw: number, points: number[]) {
  if (points.length === 0) {
    return Math.round(raw / DEFAULT_STEP_PX) * DEFAULT_STEP_PX
  }

  const maxPoint = points[points.length - 1]
  if (raw > maxPoint) {
    const extra = raw - maxPoint
    const stepped = Math.round(extra / DEFAULT_STEP_PX) * DEFAULT_STEP_PX
    return maxPoint + stepped
  }

  // nearest point
  let best = points[0]
  let bestDist = Math.abs(raw - best)
  for (const p of points) {
    const d = Math.abs(raw - p)
    if (d < bestDist) { best = p; bestDist = d }
  }
  return best
}


const toolbarStripStyle = computed(() => {
  if (isSidebar.value || layout.value !== 'toolbar') return {}

  const px = favStripSize.value
  if (!px) {
    // No user resize yet → let toolbar row decide
    return {}
  }

  return {
    width: px + 'px',
    maxWidth: px + 'px',
    flex: '0 0 auto',
  }
})

const favStripSizePx = computed(() =>
  favStripSize.value == null ? undefined : `${Math.round(favStripSize.value)}px`
)

// Vertical resizer for sidebar list (snaps to whole rows)

const sidebarListResizer = createSingleResizer({
  orientation: 'vertical',
  getInitialValue: () =>
    Math.round(sidebarStripEl.value?.getBoundingClientRect().height ?? (favStripSize.value ?? 4 * BASE_ROW_HEIGHT)),
  apply: (newPx) => {
    const MIN = getSidebarMinPx()
    const MAX = getSidebarMaxPx()

    let clamped = Math.max(MIN, Math.min(MAX, newPx))
    clamped = Math.round(clamped / BASE_ROW_HEIGHT) * BASE_ROW_HEIGHT

    favStripSize.value = clamped
  },
})

function onSidebarListResizeDown(e: MouseEvent | PointerEvent) {
  sidebarListResizer.start(e)
}


// Horizontal resizer for toolbar strip
const toolbarStripResizer = createSingleResizer({
  orientation: 'horizontal',
  getInitialValue: () =>
    Math.round(toolbarStripEl.value?.getBoundingClientRect().width ?? (favStripSize.value ?? 260)),
  apply: (newPx) => {
    const snapped = snapToolbarWidth(newPx, toolbarSnapPoints)

    const MIN = 80
    const MAX = toolbarContainerEl.value
      ? Math.max(MIN, toolbarContainerEl.value.getBoundingClientRect().width - 16)
      : 4000

    favStripSize.value = Math.max(MIN, Math.min(MAX, snapped))
  },
})

function onToolbarStripResizeDown(e: MouseEvent | PointerEvent) {
  // Pattern A reinforcement: lock the starting width to current DOM width (no jump)
  if (toolbarStripEl.value) {
    favStripSize.value = Math.round(toolbarStripEl.value.getBoundingClientRect().width)
    toolbarSnapPoints = buildToolbarSnapPoints()
  } else {
    toolbarSnapPoints = []
  }
  toolbarStripResizer.start(e)
}



const dropTargetFolderId = computed<string | null>(() => {
  const intent = lastDropIntent.value
  if (!intent || intent.placement !== 'inside' || !intent.targetId) {
    return null
  }
  const id = String(intent.targetId)
  return id.startsWith('folder:') ? id : null
})

// Flat favorites (items); service is still the source of truth for item order
const favorites = ref<FavoriteEntry[]>([])

// Tree for folders + nested items
const fullTree = ref<FavoriteTreeNode[]>([])

// Mixed root rows: folders + root-level items, in tree order
const rootRows = ref<RootRow[]>([])

// --------------------------------------------------------------
// Helpers to build roots / base list
// --------------------------------------------------------------
function buildRootRows(
  tree: FavoriteTreeNode[],
  flatItems: FavoriteEntry[]
): RootRow[] {
  const byPath = new Map<string, FavoriteEntry>()
  for (const f of flatItems) {
    if (f.path) byPath.set(f.path, f)
  }

  const rows: RootRow[] = []

  for (const n of tree) {
    if (n.kind === 'folder') {
      rows.push({ kind: 'folder', node: n })
    } else if (n.kind === 'item') {
      const path = (n as any).path as string | undefined
      if (!path) continue
      const entry = byPath.get(path) ?? ({
        path,
        label: (n as any).label,
      } as FavoriteEntry)
      rows.push({ kind: 'item', entry })
    }
  }

  return rows
}

/**
 * Root-visible favorites for toolbar / flat list:
 * - If we have a tree, hide items that live inside folders.
 * - If we don't have a tree yet, show all favorites.
 */
function baseList(): FavoriteEntry[] {
  const tree = fullTree.value
  if (!tree.length) {
    return favorites.value
  }

  const nestedPaths = new Set<string>()

  const walk = (nodes: FavoriteTreeNode[], insideFolder: boolean) => {
    for (const n of nodes) {
      if (n.kind === 'item') {
        if (insideFolder && (n as any).path) {
          nestedPaths.add((n as any).path)
        }
      } else if (n.kind === 'folder') {
        const children = (n as any).children || []
        if (Array.isArray(children) && children.length) {
          walk(children, true)
        }
      }
    }
  }

  walk(tree, false)

  return favorites.value.filter(f => !nestedPaths.has(f.path))
}

// --------------------------------------------------------------
// SORTABLE: single mixed list (folders + root items)
// New version using sortable engine + driver
// --------------------------------------------------------------
const listEl = ref<HTMLElement | null>(null)
const toolbarEl = ref<HTMLElement | null>(null)

type RootRowId = string

function rowId(row: RootRow): RootRowId {
  return row.kind === 'folder'
    ? `folder:${row.node.id}`
    : `item:${row.entry.path}`
}

// Map from row id -> actual DOM element, for hit-testing
const rowEls = new Map<RootRowId, HTMLElement>()

// Map from folderId -> menu container element (for empty-folder drops)
const menuContainers = new Map<string, HTMLElement>()

// Simple state for template bindings
const sortableState = ref<{ isDragging: boolean; draggingId: RootRowId | null }>({
  isDragging: false,
  draggingId: null,
})

// New driver + visuals
let driver: SortableDriver | null = null
let visuals: SortableVisuals | null = null
let activeContainer: HTMLElement | null = null
let activeLayout: 'list' | 'toolbar' | null = null

// Reuse the existing click-swallow flag
let dragJustEnded = false

function baseRootRows(): RootRow[] {
  return rootRows.value.slice()
}

const displayRootRows = computed(() => baseRootRows())

function setRowRef(row: RootRow, el: HTMLElement | null) {
  const id = rowId(row)
  if (el) {
    rowEls.set(id, el)
  } else {
    rowEls.delete(id)
  }
}

function menuRowId(row: MenuRow): RootRowId {
  if (row.type === 'folder') {
    return `folder:${row.id}`
  }
  // row.type === 'item'
  // Safety: row.path should always exist for items
  return `item:${row.path ?? ''}`
}

function setMenuRowRef(row: MenuRow, el: HTMLElement | null) {
  const id = menuRowId(row)
  if (!id) return

  if (el) {
    rowEls.set(id, el)
  } else {
    rowEls.delete(id)
  }
}

function teardownSortable() {
  driver?.cancel()
  driver = null
  visuals?.detach()
  visuals = null
  activeContainer = null
  activeLayout = null
}

function ensureSortable() {
  const containerEl = layout.value === 'list' ? listEl.value : toolbarEl.value
  if (!containerEl) {
    teardownSortable()
    return
  }

  const layoutKey: 'list' | 'toolbar' =
    layout.value === 'list' ? 'list' : 'toolbar'

  // If nothing important changed, keep existing driver
  if (driver && containerEl === activeContainer && layoutKey === activeLayout) {
    return
  }

  teardownSortable()

  activeContainer = containerEl
  activeLayout = layoutKey

 const model: SortableModelAdapter<RootRowId> = {
  snapshot() {
      const roots = baseRootRows()

      const rootNodes: SortableNodeRef[] = roots.map(row => ({
        id: rowId(row),
        parentId: null,
        sortMode: 'manual',
        isContainer: row.kind === 'folder',
      }))

      // Also include all rows from open menus as children of their folder
      const menuNodes: SortableNodeRef[] = []
      for (const menu of openMenus.value) {
        if (!menu.folderId) continue
        const parentId: RootRowId = `folder:${menu.folderId}`
        for (const r of menu.rows) {
          const id = menuRowId(r)
          if (!id) continue
          menuNodes.push({
            id,
            parentId,
            sortMode: 'manual',
            isContainer: r.type === 'folder',
          })
        }
      }

      return snapshotFromNodes([...rootNodes, ...menuNodes])
    },
      
    canStartDrag(id) {
      // Keep whatever logic you already had here (e.g. disable drag in read-only, etc.)
      return true
    },

    applyMove(move) {
      console.log('[DEBUG] model.applyMove called', { 
        moveId: move.id, 
        dragJustEnded, 
        openMenusCount: openMenus.value.length,
        timestamp: performance.now()
      })

      const intent = lastDropIntent.value
      if (!intent || !intent.targetId) {
        console.warn('[favorites] applyMove without intent – ignoring')
        return
      }

      const movedRowId = String(move.id) as RootRowId
      const targetRowId = String(intent.targetId) as RootRowId
      const placement = (intent.placement as any) ?? 'after'

      const { kind: movedKind, key: movedKey } = parseRootRowId(movedRowId)
      const { kind: targetKind, key: targetKey } = parseRootRowId(targetRowId)

      // FIX: Set dragJustEnded IMMEDIATELY so backdrop clicks are swallowed
      dragJustEnded = true
      console.log('[DEBUG] Set dragJustEnded = true in applyMove')

      void applyFavoritesMove({
        movedKind,
        movedKey,
        targetKind,
        targetKey,
        placement,
      })
        .then(async () => {
          console.log('[DEBUG] applyFavoritesMove completed, calling refreshRootFolders')
          await refreshRootFolders()
          await refreshFavorites()
          broadcastFavoritesChanged('move')
          console.log('[DEBUG] Refresh complete, openMenusCount:', openMenus.value.length)
        })
        .catch(err => {
          console.error('[favorites] applyFavoritesMove failed', err)
        })
    },
  }

  const geom: SortableGeometryAdapter = {
    hitTest(evt: MoveEvent) {
      const container = activeContainer
      if (!container) return null

      const x = (evt as PointerEvent).clientX
      const y = (evt as PointerEvent).clientY

      const containerRect = container.getBoundingClientRect()

      // 1) First, try to hit any known row (roots or menu rows)
      for (const [id, el] of rowEls) {
        const rect = el.getBoundingClientRect()
        if (
          x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom
        ) {
          const rel = layoutKey === 'list'
            ? (y - rect.top) / (rect.height || 1)
            : (x - rect.left) / (rect.width || 1)

          const relClamped = Math.min(Math.max(rel, 0), 1)
          return { id, relY: relClamped }
        }
      }

      // 2) If no row was hit, check if we're inside any open folder menu.
      //    This is how empty folders get an "inside" target.
      for (const [folderId, el] of menuContainers) {
        const rect = el.getBoundingClientRect()
        if (
          x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom
        ) {
          const id: RootRowId = `folder:${folderId}`
          // relY doesn't really matter for "inside", middle is fine
          return { id, relY: 0.5 }
        }
      }

      // 3) Fallbacks for “after last root row”
      const roots = baseRootRows()
      if (!roots.length) {
        return null
      }
      const last = roots[roots.length - 1]
      const lastId = rowId(last)

      // 3a) Pointer is inside the toolbar/list container but not on a pill:
      //     treat this as “after last root item”.
      if (
        x >= containerRect.left && x <= containerRect.right &&
        y >= containerRect.top && y <= containerRect.bottom
      ) {
        return { id: lastId, relY: 1 }
      }

      // 3b) Toolbar-only: pointer is in the vertical band of the row but
      //     *to the right* of the container → still “after last”.
      if (layoutKey === 'toolbar') {
        const inVerticalBand =
          y >= containerRect.top && y <= containerRect.bottom

        if (inVerticalBand && x > containerRect.right) {
          return { id: lastId, relY: 1 }
        }
      }

      return null
    },
  }



  visuals = createSortableVisuals({
    listEl: containerEl,
    getRowEl: id => rowEls.get(String(id)) ?? null,
  })

  driver = createSortableDriver({
    model,
    geom,
    events: {
      onState(s) {
        visuals?.onState(s)
        sortableState.value.isDragging = !!s.draggingId
        sortableState.value.draggingId = (s.draggingId as RootRowId | null) ?? null

        if (!s.draggingId) {
          teardownDragVisuals()
          clearHoverTimer()
        }
      },

      onPreview(intent, { blocked }) {
        visuals?.onPreview(intent, blocked)
        updateInsertBar(intent, blocked)
        handleDragHover(intent)
      },

      
      async onDrop(move, blocked) {
        console.log('[DEBUG] onDrop called', { 
          hasMove: !!move, 
          blocked, 
          dragJustEnded,
          openMenusCount: openMenus.value.length,
          timestamp: performance.now()
        })

        // Normal case: driver accepted the move and already called model.applyMove
        if (!blocked && move) {
          dragJustEnded = true
          console.log('[DEBUG] Set dragJustEnded = true in onDrop (normal path)')
          teardownDragVisuals()
          clearHoverTimer()
          return
        }

        // Fallback: driver blocked the move (likely because targetId isn't in the snapshot),
        // but we *do* have a meaningful drop intent we can apply at the tree level.
        const draggingId = sortableState.value.draggingId as RootRowId | null
        const intent = lastDropIntent.value   // ←← THIS is the important fix

        if (
          blocked &&
          draggingId &&
          intent &&
          intent.targetId
        ) {
          const targetRowId = String(intent.targetId) as RootRowId

          // If the target is *also* a root row, let the block stand:
          // we don't want to double-apply or fight the driver.
          const isRootTarget = baseRootRows().some(r => rowId(r) === targetRowId)
          if (!isRootTarget) {
            // FIX: Set dragJustEnded IMMEDIATELY at the start of fallback path
            // This ensures backdrop clicks are swallowed BEFORE async work completes
            dragJustEnded = true
            console.log('[DEBUG] Set dragJustEnded = true in onDrop (fallback - EARLY)')

            console.log('[DEBUG] Entering fallback path in onDrop')
            const { kind: movedKind, key: movedKey } = parseRootRowId(draggingId)
            const { kind: targetKind, key: targetKey } = parseRootRowId(targetRowId)
            const placement = (intent.placement as any) ?? 'after'

            try {
              await applyFavoritesMove({
                movedKind,
                movedKey,
                targetKind,
                targetKey,
                placement,
              })

              await refreshRootFolders()
              await refreshFavorites()
              broadcastFavoritesChanged('move')
            } catch (err) {
              console.error(
                '[favorites] applyFavoritesMove (fallback from onDrop) failed',
                err,
              )
            }
          }
        }

        teardownDragVisuals()
        clearHoverTimer()
      },
    },
  })


  visuals.attach()
}

function startRowDrag(row: RootRow, event: PointerEvent) {
  ensureSortable()
  if (!driver) return

  const id = rowId(row)

  // Create the ghost at the row's initial position
  setupGhostForRow(id, event)

  driver.startDrag(id, event)
  event.preventDefault()
}

function startMenuRowDrag(row: MenuRow, event: PointerEvent) {
  ensureSortable()
  if (!driver) return

  const id = menuRowId(row)
  if (!id) return

  setupGhostForRow(id as RootRowId, event)
  driver.startDrag(id as RootRowId, event)
  event.preventDefault()
}


function handleGlobalPointerMove(ev: PointerEvent) {
  if (ghostEl) {
    updateGhostPosition(ev)
  }
  driver?.pointerMove(ev)
}


function handleGlobalPointerUp(ev: PointerEvent) {
  driver?.pointerUp(ev)
}


// Clamp for toolbar visual max (uses root-visible items)
const visibleFavorites = computed(() =>
  baseList().slice(0, Math.max(1, maxVisible.value))
)

// Keep sortable in sync when rootRows change
watch(
  () =>
    rootRows.value
      .map(r =>
        r.kind === 'folder'
          ? `folder:${r.node.id}`
          : `item:${r.entry.path}`
      )
      .join('|'),
  () => ensureSortable()
)

// --------------------------------------------------------------
// ADD / EDIT DIALOG STATE (with folders)
// --------------------------------------------------------------
const showAddDialog = ref(false)
const newPath  = ref('')
const newLabel = ref('')

// 'item' = normal favorite, 'folder' = folder node
const addMode = ref<'item' | 'folder'>('item')

// '' = root, otherwise a folder id
const newParentId = ref<string>('')

type FolderOption = { id: string; label: string; depth: number }
const folderOptions = ref<FolderOption[]>([])

const addDialogTitle = computed(() =>
  addMode.value === 'folder' ? 'Add folder' : 'Add favorite'
)

const addButtonLabel = computed(() =>
  addMode.value === 'folder' ? 'Create' : 'Add'
)

function guessLabelFromPath(path: string): string {
  const p = (path || '').replace(/[\\/]+$/, '')
  if (!p) return ''
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

async function refreshFolderOptions() {
  try {
    const tree = await getGlobalFavorites()

    const opts: FolderOption[] = []

    const walk = (nodes: FavoriteTreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind === 'folder') {
          opts.push({ id: n.id, label: n.label, depth })
          walk(n.children, depth + 1)
        }
      }
    }

    walk(tree, 0)
    folderOptions.value = opts
  } catch (e) {
    console.error('[favorites] refreshFolderOptions failed:', e)
    // keep previous options if something goes wrong
  }
}

// Load tree and build rootRows from it
async function refreshRootFolders() {
  try {
    const tree = await getGlobalFavorites()
    fullTree.value = tree
    rootRows.value = buildRootRows(tree, favorites.value)

    // ✅ keep any open dropdowns in sync with the new tree
    refreshOpenMenusFromTree()
  } catch (e) {
    console.error('[favorites] refreshRootFolders failed', e)
    fullTree.value = []
    rootRows.value = []
    refreshOpenMenusFromTree() // also clears menus whose folders vanished
  }
}


function openAddDialog() {
  const base = getCurrentPath().trim()
  addMode.value = 'item'
  newPath.value = base
  newLabel.value = guessLabelFromPath(base)
  newParentId.value = '' // root by default

  void refreshFolderOptions()
  showAddDialog.value = true
}

function closeAddDialog() {
  showAddDialog.value = false
}

// --------------------------------------------------------------
// FOLDER MENU (overlay)
// --------------------------------------------------------------
function setMenuContainerRef(menu: OpenMenu, el: HTMLElement | null) {
  const folderId = menu.folderId
  if (!folderId) return

  if (el) {
    menuContainers.set(folderId, el)
  } else {
    menuContainers.delete(folderId)
  }
}

const openMenus = ref<OpenMenu[]>([])

// Helper to check if a folder menu is currently open
function isFolderMenuOpen(folderId: string): boolean {
  return openMenus.value.some(m => m.folderId === folderId)
}

function openFolderDropdown(folder: FavoriteTreeNode, event: MouseEvent) {
  const anchor = event.currentTarget as HTMLElement | null
  const rect = anchor?.getBoundingClientRect()

  const top = rect ? rect.bottom + 4 : 80

  let left: number
  if (rect) {
    if (isSidebar.value) {
      // Sidebar: shift menu so only ~half of it covers the sidebar
      left = rect.left + rect.width / 2
    } else {
      // Toolbar / grid: keep existing behavior
      left = rect.left
    }
  } else {
    left = 80
  }

  const rows = buildMenuRows(folder.children)

  // Toggle if same folder already open as root
  const existingRoot = openMenus.value[0]
  if (existingRoot && existingRoot.folderId === folder.id) {
    closeFolderMenu()
    return
  }

  openMenus.value = [
    {
      folderId: folder.id,
      label: folder.label,
      rows,
      top,
      left,
    },
  ]
}

function openFolderDropdownFromDrag(folder: FavoriteTreeNode, anchor: HTMLElement | null) {
  const rect = anchor?.getBoundingClientRect()
  const rows = buildMenuRows(folder.children)

  // --- Case 1: root-level folder (same behavior as before) ---
  if (isRootFolder(folder.id)) {
    const top = rect ? rect.bottom + 4 : 80
    const left = rect ? rect.left : 80

    const existingRoot = openMenus.value[0]
    if (existingRoot && existingRoot.folderId === folder.id) {
      // Already open as root → do nothing
      return
    }

    openMenus.value = [
      {
        folderId: folder.id,
        label: folder.label,
        rows,
        top,
        left,
      },
    ]
    return
  }

  // --- Case 2: nested folder inside an existing menu ---
  // Find which menu level contains this folder as a row
  const level = openMenus.value.findIndex(menu =>
    menu.rows.some(r => r.type === 'folder' && r.id === folder.id),
  )

  if (level === -1) {
    // Fallback: treat it like a root-level open if we somehow didn't find it
    const top = rect ? rect.bottom + 4 : 80
    const left = rect ? rect.left : 80
    openMenus.value = [
      {
        folderId: folder.id,
        label: folder.label,
        rows,
        top,
        left,
      },
    ]
    return
  }

  const parentMenu = openMenus.value[level]
  const top = rect ? rect.top : parentMenu?.top ?? 80
  const left = rect ? rect.right + 8 : (parentMenu?.left ?? 80) + 220

  const next = openMenus.value.slice(0, level + 1)
  next[level + 1] = {
    folderId: folder.id,
    label: folder.label,
    rows,
    top,
    left,
  }

  openMenus.value = next
}


function closeFolderMenu() {
  openMenus.value = []
}

function handleFolderMenuClick(row: MenuRow, event: MouseEvent, level: number) {
  if (row.type === 'folder') {
    const folder = findFolderNodeById(row.id)
    if (!folder) return

    const anchor = event.currentTarget as HTMLElement | null
    const rect = anchor?.getBoundingClientRect()

    const parentMenu = openMenus.value[level]
    const top = rect ? rect.top : parentMenu?.top ?? 80
    const left = rect ? rect.right + 8 : (parentMenu?.left ?? 80) + 220

    const rows = buildMenuRows(folder.children)

    const next = openMenus.value.slice(0, level + 1)
    next[level + 1] = {
      folderId: folder.id,
      label: folder.label,
      rows,
      top,
      left,
    }
    openMenus.value = next
    return
  }

  // Leaf item
  if (!row.path) return
  openFavorite({ path: row.path, label: row.label }, event)
  closeFolderMenu()
}

// --------------------------------------------------------------
// LOAD FROM SERVICE
// --------------------------------------------------------------
async function refreshFavorites() {
  loading.value = true
  error.value = null

  try {
    const svc = await getFavorites(props.sourceId)
    if (Array.isArray(svc)) {
      favorites.value = svc
    } else {
      const fromCfg = (cfg.value.data as any)?.entries
      favorites.value = Array.isArray(fromCfg) ? fromCfg : []
    }

    if (fullTree.value.length) {
      rootRows.value = buildRootRows(fullTree.value, favorites.value)
    }
  } catch (e: any) {
    console.error('[favorites] getFavorites failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')

    const fromCfg = (cfg.value.data as any)?.entries
    favorites.value = Array.isArray(fromCfg) ? fromCfg : []

    if (fullTree.value.length) {
      rootRows.value = buildRootRows(fullTree.value, favorites.value)
    }
  } finally {
    loading.value = false
  }
}

let offBus: (() => void) | null = null

onMounted(() => {
  console.log('[Widget] sourceId on mount:', props.sourceId)
  void refreshFavorites()
  void refreshRootFolders()

  // Subscribe to global favorites change broadcasts
  offBus = onWidgetMessage(undefined, (msg) => {
    if (msg.topic !== 'favorites:changed') return
    if (msg.from === instanceId) return  // ignore our own events

    console.log('[favorites] Received favorites:changed from', msg.from, 'reason:', msg.payload?.reason)
    void refreshFavorites()
    void refreshRootFolders()
  })

  // initialize from actual DOM so the handle doesn't "jump" on first grab
  if (favStripSize.value == null) {
    const el = layout.value === 'toolbar' ? toolbarStripEl.value : sidebarStripEl.value
    if (el) favStripSize.value = Math.round(el.getBoundingClientRect()[layout.value === 'toolbar' ? 'width' : 'height'])
  }

  window.addEventListener('pointermove', handleGlobalPointerMove)
  window.addEventListener('pointerup', handleGlobalPointerUp)

  nextTick(() => {
    updateToolbarOverflowState()
    const el = toolbarStripEl.value?.querySelector('.favorites-toolbar') as HTMLElement | null
    el?.addEventListener('scroll', onToolbarScroll, { passive: true })
    el?.addEventListener('wheel', onToolbarWheel as any, { passive: false })
  })
})

onBeforeUnmount(() => {
  const el = toolbarStripEl.value?.querySelector('.favorites-toolbar') as HTMLElement | null
  el?.removeEventListener('scroll', onToolbarScroll as any)
  el?.removeEventListener('wheel', onToolbarWheel as any)

  window.removeEventListener('pointermove', handleGlobalPointerMove)
  window.removeEventListener('pointerup', handleGlobalPointerUp)

  teardownSortable()
  rowEls.clear()
  clearHoverTimer()

  offBus?.()
  offBus = null
})

watch(group, () => {
  void refreshFavorites()
  void refreshRootFolders()
})

watch(
  () => displayRootRows.value.length,
  () => requestAnimationFrame(updateToolbarOverflowState)
)

const hostVars = computed(() => ({
  '--fav-bg': props.theme?.bg         || 'var(--surface-1, #141414)',
  '--fav-fg': props.theme?.fg         || 'var(--fg, #eee)',
  '--fav-border': props.theme?.border || 'rgba(255,255,255,.14)',
}))

// --------------------------------------------------------------
// NAV
// --------------------------------------------------------------
function openFavorite(fav: FavoriteEntry, event?: MouseEvent) {
  // If a drag just ended, swallow this click
  if (dragJustEnded) {
    dragJustEnded = false
    event?.preventDefault()
    return
  }

  const path = fav.path?.trim()
  if (!path) return

  if (props.runAction) {
    props.runAction({ type: 'nav', to: path, sourceId: props.sourceId })
  } else {
    emit('event', { type: 'openPath', payload: path })
  }
}

// --------------------------------------------------------------
// EDITING HELPERS
// --------------------------------------------------------------
function isRootFolder(folderId: string): boolean {
  return fullTree.value.some(
    n => n.kind === 'folder' && n.id === folderId,
  )
}

function buildMenuRows(nodes: FavoriteTreeNode[]): MenuRow[] {
  const rows: MenuRow[] = []
  for (const n of nodes) {
    if (n.kind === 'folder') {
      rows.push({
        id: n.id,
        type: 'folder',
        label: n.label,
        depth: 0, // one level per dropdown → depth 0 inside each
      })
    } else {
      rows.push({
        id: n.id,
        type: 'item',
        label: n.label,
        depth: 0,
        path: (n as any).path,
      })
    }
  }
  return rows
}

function findFolderNodeById(id: string | null): FavoriteTreeNode | null {
  if (!id) return null
  const stack: FavoriteTreeNode[] = [...fullTree.value]

  while (stack.length) {
    const node = stack.pop()!
    if (node.kind === 'folder') {
      if (node.id === id) return node
      for (const child of node.children) {
        if (child.kind === 'folder') stack.push(child)
      }
    }
  }

  return null
}

function refreshOpenMenusFromTree() {
  console.log('[DEBUG] refreshOpenMenusFromTree called', {
    openMenusCount: openMenus.value.length,
    menuFolderIds: openMenus.value.map(m => m.folderId),
    timestamp: performance.now()
  })

  if (!openMenus.value.length) return

  const next: OpenMenu[] = []

  for (const menu of openMenus.value) {
    // Menus tied to a folderId need to be rebuilt
    if (!menu.folderId) {
      next.push(menu)
      continue
    }

    const folder = findFolderNodeById(menu.folderId)
    if (!folder) {
      // Folder no longer exists → drop that menu level
      console.log('[DEBUG] Folder no longer exists, dropping menu:', menu.folderId)
      continue
    }

    next.push({
      ...menu,
      label: folder.label,
      rows: buildMenuRows(folder.children),
      // keep top/left so the menu doesn't jump
    })
  }

  console.log('[DEBUG] refreshOpenMenusFromTree complete', {
    oldCount: openMenus.value.length,
    newCount: next.length
  })

  openMenus.value = next
}


async function confirmAddFavorite() {
  const path = newPath.value.trim()
  const label = newLabel.value.trim()
  const parentId = newParentId.value || null

  saving.value = true
  error.value = null
   try {
    if (addMode.value === 'folder') {
      if (!label) return
      await addFolder(label, parentId)
      await refreshFolderOptions()
      await refreshRootFolders()
    } else {
      if (!path) return
      await addFavorite(path, label || undefined, parentId)
      await refreshRootFolders()
    }

    await refreshFavorites()

    // Notify other favorites widgets
    broadcastFavoritesChanged(addMode.value === 'folder' ? 'folder-add' : 'add')

    closeAddDialog()
  } catch (e: any) {
    console.error('[favorites] addFavorite/addFolder failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  } finally {
    saving.value = false
  }
}

async function handleRemoveFolder(folderId: string) {
  const ok = window.confirm(
    'Delete this folder and ALL nested favorites inside it? This cannot be undone.'
  )
  if (!ok) return

  error.value = null
  try {
    await removeFolder(folderId)

    // Reload tree + flat favorites so UI is fully in sync
    await refreshRootFolders()
    await refreshFavorites()

    // 🔔 Notify other favorites widgets
    broadcastFavoritesChanged('folder-remove')
  } catch (e: any) {
    console.error('[favorites] removeFolder failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  }
}


async function handleRemoveFavorite(path: string) {
  error.value = null
  try {
    await removeFavorite(path)

    // Reload tree + flat favorites so UI is fully in sync
    await refreshRootFolders()
    await refreshFavorites()

    broadcastFavoritesChanged('remove')
  } catch (e: any) {
    console.error('[favorites] removeFavorite failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  }
}

function teardownDragVisuals() {
  if (ghostEl && ghostEl.parentNode) {
    ghostEl.parentNode.removeChild(ghostEl)
  }
  ghostEl = null

  if (insertBarEl && insertBarEl.parentNode) {
    insertBarEl.parentNode.removeChild(insertBarEl)
  }
  insertBarEl = null
}

function setupGhostForRow(id: RootRowId, ev: PointerEvent) {
  // Clean up any old ghost/bar just in case
  teardownDragVisuals()

  const row = rowEls.get(id)
  if (!row) return

  const rect = row.getBoundingClientRect()

  ghostEl = row.cloneNode(true) as HTMLElement
  ghostEl.style.position = 'fixed'
  ghostEl.style.left = '0'
  ghostEl.style.top = '0'
  ghostEl.style.width = `${rect.width}px`
  ghostEl.style.height = `${rect.height}px`
  ghostEl.style.pointerEvents = 'none'
  ghostEl.style.opacity = '0.85'
  ghostEl.style.zIndex = '9999'
  ghostEl.classList.add('gex-fav-ghost')

  document.body.appendChild(ghostEl)

  // pointer offset so the ghost doesn't "jump"
  dragOffsetX = ev.clientX - rect.left
  dragOffsetY = ev.clientY - rect.top

  // initial position
  const x = ev.clientX - dragOffsetX
  const y = ev.clientY - dragOffsetY
  ghostEl.style.transform = `translate(${x}px, ${y}px)`
}

function updateGhostPosition(ev: PointerEvent) {
  if (!ghostEl) return
  const x = ev.clientX - dragOffsetX
  const y = ev.clientY - dragOffsetY
  ghostEl.style.transform = `translate(${x}px, ${y}px)`
}
function ensureInsertBar(container: HTMLElement) {
  if (insertBarEl) return
  insertBarEl = document.createElement('div')
  insertBarEl.className = 'gex-fav-insert-bar'
  insertBarEl.style.position = 'absolute'
  insertBarEl.style.pointerEvents = 'none'
  insertBarEl.style.zIndex = '9998'
  container.appendChild(insertBarEl)
}

function updateInsertBar(
  intent: DropIntent | null,
  blocked: boolean
) {
  const container = activeContainer
  if (!container) return

  if (!intent) {
    if (insertBarEl) insertBarEl.style.display = 'none'
    return
  }

  const targetEl = rowEls.get(String(intent.targetId))
  if (!targetEl) {
    if (insertBarEl) insertBarEl.style.display = 'none'
    return
  }

  ensureInsertBar(container)
  if (!insertBarEl) return

  // For now, treat 'inside' as 'after' in flat root mode.
  let placement = intent.placement
  if (placement === 'inside') placement = 'after'

  const containerRect = container.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()

  insertBarEl.style.display = 'block'
  insertBarEl.classList.toggle('gex-fav-insert-bar-blocked', blocked)

  if (activeLayout === 'list') {
    // Horizontal bar spanning the list width
    const y =
      placement === 'before'
        ? targetRect.top - containerRect.top
        : targetRect.bottom - containerRect.top

    insertBarEl.style.left = '0px'
    insertBarEl.style.width = `${containerRect.width}px`
    insertBarEl.style.top = `${y - 1}px`
    insertBarEl.style.height = '2px'
  } else {
    // Toolbar → vertical bar
    const x =
      placement === 'before'
        ? targetRect.left - containerRect.left
        : targetRect.right - containerRect.left

    insertBarEl.style.top = '0px'
    insertBarEl.style.height = `${containerRect.height}px`
    insertBarEl.style.left = `${x - 1}px`
    insertBarEl.style.width = '2px'
  }
}

function clearHoverTimer() {
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer)
    hoverTimer = null
  }
  hoverFolderId = null
}

function handleDragHover(intent: DropIntent | null) {
  // Keep last intent for applyMove
  lastDropIntent.value = intent ?? null

  if (!intent || !intent.targetId || intent.placement !== 'inside') {
    clearHoverTimer()
    return
  }

  const id = String(intent.targetId) as RootRowId
  if (!id.startsWith('folder:')) {
    clearHoverTimer()
    return
  }

  // If we're still on the same folder, do nothing – timer already running or menu open
  if (hoverFolderId === id) {
    return
  }

  hoverFolderId = id
  clearHoverTimer()

  hoverTimer = window.setTimeout(() => {
    const rowEl = rowEls.get(id) ?? null
    const folderId = id.slice('folder:'.length)
    const folderNode = findFolderNodeById(folderId)
    if (!rowEl || !folderNode) return

    openFolderDropdownFromDrag(folderNode, rowEl)
  }, HOVER_OPEN_DELAY)
}

function handleMenuBackdropClick() {
  console.log('[DEBUG] handleMenuBackdropClick called', { 
    dragJustEnded,
    openMenusCount: openMenus.value.length,
    timestamp: performance.now()
  })
  
  // Swallow the first click after a drag/drop so the menu doesn't close
  if (dragJustEnded) {
    dragJustEnded = false
    console.log('[DEBUG] Swallowed backdrop click (dragJustEnded was true)')
    return
  }
  
  console.log('[DEBUG] Closing folder menu from backdrop click')
  closeFolderMenu()
}


</script>


<template>
  <div
    class="favorites-root"
    :class="{
      'sidebar-mode': isSidebar,
      'toolbar-mode': !isSidebar && layout === 'toolbar',
      'edit-mode': !!editMode,
    }"
    :style="hostVars"
  >
    <!-- Add button: sidebar as full row, toolbar as inline pill -->
    <template v-if="isSidebar">
      <button
        type="button"
        class="add-favorite-btn"
        title="Add favorite or folder"
        @click="openAddDialog"
      >
        <span class="add-icon">+</span>
        <span class="add-label">Add favorite</span>
      </button>
    </template>



    <div v-if="loading" class="fav-msg">Loading…</div>
    <div v-else-if="error" class="fav-msg error">{{ error }}</div>
    <div
      v-else-if="!visibleFavorites.length && !rootRows.length"
      class="fav-msg empty"
    >
      (No favorites yet)
    </div>
    <template v-else>
      <!-- LIST layout (sidebar) -->
      <div
        v-if="layout === 'list'"
        ref="sidebarStripEl"
        class="favorites-list-wrapper"
        :style="sidebarListStyle"
      >
        <ul ref="listEl" class="favorites-list" :class="{ dense }">
          <li
            v-for="row in displayRootRows"
            :key="row.kind === 'folder'
              ? 'folder:' + row.node.id
              : 'item:' + row.entry.path"
            class="fav-row"
            :class="{
              'folder-row': row.kind === 'folder',
              'item-row': row.kind === 'item',
              'is-dragging':
                sortableState.isDragging &&
                sortableState.draggingId === (
                  row.kind === 'folder'
                    ? 'folder:' + row.node.id
                    : 'item:' + row.entry.path
                )
            }"
            :ref="el => setRowRef(row, el as HTMLElement | null)"
            @pointerdown.stop="startRowDrag(row, $event)"
          >
            <!-- Folder row -->
            <template v-if="row.kind === 'folder'"
              class="toolbar-folder-wrapper toolbar-sortable-item fav-toolbar-item">
              <button
                type="button"
                class="fav-btn folder-btn"
                @click="openFolderDropdown(row.node, $event)"
                :title="row.node.label"
              >
                <span class="fav-icon">📁</span>
                <span v-if="showLabels" class="fav-label">
                  {{ row.node.label }}
                </span>
              </button>

              <div class="fav-row-actions">
                <button
                  type="button"
                  class="icon-btn danger"
                  @pointerdown.stop
                  @click.stop="handleRemoveFolder(row.node.id)"
                  title="Delete folder and nested favorites"
                >
                  ✕
                </button>
              </div>
            </template>

            <!-- Item row -->
            <template v-else
            class="toolbar-item-wrapper toolbar-sortable-item fav-toolbar-item">
              <button
                type="button"
                class="fav-btn"
                @click="openFavorite(row.entry, $event)"
                :title="row.entry.label || row.entry.path"
              >
                <span v-if="showIcons" class="fav-icon">★</span>
                <span v-if="showLabels" class="fav-label">
                  {{ row.entry.label || row.entry.path }}
                </span>
              </button>

              <div class="fav-row-actions">
                <button
                  type="button"
                  class="icon-btn danger"
                  @pointerdown.stop
                  @click.stop="handleRemoveFavorite(row.entry.path)"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </template>
          </li>
        </ul>
      </div>


      <!-- Resize handle at bottom (sidebar list only) -->
      <div
        v-if="isSidebar && layout === 'list' && !editMode"
        class="fav-list-resize-handle"
        @pointerdown.prevent="onSidebarListResizeDown"
      />



      <!-- TOOLBAR layout (enhanced with folders & dropdowns) -->
      <div v-else ref="toolbarContainerEl" class="favorites-toolbar-container">
        <div class="fav-toolbar-viewport">
          <!-- LEFT hint -->
          <button
            v-if="toolbarHasOverflow && !toolbarAtStart"
            class="fav-scroll-hint left"
            type="button"
            title="Scroll left"
            @click.stop="toolbarScrollByPage(-1)"
          >
            ◀
          </button>

        <div ref="toolbarStripEl" class="favorites-toolbar-wrapper" :style="toolbarStripStyle">
          <div ref="toolbarEl" class="favorites-toolbar" :class="{ dense }">
              <!-- Add button at start of toolbar -->
              <button
                type="button"
                class="add-favorite-pill"
                title="Add favorite or folder"
                @click="openAddDialog"
              >
                <span class="add-icon">+</span>
              </button>
              
              <!-- Each root row: either a folder dropdown or an item pill -->
              <template v-for="(row, idx) in displayRootRows" :key="idx">
                <!-- Folder with dropdown -->
                <div
                  v-if="row.kind === 'folder'"
                  class="toolbar-folder-wrapper toolbar-sortable-item"
                  :ref="el => setRowRef(row, el as HTMLElement | null)"
                  @pointerdown.stop="startRowDrag(row, $event)"
                >
                  <button
                    type="button"
                    class="fav-pill folder-pill"
                    :class="{ 'menu-open': isFolderMenuOpen(row.node.id) }"
                    @click="openFolderDropdown(row.node, $event)"
                    :title="row.node.label"
                  >
                    <span class="fav-icon">📁</span>
                    <span v-if="showLabels" class="fav-label">{{ row.node.label }}</span>
                    <span class="dropdown-arrow">▼</span>
                  </button>
                  
                  <!-- Delete button -->
                  <button
                    type="button"
                    class="icon-btn danger toolbar-delete-btn"
                    @pointerdown.stop
                    @click.stop="handleRemoveFolder(row.node.id)"
                    title="Delete folder and nested favorites"
                  >
                    ✕
                  </button>
                </div>

                <!-- Regular item pill -->
                <div
                  v-else
                  class="toolbar-item-wrapper toolbar-sortable-item"
                  :ref="el => setRowRef(row, el as HTMLElement | null)"
                  @pointerdown.stop="startRowDrag(row, $event)"
                >
                  <button
                    type="button"
                    class="fav-pill"
                    @click="openFavorite(row.entry, $event)"
                    :title="row.entry.label || row.entry.path"
                  >
                    <span v-if="showIcons" class="fav-icon">★</span>
                    <span v-if="showLabels" class="fav-label">
                      {{ row.entry.label || row.entry.path }}
                    </span>
                  </button>
                  
                  <!-- Delete button -->
                  <button
                    type="button"
                    class="icon-btn danger toolbar-delete-btn"
                    @pointerdown.stop
                    @click.stop="handleRemoveFavorite(row.entry.path)"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>

          <!-- RIGHT hint (shown when more to the right) -->
        <button
          v-if="!editMode && toolbarHasOverflow && !toolbarAtEnd"
          class="fav-scroll-hint right is-resize-handle"
          type="button"
          title="Scroll right (drag to resize)"
          @pointerdown="toolbarRightHandle.onPointerDown"
        >
          ▶
        </button>

        <div
          v-else-if="!editMode"
          class="fav-toolbar-resize-handle"
          @pointerdown.prevent="onToolbarStripResizeDown"
        />
      </div>

    </template>

    <!-- Add favorite / folder popup (global modal) -->
    <teleport to="body">
      <div
        v-if="showAddDialog"
        class="fav-dialog-backdrop"
      >
        <div class="fav-dialog">
          <div class="fav-dialog-title">{{ addDialogTitle }}</div>

          <div class="fav-type-toggle">
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: addMode === 'item' }"
              @click="addMode = 'item'"
            >
              Favorite
            </button>
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: addMode === 'folder' }"
              @click="addMode = 'folder'"
            >
              Folder
            </button>
          </div>

          <label class="fav-dialog-field">
            <span class="field-label">Location</span>
            <select
              v-model="newParentId"
              class="fav-input"
            >
              <option value="">Root</option>
              <option
                v-for="opt in folderOptions"
                :key="opt.id"
                :value="opt.id"
              >
                {{ '  '.repeat(opt.depth) + opt.label }}
              </option>
            </select>
          </label>

          <label
            v-if="addMode === 'item'"
            class="fav-dialog-field"
          >
            <span class="field-label">Path</span>
            <input
              v-model="newPath"
              type="text"
              class="fav-input"
              placeholder="C:\\Users\\you\\Downloads or home:/games"
            />
          </label>

          <label class="fav-dialog-field">
            <span class="field-label">Label</span>
            <input
              v-model="newLabel"
              type="text"
              class="fav-input"
              :placeholder="addMode === 'folder' ? 'New folder' : 'Downloads'"
            />
          </label>

          <div class="fav-dialog-buttons">
            <button
              type="button"
              class="btn"
              @click="closeAddDialog"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn primary"
              :disabled="
                saving ||
                (addMode === 'item'
                  ? !newPath.trim()
                  : !newLabel.trim())
              "
              @click="confirmAddFavorite"
            >
              {{ addButtonLabel }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

  <!-- Folders menu overlay (stacked menus) -->
<teleport to="body">
  <div
    v-if="openMenus.length"
    class="fav-menu-backdrop"
    @click.self="handleMenuBackdropClick"
  >
    <div
      v-for="(menu, level) in openMenus"
      :key="menu.folderId ?? 'root-' + level"
      class="fav-menu"
      :style="{
        top: menu.top + 'px',
        left: menu.left + 'px',
      }"
      @click.stop
      :ref="el => setMenuContainerRef(menu, el as HTMLElement | null)"
    >

      <div class="fav-menu-title">
        {{ menu.label || 'Folder' }}
      </div>

      <div
        v-if="!menu.rows.length"
        class="fav-menu-empty"
        :class="{
          'is-drop-target':
            dropTargetFolderId === ('folder:' + (menu.folderId ?? '')),
        }"
      >
        No entries
      </div>


      <ul v-else class="fav-menu-list">
        <li
          v-for="row in menu.rows"
          :key="row.id"
          class="fav-menu-row"
          :class="{ 'is-folder': row.type === 'folder' }"
          :ref="el => setMenuRowRef(row, el as HTMLElement | null)"
        >
          <button
            type="button"
            class="fav-menu-btn"
            @pointerdown.stop="startMenuRowDrag(row, $event as PointerEvent)"
            @click="handleFolderMenuClick(row, $event, level)"
          >
            <span class="fav-menu-label">
              <span
                class="fav-menu-indent"
                :style="{ width: row.depth * 12 + 'px' }"
              />
              <span class="fav-menu-icon">
                <span v-if="row.type === 'folder'">📁</span>
                <span v-else>★</span>
              </span>
              <span class="fav-menu-text">
                {{ row.label }}
              </span>
            </span>
          </button>

          <!-- NEW: inline delete actions -->
          <div class="fav-menu-row-actions">
            <!-- Delete folder -->
            <button
              v-if="row.type === 'folder'"
              type="button"
              class="icon-btn danger fav-menu-delete-btn"
              @pointerdown.stop
              @click.stop="handleRemoveFolder(row.id)"
              title="Delete folder and nested favorites"
            >
              ✕
            </button>

            <!-- Delete item -->
            <button
              v-else
              type="button"
              class="icon-btn danger fav-menu-delete-btn"
              @pointerdown.stop
              @click.stop="row.path && handleRemoveFavorite(row.path)"
              title="Remove favorite"
            >
              ✕
            </button>
          </div>
        </li>
      </ul>

    </div>
  </div>
</teleport>


  </div>
</template>

<style scoped>
.fav-row.is-dragging {
  opacity: 0.7;
}

/* Root container */
.favorites-root {
  position: relative;
  background: var(--fav-bg);
  color: var(--fav-fg);
  border-radius: 8px;
  padding: 6px 8px;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Slightly tighter padding when docked in sidebar */
.favorites-root.sidebar-mode {
  padding: 4px 6px;
}

/* Slightly tighter padding & font-size when used in a toolbar row */
.favorites-root.toolbar-mode .add-favorite-pill,
.favorites-root.toolbar-mode .fav-pill {
  padding: 2px 5px;
  font-size: 0.85em;
  padding-block: 1px;    /* <= this is where you “buy back” those last few px */
}

.favorites-root.toolbar-mode {
  height: 100%;
  display: flex;
  align-items: stretch;
  padding-block: 0;      /* <— kill any top/bottom padding */
  margin-block: 0;       /* safety: no vertical margin in toolbar mode */
}

/* Make the internal toolbar container hug the row height */
.favorites-root.toolbar-mode .favorites-toolbar {
  height: 100%;
  display: flex;
  align-items: center;
  padding-block: 0;      /* absolutely no vertical padding here */
  margin-block: 0;
}

.favorites-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.75em; /* instead of 11px */
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.9;
}

.favorites-title {
  font-weight: 600;
}

.header-actions {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

/* Add favorite button - Sidebar style (full row) */
.add-favorite-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 5px; /* Less left padding to align + with icons */
  margin-bottom: 4px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 0.9em; /* instead of 13px */
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-favorite-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.5);
}

.add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 14px;
  font-weight: 600;
  opacity: 0.8;
}

.add-label {
  opacity: 0.9;
}

/* Add favorite button - Toolbar style (inline pill) */
.add-favorite-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 0.9em; /* base; toolbar-mode overrides to 0.85em */
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
  height: fit-content;
  box-sizing: border-box;
}

.add-favorite-pill:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.5);
}

.fav-msg {
  font-size: 13px;
  opacity: 0.8;
  padding: 4px 2px;
}

.fav-msg.error {
  color: #ff8a8a;
}

.fav-msg.empty {
  opacity: 0.6;
  font-style: italic;
}

.fav-menu-empty.is-drop-target {
  background: rgba(255, 255, 255, 0.06);
  border-top: 1px dashed rgba(255, 255, 255, 0.4);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.4);
}

.fav-list-resize-handle {
  width: 100%;
  height: 4px;
  cursor: ns-resize;
  background: transparent;
}


.fav-list-resize-handle::before {
  content: '';
  display: block;
  margin: 1px auto 0;
  width: 40%;
  height: 2px;
  border-radius: 999px;
  opacity: 0.35;
  background: rgba(255, 255, 255, 0.7);
}


/* Vertical list mode: outer wrapper handles scroll + height */
.favorites-list-wrapper {
  scrollbar-width: none;          /* Firefox */
}
.favorites-list-wrapper::-webkit-scrollbar {
  width: 0;
  height: 0;                      /* Chrome/Edge */
}
/* Inner list just stacks rows */
.favorites-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.favorites-list.dense {
  gap: 0;
}

.fav-row {
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Common button styling for entries */
.fav-btn,
.fav-pill {
  border-radius: 6px;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  font-size: 0.9em; /* inherit + scale with widget text size */
  cursor: pointer;
  box-sizing: border-box;
}

/* Remove borders in toolbar mode to match drives widget */
.favorites-toolbar .fav-pill {
  border: none;
}

.fav-btn {
  width: 100%;
  text-align: left;
}

.fav-pill {
  white-space: nowrap;
}

.fav-btn:hover,
.fav-pill:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* Folder row styling (optional subtle tweak) */
.folder-row .folder-btn {
  font-weight: 500;
}

/* Actions (delete) - Show on hover in normal mode, always in edit mode */
.fav-row-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

/* Show on hover */
.fav-row:hover .fav-row-actions {
  opacity: 1;
}

/* Always visible in edit mode */
.favorites-root.edit-mode .fav-row-actions {
  opacity: 1;
}

.icon-btn {
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 0.8em; /* instead of 11px */
  cursor: pointer;
  background: transparent;
  color: inherit;
  opacity: 0.7;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  opacity: 1;
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(255, 128, 128, 0.16);
}

/* make the scroll container take the wrapper’s width */
.favorites-toolbar {
  width: 100%;
  overflow-x: auto;     /* <-- REQUIRED */
  overflow-y: hidden;
  scrollbar-width: none;
}
.favorites-toolbar::-webkit-scrollbar {
  width: 0;
  height: 0;                   /* Chrome/Edge */
}

/* viewport wrapper to host overlay arrows */
.fav-toolbar-viewport {
  position: relative;
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
}

/* overlay scroll hints */
.fav-scroll-hint {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 22px;
  min-width: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.22);
  background: rgba(0,0,0,0.25);
  color: inherit;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 5;
}
.fav-scroll-hint.left  { left: 4px; }
.fav-scroll-hint.right { right: 8px; } /* leave room for resize grip */

.fav-scroll-hint:hover {
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.35);
}


/* viewport is already display:flex; the wrapper MUST flex + shrink */
.favorites-toolbar-wrapper {
  flex: 1 1 auto;
  min-width: 0;        /* critical for flex children to shrink */
  overflow: hidden;    /* prevents inner scrollbars from leaking */
}

/* Thin vertical grip on the right for width resizing */
.fav-toolbar-resize-handle {
  flex: 0 0 4px;
  cursor: ew-resize;
  position: relative;
}

.fav-toolbar-resize-handle::before {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 2px;
  height: 40%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  opacity: 0.35;
}


.favorites-toolbar.dense {
  gap: 3px;
}

/* Folder wrapper for positioning dropdown */
.toolbar-folder-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
/* Toolbar item/folder wrappers for sortable */
.toolbar-item-wrapper,
.toolbar-folder-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Delete button in toolbar - hidden by default, show on hover or in edit mode */
.toolbar-delete-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
  font-size: 10px;
  padding: 1px 3px;
}

/* Show on hover */
.toolbar-item-wrapper:hover .toolbar-delete-btn,
.toolbar-folder-wrapper:hover .toolbar-delete-btn {
  opacity: 0.7;
}

/* Always visible in edit mode */
.favorites-root.edit-mode .toolbar-delete-btn {
  opacity: 0.7;
}

.toolbar-delete-btn:hover {
  opacity: 1 !important;
}

/* Enhanced pill styling with better visual hierarchy */
.fav-pill {
  white-space: nowrap;
  height: fit-content; /* Auto-size to content */
  transition: all 0.15s ease;
  position: relative;
}

.fav-pill.folder-pill {
  padding-right: 8px; /* Extra space for dropdown arrow */
}

.dropdown-arrow {
  font-size: 9px;
  opacity: 0.6;
  margin-left: 2px;
  transition: transform 0.2s ease;
}

.folder-pill:hover .dropdown-arrow {
  opacity: 1;
}

/* When folder menu is open */
.folder-pill.menu-open .dropdown-arrow {
  transform: rotate(180deg);
}

/* Toolbar-specific menu positioning (opens downward) */
.favorites-toolbar .fav-menu {
  top: calc(100% + 4px); /* Position below the button */
  left: 0;
  transform-origin: top left;
}

/* Better hover states for toolbar */
.favorites-toolbar .fav-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.favorites-toolbar .fav-pill:active {
  transform: translateY(0);
}

.fav-icon {
  flex: 0 0 auto;
  width: 16px;
  text-align: center;
  font-size: 12px;
  opacity: 0.9;
}

.fav-label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}


/* Add favorite / folder popup */
.fav-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: radial-gradient(
    circle at top,
    rgba(0, 0, 0, 0.4),
    rgba(0, 0, 0, 0.8)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.fav-dialog {
  background: rgba(12, 12, 12, 0.96);
  border-radius: 8px;
  border: 1px solid var(--fav-border);
  padding: 8px 10px;
  min-width: 260px;
  max-width: 340px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}

.fav-dialog-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.fav-type-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.btn-toggle {
  flex: 1 1 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
}

.btn-toggle.active {
  background: rgba(255, 255, 255, 0.24);
}

.btn-toggle:not(.active):hover {
  background: rgba(255, 255, 255, 0.12);
}

.fav-dialog-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}

.field-label {
  font-size: 11px;
  opacity: 0.8;
}

.fav-dialog .fav-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
  font-size: 12px;
  padding: 3px 6px;
  box-sizing: border-box;
}

.fav-dialog .fav-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.4);
}

.fav-dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}

.btn {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  font-size: 11px;
  padding: 2px 10px;
  cursor: pointer;
}

.btn.primary {
  background: rgba(255, 255, 255, 0.16);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.24);
}

/* Folders menu overlay */
.fav-menu-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto; /* so outside clicks are captured */
  z-index: 10001;
}

.fav-menu {
  position: absolute;
  pointer-events: auto;
  min-width: 220px;
  max-width: 320px;

  /* Let it grow until it hits the window edge, with a small margin */
  max-height: calc(100vh - 32px);
  overflow: auto;

  background: rgba(10, 10, 10, 0.98);
  border-radius: 8px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.7);
  padding: 6px 0;
}


.fav-menu-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.8;
  padding: 0 10px 4px;
}

.fav-menu-empty {
  font-size: 12px;
  opacity: 0.8;
  padding: 4px 10px 8px;
  font-style: italic;
}

.fav-menu-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fav-menu-row {
  margin: 0;
  padding: 0;
}

.fav-menu-btn {
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  box-sizing: border-box;
}

.fav-menu-btn:disabled {
  cursor: default;
  opacity: 0.8;
}

.fav-menu-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.fav-menu-label {
  display: inline-flex;
  align-items: center;
}

.fav-menu-indent {
  display: inline-block;
  flex: 0 0 auto;
}

.fav-menu-icon {
  display: inline-block;
  width: 18px;
  text-align: center;
  margin-right: 4px;
}

.fav-menu-text {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.gex-fav-ghost {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  border-radius: 4px;
}

.favorites-list,
.favorites-toolbar {
  position: relative;
}

.gex-fav-insert-bar {
  background-color: var(--gex-accent-color, #4dabf7);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.7);
}

.gex-fav-insert-bar-blocked {
  background-color: #ff4d4f;
}

.fav-menu-row {
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
}

/* Button takes the main width, actions sit on the right */
.fav-menu-btn {
  flex: 1 1 auto;
}

/* Actions area in menu rows */
.fav-menu-row-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  padding-right: 6px;
}

/* Show on hover */
.fav-menu-row:hover .fav-menu-row-actions {
  opacity: 1;
}

.fav-menu-delete-btn {
  font-size: 10px;
  padding: 1px 3px;
}

.favorites-root.sidebar-mode .favorites-toolbar {
  overflow-x: hidden;
}

.favorites-toolbar-container {
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
}
</style>