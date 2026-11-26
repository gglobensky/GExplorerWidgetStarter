<script setup lang="ts">
// GEM YT 1.0, part 3 (2026-11-24): the header ribbon (Guillaume: like old YouTube), across the top of GEM YT's pages.
// Its look is the copy's: the banner of the creator you watched last, your own picture, or the theme's colours; on it,
// the plaque: GEM YT's emblem in the finish of its tier (the creators you encourage: Silver, Gold, Diamond, Ruby, Opal).
// ⋯ (or a right-click): the look, your picture, hide the ribbon.
import { computed } from 'vue'
import { nextTier, tierOf } from '../core/plaque'

const props = defineProps<{
  look: 'banner' | 'picture' | 'theme'
  /** the banner or your picture (GEM Shell's address); none: the theme's look */
  image?: string
  /** whose banner it is */
  credit?: string
  channels: number
  /** creators you encourage; null: this GEM Shell can't say yet */
  encouraged: number | null
}>()
const emit = defineEmits<{ menu: [ev: MouseEvent] }>()

const tier = computed(() => tierOf(props.encouraged ?? 0))
const line = computed(() => props.encouraged === null
  ? `${tier.value.name} · ${props.channels} ${props.channels === 1 ? 'channel' : 'channels'}`
  : `${tier.value.name} · ${props.encouraged} encouraged`)
const tip = computed(() => {
  const n = props.encouraged
  if (n === null) return 'GEM YT’s plaque. Its finish grows with the creators you encourage (ads allowed for them): Gold at 1, Diamond at 5, Ruby at 10, Opal at 25.'
  const next = nextTier(n)
  return next ? `${tier.value.name}: ${n} encouraged. ${next.more} more for ${next.tier.name}.` : `${tier.value.name}: ${n} encouraged, the last tier.`
})
const shown = computed(() => (props.look !== 'theme' && props.image ? props.image : undefined))
</script>

<template>
  <div class="ribbon" :class="[`look-${shown ? look : 'theme'}`]" :style="shown ? { backgroundImage: `url(&quot;${shown}&quot;)` } : undefined"
       @contextmenu.prevent="emit('menu', $event)">
    <div class="plaque" :class="`tier-${tier.id}`" role="img" :aria-label="`GEM YT, ${line}`" :title="tip">
      <span class="plaque-plate">
        <span class="plaque-emblem" aria-hidden="true"><i></i></span>
        <span class="plaque-copy">
          <span class="plaque-word">GEM<b>YT</b></span>
          <span class="plaque-line">{{ line }}</span>
        </span>
      </span>
    </div>
    <span v-if="shown && look === 'banner' && credit" class="credit">{{ credit }}</span>
    <button class="more" title="The ribbon: its look, your picture, hide it" aria-label="The ribbon’s menu" @click="emit('menu', $event)">⋯</button>
  </div>
</template>

<style scoped>
.ribbon { position: relative; flex: 0 0 auto; display: flex; align-items: center; height: 76px; margin: 0 6px 6px; padding: 0 14px; overflow: hidden;
  border-radius: 10px; background: center / cover no-repeat; box-shadow: inset 0 0 0 1px #ffffff14; container-type: inline-size; }
.ribbon::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, #000000a6, #00000040 45%, #00000000 70%, #00000059); }
.look-theme { background:
  radial-gradient(ellipse 60% 140% at 85% 0%, color-mix(in srgb, var(--gex-accent, #ff4545) 45%, transparent), transparent 70%),
  radial-gradient(ellipse 40% 120% at 30% 120%, color-mix(in srgb, var(--gex-accent, #ff4545) 25%, transparent), transparent 70%),
  repeating-linear-gradient(120deg, #ffffff06 0 2px, transparent 2px 14px),
  var(--gex-surface, #16171b); }
.look-theme::before { background: none; }
.credit { position: absolute; right: 42px; bottom: 6px; padding: 1px 7px; border-radius: 4px; color: #ffffffd9; background: #0000008c; font-size: 10px; font-weight: 600; }
.more { position: absolute; top: 6px; right: 6px; width: 28px; height: 24px; padding: 0; border: 1px solid #ffffff30; border-radius: 6px; color: #fff; background: #0000008c;
  font-size: 14px; line-height: 1; cursor: pointer; opacity: .75; }
.ribbon:hover .more, .more:focus-visible { opacity: 1; }
.more:hover { border-color: #ffffff66; background: #000000b3; }

/* The plaque (0.2.3's wall plaque, smaller): a shadow-box frame, a glass front, the plate; the tier's finish on the
   emblem and the word */
.plaque { position: relative; z-index: 1; height: 80%; aspect-ratio: 3.1; padding: 4px; border-radius: 4px;
  background: linear-gradient(150deg, #34343a, #101013 45%, #1d1d22); box-shadow: 0 10px 16px -6px #000d, 0 0 0 1px #000, inset 0 1px 0 #ffffff26, inset 0 -1px 0 #0009; }
.plaque::after { content: ''; position: absolute; inset: 4px; border-radius: 2px; pointer-events: none;
  background: linear-gradient(115deg, #ffffff00 30%, #ffffff1c 38%, #ffffff00 47%, #ffffff00 70%, #ffffff10 76%, #ffffff00 82%); box-shadow: inset 0 0 0 1px #ffffff14, inset 0 3px 8px #000c; }
.plaque-plate { display: flex; align-items: center; gap: 5%; height: 100%; padding: 0 8%; border-radius: 2px; background: radial-gradient(ellipse at 50% 0%, #26262b, #0b0b0d 75%); }
.plaque-emblem { flex: 0 0 auto; display: grid; place-items: center; height: 68%; aspect-ratio: 1.08; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%);
  background: linear-gradient(135deg, var(--f1) 0%, var(--f2) 24%, var(--f3) 42%, var(--f4) 64%, var(--f5) 82%, var(--f6) 100%); filter: drop-shadow(0 2px 2px #000); }
.plaque-emblem i { width: 46%; height: 50%; margin-left: 10%; clip-path: polygon(0 0, 0 100%, 90% 50%); background: linear-gradient(160deg, #2c2d31, #0f0f11); }
.plaque-copy { display: grid; gap: 2px; min-width: 0; }
.plaque-word { font: 900 25px/0.9 "Segoe UI Black", "Arial Black", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.045em; white-space: nowrap;
  background: linear-gradient(175deg, var(--f1) 0%, var(--f2) 30%, var(--f3) 48%, var(--f4) 70%, var(--f5) 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 1px 0 #000); }
.plaque-word b { margin-left: 0.12em; font-weight: inherit; }
.plaque-line { overflow: hidden; color: var(--line, #b9bcc2); font: 700 8px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.16em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
.tier-silver { --f1: #fbfbfc; --f2: #b6b9c0; --f3: #eff1f4; --f4: #8b8e95; --f5: #e2e4e8; --f6: #a3a6ad; --line: #b9bcc2; }
.tier-gold { --f1: #fff6d1; --f2: #d4a73a; --f3: #ffe9a3; --f4: #9a6b12; --f5: #f2cf6b; --f6: #b8862a; --line: #e2c27a; }
.tier-diamond { --f1: #ffffff; --f2: #bfe9ff; --f3: #f4fbff; --f4: #7fb8d9; --f5: #e6f7ff; --f6: #a9d3ea; --line: #bfe2f5; }
.tier-ruby { --f1: #ffd6dc; --f2: #d3203f; --f3: #ff8a9b; --f4: #7d0b20; --f5: #e84a63; --f6: #a3122c; --line: #f09aa8; }
.tier-opal { --f1: #fdf6ff; --f2: #b9f3e4; --f3: #ffd9f1; --f4: #a9c7ff; --f5: #fff3c4; --f6: #d6c2ff; --line: #e6d6ff; }
.tier-opal .plaque-emblem { animation: opal 9s linear infinite; }
@keyframes opal { to { filter: drop-shadow(0 2px 2px #000) hue-rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tier-opal .plaque-emblem { animation: none; } }
</style>
