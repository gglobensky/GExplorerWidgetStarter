<script setup lang="ts">
import { computed } from 'vue'
import type { LibraryArtwork } from './types'

const props = withDefaults(defineProps<{
  artwork: LibraryArtwork
  alt?: string
  wide?: boolean
}>(), { alt: '', wide: false })

/** 2.9.0: the placeholder's icon, at most twice its own size and 46% of the box's width. */
const iconStyle = computed(() => {
  const icon = props.artwork.icon
  return icon ? { width: `min(46%, ${Math.round(icon.width * 2)}px)`, aspectRatio: `${icon.width} / ${icon.height}` } : undefined
})
const artStyle = computed(() => ({
  '--glu-art': `url("${props.artwork.src}")`,
  '--glu-art-x': `${props.artwork.x}%`,
  '--glu-art-y': `${props.artwork.y}%`,
}))
</script>

<template>
  <span class="glu-artwork" :class="{ wide, cover: artwork.mode === 'cover', placeholder:artwork.mode === 'placeholder', 'with-icon': artwork.mode === 'placeholder' && !!artwork.icon }" :style="artStyle" role="img" :aria-label="alt">
    <img v-if="artwork.mode === 'placeholder' && artwork.icon" class="glu-artwork-icon" :src="artwork.icon.src" :style="iconStyle" alt="" draggable="false" />
  </span>
</template>
