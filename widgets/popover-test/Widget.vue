<!-- widgets/popover-test/Widget.vue — TEMPORARY (GEM Shell E5c-1 tests). -->
<script setup lang="ts">
import { inject, markRaw, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import Level from './Level.vue'

const sdk = inject<WidgetSdk>('widgetSdk')
const ui = sdk?.ui?.()
const menuBtn = ref<HTMLElement | null>(null)
const styledBtn = ref<HTMLElement | null>(null)
const status = ref('')

// While a drag is on: the levels open a folder's child on hover (the held gesture).
const dragging = ref(false)
const isDragging = () => dragging.value

// During a drag: hovering "Open menu" opens it (as Favorites opens a folder pill's menu when a favorite is dragged over it).
let btnTimer: number | null = null
let menuOpen = false
function onBtnEnter() {
  if (!dragging.value || menuOpen) return
  btnTimer = window.setTimeout(() => openMenu(false), 450)
}
function onBtnLeave() { if (btnTimer !== null) { clearTimeout(btnTimer); btnTimer = null } }

function openMenu(styled: boolean) {
  const anchor = styled ? styledBtn.value : menuBtn.value
  if (!anchor || !ui) return
  const p = ui.openPopover({
    anchor,
    component: markRaw(Level),
    props: { depth: 1, styled, self: markRaw(Level), isDragging },
    placement: 'below',
    style: styled
      ? { background: '#1d2b1d', color: '#c8f7c8', borderColor: '#4caf50', borderWidth: 2, radius: 14, shadow: 'large', padding: 6 }
      : undefined,
    onClose: () => { menuOpen = false },
  })
  menuOpen = !!p
  status.value = p ? `Level 1 opened${styled ? ' (styled)' : ''}` : 'Refused (see the console)'
}

// Drag the chip: the shell draws the ghost at the pointer.
let ghost: { update(p: { label?: string; subLabel?: string; icon?: string }): void; close(): void } | null = null
let startX = 0, startY = 0, moved = false

function onChipDown(e: PointerEvent) {
  if (e.button !== 0) return
  startX = e.clientX; startY = e.clientY; moved = false
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}
function onMove(e: PointerEvent) {
  if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
    moved = true
    dragging.value = true
    ghost = ui?.dragGhost?.({
      label: 'A test favorite', subLabel: 'drag me anywhere', icon: '★', offset: { x: 14, y: 10 },
      style: { borderColor: '#f5b942', radius: 10 },
    }) ?? null
    status.value = ghost ? 'Dragging: the ghost follows the pointer' : 'dragGhost refused (see the console)'
  }
}
function onUp() {
  window.removeEventListener('pointermove', onMove)
  ghost?.close(); ghost = null
  if (moved) status.value = 'Dropped'
  dragging.value = false
}
</script>

<template>
  <div class="pt">
    <div class="row">
      <button ref="menuBtn" type="button" @click="openMenu(false)" @pointerenter="onBtnEnter" @pointerleave="onBtnLeave">Open menu</button>
      <button ref="styledBtn" type="button" @click="openMenu(true)">Open styled menu</button>
      <span class="chip" @pointerdown="onChipDown">★ Drag me</span>
    </div>
    <div class="status">{{ status }}</div>
  </div>
</template>

<style scoped>
.pt { padding: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.chip { padding: 4px 10px; border: 1px dashed var(--accent, #4ea1ff); border-radius: 10px; cursor: grab; user-select: none; touch-action: none; }
.status { opacity: .7; font-size: 12px; }
</style>
