<script setup lang="ts" generic="T extends LibraryItem">
// One box on a shelf (2.0.0, 2026-10-31): any item, in the box style of its kind (variant). What sits on the box
// is the widget's: the `marks` slot is drawn over the artwork (the Video Club's watched mark and progress bar, the
// Game Library's store stickers and Play button).
// 3.6.0: tag (a label on the shelf's edge under the box: "37 h played") and pick (a handwritten staff-pick card leaning
// on it: "Staff pick!\n94% of players loved it", the first line bold), both the widget's words (LibraryFloor tagFor,
// pickFor).
import { computed } from 'vue'
import ArtworkFrame from './ArtworkFrame.vue'
import { formatYear, type LibraryCaseVariant, type LibraryItem } from './types'

const props = withDefaults(defineProps<{
  item: T
  selected?: boolean
  variant?: LibraryCaseVariant
  /** The line under the title (2.1.0). Default: the year ("Year unknown" without one). */
  caption?: (item: T) => string
  /** 3.6.0: the label on the shelf's edge under the box. */
  tag?: string
  /** 3.6.0: a staff-pick card's words (lines split by \n; the first one bold). */
  pick?: string
}>(), { selected: false, variant: 'dvd' })
const pickLines = computed(() => props.pick ? props.pick.split('\n').filter(Boolean).slice(0, 3) : [])
const label = computed(() => [captionText.value, props.tag, props.pick?.replace(/\n/g, ': ')].filter(Boolean).join(', '))
const captionText = computed(() => props.caption ? props.caption(props.item) : formatYear(props.item.year))
const emit = defineEmits<{ (e: 'open', item: T): void; (e: 'menu', item: T, event: MouseEvent): void }>()
defineSlots<{ marks?: (props: { item: T }) => any }>()
</script>

<template>
  <button
    class="glu-case"
    type="button"
    :data-item-id="item.id"
    :class="[{ selected }, variant !== 'dvd' ? `glu-case-${variant}` : '']"
    :aria-label="label ? `Open ${item.title}, ${label}` : `Open ${item.title}`"
    @click="emit('open', item)"
    @contextmenu.prevent.stop="emit('menu', item, $event)"
  >
    <span class="glu-case-depth" aria-hidden="true"></span>
    <span class="glu-case-body">
      <span class="glu-case-copy">
        <strong>{{ item.title }}</strong>
        <small v-if="captionText">{{ captionText }}</small>
      </span>
      <span class="glu-case-shell">
        <ArtworkFrame :artwork="item.artwork" :alt="`${item.title} artwork`" />
        <span class="glu-case-shine" aria-hidden="true"></span>
        <slot name="marks" :item="item" />
      </span>
      <span v-if="pickLines.length" class="glu-case-pick" aria-hidden="true"><b>{{ pickLines[0] }}</b><template v-for="(line, i) in pickLines.slice(1)" :key="i"><br />{{ line }}</template></span>
    </span>
    <span v-if="tag" class="glu-case-tag" aria-hidden="true">{{ tag }}</span>
  </button>
</template>
