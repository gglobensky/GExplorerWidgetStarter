// widgets/forge/terminal.ts
//
// GEM FORGE 0.6.0: THE TERMINAL PART (roadmap group 3 F6c; claude/forge-dev-tools-design.md section 6). A terminal
// another widget provides for GEM Shell's 'shell.terminal' point (GEM Console's), shown by GEM Shell over the Terminal
// tile (sdk.parts().mount). It is GEM Forge's terminal: it runs as GEM Forge (its Terminal permission, asked the
// first time a console starts), and its consoles are GEM Forge's and end with it.
//   - Kept with the project (a resource cell): the tile coming and going (a tab switch) shows the same part again
//     (GEM Shell keeps one per copy: the new mount joins it, then the old handle is let go).
//   - The provider: the only one, else the one you picked (asked in the tile; remembered: config 'terminal').
//   - It follows the project's folder (the workspace's, else the project's): cd when it changes.
//   - npm's output (Packages: install, add, remove, a library's rebuild) also goes to its Tool output tab when
//     "npm output here too" is ticked (remembered). Output and Packages keep theirs.
// GEM Forge never reads what the terminal shows (v1).
import { reactive } from 'vue'
import type { PartProvider, TerminalPartHandle, WidgetSdk } from 'gexplorer/widgets'
import type { Project } from './project'

export const TERMINAL_POINT = 'shell.terminal'

export type TerminalState = 'idle' | 'loading' | 'no-api' | 'none' | 'pick' | 'ask' | 'ready' | 'failed'

export function createForgeTerminal(sdk: WidgetSdk, project: Project) {
    const st = reactive({
        state: 'idle' as TerminalState,
        note: '',
        providers: [] as PartProvider[],
        /** The provider shown (or picked). */
        provider: '',
        npmHere: false,
    })
    let handle: TerminalPartHandle | null = null
    let lastFolder = ''
    let prefsRead: Promise<void> | null = null

    function readPrefs(): Promise<void> {
        return prefsRead ??= (async () => {
            try {
                const p: any = await sdk.configRead?.('terminal')
                if (typeof p?.provider === 'string') st.provider = p.provider
                st.npmHere = p?.npmHere === true
            } catch (err) { console.warn('[forge] the terminal\'s settings not read', err) }
        })()
    }
    function savePrefs() {
        void sdk.configWrite?.('terminal', { provider: st.provider, npmHere: st.npmHere })?.catch?.((err: unknown) => console.warn('[forge] the terminal\'s settings not saved', err))
    }

    /** The providers now (installed widgets providing 'shell.terminal'); [] on an older GEM Shell. */
    async function providers(): Promise<PartProvider[]> {
        const parts = sdk.parts?.()
        if (!parts) return []
        try { return await parts.list(TERMINAL_POINT) } catch (err) { console.error('[forge] terminal providers not listed', err); return [] }
    }

    /** The terminal shown over <el> (the tile's box): the same part as before if there is one. */
    async function show(el: HTMLElement): Promise<void> {
        const parts = sdk.parts?.()
        if (!parts) {
            st.state = 'no-api'
            st.note = 'This GEM Shell can\'t show another widget\'s terminal (GEM Shell 2026-11-15 or later).'
            return
        }
        if (!handle) st.state = 'loading'
        await readPrefs()
        st.providers = await providers()
        if (!st.providers.length) { release(); st.state = 'none'; return }
        const chosen = st.providers.find(p => p.type === st.provider) ?? (st.providers.length === 1 ? st.providers[0] : null)
        if (!chosen) { release(); st.state = 'pick'; return }
        const r = await parts.mount(el, TERMINAL_POINT, chosen.type)
        if (!r.ok) {
            // Shown already (another place): it stays; else the reason, and for E_ASK the tile's Allow button
            if (!handle) { st.state = r.code === 'E_ASK' ? 'ask' : 'failed'; st.note = r.error }
            return
        }
        const prev = handle
        handle = r.part
        if (prev && prev.provider !== handle.provider) lastFolder = ''
        prev?.close()
        st.provider = chosen.type
        st.state = 'ready'
        st.note = ''
        follow()
    }

    /** The tile's choice among several providers (remembered), then shown. */
    async function pick(type: string, el: HTMLElement): Promise<void> {
        if (type !== st.provider) release()
        st.provider = type
        savePrefs()
        await show(el)
    }

    /** The terminal to the project's folder when it changes (the workspace's, else the project's). */
    function follow() {
        // 0.6.1: not while a project opens (its folder, then its workspace's: it moved twice)
        if (project.state.loading) return
        const folder = project.packageFolder()
        if (!handle || !folder || folder === lastFolder) return
        lastFolder = folder
        void handle.cd(folder).then(r => { if (!r.ok) console.warn(`[forge] terminal: not moved to ${folder}: ${r.error}`) })
    }

    function setNpmHere(on: boolean) {
        st.npmHere = on
        savePrefs()
    }

    /** npm's output, when the option is on and the terminal shows. */
    function echo(text: string) {
        if (st.npmHere && handle) void handle.print(text)
    }

    /** The Terminal part left the layout (or GEM Forge's copy ends): its part closes. */
    function release() {
        const h = handle
        handle = null
        lastFolder = ''
        h?.close()
        if (st.state === 'ready') st.state = 'idle'
    }

    project.setToolEcho(echo)

    return { state: st, show, pick, follow, setNpmHere, release, get shown() { return !!handle } }
}

export type ForgeTerminal = ReturnType<typeof createForgeTerminal>
