import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ScopedMessaging, SlotProvider, WidgetSdk } from 'gexplorer/widgets'
import { CALENDAR_CONTRACT, CALENDAR_CONTRACT_VERSION, CALENDAR_TOPICS, providerEventId, providerOriginalEventId,
  readCalendarProviderDeclaration, type CalendarProviderCapabilities, type CalendarProviderCommand, type CalendarProviderSnapshot } from './calendarProvider'
import { normalizeClockEvents, type ClockEvent } from './useClockCalendar'

export type ResolvedCalendarProvider = {
  key: string
  widgetType: string
  label: string
  description?: string
  declared: CalendarProviderCapabilities
}

export function useCalendarProvider(sdk: WidgetSdk | undefined, providers: Ref<readonly SlotProvider[]> | ComputedRef<readonly SlotProvider[]>, selected: Ref<string>) {
  const events = ref<ClockEvent[]>([]), online = ref(false), error = ref(''), revision = ref<string | number | null>(null)
  const targetInstance = ref<string | null>(null), negotiated = ref<CalendarProviderCapabilities>({})
  const messaging: ScopedMessaging | null = sdk?.messaging?.() ?? null
  let requestId = '', timeout: ReturnType<typeof setTimeout> | null = null
  const available = computed<ResolvedCalendarProvider[]>(() => providers.value.flatMap(provider => {
    const contract = readCalendarProviderDeclaration(provider.props?.calendarContract)
    return contract ? [{ key: provider.key || `${provider.widgetType}::calendar`, widgetType: provider.widgetType,
      label: contract.label, description: contract.description, declared: contract.capabilities ?? {} }] : []
  }))
  const active = computed(() => available.value.find(p => p.key === selected.value) ?? null)
  const capabilities = computed(() => ({ ...active.value?.declared, ...negotiated.value }))

  function requestSnapshot(clear = true) {
    const provider = active.value
    if (clear) { events.value = []; targetInstance.value = null; negotiated.value = {} }
    online.value = false; error.value = ''
    if (!messaging || !provider) return
    requestId = `clock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    messaging.send(undefined, CALENDAR_TOPICS.discover, { contract: CALENDAR_CONTRACT, version: CALENDAR_CONTRACT_VERSION, provider: provider.widgetType, requestId })
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => { if (!online.value) error.value = `${provider.label} is installed but is not currently available.` }, 2500)
  }

  messaging?.on(CALENDAR_TOPICS.snapshot, msg => {
    const snapshot = msg.payload as CalendarProviderSnapshot & { requestId?: string }
    const provider = active.value
    if (!provider || snapshot?.contract !== CALENDAR_CONTRACT || snapshot.version !== CALENDAR_CONTRACT_VERSION || snapshot.provider !== provider.widgetType) return
    if (snapshot.requestId && requestId && snapshot.requestId !== requestId) return
    const normalized = normalizeClockEvents({ events: snapshot.events }).map(event => ({ ...event, id: providerEventId(provider.widgetType, event.id) }))
    events.value = normalized; online.value = !snapshot.error; error.value = snapshot.error?.slice(0, 240) ?? ''
    revision.value = snapshot.revision; targetInstance.value = msg.from
    negotiated.value = snapshot.capabilities ?? {}; if (timeout) clearTimeout(timeout)
  })
  messaging?.on(CALENDAR_TOPICS.changed, msg => {
    const provider = active.value, payload = msg.payload as { contract?: string; version?: number; provider?: string } | null
    if (provider && payload?.contract === CALENDAR_CONTRACT && payload.version === CALENDAR_CONTRACT_VERSION && payload.provider === provider.widgetType) requestSnapshot(false)
  })
  watch([selected, providers], () => requestSnapshot(true), { immediate: true })

  function command(value: CalendarProviderCommand) {
    if (!messaging || !active.value || !targetInstance.value) return false
    messaging.send(targetInstance.value, CALENDAR_TOPICS.command, { contract: CALENDAR_CONTRACT, version: CALENDAR_CONTRACT_VERSION, provider: active.value.widgetType, command: value })
    return true
  }
  const create = (event: Omit<ClockEvent, 'id'>) => command({ action: 'create', event })
  const update = (id: string, event: Omit<ClockEvent, 'id'>) => command({ action: 'update', id: providerOriginalEventId(id), event })
  const remove = (id: string) => command({ action: 'remove', id: providerOriginalEventId(id) })
  const importLocal = (values: ClockEvent[]) => command({ action: 'import', events: values, mode: 'merge' })

  onBeforeUnmount(() => { if (timeout) clearTimeout(timeout); messaging?.cleanup() })
  return { available, active, events, online, error, revision, capabilities, requestSnapshot, create, update, remove, importLocal }
}
export type ClockCalendarProvider = ReturnType<typeof useCalendarProvider>
