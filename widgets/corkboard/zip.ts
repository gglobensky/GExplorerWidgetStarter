// widgets/corkboard/zip.ts
//
// NEW (0.4.0): the zip archives a .gembrd / .gemstk file is since v2 (board.json + its pictures as files). Small and
// self-contained (no imports, tested by tests/zip.test.ts): writes stored or deflated entries (CompressionStream
// 'deflate-raw'), reads stored and deflated ones (so a file re-zipped by Windows still opens). Read with limits: the
// entry count, each entry's size and the total size (a zip bomb stops at the limit), CRC-32 checked, no encryption,
// no zip64. Names are only looked up (nothing is written to disk from them).

export type ZipEntryIn = { name: string; data: Uint8Array | Blob | string; deflate?: boolean }
export type ZipLimits = { entries?: number; entryBytes?: number; totalBytes?: number }
export type ZipError = Error & { code: 'E_NOT_ZIP' | 'E_BAD_ZIP' | 'E_TOO_LARGE' | 'E_UNSUPPORTED' }

const DEF_LIMITS: Required<ZipLimits> = { entries: 5000, entryBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 }

function fail(code: ZipError['code'], msg: string): ZipError {
    const e = new Error(msg) as ZipError
    e.code = code
    return e
}

// ── CRC-32 ──────────────────────────────────────────────────────────────────

let CRC_TABLE: Uint32Array | null = null
export function crc32(bytes: Uint8Array, crc = 0): number {
    if (!CRC_TABLE) {
        CRC_TABLE = new Uint32Array(256)
        for (let n = 0; n < 256; n++) {
            let c = n
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            CRC_TABLE[n] = c >>> 0
        }
    }
    let c = (crc ^ 0xffffffff) >>> 0
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

// ── Streams ─────────────────────────────────────────────────────────────────

async function through(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<any> }, max: number): Promise<Uint8Array> {
    const w = stream.writable.getWriter()
    void w.write(bytes).then(() => w.close()).catch(() => { })
    const r = stream.readable.getReader()
    const parts: Uint8Array[] = []
    let len = 0
    for (;;) {
        let res: ReadableStreamReadResult<Uint8Array>
        try { res = await r.read() } catch { throw fail('E_BAD_ZIP', 'An entry of the archive is damaged.') }
        if (res.done) break
        len += res.value.length
        if (len > max) { void r.cancel().catch(() => { }); throw fail('E_TOO_LARGE', 'An entry of the archive is too large.') }
        parts.push(res.value)
    }
    const out = new Uint8Array(len)
    let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
}
const deflateRaw = (b: Uint8Array) => through(b, new CompressionStream('deflate-raw'), Number.MAX_SAFE_INTEGER)
const inflateRaw = (b: Uint8Array, max: number) => through(b, new DecompressionStream('deflate-raw'), max)

async function bytesOf(d: ZipEntryIn['data']): Promise<Uint8Array> {
    if (typeof d === 'string') return new TextEncoder().encode(d)
    if (d instanceof Uint8Array) return d
    return new Uint8Array(await d.arrayBuffer())
}

// ── Write ───────────────────────────────────────────────────────────────────

function dosTime(d: Date): { time: number; date: number } {
    const y = Math.min(2107, Math.max(1980, d.getFullYear()))
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    }
}

/** A zip archive of the entries, in order (UTF-8 names). deflate: compressed when that is smaller. */
export async function makeZip(entries: ZipEntryIn[], now = new Date()): Promise<Blob> {
    const enc = new TextEncoder()
    const { time, date } = dosTime(now)
    const parts: Uint8Array[] = []
    const central: Uint8Array[] = []
    let offset = 0
    for (const e of entries) {
        const name = enc.encode(e.name)
        const raw = await bytesOf(e.data)
        const crc = crc32(raw)
        let body = raw, method = 0
        if (e.deflate && raw.length > 64) {
            const z = await deflateRaw(raw)
            if (z.length < raw.length) { body = z; method = 8 }
        }
        if (body.length > 0xfffffffe || raw.length > 0xfffffffe || offset > 0xfffffffe) throw fail('E_TOO_LARGE', 'The archive would be over 4 GB.')
        const lh = new DataView(new ArrayBuffer(30))
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true)
        lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true)
        lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true)
        parts.push(new Uint8Array(lh.buffer), name, body)
        const ch = new DataView(new ArrayBuffer(46))
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true)
        ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true)
        ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true)
        ch.setUint32(42, offset, true)
        central.push(new Uint8Array(ch.buffer), name)
        offset += 30 + name.length + body.length
    }
    if (entries.length > 0xffff) throw fail('E_TOO_LARGE', 'Too many files for one archive.')
    const cdSize = central.reduce((n, p) => n + p.length, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true)
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' })
}

// ── Read ────────────────────────────────────────────────────────────────────

/** Whether the bytes start like a zip archive ("PK\3\4", or an empty archive's "PK\5\6"). */
export function isZip(head: Uint8Array): boolean {
    return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && ((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6))
}

/** A name as a lookup key: forward slashes, no leading slash or "./"; null for "..", a drive or an empty name. */
export function cleanName(n: string): string | null {
    const s = n.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '')
    if (!s || /^[a-z]:/i.test(s) || s.split('/').some(p => p === '..')) return null
    return s
}

/**
 * The files of a zip archive, by name (folders left out). Throws an Error with `code` E_NOT_ZIP, E_BAD_ZIP,
 * E_TOO_LARGE (a limit) or E_UNSUPPORTED (encrypted, zip64, another compression method).
 */
export async function readZip(src: Blob | Uint8Array, limits: ZipLimits = {}): Promise<Map<string, Uint8Array>> {
    const L = { ...DEF_LIMITS, ...limits }
    const buf = src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer())
    if (!isZip(buf)) throw fail('E_NOT_ZIP', "That file isn't an archive.")
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw fail('E_BAD_ZIP', 'The archive is damaged (no directory).')
    const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true)
    if (count === 0xffff || cdOff === 0xffffffff) throw fail('E_UNSUPPORTED', 'Archives over 4 GB (zip64) are not supported.')
    if (count > L.entries) throw fail('E_TOO_LARGE', 'The archive has too many files.')
    if (cdOff + cdSize > eocd) throw fail('E_BAD_ZIP', 'The archive is damaged (directory).')
    const dec = new TextDecoder()
    const out = new Map<string, Uint8Array>()
    let total = 0, p = cdOff
    for (let i = 0; i < count; i++) {
        if (p + 46 > eocd || dv.getUint32(p, true) !== 0x02014b50) throw fail('E_BAD_ZIP', 'The archive is damaged (entry).')
        const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true)
        const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true)
        const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true)
        const lho = dv.getUint32(p + 42, true)
        const rawName = dec.decode(buf.subarray(p + 46, p + 46 + nlen))
        p += 46 + nlen + xlen + clen
        if (rawName.endsWith('/')) continue
        if (flags & 1) throw fail('E_UNSUPPORTED', 'Encrypted archives are not supported.')
        if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) throw fail('E_UNSUPPORTED', 'Archives over 4 GB (zip64) are not supported.')
        if (method !== 0 && method !== 8) throw fail('E_UNSUPPORTED', 'The archive uses a compression GEM Corkboard can\'t read.')
        if (usize > L.entryBytes || total + usize > L.totalBytes) throw fail('E_TOO_LARGE', 'The archive is too large.')
        if (lho + 30 > buf.length || dv.getUint32(lho, true) !== 0x04034b50) throw fail('E_BAD_ZIP', 'The archive is damaged (file).')
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true)
        if (start + csize > buf.length) throw fail('E_BAD_ZIP', 'The archive is damaged (cut short).')
        const body = buf.subarray(start, start + csize)
        const data = method === 0 ? body.slice() : await inflateRaw(body, Math.min(L.entryBytes, L.totalBytes - total))
        if (data.length !== usize || crc32(data) !== crc) throw fail('E_BAD_ZIP', 'The archive is damaged (a file doesn\'t match its check).')
        total += data.length
        const name = cleanName(rawName)
        if (name && !out.has(name)) out.set(name, data)
    }
    return out
}
