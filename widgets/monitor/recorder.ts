// widgets/monitor/recorder.ts
//
// RECORDING A RUN (a benchmark, a game session, a build): every sample for a while, then a report saved where you
// choose: a self-contained HTML page (report.ts: graphs, the figures, the markers) and the raw figures as CSV.
//   - Time-limited: 5 min to 4 h (MAX_MS), stopped at the limit, and at RECORD_ROWS samples at most.
//   - While it records, the store reads CPU, memory, GPU, disks, network and GEM Shell (need()), and the followed
//     program if there is one, whatever is on screen; it gives them back when it stops.
//   - A background job (entry.ts jobs.recording, RecordingCard.vue): it keeps recording when this copy leaves the
//     screen (a hub's tab changed): the store and the recorder stay alive with the instance (live.ts), and the
//     operations tray shows the card (the clock, ⚑ Mark; the frame's Stop stops it). Done while away: the card asks
//     for attention until it's saved. It ends with the instance's removal, GEM Shell closing, Discard or a save.
//   - Saving: sdk.ui().saveFile() then fsWriteText (the Write permission, for that file only).
import { reactive, markRaw } from 'vue'
import type { WidgetSdk, MonitorSample, MonitorSet, WidgetJob } from 'gexplorer/widgets'
import { followTree, clock, type Store } from './store'
import { buildReport, buildCsv } from './report'

export const MAX_MS = 4 * 60 * 60 * 1000
export const RECORD_ROWS = 40000
export const DURATIONS = [
    { ms: 5 * 60 * 1000, label: '5 minutes' },
    { ms: 15 * 60 * 1000, label: '15 minutes' },
    { ms: 60 * 60 * 1000, label: '1 hour' },
    { ms: MAX_MS, label: '4 hours (the most)' },
]
const SETS: MonitorSet[] = ['cpu', 'memory', 'gpu', 'disks', 'network', 'self']

/** One sample, flattened (what the report and the CSV need). */
export type RecRow = {
    /** ms since the start */
    t: number
    cpu: number; kernel: number; cores: number[]
    ramUsed: number; ramPct: number; commit: number
    gpu: number; gpuMem: number
    diskRead: number; diskWrite: number; diskActive: number
    netIn: number; netOut: number
    selfCpu: number; selfMem: number
    /** the followed program (its tree), when there is one and it runs */
    fCpu?: number; fMem?: number; fGpu?: number; fIo?: number
}
export type RecMarker = { t: number; label: string }
export type Recording = {
    startedAt: number
    endedAt: number
    intervalMs: number
    rows: RecRow[]
    markers: RecMarker[]
    follow: { pid: number; name: string } | null
    stoppedBy: 'you' | 'limit' | 'size' | 'ended'
}

export function createRecorder(sdk: WidgetSdk, store: Store, opts: { intervalMs: () => number }) {
    const ui = sdk.ui!()
    const st = reactive({
        state: 'idle' as 'idle' | 'recording' | 'done',
        startedAt: 0,
        limitMs: 0,
        /** changes with each sample while recording (the views' clocks) */
        count: 0,
        now: 0,
        markers: 0,
        saving: false,
    })
    let rec: Recording | null = null
    let release: (() => void) | null = null
    let unlisten: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let job: WidgetJob | null = null
    let titledAt = 0
    let onScreen = true

    const limitLabel = () => DURATIONS.find(d => d.ms === st.limitMs)?.label ?? clock(st.limitMs)
    function endJob() {
        const j = job
        job = null
        if (j?.alive) { try { j.attention(false); j.end() } catch { /* already gone */ } }
    }

    function onSample(s: MonitorSample) {
        if (st.state !== 'recording' || !rec) return
        // the card's Stop (the job ended from the tray)
        if (job && !job.alive) { job = null; stop('you'); return }
        const m = s.memory, f = followTree(s)
        const row: RecRow = {
            t: Math.max(0, s.at - rec.startedAt),
            cpu: s.cpu?.total ?? 0, kernel: s.cpu?.kernel ?? 0, cores: s.cpu ? [...s.cpu.cores] : [],
            ramUsed: m ? m.total - m.available : 0, ramPct: m?.total ? (m.total - m.available) * 100 / m.total : 0, commit: m?.committed ?? 0,
            gpu: Math.max(0, ...(s.gpu ?? []).map(g => g.total)), gpuMem: (s.gpu ?? []).reduce((a, g) => a + g.dedicated, 0),
            diskRead: (s.disks ?? []).reduce((a, d) => a + d.read, 0), diskWrite: (s.disks ?? []).reduce((a, d) => a + d.write, 0),
            diskActive: Math.max(0, ...(s.disks ?? []).map(d => d.active)),
            netIn: (s.network ?? []).reduce((a, n) => a + n.received, 0), netOut: (s.network ?? []).reduce((a, n) => a + n.sent, 0),
            selfCpu: s.self?.cpu ?? 0, selfMem: s.self?.priv ?? 0,
        }
        if (f) { row.fCpu = f.cpu; row.fMem = f.priv; row.fGpu = f.gpu; row.fIo = f.read + f.write }
        rec.rows.push(row)
        if (!rec.follow && store.st.follow) rec.follow = { pid: store.st.follow.pid, name: store.st.follow.name }
        st.count = rec.rows.length
        st.now = Date.now()
        if (job && st.now - titledAt > 5000) {
            titledAt = st.now
            job.update({ title: `Recording ${clock(st.now - rec.startedAt)} of ${clock(st.limitMs)}` })
        }
        if (rec.rows.length >= RECORD_ROWS) stop('size')
    }

    function start(limitMs: number) {
        if (st.state === 'recording') return
        const limit = Math.max(60_000, Math.min(MAX_MS, limitMs))
        const r: Recording = markRaw({
            startedAt: Date.now(), endedAt: 0, intervalMs: opts.intervalMs(), rows: [], markers: [],
            follow: store.st.follow ? { pid: store.st.follow.pid, name: store.st.follow.name } : null, stoppedBy: 'you',
        } as Recording)
        rec = r
        Object.assign(st, { state: 'recording', startedAt: r.startedAt, limitMs: limit, count: 0, now: r.startedAt, markers: 0 })
        release = store.need(SETS)
        unlisten = store.onSample(onSample)
        timer = setTimeout(() => stop('limit'), limit)
        try {
            job = sdk.jobs?.().ensure('recording', { title: `Recording for ${limitLabel()}`, params: { limitMs: limit } }) ?? null
            titledAt = Date.now()
        } catch (err) {
            console.warn('[monitor] the recording job', err)
            job = null
        }
    }

    function stop(by: Recording['stoppedBy'] = 'you') {
        if (st.state !== 'recording' || !rec) return
        if (timer) clearTimeout(timer)
        timer = null
        unlisten?.(); unlisten = null
        release?.(); release = null
        rec.endedAt = Date.now()
        rec.stoppedBy = by
        st.state = rec.rows.length ? 'done' : 'idle'
        if (st.state === 'idle') endJob()
        else if (job?.alive) {
            job.update({ title: `Recorded ${clock(rec.endedAt - rec.startedAt)}: open GEM Monitor to save it` })
            if (!onScreen) job.attention(true)
        }
        if (by === 'limit' || by === 'size') {
            void ui.snack({ id: 'gem-monitor-rec', text: `The recording ended (${by === 'limit' ? 'its time was up' : 'it was full'}): save it from GEM Monitor's details.`, dedupe: 'replace', timeoutMs: 8000 })
        }
    }

    function mark() {
        if (st.state !== 'recording' || !rec) return
        const t = Date.now() - rec.startedAt
        rec.markers.push({ t, label: `Marker ${rec.markers.length + 1}` })
        st.markers = rec.markers.length
        void ui.snack({ id: 'gem-monitor-mark', text: `Marker ${rec.markers.length} at ${clock(t)}`, dedupe: 'replace', timeoutMs: 2500 })
    }

    function stamp(d: Date) {
        const p = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`
    }

    /** Saves the report (html) or the figures (csv) where the user chooses. */
    async function save(kind: 'html' | 'csv'): Promise<boolean> {
        if (!rec || st.state !== 'done' || st.saving) return false
        if (typeof sdk.fsWriteText !== 'function') {
            void ui.snack({ id: 'gem-monitor-rec', text: 'Saving needs a newer GEM Shell.', dedupe: 'replace' })
            return false
        }
        st.saving = true
        try {
            const name = `GEM Monitor ${stamp(new Date(rec.startedAt))}${rec.follow ? ` ${rec.follow.name.replace(/\.exe$/i, '')}` : ''}`
                .replace(/[\\/:*?"<>|]+/g, ' ')
            const path = await ui.saveFile({
                title: kind === 'html' ? 'Save the report' : 'Save the figures',
                suggestedName: `${name}.${kind}`,
                filters: kind === 'html' ? [{ label: 'Web page', extensions: ['html'] }] : [{ label: 'CSV (spreadsheet)', extensions: ['csv'] }],
            })
            if (!path) return false
            const text = kind === 'html' ? buildReport(rec, store.st.info) : buildCsv(rec)
            await sdk.fsWriteText(path, text, { overwrite: true, bom: kind === 'csv' })
            void ui.snack({ id: 'gem-monitor-rec', text: kind === 'html' ? 'Report saved.' : 'Figures saved.', dedupe: 'replace', timeoutMs: 4000 })
            // saved: nothing waits any more (the recording stays here for the other format until discarded)
            endJob()
            return true
        } catch (err) {
            void ui.snack({ id: 'gem-monitor-rec', text: `Couldn't save it: ${(err as Error)?.message ?? err}`, dedupe: 'replace' })
            return false
        } finally {
            st.saving = false
        }
    }

    function discard() {
        if (st.state === 'recording') return
        rec = null
        Object.assign(st, { state: 'idle', count: 0, markers: 0 })
        endJob()
    }

    /** A copy of the widget is on screen (true) or none is (false): a finished recording asks for attention while away. */
    function setOnScreen(on: boolean) {
        onScreen = on
        if (job?.alive && st.state === 'done') job.attention(!on)
    }

    /** How long it has recorded (or recorded), ms. */
    const elapsed = () => !rec ? 0 : (st.state === 'recording' ? Math.max(st.now, rec.startedAt) : rec.endedAt) - rec.startedAt

    function dispose() {
        stop('ended')
        rec = null
        endJob()
    }

    return { st, start, stop: () => stop('you'), mark, save, discard, elapsed, setOnScreen, limitLabel, dispose }
}

export type Recorder = ReturnType<typeof createRecorder>

export { clock }
