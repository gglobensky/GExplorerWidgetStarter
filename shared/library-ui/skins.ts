// shared/library-ui/skins.ts
//
// Skins (3.0.0, 2026-11-02; files and the editor 3.5.0): the look of a shop as DATA, not CSS: a set of named values (the wall, the units, the
// shelves, the floor, the signs) that library-ui turns into CSS variables on the widget's surface
// (`skinStyle(skin)`, bound on the element with `gem-library-surface`). Every shared style reads them through
// `var(--skin-…, <the classic value>)`, so a skin only says what it changes.
//
// Built in: 'classic' (the look before 3.0.0: no values, the fallbacks), 'late-show' (the Video Club's: a plum wall,
// walnut units, a confetti carpet, neon signs) and 'software-aisle' (the Game Shop's: warm grey slatwall, black metal
// units, checkered tiles, lit header boards). Mockups: the design canvas "GEM Store Look Directions".
//
// Made for skins people make and share later (Guillaume, 2026-11-02: "like Winamp skins"): a skin is a small JSON
// document ({ format, id, name, author?, values }) any copy can load, duplicate and edit. normalizeSkin() is the one
// gate: only the known names (SKIN_KEYS) are kept, and each value must be a plain CSS value: colours, lengths and
// gradients only. No url(), no image-set(), no var() of other names, no ; { } @ < > \ or comments, at most 600
// characters, so a shared skin can't load anything from the network or break out of its declaration. Pictures in
// skins (a wall photo) will come with GEM Shell's assets, not urls.

// Kept local so library-ui's Node tests can load this file without a build-time
// @shared alias. It implements shared/skin-file's format for the legacy library.
const gemSkinHeader = (family: string, schema: number, targets: string[]) => ({ kind: 'gem.skin' as const, family, schema, targets })
function readGemSkinHeader(raw: unknown): { header: { family: string; schema: number } | null } | { error: string } {
  const h = (raw as { skin?: any } | null)?.skin
  if (h === undefined) return { header: null }
  if (!h || h.kind !== 'gem.skin' || typeof h.family !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(h.family)
    || !Number.isInteger(h.schema) || h.schema < 1 || h.schema > 100 || !Array.isArray(h.targets)
    || h.targets.length < 1 || h.targets.length > 20
    || h.targets.some((target: unknown) => typeof target !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(target)))
    return { error: 'This file has an invalid GEM skin compatibility header.' }
  return { header: { family: h.family, schema: h.schema } }
}
function incompatibleSkinMessage(header: { family: string; schema: number } | null): string | null {
  if (!header) return null
  if (header.family !== 'library-store') return `This is a ${header.family === 'timepiece' ? 'Clock/Calendar' : header.family} skin, not a Game/Media Library skin.`
  return header.schema === 1 ? null : 'This Game/Media Library skin uses a newer schema. Update the widget to load it.'
}

export const SKIN_FORMAT = 1

/** What a skin may set (each becomes --skin-<key>). */
export const SKIN_KEYS = [
  /** The wall behind the units: a colour, and a pattern drawn over it (slatwall grooves, a vignette). */
  'wall', 'wall-pattern',
  /** Light pooling on the wall from above (gradients). */
  'wall-light',
  /** The top bar (the store's counter: kept plain). */
  'bar',
  /** The floor strip the units stand on, and its height. */
  'floor', 'floor-height',
  /** A unit's body, its back panel, its edges. */
  'unit', 'unit-back', 'unit-edge',
  /** A shelf: its top face (light), its front edge (mid), the shade under it (dark). */
  'shelf-light', 'shelf', 'shelf-dark',
  /** A unit's sign: its text and its glow (neon), its board. */
  'sign', 'sign-glow', 'sign-board',
  /** The surface's own colours (text, muted text, the accent, the warm second accent, panels). */
  'fg', 'muted', 'accent', 'warm', 'panel', 'panel-high',
] as const
export type SkinKey = typeof SKIN_KEYS[number]

export type LibrarySkin = {
  format: typeof SKIN_FORMAT
  id: string
  name: string
  author?: string
  values: Partial<Record<SkinKey, string>>
  /**
   * 3.7.0: the skin's pictures, by name (a value uses one as `picture(carpet)`): images GEM Shell made and keeps for
   * the widget (its persistent assets, "/wasset/<id>.<ext>"), never a url of the web. In a .gemskin file they travel
   * as data (parseSkinFile), and loading one makes them anew through GEM Shell (decoded and re-encoded).
   */
  pictures?: Record<string, SkinPicture>
}
export type SkinPicture = { url: string; assetId: string; width: number; height: number }

/** A GEM Shell image address ("/wasset/<32 hex>.jpg|png"): its asset id in [1]. */
export const SKIN_ASSET_URL = /^\/wasset\/([0-9a-f]{32})\.(?:jpg|png)$/
/** A picture's name in a skin. */
export const SKIN_PICTURE_NAME = /^[a-z0-9][a-z0-9-]{0,23}$/
export const MAX_SKIN_PICTURES = 6

const CLASSIC: LibrarySkin = { format: SKIN_FORMAT, id: 'classic', name: 'Classic', values: {} }

const LATE_SHOW: LibrarySkin = {
  format: SKIN_FORMAT,
  id: 'late-show',
  name: 'Late show',
  values: {
    'wall': '#1f1528',
    'wall-pattern': 'repeating-linear-gradient(0deg, #ffffff05 0 1px, transparent 1px 3px), linear-gradient(#2a1b33, #1f1528 62%, #170f1e)',
    'wall-light': 'radial-gradient(ellipse 60% 46% at 22% 0, #8a4c7a44, transparent 70%), radial-gradient(ellipse 60% 46% at 78% 0, #8a4c7a44, transparent 70%)',
    'bar': 'linear-gradient(#120b17f2, #120b17e6)',
    'floor': 'radial-gradient(circle at 12px 14px, #e8475a 0 2px, transparent 3px) 0 0 / 46px 30px, radial-gradient(circle at 34px 24px, #3fb7d9 0 1.6px, transparent 2.6px) 0 0 / 52px 34px, radial-gradient(circle at 22px 8px, #ffd34d 0 1.6px, transparent 2.6px) 0 0 / 60px 26px, linear-gradient(#141a3a, #0d1129)',
    'floor-height': '46px',
    'unit': 'linear-gradient(90deg, #3b2417, #4a2e1d 5%, #2b1a10 6%, #2b1a10 94%, #4a2e1d 95%, #3b2417)',
    'unit-back': 'repeating-linear-gradient(90deg, #24140d 0 1px, #2c1a11 1px 46px), linear-gradient(#2a180f, #1c0f09)',
    'unit-edge': '#4a2e1d',
    'shelf-light': '#7a5134',
    'shelf': '#5a3822',
    'shelf-dark': '#2c1a10',
    'sign': '#ffe7c2',
    'sign-glow': '#ff9fb099',
    'sign-board': 'linear-gradient(#2a1220, #1a0a14)',
    'fg': '#f6ead8',
    'muted': '#c9b6c4',
    'accent': '#ff6b7f',
    'warm': '#ffcf8a',
    'panel': '#24182c',
    'panel-high': '#33233d',
  },
}

const SOFTWARE_AISLE: LibrarySkin = {
  format: SKIN_FORMAT,
  id: 'software-aisle',
  name: 'Software aisle',
  values: {
    'wall': '#3a3735',
    'wall-pattern': 'repeating-linear-gradient(180deg, #4a4744 0 22px, #2c2a28 22px 24px, #57534f 24px 25px)',
    'wall-light': 'radial-gradient(ellipse 60% 46% at 22% 0, #fff6e02e, transparent 70%), radial-gradient(ellipse 60% 46% at 78% 0, #fff6e02e, transparent 70%)',
    'bar': '#121316f2',
    'floor': 'conic-gradient(#86827a 25%, #59564f 0 50%, #86827a 0 75%, #59564f 0) 0 0 / 56px 28px',
    'floor-height': '46px',
    'unit': 'linear-gradient(90deg, #141518, #2a2d33 4%, #141518 6%, #141518 94%, #2a2d33 96%, #141518)',
    'unit-back': 'radial-gradient(circle, #0005 0 1.4px, transparent 2px) 0 0 / 12px 12px, linear-gradient(#3a3d43, #2b2e33)',
    'unit-edge': '#2a2d33',
    'shelf-light': '#6d7179',
    'shelf': '#3a3e45',
    'shelf-dark': '#17191d',
    'sign': '#111316',
    'sign-glow': 'transparent',
    'sign-board': 'linear-gradient(#f7fbfb, #d9e6e6)',
    'fg': '#eef3f4',
    'muted': '#b9c2c6',
    'accent': '#3fd0c9',
    'warm': '#e05bb4',
    'panel': '#26282c',
    'panel-high': '#33363b',
  },
}

export const BUILT_IN_SKINS: readonly LibrarySkin[] = [CLASSIC, LATE_SHOW, SOFTWARE_AISLE]

/** A built-in skin by id (unknown: classic). */
export function builtInSkin(id: string | undefined): LibrarySkin {
  return BUILT_IN_SKINS.find(s => s.id === id) ?? CLASSIC
}

// Colours, lengths, numbers, gradients: what a value may be made of (no ; { } ! @ < > \ quotes or colons)
const SAFE_VALUE = /^[a-z0-9#%.,\s()\/+\-]*$/i
const FUNCTIONS = /([a-z-]+)\s*\(/gi
const ALLOWED_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color-mix',
  'linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient',
  'repeating-conic-gradient', 'calc', 'min', 'max', 'clamp',
  // 3.7.0: one of the skin's own pictures, by name (skinStyle makes it the picture's GEM Shell address)
  'picture'])
/** A value a skin may hold, or undefined. */
export function cleanSkinValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim()
  if (!v || v.length > 600 || !SAFE_VALUE.test(v)) return undefined
  let depth = 0
  for (const c of v) { if (c === '(') depth += 1; else if (c === ')' && --depth < 0) return undefined }
  if (depth !== 0) return undefined
  for (const m of v.matchAll(FUNCTIONS)) if (!ALLOWED_FUNCTIONS.has(m[1].toLowerCase())) return undefined
  // picture(): a bare name only
  for (const m of v.matchAll(/picture\s*\(([^)]*)\)/gi)) if (!SKIN_PICTURE_NAME.test(m[1].trim())) return undefined
  // Bare words (colour names, "at", "circle", units) can't reach the network or leave the declaration: the
  // characters allowed (no ; { } ! @ < > \ quotes) and the functions allowed are what keep a value a value.
  return v
}

/** A skin from a shared document (a user's), checked: only its known, safe values are kept. null: not a skin. */
export function normalizeSkin(raw: unknown): LibrarySkin | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.format !== SKIN_FORMAT) return null
  const id = typeof r.id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(r.id) ? r.id : null
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : null
  if (!id || !name) return null
  const values: Partial<Record<SkinKey, string>> = {}
  const given = r.values && typeof r.values === 'object' ? r.values as Record<string, unknown> : {}
  for (const key of SKIN_KEYS) {
    const v = cleanSkinValue(given[key])
    if (v !== undefined) values[key] = v
  }
  const author = typeof r.author === 'string' && r.author.trim() ? r.author.trim().slice(0, 60) : undefined
  const pictures = normalizePictures(r.pictures)
  return { format: SKIN_FORMAT, id, name, ...(author ? { author } : {}), values, ...(pictures ? { pictures } : {}) }
}

/** A skin's pictures as kept (GEM Shell's addresses only), checked; undefined for none. */
function normalizePictures(raw: unknown): Record<string, SkinPicture> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, SkinPicture> = {}
  for (const [name, p] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_SKIN_PICTURES) break
    const v = p as Partial<SkinPicture> | null
    if (!SKIN_PICTURE_NAME.test(name) || !v || typeof v !== 'object' || typeof v.url !== 'string') continue
    const m = SKIN_ASSET_URL.exec(v.url)
    if (!m || v.assetId !== m[1]) continue
    const size = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 4096
    if (!size(v.width) || !size(v.height)) continue
    out[name] = { url: v.url, assetId: v.assetId, width: v.width!, height: v.height! }
  }
  return Object.keys(out).length ? out : undefined
}

/** The skin's CSS variables, for :style on the surface element (classic: none). */
export function skinStyle(skin: LibrarySkin): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of SKIN_KEYS) {
    const v = skin.values[key]
    if (v !== undefined) out[`--skin-${key}`] = withPictures(v, skin.pictures)
  }
  return out
}

/**
 * A value with its picture(name) made the picture's address: url("/wasset/…"), only ever GEM Shell's (checked
 * again here); a picture the skin doesn't have: none (an empty layer).
 */
export function withPictures(value: string, pictures: LibrarySkin['pictures']): string {
  return value.replace(/picture\s*\(\s*([a-z0-9-]+)\s*\)/gi, (_all, name: string) => {
    const p = pictures?.[name.toLowerCase()]
    return p && SKIN_ASSET_URL.test(p.url) ? `url("${p.url}")` : 'none'
  })
}

/** The surface's class for a skin: 'glu-skinned' once it sets anything. */
export function skinClass(skin: LibrarySkin): string {
  return Object.keys(skin.values).length ? `glu-skinned glu-skin-${skin.id}` : ''
}

// ── Skin files and the editor (3.5.0, 2026-11-02) ──────────────────────────────────────────────────────────────────
// A skin shared as a file: "<name>.gemskin", the skin document as JSON (what skinFileText writes). Loading one goes
// through normalizeSkin like any skin: a file is never trusted more than a document.

export const SKIN_FILE_EXTENSION = 'gemskin'
/** A skin file is small (3.7.0: up to 8 MB with its pictures): more is not a skin. */
export const SKIN_FILE_MAX_BYTES = 8 * 1024 * 1024
/** A picture in a skin file: a PNG or a JPEG as a data address, at most 2 MB. */
const PICTURE_DATA = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/
const MAX_PICTURE_DATA = Math.ceil(2 * 1024 * 1024 * 4 / 3) + 40

export type SkinFieldKind = 'colour' | 'paint' | 'length'
export type SkinField = { key: SkinKey; group: string; label: string; kind: SkinFieldKind; hint?: string }

/** What the editor shows, in its order: each key once, grouped. */
export const SKIN_FIELDS: readonly SkinField[] = [
  { key: 'wall', group: 'Wall', label: 'Wall colour', kind: 'colour' },
  { key: 'wall-pattern', group: 'Wall', label: 'Wall pattern', kind: 'paint', hint: 'Drawn over the colour: slatwall grooves, a gradient.' },
  { key: 'wall-light', group: 'Wall', label: 'Light from above', kind: 'paint' },
  { key: 'bar', group: 'Wall', label: 'Top bar', kind: 'paint' },
  { key: 'floor', group: 'Floor', label: 'Floor', kind: 'paint', hint: 'Tiles, a carpet: the strip the units stand on.' },
  { key: 'floor-height', group: 'Floor', label: 'Floor height', kind: 'length' },
  { key: 'unit', group: 'Units', label: 'Unit body', kind: 'paint' },
  { key: 'unit-back', group: 'Units', label: 'Back panel', kind: 'paint' },
  { key: 'unit-edge', group: 'Units', label: 'Edges', kind: 'colour' },
  { key: 'shelf-light', group: 'Shelves', label: 'Shelf top', kind: 'colour' },
  { key: 'shelf', group: 'Shelves', label: 'Shelf front', kind: 'colour' },
  { key: 'shelf-dark', group: 'Shelves', label: 'Shade under', kind: 'colour' },
  { key: 'sign', group: 'Signs', label: 'Sign text', kind: 'colour' },
  { key: 'sign-glow', group: 'Signs', label: 'Sign glow', kind: 'colour', hint: 'transparent: no glow.' },
  { key: 'sign-board', group: 'Signs', label: 'Sign board', kind: 'paint' },
  { key: 'fg', group: 'Colours', label: 'Text', kind: 'colour' },
  { key: 'muted', group: 'Colours', label: 'Quiet text', kind: 'colour' },
  { key: 'accent', group: 'Colours', label: 'Accent', kind: 'colour' },
  { key: 'warm', group: 'Colours', label: 'Second accent', kind: 'colour' },
  { key: 'panel', group: 'Colours', label: 'Panels', kind: 'colour' },
  { key: 'panel-high', group: 'Colours', label: 'Raised panels', kind: 'colour' },
]

/**
 * The skin as a file's text (pretty JSON: readable and editable by hand). 3.7.0: its pictures as data addresses
 * (pictureData: name → "data:image/png;base64,…", read from GEM Shell's images by the widget: useSkins).
 */
export function skinFileText(skin: LibrarySkin, pictureData: Record<string, string> = {}): string {
  const values: Partial<Record<SkinKey, string>> = {}
  for (const key of SKIN_KEYS) if (skin.values[key] !== undefined) values[key] = skin.values[key]
  const pictures = Object.fromEntries(Object.entries(pictureData).filter(([n, d]) => SKIN_PICTURE_NAME.test(n) && PICTURE_DATA.test(d)).slice(0, MAX_SKIN_PICTURES).map(([n, d]) => [n, { data: d }]))
  const doc = { format: SKIN_FORMAT, skin: gemSkinHeader('library-store', 1, ['game-library', 'media-library']), id: skin.id, name: skin.name, ...(skin.author ? { author: skin.author } : {}), values, ...(Object.keys(pictures).length ? { pictures } : {}) }
  return JSON.stringify(doc, null, 2) + '\n'
}

/**
 * A skin file's text, checked: the skin and how many of its values were left out (not allowed, or unknown names),
 * or an error for the user ("not a skin").
 */
export function parseSkinFile(text: string): { skin: LibrarySkin; dropped: number; pictures: Record<string, { type: 'png' | 'jpeg'; base64: string }> } | { error: string } {
  if (text.length > SKIN_FILE_MAX_BYTES) return { error: 'This file is too big to be a skin.' }
  let raw: unknown
  try { raw = JSON.parse(text.replace(/^﻿/, '')) } catch { return { error: "This file isn't a skin (it isn't JSON)." } }
  const header = readGemSkinHeader(raw)
  if ('error' in header) return header
  const incompatible = incompatibleSkinMessage(header.header)
  if (incompatible) return { error: incompatible }
  if ((raw as { format?: unknown } | null)?.format !== undefined && (raw as { format?: unknown }).format !== SKIN_FORMAT)
    return { error: 'This skin was made for a newer GEM shop: update the widget to load it.' }
  const parsed = normalizeSkin({ ...(raw as object), pictures: undefined })
  if (!parsed) return { error: "This file isn't a skin (it needs a format, an id, a name and values)." }
  const skin: LibrarySkin = parsed
  const given = (raw as { values?: unknown }).values
  const count = given && typeof given === 'object' && !Array.isArray(given) ? Object.keys(given).length : 0
  // 3.7.0: its pictures, as data (made into GEM Shell images when loaded); one that isn't a PNG or a JPEG is left out
  const pictures: Record<string, { type: 'png' | 'jpeg'; base64: string }> = {}
  let droppedPictures = 0
  const rawPictures = (raw as { pictures?: unknown }).pictures
  if (rawPictures && typeof rawPictures === 'object' && !Array.isArray(rawPictures)) {
    for (const [name, p] of Object.entries(rawPictures as Record<string, unknown>)) {
      const data = (p as { data?: unknown } | null)?.data
      const m = typeof data === 'string' && data.length <= MAX_PICTURE_DATA ? PICTURE_DATA.exec(data) : null
      if (!SKIN_PICTURE_NAME.test(name) || !m || Object.keys(pictures).length >= MAX_SKIN_PICTURES) { droppedPictures += 1; continue }
      pictures[name] = { type: m[1] as 'png' | 'jpeg', base64: (data as string).slice((data as string).indexOf(',') + 1) }
    }
  }
  return { skin, dropped: Math.max(0, count - Object.keys(skin.values).length) + droppedPictures, pictures }
}

/** A picture name from a file name ("Neon Carpet.png" → "neon-carpet"), not among <taken>. */
export function pictureName(fileName: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = fileName.replace(/\.[^.]*$/, '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'picture'
  if (!used.has(base)) return base
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`
}

/** An id for a new skin from its name, not among <taken> (the built-ins' ids are always taken). */
export function newSkinId(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken, ...BUILT_IN_SKINS.map(s => s.id)])
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'skin'
  if (!used.has(base)) return base
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`
}

/** A name not among <names>: "Software aisle (copy)", "(copy 2)"... */
export function copyName(name: string, names: Iterable<string>): string {
  const used = new Set(names)
  const base = `${name.replace(/ \(copy(?: \d+)?\)$/, '')} (copy)`.slice(0, 60)
  if (!used.has(base)) return base
  for (let i = 2; ; i++) if (!used.has(`${base.slice(0, -1)} ${i})`)) return `${base.slice(0, -1)} ${i})`
}

/** The built-in skins with <first> first (each shop's own look leads its list). */
export function builtInSkinsFrom(first: string): LibrarySkin[] {
  const lead = BUILT_IN_SKINS.find(s => s.id === first)
  return lead ? [lead, ...BUILT_IN_SKINS.filter(s => s !== lead)] : [...BUILT_IN_SKINS]
}

/** Whether a skin is one of library-ui's (not editable: duplicated to edit). */
export const isBuiltInSkin = (id: string) => BUILT_IN_SKINS.some(s => s.id === id)

/** A value shown in a colour input: #rrggbb when the value is a plain hex colour, else ''. */
export function colourInputValue(value: string | undefined): string {
  const v = value?.trim() ?? ''
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7).toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + [...v.slice(1)].map(c => c + c).join('')).toLowerCase()
  return ''
}
/** A colour picked (#rrggbb) put in place of <old>, keeping its transparency (#rrggbbaa). */
export function withPickedColour(old: string | undefined, picked: string): string {
  const v = old?.trim() ?? ''
  return /^#[0-9a-f]{8}$/i.test(v) ? picked + v.slice(7) : picked
}
