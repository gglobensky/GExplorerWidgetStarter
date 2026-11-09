// widgets/forge/lang.ts
//
// GEM FORGE 0.2.1: TYPESCRIPT AS YOU TYPE. GEM Shell's TypeScript (sdk.dev().language(): in the page, loaded the
// first time a .ts, .js or .vue file is shown) over the project's files as GEM Forge has them (unsaved edits
// included): completions (what TypeScript knows: the SDK's methods after `sdk.`, Vue's, the DOM's, your own), their
// details beside the list, a hover's type and documentation, its problems underlined as you type (and listed in
// Problems), Go to definition (Ctrl+click, or the editor's right-click). 0.2.2: Tab accepts a completion; Format
// document (Shift+Alt+F) and Format on save (TypeScript's formatter: indentation and spaces). 0.2.8: npm packages'
// own types (pkgtypes.ts: read from node_modules in the background, then everything is checked again). In a .vue file: its <script> blocks (the
// template keeps the Vue language's own suggestions). The SDK's types: the project's widgets-sdk.d.ts (as
// 'gexplorer/widgets'), else GEM Forge's own copy. npm packages: their imports are `any` (their types: later).
import { completeFromList, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import { hoverTooltip, EditorView, ViewPlugin, showTooltip, type Tooltip, type ViewUpdate } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'
import type { Diagnostic } from '@codemirror/lint'
import type { DevCompletion, DevLanguageService, DevProblem, DevSignatureHelp } from 'gexplorer/widgets'
import SDK_TYPINGS from '../../types/widgets-sdk.d.ts?raw'
import type { Project } from './project'
import { readPackageTypes, type PackageTypes } from './pkgtypes'
import { PRETTIER_PREFIX } from './pretty'

/** Files TypeScript reads (and GEM Forge asks it about). */
export const TS_FILE = /\.(ts|mts|js|mjs|vue)$/i
const SDK_COPY = '__forge__/widgets-sdk.d.ts'
/** One empty list (GEM Shell keeps the packages' types while it gets the same array). */
const NO_FILES: { path: string; text: string }[] = []

/** The <script> blocks' contents of a .vue file: [from, to) ranges. */
export function scriptRanges(text: string): [number, number][] {
    const out: [number, number][] = []
    for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
        const from = m.index! + m[0].indexOf('>') + 1
        out.push([from, from + m[1].length])
    }
    return out
}
const inScript = (text: string, pos: number) => scriptRanges(text).some(([a, b]) => pos >= a && pos <= b)

const KINDS: Record<string, Completion['type']> = {
    method: 'method', function: 'function', 'local function': 'function', constructor: 'function',
    property: 'property', getter: 'property', setter: 'property', 'JSX attribute': 'property',
    var: 'variable', let: 'variable', const: 'constant', 'local var': 'variable', parameter: 'variable', alias: 'variable',
    class: 'class', 'local class': 'class', interface: 'interface', type: 'type', 'type parameter': 'type',
    enum: 'enum', 'enum member': 'enum', keyword: 'keyword', module: 'namespace', 'external module name': 'namespace',
    string: 'text', directory: 'namespace', script: 'namespace',
}
// TypeScript's sortText: '10' (locals) … '15' (globals, keywords) … '16'+ (further away); a prefix for deprecated
// Documentation as prose: single line breaks joined (as editors render JSDoc), paragraphs and lists kept
const prose = (t: string) => t.replace(/\r\n?/g, '\n').replace(/([^\n])\n(?!\n|\s*@|\s*(?:[-*•]|\d+[.)])\s)/g, '$1 ')
const boostOf = (sort: string) => Math.max(-99, Math.min(99, 40 - (parseInt(sort.replace(/\D/g, '') || '15', 10) * 2) - (/^z/.test(sort) ? 20 : 0)))

/** What a transaction inserted (for signature help: "(" or "," typed). */
function insertedText(tr: { changes: { iterChanges(f: (a: number, b: number, c: number, d: number, t: { toString(): string }) => void): void } }): string {
    let out = ''
    tr.changes.iterChanges((_a, _b, _c, _d, t) => { out += t.toString() })
    return out
}

/** The signature tooltip: the active signature, its argument in bold, its documentation. */
function sigTooltip(h: DevSignatureHelp, pos: number): Tooltip {
    const it = h.items[Math.min(h.active, h.items.length - 1)]
    return {
        pos, above: true, strictSide: false,
        create: () => {
            const dom = document.createElement('div')
            dom.className = 'gf-ts-info gf-ts-sigs'
            const sig = document.createElement('div')
            sig.className = 'gf-ts-sig'
            sig.append(it.prefix)
            it.parameters.forEach((p, i) => {
                if (i) sig.append(it.separator)
                const b = document.createElement(i === h.parameter ? 'b' : 'span')
                b.textContent = p.text
                sig.append(b)
            })
            sig.append(it.suffix)
            dom.append(sig)
            const param = it.parameters[h.parameter]
            const doc = [param?.documentation ? `${param.text.split(':')[0]}: ${param.documentation}` : '', it.documentation].filter(Boolean).join('\n\n')
            if (doc) {
                const d = document.createElement('div')
                d.className = 'gf-ts-doc'
                d.textContent = prose(doc)
                dom.append(d)
            }
            if (h.items.length > 1) {
                const n = document.createElement('div')
                n.className = 'gf-ts-doc'
                n.textContent = `${h.active + 1} of ${h.items.length} signatures`
                dom.append(n)
            }
            return { dom }
        },
    }
}

/**
 * <oldName> renamed <newName> in a .vue file's template expressions: {{ … }}, and the values of :bound, @event, v-…
 * and #slot attributes; a whole name, not after a dot (a property of something else).
 */
export function renameInTemplate(source: string, oldName: string, newName: string): { text: string; count: number } {
    const tpl = /<template\b[^>]*>([\s\S]*)<\/template\s*>/i.exec(source)
    if (!tpl) return { text: source, count: 0 }
    const start = tpl.index + tpl[0].indexOf('>') + 1
    const body = tpl[1]
    const esc = oldName.replace(/[$]/g, '\\$&')
    const word = new RegExp(`(?<![\\w$.])${esc}(?![\\w$])`, 'g')
    let count = 0
    const swap = (expr: string) => expr.replace(word, () => { count++; return newName })
    const out = body
        .replace(/\{\{([\s\S]*?)\}\}/g, (_m, e: string) => `{{${swap(e)}}}`)
        .replace(/(\s(?::|@|v-[\w-]+|#)[^\s=>]*\s*=\s*)("[^"]*"|'[^']*')/g, (_m, a: string, v: string) => a + swap(v))
    return { text: source.slice(0, start) + out + source.slice(start + body.length), count }
}

/** TypeScript's problems as Problems lists them (lines and columns, 1-based; rule: the severity). */
function asProblems(path: string, text: string, list: { from: number; severity: string; text: string }[]): DevProblem[] {
    const lineStarts = [0]
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1)
    const lineOf = (o: number) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= o) lo = mid; else hi = mid - 1 } return lo }
    return list.map(p => { const ln = lineOf(p.from); return { file: path, line: ln + 1, column: p.from - lineStarts[ln] + 1, text: p.text, rule: p.severity } })
}

export type Language = ReturnType<typeof createLanguage>
const byProject = new WeakMap<Project, Language>()
/** The project's TypeScript helper (one per project: the editor remounts, it stays). */
export function languageFor(project: Project): Language {
    let l = byProject.get(project)
    if (!l) byProject.set(project, l = createLanguage(project))
    return l
}

function createLanguage(project: Project) {
    const s = project.state
    let svc: DevLanguageService | null = null
    let loading: Promise<DevLanguageService | null> | null = null
    let failed = false

    /** The service, loaded the first time (null: this GEM Shell has none, or it failed: said once in Output). */
    function service(): Promise<DevLanguageService | null> {
        if (svc) return Promise.resolve(svc)
        if (failed || !project.dev?.language) return Promise.resolve(null)
        return (loading ??= (async () => {
            s.types = 'loading'
            const r = await project.dev!.language!()
            if (!r.ok) {
                failed = true
                s.types = 'off'
                project.log('warn', `TypeScript isn't available: ${r.error}`)
                return null
            }
            svc = r.service
            s.types = 'ready'
            project.log('info', `TypeScript ${svc.version}: completions, hovers and problems as you type.`)
            return svc
        })())
    }

    function packageNames(): string[] {
        const text = project.file('package.json')?.text
        if (!text) return []
        try {
            const p = JSON.parse(text)
            return [...Object.keys(p?.dependencies ?? {}), ...Object.keys(p?.devDependencies ?? {})]
        } catch {
            return []
        }
    }

    let lastError = ''
    // ── The npm packages' types (0.2.8: pkgtypes.ts) ─────────────────────────────────────────────────────────────
    let typesKey = ''
    let typesOf: PackageTypes | null = null
    let lastTypes: PackageTypes | null = null
    /** The types for package.json as it is now (null while they're read: read once per change of the packages). */
    function packageTypes(names: string[]): PackageTypes | null {
        if (!s.folder || !names.length || !project.sdk.fsReadText) return { files: NO_FILES, untyped: names }
        // package.json's text and npm's last run (an Install all doesn't change package.json)
        const key = `${s.folder}\u0000${project.file('package.json')?.text ?? ''}\u0000${s.pkg.started}`
        if (key === typesKey) return typesOf
        typesKey = key
        typesOf = null
        s.typesNote = `Reading the packages' types (${names.join(', ')})…`
        const read = async (rel: string) => {
            try { return (await project.sdk.fsReadText!(project.pathOf(rel), { maxBytes: 4 * 1024 * 1024 })).text } catch { return null }
        }
        const started = Date.now()
        void readPackageTypes(names, read).then(async pt => {
            if (typesKey !== key) return
            typesOf = lastTypes = pt
            const typed = names.length - pt.untyped.length
            // 0.2.9: handed to TypeScript now, which parses them a few at a time between frames (GEM Shell
            // 2026-11-08: preparing()); the file shown is checked once they're ready, the page drawn meanwhile
            const l = await service()
            if (l && sync(l) && l.preparing) {
                while (typesKey === key && l.preparing() > 0) {
                    s.typesNote = `Preparing the packages' types (${l.preparing()} files left)…`
                    await new Promise(res => window.setTimeout(res, 120))
                }
            }
            if (typesKey !== key) return
            if (typed) project.log('info', `TypeScript: the types of ${typed} package${typed === 1 ? '' : 's'} (${pt.files.length} files, ${((Date.now() - started) / 1000).toFixed(1)} s)${pt.untyped.length ? `; without types: ${pt.untyped.join(', ')}` : ''}.`)
            s.typesNote = typed ? 'Checking with the packages\' types…' : ''
            s.typesRev++
        })
        return null
    }
    /** The files sent as they are now; <override>: a file's text newer than the project's (the editor's). Too many
     *  or too big: the rest left out (package-lock.json always), not the whole project refused. */
    function sync(l: DevLanguageService, override?: { path: string; text: string }): boolean {
        const files: { path: string; text: string }[] = []
        let total = 0
        for (const f of s.files) {
            if (f.base64 !== undefined || !/\.(ts|mts|js|mjs|vue|json)$/i.test(f.path) || /(^|\/)package-lock\.json$/.test(f.path)) continue
            const text = override?.path === f.path ? override.text : f.text
            if (text.length > 2_000_000 || total + text.length > 7_500_000 || files.length >= 298) continue
            total += text.length
            files.push({ path: f.path, text })
        }
        const aliases: Record<string, string> = {}
        if (project.file('widgets-sdk.d.ts')) aliases['gexplorer/widgets'] = 'widgets-sdk.d.ts'
        else { files.push({ path: SDK_COPY, text: SDK_TYPINGS }); aliases['gexplorer/widgets'] = SDK_COPY }
        // 0.2.8: the packages' own types (read in the background; meanwhile, and without types: any)
        const names = packageNames()
        const types = packageTypes(names)
        const r = l.sync(files, { aliases, untyped: types ? types.untyped : names, packages: types?.files ?? lastTypes?.files ?? NO_FILES })
        if (!r.ok && r.error !== lastError) project.log('warn', `TypeScript: ${r.error}`)
        lastError = r.ok ? '' : r.error ?? ''
        return r.ok
    }

    async function ready(path: string, text: string): Promise<DevLanguageService | null> {
        const l = await service()
        return l && sync(l, { path, text }) ? l : null
    }

    // ── Completions ──────────────────────────────────────────────────────────────────────────────────────────────
    function details(l: DevLanguageService, path: string, pos: number, it: DevCompletion) {
        return () => {
            const d = l.completionDetails(path, pos, it)
            if (!d || (!d.detail && !d.documentation)) return null
            const el = document.createElement('div')
            el.className = 'gf-ts-info'
            const head = document.createElement('div')
            head.className = 'gf-ts-sig'
            head.textContent = d.detail
            el.appendChild(head)
            if (d.documentation) {
                const doc = document.createElement('div')
                doc.className = 'gf-ts-doc'
                doc.textContent = prose(d.documentation)
                el.appendChild(doc)
            }
            return el
        }
    }

    async function tsComplete(path: string, ctx: CompletionContext): Promise<CompletionResult | null> {
        const word = ctx.matchBefore(/[\w$]*/)
        const from = word?.from ?? ctx.pos
        const before = ctx.state.sliceDoc(Math.max(0, from - 1), from)
        // While typing: after a letter or a dot (Ctrl+Space: anywhere)
        if (!ctx.explicit && !word?.text && before !== '.') return null
        const l = await ready(path, ctx.state.doc.toString())
        if (!l || ctx.aborted) return null
        const r = l.completions(path, ctx.pos)
        if (!r || !r.items.length) return null
        const options: Completion[] = r.items.map(it => ({
            label: it.name,
            type: KINDS[it.kind] ?? 'variable',
            boost: boostOf(it.sort),
            ...(it.modifiers.includes('optional') ? { detail: '?' } : {}),
            // 0.2.6: another module's export: picked, its import is added too
            ...(it.module ? { detail: `from ${it.module}`, apply: (view: EditorView, _c: Completion, f: number, to: number) => {
                const d = l.completionDetails(path, ctx.pos, it)
                const extra = (d?.edits ?? []).filter(e => e.path === path && e.to <= f)
                view.dispatch({ changes: [...extra.map(e => ({ from: e.from, to: e.to, insert: e.text })), { from: f, to, insert: it.insert ?? it.name }], userEvent: 'input.complete' })
            } } : {}),
            ...(it.module ? {} : it.replace
                ? { apply: (view: EditorView, _c: Completion, _f: number, to: number) => view.dispatch({ changes: { from: it.replace!.from, to: Math.max(it.replace!.to, to), insert: it.insert ?? it.name }, userEvent: 'input.complete' }) }
                : it.insert !== undefined ? { apply: it.insert } : {}),
            info: details(l, path, ctx.pos, it),
        }))
        return { from, options, validFor: /^[\w$]*$/ }
    }

    /** The editor's completion source for <path>: TypeScript in scripts, the language's own elsewhere (a template),
     *  and everywhere when this GEM Shell has no TypeScript (or it failed). */
    function completionSource(path: string): CompletionSource {
        return async (ctx: CompletionContext) => {
            const script = !path.toLowerCase().endsWith('.vue') || inScript(ctx.state.doc.toString(), ctx.pos)
            if (script && (await service())) return tsComplete(path, ctx)
            for (const src of ctx.state.languageDataAt<CompletionSource | readonly (string | Completion)[]>('autocomplete', ctx.pos)) {
                const r = await (typeof src === 'function' ? src(ctx) : completeFromList(src)(ctx))
                if (r) return r
            }
            return null
        }
    }

    // ── Hovers ───────────────────────────────────────────────────────────────────────────────────────────────────
    function hover(path: string) {
        return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
            const text = view.state.doc.toString()
            if (path.toLowerCase().endsWith('.vue') && !inScript(text, pos)) return null
            const l = await ready(path, text)
            const h = l?.hover(path, pos)
            if (!h || !h.text) return null
            return {
                pos: h.from, end: h.to, above: true,
                create: () => {
                    const dom = document.createElement('div')
                    dom.className = 'gf-ts-info'
                    const sig = document.createElement('div')
                    sig.className = 'gf-ts-sig'
                    sig.textContent = h.text
                    dom.appendChild(sig)
                    if (h.documentation) {
                        const doc = document.createElement('div')
                        doc.className = 'gf-ts-doc'
                        doc.textContent = prose(h.documentation)
                        dom.appendChild(doc)
                    }
                    return { dom }
                },
            }
        }, { hoverTime: 450 })
    }

    // ── Problems ─────────────────────────────────────────────────────────────────────────────────────────────────
    /** TypeScript's problems in <path> (its text as the editor has it): for the editor, and listed in Problems. */
    async function problems(path: string, text: string): Promise<Diagnostic[] | null> {
        const l = await ready(path, text)
        if (!l) return []
        // 0.2.9: the packages' types still being prepared: checked once they are (null: keep what's shown)
        if ((l.preparing?.() ?? 0) > 0) return null
        const list = l.problems(path).filter(p => p.severity !== 'info')
        if (s.typesNote.startsWith('Checking')) s.typesNote = ''
        // Problems lists them (lines and columns, 1-based)
        s.typeProblems = { path, items: asProblems(path, text, list) }
        // 0.2.10: Check all's list follows this file (when TypeScript is one of the checks)
        if (s.checked.at && !s.checked.running && s.checks.includes('typescript')) {
            // 0.2.12: the file's other checks' problems (Prettier's) kept
            const others = (s.checked.files.find(f => f.path === path)?.items ?? []).filter(p => p.text.startsWith(PRETTIER_PREFIX))
            const items = [...s.typeProblems.items, ...others]
            const i = s.checked.files.findIndex(f => f.path === path)
            if (i >= 0 && items.length) s.checked.files[i].items = items
            else if (i >= 0) s.checked.files.splice(i, 1)
            else if (items.length) s.checked.files = [...s.checked.files, { path, items }].sort((x, y) => x.path.localeCompare(y.path))
        }
        return list.map(p => ({ from: p.from, to: Math.max(p.to, Math.min(p.from + 1, text.length)), severity: p.severity, message: p.text, source: 'TypeScript' }))
    }

    /** 0.2.10 (Check all files): <path>'s problems on the project's text (null: TypeScript isn't there or not ready). */
    async function problemsOfFile(path: string): Promise<DevProblem[] | null> {
        const text = project.file(path)?.text
        if (text == null) return []
        const l = await ready(path, text)
        if (!l || (l.preparing?.() ?? 0) > 0) return null
        return asProblems(path, text, l.problems(path).filter(p => p.severity !== 'info'))
    }

    // ── Go to definition ─────────────────────────────────────────────────────────────────────────────────────────
    async function goToDefinition(path: string, text: string, pos: number): Promise<boolean> {
        const l = await ready(path, text)
        if (!l) { project.say('Go to definition needs TypeScript (GEM Shell 2026-11-07 or later).', false); return false }
        const defs = l.definition(path, pos)
        const own = defs.find(d => d.path && d.path !== SDK_COPY)
        if (own?.path) {
            const t = project.file(own.path)?.text ?? ''
            const head = t.slice(0, own.from)
            const line = head.split('\n').length
            project.open(own.path, { line, column: own.from - (head.lastIndexOf('\n') + 1) + 1 })
            return true
        }
        const other = defs.find(d => d.external || d.path === SDK_COPY)
        if (other) project.say(`Declared in ${other.external ?? 'the SDK\'s typings (GEM Forge\'s copy)'}: not a file of this project.`)
        else project.say('No definition found here.', false)
        return false
    }

    // ── Format (2026-11-08) ──────────────────────────────────────────────────────────────────────────────────────
    /** TypeScript's formatting edits for <path> (its text as given), in order; null: no TypeScript here. */
    async function format(path: string, text: string): Promise<{ from: number; to: number; text: string }[] | null> {
        const l = await ready(path, text)
        return l?.format ? l.format(path, { indent: 4 }) : null
    }

    // ── Rename symbol, references (0.2.6) ────────────────────────────────────────────────────────────────────────
    /**
     * Renames the name at <pos> in every file (asks the new name). A .vue file TypeScript changed: its template's
     * expressions ({{ }}, :bound, @events, v-…) follow by the name (TypeScript doesn't read templates). Undo: the
     * snackbar, as Rename and update.
     */
    async function renameSymbol(path: string, text: string, pos: number): Promise<void> {
        const l = await ready(path, text)
        if (!l?.renameInfo || !l.rename) { project.say('Rename symbol needs TypeScript (GEM Shell 2026-11-08 or later).', false); return }
        const info = l.renameInfo(path, pos)
        if (!info.ok) { project.say(info.error, false); return }
        const name = await project.sdk.ui?.().prompt(`Rename ${info.name} (everywhere in the project) to:`, {
            value: info.name,
            validate: (v: string) => (/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(v.trim()) ? null : 'A name: letters, digits, _ or $, not starting with a digit.'),
        })
        if (!name || name.trim() === info.name) return
        const r = l.rename(path, pos, name.trim())
        if (!r.ok) { project.say(r.error, false); return }
        // The new texts, file by file (the edits from the last to the first)
        const texts: Record<string, string> = {}
        const byFile = new Map<string, typeof r.edits>()
        for (const e of r.edits) byFile.set(e.path, [...(byFile.get(e.path) ?? []), e])
        let count = 0
        for (const [p, edits] of byFile) {
            let out = p === path ? text : project.file(p)?.text ?? ''
            for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to)
            count += edits.length
            if (/\.vue$/i.test(p)) { const t = renameInTemplate(out, info.name, name.trim()); count += t.count; out = t.text }
            texts[p] = out
        }
        project.replaceTexts(texts, count, `${info.name} → ${name.trim()}: ${count} place${count === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'} (not saved yet: Save all saves them).`)
    }

    /** The references of the name at <pos>: a menu (file:line and the line), picked: opened there. */
    async function findReferences(path: string, text: string, pos: number, anchor: HTMLElement): Promise<void> {
        const l = await ready(path, text)
        if (!l?.references) { project.say('Find references needs TypeScript (GEM Shell 2026-11-08 or later).', false); return }
        const refs = l.references(path, pos)
        if (!refs.length) { project.say('No references found here.', false); return }
        const items = refs.slice(0, 60).map((r, i) => {
            const t = r.path === path ? text : project.file(r.path)?.text ?? ''
            const head = t.slice(0, r.from)
            const line = head.split('\n').length
            const lineText = t.slice(head.lastIndexOf('\n') + 1, t.indexOf('\n', r.from) < 0 ? undefined : t.indexOf('\n', r.from)).trim()
            return { id: String(i), label: `${r.definition ? '◆ ' : ''}${r.path}:${line}  ${lineText.slice(0, 70)}`, at: { path: r.path, line, column: r.from - head.lastIndexOf('\n') } }
        })
        const id = await project.sdk.ui?.().menu(anchor, items.map(({ id, label }) => ({ id, label })), { label: `${refs.length} reference${refs.length === 1 ? '' : 's'}` })
        const pick = items.find(i => i.id === id)
        if (pick) project.open(pick.at.path, { line: pick.at.line, column: pick.at.column })
    }

    // ── Signature help (0.2.6): while typing a call's arguments ──────────────────────────────────────────────────
    function signatureHelp(path: string) {
        const setSig = StateEffect.define<Tooltip | null>()
        const field = StateField.define<Tooltip | null>({
            create: () => null,
            update(v, tr) {
                for (const e of tr.effects) if (e.is(setSig)) return e.value
                if (!v) return v
                return tr.docChanged ? { ...v, pos: tr.changes.mapPos(v.pos) } : v
            },
            provide: f => showTooltip.from(f),
        })
        let seq = 0
        const plugin = ViewPlugin.fromClass(class {
            update(u: ViewUpdate) {
                const typedOpen = u.transactions.some(tr => tr.isUserEvent('input') && /[(,<]/.test(insertedText(tr)))
                const open = !!u.state.field(field)
                if (!typedOpen && !(open && (u.docChanged || u.selectionSet))) return
                const view = u.view
                const pos = u.state.selection.main.head
                const text = u.state.doc.toString()
                if (path.toLowerCase().endsWith('.vue') && !inScript(text, pos)) return
                const mine = ++seq
                void ready(path, text).then(l => {
                    if (mine !== seq) return
                    const h = l?.signature?.(path, pos) ?? null
                    const tip = h ? sigTooltip(h, pos) : null
                    if (tip || view.state.field(field)) view.dispatch({ effects: setSig.of(tip) })
                })
            }
        })
        const close = EditorView.domEventHandlers({ keydown: (e, view) => { if (e.key === 'Escape' && view.state.field(field)) { view.dispatch({ effects: setSig.of(null) }); return false } return false } })
        return [field, plugin, close]
    }

    return {
        problemsOfFile,
        service, completionSource, hover, problems, goToDefinition, format, renameSymbol, findReferences, signatureHelp,
        get on() { return !!project.dev?.language && !failed },
    }
}
