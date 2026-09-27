// src/widgets/items/useItemsDragDrop.ts
// ------------------------------------------------------------------
// Drag source: builds payload, calls setActiveDragPayload, starts
//              native OLE drag via startNativeDrag.
//
// Drop target: receives via onWidgetMessage 'dnd:drop' — delivered
//              by the global drop dispatcher (drop-dispatcher.ts).
//              No longer owns its own onPush listener.
// ------------------------------------------------------------------

import { ref, onUnmounted, type Ref, type ComputedRef, inject } from '/runtime/vue.js'
import {
    authorizeFileRefs,
    createGexPayload,
    setActiveDragPayload,
    clearActiveDragPayload,
    startNativeDrag,
    WidgetSdk
} from 'gexplorer/widgets'
import type { GexDnDPayload, ScopedMessaging } from 'gexplorer/widgets'


export interface UseItemsDragDropOptions {
    sourceId:       string
    messaging:      ScopedMessaging       // ← passed in from Widget.vue, not created here
    entries:        Ref<any[]>
    selected:       Ref<Set<string>>
    cwd:            Ref<string>
    merged:         ComputedRef<any>
    marqueeActive:  ComputedRef<boolean>
    loadDir:        (path: string) => Promise<void>
    emit:           (event: string, payload: any) => void
}

export interface UseItemsDragDropReturn {
    isDragging:       Ref<boolean>
    isDropActive:     Ref<boolean>
    folderDropTarget: Ref<string | null>
    onItemPointerDown: (entry: any, event: PointerEvent) => void
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

function findFolderTarget(startEl: Element | null, entries: any[]): string | null {
    let el: Element | null = startEl
    while (el) {
        if (el instanceof HTMLElement && el.matches('.row[data-path]')) {
            const path = el.dataset.path
            if (path) {
                const entry = entries.find(e => e.FullPath === path)
                if (entry?.Kind === 'dir') return path
            }
        }
        el = el.parentElement
    }
    return null
}

// ── Composable ─────────────────────────────────────────────────────────────────

export function useItemsDragDrop(options: UseItemsDragDropOptions): UseItemsDragDropReturn {
    const { sourceId, messaging, entries, selected, cwd, merged, marqueeActive, loadDir  } = options
    const { fsMove, fsCopy } = inject<WidgetSdk>('widgetSdk') ?? {}
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
            specificTarget: findFolderTarget(document.elementFromPoint(x, y), entries.value),
            cwd: cwd.value,
        })
        if (payload.type !== 'gex/file-refs') return

        const srcId = payload.source?.widgetId

        const el = document.elementFromPoint(x, y)
        const specificTarget = findFolderTarget(el, entries.value)

        if (srcId === sourceId && !specificTarget) return

        try {
            const auth = await authorizeFileRefs('items', sourceId, payload)
            if (!auth?.ok) {
                console.warn('[items] drop not authorized:', auth?.reason)
                return
            }

            const refs = (payload.data ?? []) as any[]
            if (!refs.length) return

            const target = specificTarget ?? cwd.value ?? merged.value?.rpath ?? ''
            if (!target) return

            const destNorm = normalizeDir(target)
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
            await fsMove?.(sources.map(from => ({ from, to: target })))
            await loadDir(cwd.value || merged.value?.rpath || '')

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
        folderDropTarget.value = findFolderTarget(document.elementFromPoint(x, y), entries.value)
        await executeDrop(payload, x, y)
        resetDragState()
        isDropActive.value    = false
        folderDropTarget.value = null
    })

    // ── Drag-over hover ────────────────────────────────────────────────────────

    function onNativeDragOver(x: number, y: number) {
        isDropActive.value    = true
        folderDropTarget.value = findFolderTarget(document.elementFromPoint(x, y), entries.value)
    }

    function onNativeDragLeave() {
        isDropActive.value    = false
        folderDropTarget.value = null
    }

    async function onExternalResult(effect: string) {
        console.log('[items-dnd] onExternalResult fired, effect:', effect, 'extracting:', extracting)
        extracting = false
        const refreshDir = cwd.value || merged.value?.rpath || ''
        resetDragState()
        console.log('[items-dnd] after resetDragState, isDragging:', isDragging.value)
        if (effect === 'move' && refreshDir) {
            await loadDir(refreshDir)
        }
    }

    // ── Pointer-down entry point ───────────────────────────────────────────────

    function onItemPointerDown(entry: any, ev: PointerEvent) {
        console.log('[items-dnd] onItemPointerDown called', { entry: entry.Name, button: ev.button })
        if (ev.button !== 0 || marqueeActive.value) return

        const startX = ev.clientX
        const startY = ev.clientY
        const THRESHOLD = 5

        function onMove(moveEv: PointerEvent) {
            const dx = moveEv.clientX - startX
            const dy = moveEv.clientY - startY
            if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return

            teardown()
            if (isDragging.value) return

            const paths = selected.value.size > 0
                ? [...selected.value]
                : [entry.FullPath]

            const selectedEntries = paths
                .map(p => entries.value.find(x => x.FullPath === p))
                .filter(Boolean)

            const fileRefs = selectedEntries.map(e => ({
                path: e.FullPath,
                name: e.Name ?? '',
                size: e.Size ?? 0,
                mimeType: guessMimeType(e.FullPath),
                isDirectory: e.Kind === 'dir',
            }))

            const payload = createGexPayload(
                'gex/file-refs',
                fileRefs,
                { widgetType: 'items', widgetId: sourceId }
            )

            console.log('[items] onItemPointerDown threshold crossed — setting payload', {
                paths: paths.length,
                sourceId,
            })
            setActiveDragPayload(payload, sourceId)
            isDragging.value = true

            extracting = true
            startNativeDrag(
                paths,
                {
                    label: paths.length > 1 ? `${paths.length} items` : entry.Name,
                    icon:  entry.Kind === 'dir' ? '📁' : '📄',
                    count: paths.length,
                },
                {
                    onDragOver:      onNativeDragOver,
                    onDragLeave:     onNativeDragLeave,
                    onDrop:          () => resetDragState(),
                    onExternalResult,
                },
                moveEv.clientX,
                moveEv.clientY,
                { cwd: cwd.value, entries: selected }, 
            ).then(({ cleanup, resolvedPaths }) => {
                extracting = false

                // startNativeDrag returns empty resolvedPaths when drag was
                // cancelled by a VFS hook (e.g. all-ghost selection)
                if (!resolvedPaths.length) {
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