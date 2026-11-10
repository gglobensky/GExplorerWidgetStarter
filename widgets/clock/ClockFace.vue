<script setup lang="ts">
import { computed } from 'vue'
import type { TimepieceSkin } from './skins'

const props = defineProps<{ now: Date; skin: TimepieceSkin; showSeconds?: boolean; display?: string }>()
const h = computed(() => props.now.getHours())
const m = computed(() => props.now.getMinutes())
const s = computed(() => props.now.getSeconds())
const hourAngle = computed(() => ((h.value % 12) + m.value / 60) * 30)
const minuteAngle = computed(() => (m.value + s.value / 60) * 6)
const secondAngle = computed(() => s.value * 6)
const digits = computed(() => {
  if (props.display !== undefined) return props.display
  const hh = String(h.value).padStart(2, '0'), mm = String(m.value).padStart(2, '0'), ss = String(s.value).padStart(2, '0')
  return props.showSeconds === false ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`
})
const digitCharacters = computed(() => [...digits.value])
const matrixColumns = ['10110', '01101', '11010', '00111', '10010', '01110', '11001', '01011']
function numberStyle(n: number) {
  const angle = n * Math.PI / 6
  return { left: `${50 + Math.sin(angle) * 39}%`, top: `${50 - Math.cos(angle) * 39}%` }
}
</script>

<template>
  <div v-if="skin.renderer === 'analog'" class="analog" :class="{ readout: display !== undefined }" :aria-label="display === undefined ? 'Analog clock' : display">
    <i v-for="n in 60" :key="n" class="tick" :class="{ major: n % 5 === 0 }" :style="{ transform: `rotate(${n * 6}deg)` }" />
    <template v-if="display === undefined"><span v-for="n in 12" :key="`n${n}`" class="hour-number" :style="numberStyle(n)">{{ n }}</span><i class="hand hour" :style="{ transform: `translateX(-50%) rotate(${hourAngle}deg)` }" /><i class="hand minute" :style="{ transform: `translateX(-50%) rotate(${minuteAngle}deg)` }" /><i v-if="showSeconds !== false" class="hand second" :style="{ transform: `translateX(-50%) rotate(${secondAngle}deg)` }" /><i class="pin" /></template>
    <strong v-else class="digits">{{ digits }}</strong>
  </div>
  <div v-else class="digital" :class="skin.renderer" :aria-label="digits">
    <div v-if="skin.renderer === 'matrix'" class="matrix-rain" aria-hidden="true">
      <span v-for="(column, i) in matrixColumns" :key="i" :style="{ '--delay': `${-i * .37}s` }">{{ column.repeat(16) }}</span>
    </div>
    <div v-if="skin.renderer === 'nixie'" class="nixie-stage" aria-hidden="true">
      <div class="nixie-bank">
        <span v-for="(character, i) in digitCharacters" :key="i" :class="character === ':' ? 'tube-colon' : character === '.' ? 'tube-dot' : 'tube'">
          <template v-if="character !== ':' && character !== '.'"><i>8</i><b>{{ character }}</b></template>
        </span>
      </div>
      <div class="nixie-base"><i v-for="n in 12" :key="n" /></div>
      <div class="tube-label">VACUUM DISPLAY · GEM</div>
    </div>
    <div v-else-if="skin.renderer === 'flap'" class="flap-stage" aria-hidden="true">
      <div class="flap-bank">
        <span v-for="(character, i) in digitCharacters" :key="i" class="flap-cell" :class="{ separator: character === ':' || character === '.' }">
          <b v-if="character === ':' || character === '.'">{{ character }}</b>
          <span v-else :key="`${i}:${character}`" class="flap-card"><b>{{ character }}</b><i /></span>
        </span>
      </div>
      <div class="flap-label">GEM · ELECTROMECHANICAL</div>
    </div>
    <div v-else class="digits">{{ digits }}</div>
  </div>
</template>

<style scoped>
.analog { position:relative; width:min(82cqw,82cqh,330px); aspect-ratio:1; border:clamp(5px,2cqw,11px) solid var(--clock-edge,#777); border-radius:50%; color:var(--clock-tick,#222); background:var(--clock-dial,#eee); box-shadow:0 14px 30px #0008,inset 0 0 28px #0004; }
.tick { position:absolute; top:3.5%; left:50%; width:1px; height:4%; transform-origin:50% 1150%; background:var(--clock-tick,#222); opacity:.62; }
.tick.major { width:2px; height:7%; opacity:.95; }
.hour-number { position:absolute; width:1.6em; height:1.6em; display:grid; place-items:center; font:600 clamp(10px,4cqw,18px)/1 ui-serif,Georgia,serif; transform:translate(-50%,-50%); }
.hand { position:absolute; z-index:2; bottom:50%; left:50%; width:clamp(3px,1cqw,6px); border-radius:99px; transform-origin:50% 100%; box-shadow:0 2px 4px #0006; }
.hour { height:25%; background:var(--clock-hand-hour,#222); }
.minute { height:36%; background:var(--clock-hand-minute,#222); }
.second { z-index:3; width:2px; height:39%; background:var(--clock-hand-second,#b33); }
.pin { position:absolute; z-index:4; top:50%; left:50%; width:7%; aspect-ratio:1; border-radius:50%; background:var(--clock-hand-second,#b33); transform:translate(-50%,-50%); box-shadow:0 1px 4px #0009; }
.analog.readout { display:grid; place-items:center; background:radial-gradient(circle,var(--clock-dial,#eee) 0 54%,color-mix(in srgb,var(--clock-dial,#eee) 70%,#000) 75%); }
.analog.readout .digits { max-width:78%; color:var(--clock-hand-hour,#222); font-size:clamp(15px,7cqw,34px); text-align:center; text-shadow:none; }
.digital { container-type:inline-size; position:relative; display:grid; min-width:0; place-items:center; padding:clamp(8px,4cqi,28px); overflow:hidden; border:1px solid var(--clock-edge,#ffffff22); border-radius:var(--clock-radius,12px); background:var(--clock-panel,#1118); box-shadow:inset 0 1px #fff1,0 18px 36px #0005; }
.digits { position:relative; z-index:1; max-width:100%; color:var(--clock-digit,var(--clock-fg,#fff)); font:700 clamp(22px,19cqi,88px)/1 ui-monospace,SFMono-Regular,Consolas,monospace; font-variant-numeric:tabular-nums; letter-spacing:.015em; text-shadow:0 0 16px var(--clock-glow,transparent); white-space:nowrap; }
.nixie { padding:clamp(7px,3cqi,18px) clamp(5px,2.5cqi,14px) 7px; border-color:#ff9b4844; background:radial-gradient(ellipse at 50% 100%,#ff6a1817,transparent 48%),linear-gradient(#35170d55,#0b0503); box-shadow:inset 0 0 34px #000,0 14px 30px #0009; }
.nixie-stage { display:grid; width:100%; min-width:0; place-items:center; }
.nixie-bank { display:flex; width:100%; min-width:0; align-items:flex-end; justify-content:center; gap:clamp(2px,1.3cqi,7px); perspective:600px; }
.tube { position:relative; display:grid; min-width:0; max-width:58px; max-height:min(38cqh,104px); flex:1 1 0; aspect-ratio:.56; place-items:center; overflow:hidden; border:1px solid #ffd4b33d; border-top-color:#fff7e17a; border-bottom:3px solid #342015; border-radius:45% 45% 19% 19% / 13% 13% 8% 8%; background:linear-gradient(90deg,#fff2,transparent 15% 72%,#fff1),radial-gradient(ellipse at 50% 42%,#ff8b2814,transparent 48%),linear-gradient(#1b1816e8,#080605f2); box-shadow:inset 2px 0 5px #fff2,inset -3px 0 7px #000b,inset 0 -10px 12px #000c,0 4px 6px #000b; transform:rotateX(-1deg); }
.tube::before { content:""; position:absolute; top:3%; left:13%; width:16%; height:82%; border-radius:50%; background:linear-gradient(#fff5,transparent 40%); filter:blur(.5px); opacity:.6; }
.tube::after { content:""; position:absolute; right:15%; bottom:5%; left:15%; height:4px; border-top:1px solid #d7a97755; border-bottom:1px solid #000; background:#29170f; box-shadow:0 -3px 8px #ff6b1c1c; }
.tube b,.tube>i { position:absolute; inset:9% -15% 13%; display:grid; place-items:center; font:200 clamp(25px,14cqi,67px)/1 "Bahnschrift Light","Segoe UI Light","Arial Narrow",sans-serif; font-style:normal; font-variant-numeric:tabular-nums; transform:scaleX(.64); }
.tube>i { color:var(--clock-digit-off,#5d241a52); opacity:.23; text-shadow:none; }
.tube b { z-index:1; color:var(--clock-digit,#ff8a32); text-shadow:0 0 2px #fff6,0 0 6px var(--clock-glow,#f60),0 0 16px var(--clock-glow,#f60); }
.tube-colon { position:relative; width:clamp(7px,3cqi,15px); flex:none; align-self:center; aspect-ratio:.38; }
.tube-colon::before,.tube-colon::after { content:""; position:absolute; left:50%; width:clamp(4px,1.9cqi,8px); aspect-ratio:1; border-radius:50%; background:var(--clock-digit,#ff8a32); transform:translateX(-50%); box-shadow:0 0 3px #fff5,0 0 9px var(--clock-glow,#f60),0 0 18px var(--clock-glow,#f60); }
.tube-colon::before { top:28%; }.tube-colon::after { bottom:28%; }
.tube-dot { width:clamp(4px,1.8cqi,9px); flex:none; align-self:end; aspect-ratio:1; margin-bottom:14%; border-radius:50%; background:var(--clock-digit,#ff8a32); box-shadow:0 0 3px #fff5,0 0 9px var(--clock-glow,#f60),0 0 18px var(--clock-glow,#f60); }
.nixie-base { display:flex; width:96%; height:clamp(7px,3.5cqi,15px); align-items:end; justify-content:space-around; border-top:2px solid #73513d; border-bottom:3px double #160d09; background:linear-gradient(#32231b,#0d0907); box-shadow:0 5px 8px #000b,inset 0 1px #c09a7455; }
.nixie-base i { display:block; width:1px; height:55%; background:#ba8c65; box-shadow:0 0 2px #fff6; }
.tube-label { margin-top:clamp(4px,1.8cqi,9px); color:var(--clock-muted,#a87857); font:600 clamp(5px,2cqi,8px)/1 ui-monospace,monospace; letter-spacing:.24em; }
.flap { padding:clamp(10px,4cqi,24px); border-color:#d2b18455; background:repeating-linear-gradient(92deg,#ffffff08 0 1px,transparent 1px 9px),linear-gradient(135deg,#51372b,#1d1714 68%); box-shadow:inset 0 0 0 5px #17110e99,inset 0 1px #f5d8ab44,0 16px 34px #0009; }
.flap-stage { display:grid; width:100%; min-width:0; place-items:center; gap:clamp(5px,2cqi,10px); perspective:650px; }
.flap-bank { display:flex; width:100%; min-width:0; align-items:center; justify-content:center; gap:clamp(2px,1cqi,6px); padding:clamp(5px,2cqi,11px); box-sizing:border-box; border:1px solid #050504; border-radius:3px; background:linear-gradient(#050505,#181716 48%,#050505 52%,#0a0908); box-shadow:inset 0 0 16px #000,0 1px #c8aa8055; }
.flap-cell { display:grid; min-width:0; max-width:74px; flex:1 1 0; place-items:center; }
.flap-cell.separator { width:clamp(8px,3cqi,18px); max-width:none; flex:none; color:var(--clock-digit,#eee9dc); font:300 clamp(23px,12cqi,67px)/1 "Bahnschrift Light","Arial Narrow",sans-serif; text-shadow:0 2px 2px #000; }
.flap-card { position:relative; display:grid; width:100%; aspect-ratio:.68; place-items:center; overflow:hidden; border:1px solid #44403b; border-radius:4px; color:var(--clock-digit,#eee9dc); background:linear-gradient(#292724 0 49%,#171614 49% 51%,#24221f 51%); box-shadow:inset 0 1px #77746b55,inset 0 -1px #000,0 3px 6px #000b; transform-style:preserve-3d; animation:flap-change .58s cubic-bezier(.2,.72,.2,1); }
.flap-card::before { content:""; position:absolute; z-index:2; top:calc(50% - 1px); right:0; left:0; height:2px; border-top:1px solid #050505; border-bottom:1px solid #55514b; background:#111; box-shadow:0 -1px 2px #000,0 1px 1px #0008; }
.flap-card::after { content:""; position:absolute; z-index:3; top:calc(50% - 3px); right:2px; width:3px; height:6px; border-radius:1px; background:#050505; box-shadow:calc(-100cqi + 22px) 0 #050505; opacity:.8; }
.flap-card b { font:300 clamp(25px,14cqi,76px)/.8 "Bahnschrift Light","Arial Narrow","Segoe UI",sans-serif; font-variant-numeric:tabular-nums; transform:scaleX(.72); text-shadow:0 2px 2px #000; }
.flap-card i { position:absolute; inset:0; background:linear-gradient(#fff1,transparent 38%,#0003 52%,transparent); pointer-events:none; }
.flap-label { color:var(--clock-muted,#b7a388); font:700 clamp(5px,1.8cqi,8px)/1 ui-monospace,monospace; letter-spacing:.18em; }
@keyframes flap-change { 0% { opacity:.35; transform:rotateX(-88deg); } 58% { opacity:1; transform:rotateX(9deg); } 78% { transform:rotateX(-3deg); } 100% { transform:rotateX(0); } }
.matrix { min-height:110px; cursor:default; background:linear-gradient(#0005,#000c),var(--clock-panel,#020b04); }
.matrix .digits { padding:.1em .18em; background:#0004; border:1px solid var(--clock-edge,#0f03); color:var(--clock-digit,#9fba9f); text-shadow:0 0 7px var(--clock-glow,#0f6),0 0 24px var(--clock-glow,#0f6); }
.matrix-rain { position:absolute; z-index:0; inset:-180% 0; display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); overflow:hidden; opacity:.32; color:var(--clock-accent,#0f6); cursor:default; pointer-events:none; user-select:none; font:12px/1.1 ui-monospace,monospace; }
.matrix-rain span { justify-self:center; cursor:default; pointer-events:none; user-select:none; writing-mode:vertical-rl; text-orientation:upright; animation:fall 8s linear infinite; animation-delay:var(--delay); }
@keyframes fall { from { transform:translateY(-12%); } to { transform:translateY(12%); } }
@media (prefers-reduced-motion:reduce) { .matrix-rain span,.flap-card { animation:none; } }
</style>
