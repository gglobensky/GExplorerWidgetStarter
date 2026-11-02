<script setup lang="ts">
// shared/library-ui/SkinEditor.vue
//
// Editing one of the user's skins (3.5.0), in a panel beside the shelves: the shop shows the skin as it's edited
// (the widget binds skins.draft over its chosen look). Its name and author, then every value of SKIN_FIELDS by group:
// a colour (a picker, and the text: "#rrggbbaa", "transparent", "rgb(…)"), a paint (gradients, as CSS) or a length.
// A value that isn't allowed (skins.ts cleanSkinValue: no url(), no var(), no ; { }…) is marked and not used; an empty
// one falls back to the classic look's. Save keeps it (checked again), Cancel drops the changes.
// 3.7.0: the skin's pictures (useSkins addPicture: a PNG or JPEG made into a GEM Shell image), each usable as a tile
// on the wall, the floor or the units' back in one click, or by name in any paint: picture(name).
import { computed, reactive, watch } from 'vue'
import { cleanSkinValue, colourInputValue, SKIN_FIELDS, withPickedColour, type SkinField, type SkinKey } from './skins'
import type { SkinsController } from './useSkins'

const props = defineProps<{ skins: SkinsController }>()

/** What's typed in each field (a value not allowed stays here, never in the skin). */
const raw = reactive<Partial<Record<SkinKey, string>>>({})
watch(() => props.skins.draft.value?.id, () => {
  for (const f of SKIN_FIELDS) raw[f.key] = props.skins.draft.value?.values[f.key] ?? ''
}, { immediate: true })

const groups = computed(() => {
  const out: Array<{ title: string; fields: SkinField[] }> = []
  for (const f of SKIN_FIELDS) {
    const g = out.find(x => x.title === f.group)
    if (g) g.fields.push(f); else out.push({ title: f.group, fields: [f] })
  }
  return out
})

function bad(key: SkinKey): boolean {
  const text = raw[key]?.trim() ?? ''
  return !!text && cleanSkinValue(text) === undefined
}
const badCount = computed(() => SKIN_FIELDS.filter(f => bad(f.key)).length)

function set(key: SkinKey, text: string) {
  raw[key] = text
  const d = props.skins.draft.value
  if (!d) return
  const t = text.trim()
  if (!t) { delete d.values[key]; return }
  const clean = cleanSkinValue(t)
  if (clean !== undefined) d.values[key] = clean
}
function pick(key: SkinKey, colour: string) { set(key, withPickedColour(raw[key], colour)) }

const draft = computed(() => props.skins.draft.value)
function setName(text: string) { if (draft.value) draft.value.name = text.slice(0, 60) }
function setAuthor(text: string) {
  if (!draft.value) return
  const t = text.slice(0, 60)
  if (t.trim()) draft.value.author = t; else delete draft.value.author
}
const canSave = computed(() => !!draft.value?.name.trim())

const pictures = computed(() => Object.entries(draft.value?.pictures ?? {}).map(([name, p]) => ({ name, ...p })))
/** Where a picture goes in one click: the paints a tile suits. */
const USES: Array<{ key: SkinKey; label: string }> = [{ key: 'wall-pattern', label: 'Wall' }, { key: 'floor', label: 'Floor' }, { key: 'unit-back', label: 'Back panel' }]
function use(name: string, key: SkinKey) {
  props.skins.usePicture(name, key)
  raw[key] = props.skins.draft.value?.values[key] ?? ''
}
async function add() { await props.skins.addPicture() }
</script>

<template>
  <aside v-if="draft" class="glu-skin-editor" aria-label="Edit the skin" @keydown.esc.stop="skins.cancelDraft()">
    <header>
      <p class="glu-menu-label">Edit the skin</p>
      <label class="glu-skin-field wide"><span>Name</span><input type="text" :value="draft.name" maxlength="60" @input="setName(($event.target as HTMLInputElement).value)" /></label>
      <label class="glu-skin-field wide"><span>Author</span><input type="text" :value="draft.author ?? ''" maxlength="60" placeholder="You (shown to who you share it with)" @input="setAuthor(($event.target as HTMLInputElement).value)" /></label>
    </header>
    <div class="glu-skin-groups">
      <section>
        <p class="glu-menu-label">Pictures</p>
        <div v-for="p in pictures" :key="p.name" class="glu-skin-picture">
          <img :src="p.url" alt="" />
          <span><b>picture({{ p.name }})</b><small>{{ p.width }} × {{ p.height }}</small>
            <span class="glu-skin-picture-uses"><button v-for="u in USES" :key="u.key" type="button" :title="`Tile it on the ${u.label.toLowerCase()}`" @click="use(p.name, u.key)">{{ u.label }}</button></span>
          </span>
          <button type="button" class="glu-skin-picture-remove" :aria-label="`Remove the picture ${p.name}`" @click="skins.removePicture(p.name)">×</button>
        </div>
        <button class="glu-menu-add" type="button" :disabled="!skins.canAddPicture.value" @click="add"><span aria-hidden="true">＋</span>Add a picture (PNG or JPEG)…</button>
        <small class="glu-skin-hint">A tile or a photo, kept by GEM Shell with the skin and saved in its file. In any paint: picture(name).</small>
      </section>
      <section v-for="group in groups" :key="group.title">
        <p class="glu-menu-label">{{ group.title }}</p>
        <label v-for="f in group.fields" :key="f.key" class="glu-skin-field" :class="[f.kind, { bad: bad(f.key) }]" :title="f.hint">
          <span>{{ f.label }}</span>
          <span class="glu-skin-input">
            <input v-if="f.kind === 'colour'" type="color" :value="colourInputValue(raw[f.key]) || '#000000'" :aria-label="`${f.label}: pick a colour`" @input="pick(f.key, ($event.target as HTMLInputElement).value)" />
            <textarea v-if="f.kind === 'paint'" rows="2" :value="raw[f.key]" spellcheck="false" placeholder="As Classic" :aria-label="f.label" @input="set(f.key, ($event.target as HTMLTextAreaElement).value)" />
            <input v-else type="text" :value="raw[f.key]" spellcheck="false" placeholder="As Classic" :aria-label="f.label" @input="set(f.key, ($event.target as HTMLInputElement).value)" />
          </span>
          <small v-if="bad(f.key)">Not allowed: colours, gradients and sizes only (no url(), no var()).</small>
        </label>
      </section>
    </div>
    <footer>
      <p v-if="badCount" class="glu-menu-note">{{ badCount }} {{ badCount === 1 ? "value isn't" : "values aren't" }} used (marked).</p>
      <div class="glu-menu-actions">
        <button type="button" class="wide" :disabled="!canSave" @click="skins.saveDraft()">Save</button>
        <button type="button" :disabled="!skins.canExport.value" @click="skins.exportSkin(draft.id)">Export…</button>
        <button type="button" @click="skins.cancelDraft()">Cancel</button>
      </div>
    </footer>
  </aside>
</template>
