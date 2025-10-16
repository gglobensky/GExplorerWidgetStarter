<script setup lang="ts">
import { ref, computed, watch, onMounted } from '/runtime/vue.js'
import { useDrivesStore } from '/src/stores/drives'

type HostAction = { type: 'nav'; to: string }

const props = defineProps<{
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
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

// Auto-calculate columns based on grid allocation
const autoColumns = computed(() => {
  if (props.placement?.context === 'sidebar') return 1
  
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
  const { send } = await import('/src/bridge/ipc.ts')
  const roots = (ds.drives || [])
    .map(d => d.Root || d.root || d.Name || d.name)
    .filter(Boolean)
  
  if (!roots.length) return
  
  try {
    const resp = await send('fs:driveStats', { roots })
    const list = resp?.payload?.stats || resp?.stats || []
    const m = new Map()
    for (const s of list) m.set(s.root, s)
    stats.value = m
  } catch (err) {
    console.warn('[drives] Failed to load stats:', err)
  }
}

onMounted(() => refreshStats())

watch(
  () => JSON.stringify((ds.drives || []).map(d => [d.Root || d.root, d.FsType || d.fsType])),
  () => refreshStats(),
  { flush: 'post' }
)

function navTo(root: string) {
  if (props.runAction && root) {
    props.runAction({ type: 'nav', to: root })
  }
}
</script>

<template>
  <div class="drives-widget" :class="cfg.layout">
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
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, #555);
  background: var(--surface-2, transparent);
  color: var(--fg, #eee);
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: background 0.15s ease;
}

.drive-card:hover {
  background: var(--surface-3, #2a2a2a);
}

.drive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drive-name {
  font-weight: 600;
}

.drive-fs {
  opacity: 0.75;
  font-size: 0.9em;
}

.drive-usage {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.usage-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.usage-fill {
  height: 100%;
  background: var(--accent, #4ea1ff);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.usage-text {
  display: flex;
  justify-content: flex-end;
  font-size: 0.85em;
  opacity: 0.8;
}
</style>