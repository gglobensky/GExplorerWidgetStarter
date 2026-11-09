// widgets/forge/pretty.ts
//
// GEM FORGE 0.2.12: PRETTIER (GEM Shell 2026-11-08: sdk.dev().prettier(), Prettier in the page, from GEM Shell's own
// assets). Format with Prettier (a file, a folder, the file shown: Format document when Prettier is the formatter),
// and the Prettier check of Check all files (a file not formatted as Prettier would: one warning, at its first
// different line). The project's options: .prettierrc / .prettierrc.json (JSON) or package.json's "prettier"; only
// Prettier's formatting options are used (no plugins, no overrides). A .js / .yaml / .toml config isn't read (it would
// be code, or another parser): the defaults then, said once in Output.
import type { DevPrettierOptions, DevPrettierService, DevProblem } from 'gexplorer/widgets'
import type { Project } from './project'

export type Pretty = ReturnType<typeof createPretty>
const byProject = new WeakMap<Project, Pretty>()
/** The project's Prettier helper (one per project). */
export function prettyFor(project: Project): Pretty {
    let p = byProject.get(project)
    if (!p) byProject.set(project, p = createPretty(project))
    return p
}

const CONFIGS = ['.prettierrc', '.prettierrc.json']
const UNREAD = ['.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.toml', '.prettierrc.json5']

function createPretty(project: Project) {
    const s = project.state
    let svc: DevPrettierService | null = null
    let loading: Promise<DevPrettierService | null> | null = null
    let saidUnread = ''

    /** Whether this GEM Shell has Prettier at all (before loading it). */
    const available = () => !!project.dev?.prettier

    /** Prettier, loaded the first time (null: this GEM Shell has none, or it failed: said in Output). */
    function service(): Promise<DevPrettierService | null> {
        if (svc) return Promise.resolve(svc)
        if (!project.dev?.prettier) return Promise.resolve(null)
        return (loading ??= project.dev.prettier().then(r => {
            if (r.ok) { svc = r.service; return svc }
            project.log('warn', `Prettier: ${r.error}`)
            loading = null
            return null
        }, err => { project.log('warn', `Prettier: ${String(err?.message ?? err)}`); loading = null; return null }))
    }

    /** The project's options (its .prettierrc, .prettierrc.json or package.json's "prettier"; {}: the defaults). */
    function options(): DevPrettierOptions {
        for (const name of CONFIGS) {
            const text = project.file(name)?.text
            if (text === undefined) continue
            try { return JSON.parse(text) as DevPrettierOptions } catch (err) {
                note(`${name} isn't JSON (${String((err as Error)?.message ?? err)}): Prettier's defaults are used.`)
                return {}
            }
        }
        const pkg = project.file('package.json')?.text
        if (pkg) {
            try {
                const o = JSON.parse(pkg)?.prettier
                if (o && typeof o === 'object') return o as DevPrettierOptions
            } catch { /* package.json's own problem */ }
        }
        const other = UNREAD.find(n => project.file(n))
        if (other) note(`${other} isn't read (GEM Forge reads .prettierrc / .prettierrc.json, JSON only): Prettier's defaults are used.`)
        return {}
    }
    function note(text: string) {
        if (saidUnread === text) return
        saidUnread = text
        project.log('warn', `Prettier: ${text}`)
    }

    /** <path>'s text formatted (null: Prettier isn't there or doesn't do this file; an error: it doesn't parse). */
    async function format(path: string, text: string): Promise<{ text: string } | { error: string; line?: number; column?: number } | null> {
        const p = await service()
        if (!p || !p.supports(path)) return null
        // 0.2.13: in a .vue file, Prettier leaves a <script> or <style> it can't read as it is (and formats the rest):
        // each block is read first, so a syntax error there says so instead of "formatted"
        if (/\.vue$/i.test(path)) {
            const bad = await vueBlockError(p, path, text)
            if (bad) return bad
        }
        const r = await p.format(path, text, options())
        return r.ok ? { text: r.text } : { error: r.error, line: r.line, column: r.column }
    }

    /** The Prettier check of <path>: [] formatted, one warning when it isn't (null: not checked). */
    async function problemsOfFile(path: string): Promise<DevProblem[] | null> {
        const p = await service()
        if (!p) return null
        const text = project.file(path)?.text
        if (text === undefined || !p.supports(path)) return []
        const bad = /\.vue$/i.test(path) ? await vueBlockError(p, path, text) : null
        const r = bad ? { ok: false as const, error: bad.error, line: bad.line, column: bad.column } : await p.format(path, text, options())
        if (!r.ok) return [{ file: path, line: r.line ?? 1, column: r.column ?? 1, text: `${PRETTIER_PREFIX}can't read it: ${r.error}`, rule: 'warning' }]
        if (r.text === text) return []
        return [{ file: path, line: firstDifferentLine(text, r.text), column: 1, text: `${PRETTIER_PREFIX}not formatted as Prettier would (Format with Prettier).`, rule: 'warning' }]
    }

    return { available, service, format, problemsOfFile, supports: (path: string) => (svc ? svc.supports(path) : SUPPORTED.test(path)), version: () => svc?.version ?? '' }
}

/** A Prettier check's problem starts with this (lang.ts keeps them when TypeScript's are updated). */
export const PRETTIER_PREFIX = 'Prettier: '
/** 0.2.12: <path> formatted: its Prettier problems leave the All files list. */
export function prettierDone(project: Project, path: string) {
    const s = project.state
    const i = s.checked.files.findIndex(f => f.path === path)
    if (i < 0) return
    const items = s.checked.files[i].items.filter(p => !p.text.startsWith(PRETTIER_PREFIX))
    if (items.length) s.checked.files[i].items = items
    else s.checked.files.splice(i, 1)
}

/** What Prettier formats here, before it's loaded (GEM Shell's dev/prettier.ts says the same once it is). */
export const SUPPORTED = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|vue|css|scss|less|html?|md|markdown|json5?|jsonc|ya?ml)$/i

/** 0.2.13: the first <script> / <style> block of a .vue file Prettier can't read (its line in the .vue file), or null. */
async function vueBlockError(p: DevPrettierService, path: string, text: string): Promise<{ error: string; line?: number; column?: number } | null> {
    for (const m of text.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
        const attrs = m[2], body = m[3]
        const lang = /\blang\s*=\s*["']?([\w-]+)/i.exec(attrs)?.[1]?.toLowerCase()
        const ext = m[1].toLowerCase() === 'script'
            ? (lang === 'ts' || lang === 'tsx' ? 'ts' : 'js')
            : (lang === 'scss' || lang === 'less' ? lang : 'css')
        if (!p.supports(`x.${ext}`)) continue
        const r = await p.format(`${path}.${ext}`, body, {})
        if (r.ok) continue
        // The block's first line is the tag's: its text starts right after '>'
        const bodyAt = (m.index ?? 0) + m[0].indexOf('>') + 1
        const before = text.slice(0, bodyAt).split('\n').length - 1
        return { error: `<${m[1].toLowerCase()}>: ${r.error}`, line: r.line !== undefined ? r.line + before : undefined, column: r.column }
    }
    return null
}

function firstDifferentLine(a: string, b: string): number {
    const n = Math.min(a.length, b.length)
    let i = 0
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
    let line = 1
    for (let k = 0; k < i; k++) if (a.charCodeAt(k) === 10) line++
    return line
}

/** One change turning <a> into <b>: the part between their common start and end (the editor keeps the rest). */
export function minimalChange(a: string, b: string): { from: number; to: number; insert: string } | null {
    if (a === b) return null
    let start = 0
    const max = Math.min(a.length, b.length)
    while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++
    let endA = a.length, endB = b.length
    while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) { endA--; endB-- }
    return { from: start, to: endA, insert: b.slice(start, endB) }
}
