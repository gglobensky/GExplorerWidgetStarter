<script setup lang="ts">
import { ref } from 'vue'
import type { SlotProvider } from 'gexplorer/widgets'
import CalendarPanel from './CalendarPanel.vue'
import type { CalendarOccurrence } from './calendar'
import type { ClockEvent } from './useClockCalendar'

type Occurrence = CalendarOccurrence<ClockEvent>
type EventInput = Omit<ClockEvent, 'id'>
const props = withDefaults(defineProps<{ now: Date; marks: ClockEvent[]; compact?: boolean; provider?: Readonly<SlotProvider> | null; canCreate?: boolean; canUpdate?: boolean; canRemove?: boolean }>(),
  { compact: false, provider: null, canCreate: true, canUpdate: true, canRemove: true })
const emit = defineEmits<{
  add: [event: EventInput]; update: [id: string, event: EventInput]; updateOccurrence: [id: string, originalStartsAt: number, event: EventInput]
  remove: [id: string]; removeOccurrence: [id: string, originalStartsAt: number]; requestRemove: [mark: Occurrence]
  context: [event: MouseEvent, date: Date, marks: Occurrence[]]
}>()
const panel = ref<InstanceType<typeof CalendarPanel> | null>(null)
function openDate(date: Date) { panel.value?.openDate(date) }
function openOccurrence(mark: Occurrence) { panel.value?.openOccurrence(mark) }
defineExpose({ openDate, openOccurrence })
</script>

<template>
  <component v-if="provider" :is="provider.component" v-bind="provider.props" :now="now" />
  <CalendarPanel v-else ref="panel" :compact="compact" :now="now" :marks="marks" :editable="canCreate || canUpdate || canRemove"
    :can-create="canCreate" :can-update="canUpdate" :can-remove="canRemove"
    @context="(mouse, date, values) => emit('context', mouse, date, values)" @request-remove="value => emit('requestRemove', value)"
    @add="value => emit('add', value)" @update="(id, value) => emit('update', id, value)"
    @update-occurrence="(id, startsAt, value) => emit('updateOccurrence', id, startsAt, value)"
    @remove="id => emit('remove', id)" @remove-occurrence="(id, startsAt) => emit('removeOccurrence', id, startsAt)" />
</template>
