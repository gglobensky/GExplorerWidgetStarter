// m3u.ts - Playlist files (M3U / M3U8): reading and writing. No SDK, no Vue: pure text.
//
// THE FORMAT (2026-10-09: M3U8 replaces .gexm, whose saved stream URLs died with the session)
//   #EXTM3U
//   #PLAYLIST:<playlist name>
//   #EXTINF:<seconds, -1 when unknown>,<title>
//   <path>                      relative to the playlist's folder when the track is under it,
//                               else absolute
//   ...
// Written as UTF-8 (.m3u8: no byte order mark; .m3u: with one, so players that assume the
// system code page for .m3u still read it right). Read: whatever the host decoded (BOM,
// UTF-8, else the system's ANSI code page: fsReadText).
// Anything GEM-specific later goes on '#EXT-X-GEX-...' lines: other players ignore unknown '#' lines.
//
// READING
//   - CRLF / LF / CR line ends; blank lines and unknown '#' lines ignored.
//   - '#EXTINF:' gives the next entry's duration and title (attributes before the comma are
//     ignored: '#EXTINF:-1 tvg-id="x",Title').
//   - Paths: '\' or '/', relative to the playlist's folder ('..' allowed), 'file://' URIs.
//   - Other URLs (http://, https://, rtsp://...) are web entries: kept apart (the player
//     plays files only).

export type M3UEntry = {
    /** Full path of the file (resolved against the playlist's folder). */
    path?: string
    /** A web address (not a file). */
    url?: string
    /** '#EXTINF' title, when given. */
    title?: string
    /** '#EXTINF' seconds, when given and positive. */
    duration?: number
}

export type M3UPlaylist = {
    /** '#PLAYLIST:' name, when given. */
    name?: string
    entries: M3UEntry[]
}

export type M3UTrack = { name: string; sourcePath: string; duration?: number }

// ── Paths ─────────────────────────────────────────────────────────────────

/** 'C:\x', 'C:/x', '\\server\share', '/x'. */
export function isAbsolutePath(p: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p) || p.startsWith('/')
}

/** The separator a path uses: '\' for Windows paths, else '/'. */
export function separatorOf(p: string): '\\' | '/' {
    return /^[A-Za-z]:/.test(p) || p.startsWith('\\\\') || (p.includes('\\') && !p.includes('/')) ? '\\' : '/'
}

/** The folder of a file path ('C:\a\b.m3u8' -> 'C:\a'; 'C:\b.m3u8' -> 'C:\'). */
export function dirOf(p: string): string {
    const t = p.replace(/[\\/]+$/, '')
    const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'))
    if (i < 0) return ''
    const d = t.slice(0, i)
    if (/^[A-Za-z]:$/.test(d)) return d + '\\'
    return d || '/'
}

/** The last segment of a path. */
export function baseName(p: string): string {
    const t = p.replace(/[\\/]+$/, '')
    return t.slice(Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/')) + 1) || t
}

/** Joins and normalizes: one separator kind (sep), '.' and '..' resolved (never above the root). */
export function normalizePath(p: string, sep: '\\' | '/'): string {
    let prefix = ''
    let rest = p
    const drive = /^([A-Za-z]:)[\\/]?/.exec(p)
    const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)[\\/]?/.exec(p)
    if (drive) { prefix = drive[1] + sep; rest = p.slice(drive[0].length) }
    else if (unc) { prefix = sep + sep + unc[1] + sep + unc[2] + sep; rest = p.slice(unc[0].length) }
    else if (p.startsWith('/') || p.startsWith('\\')) { prefix = sep; rest = p.replace(/^[\\/]+/, '') }
    const out: string[] = []
    for (const seg of rest.split(/[\\/]+/)) {
        if (!seg || seg === '.') continue
        if (seg === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!prefix) out.push('..'); continue }
        out.push(seg)
    }
    return prefix + out.join(sep)
}

/** A playlist line's path, made absolute against the playlist's folder. */
export function resolveEntryPath(line: string, playlistDir: string): string {
    const sep = separatorOf(playlistDir || line)
    if (isAbsolutePath(line)) return normalizePath(line, separatorOf(line))
    return normalizePath(playlistDir + sep + line, sep)
}

/** 'file:///C:/a%20b.mp3' -> 'C:\a b.mp3'; 'file://server/share/x' -> '\\server\share\x'; 'file:///home/x' -> '/home/x'. */
export function fileUriToPath(uri: string): string | null {
    const m = /^file:\/\/([^/]*)(\/.*)?$/i.exec(uri)
    if (!m) return null
    let p: string
    try { p = decodeURIComponent(m[2] ?? '') } catch { p = m[2] ?? '' }
    const host = m[1]
    if (host && host.toLowerCase() !== 'localhost') return normalizePath('\\\\' + host + p, '\\')
    if (/^\/[A-Za-z]:/.test(p)) return normalizePath(p.slice(1), '\\')
    return normalizePath(p, '/')
}

/** Whether two paths name the same place (Windows paths: case-insensitive). */
function samePrefix(a: string, b: string, windows: boolean): boolean {
    return windows ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** <file> relative to <dir> when it is inside it ('Album\01.mp3'), else null. */
export function relativeIfInside(file: string, dir: string): string | null {
    const sep = separatorOf(dir)
    const windows = sep === '\\'
    const f = normalizePath(file, sep)
    let d = normalizePath(dir, sep)
    if (!d.endsWith(sep)) d += sep
    if (f.length <= d.length || !samePrefix(f.slice(0, d.length), d, windows)) return null
    return f.slice(d.length)
}

// ── Reading ───────────────────────────────────────────────────────────────

/** Parses an M3U / M3U8 text; <playlistPath>: where the file is (relative entries resolve against its folder). */
export function parseM3U(text: string, playlistPath: string): M3UPlaylist {
    const dir = dirOf(playlistPath)
    const out: M3UPlaylist = { entries: [] }
    let title: string | undefined
    let duration: number | undefined
    for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
        const line = raw.trim()
        if (!line) continue
        if (line.startsWith('#')) {
            const inf = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)?[^,]*,(.*)$/i.exec(line)
            if (inf) {
                const d = inf[1] !== undefined ? parseFloat(inf[1]) : NaN
                duration = Number.isFinite(d) && d > 0 ? d : undefined
                title = inf[2].trim() || undefined
                continue
            }
            const pl = /^#PLAYLIST:(.*)$/i.exec(line)
            if (pl && pl[1].trim()) out.name = pl[1].trim()
            continue
        }
        const entry: M3UEntry = {}
        if (title) entry.title = title
        if (duration) entry.duration = duration
        title = undefined
        duration = undefined
        if (/^file:\/\//i.test(line)) {
            const p = fileUriToPath(line)
            if (p) entry.path = p
            else entry.url = line
        } else if (/^[A-Za-z][A-Za-z0-9+.-]+:\/\//.test(line)) {
            entry.url = line
        } else {
            entry.path = resolveEntryPath(line, dir)
        }
        out.entries.push(entry)
    }
    return out
}

// ── Writing ───────────────────────────────────────────────────────────────

/** One line, no line breaks (a title or a name inside the file). */
function oneLine(s: string): string {
    return s.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * The text of a playlist saved at <playlistPath>: paths relative to its folder when the
 * track is inside it, else absolute. Line ends: CRLF for a Windows path, else LF.
 */
export function buildM3U(name: string, tracks: M3UTrack[], playlistPath: string): string {
    const dir = dirOf(playlistPath)
    const sep = separatorOf(playlistPath)
    const eol = sep === '\\' ? '\r\n' : '\n'
    const lines = ['#EXTM3U']
    if (oneLine(name)) lines.push(`#PLAYLIST:${oneLine(name)}`)
    for (const t of tracks) {
        const secs = typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration > 0 ? Math.round(t.duration) : -1
        lines.push(`#EXTINF:${secs},${oneLine(t.name) || baseName(t.sourcePath)}`)
        lines.push(relativeIfInside(t.sourcePath, dir) ?? normalizePath(t.sourcePath, separatorOf(t.sourcePath)))
    }
    return lines.join(eol) + eol
}
