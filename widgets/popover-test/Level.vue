<!-- widgets/popover-test/Level.vue — TEMPORARY (GEM Shell E5c-1 tests): one level; its folder rows open the next. -->
<script setup lang="ts">
import { inject, markRaw, onBeforeUnmount, type Component } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

const props = defineProps<{
  depth: number
  styled: boolean
  self: Component
  isDragging: () => boolean
  close?: () => void
}>()

const sdk = inject<WidgetSdk>('widgetSdk')
const ui = sdk?.ui?.()
const rows = [1, 2, 3].map(n => ({ id: n, label: `Folder ${props.depth}.${n}` }))

function openChild(el: HTMLElement) {
  if (!ui) return
  const p = ui.openPopover({
    anchor: el,
    component: markRaw(props.self),
    props: { depth: props.depth + 1, styled: props.styled, self: props.self, isDragging: props.isDragging },
    placement: 'right',
    hover: true,   // E5c-2a: opens on hover, closes after a moment off it and its parent
    style: props.styled ? { background: '#1d2b1d', color: '#c8f7c8', borderColor: '#4caf50', borderWidth: 2, radius: 14, padding: 6 } : undefined,
  })
  if (!p) console.warn(`[popover-test] level ${props.depth + 1} refused`)
}

// A folder row opens its child on hover (E5c-2a), a little later during a drag (the held gesture lets it).
let timer: number | null = null
function onEnter(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  timer = window.setTimeout(() => openChild(el), props.isDragging() ? 450 : 150)
}
function onLeave() { if (timer !== null) { clearTimeout(timer); timer = null } }
onBeforeUnmount(onLeave)
</script>

<template>
  <div class="lvl">
    <div class="title">Level {{ depth }}</div>
    <button v-for="r in rows" :key="r.id" type="button" class="r"
            @click="openChild($event.currentTarget as HTMLElement)"
            @pointerenter="onEnter" @pointerleave="onLeave">
      📁 {{ r.label }} ›
    </button>
    <button type="button" class="r" @click="close?.()">Close this level <span class="x">✕</span></button>
  </div>
</template>

<style scoped>
.lvl { display: flex; flex-direction: column; min-width: 160px; padding: 4px; font-size: 13px; }
.title { font-weight: 600; padding: 4px 8px; opacity: .7; }
.r { text-align: left; padding: 5px 8px; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.r:hover { background: rgba(255, 255, 255, .08); }
.x { float: right; opacity: .6; }
</style>
