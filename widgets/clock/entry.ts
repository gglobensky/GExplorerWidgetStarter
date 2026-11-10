// docs/forge-samples/clock/entry.ts
//
// GEM FORGE SAMPLE (2026-11-06): the clock from the GEM Forge prototype (artifact "GEM Forge Prototype"). Kept here,
// outside widgets/, so `npm run build -- --all` doesn't pick it up: it is GEM Forge's first sample project. To try it
// as a widget today, copy this folder to widgets/clock/ and change its id to 'clock'.
import Widget from './Widget.vue'
import SchedulerCard from './SchedulerCard.vue'
import StopwatchCard from './StopwatchCard.vue'
import { CALENDAR_PROVIDER_POINT } from './calendarProvider'

export default {
    api: '1.0',
    id: 'clock',
    name: 'Clock',
    displayName: 'GEM Clock',
    description: 'A skinnable clock, paper calendar, timers and time tools.',
    category: 'tools',
    icon: '◷',
    version: '0.10.0',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    instance: 'global',
    contexts: {
        grid: { minSize: { cols: 1, rows: 1 }, defaultSize: { cols: 4, rows: 3 } },
        sidebar: { minHeight: 92, maxHeight: 900, scroll: 'self' },
        toolbar: {},
    },
    consumes: [
        { point: 'gem.clock.calendar-provider', multiple: true },
        { point: 'gem.clock.calendar-panel', multiple: true },
        { point: 'gem.clock.complication', multiple: true },
    ],
    jobs: {
        stopwatch: { card: StopwatchCard, recovery: 'resume', restartOnLaunch: true, stateVersion: 1 },
        scheduler: { card: SchedulerCard, recovery: 'resume', restartOnLaunch: true, stateVersion: 1 },
    },
    defaults: { data: {}, view: { skin: 'quiet-system', tab: 'clock', showSeconds: true } },
    settings: {
        fields: [
            { key: 'calendarProvider', type: 'provider', point: CALENDAR_PROVIDER_POINT, label: 'Calendar',
              default: 'latest', automaticLabel: 'Latest provided calendar', builtinLabel: 'Clock calendar',
              hint: 'The latest calendar provider is used automatically. Choose one here to keep using it when several are installed.' },
        ],
        groups: [{ title: 'Calendar', keys: ['calendarProvider'] }],
    },
    capabilities: [
        { cap: 'Read', reason: 'Loads Clock/Calendar skins from .gemskin files you choose.' },
        { cap: 'Write', reason: 'Saves Clock/Calendar skins to the file you choose.' },
    ],
}
