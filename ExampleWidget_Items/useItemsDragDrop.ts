// src/widgets/items/useItemsDragDrop.ts

import { ref, onMounted, onBeforeUnmount, type Ref, type ComputedRef } from 'vue'
import { authorizeFileRefs } from '/src/widgets/dnd/receiver'
import { createGexPayload } from '/src/widgets/dnd/sender'
import type { GexDnDPayload } from '/src/widgets/dnd/types'
import { startNativeDrag, watchDragThreshold } from '/src/widgets/dnd/native'
import { registerDropWidget, unregisterDropWidget, findWidgetAtPoint } from '/src/widgets/dnd/widgetRegistry'
import { fsMove } from '/src/widgets/fs'
import { sendWidgetMessage } from '/src/widgets/instances'

export interface UseItemsDragDropOptions {
    sourceId:      string
    entries:       Ref<any[]>
    selected:      Ref<Set<string>>
    cwd:           Ref<string>
    merged:        ComputedRef<any>
    marqueeActive: ComputedRef<boolean>
    rootEl:        Ref<HTMLElement | null>
    loadDir:       (path: string) => Promise<void>
    emit:          (event: string, payload: any) => void
}

export interface UseItemsDragDropReturn {
    isDragging:        Ref<boolean>
    isDropActive:      Ref<boolean>
    folderDropTarget:  Ref<string | null>
    onItemPointerDown: (entry: any, event: PointerEvent) => void
    /** Still needed: calls ev.preventDefault() to suppress Chromium's own drag session */
    onItemDragStart:   (entry: any, event: DragEvent) => void
    dispose:           () => void
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

/** Walk up from el looking for the nearest folder row within the given entry list. */
function findFolderRow(el: Element | null, entries: any[]): string | null {
    let cur: Element | null = el
    while (cur) {
        if (cur instanceof HTMLElement && cur.matches('.row[data-path]')) {
            const path = cur.dataset.path
            if (path) {
                const entry = entries.find(e => e.FullPath === path)
                if (entry?.Kind === 'dir') return path
            }
        }
        cur = cur.parentElement
    }
    return null
}

// ── Composable ─────────────────────────────────────────────────────────────────

export function useItemsDragDrop(options: UseItemsDragDropOptions): UseItemsDragDropReturn {
    const { sourceId, entries, selected, cwd, merged, marqueeActive, rootEl, loadDir } = options

    const isDragging       = ref(false)
    const isDropActive     = ref(false)
    const folderDropTarget = ref<string | null>(null)

    let currentPayload: GexDnDPayload | null = null
    let cleanupDrag: (() => void) | null = null
    let activePaneId: string | null = null  // which pane currently has folder highlight

    // ── Widget registry ────────────────────────────────────────────────────────

    onMounted(() => {
        registerDropWidget(
            sourceId,
            () => rootEl.value,
            () => cwd.value,
            () => entries.value,
            (path) => { folderDropTarget.value = path },
        )
    })

    onBeforeUnmount(() => {
        unregisterDropWidget(sourceId)
    })

    // ── State reset ────────────────────────────────────────────────────────────

    function resetDragState() {
        clearActivePaneHighlight()
        isDragging.value       = false
        isDropActive.value     = false
        folderDropTarget.value = null
        currentPayload         = null
        cleanupDrag?.()
        cleanupDrag = null
    }

    function clearActivePaneHighlight() {
        if (!activePaneId) return
        // Import registry map isn't exported, so we route through findWidgetAtPoint
        // by calling setFolderTarget(null) on the last known active widget.
        // We track activeWidget ref for this purpose.
        activeWidget?.setFolderTarget(null)
        activeWidget = null
        activePaneId = null
    }

    let activeWidget: ReturnType<typeof findWidgetAtPoint> = null

    // ── IPC drag callbacks ─────────────────────────────────────────────────────

    function onNativeDragOver(x: number, y: number) {
        isDropActive.value = true

        const widget = findWidgetAtPoint(x, y)

        // If we moved to a different pane, clear the previous one's highlight
        if (widget?.widgetId !== activePaneId) {
            clearActivePaneHighlight()
        }

        if (!widget) return

        activeWidget = widget
        activePaneId = widget.widgetId

        // Find folder row using the target pane's own entry list
        const el = document.elementFromPoint(x, y)
        const folder = findFolderRow(el, widget.getEntries())
        widget.setFolderTarget(folder)
    }

    function onNativeDragLeave() {
        clearActivePaneHighlight()
        isDropActive.value     = false
        folderDropTarget.value = null
    }

    async function onNativeDrop(x: number, y: number) {
        const payload = currentPayload
        const widget  = activeWidget  // capture before reset
        resetDragState()
        if (!payload || payload.type !== 'gex/file-refs') return
        if (!widget) return

        const droppedOnSelf = widget.widgetId === sourceId

        // The folder highlight was already computed in the last dragover —
        // read it from the target widget's current folderDropTarget state.
        // If none, fall back to the target pane's cwd.
        const el = document.elementFromPoint(x, y)
        const folderTarget = findFolderRow(el, widget.getEntries())
        
        if (droppedOnSelf && !folderTarget) {
            console.debug('[Items] drop: background of own widget, ignoring')
            return
        }

        const target = folderTarget ?? widget.getCwd()
        await executeDrop(payload, target, widget.widgetId)
    }

    async function onExternalResult(effect: string) {
        const refreshDir = cwd.value || merged.value?.rpath || ''
        resetDragState()
        if (effect === 'move' && refreshDir)
            await loadDir(refreshDir)
    }

    // ── Core drop logic ────────────────────────────────────────────────────────

    async function executeDrop(payload: GexDnDPayload, target: string, targetWidgetId: string) {
        try {
            const auth = await authorizeFileRefs('items', sourceId, payload)
            if (!auth?.ok) { console.warn('[Items] Drop not authorized:', auth?.reason); return }

            const refs = (payload.data ?? []) as any[]
            if (!refs.length) return

            const destNorm = normalizeDir(target)
            const sep = target.includes('\\') ? '\\' : '/'
            const trimmed = target.replace(/[\\/]+$/, '')

            const items = refs
                .map(r => String(r?.path ?? ''))
                .filter(p => {
                    if (!p) return false
                    const m = p.match(/^(.*[\\/])[^\\/]+$/)
                    return normalizeDir(m ? m[1] : '') !== destNorm
                })
                .map(from => ({
                    from,
                    to: trimmed + sep + from.replace(/[\\/]+$/, '').split(/[\\/]/).pop()!,
                }))

            if (!items.length) { console.debug('[Items] drop: all refs already in target'); return }

            await fsMove(items, 'items', sourceId)
            await loadDir(cwd.value || merged.value?.rpath || '')

            if (targetWidgetId !== sourceId) {
                sendWidgetMessage({
                    from: sourceId,
                    to: targetWidgetId,
                    topic: 'fs:refresh-after-drop',
                    payload: { kind: 'fs.move', target },
                })
            }
        } catch (err) {
            console.error('[Items] drop failed:', err)
        }
    }

    // ── Drag initiation ────────────────────────────────────────────────────────

    function onItemPointerDown(entry: any, ev: PointerEvent) {
        if (ev.button !== 0 || marqueeActive.value) return

        watchDragThreshold(ev, {
            onThresholdCrossed(moveEv) {
                if (isDragging.value) return false

                const paths = selected.value.size > 0 ? [...selected.value] : [entry.FullPath]

                currentPayload = createGexPayload(
                    'gex/file-refs',
                    paths.map(p => {
                        const e = entries.value.find(x => x.FullPath === p)
                        return {
                            path: p,
                            name: e?.Name ?? '',
                            size: e?.Size ?? 0,
                            mimeType: guessMimeType(p),
                            isDirectory: e?.Kind === 'dir',
                        }
                    }),
                    { widgetType: 'items', widgetId: sourceId }
                )

                isDragging.value = true

                cleanupDrag = startNativeDrag(
                    paths,
                    {
                        label: paths.length > 1 ? `${paths.length} items` : entry.Name,
                        icon: entry.Kind === 'dir' ? '📁' : '📄',
                        count: paths.length,
                    },
                    {
                        onDragOver:       onNativeDragOver,
                        onDragLeave:      onNativeDragLeave,
                        onDrop:           onNativeDrop,
                        onExternalResult: onExternalResult,
                    },
                    moveEv.clientX,
                    moveEv.clientY
                )
            },
        })
    }

    // Prevents Chromium from starting its own HTML5 drag session which would
    // fight OLE for mouse capture. Must stay as long as layout components
    // have draggable="true" on rows and emit @dragstart.
    function onItemDragStart(_entry: any, ev: DragEvent) { ev.preventDefault() }

    function dispose() { resetDragState() }

    return {
        isDragging,
        isDropActive,
        folderDropTarget,
        onItemPointerDown,
        onItemDragStart,
        dispose,
    }
}