import { computed, ref, type Ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import { BUILT_IN_TIMEPIECE_SKINS, normalizeTimepieceSkin, parseTimepieceSkinFile, timepieceSkinFileText, type TimepieceSkin } from './skins'

type SkinDoc = { version: 1; skins: TimepieceSkin[] }
const DOC = 'clock-timepiece-skins'
const MAX_USER_SKINS = 40
const FILTERS = [{ label: 'GEM skins', extensions: ['gemskin'] }]

function copyName(name: string, names: string[]) {
  const root = name.replace(/ \(copy(?: \d+)?\)$/, '')
  let candidate = `${root} (copy)`, n = 2
  while (names.includes(candidate)) candidate = `${root} (copy ${n++})`
  return candidate
}
function skinId(name: string, ids: string[]) {
  const root = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38) || 'skin'
  let candidate = root, n = 2
  while (ids.includes(candidate)) candidate = `${root}-${n++}`
  return candidate
}
function cleanDoc(raw: unknown): SkinDoc {
  const values = Array.isArray((raw as { skins?: unknown } | null)?.skins) ? (raw as { skins: unknown[] }).skins : []
  const ids = new Set(BUILT_IN_TIMEPIECE_SKINS.map(s => s.id)), skins: TimepieceSkin[] = []
  for (const value of values) {
    const skin = normalizeTimepieceSkin(value)
    if (!skin || ids.has(skin.id)) continue
    ids.add(skin.id); skins.push(skin)
    if (skins.length === MAX_USER_SKINS) break
  }
  return { version: 1, skins }
}

function createTimepieceSkins(sdk: WidgetSdk | undefined, notify: (text: string) => void) {
  const mine = ref<TimepieceSkin[]>([]) as Ref<TimepieceSkin[]>
  const draft = ref<TimepieceSkin | null>(null) as Ref<TimepieceSkin | null>
  const loaded = ref(false)
  const all = computed(() => [...BUILT_IN_TIMEPIECE_SKINS, ...mine.value])
  void (async () => {
    try { mine.value = cleanDoc(await sdk?.configRead?.(DOC)).skins } catch { /* first run */ }
    loaded.value = true
  })()

  const find = (id: string | undefined) => all.value.find(s => s.id === id) ?? BUILT_IN_TIMEPIECE_SKINS[0]
  async function write() {
    try { await sdk?.configWrite?.(DOC, { version: 1, skins: mine.value } satisfies SkinDoc) }
    catch { notify("Your clock skins couldn't be saved.") }
  }
  function duplicate(id: string) {
    if (mine.value.length >= MAX_USER_SKINS) { notify(`You have ${MAX_USER_SKINS} clock skins already.`); return null }
    const source = find(id), name = copyName(source.name, all.value.map(s => s.name))
    const copy: TimepieceSkin = { ...source, id: skinId(name, all.value.map(s => s.id)), name, values: { ...source.values } }
    mine.value = [...mine.value, copy]; draft.value = { ...copy, values: { ...copy.values } }; void write(); return copy
  }
  function edit(id: string) {
    if (BUILT_IN_TIMEPIECE_SKINS.some(s => s.id === id)) { duplicate(id); return }
    const source = mine.value.find(s => s.id === id)
    if (source) draft.value = { ...source, values: { ...source.values } }
  }
  function saveDraft() {
    const clean = draft.value && normalizeTimepieceSkin(draft.value)
    if (!clean) return
    mine.value = mine.value.map(s => s.id === clean.id ? clean : s); draft.value = null; void write()
  }
  function cancelDraft() { draft.value = null }
  function remove(id: string) { mine.value = mine.value.filter(s => s.id !== id); if (draft.value?.id === id) draft.value = null; void write() }

  async function importFiles() {
    if (!sdk?.ui || !sdk.fsReadText) return null
    const paths = await sdk.ui().openFiles({ title: 'Load a Clock/Calendar skin', filters: FILTERS, multiple: true, acceptLabel: 'Load' })
    let last: TimepieceSkin | null = null
    for (const path of paths ?? []) {
      let text: string
      try { text = (await sdk.fsReadText(path, { maxBytes: 64 * 1024 })).text } catch { notify(`${path.split(/[\\/]/).pop()} couldn't be read.`); continue }
      const parsed = parseTimepieceSkinFile(text)
      if ('error' in parsed) { notify(parsed.error); continue }
      if (mine.value.length >= MAX_USER_SKINS) { notify(`You have ${MAX_USER_SKINS} clock skins already.`); break }
      const name = all.value.some(s => s.name === parsed.skin.name) ? copyName(parsed.skin.name, all.value.map(s => s.name)) : parsed.skin.name
      const id = all.value.some(s => s.id === parsed.skin.id) ? skinId(name, all.value.map(s => s.id)) : parsed.skin.id
      last = { ...parsed.skin, id, name }
      mine.value = [...mine.value, last]
      notify(parsed.dropped ? `Loaded “${name}”; ${parsed.dropped} unsupported values were left out.` : `Loaded “${name}”.`)
    }
    if (last) await write()
    return last
  }
  async function exportSkin(id: string) {
    if (!sdk?.ui || !sdk.fsWriteText) return
    const skin = draft.value?.id === id ? draft.value : find(id)
    const path = await sdk.ui().saveFile({ title: 'Save Clock/Calendar skin', filters: FILTERS, suggestedName: `${skin.name.replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'Clock skin'}.gemskin` })
    if (!path) return
    try { await sdk.fsWriteText(path, timepieceSkinFileText(skin), { overwrite: true }); notify(`Saved “${skin.name}”.`) }
    catch { notify("The skin couldn't be saved there.") }
  }
  return { all, mine, draft, loaded, find, duplicate, edit, saveDraft, cancelDraft, remove, importFiles, exportSkin }
}
export type TimepieceSkins = ReturnType<typeof createTimepieceSkins>

// A widget and its popovers receive the same bound SDK object. Sharing this
// store keeps the manager reactive without passing refs/computed refs through
// the shell's popover props (which can otherwise fail before the panel mounts).
const stores = new WeakMap<WidgetSdk, TimepieceSkins>()
export function useTimepieceSkins(sdk: WidgetSdk | undefined, notify: (text: string) => void): TimepieceSkins {
  if (!sdk) return createTimepieceSkins(undefined, notify)
  const existing = stores.get(sdk)
  if (existing) return existing
  const created = createTimepieceSkins(sdk, notify)
  stores.set(sdk, created)
  return created
}
