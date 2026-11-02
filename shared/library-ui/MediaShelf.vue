<script setup lang="ts" generic="T extends LibraryItem">
// A titled shelf of boxes that scrolls sideways (2.0.0, 2026-10-31): the classic layout. Generic over the item; what
// a widget adds goes in slots: `tools` (beside the A–Z jump: the Video Club's season filter) and `marks` (on each
// box, see LibraryCase). The items are shown as given: a widget filtering them (a season) passes the filtered list
// and calls resetPosition() after the change.
import { computed, nextTick, ref } from 'vue'
import { useScrollHints } from 'gexplorer/widgets'
import LibraryCase from './LibraryCase.vue'
import type { LibraryCaseVariant, LibraryItem } from './types'

const props = withDefaults(defineProps<{
  title: string
  shelfId: string
  note?: string
  items: T[]
  selectedId?: string
  variant?: LibraryCaseVariant
  /** The line under each box's title (see LibraryCase). */
  caption?: (item: T) => string
}>(), { variant: 'dvd' })
const emit = defineEmits<{ (e: 'open', item: T): void; (e: 'menu', item: T, event: MouseEvent): void }>()
defineSlots<{
  tools?: () => any
  marks?: (props: { item: T }) => any
}>()
const rail = ref<HTMLElement | null>(null)
const letter = ref('')
const {
  hasOverflow:overflow,
  atStart,
  atEnd,
  scrollByPage:page,
} = useScrollHints({
  scrollEl:rail,
  axis:'x',
  deps:() => props.items.map(item => item.id).join('|'),
  eps:2,
  wheel:'transpose',
  pageRatio:.78,
  minPageStep:180,
})

function titleInitial(item: LibraryItem) {
  const sortable = item.title.replace(/^(the|a|an)\s+/i, '')
  const first = sortable.charAt(0).toLocaleUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

const letters = computed(() => Array.from(new Set(props.items.map(titleInitial))).sort())

/** Back to the start of the shelf, the A–Z jump cleared (after the widget changed what the shelf shows). */
async function resetPosition() {
  letter.value = ''
  await nextTick()
  rail.value?.scrollTo({ left:0, behavior:'smooth' })
}
defineExpose({ resetPosition })

function jumpToLetter() {
  const el = rail.value
  if (!el || !letter.value) return
  const target = el.querySelector<HTMLElement>(`[data-title-initial="${letter.value}"]`)
  if (target) el.scrollTo({ left:Math.max(0, target.offsetLeft - 7), behavior:'smooth' })
}
</script>

<template>
  <section class="glu-shelf" :data-shelf-id="shelfId" :aria-label="title">
    <header class="glu-shelf-heading">
      <div><h2>{{ title }}</h2><p v-if="note">{{ note }}</p></div>
      <div class="glu-shelf-tools">
        <slot name="tools" />
        <label class="glu-alpha-jump">
          <span>A–Z</span>
          <select v-model="letter" :aria-label="`Jump through ${title} by title`" @change="jumpToLetter">
            <option value="">All</option>
            <option v-for="initial in letters" :key="initial" :value="initial">{{ initial }}</option>
          </select>
        </label>
        <div v-if="overflow" class="glu-shelf-paging">
          <button type="button" :disabled="atStart" :aria-label="`Scroll ${title} left`" @click="page(-1)">‹</button>
          <button type="button" :disabled="atEnd" :aria-label="`Scroll ${title} right`" @click="page(1)">›</button>
        </div>
      </div>
    </header>
    <div class="glu-shelf-stage">
      <div ref="rail" class="glu-shelf-rail">
        <LibraryCase
          v-for="item in items"
          :key="item.id"
          :item="item"
          :variant="variant"
          :caption="caption"
          :selected="selectedId === item.id"
          :data-title-initial="titleInitial(item)"
          @open="emit('open', $event)"
          @menu="(item, event) => emit('menu', item, event)"
        >
          <template v-if="$slots.marks" #marks="{ item: boxed }"><slot name="marks" :item="boxed" /></template>
        </LibraryCase>
      </div>
      <div class="glu-shelf-edge" aria-hidden="true"></div>
    </div>
  </section>
</template>
