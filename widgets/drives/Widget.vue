<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getDrives,
  type DriveSnapshot,
  type DriveStats,
  type WidgetSdk,
} from 'gexplorer/widgets'
import {
  chooseDensity,
  finiteNumber,
  formatBytes,
  usagePercent,
  usageTone as toneForPercent,
  type DriveDensity,
} from './drives'

type Placement = {
  context: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'dialog'
  layout?: string
  size?: { cols?: number; rows?: number; width?: number; height?: number }
  phase?: 'active' | 'idle'
}

const props = defineProps<{
  sourceId?: string
  config?: { data?: any; view?: any; [key: string]: any }
  theme?: Record<string, string>
  placement?: Placement
}>()

const sdk = inject<WidgetSdk>('widgetSdk')
const fsDriveStats = sdk?.fsDriveStats
const lifecycle = sdk?.lifecycle?.()
const settings = sdk?.settings?.()

const drives = ref<DriveSnapshot[]>(getDrives())
const stats = ref(new Map<string, DriveStats>())
const refreshing = ref(false)
const cleanups: Array<() => void> = []
let refreshGeneration = 0

function isEmpty(drive: DriveSnapshot): boolean {
  return drive.media === 'none'
}

function statFor(drive: DriveSnapshot): DriveStats | undefined {
  return stats.value.get(drive.root)
}

function usageTone(drive: DriveSnapshot): 'normal' | 'warning' | 'critical' | 'unknown' {
  return toneForPercent(usagePercent(statFor(drive)))
}

function usageWidth(drive: DriveSnapshot): string {
  return `${usagePercent(statFor(drive)) ?? 0}%`
}

function capacityText(drive: DriveSnapshot): string {
  const stat = statFor(drive)
  const percent = usagePercent(stat)
  if (!stat || percent === null || !finiteNumber(stat.free)) return 'Capacity unavailable'
  return `${formatBytes(stat.free)} free · ${percent}% used`
}

function driveDetail(drive: DriveSnapshot): string {
  if (isEmpty(drive)) return 'No disc'
  const stat = statFor(drive)
  if (stat?.error) return `Capacity unavailable: ${stat.error}`
  if (!stat) return refreshing.value ? 'Reading capacity…' : 'Capacity unavailable'
  const percent = usagePercent(stat)
  if (percent === null || !finiteNumber(stat.free) || !finiteNumber(stat.total)) return 'Capacity unavailable'
  return `${formatBytes(stat.free)} free of ${formatBytes(stat.total)} · ${percent}% used${drive.fsType ? ` · ${drive.fsType}` : ''}`
}

function driveTooltip(drive: DriveSnapshot) {
  return { content: drive.display, detail: driveDetail(drive) }
}

function driveAriaLabel(drive: DriveSnapshot): string {
  const action = isEmpty(drive) ? '' : '. Open drive'
  return `${drive.display}. ${driveDetail(drive)}${action}`
}

function navTo(drive: DriveSnapshot): void {
  if (!isEmpty(drive) && drive.root) void sdk?.navigate?.(drive.root)
}

/** Read the current drives and discard stats belonging to drives that disappeared. */
function reloadDrives(): void {
  drives.value = getDrives()
  const roots = new Set(drives.value.map(drive => drive.root))
  stats.value = new Map([...stats.value].filter(([root]) => roots.has(root)))
  void refreshStats()
}

/** Capacity changes do not raise the drive-list topic, so refresh lightly while visible. */
async function refreshStats(): Promise<void> {
  const generation = ++refreshGeneration
  const roots = drives.value
    .filter(drive => drive.media === 'present')
    .map(drive => drive.root)
    .filter(Boolean)

  if (!roots.length || !fsDriveStats) {
    stats.value = new Map()
    refreshing.value = false
    return
  }

  refreshing.value = true
  try {
    const list = await fsDriveStats(roots)
    if (generation !== refreshGeneration) return
    stats.value = new Map(list.map(stat => [stat.root, stat]))
  } catch (error) {
    if (generation !== refreshGeneration) return
    console.warn('[drives] capacity refresh failed', error)
  } finally {
    if (generation === refreshGeneration) refreshing.value = false
  }
}

const context = computed(() => props.placement?.context ?? 'grid')

/** Modern config is under view; the flat keys keep shipped/older placements compatible. */
const view = computed<Record<string, any>>(() => ({
  ...(props.config ?? {}),
  ...(props.config?.view ?? {}),
}))

const showFsType = computed(() => view.value.showFsType !== false)
const showCapacity = computed(() => view.value.showCapacity !== false)
const colorByUsage = computed(() => settings?.values.colorByUsage !== false)
const boxWidth = computed(() => props.placement?.size?.width ?? 0)
const boxHeight = computed(() => props.placement?.size?.height ?? 0)

const density = computed<DriveDensity>(() => chooseDensity(
  context.value,
  boxWidth.value,
  boxHeight.value,
  drives.value.length,
))

const gap = computed(() => density.value === 'expanded' ? 8 : density.value === 'compact' ? 5 : 3)

const columns = computed(() => {
  const count = Math.max(1, drives.value.length)
  if (context.value === 'sidebar') return 1
  if (context.value === 'toolbar') return count
  if (view.value.layout === 'list') return 1

  const minWidth = density.value === 'expanded' ? 154 : density.value === 'compact' ? 104 : 46
  const automatic = boxWidth.value
    ? Math.max(1, Math.floor((boxWidth.value + gap.value) / (minWidth + gap.value)))
    : Math.max(1, props.placement?.size?.cols ?? 3)
  const preference = finiteNumber(view.value.columns) && view.value.columns > 0
    ? Math.floor(view.value.columns)
    : count
  return Math.max(1, Math.min(count, automatic, preference))
})

const rows = computed(() => Math.ceil(Math.max(1, drives.value.length) / columns.value))
const listStyle = computed(() => ({
  '--drive-columns': String(columns.value),
  '--drive-rows': String(rows.value),
  '--drive-gap': `${gap.value}px`,
}))

onMounted(() => {
  void refreshStats()
  const stopHost = sdk?.onHostChange?.('drives', reloadDrives)
  if (stopHost) cleanups.push(stopHost)

  if (lifecycle) {
    cleanups.push(
      lifecycle.keepInterval(() => void refreshStats(), 60_000),
      lifecycle.onResume(() => void refreshStats()),
    )
  } else {
    const timer = window.setInterval(() => void refreshStats(), 60_000)
    cleanups.push(() => window.clearInterval(timer))
  }
})

onBeforeUnmount(() => {
  refreshGeneration++
  for (const cleanup of cleanups.splice(0)) cleanup()
})
</script>

<template>
  <section
    class="drives-widget"
    :class="[
      `context-${context}`,
      `density-${density}`,
      { 'color-by-usage': colorByUsage },
    ]"
    aria-label="Drives"
  >
    <div v-if="!drives.length" class="empty-state">No drives found</div>

    <div v-else class="drive-list" :style="listStyle">
      <button
        v-for="drive in drives"
        :key="drive.root"
        type="button"
        class="drive-item"
        :class="[
          `usage-${usageTone(drive)}`,
          { empty: isEmpty(drive) },
        ]"
        :aria-disabled="isEmpty(drive) || undefined"
        :aria-label="driveAriaLabel(drive)"
        v-gex-tooltip="driveTooltip(drive)"
        @click="navTo(drive)"
        @auxclick="e => { if (e.button === 1) navTo(drive) }"
        @mousedown.middle.prevent
      >
        <span class="drive-heading">
          <span class="drive-label drive-label-full">{{ drive.display }}</span>
          <span class="drive-label drive-label-short">{{ drive.name }}</span>
          <span v-if="showFsType && drive.fsType" class="drive-fs">{{ drive.fsType }}</span>
          <span v-if="!isEmpty(drive) && usagePercent(statFor(drive)) !== null" class="drive-percent">
            {{ usagePercent(statFor(drive)) }}%
          </span>
        </span>

        <span v-if="isEmpty(drive)" class="drive-status">No disc</span>

        <template v-else-if="showCapacity">
          <span
            class="usage-bar"
            :role="usagePercent(statFor(drive)) !== null ? 'progressbar' : undefined"
            :aria-label="`${drive.display} space used`"
            :aria-valuemin="usagePercent(statFor(drive)) !== null ? 0 : undefined"
            :aria-valuemax="usagePercent(statFor(drive)) !== null ? 100 : undefined"
            :aria-valuenow="usagePercent(statFor(drive)) ?? undefined"
          >
            <span class="usage-fill" :style="{ width: usageWidth(drive) }" />
          </span>
          <span class="capacity-text">{{ capacityText(drive) }}</span>
        </template>
      </button>
    </div>
  </section>
</template>

<style scoped>
.drives-widget {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 8px;
  color: var(--fg, #eee);
  container-type: size;
  overflow: hidden;
}

.drive-list {
  display: grid;
  grid-template-columns: repeat(var(--drive-columns), minmax(0, 1fr));
  grid-template-rows: repeat(var(--drive-rows), minmax(0, 1fr));
  gap: var(--drive-gap);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.drive-item {
  appearance: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  padding: 10px 11px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-md, 8px);
  background: var(--surface-2, rgba(255, 255, 255, 0.05));
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.drive-item:hover:not(.empty) {
  background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  border-color: color-mix(in srgb, var(--accent, #4ea1ff) 55%, var(--border, transparent));
}

.drive-item:active:not(.empty) {
  transform: translateY(1px);
}

.drive-item:focus-visible {
  outline: 2px solid var(--accent, #4ea1ff);
  outline-offset: -2px;
}

.drive-item.empty {
  opacity: 0.58;
  cursor: default;
}

.drive-heading {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.drive-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
  font-size: 13px;
}

.drive-label-short {
  display: none;
}

.drive-fs {
  flex: 0 0 auto;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.6;
}

.drive-percent {
  display: none;
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.78;
}

.usage-bar {
  display: block;
  flex: 0 0 auto;
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg, #fff) 12%, transparent);
}

.usage-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent, #4ea1ff);
  transition: width 240ms ease, background-color 160ms ease;
}

.color-by-usage .usage-normal .usage-fill {
  background: var(--drive-usage-normal, #22c55e);
}

.color-by-usage .usage-warning .usage-fill {
  background: var(--drive-usage-warning, #f59e0b);
}

.color-by-usage .usage-critical .usage-fill {
  background: var(--drive-usage-critical, #ef4444);
}

.capacity-text,
.drive-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.empty-state {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 32px;
  opacity: 0.65;
  font-size: 12px;
}

.density-compact {
  padding: 5px;
}

.density-compact .drive-item {
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--radius-sm, 6px);
}

.density-compact .drive-label-full,
.density-compact .drive-percent {
  display: block;
}

.density-compact .drive-fs,
.density-compact .capacity-text {
  display: none;
}

.density-compact .usage-bar {
  height: 4px;
}

.density-micro {
  padding: 3px;
}

.density-micro .drive-item {
  gap: 3px;
  padding: 4px 5px;
  border-radius: 5px;
}

.density-micro .drive-label-full,
.density-micro .drive-fs,
.density-micro .capacity-text,
.density-micro .drive-status {
  display: none;
}

.density-micro .drive-label-short,
.density-micro .drive-percent {
  display: block;
}

.density-micro .drive-label {
  font-size: 11px;
}

.density-micro .drive-percent {
  font-size: 10px;
}

.density-micro .usage-bar {
  height: 3px;
}

.context-sidebar {
  height: auto;
  padding: 5px 6px;
  overflow: visible;
  container-type: inline-size;
}

.context-sidebar .drive-list {
  height: auto;
  grid-template-rows: none;
  grid-auto-rows: minmax(38px, auto);
}

.context-sidebar .drive-item {
  min-height: 38px;
}

.context-toolbar {
  padding: 3px 5px;
}

.context-toolbar .drive-item {
  gap: 3px;
  padding-block: 3px;
  background: color-mix(in srgb, var(--surface-2, #222) 82%, transparent);
}

.context-toolbar.density-expanded .capacity-text,
.context-toolbar.density-expanded .drive-fs {
  display: none;
}

.context-toolbar.density-expanded .drive-percent {
  display: block;
}

.context-toolbar.density-compact .drive-label-full {
  display: none;
}

.context-toolbar.density-compact .drive-label-short {
  display: block;
}

.context-toolbar.density-micro .drive-percent {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .drive-item,
  .usage-fill {
    transition: none;
  }
}
</style>
