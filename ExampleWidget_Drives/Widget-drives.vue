<script setup lang="ts">
import { ref, computed, watch, onMounted } from '/runtime/vue.js'
import { useDrivesStore } from '/src/stores/drives'
import { fsDriveStats } from '/src/widgets/fs' 

type HostAction = { type: 'nav'; to: string }

const props = defineProps<{
  sourceId?: string
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'
    size: { cols?: number; rows?: number; width?: number; height?: number }
  }
}>()

const ds = useDrivesStore()
const stats = ref(new Map<string, any>())

// Helpers
function fmtPct(used: number, total: number) {
  if (!total || total <= 0) return null
  const p = Math.max(0, Math.min(1, used / total))
  return Math.round(p * 100)
}

function fmtBytes(n: number) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let u = 0, x = n
  while (x >= 1024 && u < units.length - 1) { x /= 1024; u++ }
  return `${x.toFixed(x >= 10 || u === 0 ? 0 : 1)} ${units[u]}`
}

function sizeTokens(size: string) {
  const s = (size || 'md').toLowerCase()
  if (s === 'sm') return { padY: 8, padX: 10, radius: 8, gap: 6, barH: 6, font: 0.95, title: 600 }
  if (s === 'lg') return { padY: 14, padX: 14, radius: 12, gap: 10, barH: 10, font: 1.05, title: 650 }
  return { padY: 10, padX: 12, radius: 10, gap: 8, barH: 8, font: 1.00, title: 600 }
}

// Detect if in toolbar
const isToolbar = computed(() => props.placement?.context === 'toolbar')
const isSidebar = computed(() => props.placement?.context === 'sidebar')

// Auto-calculate columns based on grid allocation
const autoColumns = computed(() => {
  if (isSidebar.value) return 1
  
  const gridCols = props.placement?.size?.cols || 3
  if (gridCols <= 2) return 1
  if (gridCols <= 4) return 2
  if (gridCols <= 6) return 3
  return 4
})

const cfg = computed(() => {
  const view = props.config?.view || {}
  return {
    layout: String(view.layout || 'grid'),
    columns: view.columns || autoColumns.value,
    itemSize: String(view.itemSize || 'md'),
    showFsType: !!(view.showFsType ?? true),
    showCapacity: !!(view.showCapacity ?? true),
  }
})

const S = computed(() => sizeTokens(cfg.value.itemSize))

// Load drive stats
async function refreshStats() {
  const roots = (ds.drives || [])
    .map(d => d.Root || d.root || d.Name || d.name)
    .filter(Boolean)

  if (!roots.length) return

  try {
    const list = await fsDriveStats(roots)
    const m = new Map<string, any>()
    for (const s of list) m.set(s.root, s)
    stats.value = m
  } catch (e) {
    console.warn('[drives] refreshStats failed', e)
  }
}

onMounted(() => {
  void refreshStats()
})

watch(
  () => ds.drives,
  () => refreshStats(),
  { flush: 'post' }
)

function navTo(root: string) {
  if (props.runAction && root) {
    props.runAction({ type: 'nav', to: root })
  }
}

// Get usage color based on percentage
function getUsageColor(pct: number | null) {
  if (pct === null) return 'rgba(100, 100, 100, 0.3)'
  if (pct >= 90) return 'rgba(239, 68, 68, 0.3)'   // Red
  if (pct >= 75) return 'rgba(251, 191, 36, 0.3)'  // Yellow
  return 'rgba(34, 197, 94, 0.3)'                  // Green
}
</script>

<template>
  <!-- Toolbar Mode -->
  <div v-if="isToolbar" class="drives-toolbar">
    <div v-if="!ds.drives?.length" class="empty-toolbar">No drives</div>
    
    <div v-else class="toolbar-pills">
      <div
        v-for="drive in ds.drives"
        :key="drive.Root || drive.root"
        class="drive-pill"
        :title="`${drive.Name || drive.Root || drive.root}\n${
          stats.get(drive.Root || drive.root) 
            ? fmtBytes(stats.get(drive.Root || drive.root).free) + ' free of ' + fmtBytes(stats.get(drive.Root || drive.root).total)
            : 'Loading...'
        }`"
        :style="{
          '--usage-color': getUsageColor(
            stats.get(drive.Root || drive.root) 
              ? fmtPct(stats.get(drive.Root || drive.root).used, stats.get(drive.Root || drive.root).total)
              : null
          )
        }"
        @click="navTo(drive.Root || drive.root)"
      >
        <span class="pill-label">{{ drive.Name || drive.Root || drive.root }}</span>
        <span v-if="stats.get(drive.Root || drive.root)" class="pill-pct">
          {{ fmtPct(stats.get(drive.Root || drive.root).used, stats.get(drive.Root || drive.root).total) }}%
        </span>
      </div>
    </div>
  </div>

  <!-- Grid/Sidebar Mode (Original) -->
  <div v-else class="drives-widget" :class="cfg.layout">
    <div v-if="!ds.drives?.length" class="empty">No drives found</div>
    
    <div
      v-else
      class="drives-grid"
      :style="{
        gridTemplateColumns: cfg.layout === 'grid' 
          ? `repeat(${cfg.columns}, minmax(0, 1fr))` 
          : '1fr'
      }"
    >
      <div
        v-for="drive in ds.drives"
        :key="drive.Root || drive.root"
        class="drive-card"
        @click="navTo(drive.Root || drive.root)"
      >
        <div class="drive-header">
          <div class="drive-name">{{ drive.Name || drive.name || drive.Root || drive.root }}</div>
          <div v-if="cfg.showFsType" class="drive-fs">{{ drive.FsType || drive.fsType }}</div>
        </div>
        
        <div v-if="cfg.showCapacity" class="drive-usage">
          <div class="usage-bar">
            <div 
              class="usage-fill" 
              :style="{ 
                width: `${stats.get(drive.Root || drive.root) 
                  ? fmtPct(stats.get(drive.Root || drive.root).used, stats.get(drive.Root || drive.root).total) 
                  : 0}%` 
              }"
            />
          </div>
          
          <div v-if="stats.get(drive.Root || drive.root)" class="usage-text">
            {{ fmtBytes(stats.get(drive.Root || drive.root).used) }} / 
            {{ fmtBytes(stats.get(drive.Root || drive.root).total) }}
            ({{ fmtPct(stats.get(drive.Root || drive.root).used, stats.get(drive.Root || drive.root).total) }}%)
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Toolbar Mode Styles */
.drives-toolbar {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 8px;
  box-sizing: border-box;
}

.empty-toolbar {
  padding: 0 8px;
  opacity: 0.6;
  font-size: 13px;
}

.toolbar-pills {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 100%;
}

.drive-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--usage-color, rgba(100, 100, 100, 0.2));
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  height: fit-content;
  line-height: 1.2;
}

.drive-pill:hover {
  background: var(--usage-color, rgba(100, 100, 100, 0.3));
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.pill-label {
  font-weight: 500;
  opacity: 0.9;
}

.pill-pct {
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

/* Grid/Sidebar Mode Styles (Original) */
.drives-widget {
  padding: 8px;
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
}

.empty {
  padding: 8px;
  opacity: 0.7;
}

.drives-grid {
  display: grid;
  gap: 8px;
}

.drive-card {
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drive-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.drive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.drive-name {
  font-weight: 600;
  font-size: 14px;
}

.drive-fs {
  font-size: 11px;
  opacity: 0.6;
  text-transform: uppercase;
}

.drive-usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.usage-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.usage-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #16a34a);
  transition: width 0.3s ease;
}

.usage-text {
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
</style>