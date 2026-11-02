<script setup lang="ts">
// widgets/game-library/LinkGame.vue
//
// "Find its details…" (0.11.1, Guillaume): a box linked by hand to IGDB's game, for a game the guesses miss (a SNES
// decomp added by hand, a title spelled its own way). Opens over the shop with the box's title already searched;
// the search and the platform can be changed; a click on a result links the box. From then on that game's
// details, name and cover win over Steam's guesses (online/details.ts links). "Back to automatic" takes it off.
// The covers come through the widget's art (useGameArt 'pick'): the widget asks for them (want-covers).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { IGDB_PLATFORMS, platformLabel, type IgdbGame } from './online/igdb'

const props = defineProps<{
  title: string
  /** The IGDB game it is linked to now, if any. */
  linkedId?: number
  /** The user's Twitch app is saved (IGDB can be asked). */
  connected: boolean
  search: (query: string, platform: number) => Promise<IgdbGame[]>
  /** Cover images made so far, by IGDB image id. */
  covers: Record<string, string>
}>()
const emit = defineEmits<{
  (e: 'choose', game: IgdbGame): void
  (e: 'unlink'): void
  (e: 'close'): void
  (e: 'want-covers', imageIds: string[]): void
}>()

const query = ref(props.title)
const platform = ref(0)
const results = ref<IgdbGame[]>([])
const state = ref<'idle' | 'searching' | 'done' | 'error'>('idle')
const message = ref('')
const input = ref<HTMLInputElement | null>(null)
let run = 0

async function find() {
  const q = query.value.trim()
  if (!q || !props.connected) return
  const mine = ++run
  state.value = 'searching'
  message.value = ''
  try {
    const found = await props.search(q, platform.value)
    if (mine !== run) return
    results.value = found
    state.value = 'done'
    emit('want-covers', found.map(g => g.cover).filter((c): c is string => !!c))
  } catch (e) {
    if (mine !== run) return
    state.value = 'error'
    message.value = e instanceof Error ? e.message : String(e)
  }
}
watch(platform, () => { void find() })

const year = (g: IgdbGame) => (g.released ? new Date(g.released).getUTCFullYear() : undefined)
const platforms = (g: IgdbGame) => g.platforms.map(platformLabel).filter(Boolean).slice(0, 3).join(', ')
const status = computed(() => {
  if (!props.connected) return "IGDB isn't connected: add your Twitch app on the Game Shop's page in GEM Shell's settings."
  if (state.value === 'searching') return 'Looking on IGDB…'
  if (state.value === 'error') return `IGDB didn't answer: ${message.value}`
  if (state.value === 'done' && !results.value.length) return 'Nothing found: try fewer words, or another platform.'
  if (state.value === 'done') return 'Pick the game this box is.'
  return ''
})

onMounted(() => {
  void nextTick(() => { input.value?.focus(); input.value?.select() })
  void find()
})
</script>

<template>
  <div class="gl-link-scrim" @click.self="emit('close')" @keydown.esc.stop.prevent="emit('close')">
    <section class="gl-link" role="dialog" aria-modal="true" :aria-label="`Find the details of ${title}`">
      <header>
        <b>Find its details</b>
        <small>{{ title }}</small>
        <button type="button" class="gl-link-x" aria-label="Close" title="Close" @click="emit('close')">×</button>
      </header>
      <form class="gl-link-search" role="search" @submit.prevent="find">
        <input ref="input" v-model="query" type="text" :spellcheck="false" autocomplete="off" aria-label="The game's name" placeholder="The game's name" :disabled="!connected" />
        <select v-model="platform" aria-label="Platform" :disabled="!connected">
          <option v-for="p in IGDB_PLATFORMS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <button type="submit" class="primary" :disabled="!connected || !query.trim() || state === 'searching'">Search</button>
      </form>
      <p class="gl-link-status" :class="{ warn: state === 'error' || !connected }" role="status" aria-live="polite">{{ status }}</p>
      <ul v-if="results.length" class="gl-link-results">
        <li v-for="g in results" :key="g.id">
          <button type="button" :class="{ linked: g.id === linkedId }" :title="g.summary || g.name" @click="emit('choose', g)">
            <span class="gl-link-cover" :style="g.cover && covers[g.cover] ? { backgroundImage: `url(${JSON.stringify(covers[g.cover])})` } : undefined" aria-hidden="true">
              <i v-if="!g.cover || !covers[g.cover]">{{ g.name.slice(0, 1) }}</i>
            </span>
            <span class="gl-link-text">
              <b>{{ g.name }}</b>
              <small>{{ [year(g), platforms(g)].filter(Boolean).join(' · ') }}</small>
              <small v-if="g.rating" class="gl-link-rating">★ {{ g.rating }}/100</small>
            </span>
            <span v-if="g.id === linkedId" class="gl-link-mark">Linked</span>
          </button>
        </li>
      </ul>
      <footer>
        <button v-if="linkedId" type="button" class="quiet" title="Its details come from Steam and IGDB's own guess again" @click="emit('unlink')">Back to automatic</button>
        <span></span>
        <button type="button" @click="emit('close')">Close</button>
      </footer>
    </section>
  </div>
</template>
