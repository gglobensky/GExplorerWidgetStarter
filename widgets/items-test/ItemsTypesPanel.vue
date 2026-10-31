<script setup lang="ts">
// widgets/items/ItemsTypesPanel.vue
//
// "Edit types…" (Filter ▸ Type ▸): the Filter menu's types. Built-in ones can be hidden; your own
// are made from a name and extensions, edited in place, deleted. Extensions are tags, as in Power
// Rename's extension filter (2026-10-27, 0.7.1): type one and Enter, Space or a comma makes it a tag,
// × removes one, Backspace in an empty field removes the last. "In this folder" offers the
// extensions of the files on screen as chips.
// Opened with ui.openPopover, placement 'center' (0.7.2: the host draws the frame and the title bar,
// "Items — File types", and scrolls it). It only reports the new registry (onChange): Widget.vue
// saves it (the 'file-types' document, for the whole widget) and gives this panel all its props again.
import { ref, computed } from 'vue'
import { customTypeId, GROUP_IDS, parseExtensions, TYPE_GROUPS, type TypeRegistry } from './quickFilter'

const props = defineProps<{
  registry: TypeRegistry
  onChange: (registry: TypeRegistry) => void
  close: () => void
  /** Extensions (no dot) of the files on screen, most common first. */
  suggestions?: string[]
}>()

const MAX_TYPES = 50
const MAX_EXTS = 64
const BUILT_IN_SHOWN = 8

// ── A new type ───────────────────────────────────────────────────────────────
const name = ref('')
const newExts = ref<string[]>([])
const draft = ref('')
const draftBad = ref(false)
const nameTaken = computed(() => {
  const wanted = name.value.trim().toLowerCase()
  return !!wanted && [...GROUP_IDS.map(id => TYPE_GROUPS[id].label), ...props.registry.custom.map(c => c.label)].some(label => label.toLowerCase() === wanted)
})
const canAdd = computed(() => !!name.value.trim() && newExts.value.length > 0 && !nameTaken.value && props.registry.custom.length < MAX_TYPES)
const offered = computed(() => (props.suggestions ?? []).filter(ext => !newExts.value.includes(ext)).slice(0, 12))

/** The field's text as tags (several at once when pasted: "jpg, png webp"). */
function commitDraft(into: string[], text: string): { exts: string[]; bad: boolean } {
  const trimmed = text.trim()
  if (!trimmed) return { exts: into, bad: false }
  const found = parseExtensions(trimmed)
  const exts = [...into, ...found.filter(ext => !into.includes(ext))].slice(0, MAX_EXTS)
  return { exts, bad: found.length === 0 }
}

function onDraftKey(ev: KeyboardEvent) {
  if (ev.key === 'Enter' || ev.key === ' ' || ev.key === ',' || ev.key === ';') {
    ev.preventDefault()
    if (ev.key === 'Enter' && !draft.value.trim() && canAdd.value) { add(); return }
    takeDraft()
  } else if (ev.key === 'Backspace' && !draft.value && newExts.value.length) {
    newExts.value = newExts.value.slice(0, -1)
  }
}
function takeDraft() {
  const r = commitDraft(newExts.value, draft.value)
  newExts.value = r.exts
  draftBad.value = r.bad
  if (!r.bad) draft.value = ''
}
function offer(ext: string) {
  if (!newExts.value.includes(ext)) newExts.value = [...newExts.value, ext].slice(0, MAX_EXTS)
}

function add() {
  takeDraft()
  if (draftBad.value || !canAdd.value) return   // what's left in the field isn't an extension: stays red
  const label = name.value.trim().slice(0, 40)
  props.onChange({ ...props.registry, custom: [...props.registry.custom, { id: customTypeId(label, props.registry), label, exts: newExts.value }] })
  name.value = ''
  newExts.value = []
  draft.value = ''
}

// ── Your types, edited in place ─────────────────────────────────────────────
const typeDrafts = ref<Record<string, string>>({})
const typeBad = ref<Record<string, boolean>>({})
function setTypeExts(id: string, exts: string[]) {
  if (!exts.length) return   // a type keeps at least one extension (delete the type instead)
  props.onChange({ ...props.registry, custom: props.registry.custom.map(c => c.id === id ? { ...c, exts } : c) })
}
function onTypeDraftKey(ev: KeyboardEvent, id: string, exts: string[]) {
  if (ev.key === 'Enter' || ev.key === ' ' || ev.key === ',' || ev.key === ';') {
    ev.preventDefault()
    takeTypeDraft(id, exts)
  } else if (ev.key === 'Backspace' && !typeDrafts.value[id] && exts.length > 1) {
    setTypeExts(id, exts.slice(0, -1))
  }
}
function takeTypeDraft(id: string, exts: string[]) {
  const r = commitDraft(exts, typeDrafts.value[id] ?? '')
  if (r.exts.length !== exts.length) setTypeExts(id, r.exts)
  typeBad.value = { ...typeBad.value, [id]: r.bad }
  if (!r.bad) typeDrafts.value = { ...typeDrafts.value, [id]: '' }
}
function onTypeDraftInput(id: string, value: string) {
  typeDrafts.value = { ...typeDrafts.value, [id]: value }
  if (typeBad.value[id]) typeBad.value = { ...typeBad.value, [id]: false }
}
function remove(id: string) {
  props.onChange({ ...props.registry, custom: props.registry.custom.filter(c => c.id !== id) })
}

// ── Built-in types ───────────────────────────────────────────────────────────
const openBuiltIn = ref<string | null>(null)
function toggleBuiltIn(id: (typeof GROUP_IDS)[number]) {
  const hidden = props.registry.hidden.includes(id) ? props.registry.hidden.filter(h => h !== id) : [...props.registry.hidden, id]
  props.onChange({ ...props.registry, hidden })
}
const builtInExts = (id: (typeof GROUP_IDS)[number]) => openBuiltIn.value === id ? TYPE_GROUPS[id].exts : TYPE_GROUPS[id].exts.slice(0, BUILT_IN_SHOWN)
const moreOf = (id: (typeof GROUP_IDS)[number]) => TYPE_GROUPS[id].exts.length - BUILT_IN_SHOWN
</script>

<template>
  <div class="itp" role="dialog" aria-label="File types" @keydown.escape.stop="close()">
    <p class="itp-intro">The types the Filter menu's Type list offers.</p>

    <section>
      <h3>Built in <span>untick to hide from the menu</span></h3>
      <div v-for="id in GROUP_IDS" :key="id" class="itp-type" :class="{ off: registry.hidden.includes(id) }">
        <label class="itp-type-head">
          <input type="checkbox" :checked="!registry.hidden.includes(id)" @change="toggleBuiltIn(id)" />
          <span class="itp-name">{{ TYPE_GROUPS[id].label }}</span>
        </label>
        <div class="itp-tags">
          <span v-for="ext in builtInExts(id)" :key="ext" class="itp-tag is-fixed">.{{ ext }}</span>
          <button v-if="moreOf(id) > 0" type="button" class="itp-more" @click="openBuiltIn = openBuiltIn === id ? null : id">
            {{ openBuiltIn === id ? 'less' : `+${moreOf(id)}` }}
          </button>
        </div>
      </div>
    </section>

    <section>
      <h3>Yours</h3>
      <p v-if="!registry.custom.length" class="itp-empty">None yet: make one below.</p>
      <div v-for="type in registry.custom" :key="type.id" class="itp-type">
        <div class="itp-type-head">
          <span class="itp-name">{{ type.label }}</span>
          <button type="button" class="itp-delete" :aria-label="`Delete ${type.label}`" title="Delete this type" @click="remove(type.id)">Delete</button>
        </div>
        <div class="itp-field" :class="{ bad: typeBad[type.id] }">
          <span v-for="(ext, i) in type.exts" :key="ext" class="itp-tag">
            .{{ ext }}
            <button type="button" class="itp-tag-x" :disabled="type.exts.length === 1"
                    :title="type.exts.length === 1 ? 'A type keeps one extension at least' : 'Remove'"
                    :aria-label="`Remove .${ext}`" @click="setTypeExts(type.id, type.exts.filter((_, j) => j !== i))">×</button>
          </span>
          <input class="itp-tag-input" type="text" placeholder="add…" :aria-label="`Add an extension to ${type.label}`"
                 :value="typeDrafts[type.id] ?? ''"
                 @input="onTypeDraftInput(type.id, ($event.target as HTMLInputElement).value)"
                 @keydown="onTypeDraftKey($event, type.id, type.exts)"
                 @blur="takeTypeDraft(type.id, type.exts)" />
        </div>
        <small v-if="typeBad[type.id]" class="itp-error">Not an extension: letters and digits, like mkv or .mp4.</small>
      </div>
    </section>

    <form class="itp-add" @submit.prevent="add">
      <h3>New type</h3>
      <input v-model="name" class="itp-text" type="text" maxlength="40" placeholder="Name (e.g. Raw photos)" aria-label="Name of the new type" />
      <div class="itp-field" :class="{ bad: draftBad }" @click="($event.currentTarget as HTMLElement).querySelector('input')?.focus()">
        <span v-for="(ext, i) in newExts" :key="ext" class="itp-tag">
          .{{ ext }}
          <button type="button" class="itp-tag-x" :aria-label="`Remove .${ext}`" @click.stop="newExts = newExts.filter((_, j) => j !== i)">×</button>
        </span>
        <input v-model="draft" class="itp-tag-input" type="text" :placeholder="newExts.length ? 'more…' : '.cr2  .nef  .arw'"
               aria-label="Extensions: Enter, Space or a comma after each" @keydown="onDraftKey" @blur="takeDraft"
               @input="draftBad = false" />
      </div>
      <div v-if="offered.length" class="itp-offer">
        <span class="itp-offer-label">In this folder</span>
        <button v-for="ext in offered" :key="ext" type="button" class="itp-chip" :title="`Add .${ext}`" @click="offer(ext)">+ .{{ ext }}</button>
      </div>
      <small v-if="nameTaken" class="itp-error">A type has that name already.</small>
      <small v-else-if="draftBad" class="itp-error">Not an extension: letters and digits, like mkv or .mp4.</small>
      <small v-else-if="registry.custom.length >= MAX_TYPES" class="itp-error">That's {{ MAX_TYPES }} types: delete one first.</small>
      <small v-else class="itp-hint">Enter, Space or a comma after each extension.</small>
      <div class="itp-actions">
        <button type="button" @click="close()">Done</button>
        <button type="submit" class="primary" :disabled="!canAdd">Add type</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* The extension tags follow Power Rename's extension filter (RenameFilterGroups.vue) */
.itp {
  --itp-tag-bg: rgba(59, 130, 246, .2);
  --itp-tag-fg: #93c5fd;
  --itp-field-bg: #1e3a5f;
  --itp-field-border: #2563eb;
  --itp-muted: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent);
  display: flex; flex-direction: column; gap: 12px;
  padding: 4px 12px 8px; box-sizing: border-box;
  color: var(--fg, #e8e8e8); font-size: var(--local-font-sm, 12px);
}
.itp-intro, .itp-empty, .itp-hint { color: var(--itp-muted); font-size: 11px; }
.itp-intro, .itp-empty { margin: 0; }
.itp h3 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; color: color-mix(in oklab, var(--fg, #e8e8e8) 62%, transparent); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.itp h3 span { color: var(--itp-muted); font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none; }
.itp section { display: flex; flex-direction: column; gap: 6px; }

.itp-type { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--items-border, #ffffff14); border-radius: 6px; background: color-mix(in oklab, var(--fg, #fff) 3%, transparent); }
.itp-type.off .itp-name, .itp-type.off .itp-tags { opacity: .45; }
.itp-type-head { display: flex; align-items: center; gap: 7px; min-height: 20px; }
label.itp-type-head { cursor: pointer; }
.itp-type-head input { margin: 0; accent-color: var(--accent, #4ea1ff); }
.itp-name { flex: 1 1 auto; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.itp-tags, .itp-field { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.itp-field { min-height: 28px; padding: 3px 6px; border: 1px solid var(--itp-field-border); border-radius: 5px; background: var(--itp-field-bg); cursor: text; box-sizing: border-box; }
.itp-field:focus-within { box-shadow: 0 0 0 2px color-mix(in oklab, var(--itp-field-border) 45%, transparent); }
.itp-field.bad { border-color: #f87171; }

.itp-tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px; border-radius: 3px; color: var(--itp-tag-fg); background: var(--itp-tag-bg); font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px; line-height: 16px; }
.itp-tag.is-fixed { color: color-mix(in oklab, var(--itp-tag-fg) 80%, var(--fg, #e8e8e8)); background: color-mix(in oklab, var(--itp-tag-bg) 60%, transparent); }
.itp-tag-x { padding: 0; border: 0; color: #60a5fa; background: none; font-size: 11px; line-height: 1; cursor: pointer; }
.itp-tag-x:hover:not(:disabled) { color: #f87171; }
.itp-tag-x:disabled { opacity: .35; cursor: default; }
.itp-tag-input { flex: 1 0 60px; min-width: 60px; border: 0; outline: 0; color: var(--itp-tag-fg); background: none; font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px; }
.itp-tag-input::placeholder { color: color-mix(in oklab, var(--itp-tag-fg) 45%, transparent); }

.itp-more { padding: 0 4px; border: 0; color: var(--itp-muted); background: none; font-size: 11px; cursor: pointer; }
.itp-more:hover { color: var(--accent, #4ea1ff); }
.itp-delete { padding: 1px 7px; border: 1px solid transparent; border-radius: 4px; color: var(--itp-muted); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.itp-delete:hover { border-color: #f8717166; color: #f87171; }

.itp-add { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--items-border, #ffffff1a); }
.itp-text { padding: 5px 8px; border: 1px solid var(--items-border, #ffffff26); border-radius: 5px; color: inherit; background: var(--surface-2, #1b1f24); font: inherit; }
.itp-text:focus { border-color: var(--accent, #4ea1ff); outline: 0; }
.itp-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.itp-offer-label { margin-right: 2px; color: var(--itp-muted); font-size: 11px; }
.itp-chip { padding: 1px 6px; border: 1px dashed color-mix(in oklab, var(--itp-field-border) 70%, transparent); border-radius: 3px; color: var(--itp-tag-fg); background: transparent; font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px; line-height: 16px; cursor: pointer; }
.itp-chip:hover { border-style: solid; background: var(--itp-tag-bg); }
.itp-error { color: #f59f8b; font-size: 11px; }
.itp-actions { display: flex; justify-content: flex-end; gap: 6px; padding-top: 2px; }
.itp-actions button { padding: 5px 12px; border: 1px solid var(--items-border, #ffffff26); border-radius: 6px; color: inherit; background: var(--surface-2, #22262b); cursor: pointer; font: inherit; }
.itp-actions button.primary { border-color: var(--accent, #4ea1ff); color: #081018; background: var(--accent, #4ea1ff); font-weight: 650; }
.itp-actions button:disabled { cursor: default; opacity: .5; }
</style>
