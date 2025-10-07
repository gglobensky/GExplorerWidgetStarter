<script setup lang="ts">
import { ref, computed, onMounted } from '/src/runtime/vue.ts'
import { fsListDir, fsValidate } from '/src/bridge/ipc.ts'

type HostAction = { type: 'nav'; to: string } | { type: 'openUrl'; url: string }

const props = defineProps<{
  config?: { data?: Record<string, any>; view?: Record<string, any> }
  theme?: Record<string, any>
  runAction?: (a: HostAction) => void
}>()

const cfg = computed(() => ({
  data: props.config?.data || {},
  view: props.config?.view || {}
}))

const cwd = ref<string>(String(cfg.value.data.rpath || ''))
const entries = ref<Array<{ name: string; fullPath: string }>>([])
const loading = ref(false)
const error = ref<string>('')

async function loadDir(path: string) {
  if (!path) { entries.value = []; return }
  loading.value = true; error.value = ''
  try {
    const res = await fsListDir(path)
    entries.value = res?.ok ? (res.entries || []) : []
  } catch (e: any) {
    error.value = String(e?.message || e || 'Error')
  } finally { loading.value = false }
}

async function open(fullPath: string) {
  const v = await fsValidate(fullPath)
  if (v?.isDir) {
    if (cfg.value.view.navigateMode === 'tab') props.runAction?.({ type: 'nav', to: fullPath })
    else { cwd.value = fullPath; await loadDir(fullPath) }
  } else {
    // future: props.runAction?.({ type: 'openFile', path: fullPath })
  }
}

onMounted(() => { if (cwd.value) loadDir(cwd.value) })
</script>

<template>
  <div class="wrap">
    <div class="hdr">{{ cwd || '(no path)' }}</div>

    <div v-if="loading" class="msg">Loading…</div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <div v-else class="grid">
      <div v-for="e in entries" :key="e.fullPath" class="card" :title="e.fullPath" @click="open(e.fullPath)">
        <div class="icon">📁</div>
        <div class="name">{{ e.name }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap { padding: 10px; }
.hdr { padding: 6px 4px; font-weight: 600; opacity: .9; }
.msg { padding: 12px; opacity: .8; }
.err { padding: 12px; color: #f77; }
.grid { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0,1fr)); }
.card {
  cursor: pointer; padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--border, #555); background: var(--surface-2, transparent);
  display: flex; gap: 10px; align-items: center;
}
.icon { width: 1.4em; text-align: center; font-size: 1.2em; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
