<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import TreePanel from '../TreePanel.vue'
import Toolbar from './Toolbar.vue'
import { newMemory, type Root } from '../tree'
import { createFixtures, roots } from './fixtures'
const memory = reactive(newMemory()), toolbarMemory = reactive(newMemory())
const last = ref('No navigation yet'), count = ref(0), toolbarCount = ref(0), width = ref(292)
const panel = ref<InstanceType<typeof TreePanel> | null>(null), toolbar = ref<InstanceType<typeof Toolbar> | null>(null)
const menu = ref<{ x: number; y: number; path: string; toolbar: boolean } | null>(null)
const source = createFixtures(path => last.value = path, n => count.value = n)
const toolbarSource = createFixtures(path => last.value = path, n => toolbarCount.value = n)
async function favorite(root: Root, isToolbar = false) {
  const target = isToolbar ? toolbar.value : panel.value
  target?.choose(roots[0]); await nextTick(); target?.focusFolder(root.path)
  last.value = root.path
}
function showMenu(event: MouseEvent, path: string, isToolbar = false) { menu.value = { x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 200), path, toolbar: isToolbar } }
function command(id: string) {
  if (menu.value) (menu.value.toolbar ? toolbar.value : panel.value)?.command(id, menu.value.path)
  menu.value = null
}
</script>
<template>
  <main @pointerdown="menu = null">
    <div class="preview-intro"><p class="eyebrow">GEM WIDGETS · INTERACTION PREVIEW</p><h1>One root. Your place remembered.</h1><p>Sample folders only. The sidebar and toolbar share the same tree.</p></div>
    <div class="preview-workspace">
      <section><div class="preview-label"><span>SIDEBAR</span><label>Width <input v-model="width" type="range" min="210" max="440" /> {{ width }}px</label></div><div class="preview-sidebar" :style="{ width: `${width}px` }"><TreePanel ref="panel" :roots="roots" :source="source" :memory="memory" @favorite="favorite($event)" @menu="showMenu" @add="last = 'Production opens the host folder picker.'" /></div></section>
      <section class="preview-right"><div class="preview-label">TOOLBAR · PREVIEW ONLY</div><div class="preview-toolbar-area"><Toolbar ref="toolbar" :roots="roots" :source="toolbarSource" :memory="toolbarMemory" @favorite="favorite($event, true)" @menu="(event, path) => showMenu(event, path, true)" /></div><div class="preview-notes"><h2>Try the interactions</h2><p>Below 242px, open Projects → GEM → Design and use the folder-up control to return. Widen the sidebar to restore the full tree.</p><p>Choose Design notes from Favorites. Use Entire Work folders to leave focused view.</p><p>Right-click a folder for Focus and Minimize. Try Empty, Slow, Restricted, and Many folders.</p><p>Use the top/bottom arrows, arrow keys, Enter, Space, Home, End, and type-ahead.</p><div class="preview-status"><span>Navigation</span><strong>{{ last }}</strong><span>Open listing sources</span><strong>{{ count + toolbarCount }}</strong></div></div></section>
    </div>
    <div v-if="menu" class="preview-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @pointerdown.stop><button @click="command('focus')">Focus this folder</button><button @click="command('exit-focus')">Exit focused view</button><button @click="command('minimize-all')">Minimize all</button><button @click="command('minimize-others')">Minimize others</button><button @click="command('refresh')">Refresh folders</button></div>
  </main>
</template>
<style>
:root { color-scheme:dark; font-family:system-ui,sans-serif; color:#dce4eb; background:#10161d; }
html,body,#app { height:100%; overflow:hidden; }
body { margin:0; }
main { padding:38px 44px; height:100%; overflow:auto; scrollbar-width:none; box-sizing:border-box; }
main::-webkit-scrollbar { width:0; height:0; }
.eyebrow { color:#82b8cf; letter-spacing:.14em; font-size:10px; }
h1 { font-size:28px; font-weight:550; letter-spacing:-.7px; margin:12px 0; }
.preview-intro>p:last-child { color:#9baab8; font-size:13px; }
.preview-workspace { display:flex; gap:48px; margin-top:36px; align-items:flex-start; }
.preview-label { display:flex; align-items:center; justify-content:space-between; height:32px; color:#8a9aa8; font-size:10px; letter-spacing:.09em; }
.preview-label label { display:flex; align-items:center; gap:5px; letter-spacing:0; }
.preview-label input { width:66px; accent-color:#82b8cf; }
.preview-workspace>section { max-width:100%; }
.preview-sidebar { height:520px; max-width:100%; border:1px solid #34414d; border-radius:6px; overflow:hidden; }
.preview-right { flex:1; max-width:420px; }
.preview-toolbar-area { padding:14px; border:1px solid #34414d; background:#161e26; border-radius:6px; }
.preview-notes { margin-top:36px; font-size:12px; line-height:1.8; color:#9baab8; }
h2 { font-size:14px; font-weight:500; color:#dce4eb; }
.preview-status { margin-top:25px; padding-top:18px; border-top:1px solid #ffffff16; display:flex; flex-direction:column; gap:5px; }
.preview-status>span { font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
.preview-status strong { color:#bad3e0; font-weight:400; word-break:break-word; margin-bottom:10px; }
.preview-menu { position:fixed; z-index:30; background:#25313c; border:1px solid #536573; border-radius:5px; padding:5px; box-shadow:0 8px 24px #0008; }
.preview-menu button { display:block; text-align:left; width:100%; padding:8px 12px; border:0; background:transparent; color:#dce4eb; cursor:pointer; }
.preview-menu button:hover { background:#ffffff10; }
@media(max-width:720px) { main { padding:18px 16px; } .preview-workspace { flex-direction:column; gap:24px; } }
</style>
