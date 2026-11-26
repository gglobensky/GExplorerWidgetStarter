<script setup lang="ts">
// The compact players' list tabs (CompactTiles in the sidebar, ToolbarPanel in the toolbar): Up next, Queue (while
// YouTube has one, with its count) and Description.
import type { ListTab } from './listTabs'

defineProps<{ tab: ListTab; queue?: string | null }>()
const emit = defineEmits<{ select: [tab: ListTab] }>()
</script>

<template>
  <div class="tabs" role="tablist">
    <button class="tab" :class="{ on: tab === 'upNext' }" role="tab" :aria-selected="tab === 'upNext'" @click="emit('select', 'upNext')">Up next</button>
    <button v-if="queue" class="tab" :class="{ on: tab === 'queue' }" role="tab" :aria-selected="tab === 'queue'" @click="emit('select', 'queue')">
      Queue<span class="count">{{ queue }}</span>
    </button>
    <button class="tab" :class="{ on: tab === 'description' }" role="tab" :aria-selected="tab === 'description'"
            v-gex-tooltip="{ content: 'Description', detail: 'The channel, Subscribe, likes and the video’s description' }"
            @click="emit('select', 'description')">Description</button>
  </div>
</template>

<style scoped>
.tabs { display: flex; flex: 0 1 auto; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.tab { flex: 0 0 auto; height: 22px; padding: 0 9px; border: 0; border-radius: 6px 6px 0 0; color: var(--gex-fg-muted, #a6a9b1); background: transparent;
  font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; cursor: pointer; }
.tab:hover { color: var(--gex-fg, #e9eaee); }
.tab.on { color: var(--gex-fg, #e9eaee); background: var(--gex-surface, #16171b); box-shadow: inset 0 -2px 0 var(--gex-accent, #ff4545); }
.count { margin-left: 5px; color: var(--gex-fg-muted, #a6a9b1); font-weight: 500; }
</style>
