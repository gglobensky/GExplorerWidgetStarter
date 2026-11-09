// widgets/forge/smap.ts
//
// GEM FORGE 0.2.5: THE CONSOLE'S STACKS, IN THE PROJECT'S LINES. A dev run's build carries esbuild's source map
// (sdk.dev().build's sourceMap, GEM Shell 2026-11-08): a frame "index.js?b=3:2:947" becomes "Widget.vue:14:9".
//   - The map: version 3, its "mappings" decoded once (the first stack of a build), per generated line.
//   - Its sources are relative to index.js: '../src/<path>' are the project's files; node_modules' are shown as
//     '<package>/<file>'.
//   - A .vue file reached the bundler compiled (dev/sfc.ts: its script, its template inlined): the map's position is
//     in that compiled module. The line is found in the .vue file by its text (most lines of a script are kept as
//     written), else the code at the column (a template's expression); else the frame stays on index.js.
// No source map (an older GEM Shell, a map too big): the frames stay on index.js.

export type BuildMap = { map: string; lineOffset: number; compiled: Record<string, string> }
export type Position = { path: string; line: number; column: number; own: boolean }

const B64 = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]))

/** The "mappings" of a version 3 map: per generated line, [genCol, source, line, col] × n (0-based). */
function decode(mappings: string): Int32Array[] {
    const lines: Int32Array[] = []
    let src = 0, line = 0, col = 0
    for (const text of mappings.split(';')) {
        const seg: number[] = []
        let gen = 0
        for (const part of text.split(',')) {
            if (!part) continue
            const v: number[] = []
            let value = 0, shift = 0
            for (const ch of part) {
                const d = B64.get(ch)
                if (d === undefined) break
                value += (d & 31) << shift
                if (d & 32) { shift += 5; continue }
                v.push(value & 1 ? -(value >>> 1) : value >>> 1)
                value = 0
                shift = 0
            }
            gen += v[0] ?? 0
            if (v.length >= 4) {
                src += v[1]
                line += v[2]
                col += v[3]
                seg.push(gen, src, line, col)
            }
        }
        lines.push(Int32Array.from(seg))
    }
    return lines
}

/** The .vue file's position of a position in its compiled module (1-based); null: not found. */
export function vuePosition(original: string, compiled: string, line: number, column: number): { line: number; column: number } | null {
    const cl = compiled.split('\n')[line - 1]
    if (cl == null) return null
    const ol = original.split('\n')
    const key = cl.trim()
    if (key.length >= 3 && !/^[{}()[\];,]+$/.test(key)) {
        const hits: number[] = []
        ol.forEach((l, i) => { if (l.trim() === key) hits.push(i) })
        if (hits.length) {
            // Several: the one at about the same place in the file
            const want = (line / Math.max(1, compiled.split('\n').length)) * ol.length
            const i = hits.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
            const shift = column - 1 - cl.indexOf(key)
            return { line: i + 1, column: Math.max(1, ol[i].indexOf(key) + shift + 1) }
        }
    }
    // The code at the column (a template's expression, a line the compiler rewrote): its longest piece in the file
    const from = Math.max(0, column - 1)
    for (let len = Math.min(48, cl.length - from); len >= 4; len--) {
        const piece = cl.slice(from, from + len)
        if (!/\w/.test(piece)) continue
        const at = original.indexOf(piece)
        if (at >= 0) {
            const head = original.slice(0, at)
            return { line: head.split('\n').length, column: at - head.lastIndexOf('\n') }
        }
    }
    return null
}

/** A build's mapper: a position in index.js (1-based, as a stack says it) to the project's (or a package's). */
export function createMapper(bm: BuildMap, textOf: (path: string) => string | undefined) {
    let parsed: { sources: string[]; lines: Int32Array[] } | null | undefined
    function load() {
        if (parsed !== undefined) return parsed
        try {
            const m = JSON.parse(bm.map)
            parsed = m?.version === 3 && typeof m.mappings === 'string' && Array.isArray(m.sources)
                ? { sources: m.sources.map(String), lines: decode(m.mappings) }
                : null
        } catch {
            parsed = null
        }
        return parsed
    }

    return function map(line: number, column: number): Position | null {
        const p = load()
        if (!p) return null
        const segs = p.lines[line - 1 - bm.lineOffset]
        if (!segs || !segs.length) return null
        // The last segment at or before the column (0-based)
        const col0 = column - 1
        let lo = 0, hi = segs.length / 4 - 1, best = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (segs[mid * 4] <= col0) { best = mid; lo = mid + 1 } else hi = mid - 1
        }
        if (best < 0) return null
        const source = p.sources[segs[best * 4 + 1]] ?? ''
        const at = { line: segs[best * 4 + 2] + 1, column: segs[best * 4 + 3] + 1 }
        const nm = source.lastIndexOf('node_modules/')
        if (nm >= 0) return { path: source.slice(nm + 'node_modules/'.length), ...at, own: false }
        const path = source.replace(/^(\.\.\/)+src\//, '').replace(/^\.\//, '')
        if (/\.vue$/i.test(path) && bm.compiled[path] != null) {
            const original = textOf(path)
            const v = original != null ? vuePosition(original, bm.compiled[path], at.line, at.column) : null
            return v ? { path, ...v, own: true } : null
        }
        return { path, ...at, own: true }
    }
}
