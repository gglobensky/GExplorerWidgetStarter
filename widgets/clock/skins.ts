import type { CSSProperties } from 'vue'
import { cleanGemSkinCssValue, gemSkinHeader, incompatibleSkinMessage, readGemSkinHeader } from '@shared/skin-file'

export const TIMEPIECE_SKIN_FORMAT = 1
export const TIMEPIECE_SKIN_FAMILY = 'timepiece'
export type ClockRenderer = 'digital' | 'analog' | 'nixie' | 'matrix' | 'flap'

export const TIMEPIECE_SKIN_KEYS = [
  'bg', 'panel', 'fg', 'muted', 'accent', 'accent-2', 'edge',
  'dial', 'tick', 'hand-hour', 'hand-minute', 'hand-second',
  'digit', 'digit-off', 'glow', 'calendar-paper', 'calendar-ink',
  'calendar-rule', 'calendar-mark', 'calendar-today', 'calendar-rings', 'radius',
] as const
export type TimepieceSkinKey = typeof TIMEPIECE_SKIN_KEYS[number]

export type TimepieceSkin = {
  format: typeof TIMEPIECE_SKIN_FORMAT
  id: string
  name: string
  author?: string
  renderer: ClockRenderer
  values: Partial<Record<TimepieceSkinKey, string>>
}

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/
const RENDERERS: ClockRenderer[] = ['digital', 'analog', 'nixie', 'matrix', 'flap']

export const BUILT_IN_TIMEPIECE_SKINS: readonly TimepieceSkin[] = [
  {
    format: 1, id: 'quiet-system', name: 'Quiet system', renderer: 'digital', values: {
      bg: 'linear-gradient(145deg,#17212b,#0b1118 72%)', panel: '#15202aaa', fg: '#edf5f7', muted: '#91a2aa',
      accent: '#72c7df', 'accent-2': '#8bd2b3', edge: '#ffffff18', digit: '#f4fbff', 'digit-off': '#ffffff0b',
      glow: '#72c7df42', 'calendar-paper': '#f0ede3', 'calendar-ink': '#25313a', 'calendar-rule': '#5c6d7840',
      'calendar-mark': '#b14f48', 'calendar-today': '#dfeaf0', radius: '14px',
    },
  },
  {
    format: 1, id: 'grand-central', name: 'Grand Central', renderer: 'analog', values: {
      bg: 'radial-gradient(circle at 50% 25%,#33454b,#11191c 68%)', panel: '#192426cc', fg: '#f5ebd1', muted: '#b9ae91',
      accent: '#d4af58', 'accent-2': '#7ca19d', edge: '#d5b86d55', dial: 'radial-gradient(circle,#f2ead5,#d9cfb5)',
      tick: '#273438', 'hand-hour': '#192428', 'hand-minute': '#192428', 'hand-second': '#a84435',
      'calendar-paper': '#e8dfc7', 'calendar-ink': '#26383b', 'calendar-rule': '#6c766d55',
      'calendar-mark': '#9b3b32', 'calendar-today': '#d6c58d', radius: '10px',
    },
  },
  {
    format: 1, id: 'nixie-laboratory', name: 'Nixie laboratory', renderer: 'nixie', values: {
      bg: 'radial-gradient(circle at 50% 10%,#3c2116,#120b08 58%,#050302)', panel: '#190d08d9', fg: '#ffd0a3', muted: '#a87857',
      accent: '#ff7a24', 'accent-2': '#ffd06a', edge: '#ff9b482f', digit: '#ff8a32', 'digit-off': '#5d241a52', glow: '#ff5b18',
      'calendar-paper': '#d8c39f', 'calendar-ink': '#3c261b', 'calendar-rule': '#6f4d3555',
      'calendar-mark': '#a33d24', 'calendar-today': '#f0b66c', radius: '16px',
    },
  },
  {
    format: 1, id: 'matrix-wake', name: 'Matrix wake', renderer: 'matrix', values: {
      bg: 'linear-gradient(#020804,#000)', panel: '#031008d9', fg: '#b8ffc9', muted: '#4e9b62',
      accent: '#48ff78', 'accent-2': '#b8ffc9', edge: '#48ff7833', digit: '#a9ffbf', 'digit-off': '#0f3c1d', glow: '#2dff63',
      'calendar-paper': '#07130a', 'calendar-ink': '#a9ffbf', 'calendar-rule': '#48ff7833',
      'calendar-mark': '#e8ff7a', 'calendar-today': '#174b25', 'calendar-rings': 'none', radius: '2px',
    },
  },
  {
    format: 1, id: 'departure-lounge', name: 'Departure lounge', renderer: 'flap', values: {
      bg: 'linear-gradient(145deg,#6b4938,#261b17 72%)', panel: '#171514', fg: '#f4ead8', muted: '#b7a388',
      accent: '#d8b36c', 'accent-2': '#8eab9a', edge: '#d2b18455', digit: '#eee9dc', 'digit-off': '#544e46', glow: '#00000000',
      'calendar-paper': '#e4d4b8', 'calendar-ink': '#332b25', 'calendar-rule': '#725f4b55',
      'calendar-mark': '#9a3f32', 'calendar-today': '#d7bd88', radius: '5px',
    },
  },
] as const

export function timepieceSkin(id: string | undefined): TimepieceSkin {
  return BUILT_IN_TIMEPIECE_SKINS.find(s => s.id === id) ?? BUILT_IN_TIMEPIECE_SKINS[0]
}

export function timepieceSkinStyle(skin: TimepieceSkin): CSSProperties {
  return Object.fromEntries(Object.entries(skin.values).flatMap(([key, value]) => {
    const clean = cleanGemSkinCssValue(value)
    return clean === undefined ? [] : [[`--clock-${key}`, clean]]
  })) as CSSProperties
}

export function normalizeTimepieceSkin(raw: unknown): TimepieceSkin | null {
  const r = raw as Partial<TimepieceSkin> | null
  if (!r || r.format !== 1 || typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string'
    || !r.name.trim() || r.name.trim().length > 60 || !RENDERERS.includes(r.renderer as ClockRenderer)
    || !r.values || typeof r.values !== 'object' || Array.isArray(r.values)) return null
  const values: Partial<Record<TimepieceSkinKey, string>> = {}
  for (const key of TIMEPIECE_SKIN_KEYS) {
    const clean = cleanGemSkinCssValue((r.values as Record<string, unknown>)[key])
    if (clean !== undefined) values[key] = clean
  }
  const author = typeof r.author === 'string' && r.author.trim() ? r.author.trim().slice(0, 80) : undefined
  return { format: 1, id: r.id, name: r.name.trim(), ...(author ? { author } : {}), renderer: r.renderer as ClockRenderer, values }
}

export function timepieceSkinFileText(skin: TimepieceSkin): string {
  return JSON.stringify({
    format: 1,
    skin: gemSkinHeader(TIMEPIECE_SKIN_FAMILY, 1, ['clock', 'calendar']),
    id: skin.id, name: skin.name, ...(skin.author ? { author: skin.author } : {}),
    renderer: skin.renderer, values: skin.values,
  }, null, 2) + '\n'
}

export function parseTimepieceSkinFile(text: string): { skin: TimepieceSkin; dropped: number } | { error: string } {
  if (text.length > 64 * 1024) return { error: 'This file is too big to be a skin.' }
  let raw: unknown
  try { raw = JSON.parse(text.replace(/^﻿/, '')) } catch { return { error: "This file isn't a skin (it isn't JSON)." } }
  const checked = readGemSkinHeader(raw)
  if ('error' in checked) return checked
  const incompatible = incompatibleSkinMessage(checked.header, TIMEPIECE_SKIN_FAMILY, [1])
  if (incompatible) return { error: incompatible }
  const skin = normalizeTimepieceSkin(raw)
  if (!skin) return { error: "This file isn't a Clock/Calendar skin." }
  const given = (raw as { values?: unknown }).values
  const count = given && typeof given === 'object' && !Array.isArray(given) ? Object.keys(given).length : 0
  return { skin, dropped: Math.max(0, count - Object.keys(skin.values).length) }
}
