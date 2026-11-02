// widgets/game-library/stores/vdf.ts
//
// Valve's KeyValues text format (libraryfolders.vdf, appmanifest_*.acf): quoted keys and values, nested
// { } blocks, // comments, backslash escapes. Keys are kept as written; read them with vdfGet (any case).

export type VdfValue = string | VdfObject
export type VdfObject = { [key: string]: VdfValue }

/** Parses KeyValues text. Lenient: unquoted tokens are accepted, a broken file returns what was read. */
export function parseVdf(text: string): VdfObject {
  let i = 0
  const n = text.length

  function skip() {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') { i += 1; continue }
      if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i += 1; continue }
      break
    }
  }
  function token(): string | null {
    skip()
    if (i >= n) return null
    if (text[i] === '"') {
      i += 1
      let out = ''
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[i + 1]
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e
          i += 2
          continue
        }
        out += text[i]
        i += 1
      }
      i += 1
      return out
    }
    if (text[i] === '{' || text[i] === '}') return null
    let out = ''
    while (i < n && !/[\s{}"]/.test(text[i])) { out += text[i]; i += 1 }
    return out
  }
  function object(): VdfObject {
    const obj: VdfObject = {}
    for (;;) {
      skip()
      if (i >= n) return obj
      if (text[i] === '}') { i += 1; return obj }
      const key = token()
      if (key === null) { i += 1; continue }
      skip()
      if (text[i] === '{') { i += 1; obj[key] = object(); continue }
      const value = token()
      if (value === null) continue
      obj[key] = value
    }
  }
  return object()
}

/** A child by key, whatever its case (Steam writes "LastPlayed", older files "lastplayed"). */
export function vdfGet(obj: VdfValue | undefined, ...path: string[]): VdfValue | undefined {
  let cur: VdfValue | undefined = obj
  for (const key of path) {
    if (!cur || typeof cur === 'string') return undefined
    const lower = key.toLowerCase()
    const found: string | undefined = Object.keys(cur).find(k => k.toLowerCase() === lower)
    cur = found === undefined ? undefined : cur[found]
  }
  return cur
}

export function vdfString(obj: VdfValue | undefined, ...path: string[]): string | undefined {
  const v = vdfGet(obj, ...path)
  return typeof v === 'string' ? v : undefined
}

export function vdfNumber(obj: VdfValue | undefined, ...path: string[]): number | undefined {
  const s = vdfString(obj, ...path)
  if (s === undefined || s.trim() === '') return undefined
  const v = Number(s)
  return Number.isFinite(v) ? v : undefined
}
