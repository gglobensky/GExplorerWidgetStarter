<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import { key, within, type Node, type TreeRow } from './tree'

const props = defineProps<{
  owner: Node
  rows: TreeRow[]
  column: number
  activeChild?: string
  selected?: string
  focused?: string
  icon?: (path: string) => string
  widgetId?: string
  expanded: (path: string) => boolean
  tip: (node: Node) => { content: string; detail: string }
  /** 0.5.3: on the clipboard as cut (faded). */
  cut?: (path: string) => boolean
}>()
const emit = defineEmits<{
  (e: 'open', row: TreeRow): void
  (e: 'back', column: number): void
  (e: 'fold', column: number): void
  (e: 'navigate', path: string): void
  (e: 'focus', path: string): void
  (e: 'clipboard', operation: 'copy' | 'cut' | 'paste', path: string): void
  (e: 'menu', event: MouseEvent, path: string): void
  (e: 'more', node: Node): void
  (e: 'retry', node: Node): void
  (e: 'probe', node: Node): void
  (e: 'end-probe', node: Node): void
}>()

const scroll = ref<HTMLElement | null>(null), scrollTop = ref(0), viewport = ref(360)
const id = `tvc-${getCurrentInstance()?.uid}`
const start = computed(() => Math.max(0, Math.floor(scrollTop.value / 30) - 6))
const visible = computed(() => props.rows.slice(start.value, start.value + Math.ceil(viewport.value / 30) + 12))
const nodeRows = computed(() => props.rows.filter(row => row.type === 'node'))
const activeIndex = computed(() => props.rows.findIndex(row => row.type === 'node' && key(row.node.path) === key(props.focused || '')))
function imageIcon(path: string) { return /^(data:|https?:|blob:|\/)/.test(props.icon?.(path) || '') }
async function move(row: TreeRow) {
  emit('focus', row.node.path)
  const index = props.rows.findIndex(candidate => candidate.id === row.id)
  const el = scroll.value
  if (!el || index < 0) return
  const top = index * 30
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + 30 > el.scrollTop + el.clientHeight) el.scrollTop = top + 30 - el.clientHeight
  scrollTop.value = el.scrollTop
  await nextTick()
}
let typed = '', typedAt = 0
function keydown(event: KeyboardEvent) {
  if (event.target !== scroll.value) return
  const nodes = nodeRows.value
  const index = nodes.findIndex(row => key(row.node.path) === key(props.focused || ''))
  const row = nodes[index]
  let target: TreeRow | undefined
  // Ctrl+C / X / V are commands now (entry.ts, 0.5.2): the panel's commandTarget is the focused row.
  if (event.key === 'ArrowDown') target = nodes[Math.min(nodes.length - 1, index + 1)]
  else if (event.key === 'ArrowUp') target = nodes[Math.max(0, index - 1)]
  else if (event.key === 'Home') target = nodes[0]
  else if (event.key === 'End') target = nodes[nodes.length - 1]
  else if (event.key === 'ArrowRight' && row) emit('open', row)
  else if (event.key === ' ' && row) active(row) ? emit('back', props.column + 1) : emit('open', row)
  else if (event.key === 'ArrowLeft' && props.column > 0) emit('back', props.column)
  else if (event.key === 'Enter' && row) emit('navigate', row.node.path)
  else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    typed = Date.now() - typedAt > 800 ? event.key : typed + event.key; typedAt = Date.now()
    const ordered = [...nodes.slice(index + 1), ...nodes.slice(0, index + 1)]
    target = ordered.find(candidate => candidate.node.name.toLowerCase().startsWith(typed.toLowerCase()))
  } else return
  event.preventDefault()
  if (target) void move(target)
}
function active(row: TreeRow) { return !!props.activeChild && key(props.activeChild) === key(row.node.path) }
function disclose(row: TreeRow) { active(row) ? emit('back', props.column + 1) : emit('open', row) }
function focusColumn(event: FocusEvent) {
  if (event.target !== scroll.value || activeIndex.value >= 0) return
  const first = nodeRows.value[0]
  if (first) emit('focus', first.node.path)
}
function onScroll() { scrollTop.value = scroll.value?.scrollTop || 0 }
const { hasOverflow, atStart, atEnd, scrollByPage } = useScrollHints({ scrollEl: scroll, axis: 'y', deps: () => `${props.rows.length}:${viewport.value}`, minPageStep: 60 })
let observer: ResizeObserver | undefined
watch(scroll, element => {
  observer?.disconnect()
  if (!element) return
  observer = new ResizeObserver(() => viewport.value = element.clientHeight)
  observer.observe(element); viewport.value = element.clientHeight
})
watch(() => props.focused, async path => {
  const row = props.rows.find(candidate => candidate.type === 'node' && key(candidate.node.path) === key(path || ''))
  if (row) await move(row)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section class="tv-column">
    <header v-gex-tooltip="tip(owner)"><span>▱</span><strong>{{ owner.name }}</strong><small>{{ owner.status === 'ready' ? owner.total.toLocaleString() : '…' }}</small><button class="tv-column-fold" :aria-label="column ? `Fold ${owner.name} and deeper levels` : 'Fold all open folder levels'" v-gex-tooltip="{ content: column ? `Fold ${owner.name}` : 'Fold all', detail: column ? 'Close this folder level and every level to its right.' : 'Close every folder level to the right.' }" @click.stop="emit('fold', column)">«</button></header>
    <div class="tv-column-body">
      <button v-if="hasOverflow" class="tv-scroll-hint tv-scroll-up" :disabled="atStart" :aria-label="atStart ? 'At top' : `Scroll ${owner.name} up`" @click="scrollByPage(-1)"><span>{{ atStart ? '—' : '▲' }}</span></button>
      <div ref="scroll" class="tv-tree tv-column-tree" tabindex="0" role="tree" :aria-label="`${owner.name} folders`" :aria-activedescendant="activeIndex >= start && activeIndex < start + visible.length ? `${id}-row-${activeIndex}` : undefined" @focus="focusColumn" @keydown="keydown" @scroll="onScroll">
        <div :style="{ height: `${rows.length * 30}px`, position: 'relative' }">
          <div v-for="(row, i) in visible" :id="`${id}-row-${start + i}`" :key="row.id" class="tv-row" :class="{ 'tv-selected': selected && key(selected) === key(row.node.path) && row.type === 'node', 'tv-keyboard': focused && key(focused) === key(row.node.path) && row.type === 'node', 'tv-spine': activeChild && within(activeChild, row.node.path) && row.type === 'node', 'tv-status': row.type !== 'node', 'tv-cut': row.type === 'node' && !!cut?.(row.node.path) }" :style="{ top: `${(start + i) * 30}px`, paddingLeft: '4px' }" :role="row.type === 'node' ? 'treeitem' : undefined" :aria-level="row.type === 'node' ? column + 1 : undefined" :aria-expanded="row.type === 'node' ? expanded(row.node.path) : undefined" :aria-selected="row.type === 'node' ? key(selected || '') === key(row.node.path) : undefined" :aria-posinset="row.pos" :aria-setsize="row.size" @contextmenu.prevent="emit('menu', $event, row.node.path)">
            <template v-if="row.type === 'node'">
              <button class="tv-disclosure" tabindex="-1" :aria-label="active(row) ? `Hide ${row.node.name}` : `Show ${row.node.name}`" @click="disclose(row)">{{ active(row) ? '⌄' : '›' }}</button>
              <button class="tv-name" tabindex="-1" :data-rename-id="row.node.path" :data-rename-value="row.node.name" :data-widget-id="widgetId || undefined" v-gex-tooltip="tip(row.node)" @mouseenter="emit('probe', row.node)" @mouseleave="emit('end-probe', row.node)" @focus="emit('probe', row.node)" @blur="emit('end-probe', row.node)" @click="emit('navigate', row.node.path); scroll?.focus()"><img v-if="imageIcon(row.node.path)" :src="icon?.(row.node.path)" alt="" /><span v-else class="tv-folder">{{ icon?.(row.node.path) || '▱' }}</span><span>{{ row.node.name }}</span><span v-if="row.node.link" class="tv-link" aria-label="(link)">↗</span></button>
            </template>
            <template v-else-if="row.type === 'error'"><span :title="row.node.error">{{ row.node.error }}</span><button @click="emit('retry', row.node)">Retry</button></template>
            <template v-else-if="row.type === 'more'"><button :disabled="row.node.loadingMore" @click="emit('more', row.node)">{{ row.node.loadingMore ? 'Loading…' : `Show more (${row.node.children.length} of ${row.node.total})` }}</button></template>
            <span v-else>{{ row.type === 'loading' ? 'Loading folders…' : 'No subfolders' }}</span>
          </div>
        </div>
      </div>
      <button v-if="hasOverflow" class="tv-scroll-hint tv-scroll-down" :disabled="atEnd" :aria-label="atEnd ? 'At bottom' : `Scroll ${owner.name} down`" @click="scrollByPage(1)"><span>{{ atEnd ? '—' : '▼' }}</span></button>
    </div>
  </section>
</template>
