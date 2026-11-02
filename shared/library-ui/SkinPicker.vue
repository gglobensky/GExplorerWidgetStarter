<script setup lang="ts">
// shared/library-ui/SkinPicker.vue
//
// The shop's looks in its ⚙ menu (3.5.0): every skin (the built-in looks, the shop's own first, then the user's), each
// with a swatch of its wall, sign and accent. The chosen one has its actions: Duplicate (a built-in: to edit a copy),
// Edit, Export… and Delete (the user's). Under the list: Load a skin… (.gemskin files). useSkins does the work.
//
//   <SkinPicker :skins="skins" :selected="skin.id" :hints="{ 'software-aisle': 'A 90s software store…' }"
//     @select="id => …" @editing="close()" />
import { computed, ref } from 'vue'
import { isBuiltInSkin, withPictures, type LibrarySkin } from './skins'
import type { SkinsController } from './useSkins'

const props = withDefaults(defineProps<{
  skins: SkinsController
  selected: string
  /** A line under a built-in look's name. */
  hints?: Record<string, string>
  /** The radio group's name (one per shop). */
  name?: string
}>(), { name: 'glu-skin' })
const emit = defineEmits<{
  (e: 'select', id: string): void
  /** The editor opened (the menu may close, to show the shop beside it). */
  (e: 'editing'): void
}>()

const confirming = ref<string | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

const rows = computed(() => props.skins.all.value.map(s => ({
  skin: s,
  builtIn: isBuiltInSkin(s.id),
  line: isBuiltInSkin(s.id) ? props.hints?.[s.id] ?? 'Built in.' : s.author ? `By ${s.author}.` : 'Yours.',
})))

/** The swatch: the wall behind, the sign's colour and the accent as two bars. */
function swatch(s: LibrarySkin) {
  const v = s.values
  const p = (value: string) => withPictures(value, s.pictures)
  return {
    '--sw-wall': v['wall-pattern'] ? `${p(v['wall-pattern'])}, ${v.wall ?? '#111820'}` : v.wall ?? '#111820',
    '--sw-sign': v['sign-board'] ? p(v['sign-board']) : v.sign ?? '#d29a55',
    '--sw-accent': v.accent ?? '#70b8d8',
  }
}

function duplicate(id: string) {
  const copy = props.skins.duplicate(id)
  if (copy) { emit('select', copy.id); emit('editing') }
}
function edit(id: string) {
  props.skins.edit(id)
  emit('editing')
}
function askRemove(id: string) {
  if (confirming.value !== id) {
    confirming.value = id
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirming.value = null }, 3500)
    return
  }
  confirming.value = null
  props.skins.remove(id)
  if (props.selected === id) emit('select', props.skins.builtIns[0].id)
}
async function load() {
  const skin = await props.skins.importFiles()
  if (skin) emit('select', skin.id)
}
</script>

<template>
  <div class="glu-skins">
    <div role="radiogroup" aria-label="The store's look">
      <div v-for="row in rows" :key="row.skin.id" class="glu-skin-row" :class="{ chosen: row.skin.id === selected }">
        <label class="glu-toggle">
          <input type="radio" :name="name" :value="row.skin.id" :checked="row.skin.id === selected" @change="emit('select', row.skin.id)" />
          <span class="glu-skin-swatch" :style="swatch(row.skin)" aria-hidden="true"><i /><i /></span>
          <span><b>{{ row.skin.name }}</b><small>{{ row.line }}</small></span>
        </label>
        <div v-if="row.skin.id === selected" class="glu-skin-actions">
          <button type="button" @click="duplicate(row.skin.id)">Duplicate</button>
          <button v-if="!row.builtIn" type="button" @click="edit(row.skin.id)">Edit</button>
          <button type="button" :disabled="!skins.canExport.value" :title="skins.canExport.value ? 'Save it as a .gemskin file, to share it' : 'Needs a newer GEM Shell.'" @click="skins.exportSkin(row.skin.id)">Export…</button>
          <button v-if="!row.builtIn" type="button" class="danger" @click="askRemove(row.skin.id)">{{ confirming === row.skin.id ? 'Delete it?' : 'Delete' }}</button>
        </div>
      </div>
    </div>
    <button class="glu-menu-add" type="button" :disabled="!skins.canImport.value" @click="load"><span aria-hidden="true">＋</span>Load a skin (.gemskin)…</button>
    <p class="glu-menu-status">Duplicate a look to make it yours: change its wall, units, shelves, floor and signs, and share it as a file.</p>
  </div>
</template>
