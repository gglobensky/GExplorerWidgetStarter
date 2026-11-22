// widgets/monitor/live.ts
//
// THIS INSTANCE'S READINGS AND RECORDER, kept across unmounts (sdk.lifecycle().persistRef with `dispose`: a resource
// cell, never saved by hibernation, which keeps plain data only; disposed with the owner): a hub's
// tab changed while a recording runs, the store keeps its watch and the recorder keeps going (the job's card shows in
// the operations tray, RecordingCard.vue gets the same objects). With nothing to keep (no recording, nothing unsaved)
// they're disposed when the last view of this instance leaves, as before. Disposed for good with the instance.
// NEW (1.1.0, #8): "Keep the graphs running" (this copy's view.background, the ⏱ menu): when the last view leaves, the
// store stays too, reading what the graphs draw (BACKGROUND_SETS: no process list), so they're full when it comes back
// (a hub shown again). Its views take over when one arrives; with the option off it goes as before.
import { markRaw } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import type { MonitorSet } from 'gexplorer/widgets'
import { createStore, type Store } from './store'
import { createRecorder, type Recorder } from './recorder'

type Holder = {
    store: Store | null
    rec: Recorder | null
    /** the refresh rate, as the view on screen reads it (its props) */
    interval: () => number
    views: number
    /** NEW (1.1.0): the option, as the last view read it (this copy's view.background) */
    background: () => boolean
    /** NEW (1.1.0): the graphs' sets, held while no view is on screen */
    away: (() => void) | null
}

/** NEW (1.1.0): what the graphs draw (the detail view's and the tiles'): never the process list (its cost). */
const BACKGROUND_SETS: MonitorSet[] = ['cpu', 'memory', 'gpu', 'disks', 'network', 'self']

function holderOf(sdk: WidgetSdk): Holder {
    const blank = (): Holder => markRaw({ store: null, rec: null, interval: () => 1000, views: 0, background: () => false, away: null })
    const life = sdk.lifecycle?.()
    return life ? life.persistRef<Holder>('gm-live', blank, { dispose: h => dispose(h) }).value : blank()
}

/** The view (Widget.vue) arrives: the instance's store and recorder, made the first time. */
export function enterLive(sdk: WidgetSdk, interval: () => number, background: () => boolean = () => false): { store: Store; rec: Recorder; leave: () => void } {
    const h = holderOf(sdk)
    h.interval = interval
    h.background = background
    // back on screen: its views say what they need again
    h.away?.()
    h.away = null
    if (!h.store || !h.rec) {
        const store = markRaw(createStore(sdk, { intervalMs: () => h.interval() }))
        h.store = store
        h.rec = markRaw(createRecorder(sdk, store, { intervalMs: () => h.interval() }))
    }
    h.views++
    h.rec.setOnScreen(true)
    const store = h.store, rec = h.rec
    let left = false
    return {
        store, rec,
        leave() {
            if (left) return
            left = true
            h.views = Math.max(0, h.views - 1)
            if (h.views) return
            const keep = h.background()
            if (rec.st.state === 'idle' && !keep) { dispose(h); return }
            if (rec.st.state !== 'idle') rec.setOnScreen(false)
            // 1.1.0: the graphs go on (the store's watch narrows to them once the views have given theirs back)
            if (keep && !h.away) h.away = store.need(BACKGROUND_SETS)
        },
    }
}

function dispose(h: Holder) {
    h.away?.()
    h.away = null
    h.rec?.dispose()
    h.store?.dispose()
    h.rec = null
    h.store = null
}

/** For the job's card: this instance's recorder and store, if they live. */
export function peekLive(sdk: WidgetSdk): { store: Store; rec: Recorder } | null {
    const h = holderOf(sdk)
    return h.store && h.rec ? { store: h.store, rec: h.rec } : null
}
