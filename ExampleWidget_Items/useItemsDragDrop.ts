import { ref, type Ref, type ComputedRef } from '/runtime/vue.js'
import {
  createGexPayload,
  setGexPayload,
  createDragPreview,
  hasGexPayload,
  extractGexPayload,
  authorizeFileRefs
} from 'gexplorer/widgets'
import { fsMove, onFsQueueUpdate } from '/src/widgets/fs'
import { sendWidgetMessage } from '/src/widgets/instances'

/**
 * useItemsDragDrop - Composable for handling drag & drop operations
 * 
 * Handles:
 * - Dragging files/folders out of this widget (creates GexPayload)
 * - Receiving drops from other widgets (extracts GexPayload, moves files)
 * - Visual feedback (isDragging, isDropActive)
 * - File operation events (fs-job:started, fs-job:update, fs-job:finished)
 */

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
  onItemDragStart: (entry: any, event: DragEvent) => void
  onItemDragEnd: () => void
  onRootDragOver: (event: DragEvent) => void
  onRootDragLeave: (event: DragEvent) => void
  onRootDrop: (event: DragEvent) => Promise<void>
}

/**
 * Normalizes directory paths for comparison
 * Converts to backslashes, removes trailing separators, lowercase
 */
function normalizeDir(p: string | null | undefined): string {
  if (!p) return ''
  return p.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

/**
 * Guess MIME type from file extension
 * Used for creating GexPayload with proper media type hints
 */
function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
    flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', opus: 'audio/opus',
    mp4: 'video/mp4', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain', json: 'application/json', pdf: 'application/pdf'
  }
  return map[ext] || 'application/octet-stream'
}

export function useItemsDragDrop(options: UseItemsDragDropOptions): UseItemsDragDropReturn {
  const { sourceId, entries, selected, cwd, merged, marqueeActive, loadDir, emit } = options

  // ---- State ----
  const isDragging = ref(false)
  const isDropActive = ref(false)

  // ---- Drag Start: Create GexPayload ----
  function onItemDragStart(entry: any, event: DragEvent) {
    if (!event.dataTransfer) return
    
    // Suppress drag when marquee selecting
    if (marqueeActive.value) {
      event.preventDefault()
      return
    }

    isDragging.value = true

    try {
      // Use selected items if any, otherwise just the dragged item
      const paths = (selected.value.size > 0 ? [...selected.value] : [entry.FullPath])

      // Build GexPayload with file metadata
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

      // Create drag preview
      const preview = createDragPreview({
        label: (selected.value.size > 1 ? `${paths.length} items` : entry.Name),
        icon: entry.Kind === 'dir' ? '📁' : '📄',
        count: paths.length
      })
      event.dataTransfer.setDragImage(preview, 0, 0)
      setTimeout(() => preview.remove(), 0)
    } catch (err) {
      console.error('[Items] drag failed:', err)
    }
  }

  // ---- Drag End ----
  function onItemDragEnd() {
    isDragging.value = false
  }

  // ---- Drag Over: Highlight drop zone ----
  function onRootDragOver(ev: DragEvent) {
    const dt = ev.dataTransfer
    if (!dt) return

    const has = hasGexPayload(dt)
    if (!has) return

    ev.preventDefault()
    dt.dropEffect = 'move'
    isDropActive.value = true
  }

  // ---- Drag Leave: Remove highlight ----
  function onRootDragLeave(ev: DragEvent) {
    const current = ev.currentTarget as HTMLElement | null
    const related = ev.relatedTarget as HTMLElement | null

    // Only clear highlight if actually leaving the container
    if (current && related && current.contains(related)) return

    isDropActive.value = false
  }

  // ---- Drop: Handle file move ----
  async function onRootDrop(ev: DragEvent) {
    const payload = extractGexPayload(ev)
    isDropActive.value = false

    if (!payload || payload.type !== 'gex/file-refs') return

    const srcId = (payload as any).source?.widgetId
    
    // Ignore drops from ourselves
    if (srcId === sourceId) return

    ev.preventDefault()
    ev.stopPropagation()

    try {
      // 1) Authorize the drop (security check)
      const auth = await authorizeFileRefs('items', sourceId, payload)
      if (!auth?.ok) {
        console.warn('[Items] Drop not authorized:', auth?.reason)
        return
      }

      const refs = payload.data || []
      if (!refs.length) return

      const target = cwd.value || merged.value.rpath || ''
      if (!target) {
        console.warn('[Items] Drop ignored: no cwd')
        return
      }

      // 2) Filter out files already in target directory
      const destNorm = normalizeDir(target)
      const sources: string[] = []

      for (const r of refs as any[]) {
        const p = String(r?.path ?? '')
        if (!p) continue
        
        // Extract parent directory
        const m = p.match(/^(.*[\\/])[^\\/]+$/)
        const parentNorm = normalizeDir(m ? m[1] : '')
        
        // Skip if already in target
        if (parentNorm === destNorm) continue
        
        sources.push(p)
      }

      if (!sources.length) {
        console.debug('[Items] drop: all refs already in target; nothing to move')
        return
      }

      // 3) Kick off the file move operation
      const items = sources.map(from => ({ from, to: target }))
      const jobPromise = fsMove(items, 'items', sourceId)

      // 4) Listen for job updates and emit events
      const off = onFsQueueUpdate(job => {
        if (job.op.kind === 'fs.move') {
          emit('event', {
            type: 'fs-job:update',
            payload: {
              jobId: job.id,
              state: job.state,
              progress: job.progress,
              error: job.error,
            },
          })

          // Cleanup listener when job finishes
          if (
            job.state === 'succeeded' ||
            job.state === 'failed' ||
            job.state === 'cancelled'
          ) {
            off()
            emit('event', {
              type: 'fs-job:finished',
              payload: {
                jobId: job.id,
                state: job.state,
                error: job.error,
              },
            })
          }
        }
      })

      // 5) Emit started event
      emit('event', {
        type: 'fs-job:started',
        payload: {
          kind: 'fs.move',
          target,
          items,
        },
      })

      // 6) Wait for completion and refresh
      const job = await jobPromise
      console.log('[Items] fsMove done:', {
        state: job.state,
        error: job.error,
        op: job.op,
      })

      if (job.state === 'succeeded') {
        // Refresh this widget's directory
        const path = cwd.value || merged.value.rpath || ''
        if (path) {
          await loadDir(path)
        }

        // Ask source widget to refresh too
        if (srcId && srcId !== sourceId) {
          sendWidgetMessage({
            from: sourceId,
            to: srcId,
            topic: 'fs:refresh-after-drop',
            payload: {
              kind: 'fs.move',
              target: path,
            },
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
    onItemDragStart,
    onItemDragEnd,
    onRootDragOver,
    onRootDragLeave,
    onRootDrop
  }
}