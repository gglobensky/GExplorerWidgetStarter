import { computed, ref, watch, type ComputedRef } from 'vue'
import { useSlotProviders } from 'gexplorer/widgets'
import type { SlotProvider, WidgetSdk } from 'gexplorer/widgets'
import { CALENDAR_PROVIDER_POINT } from './calendarProvider'
import { resolveCalendarSelection } from './calendarSelection'
import { useCalendarProvider, type ResolvedCalendarProvider } from './useCalendarProvider'
import { withOccurrenceRemoval, withOccurrenceUpdate, withSeriesUpdate, type ClockCalendar, type ClockEvent } from './useClockCalendar'

export function useCalendarSource(sdk: WidgetSdk | undefined, local: ClockCalendar, preference: ComputedRef<string>) {
  const panelProviders = useSlotProviders('gem.clock.calendar-panel')
  const dataProviderSlots = useSlotProviders(CALENDAR_PROVIDER_POINT)
  const selected = ref('local')
  const selectedDataProvider = computed(() => selected.value.startsWith('data:') ? selected.value.slice(5) : '')
  const external = useCalendarProvider(sdk, dataProviderSlots, selectedDataProvider)
  const legacyProvider = computed<Readonly<SlotProvider> | null>(() => selected.value.startsWith('panel:')
    ? panelProviders.value.find(provider => (provider.key || provider.id) === selected.value.slice(6)) ?? null : null)
  const events = computed(() => selected.value.startsWith('data:') ? external.events.value : selected.value === 'local' ? local.events.value : [])
  const isLocal = computed(() => selected.value === 'local')
  const isExternal = computed(() => selected.value.startsWith('data:'))
  const canCreate = computed(() => isLocal.value || (external.online.value && external.capabilities.value.create === true))
  const canUpdate = computed(() => isLocal.value || (external.online.value && external.capabilities.value.update === true))
  const canRemove = computed(() => isLocal.value || (external.online.value && external.capabilities.value.remove === true))

  watch([preference, external.available, panelProviders], () => {
    const choice = resolveCalendarSelection(preference.value, external.available.value as readonly ResolvedCalendarProvider[], panelProviders.value)
    selected.value = choice.kind === 'local' ? 'local' : `${choice.kind}:${choice.key}`
  }, { immediate: true })

  function add(event: Omit<ClockEvent, 'id'>) { return isLocal.value ? (local.add(event), true) : external.create(event) }
  function update(id: string, event: Omit<ClockEvent, 'id'>) {
    if (isLocal.value) { local.update(id, event); return true }
    const source = external.events.value.find(value => value.id === id)
    if (source) { const { id: _id, ...next } = withSeriesUpdate(source, event); return external.update(id, next) }
    return external.update(id, event)
  }
  function updateOccurrence(id: string, originalStartsAt: number, event: Omit<ClockEvent, 'id'>) {
    if (isLocal.value) { local.updateOccurrence(id, originalStartsAt, event); return true }
    const source = external.events.value.find(value => value.id === id)
    if (!source) return false
    const { id: _id, ...next } = withOccurrenceUpdate(source, originalStartsAt, event)
    return external.update(id, next)
  }
  function remove(id: string) { if (isLocal.value) { local.remove(id); return true }; return external.remove(id) }
  function removeOccurrence(id: string, originalStartsAt: number) {
    if (isLocal.value) { local.removeOccurrence(id, originalStartsAt); return true }
    const source = external.events.value.find(value => value.id === id)
    if (!source) return false
    const { id: _id, ...next } = withOccurrenceRemoval(source, originalStartsAt)
    return external.update(id, next)
  }

  return { selected, events, isLocal, isExternal, canCreate, canUpdate, canRemove, legacyProvider, external,
    add, update, updateOccurrence, remove, removeOccurrence }
}
export type ClockCalendarSource = ReturnType<typeof useCalendarSource>
