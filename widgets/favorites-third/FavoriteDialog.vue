<script setup lang="ts">
// widgets/favorites/FavoriteDialog.vue (0.2.0, 2026-10-28): adding or editing a favorite, or a new folder.
// Shown by the host in the middle of the window (ui.openPopover placement 'center', useFavoritesDialog.ts):
// its title bar reads "Favorites — <title>", written by the host. It was this widget's own full-window
// backdrop until 0.1.x; widgets don't draw over the shell themselves.
//
// A place already a favorite: the user chooses (the service never adds it twice on its own):
//   Replace it   the existing favorite takes this name, these folders and this folder of favorites
//   Keep both    added anyway (addFavorite / updateFavorite opts.allowDuplicate)
//   Cancel
import { computed, inject, nextTick, onMounted, ref } from 'vue'
import type { FavoriteTreeNode, WidgetSdk } from 'gexplorer/widgets'
import { guessLabelFromPath, type FavoriteDialogProps } from './favorites.model'


const props = defineProps<FavoriteDialogProps>()
const sdk = inject<WidgetSdk>('widgetSdk')

const MAX_LOCATIONS = 4
const mode = ref<'item' | 'folder'>(props.mode)
const locations = ref<string[]>(props.locations?.length ? props.locations.slice(0, MAX_LOCATIONS) : [''])
const label = ref(props.label ?? '')
const parentId = ref(props.parentId ?? '')
const error = ref<string | null>(props.notice ?? null)
const saving = ref(false)
const folders = ref<Array<{ id: string; label: string; depth: number }>>([])
const tree = ref<FavoriteTreeNode[]>([])
/** The favorite that already opens this place, while the user chooses. */
const conflict = ref<{ id: string; label: string; where: string } | null>(null)
const firstInput = ref<HTMLInputElement | null>(null)

const filled = computed(() => locations.value.map(l => l.trim()).filter(Boolean))
const placeholder = computed(() => {
  if (mode.value === 'folder') return 'New folder'
  const names = filled.value.map(guessLabelFromPath).filter(Boolean)
  return names.length ? names.join(' + ') : 'Downloads'
})
const canSave = computed(() => !saving.value && (mode.value === 'item' ? filled.value.length > 0 : !!label.value.trim()))
const saveLabel = computed(() => props.editingId ? 'Save' : mode.value === 'folder' ? 'Create' : 'Add')

onMounted(async () => {
  nextTick(() => firstInput.value?.focus())
  try {
    tree.value = await sdk?.getGlobalFavorites?.() ?? []
    const out: typeof folders.value = []
    const walk = (nodes: FavoriteTreeNode[], depth: number) => {
      for (const n of nodes) if (n.kind === 'folder') { out.push({ id: n.id, label: n.label, depth }); walk(n.children, depth + 1) }
    }
    walk(tree.value, 0)
    folders.value = out
  } catch (e) { console.error('[favorites] reading the folders failed:', e) }
})

/** Where favorite <id> is, in words ("in Work", "at the top level"). */
function whereIs(id: string): string {
  const visit = (nodes: FavoriteTreeNode[], parent: string | null): string | null => {
    for (const n of nodes) {
      if (n.kind === 'item' && n.id === id) return parent ? `in “${parent}”` : 'at the top level'
      if (n.kind === 'folder') { const r = visit(n.children, n.label); if (r) return r }
    }
    return null
  }
  return visit(tree.value, null) ?? ''
}
function labelOf(id: string): string {
  const visit = (nodes: FavoriteTreeNode[]): string | null => {
    for (const n of nodes) {
      if (n.kind === 'item' && n.id === id) return n.label
      if (n.kind === 'folder') { const r = visit(n.children); if (r) return r }
    }
    return null
  }
  return visit(tree.value) ?? placeholder.value
}

function addRow() { if (locations.value.length < MAX_LOCATIONS) locations.value = [...locations.value, ''] }
function removeRow(i: number) {
  const next = locations.value.filter((_, j) => j !== i)
  locations.value = next.length ? next : ['']
}

let picking: AbortController | null = null
async function browse(i: number) {
  const ui = sdk?.ui?.()
  if (!ui?.pickFolder || picking) return
  const ctrl = new AbortController()
  picking = ctrl
  try {
    const chosen = await ui.pickFolder({ title: 'Folder for this favorite', startIn: locations.value[i]?.trim() || undefined, acceptLabel: 'Use this folder', signal: ctrl.signal })
    if (chosen && !ctrl.signal.aborted) {
      const next = locations.value.slice()
      next[i] = chosen
      locations.value = next
    }
  } finally { if (picking === ctrl) picking = null }
}

async function done() {
  await props.onSaved?.()
  picking?.abort()
  props.close?.()
}

async function run(task: () => Promise<void>) {
  saving.value = true
  error.value = null
  try { await task() }
  catch (e: any) { error.value = String(e?.message ?? e ?? 'Error') }
  finally { saving.value = false }
}

function save() {
  if (!canSave.value) return
  const parent = parentId.value || null
  void run(async () => {
    if (mode.value === 'folder') {
      await sdk!.addFolder!(label.value.trim(), parent ?? undefined)
      return done()
    }
    if (props.editingId) {
      try {
        await sdk!.updateFavorite!(props.editingId, { label: label.value.trim(), locations: filled.value, parentFolderId: parent })
      } catch (e: any) {
        if (e?.code !== 'E_DUPLICATE' || !e.existingId) throw e
        conflict.value = { id: e.existingId, label: e.existingLabel || labelOf(e.existingId), where: whereIs(e.existingId) }
        return
      }
      return done()
    }
    const r = await sdk!.addFavorite!(filled.value, label.value.trim() || undefined, parent ?? undefined)
    if (r.added) return done()
    conflict.value = { id: r.id, label: labelOf(r.id), where: whereIs(r.id) }
  })
}

/** "Replace it": the existing favorite becomes this one (adding), or goes away (editing). */
function replaceExisting() {
  const c = conflict.value
  if (!c) return
  const parent = parentId.value || null
  void run(async () => {
    if (props.editingId) {
      await sdk!.removeFavorite!(c.id)
      await sdk!.updateFavorite!(props.editingId, { label: label.value.trim(), locations: filled.value, parentFolderId: parent })
    } else {
      await sdk!.updateFavorite!(c.id, { label: label.value.trim(), locations: filled.value, parentFolderId: parent })
    }
    return done()
  })
}

/** "Keep both": saved anyway, the user's choice. */
function keepBoth() {
  const parent = parentId.value || null
  void run(async () => {
    if (props.editingId) await sdk!.updateFavorite!(props.editingId, { label: label.value.trim(), locations: filled.value, parentFolderId: parent }, { allowDuplicate: true })
    else await sdk!.addFavorite!(filled.value, label.value.trim() || undefined, parent ?? undefined, { allowDuplicate: true })
    return done()
  })
}

function cancel() { picking?.abort(); props.close?.() }
</script>

<template>
  <form class="fd" @submit.prevent="save">
    <div v-if="canSwitch && !editingId" class="fd-mode" role="radiogroup" aria-label="What to add">
      <button type="button" role="radio" :aria-checked="mode === 'item'" :class="{ on: mode === 'item' }" @click="mode = 'item'">★ Favorite</button>
      <button type="button" role="radio" :aria-checked="mode === 'folder'" :class="{ on: mode === 'folder' }" @click="mode = 'folder'">📁 Folder</button>
    </div>

    <template v-if="!conflict">
      <div v-if="mode === 'item'" class="fd-field">
        <span class="fd-label">{{ locations.length > 1 ? 'Opens side by side' : 'Opens' }}</span>
        <div v-for="(_, i) in locations" :key="i" class="fd-row">
          <!-- 0.2.3 (GEM Shell 2026-10-29): the shell's path field: the path bar's predictions (Tab takes one), %APPDATA% and
               the like; it lists as this widget. No check line: hubs and sys: pages (home:, sys:settings) are valid here. -->
          <gex-path-input :ref="i === 0 ? ((el: any) => { firstInput = el as HTMLInputElement | null }) : undefined"
                          v-model="locations[i]"
                          class="fd-path"
                          kind="folder"
                          :placeholder="i === 0 ? 'C:\\Users\\you\\Downloads, home:, sys:settings' : 'Another folder'" />
          <button type="button" class="fd-icon-btn" title="Choose a folder" @click="browse(i)">…</button>
          <button v-if="locations.length > 1" type="button" class="fd-icon-btn" title="Remove this folder" @click="removeRow(i)">✕</button>
        </div>
        <button v-if="locations.length < MAX_LOCATIONS" type="button" class="fd-link" title="A favorite opens up to 4 folders side by side" @click="addRow">＋ A folder side by side</button>
      </div>

      <label class="fd-field">
        <span class="fd-label">Name</span>
        <input :ref="mode === 'folder' ? (el => { firstInput = el as HTMLInputElement | null }) : undefined" v-model="label" type="text" :placeholder="placeholder" />
      </label>

      <label class="fd-field">
        <span class="fd-label">In</span>
        <select v-model="parentId">
          <option value="">Favorites (top level)</option>
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ '\u00a0\u00a0\u00a0'.repeat(f.depth + 1) + f.label }}</option>
        </select>
      </label>

      <p v-if="error" class="fd-error" role="alert">{{ error }}</p>

      <div class="fd-buttons">
        <button type="button" @click="cancel">Cancel</button>
        <button type="submit" class="primary" :disabled="!canSave">{{ saveLabel }}</button>
      </div>
    </template>

    <template v-else>
      <div class="fd-conflict" role="alert">
        <strong>Already a favorite</strong>
        <p>“{{ conflict.label }}” {{ conflict.where }} already opens {{ filled.length > 1 ? 'these folders' : 'this folder' }}.</p>
        <p class="fd-muted">{{ editingId ? 'Remove that one, or keep both?' : 'Replace it with this one, or keep both?' }}</p>
      </div>
      <p v-if="error" class="fd-error" role="alert">{{ error }}</p>
      <div class="fd-buttons">
        <button type="button" :disabled="saving" @click="conflict = null">Back</button>
        <span class="fd-spacer" />
        <button type="button" :disabled="saving" title="Two favorites will open the same place" @click="keepBoth">Keep both</button>
        <button type="button" class="primary" :disabled="saving" :title="editingId ? `“${conflict.label}” is removed` : `“${conflict.label}” takes this name and place`" @click="replaceExisting">{{ editingId ? 'Remove the other' : 'Replace it' }}</button>
      </div>
    </template>
  </form>
</template>

<style scoped>
/* In line with the host's panels (message boxes, the menu editor's panels): the host draws the frame and title */
.fd {
  --fd-fg: var(--fg, #e8e8e8);
  --fd-muted: color-mix(in oklab, var(--fg, #e8e8e8) 60%, transparent);
  --fd-field: color-mix(in oklab, var(--fg, #fff) 6%, transparent);
  --fd-line: color-mix(in oklab, var(--fg, #fff) 16%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 400px;
  max-width: 100%;
  padding: 8px 12px 6px;
  box-sizing: border-box;
  color: var(--fd-fg);
  font: 13px/1.4 "Segoe UI", system-ui, sans-serif;
}
.fd button, .fd input, .fd select { font: inherit; color: inherit; }
.fd-mode {
  display: flex;
  align-self: flex-start;
  padding: 2px;
  border-radius: 7px;
  background: color-mix(in oklab, var(--fg, #fff) 7%, transparent);
}
.fd-mode button {
  padding: 3px 12px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}
.fd-mode button.on { color: #081018; background: var(--accent, #4ea1ff); font-weight: 600; }
.fd-field { display: flex; flex-direction: column; gap: 4px; }
.fd-label { font-size: 12px; color: var(--fd-muted); }
.fd-row { display: flex; gap: 4px; }
.fd-row input { flex: 1; width: auto; }
/* 0.2.3: the shell's path field, in this dialog's field look */
.fd-path {
  flex: 1;
  --gpi-bg: var(--fd-field);
  --gpi-border: var(--fd-line);
  --gpi-pad: 5px 8px;
  --gpi-font-size: inherit;
  --gpi-fg: inherit;
}
.fd input, .fd select {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--fd-line);
  border-radius: 6px;
  background: var(--fd-field);
  box-sizing: border-box;
}
.fd select option { background: #1b1b1b; }
.fd input:focus-visible, .fd select:focus-visible, .fd button:focus-visible {
  outline: 2px solid var(--accent, #4ea1ff);
  outline-offset: 1px;
}
.fd-icon-btn {
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--fd-line);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.fd-icon-btn:hover { border-color: var(--accent, #4ea1ff); color: var(--accent, #4ea1ff); }
.fd-link {
  align-self: flex-start;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--accent, #4ea1ff) !important;
  font-size: 12px !important;
  cursor: pointer;
}
.fd-link:hover { text-decoration: underline; }
.fd-error { margin: 0; font-size: 12px; color: var(--danger, #ff8a80); }
.fd-conflict {
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid #e0a83a;
  background: color-mix(in oklab, #e0a83a 10%, transparent);
}
.fd-conflict p { margin: 4px 0 0; }
.fd-muted { color: var(--fd-muted); font-size: 12px; }
.fd-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
.fd-spacer { flex: 1; }
.fd-buttons button {
  min-width: 76px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--fd-line);
  border-radius: 6px;
  background: color-mix(in oklab, var(--fg, #fff) 5%, transparent);
  cursor: pointer;
}
.fd-buttons button:hover:not(:disabled) { background: color-mix(in oklab, var(--fg, #fff) 11%, transparent); }
.fd-buttons button.primary { color: #081018; border-color: transparent; background: var(--accent, #4ea1ff); font-weight: 600; }
.fd-buttons button.primary:hover:not(:disabled) { filter: brightness(1.1); }
.fd-buttons button:disabled { opacity: .45; cursor: default; }
</style>
