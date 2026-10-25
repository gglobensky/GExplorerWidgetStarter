<script setup lang="ts">
// widgets/media-library/EmptyClub.vue
//
// The library before it has any folder: a shelf of empty DVD cases, the middle one asking for a
// media folder (it replaces the old sample collection and its illustrated posters).
defineProps<{ canAdd: boolean }>()
const emit = defineEmits<{ (e:'add-source'):void }>()
const CASES = 5
</script>

<template>
  <section class="media-empty-club" aria-label="Your video club is empty">
    <header>
      <h1 class="media-video-club-wordmark"><span>GEM</span><strong>VIDEO CLUB</strong></h1>
      <p>Your shelves are empty for now.</p>
    </header>
    <div class="media-empty-club-shelf">
      <div class="media-empty-club-cases">
        <template v-for="index in CASES" :key="index">
          <button
            v-if="index === Math.ceil(CASES / 2)"
            type="button"
            class="media-empty-case add"
            :disabled="!canAdd"
            @click="emit('add-source')"
          >
            <span class="media-empty-case-insert" aria-hidden="true"></span>
            <b aria-hidden="true">＋</b>
            <strong>Add a media folder</strong>
          </button>
          <span v-else class="media-empty-case" aria-hidden="true">
            <span class="media-empty-case-insert"></span>
            <small>Empty</small>
          </span>
        </template>
      </div>
      <div class="media-empty-club-edge" aria-hidden="true"></div>
    </div>
    <p class="media-empty-club-help">Choose the folders that hold your movies and series. GEM Video Club finds the videos and puts them on the shelves.</p>
  </section>
</template>
