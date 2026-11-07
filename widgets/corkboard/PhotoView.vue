<!-- widgets/corkboard/PhotoView.vue -->
<!--
    NEW (0.2.0): A PICTURE PINNED ON THE BOARD, OPENED LARGE (Guillaume: "opens it large to view and draw"), over
    the board. Drawn on in the same 1000-unit space as on its print, so the marks show on the board too.
      - Left-drag draws with the pen chosen at the bottom; right-drag erases; a pen draws, its end erases.
      - Wheel zooms around the pointer; − / Fit / + too, and the keys - 0 +. Double-click: fit ↔ actual size.
      - Middle-drag, Space + drag, or the hand (✋) moves the picture when it's larger than the view; touch moves it.
      - The caption is written under it, as on the print. Esc or ✕: back to the board.
-->
<template>
    <section ref="rootEl" class="cb-photo" tabindex="-1" aria-label="Picture" @keydown="onKey" @keyup="onKeyUp">
        <header class="cb-ph-head">
            <input ref="capEl" class="cb-ph-cap" type="text" :value="photo.caption" placeholder="Write a caption" aria-label="Caption"
                   :maxlength="PHOTO_CAPTION_MAX" spellcheck="true" @input="onCaption" @keydown.escape.stop.prevent="capEl?.blur()" @keydown.enter.prevent="capEl?.blur()" />
            <span class="cb-sp"></span>
            <div class="cb-zoom" role="group" aria-label="Zoom">
                <button class="cb-ib" type="button" title="Zoom out (-)" aria-label="Zoom out" @click="zoomBy(1 / 1.25)">−</button>
                <button class="cb-zl" type="button" :title="fitted ? 'Actual size' : 'Fit to the view (0)'" @click="toggleFit">{{ fitted ? 'Fit' : Math.round(scale * 100) + '%' }}</button>
                <button class="cb-ib" type="button" title="Zoom in (+)" aria-label="Zoom in" @click="zoomBy(1.25)">＋</button>
            </div>
            <button ref="moreEl" class="cb-ib" type="button" title="Picture options" aria-label="Picture options" @click="more">⋯</button>
            <button class="cb-ib" type="button" title="Back to the board (Esc)" aria-label="Back to the board" @click="desk.closePhoto()">✕</button>
        </header>
        <div ref="stageEl" class="cb-ph-stage" :class="{ panning: panMode || spaceDown, moving: !!pan }"
             @wheel="onWheel" @pointerdown="onDown" @dblclick="onDbl" @contextmenu="onCtx">
            <div class="cb-ph-canvas" :style="{ width: cw + 'px', height: ch + 'px' }">
                <div class="cb-ph-print" :style="{ left: pad + 'px', top: pad + 'px', width: iw + 'px', height: ih + 'px' }">
                    <img :src="photo.url" :alt="photo.caption || 'Pinned picture'" draggable="false" />
                    <svg ref="svgEl" :viewBox="`0 0 1000 ${vh}`" preserveAspectRatio="none"></svg>
                </div>
            </div>
        </div>
        <footer class="cb-ph-foot">
            <button v-if="hints.length" class="cb-hint" type="button" title="Every key and gesture: Keyboard shortcuts" @click="openKeys">
                <span v-for="h in hints" :key="h.id"><kbd>{{ h.key }}</kbd> {{ h.text }}</span>
            </button>
            <span class="cb-sp"></span>
            <div class="cb-tools" role="group" aria-label="Ink">
                <button class="cb-tool" type="button" title="Move the picture (or hold Space)" aria-label="Move" :aria-pressed="panMode" @click="panMode = !panMode">✋</button>
                <button v-for="t in TOOLS" :key="t.id" class="cb-tool" type="button" :title="t.label" :aria-label="t.label" :aria-pressed="!panMode && sh.tool.value === t.id" @click="pick(t.id)">
                    <span v-if="t.id === 'hl'" class="cb-hlbar"></span><span v-else-if="t.id === 'erase'">⌫</span><span v-else class="cb-dot" :style="{ '--c': `var(--cb-ink-${t.id})` }"></span>
                </button>
                <button class="cb-tool" type="button" v-gex-command="'ink-undo'" aria-label="Undo ink">↶</button>
            </div>
        </footer>
    </section>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { SHARED } from './shared'
import { PHOTO_CAPTION_MAX, clamp, CB_LOOK, type Photo, type InkTool } from './model'
import { beginInk, drawInk, type InkGesture } from 'gexplorer/widgets'

const sh = inject(SHARED)!
const desk = sh.desk
const photo = computed<Photo>(() => { void desk.tick.value; return desk.openPhotoObj.value! })

const rootEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const capEl = ref<HTMLInputElement | null>(null)
const moreEl = ref<HTMLElement | null>(null)

const TOOLS: { id: InkTool; label: string }[] = [
    { id: 'k', label: 'Ink' }, { id: 'b', label: 'Blue' }, { id: 'r', label: 'Red' }, { id: 'hl', label: 'Highlighter' }, { id: 'erase', label: 'Eraser' },
]

// ── Zoom ────────────────────────────────────────────────────────────────────
const pad = 24
const view = ref({ w: 600, h: 400 })
const scale = ref(1)
const fitted = ref(true)
const vh = computed(() => Math.round(1000 * photo.value.h / Math.max(1, photo.value.w)))
const iw = computed(() => photo.value.w * scale.value)
const ih = computed(() => photo.value.h * scale.value)
const cw = computed(() => Math.max(view.value.w, iw.value + 2 * pad))
const ch = computed(() => Math.max(view.value.h, ih.value + 2 * pad))
const fitScale = () => Math.min(4, (view.value.w - 2 * pad) / Math.max(1, photo.value.w), (view.value.h - 2 * pad) / Math.max(1, photo.value.h))

/** To scale s, keeping the picture's point under (cx, cy) of the stage where it is (default: the middle). */
function zoomTo(s: number, cx = view.value.w / 2, cy = view.value.h / 2) {
    const st = stageEl.value; if (!st) return
    s = clamp(s, Math.min(0.05, fitScale()), 8)
    const fx = (st.scrollLeft + cx - pad) / Math.max(1, iw.value), fy = (st.scrollTop + cy - pad) / Math.max(1, ih.value)
    scale.value = s; fitted.value = false
    void nextTick(() => { st.scrollLeft = pad + fx * iw.value - cx; st.scrollTop = pad + fy * ih.value - cy })
}
function zoomBy(k: number) { desk.used('photo-zoom'); zoomTo(scale.value * k) }
function fit() { scale.value = fitScale(); fitted.value = true }
function toggleFit() { if (fitted.value) zoomTo(1); else fit() }
function onWheel(e: WheelEvent) {
    e.preventDefault()
    const r = stageEl.value!.getBoundingClientRect()
    desk.used('photo-zoom')
    zoomTo(scale.value * Math.exp(-clamp(e.deltaY, -120, 120) / 400), e.clientX - r.left, e.clientY - r.top)
}
function onDbl(e: MouseEvent) {
    if (fitted.value) { const r = stageEl.value!.getBoundingClientRect(); zoomTo(1, e.clientX - r.left, e.clientY - r.top) } else fit()
}

// ── Drawing, erasing, moving ────────────────────────────────────────────────
const panMode = ref(false)
const spaceDown = ref(false)
const pan = ref<{ x: number; y: number; sl: number; st: number } | null>(null)
let gesture: InkGesture | null = null
/** A stroke under way: the desk saved meanwhile must not draw the ink again (the live stroke would go). */
let drawing = false
function pick(t: InkTool) { sh.tool.value = t; panMode.value = false }

function onDown(e: PointerEvent) {
    const st = stageEl.value!, onPic = !!(e.target as HTMLElement).closest?.('.cb-ph-print')
    const wantsPan = e.button === 1 || (e.button === 0 && (panMode.value || spaceDown.value)) || (e.pointerType === 'touch' && desk.d.value.penMode) || (e.button === 0 && !onPic)
    if (wantsPan) {
        e.preventDefault()
        pan.value = { x: e.clientX, y: e.clientY, sl: st.scrollLeft, st: st.scrollTop }
        const mv = (ev: PointerEvent) => { if (!pan.value) return; st.scrollLeft = pan.value.sl - (ev.clientX - pan.value.x); st.scrollTop = pan.value.st - (ev.clientY - pan.value.y) }
        const up = () => { pan.value = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); desk.used('photo-move') }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
        return
    }
    if (!onPic || ![0, 2, 5].includes(e.button) || !svgEl.value) return
    const p = photo.value
    drawing = true
    window.addEventListener('pointerup', () => { drawing = false }, { once: true })
    const tool = sh.tool.value
    beginInk(e, svgEl.value, p.ink, {
        mode: tool === 'erase' ? 'erase' : 'draw', color: tool, look: CB_LOOK,
        gesture: g => { gesture = g },
        done: u => { desk.used(u.removed ? 'erase' : 'photo-draw'); sh.inkDone(u) },
    })
}
function onCtx(e: MouseEvent) {
    e.preventDefault()
    const g = gesture
    if (g && g.right && (g.moved || g.removed)) return   // that right-press was an erase
    desk.used('menu')
    sh.menus.openPhoto(e, photo.value)
}
function redraw() { if (!drawing && photo.value) drawInk(svgEl.value, photo.value.ink, CB_LOOK) }

// ── Caption, keys, menu ─────────────────────────────────────────────────────
function onCaption(e: Event) { desk.setCaption(photo.value, (e.target as HTMLInputElement).value) }
function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement).closest?.('input')) return
    if (e.key === 'Escape') { e.preventDefault(); desk.closePhoto() }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.25) }
    else if (e.key === '-') { e.preventDefault(); zoomBy(1 / 1.25) }
    else if (e.key === '0') { e.preventDefault(); fit() }
    else if (e.key === ' ') { e.preventDefault(); spaceDown.value = true }
}
function onKeyUp(e: KeyboardEvent) { if (e.key === ' ') spaceDown.value = false }
function more() { const el = moreEl.value; if (el) { const r = el.getBoundingClientRect(); sh.menus.openPhoto(new MouseEvent('contextmenu', { clientX: r.left, clientY: r.bottom }), photo.value) } }
function openKeys() { void sh.sdk.navigate?.('sys:keyboard', { newTab: true }) }

type Hint = { id: string; key: string; text: string }
const hints = computed<Hint[]>(() => {
    void desk.tick.value
    if (!desk.d.value.hints) return []
    const list: Hint[] = [
        { id: 'photo-draw', key: 'Drag', text: 'draws' }, { id: 'erase', key: 'Right-drag', text: 'erases' },
        { id: 'photo-zoom', key: 'Wheel', text: 'zooms' }, { id: 'photo-move', key: 'Space + drag', text: 'moves' },
    ]
    return list.filter(h => !desk.learned(h.id)).slice(0, 2)
})

// ── Size ────────────────────────────────────────────────────────────────────
let ro: ResizeObserver | null = null
function measure() {
    const st = stageEl.value; if (!st) return
    view.value = { w: st.clientWidth, h: st.clientHeight }
    if (fitted.value) fit()
}
onMounted(() => {
    measure(); redraw()
    ro = new ResizeObserver(measure)
    if (stageEl.value) ro.observe(stageEl.value)
    rootEl.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => ro?.disconnect())
// Undo (Widget.vue) and the desk put back: the ink again
watch(() => desk.tick.value, () => nextTick(redraw))

defineExpose({ redraw })
</script>
