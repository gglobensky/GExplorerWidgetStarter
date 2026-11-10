export function durationText(ms: number, precision: boolean | 2 = false): string {
  const safe = Math.max(0, ms), totalSeconds = Math.floor(safe / 1000)
  const h = Math.floor(totalSeconds / 3600), m = Math.floor(totalSeconds % 3600 / 60), s = totalSeconds % 60
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  if (!precision || h) return base
  const digits = precision === 2 ? 2 : 1
  const fraction = Math.floor(safe % 1000 / (digits === 2 ? 10 : 100))
  return `${base}.${String(fraction).padStart(digits, '0')}`
}
