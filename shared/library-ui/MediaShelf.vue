<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LibraryCase from './LibraryCase.vue'
import type { LibraryItem } from './types'

const props = defineProps<{
  title: string
  shelfId: string
  note?: string
  items: LibraryItem[]
  selectedId?: string
  displayMode?: 'shelf' | 'rack'
}>()
const emit = defineEmits<{ (e: 'open', item: LibraryItem): void }>()
const rail = ref<HTMLElement | null>(null)
const atStart = ref(true), atEnd = ref(true), overflow = ref(false)
const letter = ref('')
let observer: ResizeObserver | null = null

const letters = computed(() => Array.from(new Set(props.items.map(item => {
  const sortable = item.title.replace(/^(the|a|an)\s+/i, '')
  const first = sortable.charAt(0).toLocaleUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}))).sort())

function measure() {
  const el = rail.value
  if (!el) return
  overflow.value = el.scrollWidth > el.clientWidth + 2
  atStart.value = el.scrollLeft <= 2
  atEnd.value = el.scrollWidth - el.clientWidth - el.scrollLeft <= 2
}
function page(direction: -1 | 1) {
  rail.value?.scrollBy({ left: direction * Math.max(180, (rail.value?.clientWidth ?? 300) * .78), behavior: 'smooth' })
}
function wheel(event: WheelEvent) {
  const el = rail.value
  if (!el || !overflow.value) return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (!delta) return
  el.scrollLeft += delta
  event.preventDefault()
}
function jumpToLetter() {
  const el = rail.value
  if (!el || !letter.value) return
  const target = el.querySelector<HTMLElement>(`[data-title-initial="${letter.value}"]`)
  if (target) el.scrollTo({ left:Math.max(0, target.offsetLeft - 7), behavior:'smooth' })
}

onMounted(() => nextTick(() => {
  observer = new ResizeObserver(measure)
  if (rail.value) {
    observer.observe(rail.value)
    rail.value.addEventListener('scroll', measure, { passive: true })
    rail.value.addEventListener('wheel', wheel, { passive: false })
  }
  measure()
}))
watch(() => props.items, () => nextTick(measure))
onBeforeUnmount(() => {
  observer?.disconnect()
  rail.value?.removeEventListener('scroll', measure)
  rail.value?.removeEventListener('wheel', wheel)
})
</script>

<template>
  <section class="glu-shelf" :class="{ rack: displayMode === 'rack' }" :data-shelf-id="shelfId" :aria-label="title">
    <header class="glu-shelf-heading">
      <div><h2>{{ title }}</h2><p v-if="note">{{ note }}</p></div>
      <div class="glu-shelf-tools">
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
    <div ref="rail" class="glu-shelf-rail">
      <LibraryCase
        v-for="item in items"
        :key="item.id"
        :item="item"
        :selected="selectedId === item.id"
        :data-title-initial="(/^[A-Z]/.test(item.title.replace(/^(the|a|an)\s+/i, '').charAt(0).toLocaleUpperCase()) ? item.title.replace(/^(the|a|an)\s+/i, '').charAt(0).toLocaleUpperCase() : '#')"
        @open="emit('open', $event)"
      />
    </div>
    <div class="glu-shelf-edge" aria-hidden="true"></div>
  </section>
</template>
