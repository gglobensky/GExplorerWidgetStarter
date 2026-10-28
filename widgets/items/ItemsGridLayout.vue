<script setup lang="ts">
import { iconFor } from 'gexplorer/widgets'
import type { ListingEntry } from 'gexplorer/widgets'
import { sizedIconKey } from './iconSizes'

/* -----------------------------------------------
   Icons layout (layout id 'grid'; 2026-10-27, was the Grid)
   Cells stacked like Windows' large icons: the icon above, the name under it
   on up to two lines. Widget.vue picks the columns from the pane's width and
   the icon size (iconSizes.ts). useVirtualList counts visual rows of
   `columns` cells; cells not loaded yet are placeholders. The sizer is one
   cell (same classes): every cell keeps the same height (the name always
   takes two lines' room).
   Media (layout id 'media', 0.8.0) is the same grid with a bigger square:
   a picture's, video's, cover's or PDF's thumbnail fills it (fitted, never
   cropped); folders and other files show their icon at half its size.
------------------------------------------------ */
const props = defineProps<{
  indices: number[]
  rowAt: (index: number) => ListingEntry | undefined
  isSelected: (index: number) => boolean
  iconKeyOf: (entry: ListingEntry) => string
  /** A folder shortcut that opens outside GEM Shell: badged. */
  opensElsewhere?: (entry: ListingEntry) => boolean
  totalHeight: number
  offsetY: number
  bindSizer: (el: any) => void
  bindRows: (el: any) => void
  iconsTick: number
  sourceId: string
  columns: number
  /** The size system icons were asked for (their keys carry it); 32 px ones show until they arrive. */
  iconPx: number
  /** Shown icon size (px): the square each icon (Media: each thumbnail) sits in. */
  iconSize: number
  /** Media: the system icons' size in the square (else the square's). */
  sysIconSize?: number
  /** Media layout: thumbnails (thumbOf) where there is one. */
  media?: boolean
  thumbOf?: (entry: ListingEntry) => string | undefined
  folderDropTarget?: string | null
  S: { gap: number; [key: string]: any }
}>()

const emit = defineEmits<{
  (e: 'rowDown', payload: { index: number; ev: PointerEvent }): void
  (e: 'rowMove', payload: { x: number; y: number }): void
  (e: 'rowUp', payload: { index: number }): void
  (e: 'dblclick', payload: { index: number }): void
  /** A thumbnail's image failed to load (GEM Shell's cache let it go): made again. */
  (e: 'thumbError', entry: ListingEntry): void
}>()

const isImg = (icon: string) => icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')

function iconOf(e: ListingEntry): string {
  const key = props.iconKeyOf(e)
  if (props.iconPx > 32) {
    const large = iconFor({ iconKey: sizedIconKey(key, props.iconPx), kind: e.Kind, ext: e.Ext }, props.iconPx)
    if (isImg(large)) return large
  }
  return iconFor({ iconKey: key, kind: e.Kind, ext: e.Ext })
}
function iconIsImg(e: ListingEntry): boolean {
  return isImg(iconOf(e))
}
function keyOf(i: number): string {
  return props.rowAt(i)?.Name ?? `\u0000placeholder:${i}`
}
</script>

<template>
  <div
    class="grid-root"
    :class="{ 'is-media': media }"
    :data-icons="iconsTick"
    :style="{ height: totalHeight + 'px', '--icon-px': iconSize + 'px', '--sys-icon-px': (sysIconSize ?? iconSize) + 'px' }"
  >
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
            <img
              v-if="media && thumbOf?.(rowAt(i)!)"
              class="thumb"
              :src="thumbOf!(rowAt(i)!)"
              alt=""
              decoding="async"
              draggable="false"
              @error="emit('thumbError', rowAt(i)!)"
            />
            <img v-else-if="iconIsImg(rowAt(i)!)" class="sys" :src="iconOf(rowAt(i)!)" alt="" />
            <span v-else class="sys">{{ iconOf(rowAt(i)!) }}</span>
            <span v-if="opensElsewhere?.(rowAt(i)!)" class="lnk-elsewhere" title="Opens in the system's file manager, not GEM Shell">↗</span>
          </div>
          <!-- data-rename-row: the rename box covers the name, not the whole cell (2026-10-27) -->
          <div
            class="name"
            data-rename-row
            :title="rowAt(i)!.Name"
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

/* The icon: the size chosen (Small … Extra large), glyph fallbacks scaled to it */
.grid-root .icon {
  position: relative;
  width: var(--icon-px, 48px);
  height: var(--icon-px, 48px);
  flex: 0 0 var(--icon-px, 48px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--icon-px, 48px) * 0.8);
  line-height: 1;
}

/* A folder shortcut that opens outside GEM Shell (shortcuts:probe opensElsewhere, 2026-10-18) */
.lnk-elsewhere {
  position: absolute;
  right: -3px;
  bottom: -3px;
  font-size: max(10px, calc(var(--sys-icon-px, 48px) * 0.22));
  line-height: 1;
  padding: 1px 2px;
  border-radius: 3px;
  background: var(--items-bg, #111);
  color: var(--accent, #4ea1ff);
  pointer-events: auto;
}

.grid-root .icon img.sys {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Media (0.8.0): the thumbnail fitted in the square, its shape kept; icons at half the square */
.grid-root.is-media .icon .sys {
  width: var(--sys-icon-px);
  height: var(--sys-icon-px);
  font-size: calc(var(--sys-icon-px) * 0.8);
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.grid-root .icon img.thumb {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  border-radius: 3px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .45), 0 0 0 1px rgba(255, 255, 255, .06);
  background: color-mix(in oklab, var(--fg, #fff) 4%, transparent);
}

/* A cell: icon on top, the name centred under it (two lines' room, always) */
.row {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  border-radius: var(--local-radius, 8px);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  padding: 8px 4px 6px;
  box-sizing: border-box;
  font-size: var(--local-font-sm, 12px);
  line-height: 1.3;
  text-align: center;
  cursor: pointer;
}
.row:not(.placeholder):hover {
  background: color-mix(in oklab, var(--fg, #fff) 6%, transparent);
  border-color: color-mix(in oklab, var(--fg, #fff) 8%, transparent);
}

.row:focus,
.row:focus-visible {
  outline: none !important;
}

.row { cursor: grab; }
.row:active { cursor: grabbing; }

.row.selected {
  background: color-mix(in oklab, var(--accent, #4ea1ff) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent, #4ea1ff) 70%, transparent) !important;
}

/* Two lines, then an ellipsis; the room is kept for one-line names so every cell is as tall */
.name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  width: 100%;
  height: calc(2 * 1.3em);
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: center;
}
</style>