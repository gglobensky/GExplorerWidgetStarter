<script setup lang="ts">
// What sits on a game's box (the shared case's `marks` slot): its stores' stickers, a ▶ Play sticker that starts
// it in one click (shown on hover and keyboard focus), and on a box without art the title printed on the cardboard.
// launching (0.3.0): a disc rises out of the box while the store starts the game (game-library.css).
// The case is a <button>: the Play sticker is a span with role="button" (no button inside a button), its click
// stopped so the case doesn't open.
// 0.10.0: a game owned and not installed is still in its shrink-wrap (the plastic, a "Not installed" sticker), with
// no Play sticker: its box opens on Install.
// 0.23.0: badge: a small picture in the box's corner (a modpack's: Minecraft's own icon, from its program here).
import { computed } from 'vue'
import { installableRelease, playableRelease, STORE_LABELS, type GameItem } from './games'

const props = defineProps<{ game: GameItem; launching?: boolean; badge?: string }>()
const emit = defineEmits<{ (e: 'play', game: GameItem): void }>()

const STICKERS: Record<string, string> = {
  steam: 'STEAM', epic: 'EPIC', gog: 'GOG', rockstar: 'R★', ea: 'EA', ubisoft: 'UBI', battlenet: 'B.NET', xbox: 'XBOX', curseforge: 'CF', manual: 'PC',
}
const stores = computed(() => props.game.releases.map(r => r.store).filter((s, i, all) => all.indexOf(s) === i))
const canPlay = computed(() => !!playableRelease(props.game))
const plain = computed(() => props.game.artwork.mode === 'placeholder')
const wrapped = computed(() => !canPlay.value && !!installableRelease(props.game))

function play(event: Event) {
  event.stopPropagation()
  event.preventDefault()
  if (canPlay.value) emit('play', props.game)
}
</script>

<template>
  <img v-if="badge" class="gl-badge" :src="badge" alt="" aria-hidden="true" draggable="false" />
  <span v-if="plain" class="gl-box-print" aria-hidden="true"><b>{{ game.title }}</b></span>
  <span v-if="wrapped" class="gl-wrap" aria-hidden="true"><span class="gl-wrap-sticker">Not installed</span></span>
  <span v-if="launching" class="gl-launching" aria-hidden="true"><span class="gl-disc"></span></span>
  <span class="gl-stickers">
    <span v-for="store in stores" :key="store" class="gl-sticker" :class="`gl-sticker-${store}`" :title="STORE_LABELS[store]">{{ STICKERS[store] }}</span>
  </span>
  <span
    v-if="canPlay"
    class="gl-play"
    role="button"
    :aria-label="`Play ${game.title}`"
    title="Play"
    @click="play"
    @keydown.enter="play"
  >▶</span>
</template>
