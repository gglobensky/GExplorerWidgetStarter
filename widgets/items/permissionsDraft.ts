// widgets/items/permissionsDraft.ts
//
// NEW (0.13.0, GEM Shell 2026-11-05, H4c-3; claude/permissions-design.md): the Properties window's Permissions tab,
// as a DRAFT kept by PropertiesWindow.vue (so switching tabs keeps it) and drawn by PermissionsTab.vue. Nothing
// changes before Save (GEM Shell's footer): save() sends ONE fsSetPermissions call ("Retry as administrator" is GEM
// Shell's).
// 0.13.1 (H4c-4): GEM Shell's risk question comes WHEN a choice is made (sdk.confirmPermissionChange, with the whole
// draft): "Keep them as they are" undoes that last choice only, the rest of the draft stays; Save doesn't ask again
// for what was accepted. A part the OS refused at Save (the owner) is marked (failedPart) with its own Undo.
// 0.13.2 (H4c-5): "No access" means no access on every OS. Windows adds up allowed rights (its folder's, its groups',
// this item's), so an allowed row at "No access" took nothing away: there, "No access" is written as a DENIED row
// with every right (a denied right wins), shown under People as "No access" (infoNote says so once); a partly
// denied row (Read, Read & run, Read & write) stays under Advanced. Linux: no bits, as before.
//   rows       the item's EXPLICIT rows (allow and deny), as wanted: sent whole (they replace the explicit ones)
//   owner      a new owner (Windows; the picker in owner mode; ownerChoices: who may own it without admin rights)
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
export type PermView = 'people' | 'advanced'

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

/** What one choice may be undone to (0.13.1). */
type State = { rows: PermRow[]; owner: FsPrincipal | null; inherit: boolean | null; mode: string }

export function usePermissionsDraft(sdk: WidgetSdk, pathOf: () => string | null, isDirOf: () => boolean) {
  const perms = ref<FsPermissions | null>(null)
  const loadError = ref<string | null>(null)
  const loading = ref(false)
  const busy = ref(false)
  /** 0.13.1: GEM Shell is asking about the last choice (the controls wait). */
  const checking = ref(false)
  /** 0.13.1: why the last choice was undone without the question (no grant, ...). */
  const editNote = ref<string | null>(null)
  /** 0.13.2: what a choice did behind the scenes ("No access" written as a denied row, Windows). */
  const infoNote = ref<string | null>(null)
  /** 0.13.1: the part the OS refused at the last Save ('owner'); nothing was written. */
  const failedPart = ref<'owner' | null>(null)
  /** 0.13.1: bumped when a choice is undone, so the controls show the restored values. */
  const rev = ref(0)
  const view = ref<PermView>('people')

  const rows = ref<PermRow[]>([])
  let savedRows = '[]'
  const owner = ref<FsPrincipal | null>(null)
  const inherit = ref<boolean | null>(null)
  const mode = ref('')
  /** The mode as last accepted (typing changes `mode`; leaving the field commits it). */
  let modeCommitted = ''

  const canRead = computed(() => !!sdk.fsPermissions)
  /** Older GEM Shell or no Permissions capability: a read-only view. */
  const canEdit = computed(() => !!sdk.fsSetPermissions && !!perms.value?.features.supported)
  const features = computed(() => perms.value?.features ?? null)

  const inherited = computed(() => perms.value?.entries.filter(e => e.inherited) ?? [])
  const allowRows = computed(() => rows.value.filter(r => !r.deny))
  const denyRows = computed(() => rows.value.filter(r => r.deny))
  /** 0.13.2: a row denying everything is "No access" (Windows' way to write it). */
  const isNoAccess = (r: { deny: boolean; level: PermissionLevel }) => r.deny && r.level === 'full'
  /** People: allowed rows and "No access" rows. */
  const peopleRows = computed(() => rows.value.filter(r => !r.deny || isNoAccess(r)))
  /** Advanced: the partly denied rows. */
  const deniedRows = computed(() => rows.value.filter(r => r.deny && !isNoAccess(r)))
  const inheritedPeople = computed(() => inherited.value.filter(e => !e.deny || isNoAccess(e)))
  const inheritedDenied = computed(() => inherited.value.filter(e => e.deny && !isNoAccess(e)))
  /** The level a People line shows. */
  const shownLevel = (r: { deny: boolean; level: PermissionLevel }): PermissionLevel => isNoAccess(r) ? 'none' : r.level
  /** An inherited row this item's own "No access" overrules (shown struck through). */
  const deniedHere = (principalId: string) => rows.value.some(r => isNoAccess(r) && r.who.id === principalId)

  const snapshot = (list: PermRow[]) => JSON.stringify(list.map(r => [r.who.id, r.level, r.deny, r.appliesTo, r.rights, r.inheritanceFlags, r.propagationFlags]))
  const rowsDirty = computed(() => snapshot(rows.value) !== savedRows)
  const ownerDirty = computed(() => !!owner.value && owner.value.id !== perms.value?.owner?.id)
  const inheritDirty = computed(() => inherit.value !== null && inherit.value !== perms.value?.inherits)
  const modeDirty = computed(() => !!features.value?.unixBits && normMode(mode.value) !== normMode(perms.value?.unixMode))
  const modeValid = computed(() => MODE_RE.test(mode.value.trim()))
  const dirty = computed(() => rowsDirty.value || ownerDirty.value || inheritDirty.value || modeDirty.value)

  /** Whether making <id> the owner needs administrator rights (Windows; null ownerChoices: no one does). */
  function ownerNeedsAdmin(id: string): boolean {
    const choices = perms.value?.ownerChoices
    return !!choices && !choices.some(c => c.toLowerCase() === id.toLowerCase())
  }

  function reset(): void {
    const p = perms.value
    rows.value = (p?.entries ?? []).filter(e => !e.inherited).map(e => ({
      key: nextKey++, who: e.who, level: e.level, deny: e.deny, appliesTo: e.appliesTo,
      rights: e.rights, inheritanceFlags: e.inheritanceFlags, propagationFlags: e.propagationFlags, orig: e.level,
    }))
    savedRows = snapshot(rows.value)
    owner.value = null
    inherit.value = null
    mode.value = modeCommitted = p?.unixMode ?? ''
    editNote.value = null
    infoNote.value = null
    failedPart.value = null
    rev.value++
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

  // ── The change as sent ───────────────────────────────────────────────────────
  /** null: the mode typed isn't valid yet. */
  function buildChange(): FsPermissionsChange | null {
    const change: FsPermissionsChange = {}
    if (modeDirty.value) {
      if (!modeValid.value) return null
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
    return change
  }

  // ── Editing: every choice goes through edit() (0.13.1) ─────────────────────────────
  function capture(): State {
    return { rows: rows.value.map(r => ({ ...r })), owner: owner.value, inherit: inherit.value, mode: modeCommitted }
  }
  function restore(s: State): void {
    rows.value = s.rows.map(r => ({ ...r, key: nextKey++ }))   // new keys: the selects are drawn again
    owner.value = s.owner
    inherit.value = s.inherit
    mode.value = modeCommitted = s.mode
    rev.value++
  }

  /** Makes one choice, then GEM Shell's question about the draft: kept → that choice is undone, the rest stays. */
  async function edit(apply: () => void): Promise<void> {
    if (checking.value || busy.value) return
    const before = capture()
    infoNote.value = null
    apply()
    editNote.value = null
    const path = pathOf()
    if (!dirty.value || !path || !sdk.confirmPermissionChange) return   // older GEM Shell: asked at Save
    const change = buildChange()
    if (!change) return
    checking.value = true
    try {
      if (!(await sdk.confirmPermissionChange(path, change))) { restore(before); infoNote.value = null }
    } catch (err: any) {
      restore(before)
      infoNote.value = null
      editNote.value = err?.code === 'E_PERMISSION' ? 'The permission to change them was not granted.' : `Couldn't check this change: ${err?.message ?? err}`
    } finally {
      checking.value = false
    }
  }

  function setLevel(row: PermRow, level: PermissionLevel): Promise<void> {
    return edit(() => {
      const i = rows.value.findIndex(x => x.key === row.key)
      if (i < 0) return
      const r = rows.value[i]
      if (features.value?.deny) {
        // 0.13.2 (Windows): "No access" ⇄ a row denying everything
        if (isNoAccess(r)) {
          if (level !== 'none') rows.value.splice(i, 1, { ...r, key: nextKey++, deny: false, level, rights: 0, orig: 'none' })
          return
        }
        if (!r.deny && level === 'none') {
          if (rows.value.some(x => isNoAccess(x) && x.who.id === r.who.id)) rows.value.splice(i, 1)
          else rows.value.splice(i, 1, { ...r, key: nextKey++, deny: true, level: 'full', rights: 0, orig: 'none' })
          infoNote.value = `"No access" for ${r.who.name}: Windows adds up what its folder, groups and this item allow, so GEM Shell writes it as a denied row (every right denied: a denied right wins over any allowed one).`
          return
        }
      }
      r.level = level
    })
  }
  function setAppliesTo(row: PermRow, appliesTo: string): Promise<void> {
    return edit(() => { const r = rows.value.find(x => x.key === row.key); if (r) r.appliesTo = appliesTo })
  }
  function removeRow(row: PermRow): Promise<void> {
    return edit(() => { rows.value = rows.value.filter(r => r.key !== row.key) })
  }
  function setInherit(on: boolean): Promise<void> {
    return edit(() => { inherit.value = on === perms.value?.inherits ? null : on })
  }
  /** The mode field was left (Linux): a valid mode is one choice; an invalid one waits (Save says why). */
  function commitMode(): Promise<void> {
    if (!modeValid.value || mode.value === modeCommitted) return Promise.resolve()
    const typed = mode.value
    mode.value = modeCommitted   // captured as it was, then made again inside edit()
    return edit(() => { mode.value = modeCommitted = typed })
  }
  function undoOwner(): void {
    owner.value = null
    failedPart.value = null
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
      closePicker()
      void edit(() => {
        owner.value = who.id === perms.value?.owner?.id ? null : who
        failedPart.value = null
      })
      return
    }
    const deny = m === 'deny'
    const listed = deny ? deniedRows.value : peopleRows.value
    if (listed.some(r => r.who.id === who.id)) { pickerNote.value = `${who.name} is already listed.`; return }
    closePicker()
    void edit(() => {
      rows.value = [...rows.value, {
        key: nextKey++, who, deny,
        // A new allow row starts low (Read); a new partly denied row (Advanced) denies changing it ("No access"
        // is chosen under People)
        level: deny ? 'readWrite' : 'read',
        appliesTo: isDirOf() ? 'all' : 'this', rights: 0, inheritanceFlags: 0, propagationFlags: 0, orig: 'none',
      }]
    })
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
    if (checking.value) throw new Error('answer GEM Shell\'s question about the last change first.')
    const change = buildChange()
    if (!change) throw new Error('the mode must be 3 or 4 digits from 0 to 7 (like 0755).')
    busy.value = true
    failedPart.value = null
    try {
      await sdk.fsSetPermissions(path, change)
    } catch (err: any) {
      const code = err?.code
      if (err?.part === 'owner') failedPart.value = 'owner'
      throw new Error(
        code === 'E_CANCELLED' ? 'the permissions were kept as they were.'
          : code === 'E_PERMISSION' ? 'the permission was not granted.'
          : code === 'E_INVALID_OWNER' ? 'Windows doesn\'t let this account own it (see the owner: Undo).'
          : code === 'E_ELEVATION_DECLINED' ? 'administrator rights were not given.'
          : code === 'E_ACCESS_DENIED' ? 'you may not change its permissions.'
          : String(err?.message ?? err))
    } finally {
      busy.value = false
    }
    await load()
  }

  return {
    perms, loadError, loading, busy, checking, editNote, infoNote, failedPart, rev, view, canRead, canEdit, features,
    rows, inherited, allowRows, denyRows, peopleRows, deniedRows, inheritedPeople, inheritedDenied, shownLevel, deniedHere, owner, inherit, mode, modeDirty, modeValid, dirty, ownerNeedsAdmin,
    load, setLevel, setAppliesTo, removeRow, setInherit, commitMode, undoOwner,
    picker, query, found, searching, unreachable, pickerNote, openPicker, closePicker, pick, useTyped,
    save, discard,
  }
}

export type PermissionsDraft = ReturnType<typeof usePermissionsDraft>
