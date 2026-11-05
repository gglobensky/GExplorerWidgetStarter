<script setup lang="ts">
// widgets/items/PermissionsTab.vue
//
// NEW (0.13.0, GEM Shell 2026-11-05, H4c-3; claude/permissions-design.md): the Properties window's Permissions tab,
// drawing the draft PropertiesWindow.vue keeps (permissionsDraft.ts): GEM Shell's footer saves it with the rest.
// The same look on Windows and Linux: "Your access", the owner, then who may use it with five words (No access,
// Read, Read & run, Read & write, Full control); what only one OS has sits under Advanced (Windows: denied rows,
// inheritance from the folder, where a folder's row applies; Linux: the mode as digits, UNTESTED).
// Inherited rows are shown, never edited here (they are its folder's: change them there).
// 0.13.1 (H4c-4), so the window needs no scrollbar: People and Advanced are two views (never stacked); the picker
// takes the tab's place while open; long lists scroll inside themselves (about 6 rows). Closing the picker gives
// the focus back to the tab (Escape again closes the window). A part the OS refused at Save (the owner) shows why,
// with its own Undo.
// 0.13.2 (H4c-5): People lists allowed rows and "No access" rows (Windows writes "No access" as a row denying
// everything: infoNote says so when it happens); Advanced → Denied lists the partly denied rows. An inherited row
// this item's "No access" overrules is struck through.
// 0.14.0 (H4c-6): ONE LINE PER PERSON (the draft's `lines`, from GEM Shell's `people`): their real access, where it
// comes from (its folder / here / lowered here / No access here), every line editable (the folder's too: GEM Shell
// writes the rows it takes); × puts their access back to the folder's. "Add or edit…": someone already listed is
// focused and flashed. Older GEM Shell (no `people`): the rows, read-only.
import { computed, ref, watch, nextTick } from 'vue'
import type { PermissionLevel, FsPrincipal } from 'gexplorer/widgets'
import { LEVELS, LEVEL_WORDS, APPLIES_TO, type PermissionsDraft, type PermRow } from './permissionsDraft'
import PrincipalPicker from './PrincipalPicker.vue'

const props = defineProps<{ d: PermissionsDraft; isDir: boolean }>()
const {
  perms, loadError, loading, busy, checking, editNote, infoNote, failedPart, rev, view, canEdit, features,
  allowRows, denyRows, deniedRows, inheritedDenied, hasPeople, lines, focusId, inherited,
  owner, inherit, mode, modeDirty, modeValid, picker,
  openPicker, setLevel, setPerson, resetPerson, setAppliesTo, removeRow, setInherit, commitMode, undoOwner,
} = props.d

// 0.14.0: the line the picker found takes the focus (after the picker's own focus return), flashed a moment
const flashId = ref<string | null>(null)
watch(focusId, id => {
  if (!id) return
  void nextTick(() => {
    const el = root.value?.querySelector<HTMLElement>(`[data-pid="${CSS.escape(id)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
    el?.focus({ preventScroll: true })
    flashId.value = id
    setTimeout(() => { if (flashId.value === id) flashId.value = null }, 1500)
    focusId.value = null
  })
})
const PERSON_LEVELS = LEVELS
function onPerson(who: FsPrincipal, ev: Event): void {
  void setPerson(who, (ev.target as HTMLSelectElement).value as PermissionLevel)
}

const root = ref<HTMLElement | null>(null)
// The picker closed (picked, Cancel, Escape): the focus comes back here, so the next Escape reaches the window
watch(picker, (now, before) => {
  if (before && !now) void nextTick(() => root.value?.focus({ preventScroll: true }))
})

/** Partly denied rows (Advanced); "No access" rows are under People. */
const anyDeny = computed(() => deniedRows.value.length > 0 || inheritedDenied.value.length > 0)
/** The rows follow a typed mode once it changed (Linux): one or the other is sent. */
const rowsLocked = computed(() => busy.value || checking.value || modeDirty.value)
const locked = computed(() => busy.value || checking.value)
const showAdvanced = computed(() => !!features.value && (features.value.deny || features.value.inheritance || features.value.unixBits))
const inheritShown = computed(() => inherit.value ?? perms.value?.inherits ?? false)
// Advanced isn't offered on this drive: People
watch(showAdvanced, on => { if (!on) view.value = 'people' })

function showView(v: 'people' | 'advanced'): void {
  view.value = v
}

function levelsFor(row: PermRow): { id: PermissionLevel; label: string; hint: string }[] {
  return row.orig === 'special' ? [...LEVELS, { id: 'special', label: 'Special', hint: 'A mix of rights none of the words say: kept as it is' }] : LEVELS
}
function onLevel(row: PermRow, ev: Event): void {
  void setLevel(row, (ev.target as HTMLSelectElement).value as PermissionLevel)
}
function onApplies(row: PermRow, ev: Event): void {
  void setAppliesTo(row, (ev.target as HTMLSelectElement).value)
}
function appliesWord(id: string): string {
  return APPLIES_TO.find(a => a.id === id)?.label ?? 'Custom'
}
function onInherit(ev: Event): void {
  void setInherit((ev.target as HTMLInputElement).checked)
}

const readOnlyWhy = computed(() => {
  if (!perms.value?.features.supported) return null
  if (!canEdit.value) return 'This widget may only read them (GEM Shell too old, or no Permissions capability).'
  return null
})
</script>

<template>
  <section ref="root" class="ipt" tabindex="-1">
    <p v-if="loading && !perms" class="ipw-note">Reading…</p>
    <p v-else-if="loadError" class="ipw-error">{{ loadError }}</p>
    <p v-else-if="perms && !perms.features.supported" class="ipw-note">This drive doesn't keep permissions (everyone who can use the drive can use its files).</p>

    <!-- The picker takes the tab's place while open -->
    <PrincipalPicker v-else-if="perms && picker" :d="d" />

    <template v-else-if="perms">
      <div v-if="showAdvanced" class="ipt-views" role="tablist" aria-label="Permissions views">
        <button type="button" role="tab" class="ipt-view" :class="{ on: view === 'people' }" :aria-selected="view === 'people'" @click="showView('people')">People</button>
        <button type="button" role="tab" class="ipt-view" :class="{ on: view === 'advanced' }" :aria-selected="view === 'advanced'" @click="showView('advanced')">
          Advanced<span v-if="anyDeny || modeDirty" class="ipt-dot" aria-hidden="true">•</span>
        </button>
      </div>

      <!-- ── People ─────────────────────────────────────────────────────── -->
      <template v-if="view === 'people'">
        <dl class="ipw-rows">
          <dt>Your access</dt>
          <dd class="ipw-strong">{{ perms.yourAccess ? LEVEL_WORDS[perms.yourAccess] : 'Not known' }}</dd>
          <dt>Owner</dt>
          <dd class="ipt-line">
            <span v-if="owner" class="ipt-changed" :title="owner.id">{{ owner.name }} <span class="ipw-muted">(was {{ perms.owner?.name ?? 'unknown' }})</span></span>
            <span v-else :title="perms.owner?.id ?? ''">{{ perms.owner?.name ?? 'Unknown' }}</span>
            <button v-if="canEdit && features?.changeOwner" type="button" class="ipw-btn" :disabled="locked" @click="openPicker('owner')">Change…</button>
          </dd>
          <template v-if="perms.group"><dt>Group</dt><dd>{{ perms.group.name }}</dd></template>
        </dl>
        <p v-if="failedPart === 'owner' && owner" class="ipw-error ipt-line">
          <span>Windows doesn't let {{ owner.name }} own it here (administrator rights were not used).</span>
          <button type="button" class="ipw-btn" @click="undoOwner">Undo</button>
        </p>

        <h3>Who may use it</h3>
        <div class="ipt-list">
          <table class="ipw-acl ipt-acl">
            <tbody v-if="hasPeople">
              <tr v-for="l in lines" :key="`${l.who.id}:${rev}`"
                  :class="{ deny: l.level === 'none', 'ipt-changed-row': l.changed, 'ipt-flash': flashId === l.who.id, 'ipt-removed': l.removed }">
                <td :title="l.who.id">
                  {{ l.who.name }}
                  <span v-if="l.source" class="ipt-src">{{ l.source }}</span>
                </td>
                <td class="ipt-level">
                  <select v-if="canEdit && !l.removed" :value="l.level" :data-pid="l.who.id" :disabled="rowsLocked" @change="onPerson(l.who, $event)">
                    <option v-for="lv in PERSON_LEVELS" :key="lv.id" :value="lv.id" :title="lv.hint">{{ lv.label }}</option>
                    <option v-if="l.level === 'special'" value="special" disabled>Special (kept until changed)</option>
                  </select>
                  <span v-else>{{ LEVEL_WORDS[l.level] }}</span>
                </td>
                <td class="ipt-x">
                  <button v-if="canEdit && l.removable" type="button" class="ipt-del" :disabled="rowsLocked"
                          :title="l.fromFolder ? `Back to what its folder gives ${l.who.name} (${LEVEL_WORDS[l.fromFolder]})` : `Remove ${l.who.name}`"
                          @click="resetPerson(l.who)">×</button>
                </td>
              </tr>
              <tr v-if="!lines.length"><td colspan="3" class="ipw-muted">No one.</td></tr>
            </tbody>
            <!-- Older GEM Shell (no one-line-per-person model): the rows, read-only -->
            <tbody v-else>
              <tr v-for="r in allowRows" :key="r.key"><td :title="r.who.id">{{ r.who.name }}</td><td>{{ LEVEL_WORDS[r.level] }}</td><td></td></tr>
              <tr v-for="(e, i) in inherited.filter(x => !x.deny)" :key="`i${i}`" class="ipt-inh">
                <td :title="e.who.id">{{ e.who.name }}</td><td>{{ LEVEL_WORDS[e.level] }}</td><td class="ipw-muted">inherited</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="canEdit && hasPeople && features?.addPrincipals" class="ipt-bar">
          <button type="button" class="ipw-btn" :disabled="rowsLocked" @click="openPicker('allow')">Add or edit a person or group…</button>
        </div>
        <p v-if="!hasPeople && canEdit" class="ipw-muted">Editing who may use it needs a newer GEM Shell.</p>
        <p v-if="anyDeny" class="ipw-note">Some access is denied: <button type="button" class="ipt-link" @click="showView('advanced')">see Advanced</button>.</p>
        <p v-if="modeDirty" class="ipw-note">The mode typed under Advanced is saved instead of these rows.</p>
        <p v-if="infoNote" class="ipt-info">{{ infoNote }}</p>
      </template>

      <!-- ── Advanced ───────────────────────────────────────────────────── -->
      <template v-else>
        <label v-if="features?.inheritance" class="ipw-check" title="Off: the folder's rows are copied here and no longer follow the folder">
          <input :key="rev" type="checkbox" :checked="inheritShown" :disabled="!canEdit || locked" @change="onInherit" />
          Include the permissions of its folder
        </label>

        <template v-if="features?.deny">
          <h4>Partly denied <span class="ipw-muted">(a denied right wins; "No access" is under People)</span></h4>
          <div class="ipt-list ipt-list--short">
            <table class="ipw-acl ipt-acl">
              <tbody>
                <tr v-for="r in deniedRows" :key="r.key" class="deny">
                  <td :title="r.who.id">{{ r.who.name }}</td>
                  <td class="ipt-level">
                    <select v-if="canEdit" :value="r.level" :disabled="rowsLocked" @change="onLevel(r, $event)">
                      <option v-for="l in levelsFor(r).filter(x => x.id !== 'none' && x.id !== 'full')" :key="l.id" :value="l.id" :title="l.hint">{{ l.label }}</option>
                    </select>
                    <span v-else>{{ LEVEL_WORDS[r.level] }}</span>
                  </td>
                  <td class="ipt-x">
                    <button v-if="canEdit" type="button" class="ipt-del" :disabled="rowsLocked" :title="`Remove ${r.who.name}`" @click="removeRow(r)">×</button>
                  </td>
                </tr>
                <tr v-for="(e, i) in inheritedDenied" :key="`d${i}`" class="deny ipt-inh">
                  <td :title="e.who.id">{{ e.who.name }}</td>
                  <td>{{ LEVEL_WORDS[e.level] }}</td>
                  <td class="ipw-muted">inherited</td>
                </tr>
                <tr v-if="!anyDeny"><td colspan="3" class="ipw-muted">No one is denied.</td></tr>
              </tbody>
            </table>
          </div>
          <div v-if="canEdit" class="ipt-bar">
            <button type="button" class="ipw-btn" :disabled="rowsLocked" @click="openPicker('deny')">Deny a person or group…</button>
          </div>
        </template>

        <template v-if="isDir && features?.inheritance && (allowRows.length || denyRows.length)">
          <h4>Where each row applies</h4>
          <div v-if="canEdit" class="ipt-list ipt-list--short">
            <dl class="ipw-rows">
              <template v-for="r in [...allowRows, ...denyRows]" :key="`a${r.key}`">
                <dt :title="r.who.id">{{ r.deny ? (r.level === 'full' ? 'No access: ' : 'Denied: ') : '' }}{{ r.who.name }}</dt>
                <dd>
                  <select :value="r.appliesTo" :disabled="rowsLocked" @change="onApplies(r, $event)">
                    <option v-for="a in APPLIES_TO" :key="a.id" :value="a.id">{{ a.label }}</option>
                    <option v-if="r.appliesTo === 'custom'" value="custom">Custom (kept as it is)</option>
                  </select>
                </dd>
              </template>
            </dl>
          </div>
          <p v-else class="ipw-muted">
            {{ [...allowRows, ...denyRows].map(r => `${r.who.name}: ${appliesWord(r.appliesTo)}`).join('; ') }}
          </p>
        </template>

        <!-- Linux (UNTESTED until the Linux port): the whole mode as digits, e.g. 0755 -->
        <label v-if="features?.unixBits" class="ipt-mode">
          <span>Mode</span>
          <input v-model="mode" type="text" inputmode="numeric" maxlength="4" spellcheck="false" :disabled="!canEdit || locked" placeholder="0755"
                 @change="commitMode" />
          <span v-if="modeDirty && !modeValid" class="ipw-error">3 or 4 digits from 0 to 7</span>
        </label>
      </template>

      <p v-if="checking" class="ipw-muted">Waiting for your answer…</p>
      <p v-if="editNote" class="ipw-error">{{ editNote }}</p>
      <p v-if="readOnlyWhy" class="ipw-muted">{{ readOnlyWhy }}</p>
    </template>
  </section>
</template>

<style scoped>
.ipt { display: flex; flex-direction: column; gap: 6px; outline: none; }
.ipt h3 { margin: 4px 0 0; color: color-mix(in oklab, var(--fg, #e8e8e8) 62%, transparent); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.ipt h4 { margin: 6px 0 0; color: color-mix(in oklab, var(--fg, #e8e8e8) 70%, transparent); font-size: 11px; font-weight: 600; }
.ipt h4 .ipw-muted { font-weight: 400; }
.ipt p { margin: 0; }
.ipw-note, .ipw-muted { color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); font-size: 11px; }
.ipw-error { color: #f87171; font-size: 11px; }
.ipw-strong { font-weight: 600; }
.ipw-rows { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; align-items: center; }
.ipw-rows dt { color: color-mix(in oklab, var(--fg, #e8e8e8) 55%, transparent); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipw-rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.ipt-line { display: flex; align-items: center; gap: 6px; }
.ipt-changed { font-weight: 600; }
/* People / Advanced */
.ipt-views { display: inline-flex; align-self: flex-start; padding: 2px; border: 1px solid var(--items-border, #ffffff24); border-radius: 6px; }
.ipt-view { padding: 2px 10px; border: 0; border-radius: 4px; background: transparent; color: inherit; font-size: 11px; cursor: pointer; opacity: .7; }
.ipt-view:hover { opacity: 1; }
.ipt-view.on { opacity: 1; background: color-mix(in oklab, var(--accent, #4ea1ff) 30%, transparent); font-weight: 600; }
.ipt-dot { margin-left: 4px; color: #fca5a5; }
/* Lists scroll inside themselves: the window doesn't */
.ipt-list { max-height: 140px; overflow-y: auto; scrollbar-width: thin; }
.ipt-list--short { max-height: 104px; }
.ipw-acl { width: 100%; border-collapse: collapse; font-size: 11px; }
.ipw-acl td { padding: 2px 6px 2px 0; border-top: 1px solid var(--items-border, #ffffff14); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ipw-acl tr.deny td { color: #fca5a5; }
.ipt-acl .ipt-level { width: 1%; }
.ipt-acl .ipt-x { width: 1%; text-align: right; }
.ipt-inh td { opacity: .7; }
.ipt-src { margin-left: 6px; color: color-mix(in oklab, var(--fg, #e8e8e8) 50%, transparent); font-size: 10px; }
.ipt-changed-row td:first-child { font-weight: 600; }
.ipt-removed td { text-decoration: line-through; opacity: .6; }
.ipt-flash td { background: color-mix(in oklab, var(--accent, #4ea1ff) 22%, transparent); transition: background .3s; }
@media (prefers-reduced-motion: reduce) { .ipt-flash td { transition: none; } }
.ipt-info { padding: 4px 6px; border-left: 2px solid var(--accent, #4ea1ff); background: color-mix(in oklab, var(--accent, #4ea1ff) 10%, transparent); font-size: 11px; }
.ipt select, .ipt-mode input {
  padding: 1px 4px; border: 1px solid var(--items-border, #ffffff24); border-radius: 4px;
  background: var(--panel-bg, #1e1e1e); color: inherit; font-size: 11px;
}
.ipt-del {
  padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: inherit; font-size: 14px; line-height: 18px; cursor: pointer; opacity: .7;
}
.ipt-del:hover:not(:disabled) { opacity: 1; background: color-mix(in oklab, #f87171 25%, transparent); }
.ipt-bar { display: flex; gap: 6px; }
.ipt-link { padding: 0; border: 0; background: none; color: var(--accent, #4ea1ff); font: inherit; text-decoration: underline; cursor: pointer; }
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
