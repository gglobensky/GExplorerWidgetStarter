// widgets/items/permissionsDraft.ts
//
// NEW (0.13.0, GEM Shell 2026-11-05, H4c-3; claude/permissions-design.md): the Properties window's Permissions tab,
// as a DRAFT kept by PropertiesWindow.vue (so switching tabs keeps it) and drawn by PermissionsTab.vue. Nothing
// changes before Save (GEM Shell's footer): save() sends ONE fsSetPermissions call, and GEM Shell itself asks before
// a risky change (your own access going down, Everyone getting write, inheritance off) and offers "Retry as
// administrator"; this file never decides those.
//   rows       the item's EXPLICIT rows (allow and deny), as wanted: sent whole (they replace the explicit ones)
//   owner      a new owner (Windows; the picker in owner mode)
//   inherit    inheritance from the folder on / off (Windows)
//   mode       the whole Unix mode typed ("0755"): sent instead of the rows when it changed (Linux, UNTESTED)
// The same words on every OS: No access / Read / Read & run / Read & write / Full control (Special: none of them,
// kept as it is until changed).
import { ref, computed, watch } from 'vue'
import type { WidgetSdk, FsPermissions, FsPrincipal, PermissionLevel, FsPermissionsChange } from 'gexplorer/widgets'

export type PermRow = {
  key: number
  who: FsPrincipal
  level: PermissionLevel
  deny: boolean
  appliesTo: string
  rights: number
  inheritanceFlags: number
  propagationFlags: number
  /** Its level when read (a Special row may go back to Special until saved). */
  orig: PermissionLevel
}

export type PickerMode = 'allow' | 'deny' | 'owner'

export const LEVELS: { id: PermissionLevel; label: string; hint: string }[] = [
  { id: 'none', label: 'No access', hint: 'Removes the row (Windows) / no bits (Unix)' },
  { id: 'read', label: 'Read', hint: 'Open it and see what is inside' },
  { id: 'readRun', label: 'Read & run', hint: 'Read, and run programs and scripts' },
  { id: 'readWrite', label: 'Read & write', hint: 'Read, run, change and delete' },
  { id: 'full', label: 'Full control', hint: 'Everything, including changing its permissions and owner' },
]
export const LEVEL_WORDS: Record<PermissionLevel, string> = {
  none: 'No access', read: 'Read', readRun: 'Read & run', readWrite: 'Read & write', full: 'Full control', special: 'Special',
}
export const APPLIES_TO: { id: string; label: string }[] = [
  { id: 'all', label: 'This folder, subfolders and files' },
  { id: 'this', label: 'This folder only' },
  { id: 'thisAndSubfolders', label: 'This folder and subfolders' },
  { id: 'thisAndFiles', label: 'This folder and files' },
  { id: 'subfoldersAndFiles', label: 'Subfolders and files only' },
  { id: 'subfolders', label: 'Subfolders only' },
  { id: 'files', label: 'Files only' },
]

const MODE_RE = /^[0-7]{3,4}$/
const normMode = (m: string | null | undefined) => (m ?? '').trim().padStart(4, '0')

let nextKey = 1

export function usePermissionsDraft(sdk: WidgetSdk, pathOf: () => string | null, isDirOf: () => boolean) {
  const perms = ref<FsPermissions | null>(null)
  const loadError = ref<string | null>(null)
  const loading = ref(false)
  const busy = ref(false)

  const rows = ref<PermRow[]>([])
  let savedRows = '[]'
  const owner = ref<FsPrincipal | null>(null)
  const inherit = ref<boolean | null>(null)
  const mode = ref('')

  const canRead = computed(() => !!sdk.fsPermissions)
  /** Older GEM Shell or no Permissions capability: a read-only view. */
  const canEdit = computed(() => !!sdk.fsSetPermissions && !!perms.value?.features.supported)
  const features = computed(() => perms.value?.features ?? null)

  const inherited = computed(() => perms.value?.entries.filter(e => e.inherited) ?? [])
  const allowRows = computed(() => rows.value.filter(r => !r.deny))
  const denyRows = computed(() => rows.value.filter(r => r.deny))

  const snapshot = (list: PermRow[]) => JSON.stringify(list.map(r => [r.who.id, r.level, r.deny, r.appliesTo, r.rights, r.inheritanceFlags, r.propagationFlags]))
  const rowsDirty = computed(() => snapshot(rows.value) !== savedRows)
  const ownerDirty = computed(() => !!owner.value && owner.value.id !== perms.value?.owner?.id)
  const inheritDirty = computed(() => inherit.value !== null && inherit.value !== perms.value?.inherits)
  const modeDirty = computed(() => !!features.value?.unixBits && normMode(mode.value) !== normMode(perms.value?.unixMode))
  const modeValid = computed(() => MODE_RE.test(mode.value.trim()))
  const dirty = computed(() => rowsDirty.value || ownerDirty.value || inheritDirty.value || modeDirty.value)

  function reset(): void {
    const p = perms.value
    rows.value = (p?.entries ?? []).filter(e => !e.inherited).map(e => ({
      key: nextKey++, who: e.who, level: e.level, deny: e.deny, appliesTo: e.appliesTo,
      rights: e.rights, inheritanceFlags: e.inheritanceFlags, propagationFlags: e.propagationFlags, orig: e.level,
    }))
    savedRows = snapshot(rows.value)
    owner.value = null
    inherit.value = null
    mode.value = p?.unixMode ?? ''
    closePicker()
  }

  async function load(): Promise<void> {
    const path = pathOf()
    if (!path || !sdk.fsPermissions) return
    loading.value = true
    try {
      perms.value = await sdk.fsPermissions(path)
      loadError.value = null
    } catch (err: any) {
      perms.value = null
      loadError.value = err?.code === 'E_NOT_FOUND' ? 'It no longer exists.' : `Couldn't read its permissions: ${err?.message ?? err}`
    } finally {
      loading.value = false
      reset()
    }
  }

  // ── Editing ────────────────────────────────────────────────────────────────
  function setLevel(row: PermRow, level: PermissionLevel): void {
    row.level = level
  }
  function setAppliesTo(row: PermRow, appliesTo: string): void {
    row.appliesTo = appliesTo
  }
  function removeRow(row: PermRow): void {
    rows.value = rows.value.filter(r => r.key !== row.key)
  }
  function addRow(who: FsPrincipal, deny: boolean): 'added' | 'listed' {
    if (rows.value.some(r => r.who.id === who.id && r.deny === deny)) return 'listed'
    rows.value = [...rows.value, {
      key: nextKey++, who, deny,
      // A new allow row starts low (Read); a new deny row denies everything (what "deny" usually means)
      level: deny ? 'full' : 'read',
      appliesTo: isDirOf() ? 'all' : 'this', rights: 0, inheritanceFlags: 0, propagationFlags: 0, orig: 'none',
    }]
    return 'added'
  }

  // ── The people and groups picker ───────────────────────────────────────────
  const picker = ref<PickerMode | null>(null)
  const query = ref('')
  const found = ref<FsPrincipal[]>([])
  const searching = ref(false)
  const unreachable = ref(false)
  const pickerNote = ref<string | null>(null)
  let searchSeq = 0
  let debounce: ReturnType<typeof setTimeout> | null = null

  async function runSearch(q: string): Promise<void> {
    const path = pathOf()
    if (!path || !sdk.searchPrincipals) return
    const seq = ++searchSeq
    searching.value = true
    try {
      const r = await sdk.searchPrincipals(q, path)
      if (seq !== searchSeq) return
      found.value = r.items
      unreachable.value = r.directoryUnreachable
      pickerNote.value = null
    } catch (err: any) {
      if (seq !== searchSeq) return
      found.value = []
      pickerNote.value = err?.code === 'E_PERMISSION' ? 'The permission was not granted: people and groups can\'t be listed.' : `Couldn't search: ${err?.message ?? err}`
    } finally {
      if (seq === searchSeq) searching.value = false
    }
  }

  /** Opened by a click: the first search asks for the Permissions grant (once), and lists the well-known ones. */
  function openPicker(m: PickerMode): void {
    picker.value = m
    query.value = ''
    found.value = []
    unreachable.value = false
    pickerNote.value = null
    void runSearch('')
  }
  function closePicker(): void {
    picker.value = null
    searchSeq++
    if (debounce) { clearTimeout(debounce); debounce = null }
    searching.value = false
  }
  watch(query, q => {
    if (!picker.value) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => { debounce = null; void runSearch(q.trim()) }, 250)
  })

  function pick(who: FsPrincipal): void {
    const m = picker.value
    if (!m) return
    if (m === 'owner') {
      owner.value = who.id === perms.value?.owner?.id ? null : who
      closePicker()
      return
    }
    if (addRow(who, m === 'deny') === 'listed') { pickerNote.value = `${who.name} is already listed.`; return }
    closePicker()
  }

  /** "DOMAIN\name", "AzureAD\name", "Everyone": the name as typed (principals:resolve). */
  async function useTyped(): Promise<void> {
    const path = pathOf()
    const name = query.value.trim()
    if (!path || !name || !sdk.resolvePrincipal) return
    searching.value = true
    try {
      const who = await sdk.resolvePrincipal(name, path)
      if (who) pick(who)
      else pickerNote.value = `No one is called "${name}" here.`
    } catch (err: any) {
      pickerNote.value = `Couldn't look it up: ${err?.message ?? err}`
    } finally {
      searching.value = false
    }
  }

  // ── Save / discard (GEM Shell's footer) ────────────────────────────────────
  function discard(): void {
    reset()
  }

  /** One fsSetPermissions call with what changed; throws (the footer shows why) and keeps the draft when it fails. */
  async function save(): Promise<void> {
    const path = pathOf()
    if (!dirty.value || !path || !sdk.fsSetPermissions) return
    const change: FsPermissionsChange = {}
    if (modeDirty.value) {
      if (!modeValid.value) throw new Error('the mode must be 3 or 4 digits from 0 to 7 (like 0755).')
      change.unixMode = parseInt(mode.value.trim(), 8)
    } else if (rowsDirty.value) {
      change.entries = rows.value.map(r => ({
        principalId: r.who.id, level: r.level, deny: r.deny, appliesTo: r.appliesTo,
        // Special rows (and "custom" applies-to) go back with the OS's own values, untouched
        rights: r.rights, inheritanceFlags: r.inheritanceFlags, propagationFlags: r.propagationFlags,
      }))
    }
    if (ownerDirty.value) change.ownerId = owner.value!.id
    if (inheritDirty.value) change.inherit = inherit.value!
    busy.value = true
    try {
      await sdk.fsSetPermissions(path, change)
    } catch (err: any) {
      const code = err?.code
      throw new Error(
        code === 'E_CANCELLED' ? 'the permissions were kept as they were.'
          : code === 'E_PERMISSION' ? 'the permission was not granted.'
          : code === 'E_ELEVATION_DECLINED' ? 'administrator rights were not given.'
          : code === 'E_ACCESS_DENIED' ? 'you may not change its permissions.'
          : String(err?.message ?? err))
    } finally {
      busy.value = false
    }
    await load()
  }

  return {
    perms, loadError, loading, busy, canRead, canEdit, features,
    rows, inherited, allowRows, denyRows, owner, inherit, mode, modeDirty, modeValid, dirty,
    load, setLevel, setAppliesTo, removeRow,
    picker, query, found, searching, unreachable, pickerNote, openPicker, closePicker, pick, useTyped,
    save, discard,
  }
}

export type PermissionsDraft = ReturnType<typeof usePermissionsDraft>
