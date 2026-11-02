<script setup lang="ts">
// widgets/game-library/ShopLogo.vue
//
// The Game Shop's logo (0.18.0; the mockups' "floppy badge", Guillaume's pick 2026-11-02): a floppy disk with GEM on
// its label, and GAME SHOP in pixel letters. Everything is drawn here in SVG, the letters too (a 5×7 pixel alphabet of
// our own: no font to ship or license). size 'bar': the top bar's (one line); 'sign': the showroom's, bigger, with a
// line under it.
import { computed } from 'vue'

const props = withDefaults(defineProps<{ size?: 'bar' | 'sign' }>(), { size: 'bar' })

/** 5×7 letters, rows top to bottom ('#': a pixel). Only the letters the logo uses. */
const GLYPHS: Record<string, string[]> = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

/** A word as one SVG path of unit squares (letters 6 units apart, a space 3), and its width. */
function pixelPath(text: string): { d: string; width: number } {
  let d = ''
  let x = 0
  for (const ch of text) {
    const rows = GLYPHS[ch] ?? GLYPHS[' ']
    rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') d += `M${x + i} ${y}h1v1h-1z`
    })
    x += ch === ' ' ? 3 : 6
  }
  return { d, width: Math.max(0, x - 1) }
}

const WORD = pixelPath('GAME SHOP')
const LABEL = pixelPath('GEM')
const height = computed(() => (props.size === 'sign' ? 64 : 30))
</script>

<template>
  <span class="gl-logo" :class="size" role="img" aria-label="GEM Game Shop">
    <svg :height="height" :viewBox="`0 0 ${20 + WORD.width * 2} 16`" aria-hidden="true">
      <!-- The floppy: its body, the metal shutter and its slot, the label with GEM on it -->
      <rect x=".4" y=".4" width="15.2" height="15.2" rx=".8" fill="#262b31" stroke="#3fd0c9" stroke-width=".8" />
      <rect x="4" y=".8" width="8.4" height="5" rx=".3" fill="#b9c4cc" />
      <rect x="9.6" y="1.6" width="1.6" height="3.2" fill="#262b31" />
      <rect x="2.6" y="8" width="10.8" height="6.6" rx=".4" fill="#f3efe4" />
      <path :d="LABEL.d" transform="translate(3.75 9.55) scale(.5)" fill="#e05bb4" />
      <!-- GAME SHOP: a magenta pixel shadow under light pixels -->
      <path :d="WORD.d" transform="translate(20.6 1.6) scale(2)" fill="#e05bb4" />
      <path :d="WORD.d" transform="translate(20 1) scale(2)" fill="#eef3f4" />
    </svg>
    <small v-if="size === 'sign'">EVERY GAME · ONE AISLE</small>
  </span>
</template>

<style scoped>
.gl-logo { display:inline-flex; flex-direction:column; align-items:center; gap:6px; line-height:0; }
.gl-logo svg { display:block; width:auto; shape-rendering:crispEdges; filter:drop-shadow(0 2px 0 #05080b); }
.gl-logo.sign svg { filter:drop-shadow(0 3px 0 #05080b) drop-shadow(0 0 14px #3fd0c955); }
.gl-logo small { color:#3fd0c9; font:700 10px/1 ui-monospace, Consolas, monospace; letter-spacing:.32em; }
</style>
