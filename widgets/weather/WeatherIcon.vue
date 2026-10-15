<script setup lang="ts">
import type { ConditionKind } from './weather'
defineProps<{ kind: ConditionKind; colored?: boolean }>()
</script>
<template>
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="{ colored }">
    <g v-if="kind === 'sun' || kind === 'partly'" class="sun">
      <circle :cx="kind === 'sun' ? 16 : 11" :cy="kind === 'sun' ? 16 : 11" :r="kind === 'sun' ? 6 : 5" />
      <path v-if="kind === 'sun'" d="M16 3v3m0 20v3M3 16h3m20 0h3M7 7l2 2m14 14 2 2M7 25l2-2M23 9l2-2" />
      <path v-else d="M11 1v2M1 11h2M4 4l2 2m12-2-2 2" />
    </g>
    <path v-if="!['sun', 'unknown'].includes(kind)" class="cloud" d="M8 23a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 1 1 3 12Z" />
    <path v-if="kind === 'rain'" class="rain" d="m10 26-1 3m7-3-1 3m7-3-1 3" />
    <path v-if="kind === 'snow'" class="snow" d="M10 26v4m-2-2h4m10-2v4m-2-2h4" />
    <path v-if="kind === 'storm'" class="sun" d="m17 19-4 7h5l-3 5" />
    <path v-if="kind === 'fog'" d="M5 27h22M8 31h16" />
    <path v-if="kind === 'unknown'" d="M12 12a4 4 0 1 1 6 3c-2 1-2 2-2 4m0 4v.1" />
  </svg>
</template>
<style scoped>
svg{width:30px;height:30px;flex:none}.colored .sun{stroke:var(--weather-sun,#e7b34f)}.colored .cloud{stroke:var(--weather-cloud,#a9c4d6)}.colored .rain{stroke:var(--weather-rain,#69b6e7)}.colored .snow{stroke:var(--weather-cloud,#a9c4d6)}
</style>
