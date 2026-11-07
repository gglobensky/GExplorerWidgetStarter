// widgets/monitor/live.ts
//
// THIS INSTANCE'S READINGS AND RECORDER, kept across unmounts (sdk.lifecycle().persistRef with `dispose`: a resource
// cell, never saved by hibernation, which keeps plain data only; disposed with the owner): a hub's
// tab changed while a recording runs, the store keeps its watch and the recorder keeps going (the job's card shows in
// the operations tray, RecordingCard.vue gets the same objects). With nothing to keep (no recording, nothing unsaved)
// they're disposed when the last view of this instance leaves, as before. Disposed for good with the instance.
import { markRaw } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { createStore, type Store } from './store'
import { createRecorder, type Recorder } from './recorder'

type Holder = {
    store: Store | null
    rec: Recorder | null
    /** the refresh rate, as the view on screen reads it (its props) */
    interval: () => number
    views: number
}

function holderOf(sdk: WidgetSdk): Holder {
    const blank = (): Holder => markRaw({ store: null, rec: null, interval: () => 1000, views: 0 })
    const life = sdk.lifecycle?.()
    return life ? life.persistRef<Holder>('gm-live', blank, { dispose: h => dispose(h) }).value : blank()
}

/** The view (Widget.vue) arrives: the instance's store and recorder, made the first time. */
export function enterLive(sdk: WidgetSdk, interval: () => number): { store: Store; rec: Recorder; leave: () => void } {
    const h = holderOf(sdk)
    h.interval = interval
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
            if (rec.st.state === 'idle') dispose(h)
            else rec.setOnScreen(false)
        },
    }
}

function dispose(h: Holder) {
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
