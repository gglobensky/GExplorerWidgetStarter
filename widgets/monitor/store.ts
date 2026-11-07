// widgets/monitor/store.ts
//
// ONE INSTANCE'S READINGS: a single watch (sdk.monitor()) whose sets are what is on screen right now, and the recent
// history for the graphs. Every view (the toolbar's numbers, the detail view in its popover or its pinned window, the
// grid's panel) says what it shows with need(sets) and gives it back when it goes: the watch narrows or stops, so the
// backend reads nothing nobody sees (MONITOR-SHELL-ADDITIONS.md, "no waste").
//
//   init()             the computer's info (asks Performance the first time: together with Processes)
//   need(sets)         → release(); the watch follows the union of what is needed
//   st.last            the last sample; hist.* the recent values (HISTORY points); st.tick changes on each sample
//   follow(pid, name)  follows a program and the ones it started (sample.follow, hist.follow*): null stops
//   onSample(fn)       every sample, as it comes (the recorder)
import { reactive, shallowRef, markRaw } from 'vue'
import type { WidgetSdk, WidgetMonitor, MonitorWatch, MonitorSet, MonitorSample, MonitorInfo, MonitorTree } from 'gexplorer/widgets'

export const HISTORY = 120

export type StoreState = 'idle' | 'starting' | 'ready' | 'declined' | 'unavailable' | 'no-api'

export type History = {
    cpu: number[]
    kernel: number[]
    cores: number[][]
    ram: number[]
    gpu: number[]
    diskRead: number[]
    diskWrite: number[]
    netIn: number[]
    netOut: number[]
    self: number[]
    selfMem: number[]
    followCpu: number[]
    followMem: number[]
    followGpu: number[]
    followIo: number[]
}

/** The followed program's tree, or null (gone, or not followed). */
export function followTree(s: MonitorSample | null | undefined): MonitorTree | null {
    const f = s?.follow
    return f && !('gone' in f) ? f : null
}

function ring(a: number[], v: number) {
    a.push(Number.isFinite(v) ? v : 0)
    if (a.length > HISTORY) a.splice(0, a.length - HISTORY)
}

export function createStore(sdk: WidgetSdk, opts: { intervalMs?: () => number } = {}) {
    const api: WidgetMonitor | null = typeof sdk.monitor === 'function' ? sdk.monitor() : null
    const st = reactive({
        state: (api ? 'idle' : 'no-api') as StoreState,
        reason: '',
        info: null as MonitorInfo | null,
        tick: 0,
        /** Processes was refused: views that list processes offer to ask again. */
        processesDenied: false,
        /** The program followed (its pid, its name when it was picked); gone: it ended. */
        follow: null as { pid: number; name: string; gone: boolean; since: number } | null,
    })
    const last = shallowRef<MonitorSample | null>(null)
    const hist: History = markRaw({
        cpu: [], kernel: [], cores: [], ram: [], gpu: [], diskRead: [], diskWrite: [], netIn: [], netOut: [], self: [], selfMem: [],
        followCpu: [], followMem: [], followGpu: [], followIo: [],
    })
    const listeners = new Set<(s: MonitorSample) => void>()

    const needs = new Map<symbol, Set<MonitorSet>>()
    let watch: MonitorWatch | null = null
    let applied = ''
    let chain: Promise<void> = Promise.resolve()
    /** init() succeeded: watches may start (before: one consent question at a time, info()'s). */
    let started = false

    function wanted(): MonitorSet[] {
        const all = new Set<MonitorSet>()
        for (const s of needs.values()) for (const x of s) all.add(x)
        if (st.processesDenied) all.delete('processes')
        return [...all].sort()
    }

    function onSample(s: MonitorSample) {
        last.value = s
        if (s.cpu) {
            ring(hist.cpu, s.cpu.total)
            ring(hist.kernel, s.cpu.kernel)
            s.cpu.cores.forEach((v, i) => ring(hist.cores[i] ??= [], v))
        }
        if (s.memory && s.memory.total > 0) ring(hist.ram, (s.memory.total - s.memory.available) * 100 / s.memory.total)
        if (s.gpu) ring(hist.gpu, Math.max(0, ...s.gpu.map(g => g.total)))
        if (s.disks) {
            ring(hist.diskRead, s.disks.reduce((a, d) => a + d.read, 0))
            ring(hist.diskWrite, s.disks.reduce((a, d) => a + d.write, 0))
        }
        if (s.network) {
            ring(hist.netIn, s.network.reduce((a, n) => a + n.received, 0))
            ring(hist.netOut, s.network.reduce((a, n) => a + n.sent, 0))
        }
        if (s.self) { ring(hist.self, s.self.cpu); ring(hist.selfMem, s.self.priv) }
        if (st.follow && s.follow && s.follow.pid === st.follow.pid) {
            const t = followTree(s)
            if (t) {
                ring(hist.followCpu, t.cpu); ring(hist.followMem, t.priv); ring(hist.followGpu, t.gpu); ring(hist.followIo, t.read + t.write)
            } else if (!st.follow.gone) { st.follow.gone = true; sync() }
        }
        st.tick++
        for (const fn of listeners) { try { fn(s) } catch (err) { console.warn('[monitor] listener', err) } }
    }

    /** The watch follows what is needed (one change at a time, the latest wins). */
    function sync() {
        chain = chain.then(async () => {
            if (!api || !started || st.state === 'unavailable') return
            const sets = wanted()
            const intervalMs = Math.max(500, opts.intervalMs?.() ?? 1000)
            const pid = st.follow && !st.follow.gone && !st.processesDenied ? st.follow.pid : undefined
            const key = `${sets.join(',')}@${intervalMs}#${pid ?? ''}`
            if (key === applied && (watch || (!sets.length && !pid))) return
            if (!sets.length && !pid) {
                if (watch) { const w = watch; watch = null; await w.stop() }
                applied = key
                return
            }
            if (watch && !watch.ended) {
                const r = await watch.change({ sets, intervalMs, pid })
                if (r.ok) { applied = key; return }
                if (r.needs === 'Processes') { st.processesDenied = true; applied = ''; return sync() }
                watch = null
            }
            st.state = st.state === 'ready' ? 'ready' : 'starting'
            const r = await api.watch({ sets, intervalMs, pid }, onSample)
            if (!r.ok) {
                if (r.needs === 'Processes') { st.processesDenied = true; applied = ''; return sync() }
                st.state = r.reason === 'declined' ? 'declined' : r.reason === 'unavailable' ? 'unavailable' : 'declined'
                st.reason = r.error
                applied = key
                return
            }
            watch = r.watch
            applied = key
            st.state = 'ready'
            watch.onEnded(reason => {
                if (watch !== r.watch) return
                watch = null
                applied = ''
                if (reason !== 'stopped' && reason !== 'the widget was removed') { st.state = 'declined'; st.reason = reason }
            })
        }).catch(err => { console.warn('[monitor] watch', err) })
    }

    async function init() {
        if (!api) return
        st.state = 'starting'
        const r = await api.info()
        if (!r.ok) { st.state = r.reason === 'unavailable' ? 'unavailable' : 'declined'; st.reason = r.error; return }
        if (!r.available) { st.state = 'unavailable'; st.reason = r.reason ?? 'Not available on this system.'; return }
        st.info = r.info ?? null
        st.state = 'ready'
        started = true
        applied = ''
        sync()
    }

    /** Ask again (the user's "Allow"): the consent comes back. */
    function retry(processes = false) {
        if (processes) st.processesDenied = false
        if (st.state === 'declined') { st.state = 'idle'; void init(); return }
        applied = ''
        sync()
    }

    function need(sets: MonitorSet[]): () => void {
        const id = Symbol('need')
        needs.set(id, new Set(sets))
        sync()
        return () => { if (needs.delete(id)) sync() }
    }

    /** The interval changed (the user's choice): the watch follows. */
    function refresh() { applied = ''; sync() }

    /** Follows a program (and the ones it started); null: stops. Its graphs start over. */
    function follow(pid: number | null, name = '') {
        if (pid === (st.follow?.pid ?? null) && !st.follow?.gone) return
        hist.followCpu.length = hist.followMem.length = hist.followGpu.length = hist.followIo.length = 0
        st.follow = pid ? { pid, name, gone: false, since: Date.now() } : null
        sync()
    }

    function onEverySample(fn: (s: MonitorSample) => void): () => void {
        listeners.add(fn)
        return () => listeners.delete(fn)
    }

    function dispose() {
        needs.clear()
        listeners.clear()
        const w = watch
        watch = null
        void w?.stop()
    }

    return { st, last, hist, init, need, retry, refresh, follow, onSample: onEverySample, dispose }
}

export type Store = ReturnType<typeof createStore>

// ── Formatting ──────────────────────────────────────────────────────────────

export function pct(v: number | undefined | null): string {
    return `${Math.round(Number(v) || 0)}%`
}

export function bytes(n: number | undefined | null, digits = 1): string {
    let v = Math.max(0, Number(n) || 0)
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return `${i === 0 ? Math.round(v) : v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`
}

export function rate(n: number | undefined | null): string {
    return `${bytes(n)}/s`
}

export function bits(n: number | undefined | null): string {
    let v = Math.max(0, Number(n) || 0)
    const units = ['bps', 'Kbps', 'Mbps', 'Gbps']
    let i = 0
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i++ }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** 75 000 ms → "1:15"; an hour or more → "1:02:03". */
export function clock(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
    const p = (n: number) => String(n).padStart(2, '0')
    return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`
}
