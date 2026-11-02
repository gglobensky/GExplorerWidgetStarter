<script setup lang="ts">
// widgets/media-library/NeonSign.vue
//
// The Video Club's logo (0.14.0; the mockups' "neon tube sign", Guillaume's pick 2026-11-02): "Video Club" in a warm
// pink tube, "GEM" (and, on the showroom's sign, "OPEN LATE") in a cyan one. It flickers on once when it appears
// (not with reduced motion): on purpose, a tube coming on. The tube lettering is the font Tilt Neon (OFL, 0.14.1:
// assets/TiltNeon-Regular-VariableFont_XROT,YROT.ttf, @font-face in media-library.css).
withDefaults(defineProps<{ size?: 'bar' | 'sign' }>(), { size: 'bar' })
</script>

<template>
  <span class="media-neon" :class="size" role="img" aria-label="GEM Video Club">
    <span class="media-neon-gem" aria-hidden="true">GEM</span>
    <span class="media-neon-name" aria-hidden="true">Video Club</span>
    <span v-if="size === 'sign'" class="media-neon-late" aria-hidden="true">OPEN LATE</span>
  </span>
</template>

<style scoped>
.media-neon { --tube:"Tilt Neon Video Club","Segoe UI","Trebuchet MS",sans-serif; display:inline-flex; align-items:baseline; gap:.45em; line-height:1; white-space:nowrap; }
.media-neon-gem { color:#d6f7ff; font:400 .62em/1 var(--tube); letter-spacing:.32em; text-shadow:0 0 2px #fff, 0 0 7px #36c8ff, 0 0 16px #36c8ffaa; }
.media-neon-name { color:#ffd9e2; font:400 1em/1 var(--tube); letter-spacing:.02em; text-shadow:0 0 2px #fff, 0 0 8px #ff4f7a, 0 0 18px #ff2d5a, 0 0 32px #ff2d5a88; animation:media-neon-on 1.1s steps(1, end) both; }
.media-neon.bar { font-size:19px; }
.media-neon.sign { display:inline-grid; justify-items:center; gap:4px; font-size:clamp(30px, 5.4cqw, 56px); }
.media-neon.sign .media-neon-gem { order:-1; font-size:.34em; }
.media-neon-late { color:#d6f7ff; font:400 .3em/1 var(--tube); letter-spacing:.5em; text-shadow:0 0 2px #fff, 0 0 7px #36c8ff, 0 0 16px #36c8ffaa; animation:media-neon-on 1.4s steps(1, end) both; }
/* A tube coming on: two flickers, then steady */
@keyframes media-neon-on {
  0% { opacity:.15; text-shadow:none; }
  12% { opacity:1; }
  18% { opacity:.25; text-shadow:none; }
  30% { opacity:1; }
  36% { opacity:.4; }
  44%, 100% { opacity:1; }
}
@media (prefers-reduced-motion:reduce) { .media-neon-name, .media-neon-late { animation:none; } }
</style>
