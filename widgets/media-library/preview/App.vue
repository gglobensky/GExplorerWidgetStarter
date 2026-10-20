<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import Widget from '../Widget.vue'

const width = ref(1080)
const height = ref(720)
const lastAction = ref('Open a case to explore the collection.')
const config = ref({ data:{ selectedId:'signal-north', sources:['D:\\Media\\Movies','E:\\Archive\\Films'] }, view:{ atmosphere:true, libraryMode:'shelf' as const, detailMode:'movie-store' as const } })
const context = computed(() => width.value < 410 ? 'sidebar' as const : 'grid' as const)
let sampleSource = 0
provide('widgetSdk', {
  ui: () => ({
    pickFolder: async () => ['F:\\Family Videos','C:\\Users\\Alex\\Videos'][sampleSource++ % 2],
    snack: (options:{ text:string }) => { lastAction.value = options.text },
  }),
})
function event(value:{ type:string; payload:any }) {
  if (value.type === 'update:config') config.value = value.payload
  if (value.type === 'media-library:play') lastAction.value = `Play requested · ${value.payload.title}`
}
</script>

<template>
  <main>
    <header class="preview-intro">
      <div><p>GEM WIDGETS · INTERACTION PREVIEW</p><h1>Your movies, back on the shelf.</h1></div>
      <label>Widget width <input v-model="width" type="range" min="320" max="1180" step="10" /> <span>{{ width }}px</span></label>
    </header>
    <section class="preview-stage" :style="{ width:`${width}px`, height:`${height}px` }">
      <Widget :config="config" :placement="{ context, size:{ width, height } }" @event="event" />
    </section>
    <footer><span>{{ lastAction }}</span><span>Try the library menu · genre and A–Z jumps · showroom · case flip</span></footer>
  </main>
</template>

<style>
:root { color-scheme:dark; color:#dce5eb; background:#0b1117; font-family:"Segoe UI",system-ui,sans-serif; }
* { box-sizing:border-box; }
body { margin:0; }
main { min-height:100vh; padding:30px 34px 42px; overflow:auto; }
.preview-intro { display:flex; align-items:end; justify-content:space-between; gap:30px; width:min(1180px,100%); margin:0 auto 18px; }
.preview-intro p { margin:0 0 7px; color:#79b8d2; font-size:9px; letter-spacing:.15em; }
.preview-intro h1 { margin:0; font:500 28px/1 Georgia,serif; }
.preview-intro label { display:flex; align-items:center; gap:8px; color:#8798a5; font-size:10px; }
.preview-intro input { width:150px; accent-color:#79b8d2; }
.preview-intro label span { width:47px; color:#b9c7cf; font-variant-numeric:tabular-nums; }
.preview-stage { max-width:100%; min-height:520px; margin:auto; overflow:hidden; border:1px solid #34434f; border-radius:13px; box-shadow:0 28px 70px #0009; resize:both; }
footer { display:flex; justify-content:space-between; gap:24px; width:min(1180px,100%); margin:12px auto 0; color:#6f818e; font-size:10px; }
@media(max-width:650px) { main { padding:18px 12px; } .preview-intro { align-items:start; flex-direction:column; } footer { flex-direction:column; gap:3px; } }
</style>
