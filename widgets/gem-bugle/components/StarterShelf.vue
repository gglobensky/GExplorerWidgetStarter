<script setup lang="ts">
import { STARTER_SOURCES } from '../starter-catalog'

const props = defineProps<{
  sourceUrls: string[]
  working: boolean
}>()

const emit = defineEmits<{
  (event: 'add', id: string): void
}>()

function added(feedUrl: string): boolean {
  return props.sourceUrls.includes(feedUrl)
}
</script>

<template>
  <section class="starter-shelf" aria-labelledby="starter-shelf-title">
    <div class="starter-shelf-heading">
      <div>
        <span class="source-kicker">Reviewed feeds</span>
        <h2 id="starter-shelf-title">From the wire desk</h2>
      </div>
      <p>Optional official feeds, selected for a dependable first edition. Nothing is added automatically.</p>
    </div>
    <div class="starter-grid">
      <article v-for="source in STARTER_SOURCES" :key="source.id">
        <div>
          <span>{{ source.publisher }}</span>
          <h3>{{ source.title }}</h3>
          <p>{{ source.description }}</p>
          <small>{{ source.provenance }}</small>
        </div>
        <button type="button" :disabled="working || added(source.feedUrl)" @click="emit('add', source.id)">
          {{ added(source.feedUrl) ? 'On the presses' : 'Add source' }}
        </button>
      </article>
    </div>
  </section>
</template>
