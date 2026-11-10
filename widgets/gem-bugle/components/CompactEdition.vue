<script setup lang="ts">
import type { BugleItem } from '../model'

defineProps<{
  context: 'sidebar' | 'toolbar' | 'grid'
  items: BugleItem[]
  sourceCount: number
  refreshing: boolean
  dateLabel: string
}>()

const emit = defineEmits<{
  (event: 'open', item: BugleItem): void
  (event: 'sources', anchor: HTMLElement): void
  (event: 'refresh'): void
}>()

function sources(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) emit('sources', event.currentTarget)
}
</script>

<template>
  <section class="compact-edition" :class="`compact-${context}`">
    <header>
      <button class="compact-brand" type="button" @click="sources">
        <strong>GEM Bugle</strong>
        <span>{{ dateLabel }}</span>
      </button>
      <button class="compact-refresh" type="button" :disabled="refreshing" @click="emit('refresh')" :aria-label="refreshing ? 'Refreshing sources' : 'Refresh sources'">
        {{ refreshing ? '···' : '↻' }}
      </button>
    </header>
    <div v-if="items.length" class="compact-headlines">
      <button v-for="item in items.slice(0, context === 'toolbar' ? 1 : 5)" :key="`${item.sourceId}:${item.id}`" type="button" @click="emit('open', item)">
        <span>{{ item.sourceTitle }}</span>
        <strong>{{ item.title }}</strong>
      </button>
    </div>
    <button v-else class="compact-empty-action" type="button" @click="sources">
      {{ sourceCount ? 'No headlines yet · check the sources' : 'Add a newspaper source' }}
    </button>
  </section>
</template>
