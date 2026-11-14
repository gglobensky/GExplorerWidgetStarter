// check-fixed-px.mjs — lists text sizes and corners written in fixed px (2026-11-14, Appearance A3).
//
// GEM Shell's rule (claude/appearance-scale-design.md): text follows the Appearance text size and the OS text
// scale, corners follow Roundness. So:
//   text      var(--font-xs|sm|md|lg|xl), em, or a ratio of the base: calc(var(--base-font-size) * 11 / 12)
//             (the base is 12px at 100 %: "11 / 12" reads "11px at 100 %")
//   corners   var(--radius-sm|md|lg), or a ratio of the base: calc(var(--base-radius) * 6 / 16)
//             (16px at 100 %); a button / field / pill: a fraction of its own height x var(--roundness)
//   50 % (a dot, a circle) and 0 are fine; px inside a var() fallback is fine, except the fallback of a variable
//   named for a font size or a radius (var(--x-font-size, 13px): that px IS the size wherever it isn't set).
//   A custom property holding a text size or a corner (--x-font-size: 12px, --x-radius: 6px) counts too.
// A line that really means px says so: put px-ok in a comment on that line.
//
//   node check-fixed-px.mjs [folder or file ...]      default: src (the shell) / widgets shared (the starter)
//   --warn                                           list them, but exit 0
//
// Exit code 1 when something is found (0 with --warn). No dependencies.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const args = process.argv.slice(2)
const warnOnly = args.includes('--warn')
let roots = args.filter(a => !a.startsWith('--'))
if (roots.length === 0) roots = ['src', 'widgets', 'shared'].filter(r => { try { return statSync(r).isDirectory() } catch { return false } })

const EXTS = new Set(['.vue', '.css', '.ts', '.js', '.mjs'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'generated', 'public'])

function* files(p) {
    let st
    try { st = statSync(p) } catch { return }
    if (st.isFile()) { if (EXTS.has(extname(p))) yield p; return }
    for (const name of readdirSync(p)) {
        if (SKIP_DIRS.has(name)) continue
        yield* files(join(p, name))
    }
}

// font-size: 11px (not --base-font-size: …); fontSize: '11px' in code
const FONT_CSS = /(?<![-\w])font-size\s*:\s*([^;"'}]*)/i
// font: 600 11px/1.4 … (the size, or a px line height)
const FONT_SHORT = /(?<![-\w])font\s*:\s*([^;"'}]*)/i
const FONT_JS = /\bfontSize\s*[:=]\s*['"`]\s*\d+(?:\.\d+)?px/
// border-radius / border-top-left-radius / border-start-end-radius …
const RADIUS = /(?<![-\w])border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius\s*:\s*([^;"'}]*)/i
const RADIUS_JS = /\bborder\w*Radius\s*[:=]\s*['"`]([^'"`]*)/
// NEW (2026-11-14): a size kept in a custom property (--gpi-font-size: 12px; --tip-radius: 6px), and a px fallback
// of a var() whose name says font size / radius (var(--gpi-font-size, 13px): the size whenever it isn't set)
const CUSTOM_PROP = /(?<![-\w])--[\w-]*(font-size|font|radius)[\w-]*\s*:\s*([^;"'}]*)/i
// (the shell's own tokens are always set: their fallbacks don't count)
const VAR_FALLBACK = /var\(\s*--(?!radius-(?:sm|md|lg)\b|base-|font-(?:xs|sm|md|lg|xl)\b)[\w-]*(?:font-size|radius)[\w-]*\s*,\s*(\d+(?:\.\d+)?px)\s*\)/i

/** The value with its var(…) parts removed (a fallback in px is fine). */
function withoutVars(v) {
    let prev
    do { prev = v; v = v.replace(/var\([^()]*\)/g, '') } while (v !== prev)
    return v
}
const hasPx = v => /(?:^|[^\w.])(?!0+(?:\.0+)?px)\d+(?:\.\d+)?px/.test(withoutVars(v))

const found = []
for (const root of roots) {
    for (const f of files(root)) {
        const lines = readFileSync(f, 'utf8').split(/\r?\n/)
        lines.forEach((line, i) => {
            if (/px-ok/.test(line)) return
            const kinds = []
            const fv = line.match(FONT_CSS)
            if (fv && hasPx(fv[1])) kinds.push('text')
            else if (FONT_JS.test(line)) kinds.push('text')
            else { const sv = line.match(FONT_SHORT); if (sv && hasPx(sv[1])) kinds.push('text') }
            const r = line.match(RADIUS) ?? line.match(RADIUS_JS)
            if (r && hasPx(r[1])) kinds.push('corner')
            const cp = line.match(CUSTOM_PROP)
            if (cp && hasPx(cp[2]) && !/^--base-/.test(cp[0])) kinds.push(/radius/i.test(cp[1]) ? 'corner-var' : 'text-var')
            else if (VAR_FALLBACK.test(line) && !kinds.length) kinds.push('fallback')
            if (kinds.length) found.push({ f: relative(process.cwd(), f), n: i + 1, kinds, text: line.trim() })
        })
    }
}

const byFile = new Map()
for (const x of found) byFile.set(x.f, [...(byFile.get(x.f) ?? []), x])
for (const [f, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${f}  (${list.length})`)
    for (const x of list) console.log(`  ${String(x.n).padStart(5)}  ${x.kinds.join('+').padEnd(11)} ${x.text.length > 110 ? x.text.slice(0, 107) + '…' : x.text}`)
}
const text = found.filter(x => x.kinds.some(k => k.startsWith('text'))).length
const corner = found.filter(x => x.kinds.some(k => k.startsWith('corner'))).length
const fallback = found.filter(x => x.kinds.includes('fallback')).length
console.log(found.length
    ? `\n${found.length} line(s) in ${byFile.size} file(s): ${text} fixed text size(s), ${corner} fixed corner(s), ${fallback} px default(s) in a var() fallback. The rule: the comment at the top of this script.`
    : '\nNo fixed px text sizes or corners.')
process.exit(found.length && !warnOnly ? 1 : 0)
