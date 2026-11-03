// widgets/corkboard/ink.ts
//
// INK (0.1.0): strokes drawn on a picture, a sketch area, or the note's margin (Alt-drag; a pen in Pen mode).
//   - A stroke is points [x, y, pressure] in its surface's units: 1000 wide for pictures and sketches (they
//     scale with the note), CSS px for the margin.
//   - Mouse strokes are one smoothed path; a pen's are segments whose width follows the pressure.
//   - Erasing: the eraser tool, the right button, or a pen's eraser end; whole strokes, as they are touched.
//   - Undo: what was drawn or erased last, per desk (inkUndo).
// The drawing listens to the pointer on window only while a stroke is under way (released on pointerup).
import type { Stroke, InkColor } from './model'

const NS = 'http://www.w3.org/2000/svg'
export type InkTool = InkColor | 'erase'
export type InkUndo = { arr: Stroke[]; add?: Stroke; removed?: { s: Stroke; i: number }[] }
/** What a right-press did, for the context menu that follows it: a drag that erased is not a click. */
export type InkGesture = { right: boolean; moved: boolean; removed: number }

export function pathD(p: Stroke['pts']): string {
    if (!p.length) return ''
    if (p.length < 3) return `M${p[0][0]} ${p[0][1]}L${p[p.length - 1][0]} ${p[p.length - 1][1]}`
    let d = `M${p[0][0]} ${p[0][1]}`
    for (let i = 1; i < p.length - 1; i++) {
        const mx = ((p[i][0] + p[i + 1][0]) / 2).toFixed(1), my = ((p[i][1] + p[i + 1][1]) / 2).toFixed(1)
        d += `Q${p[i][0]} ${p[i][1]} ${mx} ${my}`
    }
    const l = p[p.length - 1]
    return d + `L${l[0]} ${l[1]}`
}
const pw = (s: Stroke, pr: number) => (s.w * (0.35 + pr * 1.3)).toFixed(2)

function strokeEl(s: Stroke): SVGElement {
    if (s.p) {
        const g = document.createElementNS(NS, 'g')
        g.setAttribute('class', 'cb-stk'); g.style.stroke = `var(--cb-ink-${s.c})`
        for (let i = 1; i < s.pts.length; i++) g.appendChild(segment(s, s.pts[i - 1], s.pts[i]))
        return g
    }
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('class', 'cb-stk' + (s.c === 'hl' ? ' hl' : ''))
    path.setAttribute('d', pathD(s.pts))
    path.style.stroke = `var(--cb-ink-${s.c})`; path.style.strokeWidth = String(s.w)
    return path
}
function segment(s: Stroke, a: Stroke['pts'][number], b: Stroke['pts'][number]): SVGLineElement {
    const l = document.createElementNS(NS, 'line')
    l.setAttribute('x1', String(a[0])); l.setAttribute('y1', String(a[1])); l.setAttribute('x2', String(b[0])); l.setAttribute('y2', String(b[1]))
    l.style.strokeWidth = pw(s, b[2])
    return l
}

export function drawStrokes(svg: SVGSVGElement | null, arr: Stroke[]) {
    if (!svg) return
    svg.replaceChildren(...arr.map(strokeEl))
}

export type InkOptions = {
    tool: InkTool
    /** A stroke was added or strokes erased (save; the undo entry). */
    done: (u: InkUndo) => void
    /** What this press turned out to be (read by the context menu after a right-press). */
    gesture: (g: InkGesture) => void
}

/** Starts a stroke (or an erase) on `svg` from a pointerdown; ends on pointerup / cancel. */
export function beginInk(e: PointerEvent, svg: SVGSVGElement, arr: Stroke[], o: InkOptions) {
    e.preventDefault(); e.stopPropagation()
    const vb = svg.viewBox?.baseVal, r0 = svg.getBoundingClientRect()
    const k = (vb && vb.width ? vb.width : r0.width) / (r0.width || 1)
    const loc = (ev: PointerEvent): [number, number] => {
        const r = svg.getBoundingClientRect()
        return [+((ev.clientX - r.left) * k).toFixed(1), +((ev.clientY - r.top) * k).toFixed(1)]
    }
    const g: InkGesture = { right: e.button === 2, moved: false, removed: 0 }
    o.gesture(g)
    const x0 = e.clientX, y0 = e.clientY
    let mv: (ev: PointerEvent) => void, up: () => void
    const stop = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }

    if (o.tool === 'erase' || e.button === 2 || (e.buttons & 32)) {
        const removed: { s: Stroke; i: number }[] = [], R = 9 * k
        const hit = (ev: PointerEvent) => {
            const [x, y] = loc(ev); let any = false
            for (let j = arr.length - 1; j >= 0; j--) {
                const s = arr[j]
                if (s.pts.some(p => Math.hypot(p[0] - x, p[1] - y) < R + s.w / 2)) { removed.push({ s, i: j }); arr.splice(j, 1); any = true }
            }
            if (any) { drawStrokes(svg, arr); g.removed = removed.length }
        }
        if (!g.right) hit(e)
        mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) g.moved = true; if (g.moved || !g.right) hit(ev) }
        up = () => { stop(); if (removed.length) o.done({ arr, removed }) }
    } else {
        const pen = e.pointerType === 'pen', hl = o.tool === 'hl'
        const s: Stroke = { c: o.tool as InkColor, w: +((hl ? 18 : pen ? 3.2 : 2.6) * k).toFixed(2), pts: [] }
        if (pen && !hl) s.p = 1
        const live = document.createElementNS(NS, s.p ? 'g' : 'path') as SVGElement
        live.setAttribute('class', 'cb-stk' + (hl ? ' hl' : '')); live.style.stroke = `var(--cb-ink-${s.c})`
        if (!s.p) live.style.strokeWidth = String(s.w)
        svg.appendChild(live)
        const add = (ev: PointerEvent) => {
            const [x, y] = loc(ev), last = s.pts[s.pts.length - 1]
            if (last && Math.hypot(last[0] - x, last[1] - y) < 0.9 * k) return
            const pr = s.p ? +((ev.pressure || 0.5).toFixed(2)) : 0.5
            s.pts.push([x, y, pr])
            if (s.p) { if (last) live.appendChild(segment(s, last, s.pts[s.pts.length - 1])) }
            else live.setAttribute('d', pathD(s.pts))
        }
        add(e)
        mv = ev => { g.moved = true; const evs = ev.getCoalescedEvents?.() ?? []; (evs.length ? evs : [ev]).forEach(add) }
        up = () => {
            stop()
            if (s.pts.length === 1) s.pts.push([s.pts[0][0] + 0.1, s.pts[0][1], s.pts[0][2]])
            arr.push(s); drawStrokes(svg, arr); o.done({ arr, add: s })
        }
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
}

/** Takes back one InkUndo entry. */
export function undoInk(u: InkUndo) {
    if (u.add) { const j = u.arr.indexOf(u.add); if (j >= 0) u.arr.splice(j, 1) }
    else u.removed?.slice().reverse().forEach(r => u.arr.splice(Math.min(r.i, u.arr.length), 0, r.s))
}
