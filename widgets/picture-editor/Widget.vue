<!-- widgets/picture-editor/Widget.vue -->
<!--
    GEM PICTURE EDITOR 0.1.0 (2026-11-05): one picture, handed by GEM Shell ("Edit picture"), in a window of its own
    (sdk.window(): the window context). The picture's own pixels are the ink's units (an <svg viewBox="0 0 W H"> over
    the <img>), so a stroke's width is in pixels of the picture, whatever the zoom.
      - Tools: pen, highlighter, arrow, rectangle, ellipse, text, eraser (whole strokes), crop (a frame; nothing is cut
        until Save or Copy), hand. A right-drag erases with any tool.
      - Wheel: zoom around the pointer; − / Fit / + and the key 0. Middle-drag, Space + drag, the hand: move.
      - Copy (Ctrl+C): the result on the clipboard. Save: asks every time, over the original (in its own format:
        PNG, JPEG 92 %, WebP 92 %, BMP) or a copy (GEM Shell's save dialog, "<name> (edited).png" beside it). Discard:
        drops the changes and closes.
      - The window's draft (setDraft): closing with changes asks Save / Discard / Stay; Ctrl+S saves; GEM Shell's close
        question counts them. While changes aren't saved, the strokes and the crop are kept (keep) and come back after
        a restart ("Unsaved edit of ... — Resume").
    0.3.0 (GEM Shell P4b): TEXT IN THE PICTURE. The Read text tool (the ink kit's text zones, turned on here: GEM Shell's
    sdk.text() is the reader) opens the text panel: drag zones over text (outlines only, numbered in reading order; a
    right-press on one removes it), then Read (no zone: the whole picture, or the part the crop keeps). The text is
    editable; Copy text, Copy picture and text (one clipboard entry), Save text… (a .txt). The text and the zones are
    kept with the edit for a restart.
-->
<template>
    <section ref="rootEl" class="pe" tabindex="-1" aria-label="Picture editor" @keydown="onKey" @keyup="onKeyUp">
        <header class="pe-bar">
            <div class="pe-group" role="group" aria-label="Tools">
                <button v-for="t in TOOLS" :key="t.id" class="pe-tool" type="button"
                        v-gex-command="{ id: t.cmd, content: t.label }"
                        :aria-label="t.label" :aria-pressed="tool === t.id">{{ t.icon }}</button>
                <button class="pe-tool" type="button" v-gex-tooltip="'Move the picture (or hold Space)'" aria-label="Move"
                        :aria-pressed="tool === 'hand'" @click="tool = 'hand'">✋</button>
            </div>
            <div class="pe-group" role="group" aria-label="Colour">
                <button v-for="c in COLORS" :key="c" class="pe-swatch" type="button" :style="{ '--c': c }"
                        :aria-label="`Colour ${c}`" :aria-pressed="color === c" v-gex-tooltip="'Colour'" @click="color = c"></button>
                <label class="pe-custom" v-gex-tooltip="'Another colour'">
                    <input type="color" :value="color" aria-label="Another colour" @input="color = ($event.target as HTMLInputElement).value" />
                </label>
            </div>
            <div class="pe-group" role="group" aria-label="Size">
                <button v-for="(s, i) in SIZES" :key="s.id" class="pe-size" type="button" :aria-pressed="size === i"
                        v-gex-tooltip="s.label" :aria-label="s.label" @click="size = i">{{ s.id }}</button>
            </div>
            <div class="pe-group" role="group" aria-label="History">
                <button class="pe-tool" type="button" v-gex-command="'undo'" aria-label="Undo" :disabled="!undoStack.length">↶</button>
                <button class="pe-tool" type="button" v-gex-command="'redo'" aria-label="Redo" :disabled="!redoStack.length">↷</button>
                <button v-if="crop" class="pe-btn" type="button" v-gex-tooltip="'Keep the whole picture'" @click="clearCrop">No crop</button>
            </div>
            <span class="pe-sp"></span>
            <div class="pe-group" role="group" aria-label="Zoom">
                <button class="pe-tool" type="button" v-gex-tooltip="'Zoom out (-)'" aria-label="Zoom out" @click="zoomBy(1 / 1.25)">−</button>
                <button class="pe-zl" type="button" v-gex-tooltip="fitted ? 'Actual size' : 'Fit to the window (0)'" @click="toggleFit">{{ fitted ? 'Fit' : Math.round(scale * 100) + '%' }}</button>
                <button class="pe-tool" type="button" v-gex-tooltip="'Zoom in (+)'" aria-label="Zoom in" @click="zoomBy(1.25)">＋</button>
            </div>
            <div class="pe-group" role="group" aria-label="Picture">
                <button class="pe-btn" type="button" v-gex-command="{ id: 'copy', content: 'Copy' }" :disabled="!ready || !!busy">Copy</button>
                <button class="pe-btn pe-btn--primary" type="button"
                        v-gex-tooltip="isShot ? 'Save the screenshot as a file (Ctrl+S)' : 'Save your changes: over the original, or a copy (Ctrl+S)'"
                        :disabled="!ready || !!busy || (!dirty && !isShot)" @click="onSaveClick">{{ isShot ? 'Save as…' : 'Save' }}</button>
                <button class="pe-btn" type="button" v-gex-tooltip="'Drop the changes and close'" :disabled="!!busy" @click="onDiscardClick">Discard</button>
            </div>
        </header>

        <div class="pe-main">
        <div v-if="problem" class="pe-msg" role="alert">{{ problem }}</div>
        <div v-else ref="stageEl" class="pe-stage" :class="[`pe-tool-${tool}`, { panning: tool === 'hand' || spaceDown, moving: !!pan }]"
             @wheel="onWheel" @pointerdown="onDown" @contextmenu.prevent>
            <div class="pe-canvas" :style="{ width: cw + 'px', height: ch + 'px' }">
                <div v-if="ready" ref="picEl" class="pe-pic" :style="{ left: PAD + 'px', top: PAD + 'px', width: iw + 'px', height: ih + 'px' }">
                    <img :src="src" alt="" draggable="false" />
                    <svg ref="svgEl" class="pe-ink" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none"></svg>
                    <svg ref="zonesEl" class="pe-zones" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true"></svg>
                    <svg v-if="shownCrop" class="pe-cropview" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="dimPath" fill="rgba(0, 0, 0, .55)" fill-rule="evenodd" />
                        <rect :x="shownCrop.x" :y="shownCrop.y" :width="shownCrop.width" :height="shownCrop.height"
                              fill="none" stroke="#fff" :stroke-width="1.5 / scale" :stroke-dasharray="`${6 / scale} ${4 / scale}`" />
                    </svg>
                </div>
                <div v-else class="pe-loading">Opening the picture…</div>
            </div>
        </div>

        <aside v-if="textOpen && !problem" class="pe-text" aria-label="Text in the picture">
            <div class="pe-row">
                <strong>Text</strong>
                <span class="pe-sp"></span>
                <button class="pe-tool" type="button" v-gex-tooltip="'Close the text panel (the text stays)'" aria-label="Close the text panel" @click="closeText">✕</button>
            </div>
            <p class="pe-hint">{{ zoneCount
                ? `${zoneCount} zone${zoneCount === 1 ? '' : 's'}: read in their numbered order. Right-click a zone to remove it.`
                : 'With Read text, drag zones over the text to read parts of it, or read the whole picture.' }}</p>
            <div class="pe-row">
                <button class="pe-btn pe-btn--primary" type="button" :disabled="!ready || !!busy" @click="readText">{{ readLabel }}</button>
                <button v-if="zoneCount" class="pe-btn" type="button" :disabled="!!busy" @click="clearZones">Clear zones</button>
            </div>
            <label class="pe-lang">
                <span>Language</span>
                <select v-model="language" :disabled="!!busy" aria-label="The language of the text">
                    <option value="">{{ autoLabel }}</option>
                    <option v-for="l in languages" :key="l.tag" :value="l.tag">{{ l.name }}</option>
                </select>
            </label>
            <textarea v-model="text" class="pe-textarea" spellcheck="false" aria-label="The text read in the picture"
                      placeholder="The text read appears here. You can edit it." @input="textEdited = true"></textarea>
            <div class="pe-row pe-row--wrap">
                <button class="pe-btn" type="button" v-gex-tooltip="'Put the text on the clipboard'" :disabled="!text.trim() || !!busy" @click="copyText">Copy text</button>
                <button class="pe-btn" type="button" v-gex-tooltip="'One clipboard entry: a text editor pastes the text, a picture editor the picture'"
                        :disabled="!text.trim() || !ready || !!busy" @click="copyBoth">Copy picture and text</button>
                <button class="pe-btn" type="button" v-gex-tooltip="'Save the text as a .txt file'" :disabled="!text.trim() || !opened || !!busy" @click="saveText">Save text…</button>
            </div>
        </aside>
        </div>

        <footer class="pe-status">
            <span v-if="ready">{{ W }} × {{ H }} px</span>
            <span v-if="crop">· kept: {{ Math.round(crop.width) }} × {{ Math.round(crop.height) }} px</span>
            <span class="pe-sp"></span>
            <span v-if="busy">{{ busy }}</span>
            <span v-else-if="dirty" class="pe-dirty">Unsaved changes</span>
        </footer>
    </section>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import {
    beginInk, drawInk, undoInk, beginInkZone, drawInkZones, readInkText,
    type WidgetSdk, type InkStroke, type InkLook, type InkUndo, type InkMode, type InkZone, type TextLanguage,
} from 'gexplorer/widgets'
import { encodePicture, formatOf, type Crop } from './encode'

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const win = sdk.window?.() ?? null

// ── What GEM Shell handed us ────────────────────────────────────────────────
const opened = win?.opened ?? null
const name = opened?.name ?? ''
/**
 * 0.2.0: a screenshot (GEM Shell's private copy of what was on the clipboard): no original to save over; Save as starts
 * in the user's screenshots folder (opened.saveIn), under the screenshot's name.
 */
const isShot = opened?.kind === 'screenshot'
/** The editor can't open a side larger than this (the browser's canvas limits). */
const MAX_SIDE = 16000
/** The largest picture file it reads. */
const MAX_BYTES = 128 * 1024 * 1024

function mimeOf(n: string): string {
    const f = formatOf(n)
    return f === 'jpeg' ? 'image/jpeg' : f === 'webp' ? 'image/webp' : f === 'bmp' ? 'image/bmp' : 'image/png'
}

type Tool = 'pen' | 'hl' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser' | 'crop' | 'zones' | 'hand'
/** 0.3.0: text recognition (GEM Shell P4b and later): the Read text tool only where the shell offers it. */
const canRead = typeof sdk.text === 'function'
const ALL_TOOLS: { id: Tool; cmd: string; label: string; icon: string }[] = [
    { id: 'pen', cmd: 'tool-pen', label: 'Pen', icon: '✎' },
    { id: 'hl', cmd: 'tool-highlighter', label: 'Highlighter', icon: '▮' },
    { id: 'arrow', cmd: 'tool-arrow', label: 'Arrow', icon: '➚' },
    { id: 'rect', cmd: 'tool-rect', label: 'Rectangle', icon: '▭' },
    { id: 'ellipse', cmd: 'tool-ellipse', label: 'Ellipse', icon: '◯' },
    { id: 'text', cmd: 'tool-text', label: 'Text', icon: 'T' },
    { id: 'eraser', cmd: 'tool-eraser', label: 'Eraser', icon: '⌫' },
    { id: 'crop', cmd: 'tool-crop', label: 'Crop', icon: '⛶' },
    { id: 'zones', cmd: 'tool-zones', label: 'Read text: drag zones over the text', icon: '¶' },
]
const TOOLS = ALL_TOOLS.filter(t => t.id !== 'zones' || canRead)
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#000000', '#ffffff']
/** Widths in the picture's pixels: lines, highlighter, text. */
const SIZES = [
    { id: 'S', label: 'Thin', line: 2, hl: 14, text: 16 },
    { id: 'M', label: 'Medium', line: 4, hl: 22, text: 24 },
    { id: 'L', label: 'Thick', line: 8, hl: 34, text: 36 },
]

const tool = ref<Tool>('pen')
const color = ref(COLORS[0])
const size = ref(1)

// Colour keys: a CSS colour, or "hl:<colour>" for the highlighter (wide, see-through)
const look: InkLook = {
    color: c => c.startsWith('hl:') ? c.slice(3) : c,
    highlighter: c => c.startsWith('hl:'),
}

// ── The picture ─────────────────────────────────────────────────────────────
const rootEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const picEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const zonesEl = ref<SVGSVGElement | null>(null)
const src = ref('')
const W = ref(1)
const H = ref(1)
const ready = ref(false)
const problem = ref('')
const busy = ref('')
/** The loaded picture (CORS-clean: the loopback stream allows it), for flattening. */
let image: HTMLImageElement | null = null

/** Strokes, in the picture's pixels (the ink kit changes this array in place). */
let strokes: InkStroke[] = []
const crop = ref<Crop | null>(null)
type Step = { t: 'ink'; u: InkUndo } | { t: 'crop'; before: Crop | null; after: Crop | null }
const undoStack = ref<Step[]>([])
const redoStack = ref<Step[]>([])
const version = ref(0)
const savedVersion = ref(0)
const dirty = computed(() => version.value !== savedVersion.value)

// 0.3.0: the text panel (its functions: "Text in the picture" below)
/** Zones over the text, in the picture's pixels (the ink kit changes this array in place); not edits of the picture. */
let zones: InkZone[] = []
const zoneCount = ref(0)
const textOpen = ref(false)
const text = ref('')
/** The user typed in the panel (Read then asks before replacing it). */
const textEdited = ref(false)
/** '' = the user's choice in Settings ▸ Pictures (else their Windows languages). */
const language = ref('')
const languages = ref<TextLanguage[]>([])
let languagesAsked = false

async function load(): Promise<void> {
    if (!opened) {
        problem.value = 'Open a picture with "Edit picture" (right-click it in a folder).'
        return
    }
    try {
        // FIXED (0.1.2): the bytes, shown as a blob: URL. The page's CSP keeps images off the loopback stream
        // (mintStreamHttp); a blob: picture is same-origin, so its canvas stays readable for Copy and Save.
        const blob = await sdk.fsReadBytes!(opened.path, { maxBytes: MAX_BYTES, type: mimeOf(opened.name) })
        const url = URL.createObjectURL(blob)
        const im = new Image()
        im.decoding = 'async'
        im.src = url
        try { await im.decode() } catch (err) { URL.revokeObjectURL(url); throw err }
        if (src.value) URL.revokeObjectURL(src.value)
        if (im.naturalWidth > MAX_SIDE || im.naturalHeight > MAX_SIDE) {
            problem.value = `${name} is ${im.naturalWidth} × ${im.naturalHeight} px: the editor opens pictures up to `
                + `${MAX_SIDE} px a side.`
            URL.revokeObjectURL(url)
            return
        }
        image = im
        W.value = im.naturalWidth
        H.value = im.naturalHeight
        src.value = url
        ready.value = true
        await nextTick()
        measure()
        fit()
        redraw()
    } catch (err: any) {
        const why = err?.code === 'E_TOO_LARGE' ? `it is larger than ${MAX_BYTES / (1024 * 1024)} MB`
            : err?.code === 'E_NOT_FOUND' ? "it isn't there any more"
            : err?.message
        problem.value = `${name || 'The picture'} could not be opened${why ? `: ${why}.` : '.'}`
    }
}

/** What a restart brought back (keep): the same file's strokes and crop. */
function restore(): void {
    const r = win?.restored as { v?: number; path?: string; strokes?: InkStroke[]; crop?: Crop | null; text?: string; zones?: InkZone[] } | null
    if (!r || r.v !== 1 || !opened || r.path !== opened.path) return
    strokes = Array.isArray(r.strokes) ? r.strokes : []
    crop.value = r.crop && Number.isFinite(r.crop.width) ? r.crop : null
    // 0.3.0: the text panel's text and the zones
    if (typeof r.text === 'string' && r.text) { text.value = r.text; textEdited.value = true; openText() }
    if (Array.isArray(r.zones)) {
        zones = r.zones.filter(z => [z?.x, z?.y, z?.width, z?.height].every(n => Number.isFinite(n))).slice(0, 200)
        zoneCount.value = zones.length
    }
    version.value++
}

function redraw() { drawInk(svgEl.value, strokes, look) }

// ── Changes, undo, keep ─────────────────────────────────────────────────────
function changed(step: Step) {
    undoStack.value.push(step)
    redoStack.value = []
    version.value++
}

function undo() {
    const s = undoStack.value.pop()
    if (!s) return
    if (s.t === 'ink') { undoInk(s.u); redraw() } else crop.value = s.before
    redoStack.value.push(s)
    version.value++
}

function redo() {
    const s = redoStack.value.pop()
    if (!s) return
    if (s.t === 'ink') {
        if (s.u.add) s.u.arr.push(s.u.add)
        else for (const r of s.u.removed ?? []) { const j = s.u.arr.indexOf(r.s); if (j >= 0) s.u.arr.splice(j, 1) }
        redraw()
    } else crop.value = s.after
    undoStack.value.push(s)
    version.value++
}

function clearCrop() {
    if (!crop.value) return
    changed({ t: 'crop', before: crop.value, after: null })
    crop.value = null
}

let keepTimer: number | null = null
watch([version, savedVersion], () => { win?.setTitle(dirty.value ? `${name} •` : name) })
// 0.3.0: the panel's text and the zones are kept too (with the edit; or alone, the text being work of its own)
watch([version, savedVersion, text, zoneCount], () => {
    if (keepTimer !== null) window.clearTimeout(keepTimer)
    keepTimer = window.setTimeout(() => {
        keepTimer = null
        const hasText = !!text.value.trim()
        try {
            win?.keep((dirty.value || hasText) && opened
                ? { v: 1, path: opened.path, strokes, crop: crop.value, ...(hasText ? { text: text.value } : {}), ...(zones.length ? { zones } : {}) }
                : null)
        } catch (err) { console.warn('[picture-editor] Not kept for a restart:', err) }
    }, 500)
})

// ── Drawing, cropping, moving ───────────────────────────────────────────────
const PAD = 24
const view = ref({ w: 600, h: 400 })
const scale = ref(1)
const fitted = ref(true)
const iw = computed(() => W.value * scale.value)
const ih = computed(() => H.value * scale.value)
const cw = computed(() => Math.max(view.value.w, iw.value + 2 * PAD))
const ch = computed(() => Math.max(view.value.h, ih.value + 2 * PAD))
const spaceDown = ref(false)
const pan = ref<{ x: number; y: number; sl: number; st: number } | null>(null)
const cropDraft = ref<Crop | null>(null)
const shownCrop = computed(() => cropDraft.value ?? crop.value)
const dimPath = computed(() => {
    const c = shownCrop.value
    if (!c) return ''
    return `M0 0H${W.value}V${H.value}H0Z M${c.x} ${c.y}V${c.y + c.height}H${c.x + c.width}V${c.y}Z`
})

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const fitScale = () => Math.min(4, (view.value.w - 2 * PAD) / Math.max(1, W.value), (view.value.h - 2 * PAD) / Math.max(1, H.value))

function zoomTo(s: number, cx = view.value.w / 2, cy = view.value.h / 2) {
    const st = stageEl.value
    if (!st) return
    s = clamp(s, Math.min(0.02, fitScale()), 16)
    const fx = (st.scrollLeft + cx - PAD) / Math.max(1, iw.value), fy = (st.scrollTop + cy - PAD) / Math.max(1, ih.value)
    scale.value = s
    fitted.value = false
    void nextTick(() => { st.scrollLeft = PAD + fx * iw.value - cx; st.scrollTop = PAD + fy * ih.value - cy })
}
function zoomBy(k: number) { zoomTo(scale.value * k) }
function fit() { scale.value = Math.max(0.01, fitScale()); fitted.value = true }
function toggleFit() { if (fitted.value) zoomTo(1); else fit() }
function onWheel(e: WheelEvent) {
    if (!ready.value) return
    e.preventDefault()
    const r = stageEl.value!.getBoundingClientRect()
    zoomTo(scale.value * Math.exp(-clamp(e.deltaY, -120, 120) / 400), e.clientX - r.left, e.clientY - r.top)
}

/** A pointer's place on the picture, in its pixels (kept inside it). */
function picPoint(e: { clientX: number; clientY: number }): [number, number] {
    const r = picEl.value!.getBoundingClientRect()
    return [clamp((e.clientX - r.left) / scale.value, 0, W.value), clamp((e.clientY - r.top) / scale.value, 0, H.value)]
}

function onDown(e: PointerEvent) {
    if (!ready.value || busy.value) return
    const st = stageEl.value!
    const onPic = !!(e.target as HTMLElement).closest?.('.pe-pic')
    const wantsPan = e.button === 1 || (e.button === 0 && (tool.value === 'hand' || spaceDown.value))
        || (e.button === 0 && !onPic && tool.value !== 'crop')
    if (wantsPan) {
        e.preventDefault()
        pan.value = { x: e.clientX, y: e.clientY, sl: st.scrollLeft, st: st.scrollTop }
        const mv = (ev: PointerEvent) => { if (!pan.value) return; st.scrollLeft = pan.value.sl - (ev.clientX - pan.value.x); st.scrollTop = pan.value.st - (ev.clientY - pan.value.y) }
        const up = () => { pan.value = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
        return
    }
    if (tool.value === 'crop' && e.button === 0) { startCrop(e); return }
    if (tool.value === 'zones') {
        if (!onPic || ![0, 2].includes(e.button) || !zonesEl.value) return
        beginInkZone(e, zonesEl.value, zones, { done: () => { zoneCount.value = zones.length } })
        return
    }
    if (!onPic || ![0, 2, 5].includes(e.button) || !svgEl.value) return
    const sz = SIZES[size.value]
    const mode: InkMode = tool.value === 'pen' || tool.value === 'hl' ? 'draw'
        : tool.value === 'eraser' ? 'erase'
        : tool.value === 'text' ? 'text'
        : tool.value === 'crop' || tool.value === 'hand' ? 'draw'
        : tool.value
    // Widths are given at 1:1 in CSS px: times the zoom, they are the picture's pixels
    beginInk(e, svgEl.value, strokes, {
        mode,
        color: tool.value === 'hl' ? `hl:${color.value}` : color.value,
        look,
        width: (tool.value === 'hl' ? sz.hl : sz.line) * scale.value,
        textSize: sz.text * scale.value,
        done: u => changed({ t: 'ink', u }),
        askText: () => ui.prompt('The text to place:', { title: 'Text', okLabel: 'Place' }),
    })
}

function startCrop(e: PointerEvent) {
    e.preventDefault()
    const [x0, y0] = picPoint(e)
    cropDraft.value = { x: x0, y: y0, width: 0, height: 0 }
    const mv = (ev: PointerEvent) => {
        const [x, y] = picPoint(ev)
        cropDraft.value = { x: Math.min(x0, x), y: Math.min(y0, y), width: Math.abs(x - x0), height: Math.abs(y - y0) }
    }
    const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
        const c = cropDraft.value
        cropDraft.value = null
        if (!c || c.width < 4 || c.height < 4) return   // a click: nothing
        const next = { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) }
        changed({ t: 'crop', before: crop.value, after: next })
        crop.value = next
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
}

// ── Copy, save, discard ─────────────────────────────────────────────────────
async function render(format: 'png' | 'jpeg' | 'webp' | 'bmp'): Promise<Blob> {
    if (!image) throw new Error('The picture is not open')
    return encodePicture(image, strokes, look, crop.value, format)
}

async function copy(): Promise<void> {
    if (!ready.value || busy.value) return
    busy.value = 'Copying…'
    try {
        const png = await render('png')
        await sdk.clipboardSetImage!(png)
        void ui.snack({ text: 'Copied: paste it anywhere.', timeoutMs: 4000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Not copied', variant: 'danger' })
    } finally {
        busy.value = ''
    }
}

function folderOf(path: string): string {
    const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
    return i > 0 ? path.slice(0, i) : path
}
function stemOf(n: string): string {
    return n.replace(/\.[^.]+$/, '')
}

/**
 * Saves the changes: asks every time, over the original (its own format) or a copy (GEM Shell's save dialog). Throws
 * when nothing was saved (cancelled, failed): the window's close question then keeps it open.
 */
async function save(): Promise<void> {
    if (!dirty.value && !isShot) return
    if (!ready.value || !opened) throw new Error('The picture is not open')
    if (busy.value) throw new Error('Busy')
    if (isShot) { await saveCopy(); return }   // 0.2.0: a screenshot has no original: Save as only
    const r = await ui.messageBox({
        title: 'Save',
        message: `Save your changes to ${name}?`,
        detail: 'Over the original replaces the picture on disk. A copy leaves it as it is.',
        buttons: [
            { id: 'cancel', label: 'Cancel', cancel: true },
            { id: 'overwrite', label: 'Over the original', danger: true },
            { id: 'copy', label: 'Save a copy…', default: true },
        ],
    })
    if (r.button === 'overwrite') await saveOver()
    else if (r.button === 'copy') await saveCopy()
    else throw new Error('Cancelled')
}

async function saveOver(): Promise<void> {
    const format = formatOf(opened!.name) ?? 'png'
    busy.value = 'Saving…'
    try {
        const blob = await render(format)
        await sdk.fsWriteBytes!(opened!.path, blob, { overwrite: true })
        // The original is the result now: open it again, clean
        strokes = []
        crop.value = null
        undoStack.value = []
        redoStack.value = []
        savedVersion.value = ++version.value
        ready.value = false
        await load()
        void ui.snack({ text: `${name} saved.`, timeoutMs: 4000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Not saved', variant: 'danger' })
        throw err
    } finally {
        busy.value = ''
    }
}

async function saveCopy(): Promise<void> {
    const path = await ui.saveFile({
        title: isShot ? 'Save the screenshot' : 'Save a copy',
        startIn: isShot ? (opened!.saveIn || undefined) : folderOf(opened!.path),
        suggestedName: isShot ? opened!.name : `${stemOf(opened!.name)} (edited).png`,
        filters: [
            { label: 'PNG picture', extensions: ['png'] },
            { label: 'JPEG picture', extensions: ['jpg', 'jpeg'] },
            { label: 'WebP picture', extensions: ['webp'] },
            { label: 'BMP picture', extensions: ['bmp'] },
        ],
    })
    if (!path) throw new Error('Cancelled')
    busy.value = 'Saving…'
    try {
        const blob = await render(formatOf(path) ?? 'png')
        await sdk.fsWriteBytes!(path, blob, { overwrite: true })
        savedVersion.value = version.value
        void ui.snack({ text: `Saved as ${path.split(/[\\/]/).pop()}.`, timeoutMs: 5000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Not saved', variant: 'danger' })
        throw err
    } finally {
        busy.value = ''
    }
}

/** Back to the picture as it is on disk. */
function discardChanges(): void {
    strokes = []
    crop.value = null
    undoStack.value = []
    redoStack.value = []
    savedVersion.value = ++version.value
    redraw()
}

function onSaveClick() { void save().catch(() => { /* said, or cancelled */ }) }

async function onDiscardClick() {
    if (dirty.value && !(await ui.confirm('Drop your changes and close the picture?', { title: 'Discard', okLabel: 'Discard', danger: true }))) return
    discardChanges()
    await win?.close()
}

// ── Text in the picture (0.3.0) ─────────────────────────────────────────────

const autoLabel = computed(() => {
    const pref = canRead ? sdk.text!().preferred() : ''
    const named = pref ? languages.value.find(l => l.tag === pref)?.name ?? pref : ''
    return named ? `As in Settings (${named})` : 'Automatic (your Windows languages)'
})
const readLabel = computed(() => zoneCount.value
    ? (zoneCount.value === 1 ? 'Read the zone' : `Read the ${zoneCount.value} zones`)
    : crop.value ? 'Read the kept part' : 'Read the whole picture')

function showZones() {
    const svg = zonesEl.value
    if (!svg) return
    if (textOpen.value) drawInkZones(svg, zones)
    else svg.replaceChildren()
}

function openText() {
    if (!canRead) return
    textOpen.value = true
    if (!languagesAsked) {
        languagesAsked = true
        void sdk.text!().languages().then(l => { languages.value = l }).catch(() => { /* Automatic only */ })
    }
}

function closeText() {
    textOpen.value = false
    if (tool.value === 'zones') tool.value = 'pen'
}

function clearZones() {
    zones.splice(0)
    zoneCount.value = 0
}

watch(tool, t => { if (t === 'zones') openText() })
watch([textOpen, zoneCount, scale, ready], () => { void nextTick(showZones) })

async function readText(): Promise<void> {
    if (!image || !ready.value || busy.value || !canRead) return
    if (textEdited.value && text.value.trim()
        && !(await ui.confirm('Replace the text in the panel with the text read now?', { title: 'Read text', okLabel: 'Replace' }))) return
    busy.value = 'Reading the text…'
    try {
        const lang = language.value
        const r = await readInkText(image, strokes, look, {
            units: W.value,
            zones: zones.length ? zones : undefined,
            crop: zones.length ? undefined : crop.value ?? undefined,
            read: png => sdk.text!().recognize(png, lang ? { language: lang } : undefined),
        })
        text.value = r.text
        textEdited.value = false
        if (!r.text) void ui.snack({ text: zones.length ? 'No text found in the zones.' : 'No text found in the picture.', timeoutMs: 5000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Text not read', variant: 'danger' })
    } finally {
        busy.value = ''
    }
}

async function copyText(): Promise<void> {
    if (!text.value.trim() || busy.value) return
    try {
        await sdk.clipboardSetText!(text.value)
        void ui.snack({ text: 'Text copied.', timeoutMs: 3000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Not copied', variant: 'danger' })
    }
}

async function copyBoth(): Promise<void> {
    if (!text.value.trim() || !ready.value || busy.value) return
    busy.value = 'Copying…'
    try {
        const png = await render('png')
        await sdk.clipboardSetImage!(png, { text: text.value })
        void ui.snack({ text: 'Copied: the picture and its text.', timeoutMs: 4000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Not copied', variant: 'danger' })
    } finally {
        busy.value = ''
    }
}

async function saveText(): Promise<void> {
    if (!text.value.trim() || !opened || busy.value) return
    const path = await ui.saveFile({
        title: 'Save the text',
        startIn: isShot ? (opened.saveIn || undefined) : folderOf(opened.path),
        suggestedName: `${stemOf(opened.name)}.txt`,
        filters: [{ label: 'Text file', extensions: ['txt'] }],
    })
    if (!path) return
    busy.value = 'Saving…'
    try {
        await sdk.fsWriteText!(path, text.value.replace(/\r?\n/g, '\r\n'), { overwrite: true })
        void ui.snack({ text: `Saved as ${path.split(/[\\/]/).pop()}.`, timeoutMs: 5000 })
    } catch (err: any) {
        await ui.alert(String(err?.message ?? err), { title: 'Not saved', variant: 'danger' })
    } finally {
        busy.value = ''
    }
}

// ── Keys ────────────────────────────────────────────────────────────────────
function onCommand(id: string) {
    switch (id) {
        case 'undo': undo(); break
        case 'redo': redo(); break
        case 'copy': void copy(); break
        case 'tool-pen': tool.value = 'pen'; break
        case 'tool-highlighter': tool.value = 'hl'; break
        case 'tool-arrow': tool.value = 'arrow'; break
        case 'tool-rect': tool.value = 'rect'; break
        case 'tool-ellipse': tool.value = 'ellipse'; break
        case 'tool-text': tool.value = 'text'; break
        case 'tool-eraser': tool.value = 'eraser'; break
        case 'tool-crop': tool.value = 'crop'; break
        case 'tool-zones': if (canRead) tool.value = 'zones'; break
        case 'zoom-fit': fit(); break
    }
}

function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || (e.target as HTMLElement).closest?.('input, textarea, select')) return
    if (e.key === 'Escape' && (cropDraft.value || tool.value === 'crop' || tool.value === 'hand' || tool.value === 'zones')) {
        // Out of cropping / moving first; the next Escape closes the window (GEM Shell asks if changes aren't saved)
        e.preventDefault()
        cropDraft.value = null
        tool.value = 'pen'
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.25) }
    else if (e.key === '-') { e.preventDefault(); zoomBy(1 / 1.25) }
    else if (e.key === ' ') { e.preventDefault(); spaceDown.value = true }
}
function onKeyUp(e: KeyboardEvent) { if (e.key === ' ') spaceDown.value = false }

// ── Size ────────────────────────────────────────────────────────────────────
let ro: ResizeObserver | null = null
function measure() {
    const st = stageEl.value
    if (!st) return
    view.value = { w: st.clientWidth, h: st.clientHeight }
    if (fitted.value) fit()
}

onMounted(async () => {
    win?.setDraft({ dirty: () => dirty.value, save, discard: discardChanges })
    win?.setTitle(name)
    restore()
    await load()
    ro = new ResizeObserver(measure)
    if (stageEl.value) ro.observe(stageEl.value)
    rootEl.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
    ro?.disconnect()
    if (src.value) URL.revokeObjectURL(src.value)
    if (keepTimer !== null) window.clearTimeout(keepTimer)
    win?.setDraft(null)
})

defineExpose({ onCommand })
</script>

<style scoped>
    .pe {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        outline: none;
        color: var(--fg, #e8e8e8);
        background: var(--surface-1, #151515);
        font-size: 12px;
    }
    .pe-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 10px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--border, #333);
        background: var(--surface-2, #1d1d1d);
    }
    .pe-group { display: flex; align-items: center; gap: 2px; }
    .pe-sp { flex: 1 1 auto; }
    .pe-tool, .pe-size, .pe-zl, .pe-btn {
        min-width: 28px;
        height: 26px;
        padding: 0 6px;
        border: 1px solid transparent;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 14px;
        cursor: pointer;
    }
    .pe-size, .pe-zl, .pe-btn { font-size: 12px; }
    .pe-btn { border-color: var(--border, #444); padding: 0 10px; }
    .pe-btn--primary:not(:disabled) { border-color: var(--accent, #3b82f6); background: var(--accent, #3b82f6); color: #fff; }
    .pe-tool:hover:not(:disabled), .pe-size:hover, .pe-zl:hover, .pe-btn:hover:not(:disabled) { background: rgba(255, 255, 255, .08); }
    .pe-tool[aria-pressed="true"], .pe-size[aria-pressed="true"] { border-color: var(--accent, #3b82f6); background: rgba(59, 130, 246, .18); }
    button:disabled { opacity: .4; cursor: default; }
    .pe-swatch {
        width: 18px;
        height: 18px;
        margin: 0 1px;
        padding: 0;
        border: 2px solid rgba(255, 255, 255, .25);
        border-radius: 50%;
        background: var(--c);
        cursor: pointer;
    }
    .pe-swatch[aria-pressed="true"] { border-color: #fff; box-shadow: 0 0 0 2px var(--accent, #3b82f6); }
    .pe-custom { display: inline-flex; width: 22px; height: 22px; overflow: hidden; border-radius: 50%; cursor: pointer; }
    .pe-custom input { width: 34px; height: 34px; margin: -6px; padding: 0; border: 0; cursor: pointer; }
    .pe-main { display: flex; flex: 1 1 auto; min-height: 0; }
    .pe-stage {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        background: repeating-conic-gradient(#2a2a2a 0% 25%, #222 0% 50%) 50% / 16px 16px;
        cursor: crosshair;
        touch-action: none;
    }
    .pe-stage.pe-tool-text { cursor: text; }
    .pe-stage.pe-tool-eraser { cursor: cell; }
    .pe-stage.panning { cursor: grab; }
    .pe-stage.moving { cursor: grabbing; }
    .pe-canvas { position: relative; }
    .pe-pic { position: absolute; box-shadow: 0 4px 24px rgba(0, 0, 0, .5); }
    .pe-pic img, .pe-pic svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        user-select: none;
        -webkit-user-drag: none;
    }
    .pe-pic img { image-rendering: auto; }
    .pe-cropview, .pe-zones { pointer-events: none; }
    .pe-stage.pe-tool-zones { cursor: crosshair; }
    .pe-text {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 0 0 300px;
        min-width: 220px;
        padding: 8px 10px;
        border-left: 1px solid var(--border, #333);
        background: var(--surface-2, #1d1d1d);
        overflow: auto;
    }
    .pe-row { display: flex; align-items: center; gap: 6px; }
    .pe-row--wrap { flex-wrap: wrap; }
    .pe-hint { margin: 0; opacity: .75; line-height: 1.4; }
    .pe-lang { display: flex; align-items: center; gap: 6px; }
    .pe-lang select {
        flex: 1 1 auto;
        min-width: 0;
        height: 26px;
        border: 1px solid var(--border, #444);
        border-radius: 4px;
        background: var(--surface-1, #151515);
        color: inherit;
        font: inherit;
    }
    .pe-textarea {
        flex: 1 1 auto;
        min-height: 160px;
        resize: none;
        padding: 6px 8px;
        border: 1px solid var(--border, #444);
        border-radius: 4px;
        background: var(--surface-1, #151515);
        color: inherit;
        font: 13px/1.45 'Segoe UI', system-ui, sans-serif;
    }
    .pe-textarea:focus, .pe-lang select:focus { outline: 2px solid var(--accent, #3b82f6); outline-offset: -1px; }
    .pe-loading, .pe-msg { padding: 24px; opacity: .8; font-size: 13px; }
    .pe-msg { flex: 1 1 auto; }
    .pe-status {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 4px 10px;
        border-top: 1px solid var(--border, #333);
        opacity: .8;
    }
    .pe-dirty { color: var(--accent, #4ea1ff); }
</style>
