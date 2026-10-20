<script setup lang="ts">
import ArtworkFrame from './ArtworkFrame.vue'
import { formatYear, type LibraryItem } from './types'

defineProps<{ item: LibraryItem; selected?: boolean }>()
const emit = defineEmits<{ (e: 'open', item: LibraryItem): void }>()
</script>

<template>
  <button
    class="glu-case"
    type="button"
    :class="{ selected }"
    :aria-label="`Open ${item.title}, ${formatYear(item.year)}`"
    @click="emit('open', item)"
  >
    <span class="glu-case-depth" aria-hidden="true"></span>
    <span class="glu-case-body">
      <span class="glu-case-copy">
        <strong>{{ item.title }}</strong>
        <small>{{ formatYear(item.year) }}</small>
      </span>
      <span class="glu-case-shell">
        <ArtworkFrame :artwork="item.artwork" :alt="`${item.title} artwork`" />
        <span class="glu-case-shine" aria-hidden="true"></span>
        <span v-if="item.progress" class="glu-case-progress" aria-label="Partly watched">
          <span :style="{ width: `${Math.round(item.progress * 100)}%` }"></span>
        </span>
      </span>
    </span>
  </button>
</template>
