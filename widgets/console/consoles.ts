// widgets/console/consoles.ts
//
// THE CONSOLES OF ONE INSTANCE: the shells on this computer, the open sessions as tabs (each with its xterm.js
// terminal), where each one is (OSC 9;9, genuine: GEM Shell drops a program's own), and the moves waiting for a prompt.
// Widget.vue creates it once per mount; the toolbar's popover gets it as a prop, so its terminals outlive the popover.
//
//   init()               shells + this copy's live sessions (reattached: their last output drawn again)
//   open(shell?, cwd?)   a new tab (a click: GEM Shell asks the first time). cwd '' : the user's home.
//   moveTo(folder)       the active tab to a folder: session.cd (GEM Shell quotes it and types it at the prompt only);
//                        a program running: kept, done at the next prompt (`pending`), or cancelled
//   attach(el) / detach  the active terminal drawn in <el> (one element at a time)
//
// Never a path through write(): a folder named `x & del` would run. cd() is the only way.
import { reactive, markRaw, shallowRef, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { WidgetSdk, WidgetTerminal, TerminalSession, TerminalShellInfo, TerminalReason } from 'gexplorer/widgets'

export type Tab = {
    key: number
    shell: string
    label: string
    /** Where it is (OSC 9;9); '' until the first prompt. */
    cwd: string
    busy: boolean
    ended: boolean
    exitCode: number | null
    /** A move waiting for the prompt (a program was running). */
    pending: string | null
    /** The xterm.js side, never reactive. */
    rt: { session: TerminalSession; term: Terminal; fit: FitAddon; offs: Array<() => void> }
}

export type ConsoleState = 'loading' | 'ready' | 'unavailable' | 'declined' | 'no-api'

const PREFERRED = ['pwsh', 'powershell', 'cmd', 'bash']
const SCROLLBACK = 5000

let seq = 0
/** The active session of each instance (its owner's view), so a remount shows the same tab. Module-wide: it outlives a mount. */
const lastActive = new Map<string, string>()

/** "C:\Users\me\" and "c:/users/me" are the same folder (Windows: no case). */
export function samePath(a: string, b: string): boolean {
    if (!a || !b) return false
    // POSIX (Linux, WSL paths): case matters, only '/'
    if (a.trim().startsWith('/') || b.trim().startsWith('/')) {
        const p = (x: string) => x.trim().replace(/\/+$/, '') || '/'
        return p(a) === p(b)
    }
    const n = (p: string) => p.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
    return n(a) === n(b)
}

/** A Windows folder ("C:\…", "\\server\share"): the session runs in ConPTY. */
export function isWindowsPath(p: string): boolean {
    return /^[a-z]:([\\/]|$)/i.test(p) || p.startsWith('\\\\')
}

/** A real folder path (not a hub "home:" or a "sys:" page). */
export function isFolderPath(p: string): boolean {
    const s = String(p ?? '').trim()
    return /^[a-z]:([\\/]|$)/i.test(s) || /^\\\\[^\\]+\\[^\\]+/.test(s) || s.startsWith('/')
}

/** The last part of a folder ("C:\Users\me" → "me", "C:\" → "C:"). */
export function folderName(p: string): string {
    const s = p.replace(/[\\/]+$/, '')
    const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'))
    return i >= 0 ? s.slice(i + 1) || s : s
}

/** The folder in an OSC 9;9 payload ('9;"C:\x"' or '9;C:\x'): xterm.js hands the data after "9;". */
export function oscFolder(data: string): string | null {
    const m = /^9;(.*)$/s.exec(data)
    if (!m) return null
    let p = m[1].trim()
    if (p.startsWith('"') && p.endsWith('"') && p.length >= 2) p = p.slice(1, -1)
    return p && p.length <= 4096 ? p : null
}

export function reasonText(reason: TerminalReason | string, error?: string): string {
    switch (reason) {
        case 'no-gesture': return 'Click in the console first.'
        case 'declined': return 'GEM Console has no permission to run consoles.'
        case 'unavailable': return error || 'Consoles aren\'t available on this computer.'
        case 'limit': return 'Too many consoles are open. Close one first.'
        case 'unsafe-name': return 'That folder\'s name can\'t be typed safely in this shell.'
        case 'bad-argument': return error || 'That folder doesn\'t exist.'
        case 'ended': return 'This console has ended.'
        default: return error || 'The console could not do that.'
    }
}

export type ConsolesOptions = {
    /** The active tab is somewhere new (a cd, a tab switch), or a move was refused (go back: replace). */
    onFolder?: (folder: string, how: { replace: boolean }) => void
    /** Something to tell the user (a refused move). */
    notify?: (text: string) => void
    /** The terminal's colours, read from the theme when a terminal is made. */
    theme?: () => Record<string, string>
    /** This instance (its sourceId): which tab was active, across remounts. */
    key?: string
    /** 0.1.6: a link the user Ctrl+clicked in the output (http / https only): GEM Shell's openUrl (it asks first). */
    openLink?: (url: string) => void
}

/** http(s) links in a line of output, without the punctuation that usually ends a sentence after one. */
const URL_RE = /\bhttps?:\/\/[^\s"'<>`\u0000-\u001f]*[^\s"'<>`\u0000-\u001f.,;:!?)\]}]/g

export function linksIn(text: string): Array<{ start: number; url: string }> {
    const out: Array<{ start: number; url: string }> = []
    for (const m of text.matchAll(URL_RE)) {
        if (m.index === undefined || m[0].length > 2048) continue
        out.push({ start: m.index, url: m[0] })
    }
    return out
}

export function createConsoles(sdk: WidgetSdk, opts: ConsolesOptions = {}) {
    const api: WidgetTerminal | null = typeof sdk.terminal === 'function' ? sdk.terminal() : null
    const tabs = shallowRef<Tab[]>([])
    const st = reactive({
        state: (api ? 'loading' : 'no-api') as ConsoleState,
        reason: '',
        shells: [] as TerminalShellInfo[],
        active: null as number | null,
        /** A console starting (its shell's name): the views show it's coming (0.1.4). */
        starting: null as string | null,
        /** Where a new tab starts (the pane's folder, the path field's, "Open console here"). */
        startIn: '',
    })
    const active = computed(() => tabs.value.find(t => t.key === st.active) ?? null)
    let host: HTMLElement | null = null
    let resize: ResizeObserver | null = null

    function touch() { tabs.value = [...tabs.value] }
    function find(key: number) { return tabs.value.find(t => t.key === key) ?? null }

    function shellLabel(id: string): string {
        return st.shells.find(s => s.id === id)?.label ?? id
    }

    /** The shell a new tab uses: the user's last pick, else PowerShell 7, Windows PowerShell, cmd, bash. */
    function defaultShell(saved?: string): string | null {
        if (saved && st.shells.some(s => s.id === saved)) return saved
        for (const id of PREFERRED) if (st.shells.some(s => s.id === id)) return id
        return st.shells[0]?.id ?? null
    }

    let linkHinted = false
    function activateLink(e: MouseEvent, url: string) {
        if (!/^https?:\/\//i.test(url)) return
        if (!(e.ctrlKey || e.metaKey)) {
            if (!linkHinted) { linkHinted = true; opts.notify?.('Ctrl+click a link to open it.') }
            return
        }
        opts.openLink?.(url)
    }

    function makeTerminal(windows: boolean): { term: Terminal; fit: FitAddon } {
        const term = new Terminal({
            fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
            fontSize: 13,
            cursorBlink: true,
            scrollback: SCROLLBACK,
            allowProposedApi: false,
            // ConPTY (GEM Shell's sessions on Windows): xterm.js's workarounds for it
            // (0.1.4: only for a Windows session: a Linux one, later, is a real pty)
            ...(windows ? { windowsPty: { backend: 'conpty' as const } } : {}),
            theme: opts.theme?.() ?? {},
            // 0.1.6: a program's own links (OSC 8): http / https only, on Ctrl+click
            linkHandler: { activate: (e: MouseEvent, uri: string) => activateLink(e, uri), allowNonHttpProtocols: false },
        })
        // 0.1.6: the links in the output, on Ctrl+click (a plain click selects, as in Windows Terminal)
        term.registerLinkProvider({
            provideLinks(y, done) {
                const line = term.buffer.active.getLine(y - 1)
                const found = line ? linksIn(line.translateToString(true)) : []
                done(found.length ? found.map(l => ({
                    range: { start: { x: l.start + 1, y }, end: { x: l.start + l.url.length, y } },
                    text: l.url,
                    activate: (e: MouseEvent, text: string) => activateLink(e, text),
                })) : undefined)
            },
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        return { term: markRaw(term), fit: markRaw(fit) }
    }

    /** A session as a tab: its terminal, its handlers (output, end, busy, the folder and prompt marks). */
    function adopt(session: TerminalSession, replay: string | null): Tab {
        const { term, fit } = makeTerminal(isWindowsPath(session.startedIn || '') || session.shell === 'cmd' || session.shell.startsWith('wsl:'))
        const tab: Tab = reactive({
            key: ++seq,
            shell: session.shell,
            label: shellLabel(session.shell),
            cwd: '',
            busy: session.busy,
            ended: session.ended,
            exitCode: session.exitCode,
            pending: null,
            rt: markRaw({ session, term, fit, offs: [] as Array<() => void> }),
        }) as Tab
        const rt = tab.rt
        // Drawing the last output again (a remount) replays its folder marks: not new moves
        let quiet = !!replay
        // Where it is: OSC 9;9 (genuine: GEM Shell drops the ones a program prints). The prompt: OSC 133;A.
        const osc9 = term.parser.registerOscHandler(9, data => {
            const folder = oscFolder(data)
            if (folder && !samePath(folder, tab.cwd)) {
                tab.cwd = folder
                if (tab.pending && samePath(tab.pending, folder)) tab.pending = null
                touch()
                if (!quiet && tab.key === st.active) opts.onFolder?.(folder, { replace: false })
            }
            return true
        })
        const osc133 = term.parser.registerOscHandler(133, data => {
            if (!quiet && data.startsWith('A')) queueMicrotask(() => flushPending(tab))
            return true
        })
        rt.offs.push(() => osc9.dispose(), () => osc133.dispose())
        // Input as typed (never a path: moveTo uses cd)
        const input = term.onData(d => { if (!tab.ended) session.write(d) })
        const sized = term.onResize(({ cols, rows }) => { if (!tab.ended) session.resize(cols, rows) })
        rt.offs.push(() => input.dispose(), () => sized.dispose())
        // Copy: Ctrl+C with a selection (else ^C goes to the program), Ctrl+Shift+C. Paste: Ctrl+V / Ctrl+Shift+V are
        // the browser's paste (xterm.js takes the paste event), never ^V.
        term.attachCustomKeyEventHandler(ev => {
            if (ev.type !== 'keydown') return true
            const k = ev.key.toLowerCase()
            if (ev.ctrlKey && !ev.altKey && k === 'c' && (ev.shiftKey || term.hasSelection())) {
                if (term.hasSelection()) void copySelection(tab)
                ev.preventDefault()
                return false
            }
            if (ev.ctrlKey && !ev.altKey && k === 'v') return false
            return true
        })
        rt.offs.push(session.onData(d => term.write(d)))
        rt.offs.push(session.onBusy(b => { tab.busy = b; touch(); if (!b) flushPending(tab) }))
        rt.offs.push(session.onExit(code => {
            tab.ended = true
            tab.exitCode = code
            tab.pending = null
            term.write(`\r\n\x1b[2m[The console ended${Number.isFinite(code) ? ` (exit code ${code})` : ''}. Restart it or close the tab.]\x1b[0m\r\n`)
            touch()
        }))
        if (replay) term.write(replay, () => {
            quiet = false
            // Where it was when it was hidden: the pane says so, without a new history entry
            if (tab.key === st.active && tab.cwd) opts.onFolder?.(tab.cwd, { replace: true })
        })
        return tab
    }

    async function copySelection(tab: Tab) {
        const text = tab.rt.term.getSelection()
        if (!text) return
        try { await sdk.clipboardSetText?.(text); tab.rt.term.clearSelection() }
        catch { opts.notify?.('Copying needs a click or key press in the console.') }
    }

    async function init() {
        if (!api) return
        const res = await api.shells()
        if (!res.ok) {
            // declined: not granted yet (the first Start asks), or refused
            st.state = res.reason === 'declined' ? 'declined' : 'unavailable'
            st.reason = reasonText(res.reason, res.error)
            return
        }
        st.shells = res.shells
        if (!res.available || !res.shells.length) {
            st.state = 'unavailable'
            st.reason = res.reason || 'No shells were found on this computer.'
            return
        }
        // This copy's live sessions (it was hidden, or GEM Shell's page reloaded): drawn again from their last output
        const live = await api.sessions()
        const adopted: Tab[] = []
        for (const s of live) {
            let replay: string | null = null
            try { replay = await s.replay() } catch { /* drawn from now on */ }
            adopted.push(adopt(s, replay))
        }
        tabs.value = adopted
        const was = opts.key ? lastActive.get(opts.key) : undefined
        st.active = (adopted.find(t => t.rt.session.id === was) ?? adopted[adopted.length - 1])?.key ?? null
        st.state = 'ready'
        if (active.value) redraw()
    }

    /** A new tab (from a click). Resolves with the failure's text, or null. */
    async function open(shell: string | null, cwd?: string): Promise<string | null> {
        if (!api) return 'This GEM Shell has no consoles yet.'
        const id = shell ?? defaultShell()
        if (!id) return 'No shells were found on this computer.'
        const size = proposed()
        // Where: asked for, else where the active console is (a new tab beside it), else the pane's / the path field's
        const here = active.value && !active.value.ended ? active.value.cwd : ''
        if (st.starting) return null   // one at a time (a second click while it starts)
        st.starting = st.shells.length ? shellLabel(id) : 'a console'
        let r: Awaited<ReturnType<WidgetTerminal['open']>>
        try { r = await api.open({ shell: id, cwd: (cwd ?? (here || st.startIn)) || '', cols: size.cols, rows: size.rows }) }
        finally { st.starting = null }
        if (!r.ok) {
            if (r.reason === 'declined') { st.state = 'declined'; st.reason = reasonText(r.reason, r.error) }
            return reasonText(r.reason, r.error)
        }
        if (st.state === 'declined') {
            // Granted just now: the shells can be listed
            const res = await api.shells()
            if (res.ok) st.shells = res.shells
        }
        st.state = 'ready'
        const tab = adopt(r.session, null)
        tabs.value = [...tabs.value, tab]
        select(tab.key)
        return null
    }

    function select(key: number) {
        const tab = find(key)
        if (!tab) return
        const changed = st.active !== key
        st.active = key
        if (opts.key) lastActive.set(opts.key, tab.rt.session.id)
        redraw()
        if (changed && tab.cwd) opts.onFolder?.(tab.cwd, { replace: true })
    }

    async function close(key: number) {
        const tab = find(key)
        if (!tab) return
        const i = tabs.value.indexOf(tab)
        tabs.value = tabs.value.filter(t => t !== tab)
        for (const off of tab.rt.offs) { try { off() } catch { /* gone */ } }
        try { await tab.rt.session.kill() } catch { /* ended */ }
        tab.rt.term.dispose()
        if (st.active === key) {
            const next = tabs.value[Math.min(i, tabs.value.length - 1)] ?? null
            st.active = null
            if (next) select(next.key)
        }
    }

    /** The ended tab again: a new session of the same shell where it was. */
    async function restart(key: number): Promise<string | null> {
        const tab = find(key)
        if (!tab) return null
        const where = tab.cwd || tab.rt.session.startedIn
        const err = await open(tab.shell, where)
        if (!err) await close(key)
        return err
    }

    /** The active tab to <folder>, typed by GEM Shell at the prompt only; a program running: when it ends. */
    async function moveTo(folder: string): Promise<void> {
        const tab = active.value
        if (!tab || tab.ended) { st.startIn = folder; return }
        if (samePath(folder, tab.cwd)) { tab.pending = null; touch(); return }
        if (tab.busy) { tab.pending = folder; touch(); return }
        await cdNow(tab, folder)
    }

    async function cdNow(tab: Tab, folder: string) {
        const r = await tab.rt.session.cd(folder)
        if (r.ok) { if (tab.pending && samePath(tab.pending, folder)) tab.pending = null; touch(); return }
        if (r.reason === 'busy') { tab.pending = folder; touch(); return }
        tab.pending = null
        touch()
        opts.notify?.(reasonText(r.reason, r.error))
        // The pane said <folder>: back to where the console is
        if (tab.key === st.active && tab.cwd) opts.onFolder?.(tab.cwd, { replace: true })
    }

    function flushPending(tab: Tab) {
        if (!tab.pending || tab.busy || tab.ended) return
        const to = tab.pending
        void cdNow(tab, to)
    }

    function cancelPending() {
        const tab = active.value
        if (!tab?.pending) return
        tab.pending = null
        touch()
        if (tab.cwd) opts.onFolder?.(tab.cwd, { replace: true })
    }

    // ── Drawing ─────────────────────────────────────────────────────────────

    function proposed(): { cols: number; rows: number } {
        const t = active.value
        const d = t && host ? t.rt.fit.proposeDimensions() : undefined
        return { cols: Math.max(20, Math.min(500, d?.cols ?? 100)), rows: Math.max(5, Math.min(300, d?.rows ?? 30)) }
    }

    function fitNow() {
        const t = active.value
        if (!t || !host || !host.isConnected || host.clientWidth < 20 || host.clientHeight < 20) return
        try { t.rt.fit.fit() } catch { /* not laid out yet */ }
    }

    /** The active terminal in the host element (made there the first time, moved there afterwards). */
    function redraw() {
        if (!host) return
        for (const child of [...host.children]) if (child.classList.contains('terminal')) host.removeChild(child)
        const t = active.value
        if (!t) return
        const term = t.rt.term
        if (term.element) host.appendChild(term.element)
        else term.open(host)
        requestAnimationFrame(() => { fitNow(); term.refresh(0, term.rows - 1) })
    }

    function attach(el: HTMLElement) {
        host = el
        resize?.disconnect()
        resize = new ResizeObserver(() => fitNow())
        resize.observe(el)
        redraw()
    }

    function detach(el: HTMLElement) {
        if (host !== el) return
        resize?.disconnect()
        resize = null
        for (const child of [...el.children]) if (child.classList.contains('terminal')) el.removeChild(child)
        host = null
    }

    function focus() { active.value?.rt.term.focus() }

    function dispose() {
        resize?.disconnect()
        // The sessions keep running (GEM Shell ends them when the widget is removed); only the terminals go
        for (const t of tabs.value) {
            for (const off of t.rt.offs) { try { off() } catch { /* gone */ } }
            t.rt.term.dispose()
        }
        tabs.value = []
    }

    return {
        st, tabs, active, api,
        init, open, close, restart, select, moveTo, cancelPending, attach, detach, focus, fitNow, dispose,
        defaultShell, shellLabel, copySelection,
        captureKeys: (el: HTMLElement) => api?.captureKeys(el) ?? (() => { }),
    }
}

export type Consoles = ReturnType<typeof createConsoles>
