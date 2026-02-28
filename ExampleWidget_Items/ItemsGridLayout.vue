<script setup lang="ts">
import { computed } from '/runtime/vue.js'

/* -----------------------------------------------
   Props
------------------------------------------------ */
const props = defineProps<{
  entries: any[]
  selected: Set<string>
  iconsTick: number
  sourceId: string
  columns: number
  S: {
    gap: number
    [key: string]: any
  }
}>()

/* -----------------------------------------------
   Emits
------------------------------------------------ */
const emit = defineEmits<{
  (e: 'rowDown', payload: { id: string; mods: any }): void
  (e: 'rowMove', payload: { x: number; y: number }): void
  (e: 'rowUp', payload: { id: string }): void
  (e: 'dblclick', payload: { id: string }): void
  (e: 'dragstart', payload: { entry: any; event: DragEvent }): void
  (e: 'dragend'): void
}>()

/* -----------------------------------------------
   Computed
------------------------------------------------ */
const selectedMap = computed<Record<string, true>>(() => {
  const m: Record<string, true> = {}
  for (const id of props.selected) m[id] = true
  return m
})

/* -----------------------------------------------
   Icon Helpers
------------------------------------------------ */
function iconIsImg(e: any): boolean {
  const icon = e?.Icon || ''
  return icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')
}

function iconSrc(e: any): string {
  return e?.Icon || ''
}

function iconText(e: any): string {
  return e?.Icon || (e?.Kind === 'dir' ? '📁' : '📄')
}

/* -----------------------------------------------
   Helpers
------------------------------------------------ */
function modsFromEvent(e: PointerEvent | MouseEvent | KeyboardEvent) {
  return { 
    ctrl: e.ctrlKey || false, 
    meta: (e as any).metaKey || false, 
    shift: e.shiftKey || false, 
    alt: e.altKey || false 
  }
}

/* -----------------------------------------------
   Event Handlers
------------------------------------------------ */
function handleRowDown(id: string, event: PointerEvent) {
  emit('rowDown', { id, mods: modsFromEvent(event) })
}

function handleRowMove(x: number, y: number) {
  emit('rowMove', { x, y })
}

function handleRowUp(id: string) {
  emit('rowUp', { id })
}

function handleDblClick(id: string) {
  emit('dblclick', { id })
}

function handleDragStart(entry: any, event: DragEvent) {
  emit('dragstart', { entry, event })
}

function handleDragEnd() {
  emit('dragend')
}
</script>

<template>
  <div 
    class="grid-root"
    :data-icons="iconsTick"
    :style="{
      display: 'grid',
      gap: S.gap + 'px',
      padding: S.gap + 'px',
      gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`
    }"
  >
    <button
      class="row"
      :key="e.FullPath"
      :data-path="e.FullPath"
      v-for="(e, i) in entries"
      :class="{ selected: selectedMap[e.FullPath] }"
      draggable="true"
      @pointerdown.stop="(ev) => handleRowDown(e.FullPath, ev)"
      @pointermove.stop="(ev) => handleRowMove(ev.clientX, ev.clientY)"
      @click.stop.prevent="() => handleRowUp(e.FullPath)"
      @dblclick.stop.prevent="() => handleDblClick(e.FullPath)"
      @dragstart="(ev) => handleDragStart(e, ev as DragEvent)"
      @dragend="() => handleDragEnd()"
    >
      <div class="icon">
        <img v-if="iconIsImg(e)" :src="iconSrc(e)" alt="" />
        <span v-else>{{ iconText(e) }}</span>
      </div>
      <div 
        class="name"
        :data-rename-id="e.FullPath"
        :data-rename-value="e.Name"
        :data-widget-id="sourceId"
      >
        {{ e.Name || e.FullPath }}
      </div>
    </button>
  </div>
</template>

<style scoped>
/* ================ GRID CONTAINER ================ */
.grid-root {
  /* Grid layout is inline via :style binding */
}

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

.row[draggable="true"] { 
  cursor: grab; 
}

.row[draggable="true"]:active { 
  cursor: grabbing; 
}

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