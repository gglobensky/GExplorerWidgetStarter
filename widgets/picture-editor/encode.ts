// widgets/picture-editor/encode.ts
//
// THE PICTURE, SAVED (0.1.0): the picture with the strokes drawn in and the crop applied (the ink kit's flattenInk:
// PNG), then in the format asked: PNG as it is; JPEG and WebP at 92 % (over white: they would turn transparent parts
// black); BMP written here (24 bits, over white: the browser can't encode it).
import { flattenInk, type InkStroke, type InkLook } from 'gexplorer/widgets'

export type PictureFormat = 'png' | 'jpeg' | 'webp' | 'bmp'

/** The format a file name asks for; null: none of these. */
export function formatOf(name: string): PictureFormat | null {
    const m = /\.([a-z0-9]+)$/i.exec(name)
    const ext = m?.[1]?.toLowerCase()
    if (ext === 'png') return 'png'
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
    if (ext === 'webp') return 'webp'
    if (ext === 'bmp') return 'bmp'
    return null
}

export type Crop = { x: number; y: number; width: number; height: number }

/** The picture as a file of <format>. */
export async function encodePicture(img: HTMLImageElement, strokes: InkStroke[], look: InkLook, crop: Crop | null, format: PictureFormat): Promise<Blob> {
    const png = await flattenInk(img, strokes, look, { units: img.naturalWidth, crop: crop ?? undefined })
    if (format === 'png') return png
    const bmp = await createImageBitmap(png)
    try {
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width; canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('No 2D canvas')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(bmp, 0, 0)
        if (format === 'bmp') return writeBmp(ctx.getImageData(0, 0, canvas.width, canvas.height))
        const type = format === 'jpeg' ? 'image/jpeg' : 'image/webp'
        return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(b => (b && b.type === type ? resolve(b) : reject(new Error(`This picture can't be saved as ${format.toUpperCase()}.`))), type, 0.92))
    } finally {
        bmp.close()
    }
}

/** A 24-bit bottom-up BMP (rows padded to 4 bytes). */
function writeBmp(data: ImageData): Blob {
    const { width: w, height: h } = data
    const row = Math.ceil((w * 3) / 4) * 4
    const size = 54 + row * h
    const buf = new ArrayBuffer(size)
    const v = new DataView(buf)
    v.setUint8(0, 0x42); v.setUint8(1, 0x4d)          // "BM"
    v.setUint32(2, size, true)
    v.setUint32(10, 54, true)                         // pixels' offset
    v.setUint32(14, 40, true)                         // BITMAPINFOHEADER
    v.setInt32(18, w, true)
    v.setInt32(22, h, true)                           // bottom-up
    v.setUint16(26, 1, true)
    v.setUint16(28, 24, true)
    v.setUint32(34, row * h, true)
    v.setInt32(38, 2835, true); v.setInt32(42, 2835, true)   // 72 dpi
    const px = new Uint8Array(buf, 54)
    const src = data.data
    for (let y = 0; y < h; y++) {
        const out = (h - 1 - y) * row
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, o = out + x * 3
            px[o] = src[i + 2]; px[o + 1] = src[i + 1]; px[o + 2] = src[i]
        }
    }
    return new Blob([buf], { type: 'image/bmp' })
}
