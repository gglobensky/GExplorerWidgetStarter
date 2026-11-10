import type { ClockEvent } from './useClockCalendar'

export const CALENDAR_PROVIDER_POINT = 'gem.clock.calendar-provider'
export const CALENDAR_CONTRACT = 'gem.calendar'
export const CALENDAR_CONTRACT_VERSION = 1
export const CALENDAR_TOPICS = {
  discover: 'gem.calendar.v1.discover',
  snapshot: 'gem.calendar.v1.snapshot',
  command: 'gem.calendar.v1.command',
  changed: 'gem.calendar.v1.changed',
} as const

export type CalendarProviderCapabilities = {
  create?: boolean
  update?: boolean
  remove?: boolean
  import?: boolean
}

/** Static metadata placed in entry.ts `provides[].props.calendarContract`. */
export type CalendarProviderDeclaration = {
  contract: typeof CALENDAR_CONTRACT
  version: typeof CALENDAR_CONTRACT_VERSION
  label: string
  description?: string
  capabilities?: CalendarProviderCapabilities
}

export type CalendarProviderSnapshot = {
  contract: typeof CALENDAR_CONTRACT
  version: typeof CALENDAR_CONTRACT_VERSION
  provider: string
  revision: string | number
  events: ClockEvent[]
  capabilities?: CalendarProviderCapabilities
  error?: string
}

export type CalendarProviderCommand =
  | { action: 'create'; event: Omit<ClockEvent, 'id'> }
  | { action: 'update'; id: string; event: Omit<ClockEvent, 'id'> }
  | { action: 'remove'; id: string }
  | { action: 'import'; events: ClockEvent[]; mode: 'merge' }

export function readCalendarProviderDeclaration(raw: unknown): CalendarProviderDeclaration | null {
  const value = raw as Partial<CalendarProviderDeclaration> | null
  if (!value || value.contract !== CALENDAR_CONTRACT || value.version !== CALENDAR_CONTRACT_VERSION || typeof value.label !== 'string' || !value.label.trim()) return null
  const capabilities = value.capabilities && typeof value.capabilities === 'object' ? {
    create: value.capabilities.create === true, update: value.capabilities.update === true,
    remove: value.capabilities.remove === true, import: value.capabilities.import === true,
  } : undefined
  return { contract: CALENDAR_CONTRACT, version: CALENDAR_CONTRACT_VERSION, label: value.label.trim().slice(0, 80),
    description: typeof value.description === 'string' ? value.description.trim().slice(0, 240) : undefined, capabilities }
}

export function providerEventId(provider: string, id: string) { return `${encodeURIComponent(provider)}::${encodeURIComponent(id)}` }
export function providerOriginalEventId(id: string) {
  const split = id.indexOf('::')
  if (split < 0) return id
  try { return decodeURIComponent(id.slice(split + 2)) } catch { return id.slice(split + 2) }
}
