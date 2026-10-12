<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import { TreeController, key, label, newState, within, type Node, type Root, type RootSource, type TreeMemory, type TreeRow } from './tree'
import './tree.css'

const props = defineProps<{ roots: Root[]; source: RootSource; memory: TreeMemory; icon?: (path: string) => string; initialPath?: string | null }>()
const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'favorite', root: Root): void
  (e: 'add'): void
  (e: 'refreshRoots'): void
  (e: 'menu', event: MouseEvent, path: string): void
}>()
const tick = ref(0), selector = ref(false), query = ref(''), focused = ref('')
const panel = ref<HTMLElement | null>(null), scroll = ref<HTMLElement | null>(null), selectorScroll = ref<HTMLElement | null>(null), selectButton = ref<HTMLElement | null>(null), search = ref<HTMLInputElement | null>(null)
const scrollTop = ref(0), viewport = ref(480), panelWidth = ref(999)
const hoverCounts = ref<Record<string, { status: 'loading' | 'ready' | 'error'; total?: number; error?: string }>>({})
const treeId = `tv-${getCurrentInstance()?.uid}`
let pendingRestore: { scroll: number; anchor?: string } | null = null
type CountProbe = { timer?: ReturnType<typeof setTimeout>; source?: ReturnType<RootSource['open']>; off?: () => void }
const countProbes = new Map<string, CountProbe>()
let controller!: TreeController
function onTreeChange() {
  tick.value++
  const current = props.memory.roots[props.memory.active]
  if (current && controller?.root?.status === 'ready') current.rootTotal = controller.root.total
}
controller = new TreeController(props.source, onTreeChange)
const root = computed(() => props.roots.find(r => r.id === props.memory.active))
const state = computed(() => props.memory.roots[props.memory.active])
const narrow = computed(() => panelWidth.value < 242)
const narrowNode = computed(() => {
  void tick.value
  const path = state.value?.narrowPath
  return (path && controller.find(path)) || controller.root
})
const rows = computed(() => {
  void tick.value
  return narrow.value && narrowNode.value ? controller.levelRows(narrowNode.value, 1) : controller.rows()
})
const start = computed(() => Math.max(0, Math.floor(scrollTop.value / 30) - 6))
const visible = computed(() => rows.value.slice(start.value, start.value + Math.ceil(viewport.value / 30) + 12))
const activePath = computed(() => state.value?.focus || root.value?.path || '')
const narrowParent = computed(() => {
  const node = narrowNode.value
  if (!node || key(node.path) === key(activePath.value)) return null
  return controller.rows().find(row => row.type === 'node' && key(row.node.path) === key(node.path))?.parent || activePath.value
})
const activeRow = computed(() => rows.value.findIndex(r => r.type === 'node' && key(r.node.path) === key(focused.value)))
const groups = computed(() => {
  const filtered = props.roots.filter(r => `${r.label} ${r.path}`.toLowerCase().includes(query.value.toLowerCase()))
  const result: { name: string; roots: Root[] }[] = []
  const recent = props.memory.recent.map(id => filtered.find(r => r.id === id)).filter((r): r is Root => !!r).slice(0, 4)
  if (!query.value && recent.length) result.push({ name: 'Recent', roots: recent })
  for (const name of [...new Set(filtered.map(r => r.group))]) result.push({ name, roots: filtered.filter(r => r.group === name) })
  return result
})
function saveScroll(mode = narrow.value) {
  if (!state.value || !scroll.value || pendingRestore) return
  const value = scroll.value.scrollTop
  const anchor = rows.value[Math.floor(value / 30)]?.id
  if (mode) { state.value.narrowScroll = value; state.value.narrowAnchor = anchor }
  else { state.value.scroll = value; state.value.anchor = anchor }
}
function restoreScroll() {
  if (!scroll.value || !state.value) return
  const saved = pendingRestore || (narrow.value
    ? { scroll: state.value.narrowScroll || 0, anchor: state.value.narrowAnchor }
    : state.value)
  const i = rows.value.findIndex(r => r.id === saved.anchor)
  if (pendingRestore && i < 0 && [...controller.sessions.values()].some(s => s.node.status === 'loading' || s.node.loadingMore)) return
  scroll.value.scrollTop = i >= 0 ? i * 30 + saved.scroll % 30 : saved.scroll
  pendingRestore = null
  scrollTop.value = scroll.value.scrollTop
}
function mountRoot() {
  const r = root.value
  pendingRestore = narrow.value
    ? { scroll: state.value?.narrowScroll || 0, anchor: state.value?.narrowAnchor }
    : { scroll: state.value?.scroll || 0, anchor: state.value?.anchor }
  controller.setRoot(r?.kind === 'folder' ? activePath.value : '', state.value || newState())
  if (state.value && state.value.narrowPath && !within(state.value.narrowPath, activePath.value)) state.value.narrowPath = activePath.value
  focused.value = state.value?.selected || ''
  scrollTop.value = 0
  tick.value++
  nextTick(restoreScroll)
}
function choose(r: Root) {
  if (r.kind === 'unavailable') return
  if (r.kind === 'favorite') { emit('favorite', r); selector.value = false; return }
  if (r.kind === 'destination') { navigate(r.path); selector.value = false; return }
  saveScroll()
  props.memory.roots[r.id] ??= newState()
  props.memory.active = r.id
  props.memory.recent = [r.id, ...props.memory.recent.filter(id => id !== r.id)].slice(0, 8)
  selector.value = false
  nextTick(() => scroll.value?.focus())
}
function focusFolder(path: string) {
  if (!state.value) return
  saveScroll()
  if (!state.value.focus) state.value.beforeFocus = {
    expanded: [...state.value.expanded], scroll: state.value.scroll, anchor: state.value.anchor,
    narrowPath: state.value.narrowPath, narrowScroll: state.value.narrowScroll, narrowAnchor: state.value.narrowAnchor,
  }
  state.value.focus = path; state.value.scroll = 0; state.value.anchor = undefined
  state.value.narrowPath = path; state.value.narrowScroll = 0; state.value.narrowAnchor = undefined
  mountRoot()
}
function exitFocus() {
  if (!state.value) return
  const previous = state.value.beforeFocus
  state.value.focus = ''
  if (previous) Object.assign(state.value, previous)
  delete state.value.beforeFocus
  mountRoot()
}
function command(id: string, path: string) {
  if (id === 'focus') focusFolder(path)
  if (id === 'exit-focus') exitFocus()
  if (id === 'minimize-all') {
    controller.minimize()
    if (state.value) { state.value.narrowPath = activePath.value; state.value.narrowScroll = 0; state.value.narrowAnchor = undefined }
    scrollTop.value = 0
  }
  if (id === 'minimize-others') {
    controller.minimize(path)
    if (narrow.value && state.value && within(path, activePath.value)) {
      state.value.narrowPath = path; state.value.narrowScroll = 0; state.value.narrowAnchor = undefined
      scrollTop.value = 0
    }
  }
  if (id === 'refresh') controller.refresh()
  nextTick(() => { if (scroll.value && scrollTop.value === 0) scroll.value.scrollTop = 0 })
}
function navigate(path: string) {
  try {
    props.source.navigate(path)
    if (state.value) state.value.selected = path
    focused.value = path
    emit('navigate', path)
  } catch { /* The adapter reports navigation failures through host UI. */ }
}
async function reveal(path = state.value?.selected || props.initialPath || '') {
  if (!path || !state.value || !within(path, root.value?.path || '')) return
  if (state.value.focus && !within(path, state.value.focus)) exitFocus()
  // Reveal only known loaded rows. Cross-pane/current-location synchronization needs the host API.
  const row = rows.value.find(r => key(r.node.path) === key(path) && r.type === 'node')
  if (row) { focused.value = row.node.path; await moveTo(row) }
}
function icon(path: string) { try { return props.icon?.(path) || '' } catch { return '' } }
function imageIcon(path: string) { return /^(data:|https?:|blob:|\/)/.test(icon(path)) }
function rootTip(r: Root) {
  if (r.kind === 'unavailable') return { content: r.label, detail: r.reason || 'This location is unavailable.' }
  const count = props.memory.roots[r.id]?.rootTotal
  const folders = count === undefined ? '' : `${count.toLocaleString()} ${count === 1 ? 'folder' : 'folders'} · `
  const kind = r.kind === 'favorite' ? 'Favorite · ' : ''
  return { content: `Go to ${r.label}`, detail: `${folders}${kind}${r.path}` }
}
function folderTip(node: Node) {
  const known = node.version >= 0 ? { status: 'ready' as const, total: node.total } : hoverCounts.value[key(node.path)]
  let count = 'Hover to count subfolders'
  if (known?.status === 'loading') count = 'Counting subfolders…'
  else if (known?.status === 'error') count = known.error ? `Could not count subfolders: ${known.error}` : 'Subfolder count unavailable'
  else if (known?.status === 'ready') count = known.total === 0 ? 'No subfolders' : `${known.total?.toLocaleString()} ${known.total === 1 ? 'subfolder' : 'subfolders'}`
  return { content: node.name, detail: `${count} · ${node.path}` }
}
function finishCountProbe(id: string, result?: { status: 'ready'; total: number } | { status: 'error'; error: string }) {
  const probe = countProbes.get(id)
  if (!probe) return
  if (probe.timer) clearTimeout(probe.timer)
  probe.off?.(); probe.source?.close(); countProbes.delete(id)
  if (result) hoverCounts.value = { ...hoverCounts.value, [id]: result }
  else { const next = { ...hoverCounts.value }; delete next[id]; hoverCounts.value = next }
}
function beginCountProbe(node: Node) {
  const id = key(node.path)
  if (node.version >= 0 || hoverCounts.value[id]?.status === 'ready' || countProbes.has(id)) return
  hoverCounts.value = { ...hoverCounts.value, [id]: { status: 'loading' } }
  const probe: CountProbe = {}
  probe.timer = setTimeout(() => {
    probe.timer = undefined
    try {
      const source = props.source.open(node.path)
      probe.source = source
      const update = () => {
        const snapshot = source.snapshot()
        if (snapshot.status === 'ready') finishCountProbe(id, { status: 'ready', total: snapshot.total })
        else if (snapshot.status === 'error' || snapshot.status === 'closed') finishCountProbe(id, { status: 'error', error: snapshot.error?.message || 'Folder unavailable' })
      }
      probe.off = source.subscribe(update)
      update()
    } catch (error) {
      finishCountProbe(id, { status: 'error', error: error instanceof Error ? error.message : 'Folder unavailable' })
    }
  }, 120)
  countProbes.set(id, probe)
}
function endCountProbe(node: Node) {
  const id = key(node.path)
  if (hoverCounts.value[id]?.status === 'loading') finishCountProbe(id)
}
function closeCountProbes() { for (const id of [...countProbes.keys()]) finishCountProbe(id) }
function enterNarrow(row: TreeRow) {
  if (!controller.isExpanded(row.node.path)) controller.toggle(row.node)
  if (state.value) { state.value.narrowPath = row.node.path; state.value.narrowScroll = 0; state.value.narrowAnchor = undefined }
  focused.value = ''
  scrollTop.value = 0
  nextTick(() => { if (scroll.value) scroll.value.scrollTop = 0; scroll.value?.focus() })
}
function leaveNarrow() {
  const node = narrowNode.value
  const parent = narrowParent.value
  if (!node || !parent || !state.value) return
  if (controller.isExpanded(node.path)) controller.toggle(node)
  state.value.narrowPath = parent
  state.value.narrowScroll = 0; state.value.narrowAnchor = undefined
  focused.value = node.path
  scrollTop.value = 0
  nextTick(() => { if (scroll.value) scroll.value.scrollTop = 0; scroll.value?.focus() })
}
function toggle(row: TreeRow) {
  if (narrow.value) enterNarrow(row)
  else { focused.value = row.node.path; controller.toggle(row.node); nextTick(() => scroll.value?.focus()) }
}
async function moveTo(row: TreeRow) {
  focused.value = row.node.path
  const index = rows.value.findIndex(r => r.id === row.id)
  const el = scroll.value
  if (!el) return
  const top = index * 30
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + 30 > el.scrollTop + el.clientHeight) el.scrollTop = top + 30 - el.clientHeight
  scrollTop.value = el.scrollTop
  await nextTick()
}
let typed = '', typedAt = 0
function keydown(event: KeyboardEvent) {
  if (event.target !== scroll.value) return
  if (event.key === 'ArrowLeft' && narrow.value && narrowParent.value) {
    event.preventDefault(); leaveNarrow(); return
  }
  const nodes = rows.value.filter(r => r.type === 'node')
  const index = nodes.findIndex(r => key(r.node.path) === key(focused.value))
  const row = nodes[index]
  let target: TreeRow | undefined
  if (event.key === 'ArrowDown') target = nodes[Math.min(nodes.length - 1, index + 1)]
  else if (event.key === 'ArrowUp') target = nodes[Math.max(0, index - 1)]
  else if (event.key === 'Home') target = nodes[0]
  else if (event.key === 'End') target = nodes[nodes.length - 1]
  else if (event.key === 'ArrowRight' && row) {
    if (narrow.value) enterNarrow(row)
    else if (!controller.isExpanded(row.node.path)) controller.toggle(row.node)
    else target = nodes[index + 1]?.parent === row.node.path ? nodes[index + 1] : undefined
  } else if (event.key === 'ArrowLeft' && row) {
    if (controller.isExpanded(row.node.path)) controller.toggle(row.node)
    else target = nodes.find(r => key(r.node.path) === key(row.parent))
  } else if (event.key === 'Enter' && row) navigate(row.node.path)
  else if (event.key === ' ' && row) narrow.value ? enterNarrow(row) : controller.toggle(row.node)
  else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    typed = Date.now() - typedAt > 800 ? event.key : typed + event.key; typedAt = Date.now()
    const ordered = [...nodes.slice(index + 1), ...nodes.slice(0, index + 1)]
    target = ordered.find(r => (!row || r.parent === row.parent) && r.node.name.toLowerCase().startsWith(typed.toLowerCase()))
  } else return
  event.preventDefault()
  if (target) void moveTo(target)
}
function onScroll() { scrollTop.value = scroll.value?.scrollTop || 0; saveScroll() }
watch(selector, async open => { if (open) { saveScroll(); query.value = ''; emit('refreshRoots'); await nextTick(); search.value?.focus() } else { await nextTick(); restoreScroll() } })
watch(() => props.roots, roots => {
  if (roots.some(r => r.id === props.memory.active && r.kind === 'folder')) return
  const next = roots.find(r => r.kind === 'folder' && props.initialPath && within(props.initialPath, r.path)) || roots.find(r => r.kind === 'folder')
  if (next) choose(next)
  else { props.memory.active = ''; controller.close(); tick.value++ }
}, { immediate: true })
watch(() => props.memory.active, mountRoot, { immediate: true })
watch(narrow, async (value, previous) => {
  saveScroll(previous)
  if (value && state.value) {
    const candidates = state.value.expanded.filter(path => within(path, activePath.value) && controller.find(path))
    if (!state.value.narrowPath || !within(state.value.narrowPath, activePath.value)) state.value.narrowPath = candidates[candidates.length - 1] || activePath.value
  }
  pendingRestore = value
    ? { scroll: state.value?.narrowScroll || 0, anchor: state.value?.narrowAnchor }
    : { scroll: state.value?.scroll || 0, anchor: state.value?.anchor }
  scrollTop.value = 0
  await nextTick(); restoreScroll()
})
watch(rows, async (next, previous) => {
  const anchor = previous[Math.floor(scrollTop.value / 30)]?.id
  const offset = scrollTop.value % 30
  await nextTick()
  if (!focused.value && next.some(r => r.type === 'node')) focused.value = next.find(r => r.type === 'node')!.node.path
  if (pendingRestore) { restoreScroll(); return }
  if (anchor && scroll.value) {
    const i = next.findIndex(r => r.id === anchor)
    if (i >= 0) scroll.value.scrollTop = i * 30 + offset
  }
  if (state.value?.anchor && !previous.length) restoreScroll()
})
const { hasOverflow, atStart, atEnd, scrollByPage } = useScrollHints({ scrollEl: scroll, axis: 'y', deps: () => `${rows.value.length}:${viewport.value}:${selector.value}`, minPageStep: 60 })
const { hasOverflow: selectorHasOverflow, atStart: selectorAtStart, atEnd: selectorAtEnd, scrollByPage: scrollSelectorByPage } = useScrollHints({
  scrollEl: selectorScroll,
  axis: 'y',
  deps: () => `${selector.value}:${query.value}:${groups.value.map(group => group.roots.length).join(':')}`,
  minPageStep: 60,
})
let scrollObserver: ResizeObserver | undefined, panelObserver: ResizeObserver | undefined
watch(scroll, el => { scrollObserver?.disconnect(); if (el) { scrollObserver = new ResizeObserver(() => viewport.value = el.clientHeight); scrollObserver.observe(el); viewport.value = el.clientHeight } })
watch(panel, el => { panelObserver?.disconnect(); if (el) { panelObserver = new ResizeObserver(() => panelWidth.value = el.clientWidth); panelObserver.observe(el); panelWidth.value = el.clientWidth } })
onBeforeUnmount(() => { saveScroll(); closeCountProbes(); scrollObserver?.disconnect(); panelObserver?.disconnect(); controller.close() })
defineExpose({ choose, focusFolder, command, exitFocus, reveal, root, selector })
</script>

<template>
  <section ref="panel" class="tv-panel" :class="{ 'tv-narrow': narrow }" aria-label="Tree View">
    <header class="tv-header">
      <button ref="selectButton" class="tv-root" :aria-expanded="selector" aria-label="Choose root" v-gex-tooltip="{ content: 'Go to', detail: root ? `${root.label} · ${root.path}` : 'Choose a root or favorite.' }" @click="selector = !selector"><span class="tv-root-icon">▱</span><span>{{ root?.label || 'Choose a root' }}</span><span class="tv-chevron">⌄</span></button>
      <button class="tv-tool" v-gex-tooltip="{ content: 'Add folder', detail: 'Choose another folder to use as a Tree View root.' }" aria-label="Add folder root" @click="emit('add')">＋</button>
      <button class="tv-tool" v-gex-tooltip="{ content: 'Refresh', detail: 'Reload roots and the folders currently open in the tree.' }" aria-label="Refresh folders and roots" @click="controller.refresh(); emit('refreshRoots')">↻</button>
    </header>
    <div v-if="selector" class="tv-selector" @keydown.esc.stop="selector = false; selectButton?.focus()">
      <div class="tv-selector-heading"><strong>Go to</strong><span>Choose a root or favorite</span></div>
      <input ref="search" v-model="query" type="search" placeholder="Find a root…" aria-label="Find a root" />
      <div class="tv-root-results-shell">
        <button v-if="selectorHasOverflow" class="tv-scroll-hint tv-scroll-up" :disabled="selectorAtStart" :aria-label="selectorAtStart ? 'At first root' : 'Scroll roots up'" @click="scrollSelectorByPage(-1)"><span>{{ selectorAtStart ? '—' : '▲' }}</span></button>
        <div ref="selectorScroll" class="tv-root-results">
          <section v-for="group in groups" :key="group.name">
            <h3>{{ group.name }}</h3>
            <button v-for="r in group.roots" :key="r.id" class="tv-root-option" :disabled="r.kind === 'unavailable'" v-gex-tooltip="rootTip(r)" @click="choose(r)"><span>{{ r.kind === 'favorite' ? '☆' : r.kind === 'unavailable' ? '◌' : '▱' }}</span><span><strong>{{ r.label }}</strong><small>{{ r.reason || r.path }}</small></span><span v-if="r.id === memory.active">✓</span></button>
          </section>
          <p v-if="!groups.length" class="tv-notice">No matching roots.</p>
        </div>
        <button v-if="selectorHasOverflow" class="tv-scroll-hint tv-scroll-down" :disabled="selectorAtEnd" :aria-label="selectorAtEnd ? 'At last root' : 'Scroll roots down'" @click="scrollSelectorByPage(1)"><span>{{ selectorAtEnd ? '—' : '▼' }}</span></button>
      </div>
      <button class="tv-text-button" @click="selector = false; selectButton?.focus()">Back to tree</button>
    </div>
    <template v-else>
      <div v-if="state?.focus" class="tv-focus-strip"><span :title="state.focus">Focused: {{ label(state.focus) }}</span><button @click="exitFocus">Entire {{ root?.label }}</button></div>
      <div v-if="narrow && narrowNode" class="tv-narrow-level">
        <button v-if="narrowParent" v-gex-tooltip="{ content: `Go up to ${label(narrowParent)}`, detail: narrowParent }" :aria-label="`Collapse ${narrowNode.name} and show ${label(narrowParent)}`" @click="leaveNarrow"><span class="tv-folder-up-icon" aria-hidden="true"><span>↑</span></span><strong>{{ label(narrowParent) }}</strong></button>
        <div :title="narrowNode.path"><span>▱</span><strong>{{ narrowNode.name }}</strong></div>
      </div>
      <div class="tv-tree-shell">
        <button v-if="hasOverflow" class="tv-scroll-hint tv-scroll-up" :disabled="atStart" :aria-label="atStart ? 'At top' : 'Scroll up'" @click="scrollByPage(-1)"><span>{{ atStart ? '—' : '▲' }}</span></button>
        <div ref="scroll" class="tv-tree" tabindex="0" role="tree" :aria-label="narrow && narrowNode ? `${narrowNode.name} folders` : root?.label || 'Folders'" :aria-activedescendant="activeRow >= start && activeRow < start + visible.length ? `${treeId}-row-${activeRow}` : undefined" @keydown="keydown" @scroll="onScroll">
          <div :style="{ height: `${rows.length * 30}px`, position: 'relative' }">
          <div v-for="(row, i) in visible" :id="`${treeId}-row-${start + i}`" :key="row.id" class="tv-row" :class="{ 'tv-selected': state?.selected && key(state.selected) === key(row.node.path) && row.type === 'node', 'tv-keyboard': focused && key(focused) === key(row.node.path) && row.type === 'node', 'tv-spine': state?.selected && within(state.selected, row.node.path) && row.type === 'node', 'tv-status': row.type !== 'node' }" :style="{ top: `${(start + i) * 30}px`, paddingLeft: `${Math.min(row.depth - 1, 7) * 14 + 4}px` }" :role="row.type === 'node' ? 'treeitem' : undefined" :aria-level="row.type === 'node' ? row.depth : undefined" :aria-expanded="row.type === 'node' ? controller.isExpanded(row.node.path) : undefined" :aria-selected="row.type === 'node' ? key(state?.selected || '') === key(row.node.path) : undefined" :aria-posinset="row.pos" :aria-setsize="row.size" :aria-busy="row.type === 'node' && controller.isExpanded(row.node.path) && row.node.status === 'loading' ? true : undefined" @contextmenu.prevent="emit('menu', $event, row.node.path)">
            <template v-if="row.type === 'node'">
              <button class="tv-disclosure" tabindex="-1" :aria-label="narrow ? `Show ${row.node.name}` : `${controller.isExpanded(row.node.path) ? 'Collapse' : 'Expand'} ${row.node.name}`" @click="toggle(row)">{{ narrow ? '›' : controller.isExpanded(row.node.path) ? '⌄' : '›' }}</button>
              <button class="tv-name" tabindex="-1" v-gex-tooltip="folderTip(row.node)" @mouseenter="beginCountProbe(row.node)" @mouseleave="endCountProbe(row.node)" @focus="beginCountProbe(row.node)" @blur="endCountProbe(row.node)" @click="navigate(row.node.path); scroll?.focus()"><img v-if="imageIcon(row.node.path)" :src="icon(row.node.path)" alt="" /><span v-else class="tv-folder">{{ icon(row.node.path) || '▱' }}</span><span>{{ row.node.name }}</span></button>
            </template>
            <template v-else-if="row.type === 'error'"><span :title="row.node.error">{{ row.node.error }}</span><button @click="controller.retry(row.node)">Retry</button></template>
            <template v-else-if="row.type === 'more'"><button :disabled="row.node.loadingMore" @click="controller.more(row.node)">{{ row.node.loadingMore ? 'Loading…' : `Show more (${row.node.children.length} of ${row.node.total})` }}</button></template>
            <span v-else>{{ row.type === 'loading' ? 'Loading folders…' : 'No subfolders' }}</span>
          </div>
          </div>
          <p v-if="!root" class="tv-notice">Choose a root or add a folder to begin.</p>
        </div>
        <button v-if="hasOverflow" class="tv-scroll-hint tv-scroll-down" :disabled="atEnd" :aria-label="atEnd ? 'At bottom' : 'Scroll down'" @click="scrollByPage(1)"><span>{{ atEnd ? '—' : '▼' }}</span></button>
      </div>
    </template>
  </section>
</template>
