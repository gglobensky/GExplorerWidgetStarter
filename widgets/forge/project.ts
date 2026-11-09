// widgets/forge/project.ts
//
// GEM FORGE 0.1: THE PROJECT. A widget project: its files (text, or bytes for pictures and fonts), the ones open in the
// editor, what the last build said, what the project wrote to the console. A project opened from a folder is that
// folder: saved there (sdk.fsWriteText), watched (sdk.dev().watch: an AI or another editor writing a file rebuilds
// it), read with sdk.openListing / fsReadText / fsReadBytes. CHANGED (0.1c): New project (templates.ts) writes a
// real folder first; a project in memory (a sample from 0.1a/0.1b, restored) still saves with Save to a folder….
// The guide files (AGENTS.md, widgets-sdk.d.ts, tsconfig.json) and every .md / .d.ts are left out of the build.
//
// INSTALL (0.1c): built without { project } (its own id, entry.ts's), then sdk.dev().install after GEM Shell's
// question; that build is kept for the files as they are, so a second click installs at once (the install must
// follow the user's click within 5 s: a slow first build may need it).
//
// RUN: build the files as project <id> (sdk.dev().build(files, { project })), then run it (dev:run: widget dev-<id>);
// with live reload on, every save and every change on disk runs it again (300 ms after the last one). A build with
// errors leaves the last good one running: the preview says so.
//
// A FILE CHANGED ON DISK while it has edits here: listed in `conflicts`; keepMine() or takeDisk() decides.
//
// KEPT WHILE GEM FORGE IS AWAY (0.1b, the lifecycle): the project object itself lives as long as this copy of GEM
// Forge (Widget.vue: a resource cell), so a tab switch finds it as it was: its watch, its runs, each file's editor
// state (editorStates: undo, selection). When GEM Shell puts the copy away for good (hibernation, a restart),
// snapshot() is what's saved (plain data: the folder or the sample's files, unsaved edits, open tabs, cursors, live
// reload) and restore() brings it back: the folder read again, the edits put back on top.
import { reactive, markRaw } from 'vue'
import type { WidgetSdk, WidgetDev, DevProblem, DevChange, ListingEntry, DevInstalledState, NamingToken } from 'gexplorer/widgets'
import { GUIDE_FILES } from './templates'
import { createMapper } from './smap'
import { zipFiles } from './zip'
import { freeName, referencesTo, rewriteOwnImports, type RenameEdit } from './names'

// 0.2.12: .cjs, .scss, .less, .yaml too, and the tools' dot files (.prettierrc, .prettierignore, .editorconfig, .gitignore)
export const TEXT_FILE = /(\.(ts|js|mjs|cjs|vue|css|scss|less|json|md|txt|svg|html|ya?ml)|(^|\/)\.(prettierrc|prettierignore|editorconfig|gitignore))$/i
export const BINARY_FILE = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i
const IGNORED = new Set(['node_modules', '.git', 'dist', 'bin', 'obj', '.vs', '.idea'])
export const MAX_FILES = 300
const MAX_TEXT = 2 * 1024 * 1024
const MAX_BINARY = 4 * 1024 * 1024

export type PFile = {
    path: string
    /** What the editor shows. */
    text: string
    /** What the file holds on disk (or the sample's text): text !== saved means unsaved edits. */
    saved: string
    /** A picture or a font: its bytes, base64 (never edited). */
    base64?: string
    /** The file began with a byte order mark: kept when saved. */
    bom?: boolean
    /** Its lines ended with CR LF on disk: kept when saved (the editor works with LF). */
    crlf?: boolean
}
export type LogLine = { level: string; text: string; time: string }
/** What snapshot() saves: plain data only (the lifecycle's rule). */
export type Session = {
    folder: string
    name: string
    /** 0.1d: a project in memory's own id (the playground's pg-<…>). */
    id?: string
    /** A sample in memory: its files (a folder project: none, it's read again). */
    files: { path: string; text: string; saved?: string }[] | null
    /** Unsaved edits of a folder project: path -> text. */
    unsaved: Record<string, string>
    openTabs: string[]
    active: string
    liveReload: boolean
    /** 0.2.2: TypeScript's formatting before each save. */
    formatOnSave?: boolean
    /** 0.2.10: the checks Check all files runs. */
    checks?: string[]
    /** 0.2.12: files / folders left out of Check all; the formatter (Format document, Format on save). */
    checkSkip?: string[]
    formatter?: 'typescript' | 'prettier'
    /** 0.1.8: pinned tabs (first, no ×), and how many rows of tabs show. */
    pinned?: string[]
    tabRows?: number
    /** Each open file's cursor (an offset). */
    cursors: Record<string, number>
}
export type Reveal = { path: string; line: number; column: number; seq: number }

/**
 * 0.2.4: a console message's stack, readable: the widget's own frames kept (their URL shortened to index.js:line:col),
 * GEM Shell's and Vue's runtime frames (/runtime/vue.js, the host) counted on one line.
 */
export function tidyStack(text: string, place?: (build: number | null, line: number, column: number) => string | null): string {
    if (!/\n\s+at\s/.test(text)) return text
    const out: string[] = []
    let hidden = 0
    for (const line of text.split('\n')) {
        if (!/^\s+at\s/.test(line)) { out.push(line); continue }
        if (!/\/runtime-widgets\//.test(line)) { hidden++; continue }
        // 0.2.5: index.js's position in the project's file (the build's source map: smap.ts), else index.js:line:col
        out.push(line.replace(/(?:https?:\/\/[^\s()]*?)?\/runtime-widgets\/[^/\s()]+\/([^\s()?:]+)(?:\?([^\s():]*))?:(\d+)(?::(\d+))?/g,
            (_m, file: string, query: string | undefined, l: string, c: string | undefined) => {
                const b = /(?:^|&)b=(\d+)/.exec(query ?? '')
                const mapped = file === 'index.js' && c && place ? place(b ? Number(b[1]) : null, Number(l), Number(c)) : null
                return mapped ?? `${file}:${l}${c ? ':' + c : ''}`
            }))
    }
    if (hidden) out.push(`    … ${hidden} more in GEM Shell's runtime (Vue)`)
    return out.join('\n')
}

/** 0.2.4: the npm package an import names ('date-fns/locale' → 'date-fns', '@a/b/c' → '@a/b'); null: not a package. */
export function packageOf(spec: string): string | null {
    if (!spec || /^[./]/.test(spec) || /^(vue|gexplorer\/widgets)$/.test(spec) || spec.includes(':')) return null
    const parts = spec.split('/')
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    return /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]{0,213}$/.test(name) ? name : null
}

/** A project id from a name: lower-case letters, digits and dashes (dev-<id> is its widget while edited). */
export function projectIdOf(name: string): string {
    const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
    return /^[a-z0-9]/.test(s) ? s : 'project'
}

const sepOf = (folder: string) => (folder.includes('\\') ? '\\' : '/')
const joinPath = (folder: string, rel: string) => folder.replace(/[\\/]+$/, '') + sepOf(folder) + rel.split('/').join(sepOf(folder))
const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

/** Built: not the guide for AIs, no notes, no typings. */
// 0.2.0: package.json and package-lock.json are npm's (the build reads the packages from node_modules)
const isBuilt = (path: string) => !GUIDE_FILES.has(path) && !/\.(md|d\.ts)$/i.test(path) && path !== 'package.json' && path !== 'package-lock.json'

/** A cheap fingerprint of the files built (to keep an install build while they don't change). */
function fingerprint(files: { path: string; text?: string; base64?: string }[]): string {
    let h = 2166136261
    for (const f of files) {
        const t = `${f.path}\u0000${f.text ?? f.base64 ?? ''}\u0001`
        for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) }
    }
    return `${files.length}:${(h >>> 0).toString(36)}`
}

function toBase64(bytes: Uint8Array): string {
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
}

/**
 * 0.1d: how a project's files become what is built (the playground wraps its one file: playground.ts), and how a
 * problem's place maps back to the file the user edits.
 */
export type ProjectOptions = {
    prepare?: (files: BuildFile[]) => { files: BuildFile[]; map?: (p: DevProblem) => DevProblem }
}
export type BuildFile = { path: string; text?: string; base64?: string }

export function createProject(sdk: WidgetSdk, opts: ProjectOptions = {}) {
    const dev: WidgetDev | undefined = sdk.dev?.()
    const s = reactive({
        id: '',
        name: '',
        /** '' while it lives in memory (a sample not saved yet). */
        folder: '',
        files: [] as PFile[],
        openTabs: [] as string[],
        active: '',
        errors: [] as DevProblem[],
        warnings: [] as DevProblem[],
        notes: [] as string[],
        building: false,
        /** The last run's build number (0: never ran), and when a build last succeeded. */
        build: 0,
        lastOkAt: 0,
        /** One line on what happened last (a build, a save, a watch). */
        status: '',
        statusOk: true,
        conflicts: [] as string[],
        logs: [] as LogLine[],
        reveal: null as Reveal | null,
        liveReload: true,
        /** 0.2.2: TypeScript formats a .ts / .js / .vue file (its scripts) before it's saved (the editor's formatter). */
        formatOnSave: false,
        watching: false,
        loading: false,
        /** The widget's id in entry.ts ('' when it can't be read), and whether a widget of that name is installed. */
        widgetId: '',
        installed: 'none' as DevInstalledState,
        installing: false,
        /** 0.1d: how many of its windows the last run reopened (the toolbar's playground opens one when none). */
        reopened: 0,
        /** 0.1.6: folders made in GEM Forge that have no file yet (the Explorer shows them). */
        dirs: [] as string[],
        /** 0.1.8: pinned tabs (shown first, kept when others close), rows of tabs (1–3), a file to show in the Explorer. */
        pinned: [] as string[],
        tabRows: 1,
        explorerReveal: null as { path: string; seq: number } | null,
        /** 0.1.9: the Explorer's selection (paths of files and folders). */
        selected: [] as string[],
        /** 0.1.11: text changed outside the editor (a replace, a rename's references): the editor follows. */
        textRev: 0,
        /** 0.1.11: the files opened lately (Go to file lists them first); the Search part asked to take the focus. */
        recent: [] as string[],
        searchFocus: null as { text: string; seq: number } | null,
        /** 0.2.1: TypeScript (lang.ts): off (none, or it failed), loading, ready; its problems in the file shown. */
        types: 'off' as 'off' | 'loading' | 'ready',
        /** 0.2.8: TypeScript has more to go on (the packages' types read): the file shown is checked again. */
        typesRev: 0,
        /** 0.2.9: what TypeScript is doing with the packages' types (reading, preparing, checking), '' when nothing. */
        typesNote: '',
        /** 0.2.10: Check all files: the checks chosen (kept with the project), and the last run's problems by file. */
        checks: ['typescript'] as string[],
        checked: { running: false, done: 0, total: 0, at: 0, files: [] as { path: string; items: DevProblem[] }[] },
        /** 0.2.12: files / folders left out of Check all (the Explorer's right-click; kept with the project). */
        checkSkip: [] as string[],
        /** 0.2.12: who formats (Format document, Format on save): TypeScript (.ts .js .vue's scripts) or Prettier. */
        formatter: 'typescript' as 'typescript' | 'prettier',
        /** 0.2.4: npm at work (the Packages part shows it; Problems' "＋ Add <name>" starts it too). */
        pkg: { busy: false, doing: '', started: 0, output: '' },
        /** 0.2.4: a part to show (Widget places it): Problems' "＋ Add" shows Packages. */
        showPart: null as { kind: string; seq: number } | null,
        typeProblems: { path: '', items: [] as DevProblem[] },
    })

    let stopWatch: (() => void) | null = null
    /** Each file's editor state (CodeMirror's: undo, selection), kept across the editor's remounts. */
    const editorStates = markRaw(new Map<string, unknown>())
    /** Cursors to put back after a restore (the editor reads them when it makes a file's state). */
    const cursors = markRaw(new Map<string, number>())
    /** The editor on screen, for the keys (commands.ts). */
    let editor: { exec(id: string): boolean; cursors(): Record<string, number> } | null = null
    let runTimer = 0
    let revealSeq = 0
    /** The last install build (without { project }), for these files. */
    let installBuild: { print: string; type: string; code: string } | null = null
    let pkgRev = 0   // 0.2.0: npm changed node_modules (the install build is made again)
    // CHANGED (0.1d): this project's console only (GEM Forge's playground is a project of its own)
    const offConsole = dev?.onConsole(m => { if (m.project === s.id) log(m.level, tidyStack(m.text, place), m.at) })
    // 0.2.5: the runs' source maps (the last few builds; the one being started, for a stack thrown as it mounts)
    const mappers = new Map<number, ReturnType<typeof createMapper>>()
    let starting: ReturnType<typeof createMapper> | null = null
    let latest: ReturnType<typeof createMapper> | null = null
    function place(build: number | null, line: number, column: number): string | null {
        const m = (build != null ? mappers.get(build) : undefined) ?? starting ?? latest
        const p = m?.(line, column)
        return p ? `${p.path}:${p.line}:${p.column}` : null
    }

    function log(level: string, text: string, at = Date.now()) {
        s.logs = [...s.logs.slice(-199), { level, text, time: new Date(at).toLocaleTimeString() }]
    }
    function say(text: string, ok = true) {
        s.status = text
        s.statusOk = ok
    }

    const file = (path: string) => s.files.find(f => f.path === path)
    const isDirty = (path: string) => { const f = file(path); return !!f && f.base64 === undefined && f.text !== f.saved }
    const dirtyPaths = () => s.files.filter(f => f.base64 === undefined && f.text !== f.saved).map(f => f.path)

    // ── Opening ─────────────────────────────────────────────────────────────────────────────────────────────────
    async function closeCurrent() {
        stopWatch?.()
        stopWatch = null
        s.watching = false
        if (s.id && s.build > 0) await dev?.end(s.id)
        window.clearTimeout(runTimer)
        Object.assign(s, { id: '', name: '', folder: '', files: [], openTabs: [], active: '', errors: [], warnings: [], notes: [],
            build: 0, lastOkAt: 0, conflicts: [], reveal: null, status: '', widgetId: '', installed: 'none', dirs: [], pinned: [], explorerReveal: null, selected: [],
            typeProblems: { path: '', items: [] }, typesNote: '', checked: { running: false, done: 0, total: 0, at: 0, files: [] }, checkSkip: [] })
        s.pkg.output = ''
        installBuild = null
        editorStates.clear()
        cursors.clear()
    }

    function showFirst() {
        const first = ['Widget.vue', 'entry.ts'].map(file).find(Boolean) ?? s.files.find(f => f.base64 === undefined)
        s.openTabs = first ? [first.path] : []
        s.active = first?.path ?? ''
    }

    /** A sample, in memory (Save as… puts it in a folder). */
    async function openSample(name: string, files: { path: string; text: string }[], id?: string) {
        await closeCurrent()
        s.name = name
        s.id = id && /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? id : projectIdOf(name)
        s.files = files.map(f => ({ path: f.path, text: f.text, saved: f.text }))
        showFirst()
        say(`${name}: a sample, in memory. Run it, or save it to a folder.`)
        if (s.liveReload) scheduleRun(0)
    }

    /** The folder's files (its subfolders too, the ignored ones left out), MAX_FILES at most. */
    async function listAll(folder: string): Promise<string[]> {
        const out: string[] = []
        async function walk(dir: string, rel: string, depth: number) {
            if (depth > 8 || out.length >= MAX_FILES) return
            for (const e of await listOne(dir)) {
                if (out.length >= MAX_FILES) return
                if (e.Hidden && e.Name.startsWith('.')) continue
                const r = rel ? `${rel}/${e.Name}` : e.Name
                if (e.Kind === 'dir') { if (!IGNORED.has(e.Name)) await walk(e.FullPath, r, depth + 1) }
                else if (e.Kind === 'file' && (TEXT_FILE.test(e.Name) || BINARY_FILE.test(e.Name))) out.push(r)
            }
        }
        await walk(folder, '', 0)
        return out
    }

    async function listOne(dir: string): Promise<ListingEntry[]> {
        if (!sdk.openListing) throw new Error('GEM Forge needs the Read permission to open a folder.')
        const src = sdk.openListing(dir)
        try {
            let snap = src.snapshot()
            if (snap.status === 'loading' || snap.version === 0) {
                await new Promise<void>((resolve) => {
                    const off = src.subscribe(n => {
                        if (n.status !== 'loading' && n.version > 0 || n.status === 'error' || n.status === 'closed') { off(); resolve() }
                    })
                    // subscribed after it finished: nothing more will come
                    const now = src.snapshot()
                    if (now.status !== 'loading' && now.version > 0 || now.status === 'error') { off(); resolve() }
                })
                snap = src.snapshot()
            }
            if (snap.status === 'error') throw new Error(snap.error?.message ?? `${dir} can't be read.`)
            return snap.total > 0 ? await src.rows(0, snap.total) : []
        } finally {
            src.close()
        }
    }

    async function readOne(folder: string, rel: string): Promise<PFile> {
        const full = joinPath(folder, rel)
        if (BINARY_FILE.test(rel)) {
            if (!sdk.fsReadBytes) throw new Error('GEM Forge needs the Read permission.')
            const blob = await sdk.fsReadBytes(full, { maxBytes: MAX_BINARY })
            return { path: rel, text: '', saved: '', base64: toBase64(new Uint8Array(await blob.arrayBuffer())) }
        }
        if (!sdk.fsReadText) throw new Error('GEM Forge needs the Read permission.')
        const raw = (await sdk.fsReadText(full, { maxBytes: MAX_TEXT })).text
        const bom = raw.charCodeAt(0) === 0xfeff
        const text = (bom ? raw.slice(1) : raw).replace(/\r\n/g, '\n')
        return { path: rel, text, saved: text, bom, crlf: raw.includes('\r\n') }
    }

    /** A project folder: read, watched, run. */
    async function openFolder(folder: string) {
        await closeCurrent()
        s.loading = true
        try {
            const paths = await listAll(folder)
            const files: PFile[] = []
            for (const p of paths) {
                try { files.push(await readOne(folder, p)) }
                catch (err) { log('warn', `${p}: not read (${String((err as Error)?.message ?? err)})`) }
            }
            s.folder = folder
            s.name = baseName(folder)
            s.id = projectIdOf(s.name)
            s.files = files
            showFirst()
            say(paths.length >= MAX_FILES ? `${s.name}: the first ${MAX_FILES} files.` : `${s.name}: ${files.length} files.`)
            if (!files.some(f => f.path === 'entry.ts')) say(`${s.name} has no entry.ts: not a widget project yet (New project makes one).`, false)
            await startWatch()
            void refreshInstalled()
            if (s.liveReload && file('entry.ts')) scheduleRun(0)
        } catch (err) {
            say(`Not opened: ${String((err as Error)?.message ?? err)}`, false)
        } finally {
            s.loading = false
        }
    }

    // ── The folder watch: what an AI (or another editor) writes ────────────────────────────────────────────────
    async function startWatch() {
        if (!dev || !s.folder) return
        const r = await dev.watch(s.folder, e => void onDisk(e.changes, e.overflow))
        if (r.ok) { stopWatch = r.stop; s.watching = true }
        else log('warn', `Not watching ${s.folder}: ${r.error}`)
    }

    async function onDisk(changes: DevChange[], overflow: boolean) {
        if (!s.folder) return
        const folder = s.folder
        let touched = false
        const list = overflow ? (await listAll(folder)).map(path => ({ path, kind: 'changed' as const })) : changes
        for (const c of list) {
            if (!TEXT_FILE.test(c.path) && !BINARY_FILE.test(c.path)) continue
            const mine = file(c.path)
            if (c.kind === 'deleted') {
                if (!mine) continue
                if (isDirty(c.path)) { addConflict(c.path); continue }
                s.files = s.files.filter(f => f.path !== c.path)
                s.openTabs = s.openTabs.filter(p => p !== c.path)
                if (s.active === c.path) s.active = s.openTabs[0] ?? ''
                log('info', `${c.path}: deleted on disk`)
                touched = true
                continue
            }
            let fresh: PFile
            try { fresh = await readOne(folder, c.path) } catch { continue }   // mid-write, or gone again
            if (folder !== s.folder) return
            if (!mine) {
                if (s.files.length >= MAX_FILES) continue
                s.files = [...s.files, fresh].sort((a, b) => a.path.localeCompare(b.path))
                log('info', `${c.path}: added on disk`)
                touched = true
                continue
            }
            if (mine.base64 !== undefined) { if (mine.base64 !== fresh.base64) { mine.base64 = fresh.base64; touched = true } continue }
            if (fresh.text === mine.saved) continue                   // our own save, or nothing new
            if (isDirty(c.path) && fresh.text !== mine.text) { mine.saved = fresh.text; addConflict(c.path); continue }
            mine.text = fresh.text
            mine.saved = fresh.text
            mine.bom = fresh.bom
            mine.crlf = fresh.crlf
            log('info', `${c.path}: changed on disk`)
            touched = true
        }
        if (touched && s.liveReload) scheduleRun()
    }

    function addConflict(path: string) {
        if (!s.conflicts.includes(path)) s.conflicts = [...s.conflicts, path]
        say(`${path} changed on disk while you edited it here: keep yours, or take the disk's.`, false)
    }
    /** Your edits stay (Save writes them over the disk's). */
    function keepMine(path: string) {
        s.conflicts = s.conflicts.filter(p => p !== path)
    }
    /** The disk's version replaces your edits. */
    async function takeDisk(path: string) {
        s.conflicts = s.conflicts.filter(p => p !== path)
        const f = file(path)
        if (!f || !s.folder) return
        try {
            const fresh = await readOne(s.folder, path)
            f.text = fresh.text
            f.saved = fresh.text
            f.bom = fresh.bom
            f.crlf = fresh.crlf
        } catch {
            s.files = s.files.filter(x => x.path !== path)     // it was deleted
            s.openTabs = s.openTabs.filter(p => p !== path)
        }
        if (s.liveReload) scheduleRun()
    }

    // ── Editing and saving ──────────────────────────────────────────────────────────────────────────────────────
    function setText(path: string, text: string) {
        const f = file(path)
        if (f && f.base64 === undefined) f.text = text
    }
    function open(path: string, at?: { line: number; column: number }) {
        if (!file(path)) return
        s.recent = [path, ...s.recent.filter(p => p !== path)].slice(0, 30)
        if (!s.openTabs.includes(path)) s.openTabs = [...s.openTabs, path]
        s.active = path
        if (at) s.reveal = { path, line: at.line, column: at.column, seq: ++revealSeq }
    }
    function closeTab(path: string) {
        closeTabs([path])
    }

    // ── Tabs (0.1.8): pinned first, closing several, order, rows ─────────────────────────────────────────────────
    /** The open tabs as shown: pinned first (in their order), then the others. */
    function orderedTabs(): string[] {
        const pinned = s.openTabs.filter(p => s.pinned.includes(p))
        return [...pinned, ...s.openTabs.filter(p => !s.pinned.includes(p))]
    }
    /** These tabs closed (pinned ones only when named alone); the active one moves to a neighbour. */
    function closeTabs(paths: string[]) {
        const gone = new Set(paths)
        const before = orderedTabs()
        s.openTabs = s.openTabs.filter(p => !gone.has(p))
        s.pinned = s.pinned.filter(p => !gone.has(p))
        if (gone.has(s.active)) {
            const i = before.indexOf(s.active)
            const left = before.slice(0, i).reverse().find(p => !gone.has(p))
            const right = before.slice(i + 1).find(p => !gone.has(p))
            s.active = right ?? left ?? ''
        }
    }
    function closeOthers(path: string) { closeTabs(orderedTabs().filter(p => p !== path && !s.pinned.includes(p))) }
    function closeToTheRight(path: string) {
        const t = orderedTabs()
        closeTabs(t.slice(t.indexOf(path) + 1).filter(p => !s.pinned.includes(p)))
    }
    function closeSaved() { closeTabs(orderedTabs().filter(p => !isDirty(p) && !s.pinned.includes(p))) }
    function togglePin(path: string) {
        s.pinned = s.pinned.includes(path) ? s.pinned.filter(p => p !== path) : [...s.pinned, path]
    }
    /** A drag's result: the tabs in this order (pinned ones stay first). */
    function reorderTabs(order: string[]) {
        const known = order.filter(p => s.openTabs.includes(p))
        s.openTabs = [...known, ...s.openTabs.filter(p => !known.includes(p))]
        s.pinned = known.filter(p => s.pinned.includes(p))
    }
    function setTabRows(n: number) { s.tabRows = Math.min(3, Math.max(1, Math.round(n) || 1)) }
    /** The Explorer unfolds to <path> and shows it. */
    let exploreSeq = 0
    function revealInExplorer(path: string) { s.explorerReveal = { path, seq: ++exploreSeq } }

    /** 0.2.2: formats a file before it's saved (the editor sets it: TypeScript's, applied in the editor). */
    let formatter: ((path: string) => Promise<void>) | null = null
    function setFormatter(fn: ((path: string) => Promise<void>) | null) { formatter = fn }

    async function save(path = s.active): Promise<boolean> {
        const f = file(path)
        if (!f || f.base64 !== undefined) return false
        if (!s.folder) { say('A sample lives in memory: Save to a folder… first.', false); return false }
        if (!sdk.fsWriteText) { say('GEM Forge needs the Write permission to save.', false); return false }
        if (s.formatOnSave && formatter) {
            try { await formatter(path) } catch (err) { log('warn', `${path}: not formatted (${String((err as Error)?.message ?? err)})`) }
        }
        try {
            const text = f.text
            await sdk.fsWriteText(joinPath(s.folder, path), f.crlf ? text.replace(/\n/g, '\r\n') : text, { overwrite: true, bom: !!f.bom })
            f.saved = text
            s.conflicts = s.conflicts.filter(p => p !== path)
            say(`${path} saved.`)
            if (s.liveReload) scheduleRun()
            return true
        } catch (err) {
            say(`${path}: not saved (${String((err as Error)?.message ?? err)})`, false)
            return false
        }
    }
    async function saveAll(): Promise<void> {
        for (const p of dirtyPaths()) if (!(await save(p))) return
    }

    /** The sample (or project) written to a folder the user picks; then it's that folder's project. */
    async function saveToFolder(): Promise<boolean> {
        const folder = await sdk.ui?.().pickFolder({ title: 'Save the project in this folder', access: 'write', acceptLabel: 'Save here' })
        if (!folder || !sdk.fsWriteText) return false
        try {
            for (const f of s.files) {
                if (f.base64 !== undefined) continue
                // A sample's files take the system's line ends (CR LF on Windows)
                const crlf = f.crlf ?? sepOf(folder) === '\\'
                await sdk.fsWriteText(joinPath(folder, f.path), crlf ? f.text.replace(/\n/g, '\r\n') : f.text, { overwrite: false, bom: !!f.bom })
            }
        } catch (err) {
            say(`Not saved there: ${String((err as Error)?.message ?? err)} (a file of the same name may be there already).`, false)
            return false
        }
        await openFolder(folder)
        return true
    }

    // ── Running ─────────────────────────────────────────────────────────────────────────────────────────────────
    function scheduleRun(ms = 300) {
        window.clearTimeout(runTimer)
        runTimer = window.setTimeout(() => void run(), ms)
    }

    /** Built and run as dev-<id>; the problems listed. false: not built (the last good build keeps running). */
    let broken = false
    // 0.2.13: the texts the last build had: its problems in a file edited since are stale (Problems hides them)
    let builtTexts = new Map<string, string>()
    const keepBuilt = (files: { path: string; text?: string }[]) => { builtTexts = new Map(files.filter(f => f.text !== undefined).map(f => [f.path, f.text!])) }
    /** 0.2.13: a build's problem in a file edited since that build. */
    function isStale(p: DevProblem): boolean {
        const f = p.file ? file(p.file) : undefined
        return !!f && builtTexts.has(f.path) && builtTexts.get(f.path) !== f.text
    }
    async function run(): Promise<boolean> {
        if (!dev || !s.id || s.building) { if (s.building) scheduleRun(); return false }
        s.building = true
        try {
            const prep = opts.prepare ? opts.prepare(buildFiles()) : { files: buildFiles() }
            const built = buildFiles()
            const r = await dev.build(prep.files, { project: s.id, packagesFrom: packagesFrom() })
            keepBuilt(built)
            s.errors = prep.map ? r.errors.map(prep.map) : r.errors
            s.warnings = prep.map ? r.warnings.map(prep.map) : r.warnings
            s.notes = r.notes
            if (!r.code) {
                say(`Not built: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}${s.build ? ' (the last good build still runs)' : ''}.`, false)
                // 0.2.4: once per broken streak (live reload builds at every pause): the preview isn't this version
                if (s.build && !broken) sdk.ui?.().snack({ text: 'This version doesn\'t build: the preview still runs the last one that did (see Problems).', timeoutMs: 6000 })
                broken = true
                return false
            }
            broken = false
            starting = r.sourceMap ? createMapper(r.sourceMap, path => file(path)?.text) : null
            const ran = await dev.run(s.id, r.code)
            const mapper = starting
            starting = null
            if (!ran.ok) { say(`Not run: ${ran.error}`, false); return false }
            latest = mapper
            if (mapper) mappers.set(ran.build, mapper)
            for (const b of [...mappers.keys()]) if (b < ran.build - 3) mappers.delete(b)
            s.build = ran.build
            s.reopened = ran.reopened
            s.lastOkAt = Date.now()
            say(`Built in ${r.ms} ms and running (build ${ran.build}${r.warnings.length ? `, ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}` : ''}).`)
            return true
        } finally {
            s.building = false
        }
    }

    /** The project's files as one text (Copy for AI), or its problems and console (Copy problems). */
    function asText(what: 'files' | 'problems'): string {
        if (what === 'problems') {
            const p = [...s.errors.map(e => `error ${e.file}:${e.line}:${e.column} ${e.text}`), ...s.warnings.map(w => `warning ${w.file}:${w.line}:${w.column} ${w.text}`)]
            return [`GEM Forge project ${s.name} (${s.id}): problems`, ...p, '', 'Console:', ...s.logs.map(l => `[${l.level}] ${l.text}`)].join('\n')
        }
        const parts = s.files.filter(f => f.base64 === undefined && f.path !== 'widgets-sdk.d.ts').map(f => `===== ${f.path} =====\n${f.text}`)
        if (file('widgets-sdk.d.ts')) parts.push('(widgets-sdk.d.ts, the SDK\'s typings, is in the project folder: left out here.)')
        return parts.join('\n\n')
    }

    // ── Kept while away (the lifecycle) ─────────────────────────────────────────────────────────────────────────
    function snapshot(): Session | null {
        if (!s.id) return null
        const live = editor?.cursors() ?? {}
        const cur: Record<string, number> = {}
        for (const p of s.openTabs) { const c = live[p] ?? cursors.get(p); if (typeof c === 'number') cur[p] = c }
        const unsaved: Record<string, string> = {}
        if (s.folder) for (const p of dirtyPaths()) unsaved[p] = file(p)!.text
        return {
            folder: s.folder, name: s.name, id: s.folder ? undefined : s.id,
            files: s.folder ? null : s.files.filter(f => f.base64 === undefined).map(f => ({ path: f.path, text: f.text, saved: f.saved })),
            unsaved, openTabs: [...s.openTabs], active: s.active, liveReload: s.liveReload, formatOnSave: s.formatOnSave, checks: [...s.checks], checkSkip: [...s.checkSkip], formatter: s.formatter, cursors: cur,
            pinned: s.pinned.filter(p => s.openTabs.includes(p)), tabRows: s.tabRows,
        }
    }

    /** A snapshot back: the folder read again (or the sample), the unsaved edits on top, the tabs and cursors. */
    async function restore(v: Session | null | undefined) {
        if (!v || typeof v !== 'object') return
        s.liveReload = v.liveReload !== false
        s.formatOnSave = v.formatOnSave === true
        if (Array.isArray(v.checks)) s.checks = v.checks.filter(c => typeof c === 'string').slice(0, 8)
        s.formatter = v.formatter === 'prettier' ? 'prettier' : 'typescript'
        if (v.folder) await openFolder(v.folder)
        else if (Array.isArray(v.files)) {
            const files = v.files.filter(f => typeof f?.path === 'string' && typeof f?.text === 'string')
            // A sample's edits: what it held before them (an older snapshot has no saved: its text counts as saved)
            await openSample(v.name || 'Sample', files.map(f => ({ path: f.path, text: typeof f.saved === 'string' ? f.saved : f.text })), v.id)
            for (const f of files) { const mine = file(f.path); if (mine) mine.text = f.text }
        }
        else return
        for (const [p, text] of Object.entries(v.unsaved ?? {})) { const f = file(p); if (f && typeof text === 'string') f.text = text }
        const tabs = (Array.isArray(v.openTabs) ? v.openTabs : []).filter(p => !!file(p))
        if (tabs.length) s.openTabs = tabs
        s.pinned = (Array.isArray(v.pinned) ? v.pinned : []).filter(p => s.openTabs.includes(p))
        setTabRows(Number(v.tabRows) || 1)
        if (v.active && file(v.active)) s.active = v.active
        for (const [p, c] of Object.entries(v.cursors ?? {})) if (typeof c === 'number') cursors.set(p, c)
        s.checkSkip = (Array.isArray(v.checkSkip) ? v.checkSkip : []).filter(p => typeof p === 'string').slice(0, 200)
        if (dirtyPaths().length) say(`${s.name}: your unsaved edits are back (not saved yet).`)
    }

    /** Every unsaved edit dropped: each file back to what it holds on disk (or the sample's text). */
    function discardAll() {
        for (const f of s.files) if (f.base64 === undefined && f.text !== f.saved) f.text = f.saved
        s.conflicts = []
        s.textRev++
    }

    // ── New project, install (0.1c) ─────────────────────────────────────────────────────────────────────────────
    /** The files sent to the build. */
    function buildFiles() {
        return s.files.filter(f => isBuilt(f.path)).map(f => (f.base64 !== undefined ? { path: f.path, base64: f.base64 } : { path: f.path, text: f.text }))
    }

    /** <files> written in <folder> (an empty one: the user picked or made it), then opened. false: not made (said why). */
    async function createAt(folder: string, files: { path: string; text: string }[]): Promise<boolean> {
        if (!sdk.fsWriteText) { say('This GEM Shell can\'t write files for GEM Forge.', false); return false }
        try {
            if ((await listAll(folder)).length) {
                say(`${baseName(folder)} isn't empty: pick an empty folder for a new project (or Open a folder… to open it).`, false)
                return false
            }
        } catch (err) {
            say(`Not read: ${String((err as Error)?.message ?? err)}`, false)
            return false
        }
        const crlf = sepOf(folder) === '\\'
        try {
            for (const f of files) await sdk.fsWriteText(joinPath(folder, f.path), crlf ? f.text.replace(/\n/g, '\r\n') : f.text, { overwrite: false })
        } catch (err) {
            say(`Not made in ${folder}: ${String((err as Error)?.message ?? err)}`, false)
            return false
        }
        await openFolder(folder)
        return true
    }

    /**
     * 0.1d, Export .zip…: the project's files (as they are in GEM Forge, unsaved edits included; their line ends and
     * byte order marks as on disk) in a .zip archive the user saves: a folder named after the project. For an AI:
     * everything in one file. TODO (GEM Shell archives): GEM Forge makes the archive itself today (zip.ts, the
     * browser's deflate); move to GEM Shell's archive API once it exists.
     */
    async function exportZip(): Promise<void> {
        const ui = sdk.ui?.()
        if (!ui || !sdk.fsWriteBytes || !s.files.length) return
        const path = await ui.saveFile({ title: 'Export the project as a .zip archive', suggestedName: `${s.id || 'project'}.zip`, filters: [{ label: 'Zip archive', extensions: ['zip'] }] })
        if (!path) return
        try {
            const enc = new TextEncoder()
            const root = s.id || 'project'
            const entries = s.files.map(f => {
                if (f.base64 !== undefined) return { path: `${root}/${f.path}`, data: Uint8Array.from(atob(f.base64), c => c.charCodeAt(0)) }
                const text = (f.bom ? '\ufeff' : '') + (f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
                return { path: `${root}/${f.path}`, data: enc.encode(text) }
            })
            const zip = await zipFiles(entries)
            await sdk.fsWriteBytes(path, zip, { overwrite: true })
            const unsaved = dirtyPaths().length
            say(`Exported ${entries.length} files to ${path} (${Math.ceil(zip.length / 1024)} KB)${unsaved ? `, your ${unsaved} unsaved edit${unsaved === 1 ? '' : 's'} included` : ''}.`)
        } catch (err) {
            say(`Not exported: ${String((err as Error)?.message ?? err)}`, false)
        }
    }

    // ── New file / New folder (0.1.6: the Explorer's right-click on a folder or the project's name) ──────────────
    const NAME = /^[^\\/:*?"<>|]{1,120}$/
    const checkName = (n: string) => (!n.trim() ? 'A name is needed.' : !NAME.test(n.trim()) || /^\.+$/.test(n.trim()) ? 'Not a valid name (no \\ / : * ? " < > |).' : null)

    /** A new empty file <name> in folder <dir> ('' = the project's), opened. */
    // ── Names, rename, delete, duplicate (0.1.9) ───────────────────────────────────────────────────────────────────
    let tokens: NamingToken[] | null = null
    async function namingTokens(): Promise<NamingToken[] | null> {
        if (!tokens) { try { tokens = (await sdk.ui?.().namingPattern?.()) ?? null } catch { tokens = null } }
        return tokens
    }
    /** The names in folder <dir> (files and folders, lower-case). */
    function namesIn(dir: string): Set<string> {
        const pre = dir ? `${dir}/` : ''
        const out = new Set<string>()
        for (const p of [...s.files.map(f => f.path), ...s.dirs]) {
            if (!p.startsWith(pre)) continue
            out.add(p.slice(pre.length).split('/')[0].toLowerCase())
        }
        return out
    }
    /** <name> in <dir>, or the user's naming pattern's next free one ("Untitled (2).vue"). */
    async function freeNameIn(dir: string, name: string, isFolder = false): Promise<string> {
        return freeName(name.trim(), namesIn(dir), await namingTokens(), isFolder)
    }

    /** The files whose imports point to <rel>, rewritten for <to> (smart rename). */
    function renamePlan(rel: string, to: string): RenameEdit[] {
        return referencesTo(s.files.filter(f => f.base64 === undefined && TEXT_FILE.test(f.path)), rel, to)
    }

    /** <rel> renamed to <newName> (same folder; <asPath>: newName is the whole new path); <edits>: the references to update (saved unless already edited). */
    // ── Undo (0.1.12): a rename's or a move's references, a Replace all: GEM Shell's snackbar with Undo ─────────────
    type Before = { path: string; text: string; saved: string }
    /** <b>'s file back to what it was: its saved text written again when it was saved since, then its edit. */
    async function restoreFile(b: Before) {
        const g = file(b.path)
        if (!g) return
        if (g.saved !== b.saved && s.folder) { g.text = b.saved; await save(b.path) }
        g.text = b.text
    }
    function offerUndo(text: string, undo: () => Promise<void>) {
        void sdk.ui?.().snack({
            text, timeoutMs: 10000,
            actions: [{ label: 'Undo', onClick: async () => { await undo(); s.textRev++; say('Undone.') } }],
        })
    }
    const before = (paths: string[]): Before[] => paths.map(p => file(p)).filter(Boolean).map(g => ({ path: g!.path, text: g!.text, saved: g!.saved }))

    /**
     * <rel> renamed to <newName>; <edits>: the references to update (saved unless already edited). Returns how to undo
     * it (null: not renamed). <quiet>: no message, no snackbar (an undo, a move of several).
     */
    async function renameFile(rel: string, newName: string, edits: RenameEdit[] = [], asPath = false, quiet = false): Promise<(() => Promise<void>) | null> {
        const f = file(rel)
        if (!f) return null
        const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
        const to = asPath ? newName : (dir ? `${dir}/` : '') + newName.trim()
        if (to === rel) return null
        if (file(to)) { say(`${to} is already there.`, false); return null }
        if (s.folder) {
            const r = await sdk.fsRename?.(joinPath(s.folder, rel), joinPath(s.folder, to))
            if (!r?.ok) { say(`Not renamed: ${r?.error ?? 'GEM Shell can\'t rename for GEM Forge here.'}`, false); return null }
        }
        f.path = to
        const swap = (p: string) => (p === rel ? to : p)
        s.openTabs = s.openTabs.map(swap)
        s.pinned = s.pinned.map(swap)
        s.conflicts = s.conflicts.map(swap)
        if (s.active === rel) s.active = to
        if (editorStates.has(rel)) { editorStates.set(to, editorStates.get(rel)); editorStates.delete(rel) }
        if (cursors.has(rel)) { cursors.set(to, cursors.get(rel)!); cursors.delete(rel) }
        // The references: rewritten; saved when they had no edit of their own
        const prev = before(edits.map(e => e.path))
        let saved = 0
        for (const e of edits) {
            const g = file(e.path)
            if (!g) continue
            const wasClean = g.text === g.saved
            g.text = e.text
            if (wasClean && s.folder && await save(e.path)) saved++
        }
        s.textRev++
        s.recent = s.recent.map(swap)
        s.selected = s.selected.map(swap)
        const n = edits.reduce((a, e) => a + e.count, 0)
        if (s.liveReload && file('entry.ts')) scheduleRun(0)
        const undo = async () => {
            await renameFile(to, rel, [], true, true)
            for (const b of prev) await restoreFile(b)
        }
        if (!quiet) {
            const text = `Renamed to ${to}${n ? `; ${n} reference${n === 1 ? '' : 's'} in ${edits.length} file${edits.length === 1 ? '' : 's'} updated${saved < edits.length ? ' (the ones you were editing: not saved yet)' : ''}` : ''}.`
            say(text)
            if (n) offerUndo(text, undo)
        }
        return undo
    }

    /** These files (and folders) to the Recycle Bin: GEM Shell asks first. */
    async function deletePaths(rels: string[]): Promise<void> {
        if (!rels.length) return
        const under = (p: string) => rels.some(r => p === r || p.startsWith(`${r}/`))
        if (s.folder) {
            if (!sdk.fsDelete) { say('This GEM Shell can\'t delete for GEM Forge.', false); return }
            try { await sdk.fsDelete(rels.map(r => joinPath(s.folder, r))) } catch (err) {
                say(`Not deleted: ${String((err as Error)?.message ?? err)}`, false)
            }
            // What is really gone (the question may have been cancelled)
            const gone: string[] = []
            for (const f of s.files.filter(x => under(x.path))) {
                try { await sdk.fsReadText!(joinPath(s.folder, f.path)) } catch { gone.push(f.path) }
            }
            dropFiles(gone)
            s.dirs = s.dirs.filter(d => !under(d) || s.files.some(f => f.path.startsWith(`${d}/`)))
        } else {
            dropFiles(s.files.filter(x => under(x.path)).map(x => x.path))
        }
    }
    function dropFiles(paths: string[]) {
        if (!paths.length) return
        const gone = new Set(paths)
        closeTabs(paths)
        s.files = s.files.filter(f => !gone.has(f.path))
        s.conflicts = s.conflicts.filter(p => !gone.has(p))
        for (const p of paths) { editorStates.delete(p); cursors.delete(p) }
        if (s.liveReload && file('entry.ts')) scheduleRun(0)
    }

    /** A copy beside each (GEM Shell's copy: the naming pattern names it). */
    async function duplicatePaths(rels: string[]): Promise<void> {
        if (!s.folder || !sdk.fsCopy || !rels.length) return
        try { await sdk.fsCopy(rels.map(r => ({ from: joinPath(s.folder, r), to: joinPath(s.folder, r) }))) } catch (err) {
            say(`Not duplicated: ${String((err as Error)?.message ?? err)}`, false)
        }
    }

    async function createFile(dir: string, name: string): Promise<boolean> {
        // CHANGED (0.1.9): a taken name gets the user's naming pattern ("Untitled (2).vue")
        const rel = (dir ? `${dir}/` : '') + await freeNameIn(dir, name)
        if (s.folder) {
            try { await sdk.fsWriteText!(joinPath(s.folder, rel), '', { overwrite: false }) } catch (err) {
                say(`Not made: ${String((err as Error)?.message ?? err)}`, false)
                return false
            }
        }
        const crlf = s.files.some(f => f.crlf)
        s.files = [...s.files, { path: rel, text: '', saved: '', crlf, bom: false }]
        s.dirs = s.dirs.filter(d => !rel.startsWith(`${d}/`))
        open(rel)
        return true
    }

    /** A new folder <name> in <dir>: shown in the Explorer until it has files. */
    async function createFolder(dir: string, name: string): Promise<boolean> {
        const rel = (dir ? `${dir}/` : '') + await freeNameIn(dir, name, true)
        if (s.folder) {
            try { await sdk.fsMkdir?.(joinPath(s.folder, rel)) } catch (err) {
                say(`Not made: ${String((err as Error)?.message ?? err)}`, false)
                return false
            }
        }
        s.dirs = [...s.dirs, rel]
        return true
    }

    /** 0.1.11: texts set from outside the editor (Replace all): path -> text; the editor follows. */
    function setTexts(texts: Record<string, string>) {
        for (const [p, t] of Object.entries(texts)) { const f = file(p); if (f && f.base64 === undefined) f.text = t }
        s.textRev++
    }
    let searchSeq = 0
    function focusSearch(text = '') { s.searchFocus = { text, seq: ++searchSeq } }

    /** <rels> moved into folder <toDir> ('' = the project's), their references updated (0.1.11, the Explorer's drag). */
    async function moveFiles(rels: string[], toDir: string): Promise<void> {
        const undos: (() => Promise<void>)[] = []
        for (const rel of rels) {
            const f = file(rel)
            const name = rel.split('/').pop()!
            const to = (toDir ? `${toDir}/` : '') + name
            if (!f || to === rel || (toDir + '/').startsWith(rel + '/')) continue
            if (file(to)) { say(`${to} is already there: ${rel} stays.`, false); continue }
            const edits = referencesTo(s.files.filter(x => x.base64 === undefined && TEXT_FILE.test(x.path)), rel, to)
            // The moved file's own relative imports change too: rewritten from its new place
            const own = f.base64 === undefined ? rewriteOwnImports(f.text, rel, to) : null
            const mine = { text: f.text, saved: f.saved }
            const undo = await renameFile(rel, to, edits, true, true)
            if (!undo) continue
            const g = file(to)
            let ownChanged = false
            if (g && own !== null && own !== g.text) {
                const wasClean = g.text === g.saved
                g.text = own
                s.textRev++
                if (wasClean && s.folder) await save(to)
                ownChanged = true
            }
            // Undo: its own text back (at its new place), then the rename and the references back
            undos.push(async () => {
                if (ownChanged) await restoreFile({ path: to, ...mine })
                await undo()
            })
        }
        if (undos.length) {
            const text = `${undos.length} moved to ${toDir || s.name}; their imports follow.`
            say(text)
            offerUndo(text, async () => { for (const u of [...undos].reverse()) await u() })
        }
    }

    /** Replace all (the Search part): these texts, with an Undo. */
    /** Replace all (0.1.12), and Rename symbol (0.2.6: <message>): the new texts, with the Undo snackbar. */
    function replaceTexts(texts: Record<string, string>, count: number, message?: string) {
        const prev = before(Object.keys(texts))
        setTexts(texts)
        const text = message ?? `${count} replaced in ${prev.length} file${prev.length === 1 ? '' : 's'} (not saved yet: Save all saves them).`
        say(text)
        offerUndo(text, async () => { for (const b of prev) await restoreFile(b) })
    }

    /** A file's full path (a folder project), or ''. */
    const pathOf = (rel: string) => (s.folder ? (rel ? joinPath(s.folder, rel) : s.folder) : '')

    /** entry.ts's id, and whether it's installed (the Widget ▾ menu). */
    async function refreshInstalled() {
        const m = /\bid\s*:\s*['"]([a-z0-9-]+)['"]/.exec(file('entry.ts')?.text ?? '')
        s.widgetId = m?.[1] ?? ''
        s.installed = s.widgetId && dev?.installed ? await dev.installed(s.widgetId) : 'none'
    }

    /** Built as the widget it will be (its own id), kept while the files don't change. */
    async function buildForInstall(): Promise<{ type: string; code: string } | null> {
        if (!dev) return null
        const files = buildFiles()
        const from = packagesFrom()
        const print = `${fingerprint(files)}:${pkgRev}:${from ?? ''}`
        if (installBuild?.print === print) return installBuild
        const r = await dev.build(files, { packagesFrom: from })
        keepBuilt(files)
        s.errors = r.errors
        s.warnings = r.warnings
        if (!r.code || !r.type) {
            say(`Not installed: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'} (the Problems part lists them).`, false)
            return null
        }
        installBuild = { print, type: r.type, code: r.code }
        return installBuild
    }

    // ── npm packages (0.2.0: the Packages part; sdk.dev().packages runs Node's npm) ────────────────────────────────
    /** The folder whose node_modules the build bundles from: its package.json lists dependencies. */
    function packagesFrom(): string | undefined {
        const text = s.folder ? file('package.json')?.text : undefined
        if (!text) return undefined
        try {
            const deps = JSON.parse(text)?.dependencies
            return deps && typeof deps === 'object' && Object.keys(deps).length ? s.folder : undefined
        } catch {
            return undefined
        }
    }

    /** <path> read again from the folder (npm wrote it): taken unless you edited it here (then: keep yours or the disk's). */
    async function reloadFile(path: string) {
        if (!s.folder) return
        let fresh: PFile
        try { fresh = await readOne(s.folder, path) } catch { return }
        const mine = file(path)
        if (!mine) { s.files = [...s.files, fresh].sort((a, b) => a.path.localeCompare(b.path)); return }
        if (fresh.text === mine.saved) return
        if (isDirty(path)) { mine.saved = fresh.text; addConflict(path); return }
        mine.text = fresh.text
        mine.saved = fresh.text
        mine.bom = fresh.bom
        mine.crlf = fresh.crlf
    }

    /** package.json there and saved before npm writes in it: a minimal one made when missing. false: not (said why). */
    async function ensurePackageJson(): Promise<boolean> {
        if (!s.folder) { say('Packages need a project folder (New ▾ or Open a folder…).', false); return false }
        if (file('package.json')) return isDirty('package.json') ? await save('package.json') : true
        if (!sdk.fsWriteText) { say('This GEM Shell can\'t write files for GEM Forge.', false); return false }
        const text = JSON.stringify({ name: s.id || 'widget', version: '0.0.0', private: true, dependencies: {} }, null, 2) + '\n'
        try {
            await sdk.fsWriteText(joinPath(s.folder, 'package.json'), sepOf(s.folder) === '\\' ? text.replace(/\n/g, '\r\n') : text, { overwrite: false })
        } catch (err) {
            say(`package.json not made: ${String((err as Error)?.message ?? err)}`, false)
            return false
        }
        await reloadFile('package.json')
        return true
    }

    /** 0.2.4: npm, for the Packages part and Problems' "＋ Add <name>" (a click: GEM Shell asks first). */
    async function packagesOp(kind: 'install' | 'add' | 'remove', list: string[] = []): Promise<boolean> {
        if (!dev?.packages) { say('This GEM Shell has no npm packages yet.', false); return false }
        if (s.pkg.busy) { say('npm is already working: wait for it.', false); return false }
        Object.assign(s.pkg, {
            busy: true, output: '', started: Date.now(),
            doing: kind === 'remove' ? `Removing ${list.join(', ')}` : kind === 'add' ? `Downloading ${list.join(', ')}` : 'Installing the packages',
        })
        try {
            // package.json made (a minimal one) or saved first: npm writes in it
            if (!(await ensurePackageJson())) return false
            const r = await dev.packages(kind, s.folder, list)
            s.pkg.output = (r.output ?? '').trim()
            if (r.ok) {
                say(kind === 'remove' ? `Removed: ${list.join(', ')}.` : kind === 'add' ? `Added: ${list.join(', ')}. Import it in your code.` : 'Packages installed.')
                await reloadFile('package.json')
                packagesChanged()
                return true
            }
            if (!r.cancelled) say(`npm: ${r.error}`, false)
            return false
        } finally {
            s.pkg.busy = false
        }
    }
    /** 0.2.4: Problems' "＋ Add <name>": the Packages part shown, npm adds it. */
    function addPackage(name: string) {
        showPart('packages')
        void packagesOp('add', [name])
    }
    let partSeq = 0
    function showPart(kind: string) { s.showPart = { kind, seq: ++partSeq } }

    /** npm changed the packages: built again (the running one and the next install). */
    function packagesChanged() {
        pkgRev++
        installBuild = null
        if (s.liveReload && file('entry.ts')) scheduleRun(0)
    }

    /** Install / Update (right after the user's click: GEM Shell asks first). */
    async function install(): Promise<void> {
        if (!dev || s.installing) return
        s.installing = true
        const t0 = performance.now()
        try {
            const b = await buildForInstall()
            if (!b) return
            if (performance.now() - t0 > 4000) {
                say(`Built as ${b.type}: click Install again to install it (GEM Shell asks right after your click).`)
                return
            }
            const r = await dev.install(b.type, b.code)
            if (r.ok) say(r.replaced ? `${r.type} updated: its copies on screen restarted with this version.` : `${r.type} installed: it's in Add widget, marked "yours".`)
            else say(r.cancelled ? 'Not installed.' : `Not installed: ${r.error}`, !!r.cancelled)
        } finally {
            s.installing = false
            await refreshInstalled()
        }
    }

    async function uninstall(): Promise<void> {
        if (!dev?.uninstall || !s.widgetId) return
        const r = await dev.uninstall(s.widgetId)
        if (r.ok) say(`${s.widgetId} uninstalled. Your project folder is untouched.`)
        else say(r.cancelled ? 'Not uninstalled.' : `Not uninstalled: ${r.error}`, !!r.cancelled)
        await refreshInstalled()
    }

    function setEditor(e: typeof editor) { editor = e }
    /** The editor leaving: forgotten, unless another one already took its place (a tile moved: mount before unmount). */
    function clearEditor(e: typeof editor) { if (editor === e) editor = null }
    const exec = (id: string) => editor?.exec(id) ?? false

    async function dispose() {
        offConsole?.()
        await closeCurrent()
    }

    return {
        state: s, sdk, dev, file, isDirty, dirtyPaths, editorStates, cursors, snapshot, restore, setEditor, clearEditor, exec,
        openSample, openFolder, closeCurrent, setText, open, closeTab, save, saveAll, saveToFolder, discardAll,
        createAt, pathOf, refreshInstalled, install, uninstall, exportZip, createFile, createFolder, checkName,
        orderedTabs, closeTabs, closeOthers, closeToTheRight, closeSaved, togglePin, reorderTabs, setTabRows, revealInExplorer,
        isStale, freeNameIn, renamePlan, renameFile, deletePaths, duplicatePaths, setTexts, focusSearch, moveFiles, replaceTexts,
        keepMine, takeDisk, run, scheduleRun, asText, log, say, dispose,
        packagesFrom, reloadFile, ensurePackageJson, packagesChanged, setFormatter, packagesOp, addPackage, showPart,
    }
}

export type Project = ReturnType<typeof createProject>
