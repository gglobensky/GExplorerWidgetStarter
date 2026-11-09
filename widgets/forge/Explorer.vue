<!-- widgets/forge/Explorer.vue -->
<!--
    GEM FORGE 0.1: the project's files as a tree (folders first, folded and unfolded with a click). ● marks a file with
    unsaved edits, ⚠ one that changed on disk while edited here. A click opens it in the editor.
    0.1c, right-click (a folder project): GEM Shell's file menu (entry.ts menuContexts 'forge.file' / 'forge.folder',
    subject 'files'): Open, Open with ▸, Show in folder (GEM Shell's explorer), Copy path…, other widgets' actions;
    0.1.6: on a folder or the project's name, GEM Forge's own New file… and New folder… (onMenuItem, Widget.vue);
    "Open in the editor" went (a click does it).
    0.1.9: several selected (Ctrl+click, Shift+click): their menu holds Delete (and GEM Shell's items for them all);
    a file's: Rename… (its references updated, if you want), Duplicate, Delete. Delete (the key) deletes the selection
    while the Explorer has the focus. The project's name: a click shows New file…, New folder…, Show in folder.
    0.1.10: the selection is always shown (a right-click selects the row it's on, unless it's in the selection); the
    file in the editor has a mark at its left; the project's name: the same menu on a right-click as on a click.
    0.1.11: drag files onto a folder (or the project's name) to move them, their imports updated; Rename… is left
    out of the menu when several are selected.
-->
<template>
    <div ref="rootEl" class="gf-explorer" :class="{ dragging: !!dragging }">
        <div class="gf-ex-head" :class="{ live: !!project.state.folder, drop: dropAt === '' }" title="New file, new folder… (a click or a right-click)"
             @click="headMenu($event)" @contextmenu.prevent="headMenu($event)">
            <span class="gf-proj">{{ project.state.name || 'No project' }}</span>
            <span v-if="project.state.watching" class="gf-dot" title="GEM Forge watches this folder: what an AI or another editor writes there reloads it." />
        </div>
        <div v-if="!rows.length" class="gf-empty">New ▾ makes a project; Open a folder… opens one.</div>
        <button v-for="r in rows" :key="r.key" type="button"
                class="gf-row" :class="{ on: r.path === project.state.active, dir: r.dir, flash: r.path === flashed, sel: selected.includes(r.path), drop: r.dir && dropAt === r.path }" :data-row="r.path"
                :style="{ paddingLeft: `${8 + r.depth * 14}px` }"
                :title="r.path"
                :aria-selected="selected.includes(r.path)"
                @pointerdown="onRowDown($event, r)"
                @click="onRowClick($event, r)"
                @contextmenu.prevent="onRowMenu($event, r)">
            <span class="gf-ico">{{ r.dir ? (folded.has(r.path) ? '▸' : '▾') : icon(r.name) }}</span>
            <span class="gf-name" :class="{ 'gf-skipped': isSkipped(project, r.path) }">{{ r.name }}</span>
            <!-- 0.2.13: left out of Check all (this one; what's in a folder left out is dimmed) -->
            <span v-if="project.state.checkSkip.includes(r.path)" class="gf-skip" title="Left out of Check all (right-click ▸ Include in Check all)">⊘</span>
            <span v-if="!r.dir && project.state.conflicts.includes(r.path)" class="gf-warn" title="Changed on disk while you edited it">⚠</span>
            <span v-else-if="!r.dir && project.isDirty(r.path)" class="gf-dirty" title="Not saved">●</span>
        </button>
        <div v-if="project.state.folder" class="gf-ex-foot" :title="project.state.folder">{{ project.state.folder }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, reactive, ref, watch } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import type { Project } from './project'
import { isSkipped } from './checks'
import { prettyFor } from './pretty'

const props = defineProps<{ project: Project }>()
const sdk = inject<WidgetSdk>('widgetSdk')!

// GEM Shell's menu for a file or a folder of the project (a folder project only: the paths are real)
function folderMenu(e: MouseEvent, rel: string) {
    const full = props.project.pathOf(rel)
    if (full) void sdk.ui?.().contextMenu(e, { context: 'forge.folder', ref: rel, selection: [full] })
}

// ── Selection (0.1.9): a click selects (a file opens), Ctrl+click adds or removes, Shift+click a range ──────────────
const selected = computed(() => props.project.state.selected)
let anchor = ''
type RowLike = { path: string; dir: boolean }
function onRowClick(e: MouseEvent, r: RowLike) {
    if (justDropped) { justDropped = false; return }
    const s = props.project.state
    if (e.shiftKey && anchor) {
        const order = rows.value.map(x => x.path)
        const a = order.indexOf(anchor), b = order.indexOf(r.path)
        if (a >= 0 && b >= 0) { s.selected = order.slice(Math.min(a, b), Math.max(a, b) + 1); return }
    }
    if (e.ctrlKey || e.metaKey) {
        s.selected = s.selected.includes(r.path) ? s.selected.filter((p: string) => p !== r.path) : [...s.selected, r.path]
        anchor = r.path
        return
    }
    s.selected = [r.path]
    anchor = r.path
    if (r.dir) toggle(r.path)
    else props.project.open(r.path)
}
/** A right-click on a row: the selection's menu (the row joins it, or becomes it). */
function onRowMenu(e: MouseEvent, r: RowLike) {
    const s = props.project.state
    if (!s.selected.includes(r.path)) { s.selected = [r.path]; anchor = r.path }
    const pr = props.project
    const paths = s.selected.map((p: string) => pr.pathOf(p)).filter(Boolean)
    if (!paths.length) return
    const allDirs = s.selected.every((p: string) => !pr.file(p))
    // 'several': Rename… is left out (entry.ts menuStates / hideWhen)
    // 0.2.12: 'skipped' (all left out of Check all: Leave out… hidden), 'included' (none: Include… hidden), 'no-prettier'
    const skipped = s.selected.filter((p: string) => isSkipped(pr, p)).length
    const states = [
        ...(s.selected.length > 1 ? ['several'] : []),
        ...(skipped === s.selected.length ? ['skipped'] : []),
        ...(skipped === 0 ? ['included'] : []),
        ...(prettyFor(pr).available() ? [] : ['no-prettier']),
    ]
    void sdk.ui?.().contextMenu(e, { context: allDirs && s.selected.length === 1 ? 'forge.folder' : 'forge.file', ref: r.path, selection: paths, states })
}

// ── Drag to move (0.1.11): files dragged onto a folder (or the project's name) move there; their imports follow ──
const dragging = ref<string[] | null>(null)
const dropAt = ref<string | null>(null)
let justDropped = false
function onRowDown(e: PointerEvent, r: RowLike) {
    if (e.button !== 0 || r.dir || !props.project.state.folder) return
    const x0 = e.clientX, y0 = e.clientY
    const s = props.project.state
    const move = (ev: PointerEvent) => {
        if (!dragging.value) {
            if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return
            const sel = s.selected.includes(r.path) ? s.selected : [r.path]
            dragging.value = sel.filter((p: string) => !!props.project.file(p))
        }
        const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)
        const inside = el && rootEl.value?.contains(el) ? el : null
        const row = inside?.closest<HTMLElement>('[data-row]')
        const path = row?.dataset.row ?? null
        const isDir = path !== null && !props.project.file(path)
        dropAt.value = isDir ? path : inside?.closest('.gf-ex-head') ? '' : null
    }
    const up = () => {
        window.removeEventListener('pointermove', move)
        const files = dragging.value, to = dropAt.value
        dragging.value = null
        dropAt.value = null
        if (files && files.length) {
            justDropped = true
            window.setTimeout(() => { justDropped = false }, 0)
            if (to !== null) void props.project.moveFiles(files, to)
        }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
}

// The project's name (a left click): the same as its right-click, as a menu of GEM Forge's own
async function headMenu(e: MouseEvent) {
    const pr = props.project
    if (!pr.state.folder) return
    const id = await sdk.ui?.().menu(e.currentTarget as HTMLElement, [
        { id: 'new-file', label: 'New file…' },
        { id: 'new-folder', label: 'New folder…' },
        { id: 'folder', label: 'Show in folder', title: 'In GEM Shell\'s explorer' },
        { id: 'copy', label: 'Copy path' },
    ], { label: pr.state.name })
    if (!id) return
    if (id === 'folder') await sdk.reveal?.(pr.state.folder)
    else if (id === 'copy') await sdk.clipboardSetText?.(pr.state.folder)
    else emitMenu(id)
}
const onMenuItem = inject<((m: { itemId: string; ref: string }) => void) | null>('gfMenuItem', null)
const emitMenu = (id: string) => onMenuItem?.({ itemId: id, ref: '' })
const folded = reactive(new Set<string>())

// 0.1.8: a tab's "Show in the Explorer": its folders unfolded, its row scrolled into view and flashed
const rootEl = ref<HTMLElement | null>(null)
const flashed = ref('')
watch(() => props.project.state.explorerReveal?.seq, async () => {
    const r = props.project.state.explorerReveal
    if (!r) return
    const parts = r.path.split('/')
    for (let i = 1; i < parts.length; i++) folded.delete(parts.slice(0, i).join('/'))
    await nextTick()
    const el = [...(rootEl.value?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].find(e => e.dataset.row === r.path)
    el?.scrollIntoView({ block: 'nearest' })
    flashed.value = r.path
    window.setTimeout(() => { if (flashed.value === r.path) flashed.value = '' }, 1200)
})

type Row = { key: string; path: string; name: string; depth: number; dir: boolean }

const rows = computed<Row[]>(() => {
    // A tree from the paths: folders first, then files, each sorted by name
    type Node = { dirs: Map<string, Node>; files: string[] }
    const root: Node = { dirs: new Map(), files: [] }
    // 0.1.6: folders made here, still empty
    for (const d of props.project.state.dirs ?? []) {
        let n = root
        for (const part of d.split('/')) {
            if (!n.dirs.has(part)) n.dirs.set(part, { dirs: new Map(), files: [] })
            n = n.dirs.get(part)!
        }
    }
    for (const f of props.project.state.files) {
        const parts = f.path.split('/')
        let n = root
        for (const d of parts.slice(0, -1)) {
            if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), files: [] })
            n = n.dirs.get(d)!
        }
        n.files.push(f.path)
    }
    const out: Row[] = []
    const walk = (n: Node, prefix: string, depth: number) => {
        for (const [name, child] of [...n.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
            const path = prefix ? `${prefix}/${name}` : name
            out.push({ key: `d:${path}`, path, name, depth, dir: true })
            if (!folded.has(path)) walk(child, path, depth + 1)
        }
        for (const p of [...n.files].sort((a, b) => a.localeCompare(b)))
            out.push({ key: `f:${p}`, path: p, name: p.split('/').pop() ?? p, depth, dir: false })
    }
    walk(root, '', 0)
    return out
})

function toggle(path: string) {
    if (folded.has(path)) folded.delete(path)
    else folded.add(path)
}

function icon(name: string): string {
    if (name.endsWith('.vue')) return '◆'
    if (/\.(ts|js|mjs)$/.test(name)) return '◇'
    if (name.endsWith('.css')) return '#'
    if (name.endsWith('.json')) return '{}'
    if (name.endsWith('.md')) return '¶'
    return '·'
}
</script>
