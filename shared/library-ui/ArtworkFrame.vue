<script setup lang="ts">
import { computed } from 'vue'
import type { LibraryArtwork } from './types'

const props = withDefaults(defineProps<{
  artwork: LibraryArtwork
  alt?: string
  wide?: boolean
}>(), { alt: '', wide: false })

const artStyle = computed(() => ({
  '--glu-art': `url("${props.artwork.src}")`,
  '--glu-art-x': `${props.artwork.x}%`,
  '--glu-art-y': `${props.artwork.y}%`,
}))
</script>

<template>
  <span class="glu-artwork" :class="{ wide, cover: artwork.mode === 'cover', placeholder:artwork.mode === 'placeholder' }" :style="artStyle" role="img" :aria-label="alt"></span>
</template>
