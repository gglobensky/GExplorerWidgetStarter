<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { calendarCells, calendarOccurrences, datePartsInZone, marksForDay, timeInZone, validTimeZone, type CalendarMark, type CalendarOccurrence, type CalendarRecurrence } from './calendar'
import { parseNaturalAppointment, type NaturalAppointment } from './naturalLanguage'

type EditableMark = CalendarMark & { reminderMinutes?: number; audible?: boolean; notes?: string }
type EventInput = Omit<EditableMark, 'id'>
type EditableOccurrence = CalendarOccurrence<EditableMark>
const props = withDefaults(defineProps<{ now: Date; marks?: EditableMark[]; weekStartsMonday?: boolean; editable?: boolean; canCreate?: boolean; canUpdate?: boolean; canRemove?: boolean; compact?: boolean }>(),
  { marks: () => [], weekStartsMonday: false, editable: true, canCreate: true, canUpdate: true, canRemove: true, compact: false })
const emit = defineEmits<{ add: [event: EventInput]; update: [id: string, event: EventInput]; updateOccurrence: [id: string, originalStartsAt: number, event: EventInput]; remove: [id: string]; removeOccurrence: [id: string, originalStartsAt: number]; requestRemove: [mark: EditableOccurrence]; context: [event: MouseEvent, date: Date, marks: EditableOccurrence[]] }>()
const cursor = ref(new Date(props.now.getFullYear(), props.now.getMonth(), props.compact ? props.now.getDate() : 1, 12))
const selected = ref(new Date(props.now.getFullYear(), props.now.getMonth(), props.now.getDate(), 12))
const editing = ref(false), editingId = ref<string | null>(null), eventTitle = ref(''), eventDate = ref(''), eventTime = ref('12:00')
const allDay = ref(false), durationMinutes = ref(60), timezone = ref('local'), recurrence = ref<CalendarRecurrence>('none')
const recurrenceInterval = ref(1), recurrenceUntil = ref(''), reminder = ref(10), audible = ref(true), notes = ref('')
const editorPage = ref(0)
const quickEntry = ref(false), quickText = ref(''), quickParsed = ref<NaturalAppointment | null>(null), quickError = ref('')
const agendaOpen = ref(false)
const pickingPeriod = ref(false), pickerMonth = ref('')
const editingOccurrence = ref<EditableOccurrence | null>(null), editScope = ref<'occurrence' | 'series'>('series')
const dragging = ref<EditableOccurrence | null>(null), dragOverKey = ref('')
const monthGrid = ref<HTMLElement | null>(null)
let pointerDrag: { id: number; x: number; y: number; moved: boolean; target: HTMLElement } | null = null
let suppressMarkClick = false
const mayCreate = computed(() => props.editable && props.canCreate)
const mayUpdate = computed(() => props.editable && props.canUpdate)
const mayRemove = computed(() => props.editable && props.canRemove)
const title = computed(() => {
  if (!props.compact) return cursor.value.toLocaleDateString([], { month: 'long', year: 'numeric' })
  const values = compactDays.value
  const first = values[0]?.date, last = values[6]?.date
  if (!first || !last) return ''
  if (first.getMonth() === last.getMonth()) return first.toLocaleDateString([], { month: 'long', year: 'numeric' })
  return `${first.toLocaleDateString([], { month: 'short' })} – ${last.toLocaleDateString([], { month: 'short', year: 'numeric' })}`
})
const days = computed(() => calendarCells(cursor.value.getFullYear(), cursor.value.getMonth(), props.weekStartsMonday, props.now))
const compactDays = computed(() => {
  const at = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), cursor.value.getDate(), 12)
  const weekday = at.getDay(), offset = props.weekStartsMonday ? (weekday + 6) % 7 : weekday
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate() - offset, 12)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12)
    return { date, day: date.getDate(), key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`, inMonth: true, today: date.toDateString() === props.now.toDateString() }
  })
})
const displayDays = computed(() => props.compact ? compactDays.value : days.value)
const visibleMarks = computed(() => {
  const first = displayDays.value[0]?.date, last = displayDays.value[displayDays.value.length - 1]?.date
  if (!first || !last) return []
  return calendarOccurrences(props.marks, new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime(), new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime())
})
const selectedMarks = computed(() => marksForDay(visibleMarks.value, selected.value))
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
const selectedKey = computed(() => dateKey(selected.value))
const zones = [['local', 'This computer'], ['America/New_York', 'New York'], ['America/Los_Angeles', 'Los Angeles'], ['Europe/London', 'London'], ['Europe/Paris', 'Paris'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney']]
const weekDays = computed(() => {
  const sunday = new Date(2024, 0, 7, 12)
  return Array.from({ length: 7 }, (_, i) => {
    const offset = props.weekStartsMonday ? i + 1 : i
    return new Date(2024, 0, sunday.getDate() + offset).toLocaleDateString([], { weekday: 'short' })
  })
})
function move(delta: number) { cursor.value = props.compact ? new Date(cursor.value.getFullYear(), cursor.value.getMonth(), cursor.value.getDate() + delta * 7, 12) : new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1, 12) }
function home() {
  cursor.value = new Date(props.now.getFullYear(), props.now.getMonth(), props.compact ? props.now.getDate() : 1, 12)
  selected.value = new Date(props.now.getFullYear(), props.now.getMonth(), props.now.getDate(), 12)
  pickingPeriod.value = false
}
function openPeriodPicker() {
  pickerMonth.value = `${cursor.value.getFullYear()}-${String(cursor.value.getMonth() + 1).padStart(2, '0')}`
  pickingPeriod.value = !pickingPeriod.value
}
function choosePeriod() {
  const [year, month] = pickerMonth.value.split('-').map(Number)
  if (!year || !month) return
  const day = props.compact ? Math.min(selected.value.getDate(), new Date(year, month, 0).getDate()) : 1
  cursor.value = new Date(year, month - 1, day, 12)
  selected.value = new Date(year, month - 1, day, 12)
  pickingPeriod.value = false
}
function choose(date: Date) { selected.value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12); agendaOpen.value = false }
async function focusDate(date: Date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12), key = dateKey(target)
  choose(target)
  if (!displayDays.value.some(cell => cell.key === key)) {
    cursor.value = props.compact ? target : new Date(target.getFullYear(), target.getMonth(), 1, 12)
  }
  await nextTick()
  monthGrid.value?.querySelector<HTMLElement>(`[data-date-key="${key}"]`)?.focus()
}
function onDayKeydown(event: KeyboardEvent, date: Date) {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const offset = offsets[event.key]
  if (offset) { event.preventDefault(); void focusDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12)); return }
  if (event.key === 'Home') { event.preventDefault(); void focusDate(props.now); return }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    const delta = event.key === 'PageUp' ? -1 : 1
    const target = props.compact
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta * 7, 12)
      : new Date(date.getFullYear(), date.getMonth() + delta, Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth() + delta + 1, 0).getDate()), 12)
    void focusDate(target)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(date) }
}
function markDate(date: Date) {
  choose(date)
  if (mayCreate.value) openEditor()
}
const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const partsDateInput = (parts: { year: number; month: number; day: number }) => `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
function loadEditor(source: EditableMark | EditableOccurrence | undefined) {
  eventTitle.value = source?.title ?? ''; allDay.value = source?.allDay === true
  const zone = validTimeZone(source?.timezone), start = datePartsInZone(source?.startsAt ?? selected.value.getTime(), zone)
  eventDate.value = source ? partsDateInput(start) : dateInput(selected.value)
  eventTime.value = source?.allDay ? '09:00' : `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`
  durationMinutes.value = source?.durationMinutes ?? (source?.allDay ? 1440 : 60)
  timezone.value = zone; recurrence.value = source?.recurrence ?? 'none'; recurrenceInterval.value = source?.recurrenceInterval ?? 1
  recurrenceUntil.value = source?.recurrenceUntil ? partsDateInput(datePartsInZone(source.recurrenceUntil, zone)) : ''
  reminder.value = source?.reminderMinutes ?? 10; audible.value = source?.audible !== false; notes.value = source?.notes ?? ''
}
function openEditor(mark?: EditableOccurrence) {
  const source = mark ? props.marks.find(m => m.id === mark.seriesId) : undefined
  if (mark && !mayUpdate.value) return
  editing.value = true; editingId.value = source?.id ?? null; editingOccurrence.value = mark ?? null; editorPage.value = 0
  quickEntry.value = false; quickText.value = ''; quickParsed.value = null; quickError.value = ''
  editScope.value = mark && (source?.recurrence ?? 'none') !== 'none' ? 'occurrence' : 'series'
  loadEditor(editScope.value === 'occurrence' ? mark : source)
}
function interpretQuickEntry() {
  const result = parseNaturalAppointment(quickText.value, selected.value)
  quickParsed.value = result.value ?? null
  quickError.value = result.error ?? ''
}
function applyQuickEntry() {
  const value = quickParsed.value
  if (!value) return
  eventTitle.value = value.title; eventDate.value = value.date; eventTime.value = value.time; allDay.value = value.allDay
  durationMinutes.value = value.durationMinutes; reminder.value = value.reminderMinutes
  editorPage.value = 0; quickEntry.value = false
}
function openDate(date: Date) { markDate(date) }
function openOccurrence(mark: EditableOccurrence) { openEditor(mark) }
defineExpose({ openDate, openOccurrence })
function setEditScope(scope: 'occurrence' | 'series') {
  editScope.value = scope
  const series = editingId.value ? props.marks.find(mark => mark.id === editingId.value) : undefined
  loadEditor(scope === 'occurrence' ? editingOccurrence.value ?? series : series)
}
const editorPageCount = computed(() => props.compact ? 3 + (selectedMarks.value.length && !editingId.value ? 1 : 0) : 1)
function nextEditorPage() { editorPage.value = Math.min(editorPageCount.value - 1, editorPage.value + 1) }
function addEvent() {
  const title = eventTitle.value.trim()
  if (!title) return
  const [year, month, day] = eventDate.value.split('-').map(Number), [hour, minute] = eventTime.value.split(':').map(Number)
  const zone = validTimeZone(timezone.value)
  const startsAt = timeInZone({ year, month, day, hour: allDay.value ? 9 : hour || 0, minute: allDay.value ? 0 : minute || 0, second: 0 }, zone)
  const until = recurrenceUntil.value ? recurrenceUntil.value.split('-').map(Number) : []
  const event: EventInput = { title, startsAt, allDay: allDay.value, durationMinutes: allDay.value ? Math.max(1440, durationMinutes.value) : durationMinutes.value,
    timezone: zone, recurrence: recurrence.value, recurrenceInterval: recurrence.value === 'none' ? undefined : recurrenceInterval.value,
    recurrenceUntil: recurrence.value !== 'none' && until.length === 3 ? timeInZone({ year: until[0], month: until[1], day: until[2], hour: 23, minute: 59, second: 59 }, zone) : undefined,
    reminderMinutes: reminder.value < 0 ? undefined : reminder.value, audible: audible.value, colour: '#b14f48', notes: notes.value.trim() || undefined }
  if (editingId.value && editingOccurrence.value && editScope.value === 'occurrence') emit('updateOccurrence', editingId.value, editingOccurrence.value.originalStartsAt, event)
  else if (editingId.value) emit('update', editingId.value, event)
  else emit('add', event)
  editing.value = false
}
function inputFrom(mark: EditableOccurrence, startsAt = mark.startsAt): EventInput {
  return { title: mark.title, startsAt, allDay: mark.allDay, colour: mark.colour, durationMinutes: mark.durationMinutes,
    timezone: mark.timezone, recurrence: mark.recurrence, recurrenceInterval: mark.recurrenceInterval, recurrenceUntil: mark.recurrenceUntil,
    reminderMinutes: mark.reminderMinutes, audible: mark.audible, notes: mark.notes }
}
function dragCellAt(clientX: number, clientY: number) {
  const grid = monthGrid.value
  if (!grid) return null
  const rect = grid.getBoundingClientRect()
  if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null
  const column = Math.min(6, Math.floor((clientX - rect.left) / (rect.width / 7)))
  const rows = props.compact ? 1 : 6
  const row = Math.min(rows - 1, Math.floor((clientY - rect.top) / (rect.height / rows)))
  return displayDays.value[row * 7 + column] ?? null
}
function startPointerDrag(event: PointerEvent, mark: EditableOccurrence) {
  if (!mayUpdate.value || event.button !== 0) return
  dragging.value = mark
  const target = event.currentTarget as HTMLElement
  pointerDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target }
  target.setPointerCapture?.(event.pointerId)
}
function movePointerDrag(event: PointerEvent) {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return
  if (!pointerDrag.moved && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 5) return
  pointerDrag.moved = true
  event.preventDefault()
  dragOverKey.value = dragCellAt(event.clientX, event.clientY)?.key ?? ''
}
function finishPointerDrag(event: PointerEvent) {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return
  const state = pointerDrag
  pointerDrag = null
  state.target.releasePointerCapture?.(event.pointerId)
  const cell = state.moved ? dragCellAt(event.clientX, event.clientY) : null
  if (state.moved) {
    event.preventDefault()
    suppressMarkClick = true
    setTimeout(() => { suppressMarkClick = false }, 0)
  }
  if (cell) dropOn(cell.date)
  else { dragging.value = null; dragOverKey.value = '' }
}
function cancelPointerDrag(event: PointerEvent) {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return
  pointerDrag = null; dragging.value = null; dragOverKey.value = ''
}
function clickMark(mark: EditableOccurrence) {
  if (!suppressMarkClick && mayUpdate.value) openEditor(mark)
}
const canDismiss = (mark: EditableOccurrence) => (mark.recurrence && mark.recurrence !== 'none') ? mayUpdate.value : mayRemove.value
function dropOn(date: Date) {
  const mark = dragging.value
  dragOverKey.value = ''; dragging.value = null
  if (!mark || !mayUpdate.value) return
  const zone = validTimeZone(mark.timezone), parts = datePartsInZone(mark.startsAt, zone)
  const startsAt = timeInZone({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: parts.hour, minute: parts.minute, second: parts.second }, zone)
  if ((mark.recurrence ?? 'none') === 'none') emit('update', mark.seriesId, inputFrom(mark, startsAt))
  else emit('updateOccurrence', mark.seriesId, mark.originalStartsAt, inputFrom(mark, startsAt))
}
const timeOf = (mark: CalendarMark) => mark.allDay ? '' : new Date(mark.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(mark.timezone && mark.timezone !== 'local' ? { timeZone: mark.timezone } : {}) })
const recurrenceOf = (mark: CalendarMark) => {
  if (!mark.recurrence || mark.recurrence === 'none') return ''
  const interval = mark.recurrenceInterval ?? 1
  if (interval === 1) return ` · ${mark.recurrence}`
  const unit = mark.recurrence === 'daily' ? 'days' : mark.recurrence === 'weekly' ? 'weeks' : mark.recurrence === 'monthly' ? 'months' : 'years'
  return ` · every ${interval} ${unit}`
}
</script>

<template>
  <section class="paper-calendar" :class="{ compact }" aria-label="Calendar">
    <div class="binding" aria-hidden="true"><i v-for="n in 9" :key="n" /></div>
    <header class="calendar-heading">
      <button v-if="!compact" type="button" title="Previous month" @click="move(-1)">‹</button>
      <button type="button" class="month" title="Choose a month and year" @click="openPeriodPicker">{{ title }}</button>
      <button v-if="!compact" type="button" title="Next month" @click="move(1)">›</button>
      <button type="button" class="today-button" @click="home">Today</button>
      <button type="button" class="selected-date-note" :title="selectedMarks.length ? 'Show this day’s agenda' : 'No appointments on this day'" @click="agendaOpen = !agendaOpen">{{ selected.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) }}{{ selectedMarks.length ? ` · ${selectedMarks.length} mark${selectedMarks.length === 1 ? '' : 's'}` : '' }}</button>
      <div v-if="pickingPeriod" class="period-picker"><input v-model="pickerMonth" type="month" aria-label="Month and year" @keydown.enter="choosePeriod" /><button type="button" @click="choosePeriod">Go</button><button type="button" @click="pickingPeriod=false">Cancel</button></div>
    </header>
    <div class="weekdays"><span v-for="day in weekDays" :key="day">{{ day }}</span></div>
    <div ref="monthGrid" class="month-grid">
      <div v-for="cell in displayDays" :key="cell.key" class="day" :class="{ outside: !cell.inMonth, today: cell.today, selected: selectedKey === cell.key, marked: marksForDay(visibleMarks, cell.date).length, 'drag-over': dragOverKey === cell.key }"
        role="button" :tabindex="selectedKey === cell.key ? 0 : -1" :data-date-key="cell.key" :aria-label="`${cell.date.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}${marksForDay(visibleMarks, cell.date).length ? `, ${marksForDay(visibleMarks, cell.date).length} appointment${marksForDay(visibleMarks, cell.date).length === 1 ? '' : 's'}` : ''}`"
        :title="mayCreate ? 'Double-click to mark this date' : undefined" @click="choose(cell.date)" @dblclick.stop="markDate(cell.date)" @keydown="onDayKeydown($event, cell.date)" @contextmenu.stop.prevent="emit('context', $event, cell.date, marksForDay(visibleMarks, cell.date))">
        <span class="number">{{ cell.day }}</span>
        <div class="marks">
          <span v-for="mark in marksForDay(visibleMarks, cell.date).slice(0, 2)" :key="mark.occurrenceId" class="calendar-mark" :class="{ draggable: mayUpdate }" :title="mark.title + recurrenceOf(mark) + (mayUpdate ? ' · Drag to reschedule' : '')" @click.stop="clickMark(mark)" @pointerdown.stop="startPointerDrag($event, mark)" @pointermove.stop="movePointerDrag" @pointerup.stop="finishPointerDrag" @pointercancel.stop="cancelPointerDrag">
            <span class="mark-label"><i :style="{ background: mark.colour || 'var(--clock-calendar-mark)' }" />{{ timeOf(mark) }} {{ mark.title }}</span>
            <button v-if="canDismiss(mark)" type="button" class="mark-remove" :title="mark.recurrence && mark.recurrence !== 'none' ? 'Remove this occurrence' : 'Remove appointment'" aria-label="Remove appointment" @pointerdown.stop @click.stop="emit('requestRemove', mark)">×</button>
          </span>
        </div>
      </div>
    </div>
    <button v-if="compact" type="button" class="week-arrow previous" title="Previous week" @click="move(-1)">‹</button>
    <button v-if="compact" type="button" class="week-arrow next" title="Next week" @click="move(1)">›</button>
    <aside v-if="agendaOpen && !compact" class="day-agenda" aria-label="Selected day agenda">
      <header><b>{{ selected.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' }) }}</b><button type="button" title="Close agenda" @click="agendaOpen=false">×</button></header>
      <p v-if="!selectedMarks.length">No appointments on this day.</p>
      <div v-for="mark in selectedMarks.slice(0, 7)" :key="mark.occurrenceId"><button type="button" class="agenda-event" :disabled="!mayUpdate" @click="openEditor(mark);agendaOpen=false"><i :style="{ background: mark.colour || 'var(--clock-calendar-mark)' }" /><span><b>{{ mark.title }}</b><small>{{ timeOf(mark) || 'All day' }}{{ recurrenceOf(mark) }}</small></span></button><button v-if="canDismiss(mark)" type="button" class="agenda-remove" title="Remove appointment" @click="emit('requestRemove', mark)">×</button></div>
      <small v-if="selectedMarks.length > 7">+ {{ selectedMarks.length - 7 }} more</small>
      <button v-if="mayCreate" type="button" class="agenda-add" @click="openEditor();agendaOpen=false">+ New appointment</button>
    </aside>
    <div v-if="editing" class="event-sheet" :class="{ spacious: !compact }">
      <header><b>{{ editingId ? editScope === 'occurrence' ? 'Edit this occurrence' : 'Edit the series' : `Mark ${selected.toLocaleDateString([], { month:'long', day:'numeric' })}` }}</b><span v-if="compact && !quickEntry">{{ editorPage + 1 }} / {{ editorPageCount }}</span><button v-if="!editingId" type="button" class="quick-toggle" :class="{ active: quickEntry }" @click="quickEntry=!quickEntry;quickParsed=null;quickError=''">{{ quickEntry ? 'Form' : 'Quick entry' }}</button><button type="button" title="Close" @click="editing=false">×</button></header>
      <div v-if="quickEntry" class="quick-entry">
        <label><span>Describe it naturally</span><textarea v-model="quickText" rows="3" maxlength="240" placeholder="Dentist next Friday at 2pm for 45 minutes, remind me 1 hour before" autofocus @keydown.ctrl.enter.prevent="interpretQuickEntry" /></label>
        <div class="quick-actions"><small>Dates use your local calendar. Ctrl + Enter to interpret.</small><button type="button" :disabled="!quickText.trim()" @click="interpretQuickEntry">Interpret</button></div>
        <p v-if="quickError" class="quick-error">{{ quickError }}</p>
        <article v-if="quickParsed"><span>I understood</span><b>{{ quickParsed.summary }}</b><small>Nothing has been created yet.</small><button type="button" class="mark-button" @click="applyQuickEntry">Use these details</button></article>
      </div>
      <div v-else class="event-form" :class="{ spacious: !compact }">
      <div v-if="!compact || editorPage === 0" class="event-page">
        <div v-if="editingOccurrence && editingOccurrence.recurrence !== 'none'" class="scope-switch"><button type="button" :class="{ active: editScope === 'occurrence' }" @click="setEditScope('occurrence')">This occurrence</button><button type="button" :class="{ active: editScope === 'series' }" @click="setEditScope('series')">Whole series</button></div>
        <label><span>What</span><input v-model="eventTitle" maxlength="120" placeholder="Dinner, appointment, birthday…" autofocus @keydown.enter.prevent="compact ? nextEditorPage() : addEvent()" /></label>
        <div class="event-row three"><label><span>Date</span><input v-model="eventDate" type="date" /></label><label><span>Time</span><input v-model="eventTime" type="time" :disabled="allDay" /></label><label class="check"><input v-model="allDay" type="checkbox" />All day</label></div>
      </div>
      <div v-if="!compact || editorPage === 1" class="event-page">
        <div class="event-row"><label><span>Duration</span><select v-model.number="durationMinutes"><option :value="30">30 minutes</option><option :value="60">1 hour</option><option :value="90">90 minutes</option><option :value="120">2 hours</option><option :value="480">8 hours</option><option :value="1440">1 day</option></select></label><label><span>Time zone</span><select v-model="timezone"><option v-for="zone in zones" :key="zone[0]" :value="zone[0]">{{ zone[1] }}</option></select></label></div>
        <p v-if="editingOccurrence && editScope === 'occurrence'" class="page-intro">This date remains part of its recurring series. Only this occurrence’s details and reminder will change.</p>
        <div v-else class="event-row recurrence"><label><span>Repeat</span><select v-model="recurrence"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label v-if="recurrence !== 'none'"><span>Every</span><input v-model.number="recurrenceInterval" type="number" min="1" max="99" /></label><label v-if="recurrence !== 'none'"><span>Until (optional)</span><input v-model="recurrenceUntil" type="date" /></label></div>
      </div>
      <div v-if="!compact || editorPage === 2" class="event-page">
        <div class="event-row"><label><span>Remind me</span><select v-model.number="reminder"><option :value="-1">No reminder</option><option :value="0">At the time</option><option :value="5">5 minutes before</option><option :value="10">10 minutes before</option><option :value="30">30 minutes before</option><option :value="60">1 hour before</option><option :value="1440">1 day before</option></select></label><label class="check"><input v-model="audible" type="checkbox" />Sound</label></div>
        <label><span>Notes</span><textarea v-model="notes" maxlength="1000" rows="2" placeholder="Optional details…" /></label>
      </div>
      <div v-if="compact && editorPage >= 3" class="event-page day-marks"><span>Agenda for this day</span><div v-for="mark in selectedMarks.slice(0, 5)" :key="mark.occurrenceId"><b>{{ timeOf(mark) }} {{ mark.title }}{{ recurrenceOf(mark) }}</b><span><button v-if="mayUpdate" type="button" @click="openEditor(mark)">Edit</button><button v-if="mayRemove && mark.recurrence && mark.recurrence !== 'none'" type="button" title="Skip only this occurrence" @click="emit('removeOccurrence', mark.seriesId, mark.originalStartsAt)">Skip</button><button v-if="mayRemove" type="button" :title="mark.recurrence && mark.recurrence !== 'none' ? 'Remove the whole series' : 'Remove this event'" @click="emit('remove', mark.seriesId)">{{ mark.recurrence && mark.recurrence !== 'none' ? 'Series' : 'Remove' }}</button></span></div><small v-if="selectedMarks.length > 5">+ {{ selectedMarks.length - 5 }} more marks</small></div>
      </div>
      <div v-if="!quickEntry" class="sheet-actions"><button v-if="compact" type="button" :disabled="editorPage === 0" @click="editorPage--">Back</button><i v-for="page in compact ? editorPageCount : 0" :key="page" :class="{ active: editorPage === page - 1 }" /><button v-if="compact && editorPage < editorPageCount - 1" type="button" @click="nextEditorPage">Next</button><button v-else type="button" class="mark-button" :disabled="!eventTitle.trim() || !eventDate" @click="addEvent">{{ editingId ? 'Save appointment' : 'Add appointment' }}</button></div>
    </div>
  </section>
</template>

<style scoped>
.paper-calendar { container-type:size; position:relative; display:flex; flex-direction:column; width:min(100%,760px); height:100%; min-height:0; margin:auto; padding:clamp(16px,4cqw,28px) clamp(10px,3cqw,24px) 10px; color:var(--clock-calendar-ink,#25313a); border-radius:5px 5px var(--clock-radius,12px) var(--clock-radius,12px); background:repeating-linear-gradient(0deg,transparent 0 23px,#786c5720 24px),var(--clock-calendar-paper,#eee9dc); box-shadow:0 16px 35px #0008,inset 0 1px #fff8; transform:rotate(-.18deg); }
.binding { position:absolute; top:-5px; right:3%; left:3%; display:var(--clock-calendar-rings,flex); justify-content:space-around; }
.binding i { display:block; width:8px; height:24px; border:2px solid #81776a; border-radius:8px; background:linear-gradient(90deg,#bbb,#706a63,#ddd); box-shadow:1px 3px 3px #0005; }
header { display:grid; grid-template-columns:32px 1fr 32px; align-items:center; margin-bottom:7px; }
.calendar-heading { position:relative; }
button { border:0; color:inherit; background:transparent; font:inherit; cursor:pointer; }
button:hover:not(:disabled),button:focus-visible { color:var(--clock-calendar-mark,#a44); }
.month { font:700 clamp(17px,4cqw,28px)/1.1 ui-serif,Georgia,serif; letter-spacing:.025em; text-transform:uppercase; }
.today-button { position:absolute; left:38px; padding:3px 6px; border:1px dashed var(--clock-calendar-rule,#7777); border-radius:4px; font:700 8px/1 ui-sans-serif,sans-serif; text-transform:uppercase; }
.period-picker { position:absolute; z-index:8; top:calc(100% + 3px); left:50%; display:flex; gap:4px; padding:6px; border:1px solid var(--clock-calendar-rule,#7777); border-radius:5px; background:var(--clock-calendar-paper,#eee9dc); box-shadow:0 9px 20px #0006; transform:translateX(-50%); }
.period-picker input { min-width:120px; padding:4px; border:1px solid var(--clock-calendar-rule,#7777); border-radius:3px; color:var(--clock-calendar-ink,#25313a); background:#fff8; font:10px/1 ui-sans-serif,sans-serif; }
.period-picker button { padding:3px 5px; border:1px solid var(--clock-calendar-rule,#7777); border-radius:3px; font-size:8px; }
.selected-date-note { position:absolute; z-index:2; top:50%; right:44px; max-width:28%; padding:0; overflow:hidden; color:var(--clock-calendar-mark,#a44); font:600 8px/1 "Segoe Print",cursive; text-overflow:ellipsis; white-space:nowrap; transform:translateY(-50%) rotate(-1deg); }
.weekdays,.month-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
.weekdays { border-bottom:2px solid var(--clock-calendar-rule,#7775); font:700 clamp(8px,1.8cqw,12px)/1.6 ui-sans-serif,sans-serif; text-align:center; text-transform:uppercase; }
.day { position:relative; min-width:0; min-height:0; padding:3px 4px; overflow:hidden; border-right:1px solid var(--clock-calendar-rule,#7774); border-bottom:1px solid var(--clock-calendar-rule,#7774); }
.day:focus-visible,.day.selected { outline:2px solid color-mix(in srgb,var(--clock-calendar-mark,#a44) 45%,transparent); outline-offset:-2px; background:color-mix(in srgb,var(--clock-calendar-today,#dfeaf0) 60%,transparent); }
.day.drag-over { outline:2px dashed var(--clock-calendar-mark,#a44); outline-offset:-3px; background:color-mix(in srgb,var(--clock-calendar-mark,#a44) 14%,var(--clock-calendar-today,#dfeaf0)); }
.day:nth-child(7n) { border-right:0; }
.month-grid { flex:1; min-height:0; grid-template-rows:repeat(6,minmax(25px,1fr)); }
.number { position:relative; z-index:1; display:inline-grid; width:1.7em; aspect-ratio:1; place-items:center; font:600 clamp(10px,2cqw,15px)/1 ui-serif,Georgia,serif; }
.outside { opacity:.32; }
.today .number::before { content:""; position:absolute; inset:-2px; z-index:-1; border:2px solid var(--clock-calendar-mark,#a44); border-radius:48% 52% 46% 55%; transform:rotate(-9deg); box-shadow:0 0 0 1px color-mix(in srgb,var(--clock-calendar-mark,#a44) 35%,transparent); }
.marks { display:flex; flex-direction:column; gap:1px; min-width:0; }
.marks .calendar-mark { position:relative; display:flex; min-width:0; min-height:15px; align-items:center; gap:2px; padding-right:17px; overflow:hidden; font:600 clamp(7px,1.35cqw,10px)/1.2 "Segoe Print","Bradley Hand",cursive; white-space:nowrap; }
.marks .mark-label { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; }
.marks .calendar-mark.draggable { cursor:grab; touch-action:none; }
.marks .calendar-mark.draggable:active { cursor:grabbing; }
.marks i { display:inline-block; width:5px; height:5px; margin-right:2px; border-radius:50%; }
.marks .mark-remove { position:absolute; z-index:2; top:0; right:0; display:grid; width:15px; height:15px; padding:0; place-items:center; border:1px solid color-mix(in srgb,var(--clock-calendar-mark,#a44) 45%,transparent); border-radius:50%; color:var(--clock-calendar-mark,#a44); background:color-mix(in srgb,var(--clock-calendar-paper,#eee9dc) 92%,#fff); box-shadow:0 1px 2px #0003; font:800 12px/1 ui-sans-serif,sans-serif; cursor:pointer; }
.marks .mark-remove:hover,.marks .mark-remove:focus-visible { color:var(--clock-calendar-paper,#fff); background:var(--clock-calendar-mark,#a44); }
.day-agenda { position:absolute; z-index:4; top:clamp(38px,8cqw,58px); right:10px; display:grid; width:min(280px,calc(100% - 20px)); max-height:calc(100% - 68px); gap:4px; padding:9px; overflow:auto; border:1px solid var(--clock-calendar-rule,#7777); border-radius:6px; background:var(--clock-calendar-paper,#eee9dc); box-shadow:0 12px 28px #0007; transform:rotate(.2deg); }
.day-agenda>header { display:flex; min-height:20px; align-items:center; justify-content:space-between; margin:0 0 3px; border-bottom:1px solid var(--clock-calendar-rule,#7775); font:700 10px/1.2 ui-serif,Georgia,serif; }
.day-agenda>header button { font-size:15px; }
.day-agenda>p { margin:8px 0; opacity:.68; font:10px/1.3 ui-sans-serif,sans-serif; }
.day-agenda>div { display:flex; min-width:0; align-items:center; gap:3px; }
.agenda-event { display:flex; min-width:0; flex:1; align-items:center; gap:6px; padding:4px; text-align:left; }
.agenda-event:disabled { cursor:default; opacity:1; }
.agenda-event i { width:6px; height:6px; flex:none; border-radius:50%; }
.agenda-event span { display:grid; min-width:0; }
.agenda-event b,.agenda-event small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agenda-event b { font:700 10px/1.2 ui-serif,Georgia,serif; }
.agenda-event small { opacity:.65; font:8px/1.2 ui-sans-serif,sans-serif; }
.agenda-remove { width:18px; height:18px; flex:none; padding:0; color:var(--clock-calendar-mark,#a44); border-radius:50%; font-weight:700; }
.agenda-add { justify-self:start; margin-top:3px; padding:4px 6px; border:1px dashed var(--clock-calendar-mark,#a44); border-radius:4px; font:700 8px/1 ui-sans-serif,sans-serif; }
.event-sheet { position:absolute; z-index:5; right:clamp(8px,3cqw,24px); bottom:10px; display:grid; width:min(430px,calc(100% - 16px)); height:min(360px,calc(100% - 20px)); grid-template-rows:auto minmax(0,1fr) auto; gap:8px; padding:11px; overflow:hidden; border:1px solid var(--clock-calendar-rule,#7777); border-radius:6px; background:var(--clock-calendar-paper,#eee9dc); box-shadow:0 15px 34px #0008; transform:rotate(.25deg); }
.event-sheet.spacious { inset:clamp(8px,2cqw,16px); width:auto; height:auto; }
.event-sheet header { display:grid; grid-template-columns:minmax(0,1fr) auto auto 20px; gap:7px; align-items:center; justify-content:space-between; margin:0; border-bottom:1px solid var(--clock-calendar-rule,#7775); }
.event-sheet header>span { opacity:.55; font:700 8px/1 ui-sans-serif,sans-serif; }
.event-sheet header button { font-size:16px; }
.event-sheet header .quick-toggle { padding:4px 6px; border:1px dashed var(--clock-calendar-rule,#7777); border-radius:4px; font:700 8px/1 ui-sans-serif,sans-serif; }
.event-sheet header .quick-toggle.active { color:var(--clock-calendar-paper,#fff); border-color:var(--clock-calendar-mark,#a44); background:var(--clock-calendar-mark,#a44); }
.event-sheet label { display:grid; gap:3px; color:color-mix(in srgb,var(--clock-calendar-ink,#25313a) 70%,transparent); font:700 8px/1 ui-sans-serif,sans-serif; text-transform:uppercase; }
.event-sheet input:not([type="checkbox"]),.event-sheet select,.event-sheet textarea { min-width:0;padding:6px;border:1px solid var(--clock-calendar-rule,#7777);border-radius:4px;color:var(--clock-calendar-ink,#25313a);background:#ffffff55;font:11px/1.2 inherit; }
.event-sheet textarea { resize:vertical; }
.event-row { display:grid; grid-template-columns:1fr auto; gap:9px; align-items:end; }
.event-row>label { min-width:0; }
.event-row.three { grid-template-columns:1.15fr .75fr auto; }
.event-row.recurrence { grid-template-columns:1.2fr .5fr 1fr; }
.event-sheet .check { display:flex; align-items:center; gap:4px; padding-bottom:6px; white-space:nowrap; }
.event-form { display:grid; min-height:0; gap:8px; overflow:hidden; }
.event-form.spacious { grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(8px,2cqw,16px); align-content:start; }
.event-form.spacious .event-page:last-child { grid-column:1/-1; grid-template-columns:minmax(150px,.8fr) minmax(180px,1.2fr); }
.event-page { display:grid; min-height:0; gap:8px; align-content:start; overflow:hidden; }
.quick-entry { display:grid; min-height:0; align-content:start; gap:8px; overflow:hidden; }
.quick-entry label { display:grid; gap:4px; }
.quick-entry textarea { min-height:58px; resize:none; }
.quick-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.quick-actions small { opacity:.65; font:9px/1.3 ui-sans-serif,sans-serif; }
.quick-actions button,.quick-entry article button { padding:5px 8px; border:1px solid var(--clock-calendar-rule,#7777); border-radius:4px; font:700 9px/1 ui-sans-serif,sans-serif; }
.quick-actions button:disabled { opacity:.35; }
.quick-error { margin:0; color:var(--clock-calendar-mark,#a44); font:700 10px/1.3 ui-sans-serif,sans-serif; }
.quick-entry article { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; align-items:center; padding:9px; border:1px dashed var(--clock-calendar-mark,#a44); border-radius:5px; background:color-mix(in srgb,var(--clock-calendar-mark,#a44) 7%,transparent); }
.quick-entry article>span,.quick-entry article>small { opacity:.65; font:8px/1.2 ui-sans-serif,sans-serif; text-transform:uppercase; }
.quick-entry article>b { overflow:hidden; font:700 11px/1.3 ui-serif,Georgia,serif; text-overflow:ellipsis; white-space:nowrap; }
.quick-entry article>button { grid-column:2; grid-row:1/4; }
.page-intro { margin:2px 0;color:color-mix(in srgb,var(--clock-calendar-ink,#25313a) 68%,transparent);font:600 11px/1.4 ui-serif,Georgia,serif; }
.scope-switch { display:flex; gap:4px; }
.scope-switch button { padding:4px 7px; border:1px solid var(--clock-calendar-rule,#7777); border-radius:4px; font:700 8px/1 ui-sans-serif,sans-serif; }
.scope-switch button.active { color:var(--clock-calendar-paper,#fff); border-color:var(--clock-calendar-mark,#a44); background:var(--clock-calendar-mark,#a44); }
.sheet-actions { display:flex; align-items:center; justify-content:flex-end; gap:5px; padding-top:5px; border-top:1px solid var(--clock-calendar-rule,#7775); }
.sheet-actions>button { min-width:48px; padding:5px 8px; border:1px solid var(--clock-calendar-rule,#7777); border-radius:4px; }
.sheet-actions>button:disabled { opacity:.35; }
.sheet-actions>i { width:5px; height:5px; border-radius:50%; background:var(--clock-calendar-rule,#7777); }
.sheet-actions>i.active { background:var(--clock-calendar-mark,#a44); transform:scale(1.35); }
.mark-button { padding:7px;border:1px solid var(--clock-calendar-mark,#a44);border-radius:4px;color:var(--clock-calendar-paper,#fff);background:var(--clock-calendar-mark,#a44);font-weight:700; }
.mark-button:disabled { opacity:.4; }
.day-marks { display:grid; gap:3px; padding-top:5px; font-size:9px; }
.day-marks>span { opacity:.65; text-transform:uppercase; }
.day-marks>div { display:flex; justify-content:space-between; gap:6px; }
.day-marks b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.day-marks button { padding:0;color:var(--clock-calendar-mark,#a44);font-size:8px; }
.day-marks>div>span { display:flex; gap:7px; }
.paper-calendar.compact { padding:10px 6px 4px; transform:none; }
.compact .binding { display:none; }
.compact>header { display:flex; min-height:17px; justify-content:center; margin-bottom:2px; }
.compact .month { font-size:clamp(11px,4cqw,17px); }
.compact .today-button { left:0; padding:2px 4px; font-size:6px; }
.compact .period-picker { top:100%; }
.compact .selected-date-note { top:50%; right:4px; max-width:25%; font-size:6px; }
.compact .weekdays { font-size:clamp(6px,2.4cqw,9px); line-height:1.35; }
.compact .month-grid { grid-template-rows:minmax(40px,1fr); }
.compact .day { padding:2px; }
.compact .day:first-child { padding-left:12px; }
.compact .day:nth-child(7) { padding-right:12px; }
.week-arrow { position:absolute; z-index:3; top:50%; display:grid; width:17px; height:52px; place-items:center; border:1px solid var(--clock-calendar-rule,#7776); border-radius:5px; background:color-mix(in srgb,var(--clock-calendar-paper,#eee9dc) 82%,transparent); font:700 22px/1 ui-serif,Georgia,serif; transform:translateY(-50%); }
.week-arrow.previous { left:2px; }
.week-arrow.next { right:2px; }
.compact .number { font-size:clamp(9px,3.3cqw,13px); }
.compact .marks .calendar-mark { font-size:clamp(6px,2.1cqw,8px); }
.compact .marks .calendar-mark:nth-child(n+2) { display:none; }
.compact .marks .calendar-mark { min-height:13px; padding-right:14px; }
.compact .marks .mark-remove { width:13px; height:13px; font-size:10px; }
.compact .event-sheet { right:3px; bottom:3px; width:calc(100% - 6px); height:calc(100% - 6px); gap:4px; padding:6px; }
.compact .event-form { gap:4px; }
.compact .event-page { gap:4px; }
.compact .event-sheet input:not([type="checkbox"]),.compact .event-sheet select,.compact .event-sheet textarea { padding:3px 4px; font-size:9px; }
.compact .event-sheet textarea { height:28px; resize:none; }
.compact .quick-entry textarea { height:46px; }
.compact .quick-entry article { padding:5px; }
.compact .quick-entry article>small { display:none; }
.compact .event-sheet .check { padding-bottom:3px; }
.compact .sheet-actions { padding-top:2px; }
.compact .sheet-actions>button { min-width:40px; padding:3px 6px; font-size:8px; }
/* Six complete month rows can become shorter than a stacked number + appointment. Keep the first appointment
   beside the number in that case, so its ink, title and removal control remain visible instead of being clipped. */
@container (max-height:300px) {
  .paper-calendar:not(.compact) .day { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:1px; padding:1px 2px; }
  .paper-calendar:not(.compact) .number { width:1.45em; font-size:clamp(8px,1.7cqw,12px); }
  .paper-calendar:not(.compact) .marks { min-width:0; }
  .paper-calendar:not(.compact) .marks .calendar-mark { min-height:15px; padding-right:16px; font-size:clamp(6px,1.15cqw,8px); }
  .paper-calendar:not(.compact) .marks .calendar-mark:nth-child(n+2) { display:none; }
  .paper-calendar:not(.compact) .marks .mark-remove { top:0; width:15px; height:15px; }
}
@container (max-width:520px) { .event-row.three,.event-row.recurrence { grid-template-columns:1fr 1fr; } .compact .event-row.three { grid-template-columns:minmax(0,1fr) minmax(0,.8fr) auto; } }
</style>
