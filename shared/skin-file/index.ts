// Every shareable GEM skin uses the same .gemskin extension. The header says
// which visual vocabulary it uses and which widgets may offer it. Older
// library skins predate the header and remain valid as library-store skins.
export const GEM_SKIN_KIND = 'gem.skin' as const

const SAFE_CSS_VALUE = /^[a-z0-9#%.,\s()\/+\-]*$/i
const CSS_FUNCTIONS = /([a-z-]+)\s*\(/gi
const ALLOWED_CSS_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color-mix',
  'linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient',
  'repeating-conic-gradient', 'calc', 'min', 'max', 'clamp'])

/** A passive colour/length/gradient skin token; never a URL, variable or declaration. */
export function cleanGemSkinCssValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  if (!value || value.length > 600 || !SAFE_CSS_VALUE.test(value)) return undefined
  let depth = 0
  for (const c of value) { if (c === '(') depth += 1; else if (c === ')' && --depth < 0) return undefined }
  if (depth !== 0) return undefined
  for (const match of value.matchAll(CSS_FUNCTIONS)) if (!ALLOWED_CSS_FUNCTIONS.has(match[1].toLowerCase())) return undefined
  return value
}

export type GemSkinHeader = {
  kind: typeof GEM_SKIN_KIND
  family: string
  schema: number
  targets: string[]
}

const WORD = /^[a-z][a-z0-9-]{0,47}$/

export function gemSkinHeader(family: string, schema: number, targets: string[]): GemSkinHeader {
  return { kind: GEM_SKIN_KIND, family, schema, targets }
}

/** A checked header, null for a legacy skin, or an error for a malformed header. */
export function readGemSkinHeader(raw: unknown): { header: GemSkinHeader | null } | { error: string } {
  const value = raw as { skin?: unknown } | null
  if (value?.skin === undefined) return { header: null }
  const h = value.skin as Partial<GemSkinHeader> | null
  if (!h || h.kind !== GEM_SKIN_KIND || typeof h.family !== 'string' || !WORD.test(h.family)
    || !Number.isInteger(h.schema) || Number(h.schema) < 1 || Number(h.schema) > 100
    || !Array.isArray(h.targets) || h.targets.length < 1 || h.targets.length > 20
    || h.targets.some(t => typeof t !== 'string' || !WORD.test(t))) {
    return { error: 'This file has an invalid GEM skin compatibility header.' }
  }
  return { header: { kind: GEM_SKIN_KIND, family: h.family, schema: Number(h.schema), targets: [...new Set(h.targets)] } }
}

export function skinFamilyName(family: string): string {
  if (family === 'library-store') return 'Game/Media Library'
  if (family === 'timepiece') return 'Clock/Calendar'
  return family.split('-').map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(' ')
}

/** A friendly incompatibility, or null when this family/schema can be loaded. */
export function incompatibleSkinMessage(header: GemSkinHeader | null, family: string, schemas: readonly number[]): string | null {
  if (!header) return family === 'library-store'
    ? null
    : 'This is an older Game/Media Library skin, not a Clock/Calendar skin.'
  if (header.family !== family) return `This is a ${skinFamilyName(header.family)} skin, not a ${skinFamilyName(family)} skin.`
  if (!schemas.includes(header.schema)) return `This ${skinFamilyName(family)} skin uses a newer schema. Update the widget to load it.`
  return null
}


