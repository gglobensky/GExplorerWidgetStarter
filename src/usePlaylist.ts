// usePlaylist.ts - Queue operations (add, remove, save, load)
import { type Ref } from 'vue'
import type { Track } from './usePlayerState'

const ACCEPTED_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/oga',
  'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/wav', 'audio/webm'
]

const ACCEPTED_EXTS = [
  '.mp3', '.ogg', '.oga', '.aac', '.m4a', '.flac', '.wav', '.webm', '.gexm'
]

export const INPUT_ACCEPT = [...ACCEPTED_MIMES, ...ACCEPTED_EXTS].join(',')

/** --- Session blob registry (keep alive all session; revoke on unload) --- */
const blobRegistry = new Set<string>()
let unloadHookInstalled = false

function registerBlob(u: string) {
  if (u && u.startsWith('blob:')) blobRegistry.add(u)
  return u
}

function ensureUnloadHook() {
  if (unloadHookInstalled) return
  unloadHookInstalled = true
  window.addEventListener('beforeunload', () => {
    for (const u of blobRegistry) {
      try { URL.revokeObjectURL(u) } catch {}
    }
    blobRegistry.clear()
  })
}

export function usePlaylist(
  queue: Ref<Track[]>,
  currentIndex: Ref<number>,
  queueName: Ref<string>,
  isPlaying: Ref<boolean>,
  music: any,
  playlists: any,
  sel: any,
  toPlaylistItems: () => any[],
  ensureDnD: () => void
) {
  ensureUnloadHook()

  async function addFiles(files: FileList | File[] | Iterable<File>): Promise<void> {
    const tracks: Track[] = []

    for (const f of Array.from(files as any)) {
      const name = f.name || ''
      const isAudio =
        ACCEPTED_MIMES.includes(f.type) ||
        /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(name)

      if (!isAudio) continue

      const id = `${name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`
      const url = registerBlob(URL.createObjectURL(f))

      tracks.push({
        id,
        name,
        url,
        type: f.type,
        srcHint: '',
        missing: false,
        _ownedBlob: true
      })
    }

    if (!tracks.length) return

    const startEmpty = queue.value.length === 0
    queue.value.push(...tracks)

    ensureDnD()
    playlists.setItems(sel, toPlaylistItems())

    if (startEmpty) {
      const idx = await playlists.playIndex(sel, 0, music)
      if (idx >= 0) {
        currentIndex.value = idx
        isPlaying.value = true
      }
    }
  }

  async function removeAt(realIndex: number) {
    const t = queue.value[realIndex]

    console.log('[usePlaylist] removeAt', realIndex, {
      trackName: t?.name,
      url: t?.url,
      _ownedBlob: t?._ownedBlob,
      willRevoke: t?.url?.startsWith('blob:') && t._ownedBlob
    })

    // Only revoke blobs we own (safe to free memory when the track is removed)
    if (t?.url?.startsWith('blob:') && t._ownedBlob) {
      try {
        console.log('[usePlaylist] Revoking blob:', t.url)
        URL.revokeObjectURL(t.url)
        blobRegistry.delete(t.url)
      } catch {}
    }

    const wasCurrent = realIndex === currentIndex.value
    queue.value.splice(realIndex, 1)

    if (queue.value.length === 0) {
      clearQueue()
      return
    }

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
    // NOTE: This is your existing "prepare without play" path.
    // If/when the AudioRack exposes a "select without play" API, call that here instead.
    music.src = t.url
    music.load()
  }

  function clearQueue() {
    music.pause()

    for (const t of queue.value) {
      if (t.url?.startsWith('blob:') && t._ownedBlob) {
        try {
          URL.revokeObjectURL(t.url)
          blobRegistry.delete(t.url)
        } catch {}
      }
    }

    queue.value = []
    currentIndex.value = -1
    ensureDnD()
    playlists.setItems(sel, toPlaylistItems(), { keepCurrent: true })
  }

  async function importGexm(jsonText: string) {
    let data: any
    try {
      data = JSON.parse(jsonText)
    } catch {
      return
    }

    if (!data || data.kind !== 'gexm.playlist' || !Array.isArray(data.items)) return

    const imported: Track[] = []
    for (const it of data.items as Array<any>) {
      const name = String(it?.name ?? 'Unknown')
      const href = String(it?.href ?? '')
      const type = typeof it?.type === 'string' ? it.type : ''
      const id = `${name}-${Math.random().toString(36).slice(2)}`
      const hrefLower = href.toLowerCase()
      const looksPlayableNow =
        hrefLower.startsWith('http://') || hrefLower.startsWith('https://')

      if (looksPlayableNow) {
        imported.push({ id, name, url: href, type, srcHint: href, missing: false })
      } else {
        imported.push({ id, name, url: '', type, srcHint: href, missing: true })
      }
    }

    const startEmpty = queue.value.length === 0
    queue.value.push(...imported)

    if (startEmpty && queue.value.length) {
      const idx = await playlists.playIndex(sel, 0, music)
      if (idx >= 0) {
        currentIndex.value = idx
        isPlaying.value = true
      }
    }

    ensureDnD()
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
          type: t.type || '',
          srcHint: t.srcHint || '',
          missing: !!t.missing
        }))
      }
      const text = JSON.stringify(payload, null, 2)

      // @ts-ignore
      if ('showSaveFilePicker' in window) {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName: `${queueName.value || 'Playlist'}.gexm`,
          types: [
            {
              description: 'GExplorer Music Playlist',
              accept: { 'application/json': ['.gexm'] }
            }
          ]
        })
        const writable = await handle.createWritable()
        await writable.write(new Blob([text], { type: 'application/json' }))
        await writable.close()
        return
      }

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

  async function loadAndMerge(fileInput: HTMLInputElement | null) {
    try {
      // @ts-ignore
      if ('showOpenFilePicker' in window) {
        // @ts-ignore
        const handles: FileSystemFileHandle[] = await window.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'Audio',
              accept: { 'audio/*': ['.mp3', '.ogg', '.oga', '.aac', '.m4a', '.flac', '.wav', '.webm'] }
            },
            {
              description: 'GExplorer Playlist',
              accept: { 'application/json': ['.gexm'] }
            },
            {
              description: 'M3U Playlist',
              accept: { 'audio/x-mpegurl': ['.m3u', '.m3u8'] }
            }
          ]
        })

        const toAdd: Track[] = []
        const placeholders: Track[] = []

        for (const h of handles) {
          const file = await h.getFile()
          const nameLower = file.name.toLowerCase()

          if (nameLower.endsWith('.gexm')) {
            try {
              const txt = await file.text()
              await importGexm(txt)
            } catch (e) {
              console.warn('[gexm:open] parse failed', e)
            }
            continue
          }

          if (nameLower.endsWith('.m3u') || nameLower.endsWith('.m3u8')) {
            try {
              const txt = await file.text()
              const lines = txt
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(Boolean)
              for (const line of lines) {
                if (line.startsWith('#')) continue
                placeholders.push({
                  id: `m3u-${Math.random().toString(36).slice(2)}`,
                  name: line.split(/[\\/]/).pop() || line,
                  url: '',
                  missing: true,
                  srcHint: line
                })
              }
            } catch (e) {
              console.warn('[m3u:open] parse failed', e)
            }
            continue
          }

          if (
            ACCEPTED_MIMES.includes(file.type) ||
            /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(file.name)
          ) {
            const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`
            const url = registerBlob(URL.createObjectURL(file))
            toAdd.push({ id, name: file.name, url, type: file.type, _ownedBlob: true })
          }
        }

        const startEmpty = queue.value.length === 0
        queue.value.push(...toAdd, ...placeholders)

        if (startEmpty && toAdd.length) {
          const idx = await playlists.playIndex(sel, 0, music)
          if (idx >= 0) {
            currentIndex.value = idx
            isPlaying.value = true
          }
        }

        ensureDnD()
        return
      }

      // Fallback to file input
      fileInput?.click()
    } catch (e) {
      console.warn('[open] failed', e)
    }
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
      try {
        const text = await pf.text()
        await importGexm(text)
      } catch (err) {
        console.warn('[gexm] failed to read:', pf.name, err)
      }
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
