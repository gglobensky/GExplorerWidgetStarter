// widgets/monitor/report.ts
//
// A RECORDING'S REPORT: one self-contained HTML page (no script, no outside file: it opens anywhere, offline, and
// prints): the computer, when and how long, a table of the figures (min, average, max, 95th percentile), a graph per
// resource with the markers, each core's average load, the followed program. And the raw figures as CSV.
// Names that come from the computer (programs, adapters) are escaped.
import type { MonitorInfo } from 'gexplorer/widgets'
import type { Recording, RecRow } from './recorder'
import { bytes, rate, clock } from './store'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])

type Stat = { min: number; avg: number; max: number; p95: number }
function stats(vs: number[]): Stat | null {
    const v = vs.filter(Number.isFinite)
    if (!v.length) return null
    const s = [...v].sort((a, b) => a - b)
    return { min: s[0], max: s[s.length - 1], avg: v.reduce((a, b) => a + b, 0) / v.length, p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] }
}

const pctF = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`
const bytesF = (v: number) => bytes(v)
const rateF = (v: number) => rate(v)

type Series = { name: string; color: string; get: (r: RecRow) => number | undefined; dashed?: boolean }
type ChartDef = { title: string; sub?: string; series: Series[]; max?: number; fmt: (v: number) => string }

/** One graph: each series' average per column (and the busiest moment as a light band), the markers, a time axis. */
function chart(rec: Recording, c: ChartDef): string {
    const W = 1000, H = 190, L = 58, R = 10, T = 12, B = 26
    const rows = rec.rows
    const span = Math.max(1, rows.length ? rows[rows.length - 1].t : 1)
    const cols = Math.min(500, rows.length)
    const all = rows.flatMap(r => c.series.map(s => s.get(r) ?? NaN)).filter(Number.isFinite)
    const top = c.max ?? Math.max(1e-9, ...all) * 1.1
    const x = (t: number) => L + (t / span) * (W - L - R)
    const y = (v: number) => T + (1 - Math.min(1, Math.max(0, v / top))) * (H - T - B)
    let body = ''
    // the scale
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const yy = y(top * f)
        body += `<line x1="${L}" x2="${W - R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" class="g"/>`
        body += `<text x="${L - 6}" y="${(yy + 4).toFixed(1)}" class="ya">${esc(c.fmt(top * f))}</text>`
    }
    for (let i = 0; i <= 5; i++) {
        const t = (span * i) / 5
        body += `<text x="${x(t).toFixed(1)}" y="${H - 8}" class="xa" text-anchor="${i === 0 ? 'start' : i === 5 ? 'end' : 'middle'}">${clock(t)}</text>`
    }
    // each series, by columns
    for (const s of c.series) {
        const avg: string[] = [], hi: string[] = [], lo: string[] = []
        for (let k = 0; k < cols; k++) {
            const a = Math.floor((k * rows.length) / cols), b = Math.max(a + 1, Math.floor(((k + 1) * rows.length) / cols))
            const vs = rows.slice(a, b).map(s.get).filter((v): v is number => Number.isFinite(v))
            if (!vs.length) continue
            const t = rows[Math.min(rows.length - 1, Math.floor((a + b - 1) / 2))].t
            const xx = x(t).toFixed(1)
            avg.push(`${xx},${y(vs.reduce((p, q) => p + q, 0) / vs.length).toFixed(1)}`)
            hi.push(`${xx},${y(Math.max(...vs)).toFixed(1)}`)
            lo.push(`${xx},${y(Math.min(...vs)).toFixed(1)}`)
        }
        if (!avg.length) continue
        if (rows.length > cols && !s.dashed) body += `<path d="M ${hi.join(' L ')} L ${[...lo].reverse().join(' L ')} Z" fill="${s.color}" opacity=".16"/>`
        body += `<path d="M ${avg.join(' L ')}" fill="none" stroke="${s.color}" stroke-width="1.6"${s.dashed ? ' stroke-dasharray="5 3"' : ''}/>`
    }
    // the markers
    for (const m of rec.markers) {
        if (m.t > span) continue
        const xx = x(m.t).toFixed(1)
        body += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${H - B}" class="mk"/><text x="${+xx + 3}" y="${T + 10}" class="mkt">${esc(m.label)}</text>`
    }
    const legend = c.series.map(s => `<span><i style="background:${s.color}${s.dashed ? ';opacity:.6' : ''}"></i>${esc(s.name)}</span>`).join('')
    return `<section class="chart"><h3>${esc(c.title)}${c.sub ? ` <small>${esc(c.sub)}</small>` : ''}</h3><div class="legend">${legend}</div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${body}</svg></section>`
}

export function buildReport(rec: Recording, info: MonitorInfo | null): string {
    const rows = rec.rows
    const has = (get: (r: RecRow) => number | undefined) => rows.some(r => Number.isFinite(get(r) as number))
    const fname = rec.follow?.name ?? ''
    const start = new Date(rec.startedAt), end = new Date(rec.endedAt || Date.now())
    const span = rows.length ? rows[rows.length - 1].t : 0

    const lines: Array<[string, (r: RecRow) => number | undefined, (v: number) => string]> = [
        ['Processor', r => r.cpu, pctF],
        ['Processor (kernel)', r => r.kernel, pctF],
        ['Memory in use', r => r.ramUsed, bytesF],
        ['Memory in use (%)', r => r.ramPct, pctF],
        ['Commit', r => r.commit, bytesF],
        ['Graphics card', r => r.gpu, pctF],
        ['Video memory', r => r.gpuMem, bytesF],
        ['Disks: read', r => r.diskRead, rateF],
        ['Disks: write', r => r.diskWrite, rateF],
        ['Disks: busiest (active)', r => r.diskActive, pctF],
        ['Network: in', r => r.netIn, rateF],
        ['Network: out', r => r.netOut, rateF],
        ['GEM Shell: CPU', r => r.selfCpu, pctF],
        ['GEM Shell: memory', r => r.selfMem, bytesF],
    ]
    if (fname) lines.push(
        [`${fname}: CPU`, r => r.fCpu, pctF],
        [`${fname}: memory`, r => r.fMem, bytesF],
        [`${fname}: GPU`, r => r.fGpu, pctF],
        [`${fname}: I/O (files and pipes)`, r => r.fIo, rateF],
    )
    const table = lines.map(([name, get, f]) => {
        const s = stats(rows.map(get).filter((v): v is number => v !== undefined))
        return s ? `<tr><td>${esc(name)}</td><td>${esc(f(s.min))}</td><td>${esc(f(s.avg))}</td><td>${esc(f(s.max))}</td><td>${esc(f(s.p95))}</td></tr>` : ''
    }).join('')

    const charts: ChartDef[] = [
        { title: 'Processor', sub: info?.cpuName, max: 100, fmt: v => `${Math.round(v)}%`, series: [
            { name: 'Total', color: '#3d8fc4', get: r => r.cpu }, { name: 'Kernel', color: '#3d8fc4', get: r => r.kernel, dashed: true }] },
        { title: 'Memory', sub: info ? `of ${bytes(info.totalMemory)}` : undefined, max: 100, fmt: v => `${Math.round(v)}%`, series: [
            { name: 'In use', color: '#9a63d6', get: r => r.ramPct }] },
        { title: 'Graphics card', sub: info?.gpus.join(' / '), max: 100, fmt: v => `${Math.round(v)}%`, series: [
            { name: 'Busiest engine', color: '#3f9e5f', get: r => r.gpu }] },
        { title: 'Disks', fmt: rateF, series: [
            { name: 'Read', color: '#c98a1e', get: r => r.diskRead }, { name: 'Write', color: '#c98a1e', get: r => r.diskWrite, dashed: true }] },
        { title: 'Network', fmt: rateF, series: [
            { name: 'In', color: '#cf4f74', get: r => r.netIn }, { name: 'Out', color: '#cf4f74', get: r => r.netOut, dashed: true }] },
    ]
    if (fname && has(r => r.fCpu)) {
        charts.unshift(
            { title: `${fname}: processor`, sub: `pid ${rec.follow!.pid}, with the programs it started`, max: 100, fmt: v => `${Math.round(v)}%`, series: [
                { name: 'CPU (of the whole computer)', color: '#b8862f', get: r => r.fCpu }, { name: 'GPU', color: '#3f9e5f', get: r => r.fGpu, dashed: true }] },
            { title: `${fname}: memory`, fmt: bytesF, series: [{ name: 'Private memory', color: '#9a63d6', get: r => r.fMem }] },
        )
    }
    charts.push({ title: 'GEM Shell', sub: 'itself and its web view', fmt: pctF, series: [{ name: 'CPU', color: '#3d8fc4', get: r => r.selfCpu }] })

    // each core's average
    const nCores = Math.max(0, ...rows.map(r => r.cores.length))
    const coreAvg = Array.from({ length: nCores }, (_, i) => {
        const vs = rows.map(r => r.cores[i]).filter(Number.isFinite)
        return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0
    })
    const coreMax = Array.from({ length: nCores }, (_, i) => Math.max(0, ...rows.map(r => r.cores[i]).filter(Number.isFinite)))
    const cores = nCores ? `<section class="chart"><h3>Each core <small>average (the line: its busiest moment)</small></h3><div class="cores">${coreAvg.map((v, i) =>
        `<div class="core" title="Core ${i}: average ${pctF(v)}, busiest ${pctF(coreMax[i])}"><div class="cmax" style="bottom:${coreMax[i].toFixed(1)}%"></div><div class="cfill" style="height:${v.toFixed(1)}%"></div><span>${i}</span></div>`).join('')}</div></section>` : ''

    const markers = rec.markers.length ? `<section><h2>Markers</h2><table class="t"><tr><th>When</th><th>Marker</th></tr>${rec.markers.map(m =>
        `<tr><td>${clock(m.t)}</td><td>${esc(m.label)}</td></tr>`).join('')}</table></section>` : ''

    const stopped = { you: 'stopped by you', limit: 'stopped at its time limit', size: 'stopped: it was full', ended: 'stopped: the monitor was closed' }[rec.stoppedBy]
    const title = `GEM Monitor: ${fname ? `${fname}, ` : ''}${start.toLocaleString()}`

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg: #faf8f3; --fg: #1f1c17; --muted: #6d665b; --line: #e3ddd0; --card: #fff; --brass: #b8862f; }
@media (prefers-color-scheme: dark) { :root { --bg: #18171a; --fg: #ebe7df; --muted: #a39d92; --line: #34313a; --card: #211f24; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, "Segoe UI", sans-serif; }
main { max-width: 1060px; margin: 0 auto; padding: 28px 18px 48px; }
header { border-bottom: 2px solid var(--brass); padding-bottom: 12px; margin-bottom: 18px; }
h1 { margin: 0 0 4px; font-size: 22px; } h1 span { color: var(--brass); }
h2 { font-size: 16px; margin: 26px 0 8px; } h3 { font-size: 14px; margin: 0 0 4px; } small { color: var(--muted); font-weight: 400; }
.meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 18px; color: var(--muted); }
.meta b { color: var(--fg); font-weight: 600; }
.t { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.t th, .t td { padding: 5px 10px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
.t th:first-child, .t td:first-child { text-align: left; white-space: normal; }
.t th { color: var(--muted); font-weight: 600; font-size: 12px; } .t td { font-variant-numeric: tabular-nums; }
.chart { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px 4px; margin: 10px 0; break-inside: avoid; }
.chart svg { width: 100%; height: auto; display: block; }
.g { stroke: var(--line); stroke-width: 1; } .ya { fill: var(--muted); font-size: 11px; text-anchor: end; } .xa { fill: var(--muted); font-size: 11px; }
.mk { stroke: #c4473a; stroke-dasharray: 3 3; } .mkt { fill: #c4473a; font-size: 11px; }
.legend { display: flex; gap: 14px; color: var(--muted); font-size: 12px; margin-bottom: 2px; } .legend i { display: inline-block; width: 14px; height: 3px; margin-right: 5px; vertical-align: middle; }
.cores { display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 4px; padding: 6px 0 8px; }
.core { position: relative; height: 90px; background: color-mix(in oklab, var(--fg) 8%, transparent); border-radius: 4px; overflow: hidden; }
.cfill { position: absolute; left: 0; right: 0; bottom: 0; background: #3f9e5f; } .cmax { position: absolute; left: 0; right: 0; height: 2px; background: #c4473a; }
.core span { position: absolute; top: 2px; left: 0; right: 0; text-align: center; font-size: 10px; color: var(--muted); }
footer { margin-top: 28px; color: var(--muted); font-size: 12px; }
@media print { body { background: #fff; } .chart, .t { border-color: #ccc; } }
</style></head>
<body><main>
<header>
<h1><span>⏲</span> GEM Monitor report${fname ? `: ${esc(fname)}` : ''}</h1>
<div class="meta">
<div>Started <b>${esc(start.toLocaleString())}</b></div>
<div>Lasted <b>${clock(span)}</b> <small>(${esc(stopped)})</small></div>
<div>Samples <b>${rows.length.toLocaleString()}</b>, every <b>${rec.intervalMs >= 1000 ? `${rec.intervalMs / 1000} s` : `${rec.intervalMs} ms`}</b></div>
<div>Ended <b>${esc(end.toLocaleTimeString())}</b></div>
${info ? `<div>Processor <b>${esc(info.cpuName)}</b> (${info.logicalCores} threads)</div>
<div>Memory <b>${esc(bytes(info.totalMemory))}</b></div>
${info.gpus.length ? `<div>Graphics <b>${esc(info.gpus.join(' / '))}</b></div>` : ''}
<div>System <b>${esc(info.os)}</b></div>` : ''}
${rec.follow ? `<div>Followed <b>${esc(rec.follow.name)}</b> (pid ${rec.follow.pid}, with the programs it started)</div>` : ''}
</div>
</header>

<h2>The figures</h2>
<table class="t"><tr><th></th><th>Min</th><th>Average</th><th>Max</th><th title="What the busiest 5% of the moments reached">95th percentile</th></tr>${table}</table>
${markers}
<h2>Over time</h2>
${charts.map(c => chart(rec, c)).join('\n')}
${cores}
<footer>Made by GEM Monitor in GEM Shell. A program's CPU is a share of the whole computer (100% = every core busy). The bands show the range in each slice of time when there are more samples than room.</footer>
</main></body></html>
`
}

export function buildCsv(rec: Recording): string {
    const rows = rec.rows
    const nCores = Math.max(0, ...rows.map(r => r.cores.length))
    const f = rec.follow ? rec.follow.name.replace(/[",\r\n]/g, ' ') : ''
    const head = ['seconds', 'time', 'marker', 'cpu_pct', 'kernel_pct', ...Array.from({ length: nCores }, (_, i) => `core${i}_pct`),
        'memory_used_bytes', 'memory_pct', 'commit_bytes', 'gpu_pct', 'gpu_memory_bytes', 'disk_read_Bps', 'disk_write_Bps', 'disk_active_pct',
        'net_in_Bps', 'net_out_Bps', 'gem_cpu_pct', 'gem_memory_bytes',
        ...(f ? [`${f}_cpu_pct`, `${f}_memory_bytes`, `${f}_gpu_pct`, `${f}_io_Bps`] : [])]
    const marks = [...rec.markers]
    const n = (v: number | undefined, d = 2) => v === undefined || !Number.isFinite(v) ? '' : Number.isInteger(v) ? String(v) : v.toFixed(d)
    const out = [head.map(h => /[,"]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h).join(',')]
    for (const r of rows) {
        let marker = ''
        while (marks.length && marks[0].t <= r.t) marker = (marker ? marker + '; ' : '') + marks.shift()!.label
        out.push([
            (r.t / 1000).toFixed(1), new Date(rec.startedAt + r.t).toISOString(), marker ? `"${marker.replace(/"/g, '""')}"` : '',
            n(r.cpu), n(r.kernel), ...Array.from({ length: nCores }, (_, i) => n(r.cores[i], 1)),
            n(r.ramUsed, 0), n(r.ramPct), n(r.commit, 0), n(r.gpu), n(r.gpuMem, 0), n(r.diskRead, 0), n(r.diskWrite, 0), n(r.diskActive, 1),
            n(r.netIn, 0), n(r.netOut, 0), n(r.selfCpu), n(r.selfMem, 0),
            ...(f ? [n(r.fCpu), n(r.fMem, 0), n(r.fGpu), n(r.fIo, 0)] : []),
        ].join(','))
    }
    return out.join('\r\n') + '\r\n'
}
