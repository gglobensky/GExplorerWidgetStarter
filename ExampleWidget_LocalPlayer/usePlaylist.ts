// usePlaylist.ts - The queue's files: adding (file dialog, drops, menu actions), removing,
// clearing, and playlist files (M3U / M3U8: m3u.ts).
//
// MISSING TRACKS (2026-10-09)
// A file that can't be played when it is added (not there: a playlist's moved file, a drive
// unplugged; its folder's administrator rights declined) stays in the queue, greyed
// (track.missing, track.missingReason: the backend's code). The rack's list holds the
// playable tracks only (usePlayerState.toPlaylistItems), so playing on skips them by
// itself. Playing one on purpose tries it again (the file may be back): it plays, or a
// snackbar says why not and the next playable track plays.
//
// .gexm is gone (2026-10-09): it saved each track's stream URL, dead after the session.
import { inject } from '/runtime/vue.js'
import type { WidgetSdk, FileRefData } from 'gexplorer/widgets'
import type { Track, usePlayerState } from './usePlayerState'
import { parseM3U, buildM3U, baseName, dirOf } from './m3u'

type PlayerState = ReturnType<typeof usePlayerState>

export const AUDIO_EXTS = ['mp3', 'ogg', 'oga', 'opus', 'aac', 'm4a', 'flac', 'wav', 'webm']
export const PLAYLIST_EXTS = ['m3u', 'm3u8']
const ACCEPTED_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/oga', 'audio/opus',
  'audio/aac', 'audio/x-m4a', 'audio/mp4', 'audio/flac', 'audio/wav', 'audio/webm'
]
const AUDIO_RE = new RegExp(`\\.(${AUDIO_EXTS.join('|')})$`, 'i')

export function isAudioPath(path: string) { return AUDIO_RE.test(path) }
export function isPlaylistPath(path: string) { return /\.m3u8?$/i.test(path) }

/** Why a file can't be played or opened, in words (the backend's codes). */
export function reasonText(code?: string): string {
  switch (code) {
    case 'E_NOT_FOUND': return 'file not found'
    case 'E_IS_FOLDER': return 'it is a folder'
    case 'E_ACCESS_DENIED':
    case 'E_NEEDS_ELEVATION':
    case 'E_ELEVATION_DECLINED': return 'access refused'
    case 'E_TOO_LARGE': return 'the file is too large'
    default: return 'it could not be opened'
  }
}

function codeOf(err: any): string {
  const m = /\bE_[A-Z_]+\b/.exec(String(err?.code ?? err?.message ?? err))
  return m ? m[0] : 'E_FAILED'
}

/** A file name from a playlist name (characters Windows refuses replaced). */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim() || 'Playlist'
}

// Track ids: unique per entry (a playlist may list a file twice; the queue's sortable view
// and the rack go by id).
let idSeq = 0
function newTrackId(path: string): string {
  return `${path}#${Date.now().toString(36)}${(idSeq++).toString(36)}`
}

/** --- Session blob registry (OS drops as File objects: keep alive all session; revoke on unload) --- */
const blobRegistry = new Set<string>()
let unloadHookInstalled = false
function registerBlob(u: string) { if (u?.startsWith('blob:')) blobRegistry.add(u); return u }
function ensureUnloadHook() {
  if (unloadHookInstalled) return
  unloadHookInstalled = true
  window.addEventListener('beforeunload', () => {
    for (const u of blobRegistry) { try { URL.revokeObjectURL(u) } catch { } }
    blobRegistry.clear()
  })
}
function revokeOwnedBlob(t: Track | undefined) {
  if (t?.url?.startsWith('blob:') && t._ownedBlob) {
    try { URL.revokeObjectURL(t.url); blobRegistry.delete(t.url) } catch { }
  }
}

export type PlaylistEntry = { path: string; title?: string; duration?: number }

/**
 * <playAt>: plays queue track <index> (Widget.vue's play: tries a missing one again, goes
 * on to the next when it still can't). Called from Widget.vue's setup() (inject works).
 */
export function usePlaylist(state: PlayerState, sourceId: string, playAt: (index: number) => Promise<void>) {
  ensureUnloadHook()

  const sdk = inject<WidgetSdk>('widgetSdk')
  if (!sdk) throw new Error('[local-player] usePlaylist: widgetSdk is not provided')
  if (!sdk.ui || !sdk.fileRefsToPlaylistItems) throw new Error('[local-player] usePlaylist: widgetSdk.ui / fileRefsToPlaylistItems missing')
  const ui = sdk.ui()
  const { queue, currentIndex, queueName, isPlaying, music, playlists, sel } = state

  function sync(keepCurrent = true) {
    playlists.setItems(sel, state.toPlaylistItems(), { keepCurrent })
  }

  // ── Durations (2026-10-09) ───────────────────────────────────────────────
  // Read by the backend (sdk.mediaInfo: the platform's media reader, the Windows property
  // store; nothing on Linux yet), in batches, for tracks with a file and no length yet.
  // A playlist's #EXTINF lengths are kept; a track that plays gets its length from the
  // element too (Widget.vue onLoadedMeta). Each file is asked once per session.
  const probed = new Set<string>()
  let probing = false
  async function probeDurations() {
    if (probing || !sdk!.mediaInfo) return
    probing = true
    try {
      for (;;) {
        const want = [...new Set(queue.value
          .filter(t => t.sourcePath && !t.duration && !t.missing && !probed.has(t.sourcePath))
          .map(t => t.sourcePath!))].slice(0, 500)
        if (!want.length) break
        for (const p of want) probed.add(p)
        let items: Array<{ path: string; durationMs?: number | null }>
        try { items = await sdk!.mediaInfo!(want) }
        catch (err) { console.warn('[local-player] durations not read:', err); break }
        const ms = new Map<string, number>()
        for (const it of items) if (it.durationMs && it.durationMs > 0) ms.set(it.path, it.durationMs)
        if (!ms.size) continue
        for (const t of queue.value) {
          const d = !t.duration && t.sourcePath ? ms.get(t.sourcePath) : undefined
          if (d) t.duration = d / 1000
        }
      }
    } finally {
      probing = false
    }
  }

  function snack(id: string, text: string, timeoutMs = 6000) {
    void ui.snack({ id, dedupe: 'replace', text, timeoutMs } as any)
  }

  // ── Files -> tracks ──────────────────────────────────────────────────────

  /**
   * Tracks for files, in order: playable ones (stream URLs minted for this widget; a protected
   * folder asks for administrator rights once) and missing ones (greyed). failed: how many missing.
   */
  async function tracksFor(entries: PlaylistEntry[]): Promise<{ tracks: Track[]; failed: number }> {
    const refs = entries.map(e => ({ kind: 'file', path: e.path, name: baseName(e.path), id: newTrackId(e.path) }))
    const failed = new Map<string, string>()
    const items = await sdk!.fileRefsToPlaylistItems!(refs as unknown as FileRefData[], 'local-player', sourceId, {
      onFailed: (ref: any, code: string) => { failed.set(ref.id, code) },
    })
    const byId = new Map(items.map(it => [it.id, it]))
    const tracks = refs.map((r, i): Track => {
      const e = entries[i]
      const it = byId.get(r.id)
      if (it) {
        return {
          id: r.id,
          url: it.src,
          name: e.title || it.name || r.name,
          type: it.type,
          // The stream URL expires (and dies with GEM Shell): the rack renews it from the file
          sourcePath: it.sourcePath,
          expiresAt: it.expiresAt ?? null,
          ...(e.duration ? { duration: e.duration } : {}),
        }
      }
      return {
        id: r.id,
        url: '',
        name: e.title || r.name,
        sourcePath: e.path,
        missing: true,
        missingReason: failed.get(r.id) ?? 'E_FAILED',
        ...(e.duration ? { duration: e.duration } : {}),
      }
    })
    return { tracks, failed: failed.size }
  }

  /** Adds tracks at the end. play: start the first playable one of them; else only when nothing in the queue could play before. */
  async function appendTracks(tracks: Track[], play = false) {
    if (!tracks.length) return
    const hadPlayable = queue.value.some(t => !!t.url)
    const start = queue.value.length
    // A new array: the queue's sortable view (useSortable) follows reassignments only.
    queue.value = queue.value.concat(tracks)
    sync()
    void probeDurations()
    if (play || !hadPlayable) {
      const first = queue.value.findIndex((t, i) => i >= start && !!t.url)
      if (first >= 0) await playAt(first)
    }
  }

  /** The queue becomes <tracks> (named <name> when given) and plays from the first playable one. */
  async function replaceQueue(tracks: Track[], name?: string) {
    music.pause()
    for (const t of queue.value) revokeOwnedBlob(t)
    queue.value = tracks.slice()
    currentIndex.value = -1
    if (name) queueName.value = name
    sync(false)
    void probeDurations()
    const first = queue.value.findIndex(t => !!t.url)
    if (first >= 0) await playAt(first)
  }

  /**
   * What a list of paths gives, in its order: audio files as they are, playlist files expanded
   * where they stand (read and parsed; nothing minted yet). Other files and folders are counted
   * apart (never expanded: Guillaume).
   */
  async function collect(paths: string[]) {
    const entries: PlaylistEntry[] = []
    const lists: { file: string; name: string }[] = []
    let web = 0, other = 0
    const unreadable: string[] = []
    for (const p of paths) {
      if (isPlaylistPath(p)) {
        const file = baseName(p)
        let text: string
        try {
          text = (await sdk!.fsReadText!(p)).text
        } catch (err) {
          console.warn('[local-player] playlist not read:', p, err)
          unreadable.push(`"${file}" (${reasonText(codeOf(err))})`)
          continue
        }
        const pl = parseM3U(text, p)
        const files = pl.entries.filter(e => !!e.path) as PlaylistEntry[]
        web += pl.entries.length - files.length
        lists.push({ file, name: pl.name || file.replace(/\.m3u8?$/i, '') })
        entries.push(...files)
      } else if (isAudioPath(p)) {
        entries.push({ path: p })
      } else {
        other++
      }
    }
    // The queue takes a playlist's name only when that playlist is the whole selection.
    const onlyList = lists.length === 1 && entries.length && paths.length === 1 ? lists[0].name : undefined
    return { entries, lists, web, other, unreadable, onlyList }
  }

  /**
   * Audio files and playlists by path, as one ordered list (2026-10-09):
   *   'add'   append (Enqueue, drops, the dialog): when the queue isn't empty and a playlist
   *           is among them, "Add to the queue / Replace the queue / Cancel" (the dialog and a
   *           drop don't say which is meant);
   *   'play'  the menu's Play: an empty queue becomes them; else "Play the selection?" —
   *           Add and play (nothing lost) / Replace / Cancel (an unsaved queue isn't wiped by
   *           accident).
   * skipped: items the caller already left out (other types, folders), for the summary.
   */
  async function addPaths(paths: string[], how: 'add' | 'play' = 'add', skipped = 0) {
    const got = await collect(paths)
    const other = got.other + skipped
    if (!got.entries.length) {
      const why = got.unreadable.length ? `Could not open ${got.unreadable.join(', ')}.`
        : got.web ? 'The playlist lists only web addresses: the player plays files.'
        : got.lists.length ? `${got.lists.map(l => `"${l.file}"`).join(', ')} has no tracks.`
        : 'Nothing to add: no audio files or playlists.'
      snack('add', why)
      return
    }

    const n = got.entries.length
    const what = got.onlyList ? `"${got.onlyList}" (${n} track${n === 1 ? '' : 's'})` : `${n} track${n === 1 ? '' : 's'}`
    let mode: 'append' | 'append-play' | 'replace' = 'append'
    if (how === 'play') {
      mode = 'replace'
      if (queue.value.length) {
        const r = await ui.messageBox({
          title: 'Play the selection',
          message: `Play ${what}? The queue has ${queue.value.length} track${queue.value.length === 1 ? '' : 's'}.`,
          detail: 'Replacing removes them from the queue (save it first to keep it).',
          variant: 'question',
          buttons: [
            { label: 'Cancel', id: 'cancel', cancel: true },
            { label: 'Replace', id: 'replace', danger: true },
            { label: 'Add and play', id: 'append-play', default: true },
          ],
        })
        if (r.button !== 'replace' && r.button !== 'append-play') return
        mode = r.button
      }
    } else if (got.lists.length && queue.value.length) {
      const r = await ui.messageBox({
        title: 'Open playlist',
        message: `Add ${what}? The queue has ${queue.value.length} track${queue.value.length === 1 ? '' : 's'}.`,
        variant: 'question',
        buttons: [
          { label: 'Cancel', id: 'cancel', cancel: true },
          { label: 'Replace the queue', id: 'replace' },
          { label: 'Add to the queue', id: 'append', default: true },
        ],
      })
      if (r.button !== 'replace' && r.button !== 'append') return
      mode = r.button
    }

    const { tracks, failed } = await tracksFor(got.entries)
    if (mode === 'replace') await replaceQueue(tracks, got.onlyList)
    else await appendTracks(tracks, mode === 'append-play')

    const notes: string[] = []
    if (failed) notes.push(`${failed} of ${tracks.length} can't be played (greyed)`)
    if (got.web) notes.push(`${got.web} web address${got.web === 1 ? '' : 'es'} left out`)
    if (other) notes.push(`${other} other item${other === 1 ? '' : 's'} skipped`)
    if (got.unreadable.length) notes.push(`could not open ${got.unreadable.join(', ')}`)
    if (notes.length) snack('add', `Added ${tracks.length} track${tracks.length === 1 ? '' : 's'}: ${notes.join('; ')}.`, 8000)
  }

  /** Saves the queue as a playlist file (M3U8; M3U when that type or extension is chosen). */
  async function savePlaylist() {
    const savable = queue.value.filter(t => !!t.sourcePath)
    if (!savable.length) {
      snack('save', 'Nothing to save: these tracks have no file on disk.')
      return
    }
    const name = (queueName.value || 'Playlist').trim()
    const target = await ui.saveFile({
      title: 'Save playlist',
      suggestedName: `${safeFileName(name)}.m3u8`,
      filters: [
        { label: 'Playlist (M3U8)', extensions: ['m3u8'] },
        { label: 'Playlist (M3U, older players)', extensions: ['m3u'] },
      ],
    })
    if (!target) return

    // A name typed without the extension: .m3u8 added (the dialog checked the name as typed).
    let path = target
    if (!isPlaylistPath(path)) {
      path += '.m3u8'
      const there = await sdk!.fsValidate?.(path).catch(() => null)
      if (there?.exists && !(await ui.confirm(`"${baseName(path)}" already exists. Replace it?`, { title: 'Save playlist', okLabel: 'Replace', danger: true }))) return
    }

    const text = buildM3U(name, savable.map(t => ({ name: t.name, sourcePath: t.sourcePath!, duration: t.duration })), path)
    try {
      // .m3u: a byte order mark, so players that read .m3u in the system code page see UTF-8.
      await sdk!.fsWriteText!(path, text, { overwrite: true, bom: /\.m3u$/i.test(path) })
    } catch (err: any) {
      console.warn('[local-player] playlist not saved:', path, err)
      snack('save', `Could not save "${baseName(path)}": ${err?.message ?? err}`, 8000)
      return
    }
    const left = queue.value.length - savable.length
    snack('save', `Saved "${baseName(path)}" (${savable.length} track${savable.length === 1 ? '' : 's'})${left ? `; ${left} without a file on disk left out` : ''}.`, 5000)
  }

  /** The "Add files…" button: the host's file dialog (audio files and playlists). */
  async function openViaDialog() {
    const paths = await ui.openFiles({
      title: 'Add to the queue',
      multiple: true,
      filters: [
        { label: 'Audio files and playlists', extensions: [...AUDIO_EXTS, ...PLAYLIST_EXTS] },
        { label: 'Audio files', extensions: AUDIO_EXTS },
        { label: 'Playlists', extensions: PLAYLIST_EXTS },
      ],
    })
    if (paths?.length) await addPaths(paths, 'add')
  }

  /** "Open playlist…" (the player's menu): playlist files only; on a non-empty queue, addPaths asks (Add / Replace / Cancel). */
  async function openPlaylistViaDialog() {
    const paths = await ui.openFiles({
      title: 'Open playlist',
      multiple: true,
      filters: [{ label: 'Playlists', extensions: PLAYLIST_EXTS }],
    })
    if (paths?.length) await addPaths(paths, 'add')
  }

  // ── Replacing a track (its menu: "Replace item…", any track, 2026-10-09) ─────

  /**
   * Another file in track <id>'s place (same position). The track was the current one: the new
   * file plays if it was playing, else is loaded. A file that can't be played stays, greyed.
   */
  async function replaceItem(id: string) {
    const t = queue.value.find(x => x.id === id)
    if (!t) return
    const paths = await ui.openFiles({
      title: `Replace "${t.name}"`,
      startIn: t.sourcePath ? dirOf(t.sourcePath) : undefined,
      filters: [{ label: 'Audio files', extensions: AUDIO_EXTS }],
    })
    const path = paths?.[0]
    if (!path) return
    const { tracks } = await tracksFor([{ path }])
    const fresh = tracks[0]
    // Removed (or the queue replaced) while the dialog was open: nothing to replace.
    const i = queue.value.findIndex(x => x.id === id)
    if (!fresh || i < 0) return
    revokeOwnedBlob(queue.value[i])
    const wasCurrent = i === currentIndex.value
    const wasPlaying = wasCurrent && isPlaying.value
    // A new id (and a new array: the sortable view follows reassignments only).
    queue.value = queue.value.map(x => x.id === id ? fresh : x)
    if (fresh.missing) snack('replace', `"${fresh.name}" can't be played: ${reasonText(fresh.missingReason)}.`, 6000)
    if (wasCurrent) {
      if (wasPlaying && fresh.url) {
        sync()
        await playAt(i)
      } else {
        music.pause()
        currentIndex.value = -1
        prepare(i)
        sync()
      }
    } else {
      sync()
    }
    void probeDurations()
  }

  // ── Missing tracks ───────────────────────────────────────────────────────

  /** Tries a missing track again (the file may be back). True: it is playable now. */
  async function retryMissing(index: number): Promise<boolean> {
    const t = queue.value[index]
    if (!t?.missing || !t.sourcePath) return false
    const { tracks } = await tracksFor([{ path: t.sourcePath }])
    const fresh = tracks[0]
    const i = queue.value.findIndex(x => x.id === t.id)
    if (i < 0) return false
    if (!fresh?.url) {
      queue.value = queue.value.map(x => x.id === t.id ? { ...x, missingReason: fresh?.missingReason ?? x.missingReason } : x)
      return false
    }
    // Keeps its id, name and place; gets the new URL.
    queue.value = queue.value.map(x => x.id === t.id
      ? { ...x, url: fresh.url, type: fresh.type ?? x.type, expiresAt: fresh.expiresAt ?? null, missing: false, missingReason: undefined }
      : x)
    sync()
    void probeDurations()
    return true
  }

  // ── Removing ─────────────────────────────────────────────────────────────

  async function removeAt(realIndex: number) {
    const t = queue.value[realIndex]
    if (!t) return
    revokeOwnedBlob(t)
    const wasCurrent = realIndex === currentIndex.value
    // A new array: the queue's sortable view (useSortable) follows reassignments only.
    queue.value = queue.value.filter((_, i) => i !== realIndex)
    if (queue.value.length === 0) { clearQueue(); return }
    if (wasCurrent) {
      const nextIdx = Math.min(realIndex, queue.value.length - 1)
      if (isPlaying.value) {
        sync()
        await playAt(nextIdx)
        return
      }
      currentIndex.value = -1
      prepare(nextIdx)
    } else if (realIndex < currentIndex.value) {
      currentIndex.value -= 1
    }
    sync()
  }

  /** Loads queue track <index> without playing it (a missing one: nothing to load). */
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
    for (const t of queue.value) revokeOwnedBlob(t)
    queue.value = []
    currentIndex.value = -1
    sync()
  }

  /** The clear button: asks first. */
  async function confirmClearQueue() {
    const n = queue.value.length
    if (!n) return
    const ok = await ui.confirm(`Remove ${n === 1 ? 'the track' : `all ${n} tracks`} from the queue?`, {
      title: 'Clear the queue',
      detail: 'The files stay where they are.',
      okLabel: 'Clear',
      danger: true,
    })
    if (ok) clearQueue()
  }

  // ── OS drops as File objects (no path: played from memory, not saved in playlists) ──

  async function addFiles(files: FileList | File[] | Iterable<File>): Promise<void> {
    const tracks: Track[] = []
    for (const f of Array.from(files as any) as File[]) {
      const name = f.name || ''
      const isAudio = ACCEPTED_MIMES.includes(f.type) || AUDIO_RE.test(name)
      if (!isAudio) continue
      const id = `${name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`
      const url = registerBlob(URL.createObjectURL(f))
      tracks.push({ id, name, url, type: f.type, _ownedBlob: true })
    }
    await appendTracks(tracks)
  }

  return {
    addPaths,
    addFiles,
    openViaDialog,
    openPlaylistViaDialog,
    replaceItem,
    savePlaylist,
    retryMissing,
    removeAt,
    clearQueue,
    confirmClearQueue,
    replaceQueue,
    appendTracks,
    tracksFor,
    probeDurations,
  }
}
