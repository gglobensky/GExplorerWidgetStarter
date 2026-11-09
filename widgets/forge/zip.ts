// widgets/forge/zip.ts
//
// GEM FORGE 0.1d: a .zip archive made in the page (Export .zip…), with no package: each file deflated by the
// browser's CompressionStream('deflate-raw') when that makes it smaller (else stored), CRC-32, UTF-8 names.
// TODO (GEM Shell archives): GEM Shell has no archive API yet. When it has one (zip and unzip, for Corkboard's boards
// too), GEM Forge uses it and this file goes.

export type ZipEntry = { path: string; data: Uint8Array }

const CRC = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[n] = c >>> 0
    }
    return t
})()

export function crc32(data: Uint8Array): number {
    let c = 0xffffffff
    for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
    if (typeof CompressionStream === 'undefined' || data.length < 64) return null
    try {
        const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
        const out = new Uint8Array(await new Response(stream).arrayBuffer())
        return out.length < data.length ? out : null
    } catch {
        return null
    }
}

/** The archive's bytes: <entries> in that order (paths with /, as they are stored). */
export async function zipFiles(entries: ZipEntry[], when = new Date()): Promise<Uint8Array> {
    const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)
    const date = ((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
    const enc = new TextEncoder()
    const parts: Uint8Array[] = []
    const central: Uint8Array[] = []
    let offset = 0
    for (const e of entries) {
        const name = enc.encode(e.path.replace(/\\/g, '/'))
        const crc = crc32(e.data)
        const packed = await deflate(e.data)
        const body = packed ?? e.data
        const method = packed ? 8 : 0

        const local = new Uint8Array(30 + name.length)
        const lv = new DataView(local.buffer)
        lv.setUint32(0, 0x04034b50, true)
        lv.setUint16(4, 20, true)
        lv.setUint16(6, 0x0800, true)              // the name is UTF-8
        lv.setUint16(8, method, true)
        lv.setUint16(10, time, true)
        lv.setUint16(12, date, true)
        lv.setUint32(14, crc, true)
        lv.setUint32(18, body.length, true)
        lv.setUint32(22, e.data.length, true)
        lv.setUint16(26, name.length, true)
        local.set(name, 30)

        const cen = new Uint8Array(46 + name.length)
        const cv = new DataView(cen.buffer)
        cv.setUint32(0, 0x02014b50, true)
        cv.setUint16(4, 20, true)
        cv.setUint16(6, 20, true)
        cv.setUint16(8, 0x0800, true)
        cv.setUint16(10, method, true)
        cv.setUint16(12, time, true)
        cv.setUint16(14, date, true)
        cv.setUint32(16, crc, true)
        cv.setUint32(20, body.length, true)
        cv.setUint32(24, e.data.length, true)
        cv.setUint16(28, name.length, true)
        cv.setUint32(42, offset, true)
        cen.set(name, 46)

        parts.push(local, body)
        central.push(cen)
        offset += local.length + body.length
    }
    const cenSize = central.reduce((n, c) => n + c.length, 0)
    const end = new Uint8Array(22)
    const ev = new DataView(end.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(8, entries.length, true)
    ev.setUint16(10, entries.length, true)
    ev.setUint32(12, cenSize, true)
    ev.setUint32(16, offset, true)

    const out = new Uint8Array(offset + cenSize + end.length)
    let at = 0
    for (const p of [...parts, ...central, end]) { out.set(p, at); at += p.length }
    return out
}
