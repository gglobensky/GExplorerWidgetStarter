<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from '/runtime/vue.js'
import { onWidgetMessage } from '/src/widgets/instances'
import { buildVfsInfo } from '/src/contextmenu/context'

// --- props/emits (copying your Items contract) ---
type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string } // might be used for folders; external URIs likely need a helper

const props = defineProps<{
  sourceId: string
  instanceId: string
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  runAction?: (a: HostAction) => void
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    size: { cols?: number; rows?: number; width?: number; height?: number }
  }
  editMode?: boolean,
}>()

const emit = defineEmits<{
  (e: 'updateConfig', config: any): void
  (e: 'event', payload: any): void
}>()

// --- config merge ---
const cfg = computed(() => ({
  data: props.config?.data ?? {},
  view: props.config?.view ?? {},
}))

const merged = computed(() => ({
  providers: (cfg.value.data.providers ?? ['steam']) as string[],
  filterText: String(cfg.value.data.filterText ?? ''),
  selectedKey: String(cfg.value.data.selectedKey ?? ''),

  layout: String(cfg.value.view.layout ?? 'grid'),
  tileSize: String(cfg.value.view.tileSize ?? 'lg'),
  sort: String(cfg.value.view.sort ?? 'recent'),
  showOnlyInstalled: !!cfg.value.view.showOnlyInstalled,
}))

function patchConfig(partial: { data?: any; view?: any }) {
  emit('updateConfig', {
    ...props.config,
    data: { ...props.config?.data, ...(partial.data ?? {}) },
    view: { ...props.config?.view, ...(partial.view ?? {}) },
  })
}

// --- mock dataset (replace with scanner store later) ---
type Game = {
  key: string            // e.g. "steam:620"
  title: string
  installed: boolean
  cover?: string
  provider: 'steam' | 'epic'
  description?: string
  storeUrl?: string      // or store route info
  installDir?: string
}

const games = ref<Game[]>([
  { key: 'steam:620', title: 'Portal 2', installed: true, provider: 'steam', description: 'A puzzle-platform game.' },
  { key: 'steam:730', title: 'Counter-Strike 2', installed: false, provider: 'steam', description: 'Competitive FPS.' },
])

const filteredGames = computed(() => {
  const q = merged.value.filterText.trim().toLowerCase()
  const prov = new Set(merged.value.providers)

  let list = games.value.filter(g => prov.has(g.provider))
  if (merged.value.showOnlyInstalled) list = list.filter(g => g.installed)
  if (q) list = list.filter(g => g.title.toLowerCase().includes(q))

  // stable sorts (don’t thrash)
  if (merged.value.sort === 'alpha') {
    list = list.slice().sort((a,b) => a.title.localeCompare(b.title))
  } else if (merged.value.sort === 'installed') {
    list = list.slice().sort((a,b) => Number(b.installed) - Number(a.installed) || a.title.localeCompare(b.title))
  }
  return list
})

const selected = computed(() => {
  const key = merged.value.selectedKey
  return filteredGames.value.find(g => g.key === key) ?? filteredGames.value[0] ?? null
})

watch(
  () => selected.value?.key,
  (k) => {
    if (!k) return
    if (merged.value.selectedKey !== k) patchConfig({ data: { selectedKey: k } })
  },
  { immediate: true }
)

// --- context menu options (same pattern as Items) ---
const contextMenuOptions = computed(() => {
  const hasSelection = !!selected.value
  return {
    widgetType: 'game-library',
    widgetId: props.sourceId,
    location: { area: (props.placement?.context ?? 'grid') as 'grid'|'sidebar' },
    target: hasSelection ? ('selection' as const) : ('background' as const),

    // vfs not super relevant here, but your builder expects something; keep it harmless:
    vfs: buildVfsInfo('home:'),

    selection: hasSelection ? [selected.value!.key] : [],
    widgetConfig: props.config
  }
})

// --- actions (placeholders) ---
// NOTE: you likely need a generic helper for external URI (steam://...).
// If you don’t already have one, this is a GREAT generic API addition:
// /src/widgets/utils/osOpenExternal.ts -> calls backend to open URI.
async function openExternal(uri: string) {
  // TODO: implement via backend (Photino) helper.
  console.log('[gamelib] openExternal:', uri)
}

async function actionPlay(g: Game) {
  // steam://rungameid/<appid>
  if (g.provider === 'steam') {
    const appid = g.key.split(':')[1]
    await openExternal(`steam://rungameid/${appid}`)
  }
}

async function actionInstall(g: Game) {
  if (g.provider === 'steam') {
    const appid = g.key.split(':')[1]
    await openExternal(`steam://install/${appid}`)
  }
}

function refresh() {
  // later: ask scanner service to refresh
  console.log('[gamelib] refresh')
  emit('event', { type: 'gamelib:refresh', payload: { sourceId: props.sourceId } })
}

// --- widget messages (same as Items pattern) ---
const offMsg = ref<null | (() => void)>(null)

onMounted(() => {
  offMsg.value = onWidgetMessage(props.sourceId, async (msg) => {
    if (msg.topic === 'gamelib:refresh') refresh()
    if (msg.topic === 'gamelib:rescan') refresh()

    // selection-scoped actions
    if (msg.topic === 'gamelib:openStore' && selected.value?.key) {
      // later: open store page (steam://store/<appid> maybe)
      console.log('[gamelib] open store for', selected.value.key)
    }
    if (msg.topic === 'gamelib:openFolder' && selected.value?.installDir) {
      props.runAction?.({ type: 'open', path: selected.value.installDir })
    }
  })
})

onBeforeUnmount(() => {
  try { offMsg.value?.(); offMsg.value = null } catch {}
})
</script>

<template>
  <div class="gamelib-root" v-context-menu="contextMenuOptions">
    <!-- Top bar (works even in fullgrid) -->
    <div class="gamelib-top" @pointerdown.stop>
      <input
        class="search"
        :value="merged.filterText"
        placeholder="Search games…"
        @input="patchConfig({ data: { filterText: ($event.target as HTMLInputElement).value } })"
      />

      <button class="pill" @click="patchConfig({ view: { showOnlyInstalled: !merged.showOnlyInstalled } })">
        {{ merged.showOnlyInstalled ? 'Installed' : 'All' }}
      </button>

      <button class="pill" @click="patchConfig({ view: { sort: merged.sort === 'recent' ? 'alpha' : 'recent' } })">
        Sort: {{ merged.sort }}
      </button>
    </div>

    <div class="gamelib-body">
      <div class="grid">
        <button
          v-for="g in filteredGames"
          :key="g.key"
          class="tile"
          :class="{ selected: g.key === selected?.key }"
          @click="patchConfig({ data: { selectedKey: g.key } })"
        >
          <div class="cover">
            <div v-if="!g.cover" class="placeholder">🎮</div>
            <img v-else :src="g.cover" />
          </div>
          <div class="title" :title="g.title">{{ g.title }}</div>
          <div class="meta">
            <span class="badge">{{ g.provider }}</span>
            <span class="badge" v-if="g.installed">installed</span>
          </div>
        </button>
      </div>

      <aside class="details" v-if="selected">
        <div class="details-title">
          <div class="h">{{ selected.title }}</div>
          <div class="sub">
            <span class="badge">{{ selected.provider }}</span>
            <span class="badge" v-if="selected.installed">Installed</span>
          </div>
        </div>

        <div class="actions">
          <button class="btn" @click="actionPlay(selected)" :disabled="!selected.installed">Play</button>
          <button class="btn" @click="actionInstall(selected)" :disabled="selected.installed">Install</button>
        </div>

        <div class="desc">
          {{ selected.description || '(no description yet)' }}
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.gamelib-root{
  height:100%;
  display:flex;
  flex-direction:column;
  gap: var(--space-sm);
  overflow:hidden;
}

.gamelib-top{
  display:flex;
  gap: var(--space-sm);
  padding: var(--space-sm);
  align-items:center;
  border: 1px solid var(--border,#555);
  border-radius: var(--radius-md);
  background: var(--surface-2,#222);
}

.search{
  flex: 1;
  min-width: 120px;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border,#555);
  background: var(--surface-1,#1a1a1a);
  color: var(--fg,#eee);
}

.pill{
  padding: var(--space-xs) var(--space-sm);
  border-radius: 999px;
  border: 1px solid var(--border,#555);
  background: var(--surface-1,#1a1a1a);
  color: var(--fg,#eee);
}

.gamelib-body{
  flex:1;
  min-height:0;
  display:grid;
  grid-template-columns: 1fr 360px;
  gap: var(--space-sm);
}

.grid{
  overflow:auto;
  padding: var(--space-xs);
  display:grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-sm);
}

.tile{
  border: 1px solid var(--border,#555);
  background: var(--surface-1,#1a1a1a);
  color: var(--fg,#eee);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  display:flex;
  flex-direction:column;
  gap: var(--space-xs);
  text-align:left;
}

.tile.selected{
  box-shadow: inset 0 0 0 2px var(--accent,#4ea1ff);
}

.cover{
  width:100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow:hidden;
  background: rgba(255,255,255,.06);
  display:flex;
  align-items:center;
  justify-content:center;
}
.placeholder{ font-size: 28px; opacity:.8; }
.cover img{ width:100%; height:100%; object-fit:cover; }

.title{
  font-weight: 650;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.meta{ display:flex; gap: 6px; flex-wrap:wrap; }
.badge{
  font-size: .85em;
  opacity: .85;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 999px;
  padding: 2px 8px;
}

.details{
  overflow:auto;
  padding: var(--space-sm);
  border: 1px solid var(--border,#555);
  border-radius: var(--radius-md);
  background: var(--surface-2,#222);
}
.details-title .h{ font-size: 1.15em; font-weight: 750; }
.details-title .sub{ margin-top: 6px; display:flex; gap: 6px; flex-wrap:wrap; opacity:.9; }

.actions{ display:flex; gap: var(--space-sm); margin: var(--space-sm) 0; }
.btn{
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border,#555);
  background: var(--surface-1,#1a1a1a);
  color: var(--fg,#eee);
}
.btn:disabled{ opacity:.45; }
</style>
