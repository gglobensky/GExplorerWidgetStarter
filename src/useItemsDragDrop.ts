// src/widgets/items/useItemsDragDrop.ts
//
// Drag & drop for the items widget.
// Uses useItemDropTarget from the DnD API for hover-target tracking —
// same composable a sticky-notes or playlist widget would use.
//
// Handles:
//   - Dragging files/folders out (creates GexDnDPayload)
//   - Dropping onto the widget root → move into cwd
//   - Dropping onto a specific folder row → move into that folder
//     Works for both inter-widget and intra-widget drops.
//   - Visual feedback: isDropActive (root), dropTargetKey (specific row)

import { ref, type Ref, type ComputedRef } from '/runtime/vue.js'
import {
    createGexPayload,
    setGexPayload,
    createDragPreview,
    hasGexPayload,
    extractGexPayload,
    authorizeFileRefs,
} from 'gexplorer/widgets'
import { useItemDropTarget } from '/src/widgets/dnd/useItemDropTarget'
import { fsMove, onFsQueueUpdate } from '/src/widgets/fs'
import { sendWidgetMessage } from '/src/widgets/instances'

export interface UseItemsDragDropOptions {
    sourceId: string
    entries: Ref<any[]>
    selected: Ref<Set<string>>
    cwd: Ref<string>
    merged: ComputedRef<any>
    marqueeActive: ComputedRef<boolean>
    loadDir: (path: string) => Promise<void>
    emit: (event: string, payload: any) => void
}

export interface UseItemsDragDropReturn {
    isDragging: Ref<boolean>
    isDropActive: Ref<boolean>
    /** FullPath of the folder row currently being hovered as a drop target, or null */
    folderDropTarget: Ref<string | null>
    onItemDragStart: (entry: any, event: DragEvent) => void
    onItemDragEnd: () => void
    onRootDragOver: (event: DragEvent) => void
    onRootDragLeave: (event: DragEvent) => void
    onRootDrop: (event: DragEvent) => Promise<void>
}

function normalizeDir(p: string | null | undefined): string {
    if (!p) return ''
    return p.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

function dirname(path: string): string {
    const normalized = path.replace(/[\\/]+$/, '')
    const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
    return idx < 0 ? '' : normalized.slice(0, idx)
}

function guessMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || ''
    const map: Record<string, string> = {
        mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
        flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', opus: 'audio/opus',
        mp4: 'video/mp4', mkv: 'video/x-matroska',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        txt: 'text/plain', json: 'application/json', pdf: 'application/pdf',
    }
    return map[ext] || 'application/octet-stream'
}

export function useItemsDragDrop(options: UseItemsDragDropOptions): UseItemsDragDropReturn {
    const { sourceId, entries, selected, cwd, merged, marqueeActive, loadDir, emit } = options

    // ── State ─────────────────────────────────────────────────────────────────

    const isDragging = ref(false)
    const isDropActive = ref(false)

    // ── Folder hover targeting (via generic DnD API) ──────────────────────────
    //
    // canDrop rules:
    //   - Target must be a directory
    //   - Inter-widget: always ok if it's a dir
    //   - Intra-widget (same widget): ok only if at least one dragged item
    //     is not already a direct child of the target folder

    const {
        dropTargetKey: folderDropTarget,
        onTargetDragOver,
        onTargetDragLeave,
        resolveDropTarget,
    } = useItemDropTarget<string>(
        {
            rowSelector: '.row[data-path]',
            getKey: el => el.dataset.path ?? null,
            canDrop: (key, payload) => {
                // Must be a directory
                const entry = entries.value.find(e => e.FullPath === key)
                if (!entry || entry.Kind !== 'dir') return false

                // During dragover payload is null — dir check is enough for hover highlight
                if (!payload) return true

                const refs = (payload.data ?? []) as Array<{ path: string }>

                // Inter-widget: always fine
                if (payload.source.widgetId !== sourceId) return true

                // Intra-widget: allow only if at least one item moves to a new parent
                const targetNorm = normalizeDir(key)
                return refs.some(r => normalizeDir(dirname(r.path)) !== targetNorm)
            },
        }
    )

    // ── Drag Start ────────────────────────────────────────────────────────────

    function onItemDragStart(entry: any, event: DragEvent) {
        if (!event.dataTransfer) return

        if (marqueeActive.value) {
            event.preventDefault()
            return
        }

        isDragging.value = true

        try {
            const paths = selected.value.size > 0
                ? [...selected.value]
                : [entry.FullPath]

            const payload = createGexPayload(
                'gex/file-refs',
                paths.map(p => ({
                    path: p,
                    name: entries.value.find(x => x.FullPath === p)?.Name ?? '',
                    size: entries.value.find(x => x.FullPath === p)?.Size ?? 0,
                    mimeType: guessMimeType(p),
                    isDirectory: entries.value.find(x => x.FullPath === p)?.Kind === 'dir',
                })),
                { widgetType: 'items', widgetId: sourceId }
            )

            setGexPayload(event.dataTransfer, payload)
            event.dataTransfer.effectAllowed = 'copyMove'

            const preview = createDragPreview({
                label: selected.value.size > 1 ? `${paths.length} items` : entry.Name,
                icon: entry.Kind === 'dir' ? '📁' : '📄',
                count: paths.length,
            })
            event.dataTransfer.setDragImage(preview, 0, 0)
            setTimeout(() => preview.remove(), 0)
        } catch (err) {
            console.error('[Items] drag failed:', err)
        }
    }

    // ── Drag End ──────────────────────────────────────────────────────────────

    function onItemDragEnd() {
        isDragging.value = false
        folderDropTarget.value = null
    }

    // ── Drag Over ─────────────────────────────────────────────────────────────
    //
    // Two layers:
    //   1. Specific folder row → handled by useItemDropTarget (highlights row)
    //   2. Container background → handled here (highlights root outline)
    //
    // Both call preventDefault so the browser allows the drop.

    function onRootDragOver(ev: DragEvent) {
        if (!hasGexPayload(ev)) return

        // Let the item-level targeting run first (updates folderDropTarget)
        onTargetDragOver(ev)

        // Always allow the drop on the root too — background drops go to cwd
        ev.preventDefault()
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
        isDropActive.value = true
    }

    // ── Drag Leave ────────────────────────────────────────────────────────────

    function onRootDragLeave(ev: DragEvent) {
        const current = ev.currentTarget as HTMLElement | null
        const related = ev.relatedTarget as HTMLElement | null
        if (current && related && current.contains(related)) return

        isDropActive.value = false
        onTargetDragLeave(ev)
    }

    // ── Drop ──────────────────────────────────────────────────────────────────

    async function onRootDrop(ev: DragEvent) {
        isDropActive.value = false

        const payload = extractGexPayload(ev)
        if (!payload || payload.type !== 'gex/file-refs') return

        // Resolve the specific folder target (clears folderDropTarget ref)
        const specificTarget = resolveDropTarget(ev)
        const srcId = payload.source?.widgetId

        // Block same-widget drops UNLESS they're targeting a specific subfolder
        if (srcId === sourceId && !specificTarget) return

        ev.preventDefault()
        ev.stopPropagation()

        try {
            const auth = await authorizeFileRefs('items', sourceId, payload)
            if (!auth?.ok) {
                console.warn('[Items] Drop not authorized:', auth?.reason)
                return
            }

            const refs = (payload.data ?? []) as any[]
            if (!refs.length) return

            // specificTarget wins over cwd (folder row drop vs background drop)
            const target = specificTarget ?? cwd.value ?? merged.value.rpath ?? ''
            if (!target) {
                console.warn('[Items] Drop ignored: no target')
                return
            }

            // Filter out items already in the target directory
            const destNorm = normalizeDir(target)
            const sources = refs
                .map(r => String(r?.path ?? ''))
                .filter(p => {
                    if (!p) return false
                    const m = p.match(/^(.*[\\/])[^\\/]+$/)
                    return normalizeDir(m ? m[1] : '') !== destNorm
                })

            if (!sources.length) {
                console.debug('[Items] drop: all refs already in target; nothing to move')
                return
            }

            const items = sources.map(from => ({ from, to: target }))
            const jobPromise = fsMove(items, 'items', sourceId)

            const off = onFsQueueUpdate(job => {
                if (job.op.kind !== 'fs.move') return

                emit('event', {
                    type: 'fs-job:update',
                    payload: { jobId: job.id, state: job.state, progress: job.progress, error: job.error },
                })

                if (job.state === 'succeeded' || job.state === 'failed' || job.state === 'cancelled') {
                    off()
                    emit('event', {
                        type: 'fs-job:finished',
                        payload: { jobId: job.id, state: job.state, error: job.error },
                    })
                }
            })

            emit('event', {
                type: 'fs-job:started',
                payload: { kind: 'fs.move', target, items },
            })

            const job = await jobPromise
            console.log('[Items] fsMove done:', { state: job.state, error: job.error })

            if (job.state === 'succeeded') {
                await loadDir(cwd.value || merged.value.rpath || '')

                if (srcId && srcId !== sourceId) {
                    sendWidgetMessage({
                        from: sourceId,
                        to: srcId,
                        topic: 'fs:refresh-after-drop',
                        payload: { kind: 'fs.move', target },
                    })
                }
            }
        } catch (err) {
            console.error('[Items] drop failed:', err)
        }
    }

    return {
        isDragging,
        isDropActive,
        folderDropTarget,
        onItemDragStart,
        onItemDragEnd,
        onRootDragOver,
        onRootDragLeave,
        onRootDrop,
    }
}