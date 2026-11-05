<script setup lang="ts">
// widgets/items/PrincipalPicker.vue
//
// NEW (0.13.0, GEM Shell 2026-11-05, H4c-3): people and groups by name, for the Permissions tab (a new owner, an
// allowed or a denied row). Opened by a click (openPicker): its first search asks for the Permissions grant once
// and lists the well-known ones (Everyone, Users, Administrators, SYSTEM...); typing searches this computer, then
// the domain when the PC is joined (it may not answer in time: said, and "DOMAIN\name" still works through
// "Use the name typed"). Enter: the name typed; Escape: closes the picker only.
import { ref, onMounted } from 'vue'
import type { FsPrincipal } from 'gexplorer/widgets'
import type { PermissionsDraft } from './permissionsDraft'

const props = defineProps<{ d: PermissionsDraft }>()
const { picker, query, found, searching, unreachable, pickerNote, closePicker, pick, useTyped } = props.d

const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())

const TITLES = { owner: 'Choose the new owner', allow: 'Give access to', deny: 'Deny access to' } as const

function kindOf(p: FsPrincipal): string {
  const where = p.source === 'domain' ? 'Domain ' : ''
  return p.kind === 'group' ? `${where}group` : p.kind === 'user' ? `${where}user` : 'Built-in'
}
</script>

<template>
  <div class="ipp">
    <div class="ipp-head">
      <span>{{ picker ? TITLES[picker] : '' }}</span>
      <button type="button" class="ipw-btn" @click="closePicker">Cancel</button>
    </div>
    <input ref="input" v-model="query" class="ipp-input" type="text" spellcheck="false"
           placeholder="Type a name, or DOMAIN\name"
           @keydown.enter.prevent="useTyped" @keydown.esc.stop.prevent="closePicker" />
    <ul v-if="found.length" class="ipp-list">
      <li v-for="p in found" :key="p.id">
        <button type="button" class="ipp-item" :title="p.id" @click="pick(p)">
          <span class="ipp-name">{{ p.name }}</span><span class="ipp-kind">{{ kindOf(p) }}</span>
        </button>
      </li>
    </ul>
    <p v-if="searching" class="ipw-muted">Searching…</p>
    <p v-else-if="query.trim() && !found.length" class="ipw-muted">No one found by that name.</p>
    <p v-if="unreachable" class="ipw-note">The domain didn't answer in time: only this computer's accounts are listed. Type DOMAIN\name to use one anyway.</p>
    <p v-if="pickerNote" class="ipw-error">{{ pickerNote }}</p>
    <button v-if="query.trim()" type="button" class="ipw-btn ipp-typed" :disabled="searching" @click="useTyped">Use "{{ query.trim() }}"</button>
  </div>
</template>

<style scoped>
.ipp {
  display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--items-border, #ffffff24);
  border-radius: 6px; background: color-mix(in oklab, var(--fg, #fff) 3%, transparent);
}
.ipp-head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.ipp-input {
  padding: 3px 6px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 4%, transparent); color: inherit; font-size: 12px;
}
.ipp-list { list-style: none; margin: 0; padding: 0; max-height: 132px; overflow-y: auto; }
.ipp-item {
  display: flex; width: 100%; align-items: baseline; gap: 8px; padding: 3px 6px; border: 0; border-radius: 4px;
  background: transparent; color: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.ipp-item:hover, .ipp-item:focus-visible { background: color-mix(in oklab, var(--fg, #fff) 10%, transparent); }
.ipp-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipp-kind { flex: 0 0 auto; color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); font-size: 11px; }
.ipp-typed { align-self: flex-start; }
.ipw-btn {
  flex: 0 0 auto; padding: 2px 8px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 6%, transparent); color: inherit; font-size: 11px; cursor: pointer;
}
.ipw-btn:hover { background: color-mix(in oklab, var(--fg, #fff) 12%, transparent); }
.ipw-muted, .ipw-note { margin: 0; color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); font-size: 11px; }
.ipw-error { margin: 0; color: #f87171; font-size: 11px; }
</style>
