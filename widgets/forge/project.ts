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
import type { WidgetSdk, WidgetDev, DevProblem, DevChange, ListingEntry, DevInstalledState } from 'gexplorer/widgets'
import { GUIDE_FILES } from './templates'

export const TEXT_FILE = /\.(ts|js|mjs|vue|css|json|md|txt|svg|html)$/i
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
    /** A sample in memory: its files (a folder project: none, it's read again). */
    files: { path: string; text: string; saved?: string }[] | null
    /** Unsaved edits of a folder project: path -> text. */
    unsaved: Record<string, string>
    openTabs: string[]
    active: string
    liveReload: boolean
    /** Each open file's cursor (an offset). */
    cursors: Record<string, number>
}
export type Reveal = { path: string; line: number; column: number; seq: number }

/** A project id from a name: lower-case letters, digits and dashes (dev-<id> is its widget while edited). */
export function projectIdOf(name: string): string {
    const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
    return /^[a-z0-9]/.test(s) ? s : 'project'
}

const sepOf = (folder: string) => (folder.includes('\\') ? '\\' : '/')
const joinPath = (folder: string, rel: string) => folder.replace(/[\\/]+$/, '') + sepOf(folder) + rel.split('/').join(sepOf(folder))
const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

/** Built: not the guide for AIs, no notes, no typings. */
const isBuilt = (path: string) => !GUIDE_FILES.has(path) && !/\.(md|d\.ts)$/i.test(path)

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

export function createProject(sdk: WidgetSdk) {
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
        watching: false,
        loading: false,
        /** The widget's id in entry.ts ('' when it can't be read), and whether a widget of that name is installed. */
        widgetId: '',
        installed: 'none' as DevInstalledState,
        installing: false,
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
    const offConsole = dev?.onConsole(m => log(m.level, m.text, m.at))

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
            build: 0, lastOkAt: 0, conflicts: [], reveal: null, status: '', widgetId: '', installed: 'none' })
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
    async function openSample(name: string, files: { path: string; text: string }[]) {
        await closeCurrent()
        s.name = name
        s.id = projectIdOf(name)
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
        if (!s.openTabs.includes(path)) s.openTabs = [...s.openTabs, path]
        s.active = path
        if (at) s.reveal = { path, line: at.line, column: at.column, seq: ++revealSeq }
    }
    function closeTab(path: string) {
        s.openTabs = s.openTabs.filter(p => p !== path)
        if (s.active === path) s.active = s.openTabs[s.openTabs.length - 1] ?? ''
    }

    async function save(path = s.active): Promise<boolean> {
        const f = file(path)
        if (!f || f.base64 !== undefined) return false
        if (!s.folder) { say('A sample lives in memory: Save to a folder… first.', false); return false }
        if (!sdk.fsWriteText) { say('GEM Forge needs the Write permission to save.', false); return false }
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
    async function run(): Promise<boolean> {
        if (!dev || !s.id || s.building) { if (s.building) scheduleRun(); return false }
        s.building = true
        try {
            const r = await dev.build(buildFiles(), { project: s.id })
            s.errors = r.errors
            s.warnings = r.warnings
            s.notes = r.notes
            if (!r.code) {
                say(`Not built: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}${s.build ? ' (the last good build still runs)' : ''}.`, false)
                return false
            }
            const ran = await dev.run(s.id, r.code)
            if (!ran.ok) { say(`Not run: ${ran.error}`, false); return false }
            s.build = ran.build
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
            folder: s.folder, name: s.name,
            files: s.folder ? null : s.files.filter(f => f.base64 === undefined).map(f => ({ path: f.path, text: f.text, saved: f.saved })),
            unsaved, openTabs: [...s.openTabs], active: s.active, liveReload: s.liveReload, cursors: cur,
        }
    }

    /** A snapshot back: the folder read again (or the sample), the unsaved edits on top, the tabs and cursors. */
    async function restore(v: Session | null | undefined) {
        if (!v || typeof v !== 'object') return
        s.liveReload = v.liveReload !== false
        if (v.folder) await openFolder(v.folder)
        else if (Array.isArray(v.files)) {
            const files = v.files.filter(f => typeof f?.path === 'string' && typeof f?.text === 'string')
            // A sample's edits: what it held before them (an older snapshot has no saved: its text counts as saved)
            await openSample(v.name || 'Sample', files.map(f => ({ path: f.path, text: typeof f.saved === 'string' ? f.saved : f.text })))
            for (const f of files) { const mine = file(f.path); if (mine) mine.text = f.text }
        }
        else return
        for (const [p, text] of Object.entries(v.unsaved ?? {})) { const f = file(p); if (f && typeof text === 'string') f.text = text }
        const tabs = (Array.isArray(v.openTabs) ? v.openTabs : []).filter(p => !!file(p))
        if (tabs.length) s.openTabs = tabs
        if (v.active && file(v.active)) s.active = v.active
        for (const [p, c] of Object.entries(v.cursors ?? {})) if (typeof c === 'number') cursors.set(p, c)
        if (dirtyPaths().length) say(`${s.name}: your unsaved edits are back (not saved yet).`)
    }

    /** Every unsaved edit dropped: each file back to what it holds on disk (or the sample's text). */
    function discardAll() {
        for (const f of s.files) if (f.base64 === undefined && f.text !== f.saved) f.text = f.saved
        s.conflicts = []
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
        const print = fingerprint(files)
        if (installBuild?.print === print) return installBuild
        const r = await dev.build(files)
        s.errors = r.errors
        s.warnings = r.warnings
        if (!r.code || !r.type) {
            say(`Not installed: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'} (the Problems part lists them).`, false)
            return null
        }
        installBuild = { print, type: r.type, code: r.code }
        return installBuild
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
        state: s, dev, file, isDirty, dirtyPaths, editorStates, cursors, snapshot, restore, setEditor, clearEditor, exec,
        openSample, openFolder, closeCurrent, setText, open, closeTab, save, saveAll, saveToFolder, discardAll,
        createAt, pathOf, refreshInstalled, install, uninstall,
        keepMine, takeDisk, run, scheduleRun, asText, log, say, dispose,
    }
}

export type Project = ReturnType<typeof createProject>
