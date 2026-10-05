<script setup lang="ts">
import { iconFor } from 'gexplorer/widgets'
import type { ListingEntry } from 'gexplorer/widgets'

/* -----------------------------------------------
   Virtual grid layout (L3b)
   useVirtualList counts visual rows of `columns` cells; Widget.vue hands in
   the item indices of the visible rows. Cells not loaded yet are
   placeholders. The sizer is one cell (same classes): every cell must keep
   the same height.
------------------------------------------------ */
const props = defineProps<{
  indices: number[]
  rowAt: (index: number) => ListingEntry | undefined
  isSelected: (index: number) => boolean
  iconKeyOf: (entry: ListingEntry) => string
  totalHeight: number
  offsetY: number
  bindSizer: (el: any) => void
  bindRows: (el: any) => void
  iconsTick: number
  sourceId: string
  columns: number
  folderDropTarget?: string | null
  S: { gap: number; [key: string]: any }
}>()

const emit = defineEmits<{
  (e: 'rowDown', payload: { index: number; ev: PointerEvent }): void
  (e: 'rowMove', payload: { x: number; y: number }): void
  (e: 'rowUp', payload: { index: number }): void
  (e: 'dblclick', payload: { index: number }): void
}>()

function iconOf(e: ListingEntry): string {
  return iconFor({ iconKey: props.iconKeyOf(e), kind: e.Kind, ext: e.Ext })
}
function iconIsImg(e: ListingEntry): boolean {
  const icon = iconOf(e)
  return icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')
}
function keyOf(i: number): string {
  return props.rowAt(i)?.Name ?? `\u0000placeholder:${i}`
}
</script>

<template>
  <div class="grid-root" :data-icons="iconsTick" :style="{ height: totalHeight + 'px' }">
    <div
      class="grid-cells"
      :ref="bindRows"
      :style="{
        gap: S.gap + 'px',
        padding: `0 ${S.gap}px`,
        gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
        transform: `translateY(${offsetY}px)`,
      }"
    >
      <template v-for="i in indices" :key="keyOf(i)">
        <button
          v-if="rowAt(i)"
          class="row"
          :data-path="rowAt(i)!.FullPath"
          :data-index="i"
          :data-kind="rowAt(i)!.Kind"
          :class="{
            selected: isSelected(i),
            'folder-drop-target': rowAt(i)!.FullPath === props.folderDropTarget,
          }"
          @pointerdown.stop="(ev) => emit('rowDown', { index: i, ev })"
          @pointermove.stop="(ev) => emit('rowMove', { x: ev.clientX, y: ev.clientY })"
          @click.stop.prevent="() => emit('rowUp', { index: i })"
          @dblclick.stop.prevent="() => emit('dblclick', { index: i })"
        >
          <div class="icon">
            <img v-if="iconIsImg(rowAt(i)!)" :src="iconOf(rowAt(i)!)" alt="" />
            <span v-else>{{ iconOf(rowAt(i)!) }}</span>
          </div>
          <div
            class="name"
            :data-rename-id="rowAt(i)!.FullPath"
            :data-rename-value="rowAt(i)!.Name"
            :data-widget-id="sourceId"
          >{{ rowAt(i)!.Name }}</div>
        </button>
        <div v-else class="row placeholder" :data-index="i" aria-hidden="true">
          <div class="icon" />
          <div class="name">&nbsp;</div>
        </div>
      </template>
    </div>

    <!-- Cell-height probe for useVirtualList -->
    <div class="row sizer" :ref="bindSizer" aria-hidden="true" :style="{ left: S.gap + 'px', right: S.gap + 'px' }">
      <div class="icon" />
      <div class="name">X</div>
    </div>
  </div>
</template>

<style scoped>
.row.folder-drop-target {
  /* Inset ring in accent color — matches .row.selected but distinct */
  box-shadow: inset 0 0 0 2px var(--accent, #4ea1ff),
              inset 0 0 0 4px color-mix(in oklab, var(--accent, #4ea1ff) 25%, transparent) !important;
  background: color-mix(in oklab, var(--accent, #4ea1ff) 10%, transparent) !important;
}

/* ================ GRID CONTAINER ================ */
.grid-root {
  position: relative;
}

.grid-cells {
  display: grid;
  will-change: transform;
}

.sizer {
  position: absolute;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.placeholder { opacity: 0.35; }

/* Base icon size for GRID (scoped to this layout only) */
.grid-root .icon {
  width: calc(var(--base-font-size) * 1.4);
  height: calc(var(--base-font-size) * 1.4);
  flex: 0 0 calc(var(--base-font-size) * 1.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-root .icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Generic row styling (shared base) */
.row {
  border: 1px solid var(--items-border);
  background: var(--items-bg);
  color: inherit;
  border-radius: var(--local-radius);
  display: flex;
  flex-direction: row;
  gap: var(--local-spacing);
  align-items: center;
  min-height: calc(var(--base-font-size) * 2.4);
  padding: var(--space-xs) var(--space-sm);
  box-sizing: border-box;
  font-size: var(--local-font-md);
  text-align: var(--items-row-text-align, left);
  cursor: pointer;
}

.row:focus,
.row:focus-visible {
  outline: none !important;
}

.row { cursor: grab; }
.row:active { cursor: grabbing; }

.row.selected {
  box-shadow: inset 0 0 0 2px var(--accent, #4ea1ff) !important;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: var(--items-name-text-align, left);
  flex: 1 1 auto;
  min-width: 0;
  display: block;
}
</style>