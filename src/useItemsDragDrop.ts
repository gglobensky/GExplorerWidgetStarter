// src/widgets/items/useItemsDragDrop.ts
// ------------------------------------------------------------------
// Drag source: builds payload, calls setActiveDragPayload, starts
//              native OLE drag via startNativeDrag.
//
// Drop target: receives via onWidgetMessage 'dnd:drop' — delivered
//              by the global drop dispatcher (drop-dispatcher.ts).
//              No longer owns its own onPush listener.
//
// L3b: rows are virtual, so nothing here reads an entries array. The
// dragged items come from `dragSource` (the selection model resolves
// them), folder targets are read from the row element (data-kind), and
// refreshes go through the listing (`refresh`).
//
// L5c: a large selection is dragged as a reference ('gex/file-selection':
// SelectionRef + count + a sample): the backend builds the OS drag data from
// it and a drop here moves it with fsTransfer, so no paths cross IPC.
// ------------------------------------------------------------------

import { ref, onUnmounted, type Ref, type ComputedRef, inject } from '/runtime/vue.js'
import {
    createGexPayload,
    setActiveDragPayload,
    clearActiveDragPayload,
    WidgetSdk
} from 'gexplorer/widgets'
import type { GexDnDPayload, ScopedMessaging, ListingEntry, SelectionRef, FileSelectionData, FileRefData } from 'gexplorer/widgets'

/** What a drag carries: the entries themselves, or a large selection as a reference. */
export type ItemsDragSource =
    | { entries: ListingEntry[] }
    | { selection: SelectionRef; count: number; dir: string; sample: ListingEntry[] }


export interface UseItemsDragDropOptions {
    sourceId:       string
    messaging:      ScopedMessaging       // ← passed in from Widget.vue, not created here
    cwd:            Ref<string>
    merged:         ComputedRef<any>
    marqueeActive:  ComputedRef<boolean>
    /** What to drag when `entry` is pressed: the selection if it contains it, else just it. */
    dragSource:     (entry: ListingEntry) => Promise<ItemsDragSource>
    /** A drag crossed the threshold (keeps a multi-selection from collapsing). */
    onDragStarted?: () => void
    /** Reload the listed folder. */
    refresh:        () => void
    emit:           (event: string, payload: any) => void
}

export interface UseItemsDragDropReturn {
    isDragging:       Ref<boolean>
    isDropActive:     Ref<boolean>
    folderDropTarget: Ref<string | null>
    onItemPointerDown: (entry: ListingEntry, event: PointerEvent) => void
    dispose:          () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeDir(p: string | null | undefined): string {
    if (!p) return ''
    return p.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

function guessMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || ''
    const map: Record<string, string> = {
        mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
        m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', opus: 'audio/opus',
        mp4: 'video/mp4', mkv: 'video/x-matroska',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp',
        txt: 'text/plain', json: 'application/json', pdf: 'application/pdf',
    }
    return map[ext] || 'application/octet-stream'
}

function toFileRef(e: ListingEntry): FileRefData {
    return {
        path: e.FullPath,
        name: e.Name ?? '',
        size: e.Size ?? 0,
        mimeType: guessMimeType(e.FullPath),
        isDirectory: e.Kind === 'dir',
    }
}

function isVfsPath(p: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(p)
}

function leafName(p: string): string {
    const t = p.replace(/[\\/]+$/, '')
    return t.slice(Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/')) + 1)
}

function joinDir(dir: string, name: string): string {
    const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
    return /[\\/]$/.test(dir) ? dir + name : dir + sep + name
}

function findFolderTarget(startEl: Element | null): string | null {
    const row = startEl?.closest?.('.row[data-path]') as HTMLElement | null
    if (!row || row.dataset.kind !== 'dir') return null
    return row.dataset.path || null
}

// ── Composable ─────────────────────────────────────────────────────────────────

export function useItemsDragDrop(options: UseItemsDragDropOptions): UseItemsDragDropReturn {
    const { sourceId, messaging, cwd, merged, marqueeActive, dragSource, refresh } = options
    // startNativeDrag: the SDK's, which says which widget drags (sandbox C3b).
    const { fsMove, fsTransfer, resolveDropRefs, startNativeDrag, authorizeFileRefs } = inject<WidgetSdk>('widgetSdk') ?? {}
    const { send, on } = messaging

    const isDragging       = ref(false)
    const isDropActive     = ref(false)
    const folderDropTarget = ref<string | null>(null)

    let cleanupDrag: (() => void) | null = null

   // true while startNativeDrag resolves async VFS extraction —
   // prevents resetDragState from firing before cleanupDrag is assigned
   let extracting = false

    // ── Drag teardown ──────────────────────────────────────────────────────────

   function resetDragState() {
       if (extracting) return
       isDragging.value       = false
    console.log('[items-dnd] resetDragState ran — isDragging now false')
       isDropActive.value     = false
       folderDropTarget.value = null
       cleanupDrag?.()
       cleanupDrag = null
       clearActiveDragPayload()
   }

    // ── Drop execution ─────────────────────────────────────────────────────────

    async function executeDrop(payload: GexDnDPayload, x: number, y: number) {
        console.log('[items] executeDrop called', {
            payloadType: payload.type,
            srcId: payload.source?.widgetId,
            sourceId,
            specificTarget: findFolderTarget(document.elementFromPoint(x, y)),
            cwd: cwd.value,
        })
        if (payload.type !== 'gex/file-refs' && payload.type !== 'gex/file-selection') return

        const srcId = payload.source?.widgetId

        const el = document.elementFromPoint(x, y)
        const specificTarget = findFolderTarget(el)

        if (srcId === sourceId && !specificTarget) return

        try {
            const auth = await authorizeFileRefs!('items', sourceId, payload)
            if (!auth?.ok) {
                console.warn('[items] drop not authorized:', auth?.reason)
                return
            }

            const target = specificTarget ?? cwd.value ?? merged.value?.rpath ?? ''
            if (!target) return
            const destNorm = normalizeDir(target)

            // A large selection: moved by the backend as one job (any size).
            if (payload.type === 'gex/file-selection' && !isVfsPath(target)) {
                const data = payload.data as FileSelectionData
                if (normalizeDir(data.dir) === destNorm) return
                if (!fsTransfer) return
                await fsTransfer('move', data.selection, data.dir, target, data.count)
                refresh()
                if (srcId && srcId !== sourceId) send(srcId, 'fs:refresh-after-drop', { kind: 'fs.move', target })
                return
            }

            // Paths (a vault target takes them one by one, so a selection is resolved first).
            const refs: FileRefData[] = payload.type === 'gex/file-selection'
                ? (await resolveDropRefs?.(payload)) ?? []
                : (payload.data ?? []) as FileRefData[]
            if (!refs.length) return

            const sources = refs
                .map(r => String(r?.path ?? ''))
                .filter(p => {
                    if (!p) return false
                    const m = p.match(/^(.*[\\/])[^\\/]+$/)
                    return normalizeDir(m ? m[1] : '') !== destNorm
                })

            if (!sources.length) return

            // fsMove is VFS-aware in the SDK — VFS sources are extracted and
            // copied transparently; physical sources are moved as normal.
            // `to` is the full destination path (folder + name); a vault
            // target (scheme://) still takes the folder: the vault names it.
            await fsMove?.(sources.map(from => ({ from, to: isVfsPath(target) ? target : joinDir(target, leafName(from)) })))
            refresh()

            // Notify source widget to refresh if cross-widget move
            if (srcId && srcId !== sourceId) {
                send(srcId, 'fs:refresh-after-drop', { kind: 'fs.move', target })
            }
            
        } catch (err) {
            console.error('[items] drop failed:', err)
        }
    }

    // ── Receive drops from global dispatcher ───────────────────────────────────

    on('dnd:drop', async (msg: any) => {
        const { x, y, data: payload } = msg.payload
        isDropActive.value    = true
        folderDropTarget.value = findFolderTarget(document.elementFromPoint(x, y))
        await executeDrop(payload, x, y)
        resetDragState()
        isDropActive.value    = false
        folderDropTarget.value = null
    })

    // ── Drag-over hover ────────────────────────────────────────────────────────

    function onNativeDragOver(x: number, y: number) {
        isDropActive.value    = true
        folderDropTarget.value = findFolderTarget(document.elementFromPoint(x, y))
    }

    function onNativeDragLeave() {
        isDropActive.value    = false
        folderDropTarget.value = null
    }

    async function onExternalResult(effect: string) {
        console.log('[items-dnd] onExternalResult fired, effect:', effect, 'extracting:', extracting)
        extracting = false
        resetDragState()
        console.log('[items-dnd] after resetDragState, isDragging:', isDragging.value)
        if (effect === 'move') refresh()
    }

    // ── Pointer-down entry point ───────────────────────────────────────────────

    function onItemPointerDown(entry: any, ev: PointerEvent) {
        console.log('[items-dnd] onItemPointerDown called', { entry: entry.Name, button: ev.button })
        if (ev.button !== 0 || marqueeActive.value) return

        // No pointer events reach the page while an OS drag runs, so a drag
        // state still set here is left over from a drag that ended without
        // telling us: clear it rather than ignoring every later drag.
        if (isDragging.value) {
            extracting = false
            resetDragState()
        }

        const startX = ev.clientX
        const startY = ev.clientY
        const THRESHOLD = 5

        async function onMove(moveEv: PointerEvent) {
            const dx = moveEv.clientX - startX
            const dy = moveEv.clientY - startY
            if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return

            teardown()
            if (isDragging.value) return
            isDragging.value = true
            options.onDragStarted?.()

            // The selection resolves what is dragged (it may hold rows that are
            // not loaded); a large one comes back as a reference.
            let source: ItemsDragSource
            try {
                source = await dragSource(entry)
            } catch (err) {
                console.warn('[items-dnd] drag cancelled:', err)
                isDragging.value = false
                return
            }

            const ghostIcon = entry.Kind === 'dir' ? '📁' : '📄'
            const callbacks = {
                onDragOver:      onNativeDragOver,
                onDragLeave:     onNativeDragLeave,
                onDrop:          () => resetDragState(),
                onExternalResult,
            }

            if ('selection' in source) {
                const data: FileSelectionData = {
                    selection: source.selection,
                    count: source.count,
                    dir: source.dir,
                    sample: source.sample.map(toFileRef),
                }
                setActiveDragPayload(createGexPayload('gex/file-selection', data, { widgetType: 'items', widgetId: sourceId }), sourceId)
                console.log('[items] drag of a selection reference', { count: source.count, sourceId })

                extracting = true
                startNativeDrag!(
                    { selection: source.selection, count: source.count },
                    {
                        // Past the OS drag limit, other apps refuse it: the cursor
                        // tip says why while over them (the host's refusal rules).
                        label: `${source.count.toLocaleString()} items`,
                        icon: ghostIcon,
                        count: source.count,
                    },
                    callbacks,
                    moveEv.clientX,
                    moveEv.clientY,
                ).then(({ cleanup, started }) => {
                    extracting = false
                    if (!started) { resetDragState(); return }
                    cleanupDrag = cleanup
                }).catch(() => {
                    extracting = false
                    resetDragState()
                })
                return
            }

            const items = source.entries
            if (!items.length) { isDragging.value = false; return }

            const paths = items.map(e => e.FullPath)
            const payload = createGexPayload(
                'gex/file-refs',
                items.map(toFileRef),
                { widgetType: 'items', widgetId: sourceId }
            )

            console.log('[items] onItemPointerDown threshold crossed — setting payload', {
                paths: paths.length,
                sourceId,
            })
            setActiveDragPayload(payload, sourceId)

            extracting = true
            startNativeDrag!(
                paths,
                {
                    label: paths.length > 1 ? `${paths.length.toLocaleString()} items` : entry.Name,
                    icon:  ghostIcon,
                    count: paths.length,
                },
                callbacks,
                moveEv.clientX,
                moveEv.clientY,
                // VFS drag hooks receive the dragged entries.
                { cwd: cwd.value, entries: items },
            ).then(({ cleanup, started }) => {
                extracting = false

                // Not started: cancelled by a VFS hook (e.g. all-ghost
                // selection) or the pointer came up while resolving.
                if (!started) {
                    resetDragState()  // clears payload, resets isDragging
                    return
                }

                cleanupDrag = cleanup
            }).catch(() => {
                extracting = false
                resetDragState()
            })
        }

        function onUp() { teardown() }

        function teardown() {
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', onUp)
            document.removeEventListener('pointercancel', onUp)
        }

        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
        document.addEventListener('pointercancel', onUp)
    }

    // ── Cleanup ────────────────────────────────────────────────────────────────

   function dispose() {
       extracting = false
       resetDragState()
   }

    onUnmounted(() => dispose())

    return {
        isDragging,
        isDropActive,
        folderDropTarget,
        onItemPointerDown,
        dispose,
    }
}