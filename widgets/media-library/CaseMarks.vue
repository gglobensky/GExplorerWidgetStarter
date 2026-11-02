<script setup lang="ts">
// What the Video Club draws on a case (2026-10-31, library-ui 2.0.0; it was inside LibraryCase before): the watched
// mark and the progress bar. Placed in the shared case's `marks` slot.
import type { MovieItem } from './movie-types'

defineProps<{ item: MovieItem }>()
</script>

<template>
  <span v-if="item.watched" class="glu-case-watched" title="Watched" aria-label="Watched">✓</span>
  <span v-if="item.progress" class="glu-case-progress" aria-label="Partly watched">
    <span :style="{ width: `${Math.round(item.progress * 100)}%` }"></span>
  </span>
</template>
