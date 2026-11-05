<script setup lang="ts">
// widgets/items/PermissionsTab.vue
//
// NEW (0.13.0, GEM Shell 2026-11-05, H4c-3; claude/permissions-design.md): the Properties window's Permissions tab,
// drawing the draft PropertiesWindow.vue keeps (permissionsDraft.ts): GEM Shell's footer saves it with the rest.
// The same look on Windows and Linux: "Your access", the owner, then who may use it with five words (No access,
// Read, Read & run, Read & write, Full control); what only one OS has sits under Advanced (Windows: denied rows,
// inheritance from the folder, where a folder's row applies; Linux: the mode as digits, UNTESTED).
// Inherited rows are shown, never edited here (they are its folder's: change them there).
import { computed } from 'vue'
import type { PermissionLevel } from 'gexplorer/widgets'
import { LEVELS, LEVEL_WORDS, APPLIES_TO, type PermissionsDraft, type PermRow } from './permissionsDraft'
import PrincipalPicker from './PrincipalPicker.vue'

const props = defineProps<{ d: PermissionsDraft; isDir: boolean }>()
const {
  perms, loadError, loading, busy, canEdit, features, inherited, allowRows, denyRows, owner, inherit, mode,
  modeDirty, modeValid, picker, openPicker, setLevel, setAppliesTo, removeRow,
} = props.d

const inheritedAllow = computed(() => inherited.value.filter(e => !e.deny))
const inheritedDeny = computed(() => inherited.value.filter(e => e.deny))
const anyDeny = computed(() => denyRows.value.length > 0 || inheritedDeny.value.length > 0)
/** The rows follow a typed mode once it changed (Linux): one or the other is sent. */
const rowsLocked = computed(() => busy.value || modeDirty.value)
const showAdvanced = computed(() => !!features.value && (features.value.deny || features.value.inheritance || features.value.unixBits || (props.isDir && canEdit.value)))
const inheritShown = computed(() => inherit.value ?? perms.value?.inherits ?? false)

function levelsFor(row: PermRow): { id: PermissionLevel; label: string; hint: string }[] {
  return row.orig === 'special' ? [...LEVELS, { id: 'special', label: 'Special', hint: 'A mix of rights none of the words say: kept as it is' }] : LEVELS
}
function onLevel(row: PermRow, ev: Event): void {
  setLevel(row, (ev.target as HTMLSelectElement).value as PermissionLevel)
}
function onApplies(row: PermRow, ev: Event): void {
  setAppliesTo(row, (ev.target as HTMLSelectElement).value)
}
function appliesWord(id: string): string {
  return APPLIES_TO.find(a => a.id === id)?.label ?? 'Custom'
}
function onInherit(ev: Event): void {
  const on = (ev.target as HTMLInputElement).checked
  inherit.value = on === perms.value?.inherits ? null : on
}

const readOnlyWhy = computed(() => {
  if (!perms.value?.features.supported) return null
  if (!canEdit.value) return 'This widget may only read them (GEM Shell too old, or no Permissions capability).'
  return null
})
</script>

<template>
  <section class="ipt">
    <p v-if="loading && !perms" class="ipw-note">Reading…</p>
    <p v-else-if="loadError" class="ipw-error">{{ loadError }}</p>
    <p v-else-if="perms && !perms.features.supported" class="ipw-note">This drive doesn't keep permissions (everyone who can use the drive can use its files).</p>

    <template v-else-if="perms">
      <dl class="ipw-rows">
        <dt>Your access</dt>
        <dd class="ipw-strong">{{ perms.yourAccess ? LEVEL_WORDS[perms.yourAccess] : 'Not known' }}</dd>
        <dt>Owner</dt>
        <dd class="ipt-line">
          <span v-if="owner" class="ipt-changed" :title="owner.id">{{ owner.name }} <span class="ipw-muted">(was {{ perms.owner?.name ?? 'unknown' }})</span></span>
          <span v-else :title="perms.owner?.id ?? ''">{{ perms.owner?.name ?? 'Unknown' }}</span>
          <button v-if="canEdit && features?.changeOwner && picker !== 'owner'" type="button" class="ipw-btn" :disabled="busy" @click="openPicker('owner')">Change…</button>
        </dd>
        <template v-if="perms.group"><dt>Group</dt><dd>{{ perms.group.name }}</dd></template>
      </dl>
      <PrincipalPicker v-if="picker === 'owner'" :d="d" />

      <h3>Who may use it</h3>
      <table class="ipw-acl ipt-acl">
        <tbody>
          <tr v-for="r in allowRows" :key="r.key">
            <td :title="r.who.id">{{ r.who.name }}</td>
            <td class="ipt-level">
              <select v-if="canEdit" :value="r.level" :disabled="rowsLocked" @change="onLevel(r, $event)">
                <option v-for="l in levelsFor(r)" :key="l.id" :value="l.id" :title="l.hint">{{ l.label }}</option>
              </select>
              <span v-else>{{ LEVEL_WORDS[r.level] }}</span>
            </td>
            <td class="ipt-x">
              <button v-if="canEdit && features?.addPrincipals" type="button" class="ipt-del" :disabled="rowsLocked"
                      :title="`Remove ${r.who.name}`" @click="removeRow(r)">×</button>
            </td>
          </tr>
          <tr v-for="(e, i) in inheritedAllow" :key="`i${i}`" class="ipt-inh">
            <td :title="e.who.id">{{ e.who.name }}</td>
            <td>{{ LEVEL_WORDS[e.level] }}</td>
            <td class="ipw-muted" title="Its folder's: change it there">inherited</td>
          </tr>
          <tr v-if="!allowRows.length && !inheritedAllow.length"><td colspan="3" class="ipw-muted">No one.</td></tr>
        </tbody>
      </table>
      <div v-if="canEdit && features?.addPrincipals && picker !== 'allow'" class="ipt-bar">
        <button type="button" class="ipw-btn" :disabled="rowsLocked" @click="openPicker('allow')">Add a person or group…</button>
      </div>
      <PrincipalPicker v-if="picker === 'allow'" :d="d" />
      <p v-if="anyDeny" class="ipw-note">Some access is denied: see Advanced.</p>
      <p v-if="modeDirty" class="ipw-note">The mode typed under Advanced is saved instead of these rows.</p>

      <details v-if="showAdvanced" class="ipt-adv" :open="anyDeny || modeDirty || picker === 'deny'">
        <summary>Advanced</summary>

        <label v-if="features?.inheritance" class="ipw-check" title="Off: the folder's rows are copied here and no longer follow the folder">
          <input type="checkbox" :checked="inheritShown" :disabled="!canEdit || busy" @change="onInherit" />
          Include the permissions of its folder
        </label>

        <template v-if="features?.deny">
          <h4>Denied</h4>
          <table class="ipw-acl ipt-acl">
            <tbody>
              <tr v-for="r in denyRows" :key="r.key" class="deny">
                <td :title="r.who.id">{{ r.who.name }}</td>
                <td class="ipt-level">
                  <select v-if="canEdit" :value="r.level" :disabled="rowsLocked" @change="onLevel(r, $event)">
                    <option v-for="l in levelsFor(r).filter(x => x.id !== 'none')" :key="l.id" :value="l.id" :title="l.hint">{{ l.label }}</option>
                  </select>
                  <span v-else>{{ LEVEL_WORDS[r.level] }}</span>
                </td>
                <td class="ipt-x">
                  <button v-if="canEdit" type="button" class="ipt-del" :disabled="rowsLocked" :title="`Remove ${r.who.name}`" @click="removeRow(r)">×</button>
                </td>
              </tr>
              <tr v-for="(e, i) in inheritedDeny" :key="`d${i}`" class="deny ipt-inh">
                <td :title="e.who.id">{{ e.who.name }}</td>
                <td>{{ LEVEL_WORDS[e.level] }}</td>
                <td class="ipw-muted">inherited</td>
              </tr>
              <tr v-if="!anyDeny"><td colspan="3" class="ipw-muted">No one is denied.</td></tr>
            </tbody>
          </table>
          <p class="ipw-muted">A denied right wins over an allowed one.</p>
          <div v-if="canEdit && picker !== 'deny'" class="ipt-bar">
            <button type="button" class="ipw-btn" :disabled="rowsLocked" @click="openPicker('deny')">Deny a person or group…</button>
          </div>
          <PrincipalPicker v-if="picker === 'deny'" :d="d" />
        </template>

        <template v-if="isDir && canEdit && features?.inheritance && (allowRows.length || denyRows.length)">
          <h4>Where each row applies</h4>
          <dl class="ipw-rows">
            <template v-for="r in [...allowRows, ...denyRows]" :key="`a${r.key}`">
              <dt :title="r.who.id">{{ r.deny ? 'Denied: ' : '' }}{{ r.who.name }}</dt>
              <dd>
                <select :value="r.appliesTo" :disabled="rowsLocked" @change="onApplies(r, $event)">
                  <option v-for="a in APPLIES_TO" :key="a.id" :value="a.id">{{ a.label }}</option>
                  <option v-if="r.appliesTo === 'custom'" value="custom">Custom (kept as it is)</option>
                </select>
              </dd>
            </template>
          </dl>
        </template>
        <p v-else-if="isDir && !canEdit && (allowRows.length || denyRows.length) && features?.inheritance" class="ipw-muted">
          Applies to: {{ [...allowRows, ...denyRows].map(r => `${r.who.name}: ${appliesWord(r.appliesTo)}`).join('; ') }}
        </p>

        <!-- Linux (UNTESTED until the Linux port): the whole mode as digits, e.g. 0755 -->
        <label v-if="features?.unixBits" class="ipt-mode">
          <span>Mode</span>
          <input v-model="mode" type="text" inputmode="numeric" maxlength="4" spellcheck="false" :disabled="!canEdit || busy" placeholder="0755" />
          <span v-if="modeDirty && !modeValid" class="ipw-error">3 or 4 digits from 0 to 7</span>
        </label>
      </details>

      <p v-if="readOnlyWhy" class="ipw-muted">{{ readOnlyWhy }}</p>
    </template>
  </section>
</template>

<style scoped>
.ipt { display: flex; flex-direction: column; gap: 6px; }
.ipt h3 { margin: 4px 0 0; color: color-mix(in oklab, var(--fg, #e8e8e8) 62%, transparent); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.ipt h4 { margin: 6px 0 0; color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); font-size: 11px; font-weight: 600; }
.ipt p { margin: 0; }
.ipw-note, .ipw-muted { color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); font-size: 11px; }
.ipw-error { color: #f87171; font-size: 11px; }
.ipw-strong { font-weight: 600; }
.ipw-rows { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; align-items: center; }
.ipw-rows dt { color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipw-rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.ipt-line { display: flex; align-items: center; gap: 6px; }
.ipt-changed { font-weight: 600; }
.ipw-acl { width: 100%; border-collapse: collapse; font-size: 11px; }
.ipw-acl td { padding: 2px 6px 2px 0; border-top: 1px solid var(--items-border, #ffffff14); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipw-acl tr.deny td { color: #fca5a5; }
.ipt-acl .ipt-level { width: 1%; }
.ipt-acl .ipt-x { width: 1%; text-align: right; }
.ipt-inh td { opacity: .7; }
.ipt select, .ipt-mode input {
  padding: 1px 4px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: var(--panel-bg, #1e1e1e); color: inherit; font-size: 11px;
}
.ipt-del {
  padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: inherit; font-size: 14px; line-height: 18px; cursor: pointer; opacity: .7;
}
.ipt-del:hover:not(:disabled) { opacity: 1; background: color-mix(in oklab, #f87171 25%, transparent); }
.ipt-bar { display: flex; gap: 6px; }
.ipt-adv > summary { cursor: pointer; color: color-mix(in oklab, var(--fg, #e8e8e8) 70%, transparent); font-size: 11px; font-weight: 600; margin-top: 4px; }
.ipt-adv[open] > summary { margin-bottom: 4px; }
.ipt-adv > :not(summary) + :not(summary) { margin-top: 8px; }
.ipt-adv > label { display: flex; }
.ipw-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.ipw-check input { margin: 0; accent-color: var(--accent, #4ea1ff); }
.ipt-mode { display: flex; align-items: center; gap: 8px; }
.ipt-mode > span:first-child { color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); }
.ipt-mode input { width: 5em; font-family: Consolas, 'Cascadia Mono', monospace; }
.ipw-btn {
  flex: 0 0 auto; padding: 2px 8px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: color-mix(in oklab, var(--fg, #fff) 6%, transparent); color: inherit; font-size: 11px; cursor: pointer;
}
.ipw-btn:hover:not(:disabled) { background: color-mix(in oklab, var(--fg, #fff) 12%, transparent); }
.ipw-btn:disabled, .ipt-del:disabled { opacity: .45; cursor: default; }
</style>
