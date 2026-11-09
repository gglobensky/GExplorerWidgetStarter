// widgets/forge/names.ts
//
// GEM FORGE 0.1.9: a free name in a folder, by the user's own naming pattern (sdk.ui().namingPattern(): Settings ▸ New
// items, "a (2).txt" by default), as GEM Shell names a copy. And the references to a renamed file in the project's
// other files (smart rename): the relative imports and URLs that point to it.
import type { NamingToken } from 'gexplorer/widgets'

const DEFAULT: NamingToken[] = [{ type: 'basename' }, { type: 'literal', value: ' (' }, { type: 'increment', start: 2 }, { type: 'literal', value: ')' }]

/** A .NET date format's usual parts (yyyy MM dd HH mm ss, 'quoted' text). */
function formatDate(d: Date, format: string): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    return format.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) =>
        lit !== undefined ? lit
            : m === 'yyyy' ? String(d.getFullYear()) : m === 'MM' ? pad(d.getMonth() + 1) : m === 'dd' ? pad(d.getDate())
                : m === 'HH' ? pad(d.getHours()) : m === 'mm' ? pad(d.getMinutes()) : pad(d.getSeconds()))
}

/** <name> with the pattern applied for try <i> (0: the first). A file keeps its extension after it. */
function nameWith(tokens: NamingToken[], name: string, i: number, isFolder: boolean): string {
    const dot = isFolder ? -1 : name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let out = ''
    let counted = false
    for (const t of tokens) {
        if (t.type === 'basename') out += base
        else if (t.type === 'literal') out += t.value
        else if (t.type === 'increment') { out += String((t.start ?? 2) + i); counted = true }
        else if (t.type === 'timestamp') out += formatDate(new Date(), t.format)
    }
    // A pattern without a number: a number after it from the second try on
    if (!counted && i > 0) out += ` ${i + 1}`
    return out + ext
}

/** <name> if free in <taken> (lower-case names), else the pattern's first free one. */
export function freeName(name: string, taken: Set<string>, tokens: NamingToken[] | null, isFolder = false): string {
    if (!taken.has(name.toLowerCase())) return name
    const tk = tokens?.length ? tokens : DEFAULT
    for (let i = 0; i < 500; i++) {
        const n = nameWith(tk, name, i, isFolder)
        if (!taken.has(n.toLowerCase())) return n
    }
    return `${Date.now()}-${name}`
}

// ── Smart rename: the references to a file ─────────────────────────────────────────────────────────────────────
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** <spec> (relative, from <fromFile>) as a project path, or null (a package, an absolute URL). */
function resolve(fromFile: string, spec: string): string | null {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return null
    const parts = (dirOf(fromFile) ? dirOf(fromFile).split('/') : [])
    for (const seg of spec.split('/')) {
        if (seg === '.' || seg === '') continue
        if (seg === '..') { if (!parts.length) return null; parts.pop() } else parts.push(seg)
    }
    return parts.join('/')
}

/** A relative specifier from <fromFile> to <target>. */
function relative(fromFile: string, target: string): string {
    const from = dirOf(fromFile) ? dirOf(fromFile).split('/') : []
    const to = target.split('/')
    let i = 0
    while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
    const up = from.length - i
    const rest = to.slice(i).join('/')
    return up ? `${'../'.repeat(up)}${rest}` : `./${rest}`
}

const EXTS = ['', '.ts', '.js', '.vue', '.mts', '.mjs', '.json', '.css']
// import x from '…', import '…', export … from '…', import('…'), require('…'), url(…) and @import '…' in CSS
const SPEC = /(\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|@import\s+|url\(\s*)(['"]?)(\.{1,2}\/[^'"\s)]+)\2/g

export type RenameEdit = { path: string; text: string; count: number }

/**
 * The files whose relative references point to <oldPath>, with their text rewritten for <newPath> (an extension left
 * out stays left out). <files>: the project's text files.
 */
export function referencesTo(files: { path: string; text: string }[], oldPath: string, newPath: string): RenameEdit[] {
    const out: RenameEdit[] = []
    for (const f of files) {
        if (f.path === oldPath) continue
        let count = 0
        const text = f.text.replace(SPEC, (m, pre: string, q: string, spec: string) => {
            const hit = EXTS.find(e => resolve(f.path, spec + e) === oldPath)
            if (hit === undefined) return m
            count++
            let next = relative(f.path, newPath)
            // The specifier had no extension: none in the new one either (same extension only)
            if (hit && next.endsWith(hit)) next = next.slice(0, -hit.length)
            return `${pre}${q}${next}${q}`
        })
        if (count) out.push({ path: f.path, text, count })
    }
    return out
}

/** <text> (the file that was <from>, now at <to>): its relative references rewritten to point where they did. */
export function rewriteOwnImports(text: string, from: string, to: string): string {
    return text.replace(SPEC, (m, pre: string, q: string, spec: string) => {
        const target = resolve(from, spec)
        if (target === null) return m
        return `${pre}${q}${relative(to, target)}${q}`
    })
}
