<!-- widgets/corkboard/Board.vue -->
<!--
    THE BOARD (0.1.0): the stacks and pinned groups of a view (a board, or a group opened), a page at a time.
      Drag a stack: the others are pushed aside live, by GEM Shell's hub engine (layout.ts). Over the MIDDLE of
      another stack it piles onto it (on a group's pin: into the group); Shift swaps; Alt places it freely.
      Drag a stack's corner: it grows (2 × 2 at most), pushing the others. Hold it at an edge or over a page dot
      to change page (the empty dot is a new page).
      Double-click the cork: a note there. Right-click: GEM Shell's menu (menus.ts). Wheel / PageUp / PageDown: pages.
-->
<template>
    <div ref="boardEl" class="cb-board" tabindex="0" aria-label="Board"
         @dblclick="onDbl" @contextmenu="onCtx" @wheel.passive="onWheel" @keydown="onKey" @dragover="onDragOver" @drop="onDrop">
        <div v-if="group" class="cb-crumbs">
            <button class="cb-crumb" type="button" data-drop="root" :class="{ 'drop-target': drag?.mode === 'crumb' }"
                    title="Back to the board. Drop a stack here to take it out of the group." @click="desk.leaveGroup()">‹ {{ boardTitle }}</button>
            <span class="cb-head" :class="'p-' + group.pin"></span>
            <span class="cb-gtitle">{{ group.name }}</span>
            <span v-if="groupDue" class="cb-due" :class="'s-' + groupDue.state" :title="'Due ' + groupDue.long">{{ groupDue.short }}</span>
        </div>

        <div v-for="c in cards" :key="c.it.id" class="cb-item" :data-id="c.it.id" :data-kind="c.it.kind"
             :class="cardClass(c)" :style="cardStyle(c)" tabindex="0" role="button" :aria-label="ariaOf(c.it)"
             :title="desk.geo.value.icon ? desk.labelOf(c.it) : ''"
             @pointerdown="down($event, c.it)" @keydown.enter.prevent="openItem(c.it)" @keydown.space.prevent="openItem(c.it)">
            <template v-if="c.it.kind === 'stack'">
                <div class="cb-paper">
                    <template v-if="desk.geo.value.icon"><span class="cb-ini">{{ initials(c.it.name) }}</span></template>
                    <template v-else>
                        <div class="cb-tape">{{ c.it.name }}</div>
                        <div class="cb-ptitle"><span v-if="c.it.numbered && top(c.it).num" class="cb-pnum">#{{ top(c.it).num }}</span> {{ noteLabel(top(c.it)) || 'Empty note' }}</div>
                        <div class="cb-pprev">
                            <div v-for="(l, i) in previewLines(c.it, c.span)" :key="i" :class="{ d: l.done }">{{ l.text }}</div>
                        </div>
                        <div class="cb-pfoot"><span>{{ c.it.notes.length }} note{{ c.it.notes.length === 1 ? '' : 's' }}</span><span v-if="prog(c.it)">{{ prog(c.it) }}</span></div>
                    </template>
                </div>
                <span v-if="desk.geo.value.icon" class="cb-badge">{{ c.it.notes.length }}</span>
                <div v-if="c.it.flags.length" class="cb-flags">
                    <span v-for="f in c.it.flags" :key="f" class="cb-flag" :style="{ '--fc': `var(--cb-fl-${f})` }" :title="FLAG_NAMES[f]"></span>
                </div>
                <span v-if="dueOf(c.it)" class="cb-spin"><span class="cb-head p-red"></span><span class="cb-due" :class="'s-' + dueOf(c.it)!.state">{{ dueOf(c.it)!.short }}</span></span>
                <span v-if="!desk.geo.value.icon && 'rect' in c.it.place" class="cb-resize" title="Drag to make it bigger or smaller"
                      @pointerdown.stop="resizeDown($event, c.it)"></span>
            </template>
            <template v-else-if="c.it.kind === 'photo'">
                <div class="cb-print" :style="printStyle(c, c.it)">
                    <div class="cb-pimg"><img :src="c.it.url" alt="" draggable="false" /><svg v-ink="c.it.ink" :viewBox="`0 0 1000 ${Math.round(1000 * c.it.h / Math.max(1, c.it.w))}`" preserveAspectRatio="none" aria-hidden="true"></svg></div>
                    <div v-if="!desk.geo.value.icon && c.it.caption" class="cb-pcap">{{ c.it.caption }}</div>
                    <span class="cb-head cb-ppin p-red"></span>
                </div>
                <span v-if="!desk.geo.value.icon && 'rect' in c.it.place" class="cb-resize" title="Drag to make it bigger or smaller"
                      @pointerdown.stop="resizeDown($event, c.it)"></span>
            </template>
            <template v-else>
                <div class="cb-gpapers">
                    <span v-for="(col, i) in groupColors(c.it)" :key="i" class="cb-gp" :class="'c-' + col" :style="{ '--r': [-7, 6, -2][i] + 'deg', '--dx': [-8, 8, 0][i] + 'px', '--dy': [5, 2, -2][i] + 'px' }"></span>
                </div>
                <div v-if="!desk.geo.value.icon" class="cb-gcard"><div class="cb-gname">{{ c.it.name }}</div><div class="cb-gmeta">{{ members(c.it) }} stack{{ members(c.it) === 1 ? '' : 's' }}</div></div>
                <span class="cb-gpin" :class="'p-' + c.it.pin"><span class="cb-head"></span><span v-if="dueOf(c.it) && !desk.geo.value.icon" class="cb-due" :class="'s-' + dueOf(c.it)!.state">{{ dueOf(c.it)!.short }}</span></span>
                <span v-if="desk.geo.value.icon" class="cb-badge">{{ members(c.it) }}</span>
            </template>
        </div>

        <div v-if="!items.length" class="cb-empty">{{ group ? 'Drop stacks on the pin, or double-click to add one here' : 'Double-click anywhere to start a note' }}</div>

        <div v-if="pageCount > 1 || drag" class="cb-pager" role="group" aria-label="Pages">
            <button class="cb-parr" type="button" aria-label="Previous page" :disabled="page <= 0" @click="flip(-1)">‹</button>
            <template v-if="dots <= 8">
                <button v-for="i in dots" :key="i" class="cb-pdot" type="button" :data-page="i - 1"
                        :class="{ on: i - 1 === page, new: i - 1 === pageCount, 'drop-target': drag?.mode === 'dot' && drag.dot === i - 1 }"
                        :aria-label="i - 1 === pageCount ? 'A new page' : `Page ${i}`" @click="goPage(i - 1)"></button>
            </template>
            <span v-else class="cb-pnum-txt">{{ page + 1 }} / {{ pageCount }}</span>
            <button class="cb-parr" type="button" aria-label="Next page" :disabled="page >= pageCount - 1" @click="flip(1)">›</button>
        </div>
        <div class="cb-edge l" :class="{ on: edge < 0 }" :style="{ '--edge-ms': EDGE_MS + 'ms' }"></div>
        <div class="cb-edge r" :class="{ on: edge > 0 }" :style="{ '--edge-ms': EDGE_MS + 'ms' }"></div>
        <div v-if="hint" class="cb-deskhint" :class="{ drag: !!drag }" v-html="hint"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, inject, watch, onMounted, onBeforeUnmount } from 'vue'
import type { GridRect } from 'gexplorer/widgets'
import { SHARED } from './shared'
import { measure, dragPreview, resizePreview, placeNew, cellAt } from './layout'
import { FLAG_NAMES, dueInfo, initials, noteLabel, progress, isText, textOf, rndTilt, clamp, type Item, type Stack, type Group, type Note, type Photo } from './model'
import { drawStrokes } from './ink'
import type { Directive } from 'vue'

/** The ink drawn on a pinned picture (its print shows it). */
const vInk: Directive<SVGSVGElement, Photo['ink']> = { mounted: (el, b) => drawStrokes(el, b.value), updated: (el, b) => drawStrokes(el, b.value) }

const sh = inject(SHARED)!
const desk = sh.desk
const boardEl = ref<HTMLElement | null>(null)

const group = computed(() => desk.openGroupObj.value)
const groupDue = computed(() => dueInfo(group.value?.due))
const boardTitle = computed(() => desk.board.value?.title || 'Untitled board')

// ── Layout ──────────────────────────────────────────────────────────────────
const geoKey = ref(0)
const L = computed(() => { void desk.tick.value; void geoKey.value; return desk.layoutNow() })
const preview = shallowRef<Map<string, GridRect> | null>(null)
const items = computed(() => { void desk.tick.value; return desk.viewItems() })
const pageCount = computed(() => L.value.pages)
const page = computed(() => { void desk.tick.value; return clamp(desk.page(), 0, pageCount.value - 1 + (drag.value ? 1 : 0)) })
const dots = computed(() => pageCount.value + (drag.value ? 1 : 0))

type Card = { it: Item; x: number; y: number; w: number; h: number; span: number }
const cards = computed<Card[]>(() => {
    void desk.tick.value
    const g = desk.geo.value, rects = preview.value ?? L.value.rects, pad = g.cell * 0.1, p = page.value
    const out: Card[] = []
    for (const it of items.value) {
        let x: number, y: number, w = g.cell, h = g.cell, span = 1
        const r = rects.get(it.id)
        if (r && !(drag.value?.id === it.id && drag.value.mode === 'free')) {
            if (Math.floor(r.row / g.rows) !== p && drag.value?.id !== it.id) continue
            x = g.ox + r.col * g.cell; y = g.oy + (r.row - p * g.rows) * g.cell; w = r.colSpan * g.cell; h = r.rowSpan * g.cell; span = r.colSpan * r.rowSpan
        } else {
            const f = L.value.free.get(it.id)
            if (!f && drag.value?.id !== it.id) continue
            if (f && f.page !== p && drag.value?.id !== it.id) continue
            x = g.ox + (f?.x ?? 0) * g.cell; y = g.oy + (f?.y ?? 0) * g.cell
        }
        if (drag.value?.id === it.id && drag.value.moved) out.push({ it, x: drag.value.x, y: drag.value.y, w: drag.value.w, h: drag.value.h, span })
        else out.push({ it, x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad, span })
    }
    return out
})

function cardClass(c: Card) {
    const s = c.it.kind === 'stack' ? c.it as Stack : null
    return {
        stack: !!s, grp: c.it.kind === 'group', photo: c.it.kind === 'photo', ['c-' + (s?.color ?? 'chalk')]: !!s,
        many: !!s && s.notes.length > 1, lots: !!s && s.notes.length > 2, icon: desk.geo.value.icon,
        dragging: drag.value?.id === c.it.id && drag.value.moved,
        'drop-target': drag.value?.target === c.it.id && drag.value.mode === 'pile',
        'swap-target': drag.value?.target === c.it.id && drag.value.mode === 'swap',
        freeing: drag.value?.id === c.it.id && drag.value.mode === 'free',
        sized: c.span > 1,
    }
}
function cardStyle(c: Card) {
    const fs = clamp(Math.min(c.w, c.h) * 0.078, 10, 13.5)
    return { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', '--tilt': c.it.tilt + 'deg', zIndex: drag.value?.id === c.it.id ? 9999 : c.it.z, fontSize: fs.toFixed(1) + 'px' }
}

// ── What a card shows ───────────────────────────────────────────────────────
/** A print: the picture's own shape, as large as the cell(s) allow, a white border, room for the caption. */
function printStyle(c: Card, p: Photo) {
    const icon = desk.geo.value.icon, b = icon ? 3 : clamp(Math.min(c.w, c.h) * 0.05, 4, 10)
    const capH = !icon && p.caption ? clamp(c.h * 0.14, 16, 30) : 0
    const k = Math.min((c.w - 2 * b) / Math.max(1, p.w), (c.h - 2 * b - capH) / Math.max(1, p.h))
    const w = p.w * k + 2 * b, h = p.h * k + 2 * b + capH
    return { width: w + 'px', height: h + 'px', left: (c.w - w) / 2 + 'px', top: (c.h - h) / 2 + 'px', padding: `${b}px ${b}px ${b + capH}px`, '--capH': capH + 'px' }
}
const top = (s: Stack): Note => desk.activeNote(s)
const prog = (s: Stack) => { const p = progress(top(s)); return p ? `${p.done}/${p.all} ✓` : '' }
const dueOf = (x: Stack | Group) => dueInfo(x.due)
const members = (g: Group) => desk.d.value.stacks.filter(s => s.group === g.id).length
const groupColors = (g: Group) => { const c = desk.d.value.stacks.filter(s => s.group === g.id).slice(0, 3).map(s => s.color); return c.length ? c : ['chalk'] }
function previewLines(s: Stack, span: number) {
    const n = top(s), out: { text: string; done: boolean }[] = []
    let skipped = !!n.title?.trim()   // with its own title, the first line is content
    const max = span >= 4 ? 14 : span >= 2 ? 9 : 5
    for (const b of n.blocks) {
        if (b.t === 'table') {
            for (const r of b.rows.slice(0, 3)) { const t = r.map(h => textOf(h).trim()).filter(Boolean).join(' · '); if (t) out.push({ text: '▦ ' + t, done: false }) }
            if (out.length >= max) break
            continue
        }
        if (!isText(b)) { out.push({ text: b.t === 'img' ? '▣ Picture' : '✎ Sketch', done: false }); continue }
        const t = textOf(b.html).trim(); if (!t) continue
        if (!skipped) { skipped = true; continue }
        const ind = ' '.repeat(Math.min(b.lvl || 0, 3))
        const mk = b.t === 'c' ? (b.checked ? '☑ ' : '☐ ') : b.t === 'b' ? '• ' : b.t === 'n' ? '– ' : ''
        out.push({ text: ind + mk + t, done: !!b.checked })
        if (out.length >= max) break
    }
    return out
}
function ariaOf(it: Item) {
    if (it.kind === 'photo') return `Picture${it.caption ? ': ' + it.caption : ''}. Open it to see it large and draw on it`
    if (it.kind === 'group') { const d = dueOf(it); return `Group ${it.name}, ${members(it)} stacks${d ? ', due ' + d.long : ''}` }
    const d = dueOf(it)
    return `${it.name}, ${it.notes.length} note${it.notes.length === 1 ? '' : 's'}${it.flags.length ? ', ' + it.flags.map(f => FLAG_NAMES[f]).join(', ') : ''}${d ? ', due ' + d.long : ''}`
}

// ── Pages ───────────────────────────────────────────────────────────────────
function goPage(p: number) { desk.setPage(clamp(p, 0, pageCount.value - 1)) }
function flip(dir: number) { const p = clamp(page.value + dir, 0, pageCount.value - 1); if (p !== page.value) desk.setPage(p) }
let wheelT = 0
function onWheel(e: WheelEvent) {
    if (pageCount.value < 2 || drag.value) return
    const now = Date.now(); if (now - wheelT < 450 || Math.abs(e.deltaY) < 20) return
    wheelT = now; flip(e.deltaY > 0 ? 1 : -1)
}
function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.target !== boardEl.value) return
    if (e.key === 'Escape' && group.value) { e.preventDefault(); desk.leaveGroup() }
}

// ── Opening, double-click, right-click ──────────────────────────────────────
function openItem(it: Item) { if (it.kind === 'group') desk.openGroup(it.id); else if (it.kind === 'photo') desk.openPhoto(it.id); else desk.openStack(it.id) }
function local(e: { clientX: number; clientY: number }) {
    const r = boardEl.value!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDbl(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.cb-item, .cb-crumbs, .cb-pager')) return
    const g = desk.geo.value, p = local(e)
    desk.used('new-here')
    const free = desk.d.value.snap === e.altKey
    const s = free
        ? desk.addStack(null, { place: { free: { page: page.value, x: clamp((p.x - g.ox) / g.cell - 0.5, 0, g.cols - 1), y: clamp((p.y - g.oy) / g.cell - 0.5, 0, g.rows - 1) } } })
        : desk.addStack(null, {}, cellAt(g, page.value, p.x, p.y))
    desk.openStack(s.id)
}
function onCtx(e: MouseEvent) {
    e.preventDefault()
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cb-item')
    desk.used('menu')
    if (el) {
        const it = desk.itemById(el.dataset.id!)
        if (it?.kind === 'group') sh.menus.openGroup(e, it); else if (it?.kind === 'photo') sh.menus.openPhoto(e, it); else if (it) sh.menus.openStack(e, it)
        return
    }
    if ((e.target as HTMLElement).closest('.cb-crumbs') && group.value) { sh.menus.openGroup(e, group.value); return }
    const p = local(e)
    sh.menus.openBoard(e, cellAt(desk.geo.value, page.value, p.x, p.y))
}

// ── Dragging a stack or a group ─────────────────────────────────────────────
type Drag = {
    id: string; moved: boolean; x: number; y: number; w: number; h: number
    mode: 'push' | 'pile' | 'swap' | 'free' | 'crumb' | 'dot' | null; target: string | null; dot: number | null
}
const drag = ref<Drag | null>(null)
const edge = ref(0)
/** How long a stack is held against an edge before the page turns (the edge's bar fills meanwhile). */
const EDGE_MS = 1100

function down(e: PointerEvent, it: Item) {
    if (e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    const r0 = el.getBoundingClientRect(), b0 = boardEl.value!.getBoundingClientRect()
    const grabX = e.clientX - r0.left, grabY = e.clientY - r0.top, sx = e.clientX, sy = e.clientY
    const base = new Map(L.value.rects)
    const g = desk.geo.value
    let edgeT: ReturnType<typeof setTimeout> | null = null, dotT: ReturnType<typeof setTimeout> | null = null, lastDot: number | null = null
    const st: Drag = { id: it.id, moved: false, x: r0.left - b0.left, y: r0.top - b0.top, w: r0.width, h: r0.height, mode: null, target: null, dot: null }
    const mySpan = base.get(it.id) ?? { col: 0, row: 0, colSpan: 1, rowSpan: 1 }

    /** The last pointer move: the page turned under a still pointer, the drop goes on the new page. */
    let lastMove: PointerEvent | null = null
    const mv = (ev: PointerEvent) => {
        lastMove = ev
        if (!st.moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
        if (!st.moved) { st.moved = true; drag.value = { ...st } }
        const b = boardEl.value!.getBoundingClientRect()
        st.x = ev.clientX - b.left - grabX; st.y = ev.clientY - b.top - grabY
        // what is under the pointer
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => !el.contains(n) && n.closest?.('.cb-board') === boardEl.value)
        const other = under?.closest<HTMLElement>('.cb-item')
        const crumb = under?.closest<HTMLElement>('.cb-crumb[data-drop]')
        const dotEl = under?.closest<HTMLElement>('.cb-pdot')
        st.target = null; st.dot = null
        const free = desk.d.value.snap === ev.altKey
        if (crumb && it.kind !== 'group') { st.mode = 'crumb'; preview.value = null }
        else if (dotEl) {
            st.mode = 'dot'; st.dot = Number(dotEl.dataset.page); preview.value = null
            if (st.dot !== lastDot) { if (dotT) clearTimeout(dotT); lastDot = st.dot; const to = st.dot; if (to !== page.value) dotT = setTimeout(() => desk.setPage(to), 380) }
        } else if (other) {
            const ob = other.getBoundingClientRect()
            const fx = (ev.clientX - ob.left) / ob.width, fy = (ev.clientY - ob.top) / ob.height
            const middle = fx > 0.25 && fx < 0.75 && fy > 0.25 && fy < 0.75
            const tKind = other.dataset.kind
            if (ev.shiftKey) { st.mode = 'swap'; st.target = other.dataset.id!; preview.value = null }
            else if (middle && it.kind === 'stack' && tKind !== 'photo') { st.mode = 'pile'; st.target = other.dataset.id!; preview.value = null }
            else if (middle && it.kind === 'photo' && tKind === 'group') { st.mode = 'pile'; st.target = other.dataset.id!; preview.value = null }
            else if (middle && tKind === 'group' && it.kind === 'group') { st.mode = 'swap'; st.target = other.dataset.id!; preview.value = null }
            else if (free) { st.mode = 'free'; preview.value = null }
            else pushAt(ev)
        } else if (free) { st.mode = 'free'; preview.value = null }
        else pushAt(ev)
        if (!dotEl) { lastDot = null; if (dotT) { clearTimeout(dotT); dotT = null } }
        // the edges: push the stack well past one and hold it there to change page (0.2.4: harder, Guillaume: a
        // third of the card past the edge, or the pointer at the very edge, for EDGE_MS)
        const overL = -st.x, overR = st.x + st.w - b.width, far = st.w * 0.33
        const side = overL > far || ev.clientX < b.left + 10 ? -1 : overR > far || ev.clientX > b.right - 10 ? 1 : 0
        const was = edge.value
        edge.value = side < 0 && page.value > 0 ? -1 : side > 0 ? 1 : 0
        if (edge.value !== was && edgeT) { clearTimeout(edgeT); edgeT = null }
        if (edge.value && !edgeT) edgeT = setTimeout(() => { edgeT = null; const np = clamp(page.value + edge.value, 0, pageCount.value); if (np !== page.value) desk.setPage(np); edge.value = 0; if (lastMove) mv(lastMove) }, EDGE_MS)
        drag.value = { ...st }
    }
    const pushAt = (ev: PointerEvent) => {
        st.mode = 'push'
        const b = boardEl.value!.getBoundingClientRect()
        const cell = cellAt(desk.geo.value, page.value, ev.clientX - b.left - grabX + desk.geo.value.cell / 2, ev.clientY - b.top - grabY + desk.geo.value.cell / 2)
        const rects = new Map(base)
        if (!rects.has(it.id)) rects.set(it.id, { col: cell.col, row: cell.row, colSpan: 1, rowSpan: 1 })
        preview.value = dragPreview(rects, g.cols, g.rows, it.id, cell)
    }
    const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel)
        if (edgeT) clearTimeout(edgeT); if (dotT) clearTimeout(dotT)
        edge.value = 0
        const done = { ...st }
        const pv = preview.value
        drag.value = null; preview.value = null
        if (!done.moved) { openItem(it); return }
        const target = done.target ? desk.itemById(done.target) : null
        if (done.mode === 'pile' && target && it.kind !== 'group') {
            if (target.kind === 'stack' && it.kind === 'stack') desk.mergeInto(it, target)
            else if (target.kind === 'group') desk.joinGroup(it, target)
            desk.used('pile'); return
        }
        if (done.mode === 'swap' && target) { desk.swapPlaces(it, target, L.value.rects); desk.used('swap'); finish(it); return }
        if (done.mode === 'crumb' && it.kind !== 'group') { desk.leaveGroupWith(it); return }
        if (done.mode === 'dot' && done.dot != null) {
            const rest = new Map(base); rest.delete(it.id)
            it.place = { rect: placeNew(rest, g.cols, g.rows, done.dot) }
            desk.commitView(new Map([...rest, [it.id, (it.place as any).rect]]), g.cols)
            desk.setPage(done.dot); finish(it); return
        }
        if (done.mode === 'free') {
            const gg = desk.geo.value
            it.place = { free: { page: page.value, x: clamp((done.x - gg.ox) / gg.cell, 0, gg.cols - 1), y: clamp((done.y - gg.oy) / gg.cell, 0, gg.rows - 1) } }
            desk.used('place-free')
            const rest = new Map(base); rest.delete(it.id)
            desk.commitView(rest, gg.cols); finish(it); return
        }
        if (done.mode === 'push' && pv) {
            const r = pv.get(it.id)
            if (r) it.place = { rect: { ...r } }
            desk.commitView(pv, g.cols); finish(it); return
        }
    }
    const cancel = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel)
        if (edgeT) clearTimeout(edgeT); if (dotT) clearTimeout(dotT)
        edge.value = 0; drag.value = null; preview.value = null
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel)
}
function finish(it: Item) { it.z = ++desk.d.value.z; it.tilt = rndTilt(); desk.save() }

// ── Resizing a stack (its corner) ───────────────────────────────────────────
function resizeDown(e: PointerEvent, it: Item) {
    if (e.button !== 0) return
    e.preventDefault()
    const g = desk.geo.value, base = new Map(L.value.rects), sx = e.clientX, sy = e.clientY
    let last: Map<string, GridRect> | null = null
    const mv = (ev: PointerEvent) => {
        const dc = Math.round((ev.clientX - sx) / g.cell), dr = Math.round((ev.clientY - sy) / g.cell)
        last = dc || dr ? resizePreview(base, g.cols, g.rows, it.id, dc, dr) : null
        preview.value = last
    }
    const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
        preview.value = null
        if (last) { const r = last.get(it.id); if (r) it.place = { rect: { ...r } }; desk.commitView(last, g.cols); desk.used('resize') }
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
}

// ── A picture dropped on the board: pinned where it falls (0.2.0) ───────────
function onDragOver(e: DragEvent) { if ([...(e.dataTransfer?.items ?? [])].some(i => i.kind === 'file')) e.preventDefault() }
function onDrop(e: DragEvent) {
    const f = [...(e.dataTransfer?.files ?? [])].find(x => x.type.startsWith('image/'))
    if (!f) return
    e.preventDefault()
    const p = local(e)
    void desk.addPhoto(f, cellAt(desk.geo.value, page.value, p.x, p.y))
}

// ── Hints (fade once learned; the drag's always shows while dragging) ───────
const hint = computed(() => {
    void desk.tick.value
    if (!desk.d.value.hints) return ''
    if (drag.value?.moved) {
        const photo = drag.value && desk.itemById(drag.value.id)?.kind === 'photo'
        const parts = ['<kbd>Alt</kbd> ' + (desk.d.value.snap ? 'places freely' : 'snaps'), '<kbd>Shift</kbd> swaps', ...(photo ? [] : ['the middle of a stack piles'])]
        if (!group.value && desk.viewGroups().length) parts.push('a pin groups')
        if (group.value) parts.push('‹ takes it out')
        return parts.join(' · ')
    }
    const list: string[] = []
    if (!desk.learned('new-here')) list.push('<kbd>Double-click</kbd> adds a note')
    if (!desk.learned('menu')) list.push('<kbd>Right-click</kbd> for options')
    else if (!desk.learned('pin-picture')) list.push('<kbd>Paste</kbd> or drop a picture to pin it')
    return list.join('<span class="cb-sp"></span>')
})

// ── Size ────────────────────────────────────────────────────────────────────
let ro: ResizeObserver | null = null
function remeasure() {
    const el = boardEl.value; if (!el) return
    desk.geo.value = measure(el.clientWidth, el.clientHeight, group.value ? 42 : 0, 30)
    geoKey.value++
}
onMounted(() => {
    remeasure()
    ro = new ResizeObserver(() => { if (!drag.value) remeasure() })
    if (boardEl.value) ro.observe(boardEl.value)
})
onBeforeUnmount(() => ro?.disconnect())
watch(() => group.value?.id, () => remeasure())

defineExpose({ flip, pages: () => pageCount.value })
</script>
