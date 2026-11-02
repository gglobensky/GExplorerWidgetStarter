<script setup lang="ts">
// A game, opened (0.5.0, 2026-11-01): the shared store detail (library-ui StoreDetail, the Video Club's movie-store
// page), so the box is as big as the widget allows.
//   left    Play (with the store Play uses), Show its folder, Steam page, Remove (a game you added)
//   middle  the box; a click turns it over: its banner, its screenshots pinned on it (a click shows one big), and
//           the copy box (genres, title, description, year · makers · last played)
//   right   the rating box (Metacritic: a click opens its reviews; without a score, Steam's reviews) and the stores
//           it's in, each with its own ▶ and "Use for Play"
// On the back, G and ¶ edit the genres and the description here (0.5.0, kept by the Game Shop over what Steam says).
import { computed, nextTick, ref, watch } from 'vue'
import { StoreDetail } from '@shared/library-ui'
import { installableRelease, playableRelease, STORE_LABELS, type GameItem, type GameRelease, type StoreId } from './games'
import { launcherNote } from './launch'
import { hoursText } from './playtime-quips'
import type { GameEdit } from './library-store'
import type { GameDetails } from './online/details'

const props = defineProps<{
  game: GameItem
  details?: GameDetails
  heroUrl?: string
  logoUrl?: string
  /** The screenshots' images, in the details' order ('' until made). */
  shotUrls?: Array<{ thumb: string; full: string }>
  /** The genres or the description were edited here. */
  edited?: { synopsis?: boolean; genres?: boolean }
  canReveal?: boolean
  /** launching (0.3.0): the disc slides out of the box's side while the store starts the game. */
  launching?: boolean
  /** 0.10.1: the line for its play time (playtime-quips.ts), shown in the time box under the rating. */
  quip?: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'play', release: GameRelease): void
  /** 0.10.0: a game owned and not installed: its store's install dialog. */
  (e: 'install', release: GameRelease): void
  (e: 'reveal', path: string): void
  (e: 'prefer', store: StoreId): void
  (e: 'remove'): void
  (e: 'want-shot', index: number): void
  /** The rating box: Metacritic's reviews. */
  (e: 'open-reviews'): void
  /** The rating box without a Metacritic score: Steam's players' reviews (0.6.0). */
  (e: 'open-steam-reviews'): void
  /** 0.11.0: the rating box with IGDB's score only: its page. */
  (e: 'open-igdb'): void
  (e: 'store-page'): void
  /** null: back to what Steam says. */
  (e: 'edit', edit: GameEdit): void
  /** 0.11.1: "Find its details…": link the box to IGDB's game by hand. */
  (e: 'link'): void
}>()

const flipped = ref(false)
const main = computed(() => playableRelease(props.game))
const toInstall = computed(() => (main.value ? undefined : installableRelease(props.game)))
const installed = computed(() => props.game.releases.filter(r => r.installed))
const isManual = computed(() => props.game.releases.some(r => r.store === 'manual'))
const steam = computed(() => props.game.releases.find(r => r.store === 'steam'))
const folder = computed(() => main.value?.installDir ?? props.game.releases.find(r => r.installDir)?.installDir)
const plain = computed(() => props.game.artwork.mode === 'placeholder')
const score = computed(() => props.details?.metacritic)
/** What Steam's players say (0.6.0): "Very Positive", 92 % of 10,320. */
const reviews = computed(() => {
  const r = props.details?.reviews
  if (!r?.total) return null
  const percent = Math.round((r.positive / r.total) * 100)
  const tone = r.score >= 7 || (!r.score && percent >= 70) ? 'positive' : r.score >= 5 || (!r.score && percent >= 40) ? 'mixed' : 'negative'
  return { ...r, percent, tone, count: r.total.toLocaleString() }
})
const steamAppId = computed(() => steam.value?.storeId ?? props.details?.steamAppId)

function played(at?: number): string {
  if (!at) return 'Never played'
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days <= 0) return 'Played today'
  if (days === 1) return 'Played yesterday'
  if (days < 30) return `Played ${days} days ago`
  return `Played ${new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
}
/** "2011 · Valve · Played yesterday" */
const meta = computed(() => {
  const d = props.details
  const makers = [...new Set([...(d?.developers ?? []), ...(d?.publishers ?? [])])].slice(0, 2).join(', ')
  return [props.game.year ? String(props.game.year) : d?.released, makers, played(props.game.lastPlayedAt)].filter(Boolean).join(' · ')
})

// The screenshots pinned on the back (four at most), each a little askew: the Video Club's scene tiles
const TILES = [
  { left: 6, top: 5, width: 40 },
  { left: 55, top: 7, width: 38 },
  { left: 10, top: 27, width: 34 },
  { left: 58, top: 29, width: 33 },
]
function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const tiles = computed(() => (props.shotUrls ?? []).slice(0, TILES.length).map((shot, index) => {
  const at = TILES[index]
  const h = hash(`${props.game.id}:${index}`)
  return {
    index,
    style: {
      left: `${at.left + (h % 5) - 2}%`,
      top: `${at.top + ((h >>> 4) % 5) - 2}%`,
      width: `${at.width + ((h >>> 8) % 5) - 2}%`,
      transform: `rotate(${((h >>> 12) % 11) - 5}deg)`,
      backgroundImage: shot.thumb ? `url(${JSON.stringify(shot.thumb)})` : undefined,
    },
  }
}))
const backdrop = computed(() => props.heroUrl || props.shotUrls?.find(s => s.thumb)?.thumb || '')

// A screenshot shown big (over the whole page; Esc, a click or ← → )
const bigShot = ref<number | null>(null)
const overlay = ref<HTMLElement | null>(null)
function showShot(index: number) {
  bigShot.value = index
  emit('want-shot', index)
  void nextTick(() => overlay.value?.focus())
}
function stepShot(step: number) {
  const count = props.shotUrls?.length ?? 0
  if (bigShot.value === null || count < 2) return
  showShot((bigShot.value + step + count) % count)
}

// Editing the genres and the description here
const editing = ref<'genres' | 'synopsis' | null>(null)
const genresDraft = ref('')
const synopsisDraft = ref('')
function beginGenres() { genresDraft.value = props.game.genres.join(', '); editing.value = 'genres' }
function beginSynopsis() { synopsisDraft.value = props.game.synopsis; editing.value = 'synopsis' }
function saveGenres() {
  const genres = genresDraft.value.split(',').map(g => g.trim())
    .filter((g, i, all) => !!g && all.findIndex(o => o.toLocaleLowerCase() === g.toLocaleLowerCase()) === i)
    .slice(0, 6)
  emit('edit', { genres: genres.length ? genres : null })
  editing.value = null
}
function saveSynopsis() {
  emit('edit', { synopsis: synopsisDraft.value.trim() || null })
  editing.value = null
}
function revert(field: 'genres' | 'synopsis') {
  emit('edit', { [field]: null })
  editing.value = null
}

watch(() => props.game.id, () => { flipped.value = false; bigShot.value = null; editing.value = null })
watch(flipped, value => { if (!value) editing.value = null })
</script>

<template>
  <StoreDetail
    v-model:flipped="flipped"
    class="gl-store-detail"
    :class="{ launching }"
    :item="game"
    :kicker="game.genres[0] ? `From ${game.genres[0]}` : 'GEM Game Shop'"
    @close="emit('close')"
  >
    <template #controls>
      <button v-if="main" type="button" class="primary" @click="emit('play', main)">
        <span aria-hidden="true">▶</span><b>Play</b><small v-if="launcherNote(main)">{{ launcherNote(main) }}</small>
      </button>
      <button v-else-if="toInstall" type="button" class="primary" :title="`Opens ${toInstall.install?.kind === 'link' ? toInstall.install.launcher : 'its store'}'s install window`" @click="emit('install', toInstall)">
        <span aria-hidden="true">⤓</span><b>Install</b><small>Opens {{ toInstall.install?.kind === 'link' ? toInstall.install.launcher : 'its store' }}</small>
      </button>
      <button v-else type="button" class="primary" disabled><span aria-hidden="true">▶</span><b>Not installed</b></button>
      <button v-if="canReveal && folder" type="button" title="Show its folder" @click="emit('reveal', folder)"><span aria-hidden="true">⌖</span><b>Show folder</b></button>
      <button v-if="steam" type="button" title="Its page in Steam's store" @click="emit('store-page')"><span aria-hidden="true">🛒</span><b>Steam page</b></button>
      <button type="button" title="Find the right game on IGDB and take its details" @click="emit('link')"><span aria-hidden="true">🔎</span><b>Find details</b></button>
      <button v-if="isManual" type="button" title="Take it off the shelves (the game itself stays)" @click="emit('remove')"><span aria-hidden="true">✕</span><b>Remove</b></button>
    </template>

    <template #behind>
      <span class="gl-detail-disc gl-disc" :class="{ out: launching }" aria-hidden="true"></span>
    </template>

    <template #front>
      <span v-if="plain" class="gl-box-print large" aria-hidden="true">
        <img v-if="logoUrl" :src="logoUrl" alt="" />
        <b v-else>{{ game.title }}</b>
      </span>
    </template>

    <template #back>
      <span v-if="backdrop" class="glu-sd-backdrop" :style="{ backgroundImage: `linear-gradient(180deg,#06080a3d,#06080ab0), url(${JSON.stringify(backdrop)})` }" aria-hidden="true"></span>
      <span
        v-for="tile in tiles"
        :key="tile.index"
        class="glu-sd-tile"
        :style="tile.style"
        role="button"
        tabindex="0"
        :aria-label="`Screenshot ${tile.index + 1}`"
        @click.stop="showShot(tile.index)"
        @keydown.enter.stop.prevent="showShot(tile.index)"
      ></span>
      <span class="glu-sd-back-copy">
        <small>{{ game.genres.length ? game.genres.join(' · ') : 'PC game' }}</small>
        <strong>{{ game.title }}</strong>
        <span>{{ game.synopsis || 'No description yet: GEM Game Shop looks it up on Steam\'s store, or you can write one (¶).' }}</span>
        <b>{{ meta }}</b>
      </span>
    </template>

    <template #stage>
      <div v-if="flipped" class="glu-sd-edit-tools" aria-label="Edit the box" @click.stop>
        <button type="button" title="Edit the genres" aria-label="Edit the genres" @click="beginGenres">G</button>
        <button type="button" title="Edit the description" aria-label="Edit the description" @click="beginSynopsis">¶</button>
      </div>
      <form v-if="flipped && editing === 'genres'" class="glu-sd-editor" aria-label="Edit the genres" @click.stop @submit.prevent="saveGenres">
        <label for="gl-edit-genres">Genres, separated by commas</label>
        <input id="gl-edit-genres" v-model="genresDraft" autofocus @keydown.esc.stop.prevent="editing = null" />
        <div>
          <button v-if="edited?.genres" type="button" class="quiet" title="Back to Steam's genres" @click="revert('genres')">Use Steam's</button>
          <button type="button" @click="editing = null">Cancel</button>
          <button type="submit" class="primary">Save</button>
        </div>
      </form>
      <form v-if="flipped && editing === 'synopsis'" class="glu-sd-editor tall" aria-label="Edit the description" @click.stop @submit.prevent="saveSynopsis">
        <label for="gl-edit-synopsis">Description</label>
        <textarea id="gl-edit-synopsis" v-model="synopsisDraft" rows="6" autofocus @keydown.esc.stop.prevent="editing = null"></textarea>
        <div>
          <button v-if="edited?.synopsis" type="button" class="quiet" title="Back to Steam's description" @click="revert('synopsis')">Use Steam's</button>
          <button type="button" @click="editing = null">Cancel</button>
          <button type="submit" class="primary">Save</button>
        </div>
      </form>
    </template>

    <template #side>
      <button v-if="score" type="button" class="glu-sd-rating" title="Read the reviews on Metacritic" @click="emit('open-reviews')">
        <span class="glu-sd-stars" aria-hidden="true"><i :style="{ width: `${score}%` }">★★★★★</i>★★★★★</span>
        <strong>{{ score }}<small>/100</small></strong>
        <span>Metacritic</span>
        <small v-if="reviews" class="gl-steam-says" :class="reviews.tone" :title="`${reviews.percent}% of ${reviews.count} Steam reviews are positive`">Steam: {{ reviews.desc }}</small>
        <em>Read reviews ↗</em>
      </button>
      <button v-else-if="reviews" type="button" class="glu-sd-rating" :title="`${reviews.percent}% of ${reviews.count} Steam reviews are positive. Read them on Steam's store`" @click="emit('open-steam-reviews')">
        <span class="glu-sd-stars" aria-hidden="true"><i :style="{ width: `${reviews.percent}%` }">★★★★★</i>★★★★★</span>
        <strong>{{ reviews.percent }}<small>%</small></strong>
        <b class="gl-steam-says" :class="reviews.tone">{{ reviews.desc }}</b>
        <span>{{ reviews.count }} Steam reviews</span>
        <em>Read reviews ↗</em>
      </button>
      <button v-else-if="details?.igdbRating" type="button" class="glu-sd-rating" :title="details.igdbUrl ? 'Its page on IGDB' : 'IGDB'" @click="emit('open-igdb')">
        <span class="glu-sd-stars" aria-hidden="true"><i :style="{ width: `${details.igdbRating}%` }">★★★★★</i>★★★★★</span>
        <strong>{{ details.igdbRating }}<small>/100</small></strong>
        <span>IGDB</span>
        <small v-if="details.igdbRatingCount" class="gl-igdb-count">{{ details.igdbRatingCount.toLocaleString() }} ratings</small>
        <em v-if="details.igdbUrl">IGDB page ↗</em>
      </button>
      <button v-else-if="steamAppId" type="button" class="glu-sd-rating" title="Its page on Steam's store" @click="emit('open-steam-reviews')">
        <span class="glu-sd-stars" aria-hidden="true">★★★★★</span>
        <strong>—</strong>
        <span>{{ details?.reviewsAt ? 'No Steam reviews' : 'Reviews not looked up yet' }}</span>
        <em>Steam page ↗</em>
      </button>
      <div v-else class="glu-sd-rating static">
        <span class="glu-sd-stars" aria-hidden="true">★★★★★</span>
        <strong>Not rated</strong>
        <small>No score found online for this game.</small>
      </div>
      <div v-if="game.playtimeMinutes" class="gl-sd-time" :aria-label="`${hoursText(game.playtimeMinutes)} played`">
        <strong>{{ hoursText(game.playtimeMinutes) }}</strong>
        <span>played</span>
        <em v-if="quip">{{ quip }}</em>
      </div>
      <ul class="gl-sd-stores" aria-label="Where you have it">
        <li v-for="release in game.releases" :key="`${release.store}:${release.storeId}`" :class="{ main: release === main, off: !release.installed }">
          <span class="gl-sticker" :class="`gl-sticker-${release.store}`" :title="release.installed ? (launcherNote(release) || 'Starts by itself') : 'Not installed'">{{ STORE_LABELS[release.store] }}</span>
          <button v-if="release.installed && release.launches.length" type="button" :aria-label="`Play with ${STORE_LABELS[release.store]}`" :title="`Play with ${STORE_LABELS[release.store]}`" @click="emit('play', release)">▶</button>
          <button v-if="installed.length > 1 && release.installed && release !== main" type="button" class="gl-sd-use" title="Play uses this store" @click="emit('prefer', release.store)">Use for Play</button>
        </li>
      </ul>
    </template>

    <template #overlay>
      <div
        v-if="bigShot !== null"
        ref="overlay"
        class="gl-shot-big"
        role="dialog"
        aria-label="Screenshot"
        tabindex="-1"
        @click="bigShot = null"
        @keydown.esc.stop.prevent="bigShot = null"
        @keydown.left.stop.prevent="stepShot(-1)"
        @keydown.right.stop.prevent="stepShot(1)"
      >
        <img :src="shotUrls?.[bigShot]?.full || shotUrls?.[bigShot]?.thumb" alt="" />
        <small v-if="(shotUrls?.length ?? 0) > 1">{{ bigShot + 1 }} / {{ shotUrls?.length }} · ← → </small>
      </div>
    </template>
  </StoreDetail>
</template>
