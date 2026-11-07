// docs/forge-samples/clock/entry.ts
//
// GEM FORGE SAMPLE (2026-11-06): the clock from the GEM Forge prototype (artifact "GEM Forge Prototype"). Kept here,
// outside widgets/, so `npm run build -- --all` doesn't pick it up: it is GEM Forge's first sample project. To try it
// as a widget today, copy this folder to widgets/clock/ and change its id to 'clock'.
import Widget from './Widget.vue'

export default {
    id: 'my-clock',
    name: 'Clock',
    version: '0.1.0',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    grid: { minSize: { cols: 1, rows: 1 }, defaultSize: { cols: 3, rows: 2 } },
    capabilities: [],
}
