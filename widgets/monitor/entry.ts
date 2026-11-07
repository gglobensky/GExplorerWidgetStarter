// widgets/monitor/entry.ts
//
// GEM MONITOR 1.0.0 (2026-11-06): the computer's resources, live: at least what Windows' Resource Monitor shows, the
// same views on Linux later. MONITOR-SHELL-ADDITIONS.md (GEM Shell: the backend, sdk.monitor(), the two permissions).
//   - toolbar: the numbers you choose (right-click; CPU and memory by default) and one bar per core; a click opens the
//     details, 📌 pins them as a window.
//   - grid: pages of tiles (TilesView: gauges, graphs, cores, the busiest programs, GEM Shell's processes), arranged
//     with GEM Shell's grid engine (gridDrag / gridResize), saved in this copy's view (view.pages, view.page; 0.2.0's
//     view.tiles becomes one page). ☰ the details over them.
//   - sidebar: the details as a panel.
//   - Processes (sortable, filtered) and GEM Shell's own use.
//   - For benchmarking: follow a program (◎: with the ones it starts), measure a stretch of any graph (drag), record a
//     run for a set time with markers, saved as a self-contained HTML report or CSV (recorder.ts, report.ts: Write,
//     for the file picked only).
// It sees no file, window or command line and changes nothing; it writes only the report you save.
import Widget from './Widget.vue'
import RecordingCard from './RecordingCard.vue'

export default {
    api: '1.0',
    id: 'monitor',
    version: '1.0.0',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    displayName: 'GEM Monitor',
    description: 'Your processor (each core), memory, disks, network and graphics card, live, with the programs that use them. In the toolbar, a hub or the sidebar.',
    category: 'tools',
    // A valve gauge (an emoji: GEM Shell's widget icons are one; the widget draws its own brass gauge)
    icon: '⏲️',
    instance: 'placement',

    contexts: {
        grid: { minSize: { width: 300, height: 220 }, defaultSize: { width: '50%', height: '60%' } },
        sidebar: { minHeight: 240, maxHeight: 1200 },
        toolbar: {},
    },

    // A recording goes on when its copy leaves the screen (a hub's tab changed): its card in the operations tray
    // (the clock, ⚑ Mark; Stop ends it, what was recorded is kept). Not resumed after a restart: a run is a moment.
    jobs: { recording: { card: RecordingCard } },

    defaults: { data: {}, view: { intervalMs: 1000, toolbar: { show: ['cpu', 'ram'], cores: true } } },

    capabilities: [
        { cap: 'Performance', reason: 'Shows how busy your processor (each core), memory, disks, network and graphics card are, and what GEM Shell itself uses.', together: true },
        { cap: 'Processes', reason: 'Lists the programs that run and what each one uses (names only: never what they show, their files or their command lines).', together: true },
        // asked when a recording is saved: only for the file picked in the save dialog
        { cap: 'Write', reason: 'Saves a recording\'s report or figures in the file you choose.' },
    ],
}
