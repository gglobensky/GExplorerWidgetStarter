// widgets/corkboard/tests/zip.test.ts: node --experimental-strip-types --test widgets/corkboard/tests/zip.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeZip, readZip, isZip, crc32, cleanName } from '../zip.ts'

const bytes = (n: number, seed = 7) => { const b = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24 } return b }

test('crc32 of a known string', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
})

test('round trip: stored and deflated entries, UTF-8 names', async () => {
    const json = JSON.stringify({ corkboard: 2, text: 'é'.repeat(5000) })
    const pic = bytes(3000)
    const zip = await makeZip([{ name: 'board.json', data: json, deflate: true }, { name: 'pictures/été 1.webp', data: pic }])
    const buf = new Uint8Array(await zip.arrayBuffer())
    assert.ok(isZip(buf))
    assert.ok(buf.length < json.length, 'the JSON was deflated')
    const files = await readZip(zip)
    assert.equal(new TextDecoder().decode(files.get('board.json')), json)
    assert.deepEqual(files.get('pictures/été 1.webp'), pic)
})

test('an empty archive', async () => {
    const files = await readZip(await makeZip([]))
    assert.equal(files.size, 0)
})

test('not a zip, damaged, too large', async () => {
    await assert.rejects(readZip(new TextEncoder().encode('{"corkboard":1}')), { code: 'E_NOT_ZIP' })
    const buf = new Uint8Array(await (await makeZip([{ name: 'a.bin', data: bytes(500) }])).arrayBuffer())
    const bad = buf.slice(); bad[40] ^= 0xff   // inside a.bin's data
    await assert.rejects(readZip(bad), { code: 'E_BAD_ZIP' })
    await assert.rejects(readZip(buf.slice(0, buf.length - 30)), { code: 'E_BAD_ZIP' })
    await assert.rejects(readZip(buf, { entryBytes: 100 }), { code: 'E_TOO_LARGE' })
    await assert.rejects(readZip(buf, { entries: 0 }), { code: 'E_TOO_LARGE' })
})

test('a zip bomb stops at the limit', async () => {
    const zip = await makeZip([{ name: 'z', data: new Uint8Array(5_000_000), deflate: true }])
    assert.ok(zip.size < 50_000)
    await assert.rejects(readZip(zip, { totalBytes: 1_000_000 }), { code: 'E_TOO_LARGE' })
})

test('names are cleaned; unsafe ones dropped', () => {
    assert.equal(cleanName('./pictures\\1.png'), 'pictures/1.png')
    assert.equal(cleanName('/board.json'), 'board.json')
    assert.equal(cleanName('../x'), null)
    assert.equal(cleanName('C:/x'), null)
    assert.equal(cleanName(''), null)
})
