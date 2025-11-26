<script setup lang="ts">
import { ref, computed, onMounted, watch } from '/runtime/vue.js'
import { createSortable, type SortableHandle } from '/src/widgets/sortable/index'
import type { FavoriteEntry, FavoritesConfig } from '@/widgets/contracts/favorites'
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  reorderFavorites,
} from '/src/widgets/favorites/service'
import { getCurrentPath } from '/src/widgets/nav/index'

type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

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

const emit = defineEmits<{
  (e: 'updateConfig', config: FavoritesConfig | any): void
  (e: 'event', payload: any): void
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)

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

const favorites = ref<FavoriteEntry[]>([])

// ---- Sortable wiring: shared for list/toolbar ----
const listEl = ref<HTMLElement | null>(null)
let sortable: SortableHandle<FavoriteEntry> | null = null
const sortableVersion = ref(0)
let wasDragging = false
let dragJustEnded = false

function baseList(): FavoriteEntry[] {
  return [...favorites.value]
}

// Orientation depends on layout: vertical list, horizontal toolbar
const sortableOrientation = computed<'vertical' | 'horizontal'>(() =>
  layout.value === 'list' ? 'vertical' : 'horizontal'
)

function onSortableUpdate() {
  if (!sortable) return

  // Force re-compute of displayFavorites + sortableState
  sortableVersion.value++

  const { isDragging } = sortable.getState()

  if (!wasDragging && isDragging) {
    document.body.style.cursor = 'grabbing'
  }

  if (wasDragging && !isDragging) {
    document.body.style.cursor = ''

    const committed = sortable.getOrderedList() as FavoriteEntry[]
    const cur = baseList()

    const same =
      committed.length === cur.length &&
      committed.every((e, i) => e?.path === cur[i]?.path)

    if (!same) {
      favorites.value = committed
      const order = committed.map(f => f.path)
      void reorderFavorites(order).catch(e => {
        console.error('[favorites] reorderFavorites failed:', e)
      })
    }

    dragJustEnded = true
  }

  wasDragging = isDragging
}


function ensureSortable() {
  const items = baseList()
  if (!items.length || !listEl.value) {
    sortable = null
    return
  }

  if (!sortable) {
    sortable = createSortable<FavoriteEntry>(items, {
      identity: (e) => e.path,
      orientation: sortableOrientation.value,
      dragThresholdPx: 4,           // your "movement threshold"
      onUpdate: onSortableUpdate,
      scrollContainer: () => listEl.value,
      rowSelector: '.fav-row',
      containerClassOnDrag: 'gex-dragging',
      autoScroll: { marginPx: 32, maxSpeedPxPerSec: 700 },
    })
  } else {
    sortable.setOrderedList(items)
    sortable.setOrientation?.(sortableOrientation.value) // optional if your impl supports it
  }
}

function setRowRef(entry: FavoriteEntry, el: HTMLElement | null) {
  sortable?.registerRef(entry, el)
}

const sortableState = computed(() => {
  // touch version so this recomputes as sortable updates
  sortableVersion.value

  return sortable
    ? sortable.getState()
    : { isDragging: false, draggingId: null, hoverIdx: null }
})

function startRowDrag(displayIndex: number, event: PointerEvent) {
  ensureSortable()
  sortable?.startDrag(displayIndex, event)
  event.preventDefault()
}

// This is what list/toolbar both render from
const displayFavorites = computed(() => {
  sortableVersion.value // tie reactivity to sortable updates
  return sortable ? (sortable.getDisplayList() as FavoriteEntry[]) : baseList()
})

// Clamp for toolbar visual max
const visibleFavorites = computed(() =>
  displayFavorites.value.slice(0, Math.max(1, maxVisible.value))
)

// Keep sortable in sync when favorites change
watch(
  () => favorites.value.map(f => f.path).join('|'),
  () => ensureSortable()
)


// Add/edit dialog state
const showAddDialog = ref(false)
const newPath  = ref('')
const newLabel = ref('')

// Helpers to prefill popup
function guessLabelFromPath(path: string): string {
  const p = (path || '').replace(/[\\/]+$/, '')
  if (!p) return ''
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

function openAddDialog() {
  const base = getCurrentPath().trim()
  newPath.value = base
  newLabel.value = guessLabelFromPath(base)
  showAddDialog.value = true
}

function closeAddDialog() {
  showAddDialog.value = false
}

// Load from service
async function refreshFavorites() {
  loading.value = true
  error.value = null

  try {
    const svc = await getFavorites()
    if (Array.isArray(svc)) {
      favorites.value = svc
      return
    }

    const fromCfg = (cfg.value.data as any)?.entries
    favorites.value = Array.isArray(fromCfg) ? fromCfg : []
  } catch (e: any) {
    console.error('[favorites] getFavorites failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')

    const fromCfg = (cfg.value.data as any)?.entries
    favorites.value = Array.isArray(fromCfg) ? fromCfg : []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refreshFavorites()
})

watch(group, () => {
  void refreshFavorites()
})

const hostVars = computed(() => ({
  '--fav-bg': props.theme?.bg         || 'var(--surface-1, #141414)',
  '--fav-fg': props.theme?.fg         || 'var(--fg, #eee)',
  '--fav-border': props.theme?.border || 'rgba(255,255,255,.14)',
}))

// Fire a nav/open for the host
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


// ---- Editing helpers ----

async function confirmAddFavorite() {
  const path = newPath.value.trim()
  if (!path) return

  const label = newLabel.value.trim() || undefined

  saving.value = true
  error.value = null
  try {
    await addFavorite(path, label)
    await refreshFavorites()
    closeAddDialog()
  } catch (e: any) {
    console.error('[favorites] addFavorite failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  } finally {
    saving.value = false
  }
}

async function handleRemoveFavorite(path: string) {
  error.value = null
  try {
    await removeFavorite(path)
    favorites.value = favorites.value.filter(
      f => f.path.toLowerCase() !== path.toLowerCase()
    )
  } catch (e: any) {
    console.error('[favorites] removeFavorite failed:', e)
    error.value = String(e?.message ?? e ?? 'Error')
  }
}

</script>

<template>
  <div
    class="favorites-root"
    :class="{ 'sidebar-mode': isSidebar }"
    :style="hostVars"
  >
    <!-- Header: sidebar only, always editable -->
    <div v-if="isSidebar" class="favorites-header">
      <span class="favorites-title">Favorites</span>
      <button
        type="button"
        class="header-icon-btn"
        title="Add favorite"
        @click="openAddDialog"
      >
        ★
      </button>
    </div>

    <div v-if="loading" class="fav-msg">Loading…</div>
    <div v-else-if="error" class="fav-msg error">{{ error }}</div>
    <div v-else-if="!visibleFavorites.length" class="fav-msg empty">(No favorites yet)</div>
    <template v-else>
            <!-- LIST layout (sidebar) -->
            <!-- LIST layout (sidebar) -->
      <ul
        v-if="layout === 'list'"
        class="favorites-list"
        :class="{ dense }"
        ref="listEl"
      >
        <li
          v-for="(fav, index) in displayFavorites"
          :key="fav.path"
          class="fav-row"
          :class="{
            'is-dragging':
              sortableState.isDragging && sortableState.draggingId === fav.path
          }"
          :ref="el => setRowRef(fav, el as HTMLElement | null)"
          @pointerdown.stop="startRowDrag(index, $event)"
        >
          <button
            type="button"
            class="fav-btn"
            @click="openFavorite(fav, $event)"
            :title="fav.label || fav.path"
          >
            <span v-if="showIcons" class="fav-icon">★</span>
            <span v-if="showLabels" class="fav-label">
              {{ fav.label || fav.path }}
            </span>
          </button>

          <!-- Sidebar controls: delete only; drag is on whole row -->
          <div v-if="isSidebar" class="fav-row-actions">
            <button
              type="button"
              class="icon-btn danger"
              @pointerdown.stop
              @click.stop="handleRemoveFavorite(fav.path)"
              title="Remove"
            >
              ✕
            </button>

          </div>
        </li>
      </ul>

            <!-- TOOLBAR layout (read-only for now) -->
      <div v-else class="favorites-toolbar" :class="{ dense }">
        <button
          v-for="fav in visibleFavorites"
          :key="fav.path"
          type="button"
          class="fav-pill"
          @click="openFavorite(fav, $event)"
          :title="fav.label || fav.path"
        >
          <span v-if="showIcons" class="fav-icon">★</span>
          <span v-if="showLabels" class="fav-label">
            {{ fav.label || fav.path }}
          </span>
        </button>
      </div>

    </template>

    <!-- Add favorite popup (global modal) -->
    <teleport to="body">
      <div
        v-if="showAddDialog"
        class="fav-dialog-backdrop"
        @click.self="closeAddDialog"
      >
        <div class="fav-dialog">
          <div class="fav-dialog-title">Add favorite</div>

          <label class="fav-dialog-field">
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
              placeholder="Downloads"
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
              :disabled="!newPath.trim() || saving"
              @click="confirmAddFavorite"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </teleport>

  </div>
</template>

<style scoped>
.fav-row.is-dragging {
  opacity: 0.7;
}

.favorites-root .gex-dragging {
  background: rgba(255, 255, 255, 0.03);
}

.favorites-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

/* you can keep your existing .fav-btn, .fav-pill, .icon-btn, etc. */


.favorites-root {
  position: relative;
  background: var(--fav-bg);
  color: var(--fav-fg);
  border-radius: 8px;
  border: 1px solid var(--fav-border);
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

.favorites-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.9;
}

.favorites-title {
  font-weight: 600;
}

.header-icon-btn {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: inherit;
  width: 20px;
  height: 20px;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
  padding: 0;
}

.header-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
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

/* Vertical list mode */
.favorites-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
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
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
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

/* Actions (reorder + delete) */
.fav-row-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 11px;
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

/* Horizontal toolbar layout */
.favorites-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.favorites-toolbar.dense {
  gap: 2px;
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

/* Add favorite popup */
.fav-dialog-backdrop {
  position: fixed;         /* instead of absolute */
  inset: 0;
  background: radial-gradient(
    circle at top,
    rgba(0, 0, 0, 0.4),
    rgba(0, 0, 0, 0.8)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;          /* above sidebar + other chrome */
}


.fav-dialog {
  background: rgba(12, 12, 12, 0.96);
  border-radius: 8px;
  border: 1px solid var(--fav-border);
  padding: 8px 10px;
  min-width: 240px;
  max-width: 320px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}

.fav-dialog-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
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
</style>
