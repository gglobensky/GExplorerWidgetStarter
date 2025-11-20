// usePlaylist.ts - Queue operations (add, remove, save, load via host dialog)
import { type Ref } from 'vue'
import type { Track } from './usePlayerState'

// SDK bits for dialog + auth (static import ok)
import { authorizeFileRefs, type FileRefData } from 'gexplorer/widgets'
import { useDialog } from '/src/dialog/useDialog'

// Reuse converter (refs → gex:// items → tracks)
import { fileRefsToPlaylistItems } from '/src/widgets/dnd/utils'

// ---------- Lazy SDK import for FS wrappers (no Vue hooks here) ----------
let _sdkP: Promise<any> | null = null
function getSdk() {
  return (_sdkP ??= import('gexplorer/widgets').catch(() => ({} as any)))
}

async function tryReadText(path: string): Promise<string | null> {
  const sdk = await getSdk()
  return sdk.fsReadText ? sdk.fsReadText(path) : null
}
async function tryWriteText(path: string, text: string, mime?: string): Promise<boolean> {
  const sdk = await getSdk()
  if (!sdk.fsWriteText) return false
  await sdk.fsWriteText(path, text, mime)
  return true
}
// ------------------------------------------------------------------------

const ACCEPTED_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/oga',
  'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/wav', 'audio/webm'
]
const ACCEPTED_EXTS = [
  '.mp3', '.ogg', '.oga', '.aac', '.m4a', '.flac', '.wav', '.webm', '.gexm', '.m3u', '.m3u8'
]
export const INPUT_ACCEPT = [...ACCEPTED_MIMES, ...ACCEPTED_EXTS].join(',')

/** --- Session blob registry (keep alive all session; revoke on unload) --- */
const blobRegistry = new Set<string>()
let unloadHookInstalled = false
function registerBlob(u: string) { if (u?.startsWith('blob:')) blobRegistry.add(u); return u }
function ensureUnloadHook() {
  if (unloadHookInstalled) return
  unloadHookInstalled = true
  window.addEventListener('beforeunload', () => {
    for (const u of blobRegistry) { try { URL.revokeObjectURL(u) } catch {} }
    blobRegistry.clear()
  })
}

// Small helpers
function isAudioPath(path: string) { return /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(path) }
function isGexm(path: string) { return /\.gexm$/i.test(path) }
function isM3U(path: string) { return /\.(m3u|m3u8)$/i.test(path) }

export function usePlaylist(
  queue: Ref<Track[]>,
  currentIndex: Ref<number>,
  queueName: Ref<string>,
  isPlaying: Ref<boolean>,
  music: any,
  playlists: any,
  sel: any,
  toPlaylistItems: () => any[],
  ensureDnD: () => void,
  // who we are (needed for file-ref authorization)
  receiverWidgetType: string,
  receiverWidgetId: string
) {
  ensureUnloadHook()
  // optional: warm the SDK to reduce first-use latency (no await)
  void getSdk()

  // ---- internal helpers (dialog-based) ----
  function toHostFilters(defs: Array<{ name: string; extensions: string[] }>) {
  return defs.map(d => ({
    label: d.name,
    patterns: d.extensions.map(ext => {
      const e = ext.startsWith('.') ? ext.slice(1) : ext
      return `*.${e}`
    })
  }))
}

  async function refsToTracks(refs: FileRefData[]): Promise<Track[]> {
    const items = await fileRefsToPlaylistItems(refs, receiverWidgetType, receiverWidgetId)
    return items.map(it => ({
      id: it.id || it.src,
      url: it.src,
      name: it.name || it.src.split(/[\\/]/).pop() || 'track',
      type: it.type
    }))
  }

  function pathsToFileRefs(paths: string[]): FileRefData[] {
    return paths.map(p => ({ kind: 'file', path: p } as unknown as FileRefData))
  }

  async function appendTracks(tracks: Track[]) {
    if (!tracks.length) return
    const startEmpty = queue.value.length === 0
    queue.value = queue.value.concat(tracks)
    ensureDnD()
    playlists.setItems(sel, toPlaylistItems(), { keepCurrent: true })
    if (startEmpty) {
      const idx = await playlists.playIndex(sel, 0, music)
      if (idx >= 0) { currentIndex.value = idx; isPlaying.value = true }
    }
  }

  async function importGexmText(jsonText: string) {
    let data: any
    try { data = JSON.parse(jsonText) } catch { return }
    if (!data || data.kind !== 'gexm.playlist' || !Array.isArray(data.items)) return

    const imported: Track[] = []
    for (const it of data.items as Array<any>) {
      const name = String(it?.name ?? 'Unknown')
      const href = String(it?.href ?? '')
      const type = typeof it?.type === 'string' ? it.type : ''
      const id = `${name}-${Math.random().toString(36).slice(2)}`
      const hrefLower = href.toLowerCase()
      const looksPlayableNow = hrefLower.startsWith('http://') || hrefLower.startsWith('https://') || hrefLower.startsWith('gex://')
      if (looksPlayableNow) {
        imported.push({ id, name, url: href, type, srcHint: href, missing: false } as any)
      } else {
        imported.push({ id, name, url: '', type, srcHint: href, missing: true } as any)
      }
    }

    const startEmpty = queue.value.length === 0
    queue.value.push(...imported)
    if (startEmpty && queue.value.length) {
      const idx = await playlists.playIndex(sel, 0, music)
      if (idx >= 0) { currentIndex.value = idx; isPlaying.value = true }
    }
    ensureDnD()
  }

  function parseM3U(text: string): Track[] {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const out: Track[] = []
    for (const line of lines) {
      if (line.startsWith('#')) continue
      out.push({
        id: `m3u-${Math.random().toString(36).slice(2)}`,
        name: line.split(/[\\/]/).pop() || line,
        url: '',
        missing: true,
        srcHint: line
      } as any)
    }
    return out
  }

  // ---- public API ----
  async function addFiles(files: FileList | File[] | Iterable<File>): Promise<void> {
    const tracks: Track[] = []
    for (const f of Array.from(files as any)) {
      const name = f.name || ''
      const isAudio = ACCEPTED_MIMES.includes(f.type) || /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(name)
      if (!isAudio) continue
      const id = `${name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`
      const url = registerBlob(URL.createObjectURL(f))
      tracks.push({ id, name, url, type: f.type, srcHint: '', missing: false, _ownedBlob: true } as any)
    }
    await appendTracks(tracks)
  }

  async function removeAt(realIndex: number) {
    const t = queue.value[realIndex]
    if (t?.url?.startsWith('blob:') && (t as any)?._ownedBlob) {
      try { URL.revokeObjectURL(t.url); blobRegistry.delete(t.url) } catch {}
    }
    const wasCurrent = realIndex === currentIndex.value
    queue.value.splice(realIndex, 1)
    if (queue.value.length === 0) { clearQueue(); return }
    if (wasCurrent) {
      const nextIdx = Math.min(realIndex, queue.value.length - 1)
      if (isPlaying.value) {
        const idx = await playlists.playIndex(sel, nextIdx, music)
        if (idx >= 0) currentIndex.value = idx
      } else {
        prepare(nextIdx)
      }
    } else if (realIndex < currentIndex.value) {
      currentIndex.value -= 1
    }
    ensureDnD()
    playlists.setItems(sel, toPlaylistItems(), { keepCurrent: true })
  }

  function prepare(index: number) {
    if (index < 0 || index >= queue.value.length) return
    currentIndex.value = index
    const t = queue.value[index]
    if (!t?.url) return
    music.src = t.url
    music.load()
  }

  function clearQueue() {
    music.pause()
    for (const t of queue.value) {
      if (t.url?.startsWith('blob:') && (t as any)?._ownedBlob) {
        try { URL.revokeObjectURL(t.url); blobRegistry.delete(t.url) } catch {}
      }
    }
    queue.value = []
    currentIndex.value = -1
    ensureDnD()
    playlists.setItems(sel, toPlaylistItems(), { keepCurrent: true })
  }

  async function savePlaylistGexm() {
    try {
      const payload = {
        kind: 'gexm.playlist',
        version: 1,
        name: queueName.value,
        items: queue.value.map(t => ({
          name: t.name,
          href: t.url || '',
          type: (t as any).type || '',
          srcHint: (t as any).srcHint || '',
          missing: !!(t as any).missing
        }))
      }
      const text = JSON.stringify(payload, null, 2)

      // Prefer host Save dialog
      try {
        const dialog = useDialog()
        const sel = await dialog.open({
          kind: 'file.save',
          suggestedName: `${queueName.value || 'Playlist'}.gexm`,
          filters: toHostFilters([{ name: 'GExplorer Playlist', extensions: ['gexm'] }])
        })
        const targetPath: string | undefined = sel?.path || (sel?.paths?.[0] ?? undefined)

        if (targetPath && await tryWriteText(targetPath, text, 'application/json')) return
        
      } catch { /* fall through to browser fallback */ }

      // Browser fallback
      const blob = new Blob([text], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${queueName.value || 'Playlist'}.gexm`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      console.warn('[gexm:save] failed', e)
    }
  }

  async function openViaHostDialog(): Promise<boolean> {
  try {
      const dialog = useDialog()
      const sel = await dialog.open({
        kind: 'file.open',
        allowMultiple: true,
        // optional: startIn could be last-used dir if you track one
        filters: toHostFilters([
          { name: 'Audio', extensions: ['mp3','ogg','oga','aac','m4a','flac','wav','webm'] },
          { name: 'GExplorer Playlist', extensions: ['gexm'] },
          { name: 'M3U Playlist', extensions: ['m3u','m3u8'] }
        ])
      })

    // if user cancelled, consider it handled → do NOT fallback
    if (!sel || sel.cancelled) return true

    const paths = sel.paths || (sel.path ? [sel.path] : [])
    if (!paths.length) return true

    const refs: FileRefData[] = paths.map(p => ({ kind: 'file', path: p } as any))

    // Keep your existing auth step (ties access to this widget identity)
    const auth = await authorizeFileRefs(
      'local-player',
      receiverWidgetId,
      { type: 'gex/file-refs', data: refs },
      { requiredCaps: ['Read'] }
    )
    if (!auth.ok) return true

    const tracks = await refsToTracks(refs, 'local-player', receiverWidgetId)
    await appendTracks(tracks)
    if (queue.value.length === tracks.length && tracks.length) {
      const idx = await playlists.playIndex(sel, 0, music)
      if (idx >= 0) { currentIndex.value = idx; isPlaying.value = true }
    }
    return true
  } catch (e) {
      return false
    }
  }

  async function loadAndMerge() {
    // Prefer the host dialog…
    const handled = await openViaHostDialog()
      if (handled) return
      console.warn('[open] failed')
  }

  async function onFileInput(e: Event, fileInput: HTMLInputElement) {
    const input = e.target as HTMLInputElement
    const files = input.files ? Array.from(input.files) : []
    input.value = ''
    if (!files.length) return

    const playlistsFiles: File[] = []
    const audios: File[] = []
    for (const f of files) {
      const lname = (f.name || '').toLowerCase()
      if (lname.endsWith('.gexm')) playlistsFiles.push(f)
      else audios.push(f)
    }

    if (audios.length) await addFiles(audios)

    for (const pf of playlistsFiles) {
      try { await importGexmText(await pf.text()) } catch (err) { console.warn('[gexm] failed to read:', pf.name, err) }
    }
  }

  return {
    addFiles,
    removeAt,
    clearQueue,
    savePlaylistGexm,
    loadAndMerge,
    onFileInput
  }
}
