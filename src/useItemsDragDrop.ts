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
    sourceId: string
    entries:  Ref<any[]>
    selected: Ref<Set<string>>
    cwd:      Ref<string>
    merged:   ComputedRef<any>
    marqueeActive: ComputedRef<boolean>
    rootEl:   Ref<HTMLElement | null>   // ref to the .items-root element
    loadDir:  (path: string) => Promise<void>
    emit:     (event: string, payload: any) => void
}

export interface UseItemsDragDropReturn {
    isDragging:       Ref<boolean>
    isDropActive:     Ref<boolean>
    folderDropTarget: Ref<string | null>
    onItemPointerDown: (entry: any, event: PointerEvent) => void
    onItemDragStart:   (entry: any, event: DragEvent) => void
    onItemDragEnd:     () => void
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

/**
 * Walk up from startEl looking for the nearest folder row.
 * Only searches within entries for this widget instance.
 */
function findFolderRow(startEl: Element | null, entries: any[]): string | null {
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
    const { sourceId, entries, selected, cwd, merged, marqueeActive, rootEl, loadDir } = options

    const isDragging       = ref(false)
    const isDropActive     = ref(false)
    const folderDropTarget = ref<string | null>(null)

    let currentPayload: GexDnDPayload | null = null
    let cleanupDrag: (() => void) | null = null

    // ── Widget registry ────────────────────────────────────────────────────────
    // Register this pane so cross-pane drops can find us by bounding rect.

    onMounted(() => {
        registerDropWidget(sourceId, () => cwd.value, () => rootEl.value)
    })

    onBeforeUnmount(() => {
        unregisterDropWidget(sourceId)
    })

    // ── State reset ────────────────────────────────────────────────────────────

    function resetDragState() {
        isDragging.value       = false
        isDropActive.value     = false
        folderDropTarget.value = null
        currentPayload         = null
        cleanupDrag?.()
        cleanupDrag = null
    }

    // ── IPC drag callbacks ─────────────────────────────────────────────────────

    function onNativeDragOver(x: number, y: number) {
        isDropActive.value     = true
        // elementFromPoint is reliable for same-pane folder-row detection since
        // we're just reading the DOM, not relying on pointer event routing.
        folderDropTarget.value = findFolderRow(document.elementFromPoint(x, y), entries.value)
    }

    function onNativeDragLeave() {
        isDropActive.value     = false
        folderDropTarget.value = null
    }

    async function onNativeDrop(x: number, y: number) {
        const payload = currentPayload
        resetDragState()
        if (!payload || payload.type !== 'gex/file-refs') return

        // Use the registry to find which widget the drop landed in —
        // getBoundingClientRect() is reliable even during OLE drag.
        const dropWidget = findWidgetAtPoint(x, y)
        const droppedOnSelf = !dropWidget || dropWidget.widgetId === sourceId

        // Check for a folder row target (works for same-pane drops onto folders)
        const folderTarget = findFolderRow(document.elementFromPoint(x, y), entries.value)

        if (droppedOnSelf && !folderTarget) {
            console.debug('[Items] drop: background of own widget, ignoring')
            return
        }

        const target = folderTarget ?? dropWidget?.cwd ?? null
        const targetWidgetId = dropWidget?.widgetId ?? null
        await executeDrop(payload, target, targetWidgetId)
    }

    async function onExternalResult(effect: string) {
        const refreshDir = cwd.value || merged.value?.rpath || ''
        resetDragState()
        if (effect === 'move' && refreshDir) {
            await loadDir(refreshDir)
        }
    }

    // ── Core drop logic ────────────────────────────────────────────────────────

    async function executeDrop(
        payload: GexDnDPayload,
        target: string | null,
        targetWidgetId: string | null
    ) {
        if (!target) return

        try {
            const auth = await authorizeFileRefs('items', sourceId, payload)
            if (!auth?.ok) { console.warn('[Items] Drop not authorized:', auth?.reason); return }

            const refs = (payload.data ?? []) as any[]
            if (!refs.length) return

            const destNorm = normalizeDir(target)
            const sources = refs
                .map(r => String(r?.path ?? ''))
                .filter(p => {
                    if (!p) return false
                    const m = p.match(/^(.*[\\/])[^\\/]+$/)
                    return normalizeDir(m ? m[1] : '') !== destNorm
                })

            if (!sources.length) { console.debug('[Items] drop: all refs already in target'); return }

            const sep = target.includes('\\') || target.includes('\\') ? '\\' : '/'
            const items = sources.map(from => {
                const name = from.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
                return { from, to: target.replace(/[\\/]+$/, '') + sep + name }
            })
            await fsMove(items, 'items', sourceId)
            await loadDir(cwd.value || merged.value?.rpath || '')

            if (targetWidgetId && targetWidgetId !== sourceId) {
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

    // Muzzle Chromium's own drag so OLE can take exclusive mouse capture
    function onItemDragStart(_entry: any, ev: DragEvent) { ev.preventDefault() }
    function onItemDragEnd() {}

    function dispose() { resetDragState() }

    return {
        isDragging,
        isDropActive,
        folderDropTarget,
        onItemPointerDown,
        onItemDragStart,
        onItemDragEnd,
        dispose,
    }
}