<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import type { SlotProvider, WidgetPlacement, WidgetSdk } from 'gexplorer/widgets'
import { useSlotProviders } from 'gexplorer/widgets'
import CalendarSurface from './CalendarSurface.vue'
import ClockFace from './ClockFace.vue'
import { CITIES, fmt, TIME_ZONES, timeZoneLabel } from './zones'
import { timepieceSkinStyle } from './skins'
import { clockRuntime, type ClockTimer } from './runtime'
import { durationText } from './time'
import SkinStudio from './SkinStudio.vue'
import { useTimepieceSkins } from './useTimepieceSkins'
import { clockEventReminders, useClockCalendar, type ClockEvent } from './useClockCalendar'
import { calendarOccurrences, type CalendarOccurrence } from './calendar'
import { clockLayout, type ClockTab } from './layout'
import { useCalendarSource } from './useCalendarSource'
import { ALARM_SOUNDS, type AlarmSoundId } from './alarmTone'

type ClockConfig = { view?: { skin?: string; tab?: ClockTab; showSeconds?: boolean; calendarProvider?: string; timeZones?: string[]; complications?: Record<string, string[]> } }
const props = defineProps<{ sourceId: string; placement?: WidgetPlacement; config?: ClockConfig }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const settings = sdk?.settings?.()
const runtime = sdk ? clockRuntime(sdk) : null
const notify = (text: string) => { void sdk?.ui?.().snack({ id: 'clock-skins', text, dedupe: 'replace', timeoutMs: 6000 }) }
const skins = useTimepieceSkins(sdk, notify)
const calendar = useClockCalendar(sdk, notify)
const now = ref(new Date())
const viewStamp = ref(Date.now())
let reminderMinute = -1
const tick = setInterval(() => {
  const at = Date.now()
  viewStamp.value = at
  if (Math.floor(at / 1000) !== Math.floor(now.value.getTime() / 1000)) now.value = new Date(at)
  const minute = Math.floor(at / 60_000)
  if (minute !== reminderMinute) { reminderMinute = minute; syncActiveReminders(false) }
}, 10)
onBeforeUnmount(() => clearInterval(tick))

const width = computed(() => props.placement?.size?.width ?? 300)
const height = computed(() => props.placement?.size?.height ?? 200)
const layout = computed(() => clockLayout(width.value, height.value))
const size = computed(() => layout.value.size)
const showSeconds = computed(() => props.config?.view?.showSeconds !== false)
const chosenSkin = ref(props.config?.view?.skin ?? 'quiet-system')
const initialTab = props.config?.view?.tab
const selectedTab = ref<ClockTab>(initialTab === 'calendar' || initialTab === 'timers' || initialTab === 'stopwatch' ? initialTab : 'clock')
watch(() => props.config?.view?.skin, value => { if (value) chosenSkin.value = value })
watch(() => props.config?.view?.tab, value => { if (value === 'clock' || value === 'calendar' || value === 'timers' || value === 'stopwatch') selectedTab.value = value })
const skin = computed(() => skins.draft.value ?? skins.find(chosenSkin.value))
const date = computed(() => now.value.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))
const chosenTimeZones = ref((props.config?.view?.timeZones?.length ? props.config.view.timeZones : CITIES.map(([, zone]) => zone)).slice(0, 3))
const editingZoneIndex = ref(-1)
const zones = computed(() => chosenTimeZones.value.map(timeZone => ({ city: timeZoneLabel(timeZone), timeZone, time: fmt(now.value, timeZone) })))
const complicationProviders = useSlotProviders('gem.clock.complication')
const calendarPreference = computed(() => String(settings?.values.calendarProvider ?? props.config?.view?.calendarProvider ?? 'latest'))
const calendarSource = useCalendarSource(sdk, calendar, calendarPreference)
const { selected: selectedCalendarProvider, events: activeCalendarEvents, canCreate: calendarCanCreate, canUpdate: calendarCanUpdate,
  canRemove: calendarCanRemove, legacyProvider, external: externalCalendar } = calendarSource
const complicationLayout = ref<Record<string, string[]>>({ ...(props.config?.view?.complications ?? {}) })
const arrangingComplications = ref(false)
const complicationId = (provider: Readonly<SlotProvider>) => String(provider.key || provider.id)
const selectedComplicationIds = computed(() => complicationLayout.value[skin.value.id] ?? complicationProviders.value.slice(0, 3).map(complicationId))
const shownComplications = computed(() => selectedComplicationIds.value
  .map(id => complicationProviders.value.find(provider => complicationId(provider) === id))
  .filter((provider): provider is SlotProvider => Boolean(provider)).slice(0, 3))
const hiddenComplications = computed(() => complicationProviders.value.filter(p => !selectedComplicationIds.value.includes(complicationId(p))))
const timerMinutes = ref(10)
const timerLabel = ref('Kitchen timer')
const timerAudible = ref(true)
const chosenAlarmSound = computed<AlarmSoundId>({
  get: () => runtime?.alarmSound.value ?? 'chime',
  set: value => runtime?.setAlarmSound(value),
})
const timerToolPage = ref<'setup' | 'running'>('setup')
const timerListPage = ref(0)
const stopwatchElapsed = computed(() => durationText(runtime?.stopwatchElapsed(viewStamp.value) ?? 0, 2))
const visibleTimers = computed(() => runtime?.timers.value.filter(t => t.status !== 'done' && t.source !== 'calendar') ?? [])
const nextTimer = computed(() => visibleTimers.value.find(timer => timer.status === 'ringing') ?? runtime?.nextTimer() ?? visibleTimers.value[0] ?? null)
const timerRemaining = (timer: { status: string; endAt: number; remainingMs: number }) => timer.status === 'running' ? Math.max(0, timer.endAt - viewStamp.value) : timer.remainingMs
const pageAvailable = computed(() => layout.value.pages)
const compactCalendar = computed(() => layout.value.compactCalendar)
const richTimeTools = computed(() => layout.value.richTimeTools)
const compactStyledTimer = computed(() => layout.value.compactStyledTimer)
const timersPerPage = computed(() => layout.value.timersPerPage)
const timerPageCount = computed(() => Math.max(1, Math.ceil(visibleTimers.value.length / timersPerPage.value)))
const pagedTimers = computed(() => visibleTimers.value.slice(timerListPage.value * timersPerPage.value, (timerListPage.value + 1) * timersPerPage.value))
const nextAppointment = computed(() => {
  const start = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate()).getTime()
  return calendarOccurrences(activeCalendarEvents.value, start, now.value.getTime() + 2 * 366 * 24 * 60 * 60_000, 500)
    .find(event => event.endsAt > now.value.getTime()) ?? null
})
const nextAppointmentWhen = computed(() => {
  const event = nextAppointment.value
  if (!event) return 'Nothing else marked'
  if (event.allDay) return 'All day'
  const sameDay = new Date(event.startsAt).toDateString() === now.value.toDateString()
  return new Date(event.startsAt).toLocaleString([], sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
})

watch(() => props.config?.view?.timeZones, value => {
  if (value?.length) chosenTimeZones.value = value.slice(0, 3)
}, { deep: true })
watch(() => props.config?.view?.complications, value => { if (value) complicationLayout.value = { ...value } }, { deep: true })
watch([activeCalendarEvents, selectedCalendarProvider], () => syncActiveReminders(false), { deep: true, immediate: true })
watch([width, height, selectedTab], () => {
  if (!pageAvailable.value[selectedTab.value]) setTab('clock')
}, { immediate: true })
watch([() => visibleTimers.value.length, timerPageCount], () => { timerListPage.value = Math.min(timerListPage.value, timerPageCount.value - 1) })

function setTab(tab: ClockTab) {
  if (!pageAvailable.value[tab]) return
  selectedTab.value = tab
  void sdk?.setView?.({ tab })
}
function setSkin(id: string) { chosenSkin.value = skins.find(id).id; void sdk?.setView?.({ skin: chosenSkin.value }) }
function previewAlarmSound() { void runtime?.previewAlarmSound(chosenAlarmSound.value) }
function setTimeZone(index: number, timeZone: string) {
  if (!TIME_ZONES.includes(timeZone)) return
  chosenTimeZones.value = chosenTimeZones.value.map((value, at) => at === index ? timeZone : value)
  editingZoneIndex.value = -1
  void sdk?.setView?.({ timeZones: chosenTimeZones.value })
}
async function openViewMenu(event: MouseEvent) {
  if (!sdk?.ui) return
  event.preventDefault()
  event.stopPropagation()
  const anchor = event.currentTarget as HTMLElement
  const timerCount = visibleTimers.value.length
  const appointment = nextAppointment.value?.title.slice(0, 58)
  const choice = await sdk.ui().menu(event, [
    { id: 'clock', label: 'Clock' },
    { id: 'calendar', label: appointment ? `Calendar · ${appointment}` : 'Calendar', disabled: !pageAvailable.value.calendar, title: pageAvailable.value.calendar ? undefined : 'Make the widget larger to use Calendar' },
    { id: 'timers', label: timerCount ? `Timers · ${timerCount} active` : 'Timers', disabled: !pageAvailable.value.timers, title: pageAvailable.value.timers ? undefined : 'Make the widget larger to use Timers' },
    { id: 'stopwatch', label: runtime?.stopwatch.status === 'running' ? 'Stopwatch · running' : 'Stopwatch', disabled: !pageAvailable.value.stopwatch, title: pageAvailable.value.stopwatch ? undefined : 'Make the widget larger to use Stopwatch' },
    { id: 'skin-menu', label: `Skin · ${skin.value.name}  ›` },
  ], { preferred: selectedTab.value, label: 'Clock view' })
  if (choice === 'clock' || choice === 'calendar' || choice === 'timers' || choice === 'stopwatch') setTab(choice)
  else if (choice === 'skin-menu') await openSkinMenu(event, anchor)
}
async function openContextMenu(event: MouseEvent) {
  if (!sdk?.ui) return
  event.preventDefault()
  event.stopPropagation()
  const zoneElement = (event.target as Element | null)?.closest?.('[data-zone-index]') as HTMLElement | null
  if (selectedTab.value === 'clock') {
    const directIndex = zoneElement ? Number(zoneElement.dataset.zoneIndex) : -1
    const choice = await sdk.ui().menu(event, [
      ...(directIndex >= 0 ? [{ id: `zone:${directIndex}`, label: `Change ${zones.value[directIndex]?.city || 'time zone'}…` }] : zones.value.map((zone, index) => ({ id: `zone:${index}`, label: `Change ${zone.city}…` }))),
      { id: 'seconds', label: `${showSeconds.value ? 'Hide' : 'Show'} seconds` },
    ], { label: 'Clock actions' })
    if (choice?.startsWith('zone:')) editingZoneIndex.value = Number(choice.slice(5))
    else if (choice === 'seconds') void sdk.setView?.({ showSeconds: !showSeconds.value })
    return
  }
  if (selectedTab.value === 'calendar') {
    const choice = await sdk.ui().menu(event, [{ id: 'new', label: 'New appointment today', disabled: !calendarCanCreate.value }], { label: 'Calendar actions' })
    if (choice === 'new') calendarPanel.value?.openDate(now.value)
    return
  }
  if (selectedTab.value === 'timers') {
    const timer = nextTimer.value
    const choice = await sdk.ui().menu(event, [
      { id: 'new', label: 'New timer' },
      ...(timer?.status === 'ringing' ? [
        { id: 'snooze', label: `Snooze ${timer.label} for 5 minutes` },
        { id: 'dismiss', label: `Dismiss ${timer.label}` },
      ] : timer ? [{ id: 'toggle', label: timer.status === 'running' ? `Pause ${timer.label}` : `Resume ${timer.label}` }] : []),
    ], { label: 'Timer actions' })
    if (choice === 'new') timerToolPage.value = 'setup'
    else if (choice === 'toggle' && timer) timer.status === 'running' ? runtime?.pauseTimer(timer.id) : runtime?.resumeTimer(timer.id)
    else if (choice === 'snooze' && timer) runtime?.snoozeTimer(timer.id)
    else if (choice === 'dismiss' && timer) runtime?.dismissTimer(timer.id)
    return
  }
  const running = runtime?.stopwatch.status === 'running'
  const choice = await sdk.ui().menu(event, [
    { id: 'toggle', label: running ? 'Pause stopwatch' : runtime?.stopwatch.status === 'paused' ? 'Resume stopwatch' : 'Start stopwatch' },
    { id: 'reset', label: 'Reset stopwatch', disabled: runtime?.stopwatch.status === 'idle' },
  ], { label: 'Stopwatch actions' })
  if (choice === 'toggle') running ? runtime?.pauseStopwatch() : runtime?.startStopwatch()
  else if (choice === 'reset') void resetStopwatch()
}
async function openSkinMenu(at: MouseEvent | HTMLElement, managerAnchor: HTMLElement) {
  if (!sdk?.ui) return
  const all = skins.all.value
  const chosen = all.find(value => value.id === skin.value.id)
  const shown = [chosen, ...all.filter(value => value.id !== chosen?.id)].filter(Boolean).slice(0, 26)
  const choice = await sdk.ui().menu(at, [
    ...shown.map(value => ({ id: `skin:${value!.id}`, label: `${value!.id === skin.value.id ? '✓  ' : ''}${value!.name}` })),
    { id: 'skin-load', label: 'Load a skin…' },
    { id: 'skin-manage', label: 'Manage skins…' },
  ], { preferred: `skin:${skin.value.id}`, label: 'Clock skin' })
  if (choice?.startsWith('skin:')) setSkin(choice.slice(5))
  else if (choice === 'skin-load') {
    const loaded = await skins.importFiles()
    if (loaded) setSkin(loaded.id)
  } else if (choice === 'skin-manage') openSkinManager(managerAnchor)
}
function openSkinManager(anchor: HTMLElement) {
  type UiApi = ReturnType<NonNullable<WidgetSdk['ui']>>
  let popover: ReturnType<UiApi['openPopover']>
  const propsFor = (selected: string) => ({
    selected, now: now.value,
    onSelect: (id: string) => { setSkin(id); popover?.update(propsFor(id)) },
  })
  popover = sdk?.ui?.().openPopover({
    anchor, component: SkinStudio, placement: 'center', maxWidth: 920, maxHeight: 720, title: 'Skins',
    props: propsFor(skin.value.id),
  }) ?? null
}
function addTimer(minutes = timerMinutes.value) {
  void runtime?.addTimer(minutes * 60_000, timerLabel.value, timerAudible.value)
  timerToolPage.value = 'running'
}
async function removeTimer(timer: ClockTimer) {
  if (!runtime) return
  const okay = !sdk?.ui || await sdk.ui().confirm(`Remove “${timer.label}”?`, {
    title: 'Remove timer', detail: timer.status === 'ringing' ? 'This also stops its alarm.' : 'The countdown cannot be restored.', okLabel: 'Remove', danger: true,
  })
  if (okay) runtime.removeTimer(timer.id)
}
async function resetStopwatch() {
  if (!runtime || runtime.stopwatch.status === 'idle') return
  const okay = !sdk?.ui || await sdk.ui().confirm('Reset the stopwatch to zero?', {
    title: 'Reset stopwatch', detail: runtime.stopwatch.laps.length ? `Its ${runtime.stopwatch.laps.length} lap${runtime.stopwatch.laps.length === 1 ? '' : 's'} will also be cleared.` : 'The elapsed time cannot be restored.', okLabel: 'Reset', danger: true,
  })
  if (okay) runtime.resetStopwatch()
}
function syncActiveReminders(userGesture: boolean) { void runtime?.syncCalendarReminders(clockEventReminders(activeCalendarEvents.value), userGesture) }
type ClockOccurrence = CalendarOccurrence<ClockEvent>
const calendarPanel = ref<InstanceType<typeof CalendarSurface> | null>(null)
async function openCalendarContext(event: MouseEvent, date: Date, marks: ClockOccurrence[]) {
  if (!sdk?.ui) return
  event.preventDefault()
  event.stopPropagation()
  const shownMarks = marks.slice(0, 5)
  const choice = await sdk.ui().menu(event, [
    { id: 'new', label: `New appointment on ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`, disabled: !calendarCanCreate.value },
    ...shownMarks.flatMap(mark => {
      const recurring = mark.recurrence && mark.recurrence !== 'none'
      return [
        { id: `edit:${mark.occurrenceId}`, label: `Edit ${mark.title}`, disabled: !calendarCanUpdate.value },
        { id: `remove:${mark.occurrenceId}`, label: recurring ? `Remove this occurrence · ${mark.title}` : `Remove ${mark.title}`, disabled: recurring ? !calendarCanUpdate.value : !calendarCanRemove.value },
        ...(recurring ? [{ id: `remove-series:${mark.occurrenceId}`, label: `Remove whole series · ${mark.title}`, disabled: !calendarCanRemove.value }] : []),
      ]
    }),
  ], { label: 'Calendar actions' })
  if (choice === 'new') calendarPanel.value?.openDate(date)
  else if (choice?.startsWith('edit:')) {
    const mark = marks.find(value => value.occurrenceId === choice.slice(5))
    if (mark) calendarPanel.value?.openOccurrence(mark)
  } else if (choice?.startsWith('remove-series:')) {
    const mark = marks.find(value => value.occurrenceId === choice.slice(14))
    if (mark) await confirmCalendarRemoval(mark, true)
  } else if (choice?.startsWith('remove:')) {
    const mark = marks.find(value => value.occurrenceId === choice.slice(7))
    if (mark) await confirmCalendarRemoval(mark, false)
  }
}
async function confirmCalendarRemoval(mark: ClockOccurrence, wholeSeries: boolean) {
  const recurring = mark.recurrence && mark.recurrence !== 'none'
  const what = wholeSeries ? `the whole “${mark.title}” series` : recurring ? `this occurrence of “${mark.title}”` : `“${mark.title}”`
  const okay = !sdk?.ui || await sdk.ui().confirm(`Remove ${what}?`, {
    title: wholeSeries ? 'Remove appointment series' : 'Remove appointment',
    detail: wholeSeries ? 'Every occurrence in this series will be removed.' : recurring ? 'The rest of the recurring series will stay on the calendar.' : 'This appointment cannot be restored.',
    okLabel: 'Remove', danger: true,
  })
  if (!okay) return
  if (recurring && !wholeSeries) removeCalendarOccurrence(mark.seriesId, mark.originalStartsAt)
  else removeCalendarEvent(mark.seriesId)
}
function requestCalendarRemoval(mark: ClockOccurrence) { void confirmCalendarRemoval(mark, false) }
function addCalendarEvent(event: Omit<ClockEvent, 'id'>) {
  if (calendarSource.isExternal.value && event.audible !== false) void sdk?.audio?.().prime()
  calendarSource.add(event)
  syncActiveReminders(true)
}
function updateCalendarEvent(id: string, event: Omit<ClockEvent, 'id'>) {
  calendarSource.update(id, event)
  syncActiveReminders(true)
}
function updateCalendarOccurrence(id: string, originalStartsAt: number, event: Omit<ClockEvent, 'id'>) {
  calendarSource.updateOccurrence(id, originalStartsAt, event)
  syncActiveReminders(true)
}
function removeCalendarEvent(id: string) {
  calendarSource.remove(id)
  syncActiveReminders(false)
}
function removeCalendarOccurrence(id: string, originalStartsAt: number) {
  calendarSource.removeOccurrence(id, originalStartsAt)
  syncActiveReminders(false)
}
function saveComplications(ids: string[]) {
  complicationLayout.value = { ...complicationLayout.value, [skin.value.id]: ids.slice(0, 3) }
  void sdk?.setView?.({ complications: complicationLayout.value })
}
function removeComplication(id: string) { saveComplications(selectedComplicationIds.value.filter(value => value !== id)) }
function addComplication(id: string) { saveComplications([...selectedComplicationIds.value, id]) }
function moveComplication(id: string, delta: number) {
  const ids = [...selectedComplicationIds.value], index = ids.indexOf(id), next = index + delta
  if (index < 0 || next < 0 || next >= ids.length) return
  ;[ids[index], ids[next]] = [ids[next], ids[index]]; saveComplications(ids)
}
</script>

<template>
  <main class="clock-widget" :class="[`size-${size}`, `renderer-${skin.renderer}`]" :style="timepieceSkinStyle(skin)" @contextmenu="openContextMenu">
    <button type="button" class="widget-menu" title="Clock menu" aria-label="Clock menu" @click="openViewMenu">…</button>
    <nav v-if="size === 'l'" class="tabs" aria-label="Clock sections">
      <button type="button" :class="{ active: selectedTab === 'clock' }" @click="setTab('clock')">Clock</button>
      <button type="button" :class="{ active: selectedTab === 'calendar' }" @click="setTab('calendar')">Calendar</button>
      <button type="button" :class="{ active: selectedTab === 'timers' }" @click="setTab('timers')">Timers</button>
      <button type="button" :class="{ active: selectedTab === 'stopwatch' }" @click="setTab('stopwatch')">Stopwatch</button>
      <span class="tabs-title">{{ skin.name }}</span>
    </nav>
    <section v-if="selectedTab === 'clock'" class="clock-page">
      <ClockFace :now="now" :skin="skin" :show-seconds="size === 's' ? false : showSeconds" />
      <div v-if="size !== 's'" class="date">{{ date }}</div>
      <ul v-if="size === 'l'" class="zones">
        <li v-for="(zone, index) in zones" :key="`${index}:${zone.timeZone}`" :data-zone-index="index" title="Click or right-click to change this time zone" @click="editingZoneIndex=index">
          <select v-if="editingZoneIndex === index" :value="zone.timeZone" aria-label="Time zone" @click.stop @change="setTimeZone(index, ($event.target as HTMLSelectElement).value)" @blur="editingZoneIndex=-1">
            <option v-for="timeZone in TIME_ZONES" :key="timeZone" :value="timeZone">{{ timeZoneLabel(timeZone) }}</option>
          </select>
          <template v-else><span>{{ zone.city }}</span><b>{{ zone.time }}</b></template>
        </li>
      </ul>
      <aside v-if="size === 'l' && complicationProviders.length" class="complications" aria-label="Clock complications">
        <component v-for="provider in shownComplications" :key="provider?.key || provider?.id" :is="provider?.component" v-bind="provider?.props" />
        <button type="button" class="arrange-button" @click="arrangingComplications = !arrangingComplications">{{ arrangingComplications ? 'Done' : 'Arrange' }}</button>
        <div v-if="arrangingComplications" class="complication-picker">
          <div v-for="(provider, index) in shownComplications" :key="provider?.key || provider?.id">
            <span>{{ provider?.props?.label || provider?.widgetType }}</span>
            <button type="button" :disabled="index === 0" title="Move up" @click="moveComplication(complicationId(provider), -1)">↑</button>
            <button type="button" :disabled="index === shownComplications.length - 1" title="Move down" @click="moveComplication(complicationId(provider), 1)">↓</button>
            <button type="button" title="Hide" @click="removeComplication(complicationId(provider))">×</button>
          </div>
          <button v-for="provider in hiddenComplications" :key="provider.key || provider.id" type="button" :disabled="shownComplications.length >= 3" @click="addComplication(complicationId(provider))">+ {{ provider.props?.label || provider.widgetType }}</button>
          <small>Saved for {{ skin.name }} only</small>
        </div>
      </aside>
    </section>
    <section v-else-if="size !== 'l'" class="compact-page" :class="[`compact-${selectedTab}`, { 'week-calendar': compactCalendar && selectedTab === 'calendar' }]">
      <template v-if="selectedTab === 'calendar'">
        <CalendarSurface v-if="compactCalendar" ref="calendarPanel" compact :now="now" :marks="activeCalendarEvents" :provider="legacyProvider"
          :can-create="calendarCanCreate" :can-update="calendarCanUpdate" :can-remove="calendarCanRemove"
          @context="openCalendarContext" @request-remove="requestCalendarRemoval" @add="addCalendarEvent" @update="updateCalendarEvent"
          @update-occurrence="updateCalendarOccurrence" @remove="removeCalendarEvent" @remove-occurrence="removeCalendarOccurrence" />
        <template v-else><div class="compact-date"><strong>{{ now.getDate() }}</strong><span>{{ now.toLocaleDateString([], { weekday:'short', month:'long' }) }}</span></div><div class="compact-next"><small>NEXT APPOINTMENT</small><b>{{ nextAppointment?.title || 'Your day is clear' }}</b><span>{{ nextAppointmentWhen }}</span></div></template>
      </template>
      <template v-else-if="selectedTab === 'timers'">
        <div class="compact-timer-tool">
          <header><small>{{ visibleTimers.length }} ACTIVE TIMER{{ visibleTimers.length === 1 ? '' : 'S' }}</small><b>Timers</b></header>
          <div class="compact-timer-create">
            <input v-model="timerLabel" class="compact-timer-name" maxlength="80" aria-label="Timer name" placeholder="Timer name" />
            <label><input v-model.number="timerMinutes" type="number" min="1" max="10080" aria-label="Minutes" /><span>min</span></label>
            <label class="compact-sound" title="Audible alarm"><input v-model="timerAudible" type="checkbox" /><span>🔔</span></label>
            <button type="button" class="compact-start" @click="addTimer()">Start</button>
          </div>
          <article v-if="nextTimer" :class="nextTimer.status">
            <div><b>{{ nextTimer.label }}</b><small>{{ nextTimer.status === 'ringing' ? 'Ready now' : nextTimer.status }}</small></div>
            <ClockFace v-if="compactStyledTimer" class="compact-timer-face" :now="now" :skin="skin" :display="nextTimer.status === 'ringing' ? 'TIME' : durationText(timerRemaining(nextTimer), 2)" :show-seconds="false" />
            <strong v-else>{{ nextTimer.status === 'ringing' ? 'TIME' : durationText(timerRemaining(nextTimer), 2) }}</strong>
            <button v-if="nextTimer.status === 'running'" type="button" @click="runtime?.pauseTimer(nextTimer.id)">Pause</button>
            <button v-else-if="nextTimer.status === 'paused'" type="button" @click="runtime?.resumeTimer(nextTimer.id)">Resume</button>
            <span v-else class="ring-actions"><button type="button" @click="runtime?.snoozeTimer(nextTimer.id)">Snooze 5m</button><button type="button" @click="runtime?.dismissTimer(nextTimer.id)">Dismiss</button></span>
            <button type="button" class="compact-remove" title="Remove timer" @click="removeTimer(nextTimer)">×</button>
          </article>
          <div v-else class="compact-presets"><span>Quick start</span><button v-for="m in [1,5,10,20]" :key="m" type="button" @click="addTimer(m)">{{ m }}m</button></div>
        </div>
      </template>
      <template v-else-if="selectedTab === 'stopwatch'">
        <div class="compact-symbol">◷</div><div class="compact-next"><small>STOPWATCH · {{ runtime?.stopwatch.status }}</small><b class="compact-elapsed">{{ stopwatchElapsed }}</b><div class="compact-stopwatch-actions"><button v-if="runtime?.stopwatch.status === 'running'" type="button" @click="runtime?.pauseStopwatch()">Pause</button><button v-else type="button" @click="runtime?.startStopwatch()">{{ runtime?.stopwatch.status === 'paused' ? 'Resume' : 'Start' }}</button><button v-if="runtime?.stopwatch.status !== 'idle'" type="button" @click="resetStopwatch">Reset</button></div></div>
      </template>
    </section>
    <section v-else-if="selectedTab === 'calendar'" class="calendar-page">
      <div v-if="selectedCalendarProvider.startsWith('data:')" class="calendar-provider-bar">
        <span v-if="selectedCalendarProvider.startsWith('data:')" :class="externalCalendar.online.value ? 'online' : 'offline'">{{ externalCalendar.online.value ? 'Connected' : externalCalendar.error.value || 'Connecting…' }}</span>
        <button v-if="selectedCalendarProvider.startsWith('data:') && externalCalendar.capabilities.value.import" type="button" @click="externalCalendar.importLocal(calendar.events.value)">Merge Clock marks into provider</button>
      </div>
      <div class="calendar-surface">
        <CalendarSurface ref="calendarPanel" :now="now" :marks="activeCalendarEvents" :provider="legacyProvider"
          :can-create="calendarCanCreate" :can-update="calendarCanUpdate" :can-remove="calendarCanRemove"
          @context="openCalendarContext" @request-remove="requestCalendarRemoval" @add="addCalendarEvent" @update="updateCalendarEvent"
          @update-occurrence="updateCalendarOccurrence" @remove="removeCalendarEvent" @remove-occurrence="removeCalendarOccurrence" />
      </div>
    </section>
    <section v-else-if="selectedTab === 'timers'" class="tool-page timer-page">
      <header><div><small>COUNTDOWNS</small><h2>Timers</h2></div><span>{{ visibleTimers.length }} active</span></header>
      <nav class="tool-pages" aria-label="Timer pages">
        <button type="button" :class="{ active: timerToolPage === 'setup' }" @click="timerToolPage='setup'">New timer</button>
        <button type="button" :class="{ active: timerToolPage === 'running' }" @click="timerToolPage='running'">Running <span>{{ visibleTimers.length }}</span></button>
      </nav>
      <div v-if="timerToolPage === 'setup'" class="timer-pane timer-setup">
        <div class="timer-create">
          <label><span>Name</span><input v-model="timerLabel" maxlength="80" /></label>
          <label><span>Minutes</span><input v-model.number="timerMinutes" type="number" min="1" max="10080" /></label>
          <label class="audible"><input v-model="timerAudible" type="checkbox" /><span>Audible alarm</span></label>
          <button type="button" class="primary" @click="addTimer()">Start timer</button>
        </div>
        <div class="alarm-sound" :class="{ disabled: !timerAudible }">
          <label><span>Alarm sound</span><select v-model="chosenAlarmSound" :disabled="!timerAudible"><option v-for="sound in ALARM_SOUNDS" :key="sound.id" :value="sound.id">{{ sound.label }}</option></select></label>
          <span>{{ ALARM_SOUNDS.find(sound => sound.id === chosenAlarmSound)?.description }}</span>
          <button type="button" :disabled="!timerAudible" @click="previewAlarmSound">▶ Preview</button>
        </div>
        <div class="presets"><span>Quick</span><button v-for="m in [1,5,10,20,45,60]" :key="m" type="button" @click="addTimer(m)">{{ m }}m</button></div>
      </div>
      <div v-else class="timer-pane timer-running">
        <div v-if="richTimeTools && nextTimer" class="timer-feature"><ClockFace :now="now" :skin="skin" :display="durationText(timerRemaining(nextTimer), 2)" :show-seconds="false" /><span>{{ nextTimer.label }}</span></div>
        <div class="timer-list">
          <article v-for="timer in pagedTimers" :key="timer.id" :class="timer.status">
            <div><b>{{ timer.label }}</b><small>{{ timer.status === 'ringing' ? 'Ready now' : timer.status }}</small></div>
            <strong>{{ timer.status === 'ringing' ? 'TIME' : durationText(timerRemaining(timer), 2) }}</strong>
            <button v-if="timer.status === 'running'" type="button" @click="runtime?.pauseTimer(timer.id)">Pause</button>
            <button v-else-if="timer.status === 'paused'" type="button" @click="runtime?.resumeTimer(timer.id)">Resume</button>
            <span v-else class="ring-actions"><button type="button" @click="runtime?.snoozeTimer(timer.id)">Snooze 5m</button><button type="button" @click="runtime?.dismissTimer(timer.id)">Dismiss</button></span>
            <button type="button" class="remove" title="Remove timer" @click="removeTimer(timer)">×</button>
          </article>
          <p v-if="!visibleTimers.length" class="empty">No active timers. Choose New timer to start one.</p>
        </div>
        <div v-if="timerPageCount > 1" class="list-pager"><button type="button" :disabled="timerListPage === 0" @click="timerListPage--">‹</button><span>{{ timerListPage + 1 }} / {{ timerPageCount }}</span><button type="button" :disabled="timerListPage >= timerPageCount - 1" @click="timerListPage++">›</button></div>
      </div>
    </section>
    <section v-else-if="selectedTab === 'stopwatch'" class="tool-page stopwatch-page">
      <header><div><small>CHRONOGRAPH</small><h2>Stopwatch</h2></div><span>{{ runtime?.stopwatch.status }}</span></header>
      <ClockFace v-if="richTimeTools" class="stopwatch-face" :now="now" :skin="skin" :display="stopwatchElapsed" :show-seconds="false" />
      <div v-else class="stopwatch-dial"><i /><strong>{{ stopwatchElapsed }}</strong><small>{{ runtime?.stopwatch.laps.length || 0 }} laps</small></div>
      <div class="stopwatch-actions">
        <button v-if="runtime?.stopwatch.status !== 'running'" type="button" class="primary" @click="runtime?.startStopwatch()">{{ runtime?.stopwatch.status === 'paused' ? 'Resume' : 'Start' }}</button>
        <button v-else type="button" class="primary" @click="runtime?.pauseStopwatch()">Pause</button>
        <button type="button" :disabled="runtime?.stopwatch.status !== 'running'" @click="runtime?.lapStopwatch()">Lap</button>
        <button type="button" :disabled="runtime?.stopwatch.status === 'idle'" @click="resetStopwatch">Reset</button>
      </div>
      <ol class="laps"><li v-for="(lap, i) in runtime?.stopwatch.laps" :key="`${i}-${lap}`"><span>Lap {{ (runtime?.stopwatch.laps.length || 0) - i }}</span><b>{{ durationText(lap, 2) }}</b></li></ol>
    </section>
  </main>
</template>

<style scoped>
.clock-widget { container-type:size; position:relative; display:flex; width:100%; height:100%; min-width:0; min-height:0; flex-direction:column; box-sizing:border-box; overflow:hidden; color:var(--clock-fg,#eef); border:1px solid var(--clock-edge,#ffffff18); border-radius:var(--clock-radius,14px); background:var(--clock-bg,#111); font-family:var(--gex-font,Inter,"Segoe UI",sans-serif); box-shadow:inset 0 1px #fff1; }
.widget-menu { position:absolute; z-index:30; top:5px; right:6px; display:grid; width:25px; height:24px; padding:0 0 6px; place-items:center; border:1px solid transparent; border-radius:5px; color:var(--clock-muted,#aaa); background:color-mix(in srgb,var(--clock-panel,#111) 90%,transparent); box-shadow:0 2px 8px #0005; font:700 17px/1 sans-serif; cursor:pointer; }
.widget-menu:hover,.widget-menu:focus-visible { color:var(--clock-fg,#fff); border-color:var(--clock-edge,#ffffff28); outline:none; }
.tabs { display:flex; min-height:34px; flex:none; align-items:end; gap:3px; padding:5px 8px 0; overflow-x:auto; border-bottom:1px solid var(--clock-edge,#ffffff18); background:var(--clock-panel,#1118); scrollbar-width:none; }
.tabs button { flex:none; padding:6px clamp(7px,2cqw,11px) 7px; border:0; border-bottom:2px solid transparent; color:var(--clock-muted,#aaa); background:transparent; font:600 11px/1 inherit; cursor:pointer; }
.tabs button:hover,.tabs button:focus-visible { color:var(--clock-fg,#fff); }
.tabs button.active { color:var(--clock-fg,#fff); border-bottom-color:var(--clock-accent,#6cf); }
.tabs-title { flex:none; margin:0 30px 7px auto; color:var(--clock-muted,#aaa); font-size:10px; letter-spacing:.04em; white-space:nowrap; }
.clock-page { display:grid; flex:1; min-width:0; min-height:0; grid-template-columns:minmax(0,1.25fr) minmax(130px,.75fr); grid-template-rows:minmax(0,1fr) auto auto; gap:8px clamp(8px,3cqw,16px); align-items:center; padding:12px; }
.clock-page :deep(.analog),.clock-page :deep(.digital) { grid-row:1 / span 3; width:100%; max-width:430px; min-width:0; justify-self:center; box-sizing:border-box; }
.clock-page :deep(.analog) { width:min(100%,82cqh,330px); }
.date { min-width:0; align-self:end; color:var(--clock-fg,#fff); font:600 clamp(12px,3cqw,18px)/1.2 ui-serif,Georgia,serif; overflow-wrap:anywhere; text-align:center; }
.zones { align-self:start; display:grid; gap:3px; min-width:150px; margin:0; padding:8px 0 0; border-top:1px solid var(--clock-edge,#ffffff18); list-style:none; font-variant-numeric:tabular-nums; }
.zones li { display:flex; justify-content:space-between; gap:14px; color:var(--clock-muted,#aaa); font-size:11px; }
.zones li { cursor:pointer; }
.zones li:hover { color:var(--clock-fg,#fff); }
.zones select { width:100%; min-width:0; padding:2px 4px; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111); font:10px/1.2 inherit; }
.zones b { color:var(--clock-fg,#fff); font-weight:600; }
.complications { position:relative; display:grid; grid-column:2; gap:5px; align-self:start; }
.arrange-button { justify-self:end; padding:2px 6px; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; color:var(--clock-muted,#aaa); background:var(--clock-panel,#111a); font:600 8px/1 inherit; cursor:pointer; }
.complication-picker { position:absolute; z-index:6; top:100%; right:0; display:grid; width:210px; gap:4px; padding:8px; border:1px solid var(--clock-edge,#ffffff28); border-radius:7px; background:var(--clock-bg,#111); box-shadow:0 12px 30px #0009; }
.complication-picker>div { display:grid; grid-template-columns:1fr 22px 22px 22px; gap:3px; align-items:center; color:var(--clock-fg,#fff); font-size:9px; }
.complication-picker button { min-width:0; padding:4px; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:600 9px/1 inherit; cursor:pointer; }
.complication-picker button:disabled { opacity:.3; }
.complication-picker small { color:var(--clock-muted,#aaa); font-size:8px; text-align:right; }
.compact-page { position:relative; display:grid; flex:1; min-width:0; min-height:0; grid-template-columns:auto minmax(0,1fr); gap:clamp(6px,4cqw,16px); align-items:center; padding:clamp(5px,5cqw,16px); overflow:hidden; background:radial-gradient(circle at 20% 30%,color-mix(in srgb,var(--clock-accent,#6cf) 9%,transparent),transparent 52%); }
.compact-date { display:grid; min-width:clamp(44px,24cqw,82px); justify-items:center; color:var(--clock-accent,#6cf); }
.compact-date strong { font:300 clamp(30px,24cqh,68px)/.85 ui-serif,Georgia,serif; font-variant-numeric:tabular-nums; }
.compact-date span { max-width:90px; margin-top:4px; color:var(--clock-muted,#aaa); font:600 clamp(7px,2.8cqw,10px)/1.1 inherit; overflow:hidden; text-overflow:ellipsis; text-transform:uppercase; white-space:nowrap; }
.compact-symbol { display:grid; width:clamp(34px,20cqh,70px); aspect-ratio:1; place-items:center; color:var(--clock-accent,#6cf); border:1px solid var(--clock-edge,#ffffff28); border-radius:50%; background:var(--clock-panel,#1118); font-size:clamp(21px,12cqh,42px); }
.compact-next { display:grid; min-width:0; gap:3px; }
.compact-next small { color:var(--clock-muted,#aaa); font-size:clamp(7px,2.5cqw,9px); letter-spacing:.12em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.compact-next b { overflow:hidden; color:var(--clock-fg,#fff); font:600 clamp(12px,6cqw,20px)/1.12 ui-serif,Georgia,serif; text-overflow:ellipsis; white-space:nowrap; }
.compact-next span { overflow:hidden; color:var(--clock-accent,#6cf); font-size:clamp(9px,3.5cqw,12px); text-overflow:ellipsis; white-space:nowrap; }
.compact-next button,.compact-next select { width:max-content; max-width:100%; padding:4px 7px; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:600 9px/1 inherit; }
.compact-elapsed { color:var(--clock-accent,#6cf)!important; font-family:ui-monospace,monospace!important; font-variant-numeric:tabular-nums; }
.compact-stopwatch-actions { display:flex; flex-wrap:wrap; gap:4px; }
.compact-page.compact-timers { display:block; padding:7px 9px; }
.compact-page.week-calendar { display:flex; padding:4px; }
.compact-page.week-calendar>* { width:100%; height:100%; }
.compact-timer-tool { display:grid; height:100%; min-height:0; grid-template-rows:auto auto minmax(0,1fr); gap:5px; }
.compact-timer-tool>header { position:relative; display:flex; min-width:0; align-items:baseline; justify-content:center; gap:8px; }
.compact-timer-tool>header small { position:absolute; left:0; max-width:45%; overflow:hidden; color:var(--clock-muted,#aaa); font-size:7px; letter-spacing:.12em; text-overflow:ellipsis; white-space:nowrap; }
.compact-timer-tool>header b { color:var(--clock-fg,#fff); font:600 11px/1 ui-serif,Georgia,serif; }
.compact-timer-create { display:grid; min-width:0; grid-template-columns:minmax(72px,1fr) 62px 27px auto; gap:4px; }
.compact-timer-create input,.compact-timer-create button,.compact-presets button,.compact-timer-tool article button { min-width:0; padding:4px 6px; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:600 9px/1 inherit; }
.compact-timer-create>label { display:flex; min-width:0; align-items:center; }
.compact-timer-create>label:not(.compact-sound) { border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; background:var(--clock-panel,#111a); }
.compact-timer-create>label:not(.compact-sound) input { width:100%; border:0; background:transparent; }
.compact-timer-create>label:not(.compact-sound) span { padding-right:5px; color:var(--clock-muted,#aaa); font-size:8px; }
.compact-sound { justify-content:center; }
.compact-sound input { position:absolute; opacity:0; pointer-events:none; }
.compact-sound span { display:grid; width:100%; height:100%; place-items:center; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; opacity:.38; }
.compact-sound input:checked+span { color:var(--clock-accent,#6cf); border-color:var(--clock-accent,#6cf); opacity:1; }
.compact-sound input:focus-visible+span { outline:1px solid var(--clock-accent,#6cf); outline-offset:1px; }
.compact-timer-create .compact-start { color:#071117; border-color:var(--clock-accent,#6cf); background:var(--clock-accent,#6cf); }
.compact-timer-tool article { display:grid; min-width:0; grid-template-columns:minmax(0,1fr) auto auto 20px; gap:5px; align-items:center; padding:5px 6px; overflow:hidden; border:1px solid var(--clock-edge,#ffffff18); border-radius:5px; background:var(--clock-panel,#1118); }
.compact-timer-tool article:has(.compact-timer-face) { min-height:72px; grid-template-columns:minmax(70px,.65fr) minmax(132px,1.35fr) auto 20px; }
.compact-timer-face { width:100%; height:64px; min-height:0!important; padding:3px!important; box-sizing:border-box; }
.compact-timer-face.analog { width:64px; justify-self:center; }
.compact-timer-face.nixie :deep(.nixie-base),.compact-timer-face.nixie :deep(.tube-label) { display:none; }
.compact-timer-face.flap :deep(.flap-label) { display:none; }
.compact-timer-face.nixie :deep(.tube) { max-width:30px; max-height:58px; }
.compact-timer-face.matrix :deep(.digits) { font-size:clamp(18px,7cqw,31px); }
.compact-timer-tool article>div { display:grid; min-width:0; }
.compact-timer-tool article b { overflow:hidden; color:var(--clock-fg,#fff); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
.compact-timer-tool article small { color:var(--clock-muted,#aaa); font-size:7px; text-transform:capitalize; }
.compact-timer-tool article strong { color:var(--clock-accent,#6cf); font:700 clamp(13px,5cqw,19px)/1 ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.compact-timer-tool article.ringing { border-color:var(--clock-accent-2,#fb5); }
.compact-timer-tool article .compact-remove { width:20px; padding:4px 0; color:var(--clock-muted,#aaa); }
.ring-actions { display:flex; gap:4px; }
.compact-timer-tool .ring-actions { flex-direction:column; }
.ring-actions button { white-space:nowrap; }
.compact-presets { display:flex; min-width:0; align-items:center; gap:4px; }
.compact-presets span { margin-right:auto; color:var(--clock-muted,#aaa); font-size:8px; text-transform:uppercase; }
.calendar-page { display:flex; flex:1; min-height:0; flex-direction:column; gap:7px; padding:8px clamp(12px,3cqw,25px) clamp(12px,3cqw,25px); overflow:hidden; }
.calendar-provider-bar { display:flex; min-height:28px; flex-wrap:wrap; align-items:center; gap:6px 9px; color:var(--clock-muted,#aaa); font-size:9px; }
.calendar-provider-bar>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.calendar-provider-bar .online { color:#72d89a; }
.calendar-provider-bar .offline { color:var(--clock-accent-2,#fb5); }
.calendar-provider-bar>button { margin-left:auto; padding:4px 7px; border:1px solid var(--clock-edge,#ffffff28); border-radius:4px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:600 9px/1 inherit; cursor:pointer; }
.calendar-surface { flex:1; min-height:0; }
.calendar-surface>* { width:100%; height:100%; }
.tool-page { flex:1; min-height:0; padding:clamp(14px,4cqw,30px); overflow:hidden; }
.tool-page>header { position:relative; display:flex; align-items:end; justify-content:center; padding:0 34px 10px; border-bottom:1px solid var(--clock-edge,#ffffff18); text-align:center; }
.tool-page h2 { margin:1px 0 0; font:700 clamp(19px,4cqw,30px)/1 ui-serif,Georgia,serif; }
.tool-page header small,.tool-page header>span { color:var(--clock-muted,#aaa); font-size:9px; letter-spacing:.13em; text-transform:uppercase; }
.tool-page header>span { position:absolute; bottom:11px; left:0; }
.timer-create { display:grid; grid-template-columns:minmax(120px,1fr) 90px auto auto; gap:8px; align-items:end; margin:15px 0 9px; }
.timer-create label:not(.audible) { display:grid; gap:4px; color:var(--clock-muted,#aaa); font-size:9px; text-transform:uppercase; }
.timer-create input[type="text"],.timer-create input:not([type]) ,.timer-create input[type="number"] { min-width:0; padding:7px 8px; border:1px solid var(--clock-edge,#ffffff28); border-radius:5px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:12px inherit; }
.audible { display:flex; align-items:center; gap:5px; padding:7px 0; color:var(--clock-muted,#aaa); font-size:11px; }
.alarm-sound { display:flex; min-width:0; align-items:end; gap:8px; margin:0 0 9px; }
.alarm-sound>label { display:grid; min-width:130px; gap:4px; color:var(--clock-muted,#aaa); font-size:9px; text-transform:uppercase; }
.alarm-sound select { min-width:0; padding:6px 8px; border:1px solid var(--clock-edge,#ffffff28); border-radius:5px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:11px inherit; }
.alarm-sound>span { min-width:0; flex:1; padding-bottom:6px; overflow:hidden; color:var(--clock-muted,#aaa); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
.alarm-sound.disabled { opacity:.5; }
.tool-page button { padding:6px 9px; border:1px solid var(--clock-edge,#ffffff28); border-radius:5px; color:var(--clock-fg,#fff); background:var(--clock-panel,#111a); font:600 10px/1 inherit; cursor:pointer; }
.tool-page button:hover:not(:disabled) { border-color:var(--clock-accent,#6cf); }
.tool-page button.primary { color:#071117; border-color:var(--clock-accent,#6cf); background:var(--clock-accent,#6cf); }
.tool-page button:disabled { opacity:.35; cursor:default; }
.tool-pages { display:flex; justify-content:center; gap:4px; margin:10px 0 2px; }
.tool-pages button { padding:5px 10px; color:var(--clock-muted,#aaa); }
.tool-pages button.active { color:var(--clock-fg,#fff); border-color:var(--clock-accent,#6cf); background:color-mix(in srgb,var(--clock-accent,#6cf) 13%,var(--clock-panel,#111a)); }
.tool-pages span { display:inline-grid; min-width:14px; height:14px; margin-left:3px; place-items:center; border-radius:8px; background:var(--clock-edge,#ffffff28); font-size:8px; }
.timer-pane { min-height:0; }
.presets { display:flex; align-items:center; gap:5px; color:var(--clock-muted,#aaa); font-size:9px; text-transform:uppercase; }
.presets button { padding:4px 7px; }
.timer-feature { position:relative; display:grid; min-height:112px; place-items:center; margin:10px auto 0; }
.timer-feature :deep(.digital) { width:min(100%,430px); max-height:150px; }
.timer-feature :deep(.analog) { width:min(26cqw,23cqh,170px); }
.timer-feature>span { position:absolute; right:8px; bottom:5px; max-width:42%; overflow:hidden; color:var(--clock-muted,#aaa); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
.timer-list { display:grid; gap:6px; margin-top:14px; }
.timer-list article { display:grid; grid-template-columns:1fr auto auto 22px; gap:8px; align-items:center; padding:8px 9px; border:1px solid var(--clock-edge,#ffffff18); border-radius:7px; background:var(--clock-panel,#1118); }
.timer-list article>div { display:grid; min-width:0; }
.timer-list article b { overflow:hidden; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.timer-list article small { color:var(--clock-muted,#aaa); font-size:9px; text-transform:capitalize; }
.timer-list article strong { color:var(--clock-accent,#6cf); font:700 17px/1 ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.timer-list article.ringing { border-color:var(--clock-accent-2,#fb5); box-shadow:0 0 18px color-mix(in srgb,var(--clock-accent-2,#fb5) 25%,transparent); }
.timer-list .remove { width:22px; padding:4px 0; }
.list-pager { display:flex; align-items:center; justify-content:center; gap:7px; margin-top:7px; color:var(--clock-muted,#aaa); font-size:9px; }
.list-pager button { width:25px; padding:4px; }
.empty { margin:25px auto; max-width:370px; color:var(--clock-muted,#aaa); font-size:11px; line-height:1.5; text-align:center; }
.stopwatch-page { display:flex; align-items:center; flex-direction:column; }
.stopwatch-page>header { align-self:stretch; }
.stopwatch-face { width:min(100%,500px)!important; max-height:210px; margin:14px; flex:none; box-sizing:border-box; }
.stopwatch-page :deep(.stopwatch-face.analog) { width:min(42cqw,32cqh,210px)!important; }
.stopwatch-page :deep(.stopwatch-face.digital) { width:min(100%,480px)!important; }
.stopwatch-dial { position:relative; display:grid; width:min(48cqw,38cqh,260px); aspect-ratio:1; place-content:center; margin:14px; border:clamp(4px,1.2cqw,8px) solid var(--clock-edge,#ffffff28); border-radius:50%; background:radial-gradient(circle,var(--clock-panel,#111c),#0005); box-shadow:0 13px 28px #0006,inset 0 0 24px #0006; text-align:center; }
.stopwatch-dial::before { content:""; position:absolute; inset:5%; border:1px dashed var(--clock-muted,#aaa); border-radius:50%; opacity:.4; }
.stopwatch-dial i { position:absolute; top:-8%; left:50%; width:18%; height:10%; border:3px solid var(--clock-edge,#777); border-bottom:0; border-radius:5px 5px 0 0; transform:translateX(-50%); }
.stopwatch-dial strong { position:relative; font:700 clamp(24px,8cqw,50px)/1 ui-monospace,monospace; font-variant-numeric:tabular-nums; text-shadow:0 0 15px var(--clock-glow,transparent); }
.stopwatch-dial small { margin-top:7px; color:var(--clock-muted,#aaa); font-size:9px; letter-spacing:.1em; text-transform:uppercase; }
.stopwatch-actions { display:flex; gap:7px; }
.laps { width:min(100%,420px); margin:14px 0 0; padding:0; list-style:none; }
.laps li { display:flex; justify-content:space-between; padding:5px 7px; border-bottom:1px solid var(--clock-edge,#ffffff18); color:var(--clock-muted,#aaa); font-size:10px; }
.laps b { color:var(--clock-fg,#fff); font:600 11px/1 ui-monospace,monospace; }
@container (max-width:560px) { .timer-create { grid-template-columns:1fr 80px; } .audible { grid-column:1; } }
@container (max-height:390px) {
  .tool-page { padding:8px 16px 7px; }
  .tool-page>header { display:none; }
  .tool-pages { margin:0 0 5px; }
  .timer-create { margin:5px 0 7px; }
  .alarm-sound { margin-bottom:5px; }
  .timer-list { margin-top:3px; }
  .stopwatch-face { max-height:145px; margin:5px; }
  .stopwatch-page :deep(.stopwatch-face.analog) { width:min(34cqw,49cqh,150px)!important; }
  .stopwatch-dial { width:min(38cqw,48cqh,155px); margin:5px; }
  .stopwatch-actions button { padding:5px 8px; }
  .laps { margin-top:6px; }
  .laps li:nth-child(n+4) { display:none; }
}
.size-m .clock-page,.size-s .clock-page { display:flex; justify-content:center; flex-direction:column; gap:6px; padding:8px; }
.size-m .clock-page :deep(.analog) { width:min(68cqw,68cqh,250px); }
.size-m .clock-page :deep(.digital) { max-width:94%; }
.renderer-analog.size-m .clock-page,.renderer-analog.size-s .clock-page { gap:0; padding-block:0; }
.renderer-analog.size-m .clock-page :deep(.analog),.renderer-analog.size-s .clock-page :deep(.analog) { width:auto; height:100%; max-width:100%; max-height:100%; }
.renderer-analog.size-m .date { display:none; }
.size-s { border-radius:min(var(--clock-radius,14px),8px); }
.size-s .clock-page { padding:4px; }
.size-s .clock-page :deep(.digital) { width:100%; padding:4px; border:0; background:transparent; box-shadow:none; }
.size-s .clock-page :deep(.digits) { font-size:clamp(18px,18cqw,35px); }
.size-s.renderer-nixie .clock-page :deep(.tube) { max-width:none; max-height:52cqh; }
.size-s.renderer-nixie .clock-page :deep(.nixie-base),.size-s.renderer-nixie .clock-page :deep(.tube-label) { display:none; }
.size-s .clock-page :deep(.analog) { width:min(90cqw,90cqh); border-width:3px; }
.size-s .clock-page :deep(.hour-number) { display:none; }
.size-s .date { display:none; }
@container (max-width:560px) { .tabs-title { display:none; } }
@container (max-width:320px) { .compact-timer-create { grid-template-columns:62px 27px auto; } .compact-timer-name { display:none; } }
@container (max-width:125px) { .compact-symbol,.compact-date { display:none; } .compact-page { grid-template-columns:minmax(0,1fr); } }
@container (max-height:62px) { .compact-next small,.compact-next span,.compact-date span { display:none; } .compact-page { padding:3px 7px; } }
@media (max-width:520px) { .clock-page { grid-template-columns:1fr; } .clock-page :deep(.analog),.clock-page :deep(.digital) { grid-row:auto; } .complications { grid-column:1; } }
</style>
