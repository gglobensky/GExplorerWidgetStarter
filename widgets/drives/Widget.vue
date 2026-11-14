<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getDrives,
  startRename,
  type DriveSnapshot,
  type DriveStats,
  type WidgetSdk,
  type WidgetMenuItemMessage,
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
const ui = sdk?.ui?.()

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

// ── 0.7.0: a drive's menu, F2, Alt+Enter (GEM Shell 2026-11-13, drive properties) ───────────────────
const rootEl = ref<HTMLElement | null>(null)

/** The drive the user is on: the focused one, else the one right-clicked or clicked last. */
let lastRoot: string | null = null
function remember(root: string): void { lastRoot = root }
function focusedRoot(): string | null {
  const el = document.activeElement as HTMLElement | null
  const own = el && rootEl.value?.contains(el) ? el.closest<HTMLElement>('[data-drive-root]') : null
  return own?.dataset.driveRoot ?? lastRoot
}
function driveOf(root: string | null): DriveSnapshot | undefined {
  return root ? drives.value.find(d => d.root === root) : undefined
}

/** Right-click: the drive's menu (its own items, then GEM Shell's Copy path / Properties). */
function onDriveMenu(drive: DriveSnapshot, e: MouseEvent): void {
  lastRoot = drive.root
  if (!ui?.contextMenu) return
  e.preventDefault()
  void ui.contextMenu(e, {
    context: 'drive',
    ref: drive.root,
    selection: [drive.root],
    states: isEmpty(drive) ? ['no-media'] : [],
    widgetConfig: props.config,
  })
}

/** One of this widget's menu items was chosen (the host calls it: defineExpose below). */
async function onMenuItem(m: WidgetMenuItemMessage): Promise<void> {
  const drive = driveOf(m.ref ?? null)
  if (!drive) return
  switch (m.itemId) {
    case 'open': navTo(drive); break
    case 'open-tab': if (!isEmpty(drive)) void sdk?.navigate?.(drive.root, { newTab: true }); break
    case 'rename': await renameDrive(drive); break
    default: console.warn('[drives] unknown menu item', m.itemId)
  }
}

/** One of entry.ts's commands (the host runs it while this widget has the user's focus). */
function onCommand(id: string): void {
  const drive = driveOf(focusedRoot())
  if (!drive) return
  if (id === 'rename') void renameDrive(drive)
  else if (id === 'properties') void ui?.showProperties?.([drive.root])
}

function snack(text: string): void {
  void ui?.snack?.({ id: 'drives-rename', text, timeoutMs: 6000, dedupe: 'replace' })
}

/** The drive's name shown in this density (the full one, or the letter alone when space is short). */
function labelElOf(root: string): HTMLElement | null {
  const item = rootEl.value?.querySelector<HTMLElement>(`[data-drive-root="${CSS.escape(root)}"]`)
  if (!item) return null
  const shown = [...item.querySelectorAll<HTMLElement>('.drive-label')].find(el => el.getClientRects().length > 0)
  return shown ?? item
}

/**
 * Renames the drive in place (F2, the menu's Rename): its name becomes editable where it is shown; Enter keeps
 * it. GEM Shell asks once for the drive itself (its name only) and offers "Retry as administrator" if Windows
 * refuses. Checked against its file system's rules as you type.
 */
async function renameDrive(drive: DriveSnapshot): Promise<void> {
  if (isEmpty(drive)) return
  if (!sdk?.fsVolumeInfo || !sdk.fsSetVolumeLabel) { snack('Renaming drives needs a newer GEM Shell.'); return }
  const info = await sdk.fsVolumeInfo(drive.root).catch((err: any) => {
    snack(`Couldn't read ${drive.name}: ${err?.message ?? err}`)
    return null
  })
  if (!info) return
  if (!info.canLabel || !info.labelRules) { snack(`${drive.name} can't be renamed (a disc, a network share, or not ready).`); return }
  const rules = info.labelRules
  const el = labelElOf(drive.root)
  if (!el) return
  await startRename(el, {
    widgetId: props.sourceId,
    value: info.label ?? '',
    selectAll: true,
    validate: (v: string) => {
      const s = v.trim()
      if (s.length > rules.maxLength) return `At most ${rules.maxLength} characters on ${info.fileSystem ?? 'this file system'}.`
      const bad = [...s].find(c => rules.forbidden.includes(c) || c.charCodeAt(0) < 32)
      return bad ? `A drive name can't contain ${bad.charCodeAt(0) < 32 ? 'control characters' : bad}.` : null
    },
    onCommit: async (name: string) => {
      if (name.trim() === (info.label ?? '')) return
      try {
        await sdk.fsSetVolumeLabel!(drive.root, name)   // drives:changed brings the new name (reloadDrives)
      } catch (err: any) {
        if (err?.code === 'E_CANCELLED') return
        snack(err?.code === 'E_PERMISSION'
          ? `${drive.name} wasn't renamed: the permission was not granted.`
          : `${drive.name} wasn't renamed: ${err?.message ?? err}`)
      }
    },
  })
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
  if (context.value === 'sidebar' || context.value === 'dialog') return 1   // 0.7.3: the file dialog as the sidebar
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

defineExpose({ onMenuItem, onCommand })
</script>

<template>
  <section
    ref="rootEl"
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
        :data-drive-root="drive.root"
        :class="[
          `usage-${usageTone(drive)}`,
          { empty: isEmpty(drive) },
        ]"
        :aria-disabled="isEmpty(drive) || undefined"
        :aria-label="driveAriaLabel(drive)"
        v-gex-tooltip="driveTooltip(drive)"
        @click="remember(drive.root); navTo(drive)"
        @auxclick="e => { if (e.button === 1) navTo(drive) }"
        @contextmenu="e => onDriveMenu(drive, e)"
        @focus="remember(drive.root)"
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
  cursor: var(--gex-cursor-link, pointer);   /* 0.7.1: one click opens it (GEM Shell's cursor handle) */
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
  cursor: var(--gex-cursor-default, default);
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

/* 0.7.3: GEM Shell's file dialog shows it as in the sidebar */
.context-sidebar,
.context-dialog {
  height: auto;
  padding: 5px 6px;
  overflow: visible;
  container-type: inline-size;
}

.context-sidebar .drive-list,
.context-dialog .drive-list {
  height: auto;
  grid-template-rows: none;
  grid-auto-rows: minmax(38px, auto);
}

.context-sidebar .drive-item,
.context-dialog .drive-item {
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
