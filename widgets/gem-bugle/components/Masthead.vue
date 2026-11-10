<script setup lang="ts">
defineProps<{
  dateLabel: string
  edition: number
  sourceCount: number
  refreshing: boolean
}>()

const emit = defineEmits<{
  (event: 'sources', anchor: HTMLElement): void
  (event: 'refresh'): void
}>()

function sources(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) emit('sources', event.currentTarget)
}
</script>

<template>
  <header class="masthead">
    <div class="masthead-meta">
      <span>{{ dateLabel }}</span>
      <span>Edition No. {{ edition }}</span>
    </div>
    <div class="masthead-row">
      <button class="masthead-action" type="button" @click="sources">Sources · {{ sourceCount }}</button>
      <h1>The GEM Bugle</h1>
      <button class="masthead-action masthead-action-right" type="button" :disabled="refreshing" @click="emit('refresh')">
        {{ refreshing ? 'Printing…' : 'Refresh' }}
      </button>
    </div>
    <p class="masthead-motto">A personal daily paper · assembled locally</p>
  </header>
</template>
