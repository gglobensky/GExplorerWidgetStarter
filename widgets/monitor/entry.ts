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
    version: '1.1.2',   // 1.1.2 (2026-11-22): GEM Shell reads the graphics card once a second at most: said when 0.5 s is chosen, and on the Settings page. 1.1.1 (2026-11-22): the refresh rate and the background graphs are GEM Monitor's settings (Settings ▸ GEM Monitor, and ⏱ changes them): one value for every copy. 1.1.0 (2026-11-22): ⏱ ▸ "Keep the graphs running in the background" (per copy, off by default): with this copy not on screen (its hub not shown), it goes on reading what the graphs draw, so they're full when it's back (live.ts). 1.0.4 (2026-11-21): narrower in the toolbar (down to its gauge: the numbers hide when there's no room). 1.0.3 (2026-11-16): the details' tabs are GEM Shell's tab strip (← / →, sideways scroll when narrow). 1.0.2 (2026-11-14): tiles sized for the text (no text over text at large text); GEM Shell's colours and fonts. 1.0.1: sizes follow Appearance (built with the Text size / Roundness step)
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
        // 1.0.4: as narrow as its gauge (GEM Shell 2026-11-21: contexts.toolbar.minWidth); the numbers go first
        toolbar: { minWidth: 40 },
    },

    // A recording goes on when its copy leaves the screen (a hub's tab changed): its card in the operations tray
    // (the clock, ⚑ Mark; Stop ends it, what was recorded is kept). Not resumed after a restart: a run is a moment.
    jobs: { recording: { card: RecordingCard } },

    defaults: { data: {}, view: { toolbar: { show: ['cpu', 'ram'], cores: true } } },

    // 1.1.1: the refresh rate and the background graphs are GEM Monitor's settings (every copy), shown on its page in
    // Settings and in the details' ⏱ menu, which changes them too (sdk.settings().set). Were each copy's own (view).
    settings: {
        fields: [
            {
                key: 'intervalMs', type: 'choice', label: 'Refresh rate', default: 1000,
                hint: 'The graphics card is read once a second at most (its readings are the costly ones).',
                choices: [
                    { value: 500, label: 'Every 0.5 s' }, { value: 1000, label: 'Every second' },
                    { value: 2000, label: 'Every 2 s' }, { value: 5000, label: 'Every 5 s' },
                ],
            },
            {
                key: 'background', type: 'toggle', label: 'Keep the graphs running in the background', default: false,
                hint: 'While GEM Monitor isn\'t on screen (its hub not shown), it goes on reading what the graphs draw, so they\'re full when you come back. It costs a little: one reading at each refresh, without the process list.',
            },
        ],
        groups: [{ title: 'Readings', keys: ['intervalMs', 'background'] }],
    },

    capabilities: [
        { cap: 'Performance', reason: 'Shows how busy your processor (each core), memory, disks, network and graphics card are, and what GEM Shell itself uses.', together: true },
        { cap: 'Processes', reason: 'Lists the programs that run and what each one uses (names only: never what they show, their files or their command lines).', together: true },
        // asked when a recording is saved: only for the file picked in the save dialog
        { cap: 'Write', reason: 'Saves a recording\'s report or figures in the file you choose.' },
    ],
}
