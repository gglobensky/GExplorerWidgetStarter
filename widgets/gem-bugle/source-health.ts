import type { BugleSource } from './model'

export type SourceHealth = {
  tone: 'unknown' | 'healthy' | 'error' | 'paused'
  label: string
  detail: string
}

function relativeTime(time: number | undefined, now: number): string {
  if (!time) return 'never'
  const minutes = Math.max(0, Math.round((now - time) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function sourceHealth(source: BugleSource, now = Date.now()): SourceHealth {
  if (!source.enabled) {
    return { tone: 'paused', label: 'Paused', detail: 'Not included in refreshes' }
  }
  if (source.lastError) {
    return {
      tone: 'error',
      label: 'Needs attention',
      detail: `${source.lastError} · checked ${relativeTime(source.lastCheckedAt, now)}`,
    }
  }
  if (source.lastCheckedAt) {
    const count = source.lastItemCount ?? 0
    return {
      tone: 'healthy',
      label: 'Healthy',
      detail: `${count} ${count === 1 ? 'item' : 'items'} · checked ${relativeTime(source.lastCheckedAt, now)}`,
    }
  }
  return { tone: 'unknown', label: 'Not checked', detail: 'Check sources to test this feed' }
}
