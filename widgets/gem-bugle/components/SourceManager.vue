<script setup lang="ts">
import { inject, ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { BUGLE_SECTIONS, sectionLabel, type BugleSection, type BugleSource, type SourceCandidate, type SourceDisplay, type SourceSection } from '../model'
import { sourceHealth } from '../source-health'
import StarterShelf from './StarterShelf.vue'

type SourcePatch = { title: string; section: SourceSection; display: SourceDisplay }
type ImportResult = { sources: BugleSource[]; added: number; skipped: number }

const props = defineProps<{
  sources: BugleSource[]
  addStarter: (id: string) => Promise<BugleSource[]>
  discover: (url: string) => Promise<SourceCandidate[]>
  add: (candidate: SourceCandidate, section: SourceSection, display: SourceDisplay) => Promise<BugleSource[]>
  update: (id: string, patch: SourcePatch) => Promise<BugleSource[]>
  toggle: (id: string) => Promise<BugleSource[]>
  remove: (id: string) => Promise<BugleSource[]>
  refresh: () => Promise<BugleSource[]>
  importOpml: () => Promise<ImportResult | null>
  exportOpml: () => Promise<boolean>
  close?: () => void
}>()

const sdk = inject<WidgetSdk>('widgetSdk')
const sources = ref([...props.sources])
const address = ref('')
const working = ref(false)
const error = ref('')
const candidates = ref<SourceCandidate[]>([])
const selected = ref(0)
const section = ref<SourceSection>('auto')
const display = ref<SourceDisplay>('summary')
const editingId = ref('')
const editTitle = ref('')
const editSection = ref<SourceSection>('auto')
const editDisplay = ref<SourceDisplay>('summary')
const notice = ref('')
const now = ref(Date.now())

async function addStarter(id: string): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = ''
  notice.value = ''
  try {
    sources.value = await props.addStarter(id)
    notice.value = 'The source is on the presses.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The starter source could not be added.'
  } finally {
    working.value = false
  }
}

async function inspect(): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = ''
  candidates.value = []
  try {
    candidates.value = await props.discover(address.value)
    selected.value = 0
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The source could not be inspected.'
  } finally {
    working.value = false
  }
}

async function addSelected(): Promise<void> {
  const candidate = candidates.value[selected.value]
  if (!candidate || working.value) return
  working.value = true
  error.value = ''
  try {
    sources.value = await props.add(candidate, section.value, display.value)
    candidates.value = []
    address.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The source could not be saved.'
  } finally {
    working.value = false
  }
}

async function toggle(id: string): Promise<void> {
  try {
    sources.value = await props.toggle(id)
    now.value = Date.now()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The source could not be changed.'
  }
}

async function remove(source: BugleSource): Promise<void> {
  const ok = await sdk?.ui?.().confirm(`Remove “${source.title}” from the Bugle?`, {
    title: 'Remove source',
    detail: 'This only removes the subscription. It does not affect the publication or its website.',
    okLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  sources.value = await props.remove(source.id)
}

function beginEdit(source: BugleSource): void {
  editingId.value = source.id
  editTitle.value = source.title
  editSection.value = source.section
  editDisplay.value = source.display
  error.value = ''
}

async function saveEdit(): Promise<void> {
  if (!editingId.value || working.value) return
  const title = editTitle.value.trim()
  if (!title) {
    error.value = 'Give the publication a name.'
    return
  }
  working.value = true
  error.value = ''
  try {
    sources.value = await props.update(editingId.value, { title, section: editSection.value, display: editDisplay.value })
    editingId.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The source could not be saved.'
  } finally {
    working.value = false
  }
}

async function checkSources(): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = ''
  notice.value = ''
  try {
    sources.value = await props.refresh()
    now.value = Date.now()
    const failed = sources.value.filter(source => source.enabled && source.lastError).length
    notice.value = failed ? `${failed} ${failed === 1 ? 'source needs' : 'sources need'} attention.` : 'Every enabled source answered.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The sources could not be checked.'
  } finally {
    working.value = false
  }
}

async function importSubscriptions(): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await props.importOpml()
    if (!result) return
    sources.value = result.sources
    notice.value = `Imported ${result.added} ${result.added === 1 ? 'source' : 'sources'}${result.skipped ? `; skipped ${result.skipped} already present` : ''}.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The subscription list could not be imported.'
  } finally {
    working.value = false
  }
}

async function exportSubscriptions(): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = ''
  notice.value = ''
  try {
    if (await props.exportOpml()) notice.value = `Exported ${sources.value.length} ${sources.value.length === 1 ? 'source' : 'sources'}.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The subscription list could not be exported.'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="source-manager">
    <StarterShelf :source-urls="sources.map(source => source.feedUrl)" :working="working" @add="addStarter" />

    <section class="source-add" aria-labelledby="source-add-title">
      <h2 id="source-add-title">Add a publication</h2>
      <p>Paste a website or its RSS, Atom, or JSON Feed address. The Bugle will look for advertised feeds.</p>
      <form @submit.prevent="inspect">
        <label for="bugle-source-address">Website or feed</label>
        <div class="source-address-row">
          <input id="bugle-source-address" v-model="address" type="text" autocomplete="url" placeholder="https://example.com/news" :disabled="working">
          <button type="submit" :disabled="working || !address.trim()">{{ working ? 'Looking…' : 'Find feeds' }}</button>
        </div>
      </form>
      <p v-if="error" class="source-error" role="alert">{{ error }}</p>
    </section>

    <section v-if="candidates.length" class="source-candidates" aria-labelledby="source-found-title">
      <h2 id="source-found-title">{{ candidates.length === 1 ? 'Feed found' : `${candidates.length} feeds found` }}</h2>
      <div v-if="candidates.length > 1" class="candidate-tabs">
        <button v-for="(candidate, index) in candidates" :key="candidate.feed.feedUrl" type="button" :class="{ selected: selected === index }" @click="selected = index">
          {{ candidate.discoveredAs || candidate.feed.title }}
        </button>
      </div>
      <article class="candidate-preview">
        <h3>{{ candidates[selected].feed.title }}</h3>
        <p>{{ candidates[selected].feed.description || candidates[selected].feed.feedUrl }}</p>
        <ul>
          <li v-for="item in candidates[selected].feed.items.slice(0, 3)" :key="item.id">{{ item.title }}</li>
        </ul>
      </article>
      <div class="source-options">
        <label>Desk
          <select v-model="section">
            <option value="auto">Choose automatically</option>
            <option v-for="value in BUGLE_SECTIONS" :key="value" :value="value">{{ sectionLabel(value as BugleSection) }}</option>
          </select>
        </label>
        <label>Presentation
          <select v-model="display">
            <option value="summary">Headline and feed excerpt</option>
            <option value="headlines">Headline only</option>
          </select>
        </label>
      </div>
      <div class="source-save-row">
        <p>The publication is credited beside every story and in the colophon.</p>
        <button type="button" :disabled="working" @click="addSelected">Add to the Bugle</button>
      </div>
    </section>

    <section class="source-list" aria-labelledby="source-list-title">
      <div class="source-list-heading">
        <div>
          <h2 id="source-list-title">Press room</h2>
          <p>Edit the Bugle’s desks, test feeds, or carry subscriptions to another reader.</p>
        </div>
        <div class="source-list-tools">
          <button type="button" :disabled="working || !sources.length" @click="checkSources">{{ working ? 'Working…' : 'Check now' }}</button>
          <button type="button" :disabled="working" @click="importSubscriptions">Import OPML</button>
          <button type="button" :disabled="working || !sources.length" @click="exportSubscriptions">Export OPML</button>
        </div>
      </div>
      <p v-if="notice" class="source-notice" role="status">{{ notice }}</p>
      <p v-if="!sources.length" class="source-list-empty">No publications have been added yet.</p>
      <article v-for="source in sources" :key="source.id">
        <form v-if="editingId === source.id" class="source-edit" @submit.prevent="saveEdit">
          <label>Publication name
            <input v-model="editTitle" type="text" maxlength="180" :disabled="working">
          </label>
          <div class="source-options">
            <label>Desk
              <select v-model="editSection" :disabled="working">
                <option value="auto">Choose automatically</option>
                <option v-for="value in BUGLE_SECTIONS" :key="value" :value="value">{{ sectionLabel(value as BugleSection) }}</option>
              </select>
            </label>
            <label>Presentation
              <select v-model="editDisplay" :disabled="working">
                <option value="summary">Headline and feed excerpt</option>
                <option value="headlines">Headline only</option>
              </select>
            </label>
          </div>
          <div class="source-edit-actions">
            <button type="button" :disabled="working" @click="editingId = ''">Cancel</button>
            <button type="submit" :disabled="working || !editTitle.trim()">Save</button>
          </div>
        </form>
        <div v-else class="source-main">
          <h3>{{ source.title }}</h3>
          <p>{{ source.section === 'auto' ? 'Automatic desk' : sectionLabel(source.section as BugleSection) }} · {{ source.display === 'summary' ? 'With excerpts' : 'Headlines only' }}</p>
          <div class="source-health" :class="`source-health-${sourceHealth(source, now).tone}`">
            <span>{{ sourceHealth(source, now).label }}</span>
            <small>{{ sourceHealth(source, now).detail }}</small>
          </div>
        </div>
        <div v-if="editingId !== source.id" class="source-row-actions">
          <button type="button" @click="beginEdit(source)">Edit</button>
          <button type="button" @click="toggle(source.id)">{{ source.enabled ? 'Pause' : 'Enable' }}</button>
          <button type="button" class="danger-text" @click="remove(source)">Remove</button>
        </div>
      </article>
    </section>

    <footer>
      <button type="button" @click="close?.()">Done</button>
    </footer>
  </div>
</template>
