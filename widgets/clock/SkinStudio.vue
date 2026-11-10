<script setup lang="ts">
import { inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { useTimepieceSkins } from './useTimepieceSkins'
import { TIMEPIECE_SKIN_KEYS, type ClockRenderer } from './skins'
import ClockFace from './ClockFace.vue'

const props = defineProps<{ selected: string; now: Date }>()
const emit = defineEmits<{ select: [id: string] }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const notify = (text: string) => { void sdk?.ui?.().snack({ id: 'clock-skins', text, dedupe: 'replace', timeoutMs: 6000 }) }
const skins = useTimepieceSkins(sdk, notify)
const renderers: Array<{ id: ClockRenderer; label: string }> = [
  { id: 'digital', label: 'Digital' }, { id: 'analog', label: 'Analog' }, { id: 'nixie', label: 'Nixie' }, { id: 'matrix', label: 'Matrix' }, { id: 'flap', label: 'Split flap' },
]
const labels: Record<string, string> = {
  bg:'Background',panel:'Panel',fg:'Text',muted:'Muted text',accent:'Accent','accent-2':'Second accent',edge:'Edges',
  dial:'Analog dial',tick:'Dial marks','hand-hour':'Hour hand','hand-minute':'Minute hand','hand-second':'Second hand',
  digit:'Digits','digit-off':'Unlit digits',glow:'Glow','calendar-paper':'Calendar paper','calendar-ink':'Calendar ink',
  'calendar-rule':'Calendar rules','calendar-mark':'Calendar marks','calendar-today':'Today','calendar-rings':'Calendar rings (flex or none)','radius':'Corner radius',
}
const isMine = (id: string) => skins.mine.value.some(s => s.id === id)
async function importSkin() {
  const loaded = await skins.importFiles()
  if (loaded) emit('select', loaded.id)
}
function removeSkin(id: string) {
  skins.remove(id)
  if (id === props.selected) emit('select', 'quiet-system')
}
</script>

<template>
  <div class="studio">
    <template v-if="skins.draft.value">
      <header><div><small>LIVE PREVIEW</small><h2>Edit skin</h2></div><div><button type="button" @click="skins.cancelDraft">Cancel</button><button type="button" class="primary" @click="skins.saveDraft">Keep</button></div></header>
      <div class="identity">
        <label><span>Name</span><input v-model="skins.draft.value.name" maxlength="60" /></label>
        <label><span>Author</span><input v-model="skins.draft.value.author" maxlength="80" placeholder="Optional" /></label>
        <label><span>Face</span><select v-model="skins.draft.value.renderer"><option v-for="r in renderers" :key="r.id" :value="r.id">{{ r.label }}</option></select></label>
      </div>
      <div class="preview"><ClockFace :now="now" :skin="skins.draft.value" /></div>
      <div class="tokens">
        <label v-for="key in TIMEPIECE_SKIN_KEYS" :key="key"><span>{{ labels[key] }}</span><select v-if="key === 'calendar-rings'" v-model="skins.draft.value.values[key]"><option value="">Default (show)</option><option value="flex">Show</option><option value="none">Hide</option></select><input v-else v-model="skins.draft.value.values[key]" :placeholder="`Default ${labels[key].toLowerCase()}`" /></label>
      </div>
    </template>
    <template v-else>
      <header><div><small>TIMEPIECE LOOKS</small><h2>Skins</h2></div><button type="button" @click="importSkin">Import .gemskin…</button></header>
      <p class="storage-note">Imported skins are copied into Clock's private collection. Removing one deletes Clock's copy without touching the original file.</p>
      <div class="skin-grid">
        <article v-for="skin in skins.all.value" :key="skin.id" :class="{ selected: skin.id === selected }" @click="emit('select', skin.id)">
          <i :style="{ background: skin.values.bg, color: skin.values.accent, borderColor: skin.values.edge }"><b>{{ skin.renderer === 'analog' ? '◷' : skin.renderer === 'nixie' ? '⑧' : skin.renderer === 'matrix' ? '01' : skin.renderer === 'flap' ? '▣' : '12' }}</b></i>
          <div><strong>{{ skin.name }}</strong><small>{{ skin.renderer }}{{ skin.author ? ` · ${skin.author}` : '' }}</small></div>
          <div class="actions"><button type="button" @click.stop="skins.duplicate(skin.id)">Duplicate</button><button v-if="isMine(skin.id)" type="button" @click.stop="skins.edit(skin.id)">Edit</button><button type="button" @click.stop="skins.exportSkin(skin.id)">Export</button><button type="button" class="danger" :disabled="!isMine(skin.id)" :title="isMine(skin.id) ? 'Remove Clock’s copy' : 'Built-in skins cannot be removed'" @click.stop="removeSkin(skin.id)">{{ isMine(skin.id) ? 'Remove copy' : 'Built in' }}</button></div>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.studio{box-sizing:border-box;width:min(610px,84vw);height:min(590px,72vh);min-width:0;min-height:240px;padding:clamp(14px,4cqw,30px);overflow:auto}.studio header{display:flex;align-items:end;justify-content:space-between;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--clock-edge,#ffffff18)}.studio header>div:last-child{display:flex;gap:5px}.studio h2{margin:1px 0 0;font:700 clamp(19px,4cqw,30px)/1 ui-serif,Georgia,serif}.studio header small{color:var(--clock-muted,#aaa);font-size:9px;letter-spacing:.13em}.studio button{padding:5px 8px;border:1px solid var(--clock-edge,#ffffff28);border-radius:5px;color:var(--clock-fg,#fff);background:var(--clock-panel,#111a);font:600 9px/1 inherit;cursor:pointer}.studio button.primary{color:#071117;border-color:var(--clock-accent,#6cf);background:var(--clock-accent,#6cf)}.studio button.danger{color:#f19b91}.studio button:disabled{opacity:.38;cursor:not-allowed}.storage-note{margin:9px 0 0;color:var(--clock-muted,#aaa);font-size:9px;line-height:1.35}.skin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:7px;margin-top:12px}.skin-grid article{display:grid;grid-template-columns:48px 1fr;gap:8px;padding:7px;border:1px solid var(--clock-edge,#ffffff18);border-radius:7px;background:var(--clock-panel,#1118);cursor:pointer}.skin-grid article.selected{border-color:var(--clock-accent,#6cf);box-shadow:inset 0 -2px var(--clock-accent,#6cf)}.skin-grid i{display:grid;grid-row:1 / span 2;width:48px;height:38px;place-items:center;border:1px solid currentColor;border-radius:5px;font:700 12px/1 ui-monospace,monospace;font-style:normal}.skin-grid article>div:nth-child(2){display:grid;min-width:0}.skin-grid strong{overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.skin-grid small{overflow:hidden;color:var(--clock-muted,#aaa);font-size:8px;text-overflow:ellipsis;text-transform:capitalize;white-space:nowrap}.actions{display:flex;grid-column:2;flex-wrap:wrap;gap:3px}.actions button{padding:3px 5px}.identity{display:grid;grid-template-columns:1fr 1fr 130px;gap:8px;margin:13px 0}.identity label,.tokens label{display:grid;gap:3px;color:var(--clock-muted,#aaa);font-size:8px;text-transform:uppercase}.identity input,.identity select,.tokens input{min-width:0;padding:6px 7px;border:1px solid var(--clock-edge,#ffffff28);border-radius:4px;color:var(--clock-fg,#fff);background:var(--clock-panel,#111a);font:11px/1.2 inherit}.preview{display:grid;max-height:190px;min-height:120px;place-items:center;margin:0 0 12px;padding:9px;overflow:hidden;border:1px solid var(--clock-edge,#ffffff18);border-radius:7px;background:var(--clock-bg,#111)}.preview :deep(.analog){width:min(150px,38cqw,35cqh)}.preview :deep(.digital){max-width:90%;padding:16px}.preview :deep(.digits){font-size:clamp(24px,9cqw,52px)}.tokens{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:7px}.tokens input{font-family:ui-monospace,monospace;text-transform:none}@container (max-width:560px){.identity{grid-template-columns:1fr}.skin-grid{grid-template-columns:1fr}}
.tokens select{min-width:0;padding:6px 7px;border:1px solid var(--clock-edge,#ffffff28);border-radius:4px;color:var(--clock-fg,#fff);background:var(--clock-panel,#111a);font:11px/1.2 inherit}
</style>
