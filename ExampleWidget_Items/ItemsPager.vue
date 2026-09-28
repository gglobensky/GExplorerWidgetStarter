<script setup lang="ts">
import { ref, watch, computed } from 'vue'

/* -----------------------------------------------
   Pager (L4) — lives in the host's pane chrome (header or overlay slot)

   [⏮][◀][ 12 / 480 ][▶][⏭]
    B   A    field    A   B

   B  jump `jump` pages; double-click goes to the first / last page. The
      single click waits out the double-click window so a double-click
      doesn't jump twice first.
   A  one page, immediately.
   Field  shows the current page; type a number + Enter. Esc or leaving the
      field restores it. ↑/↓ and the wheel step one page.
   Compact (overlay mode, not expanded): a passive "12 / 480" badge; the
   host makes it click-through.
------------------------------------------------ */
const props = defineProps<{
  page: number        // 0-based
  pageCount: number
  jump: number
  expanded: boolean
}>()

const emit = defineEmits<{ (e: 'go', page: number): void }>()

const DBL_MS = 250

const last = computed(() => Math.max(0, props.pageCount - 1))
const atStart = computed(() => props.page <= 0)
const atEnd = computed(() => props.page >= last.value)
const digits = computed(() => String(Math.max(1, props.pageCount)).length)

function go(p: number) {
  const t = Math.min(Math.max(0, Math.round(p)), last.value)
  if (t !== props.page) emit('go', t)
}

/* ---- big jumps: single click waits for a possible double-click ---- */
let jumpTimer: number | null = null
function onJump(dir: -1 | 1) {
  if (jumpTimer != null) return          // second click of a double-click
  jumpTimer = window.setTimeout(() => {
    jumpTimer = null
    go(props.page + dir * Math.max(1, props.jump))
  }, DBL_MS)
}
function onEdge(dir: -1 | 1) {
  if (jumpTimer != null) { clearTimeout(jumpTimer); jumpTimer = null }
  go(dir < 0 ? 0 : last.value)
}

/* ---- page field ---- */
const inputEl = ref<HTMLInputElement | null>(null)
const draft = ref(String(props.page + 1))
const editing = ref(false)

watch(() => props.page, (p) => { if (!editing.value) draft.value = String(p + 1) })

function commit() {
  const n = Number.parseInt(draft.value, 10)
  if (Number.isFinite(n)) go(n - 1)
  draft.value = String(Math.min(Math.max(0, (Number.isFinite(n) ? n - 1 : props.page)), last.value) + 1)
}

function onFieldKey(ev: KeyboardEvent) {
  switch (ev.key) {
    case 'Enter': ev.preventDefault(); commit(); inputEl.value?.select(); return
    case 'Escape': ev.preventDefault(); draft.value = String(props.page + 1); inputEl.value?.blur(); return
    case 'ArrowUp': ev.preventDefault(); go(props.page + 1); draft.value = String(Math.min(props.page + 1, last.value) + 1); return
    case 'ArrowDown': ev.preventDefault(); go(props.page - 1); draft.value = String(Math.max(props.page - 1, 0) + 1); return
  }
}

function onFieldWheel(ev: WheelEvent) {
  if (ev.deltaY === 0) return
  const next = props.page + (ev.deltaY < 0 ? 1 : -1)
  go(next)
  draft.value = String(Math.min(Math.max(0, next), last.value) + 1)
}

function onFocus() {
  editing.value = true
  inputEl.value?.select()
}

function onBlur() {
  editing.value = false
  draft.value = String(props.page + 1)
}

/** Focus the page field (e.g. "Go to page" shortcut). */
function focusInput() {
  inputEl.value?.focus()
  inputEl.value?.select()
}

defineExpose({ focusInput })
</script>

<template>
  <div class="pager" :class="{ compact: !expanded }" role="navigation" aria-label="Pages">
    <template v-if="expanded">
      <button class="pg pg-b" type="button" :disabled="atStart"
              v-gex-tooltip="{ content: `Back ${jump} pages`, detail: 'Double-click: first page' }"
              @click="onJump(-1)" @dblclick="onEdge(-1)">
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="2" width="1.6" height="8" rx=".5" /><path d="M10 2.2v7.6L4.4 6z" /></svg>
      </button>
      <button class="pg pg-a" type="button" :disabled="atStart"
              v-gex-tooltip="'Previous page'" @click="go(page - 1)">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8.6 2.2v7.6L2.6 6z" /></svg>
      </button>

      <label class="pg-field" v-gex-tooltip="{ content: 'Page', detail: 'Type a page and press Enter · ↑/↓ or the wheel to step' }">
        <input ref="inputEl" v-model="draft" class="pg-input" type="text" inputmode="numeric"
               :style="{ width: `${digits + 1}ch` }" aria-label="Page"
               @keydown="onFieldKey" @wheel.prevent="onFieldWheel" @focus="onFocus" @blur="onBlur" />
        <span class="pg-total">/ {{ pageCount.toLocaleString() }}</span>
      </label>

      <button class="pg pg-a" type="button" :disabled="atEnd"
              v-gex-tooltip="'Next page'" @click="go(page + 1)">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.4 2.2v7.6l6-3.8z" /></svg>
      </button>
      <button class="pg pg-b" type="button" :disabled="atEnd"
              v-gex-tooltip="{ content: `Forward ${jump} pages`, detail: 'Double-click: last page' }"
              @click="onJump(1)" @dblclick="onEdge(1)">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2.2v7.6L7.6 6z" /><rect x="8.9" y="2" width="1.6" height="8" rx=".5" /></svg>
      </button>
    </template>

    <span v-else class="pg-badge">{{ (page + 1).toLocaleString() }} / {{ pageCount.toLocaleString() }}</span>
  </div>
</template>

<style scoped>
.pager {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.pg {
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border, #666);
  border-radius: 6px;
  background: var(--bg, #1b1b1b);
  color: var(--fg, #eee);
  cursor: pointer;
}

.pg svg { width: 12px; height: 12px; fill: currentColor; }
.pg-a { width: 26px; }
.pg-b { width: 20px; }
.pg-b svg { width: 11px; height: 11px; }

.pg:hover:not(:disabled) { border-color: var(--accent, #4ea1ff); }
.pg:disabled { opacity: .45; cursor: default; }

.pg-field {
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid var(--border, #666);
  border-radius: 6px;
  background: var(--bg, #1b1b1b);
  color: var(--fg, #eee);
  cursor: text;
}

.pg-field:focus-within { border-color: var(--accent, #4ea1ff); }

.pg-input {
  min-width: 2ch;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.pg-total {
  opacity: .6;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Compact: a passive badge (the host keeps it click-through) */
.pg-badge {
  padding: 1px 8px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--bg, #1b1b1b) 80%, transparent);
  border: 1px solid color-mix(in oklab, var(--border, #666) 70%, transparent);
  font-size: .85em;
  opacity: .8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>