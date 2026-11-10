<script setup lang="ts">
import { computed } from 'vue'
import type { BugleItem } from '../model'

const props = defineProps<{
  item: BugleItem
  lead?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{ (event: 'open', item: BugleItem): void }>()
const when = computed(() => props.item.publishedAt
  ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(props.item.publishedAt)
  : '')
</script>

<template>
  <button
    class="article-card"
    :class="{ 'article-lead': lead, 'article-compact': compact }"
    type="button"
    :aria-label="`Open ${item.title} from ${item.sourceTitle}`"
    @click="emit('open', item)"
  >
    <span class="article-source">{{ item.sourceTitle }}<span v-if="when"> · {{ when }}</span></span>
    <strong>{{ item.title }}</strong>
    <span v-if="!compact && item.display === 'summary' && item.summary" class="article-summary">{{ item.summary }}</span>
    <span v-if="item.author && lead" class="article-byline">By {{ item.author }}</span>
  </button>
</template>
