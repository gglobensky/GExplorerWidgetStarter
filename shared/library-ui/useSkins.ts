// shared/library-ui/useSkins.ts
//
// The user's skins, for any shop (3.5.0, 2026-11-02; Guillaume: "the shareable skin mechanism", like Winamp skins):
// the built-in looks (the shop's own first), and the user's: duplicated from any look, edited live (SkinEditor), saved
// in the shop's own document (sdk.configWrite <doc>: one per widget type, so every copy of the shop has them), exported
// to a .gemskin file and imported from one (skins.ts parseSkinFile: only known, safe values are kept).
//
//   const skins = useSkins(sdk, { doc: 'game-library-skins', first: 'software-aisle', notify: snack })
//   const skin = computed(() => skins.draft.value ?? skins.find(selectedId))
//   <SkinPicker :skins="skins" :selected="selectedId" @select="…" />   <SkinEditor v-if="skins.draft.value" :skins="skins" />
//
// keepSelection: the document also keeps which look is chosen (`selected`, `select()`): a shop with one look for all
// its copies (the Game Shop). A shop whose copies each have theirs (the Video Club) keeps it in its own view.
// Files: import needs ui().openFiles and fsReadText (Read), export ui().saveFile and fsWriteText (Write): the file the
// user picks in GEM Shell's dialog is the only one written.
// 3.7.0, pictures: a skin's pictures are GEM Shell images kept for the widget (mediaImageCreate, storage 'persistent':
// decoded and re-encoded by GEM Shell); added in the editor (addPicture: a PNG or JPEG the user picks), made from a
// file's data when one is loaded, read back as data when one is exported. One no skin uses any more is deleted.
import { computed, ref, type Ref } from 'vue'
import {
  builtInSkinsFrom, copyName, isBuiltInSkin, MAX_SKIN_PICTURES, newSkinId, normalizeSkin, parseSkinFile, pictureName,
  SKIN_FILE_EXTENSION, SKIN_FILE_MAX_BYTES, skinFileText, type LibrarySkin, type SkinKey, type SkinPicture,
} from './skins'

/** At most this many skins of the user's. */
export const MAX_USER_SKINS = 60

/** What useSkins uses of the SDK (any of it may be missing: those actions are off). */
export type SkinsSdk = {
  configRead?: <T = unknown>(name: string) => Promise<T | null>
  configWrite?: (name: string, data: unknown) => Promise<void>
  fsReadText?: (path: string, opts?: { maxBytes?: number }) => Promise<{ text: string; encoding: string }>
  fsWriteText?: (path: string, text: string, opts?: { overwrite?: boolean; bom?: boolean }) => Promise<void>
  ui?: () => {
    openFiles(opts?: { title?: string; filters?: Array<{ label: string; extensions: string[] }>; multiple?: boolean; acceptLabel?: string }): Promise<string[] | null>
    saveFile(opts?: { title?: string; filters?: Array<{ label: string; extensions: string[] }>; suggestedName?: string }): Promise<string | null>
  }
  // 3.7.0: the skins' pictures (the widget's Media capability)
  mediaImageCreate?: (source: any, options?: any) => Promise<{ assetId: string; url: string; width: number; height: number }>
  mediaImageDelete?: (assetId: string) => Promise<boolean>
}

/** At most this big a side, a skin's picture (a tile, a wall photo). */
const PICTURE_MAX = 2048
const IMAGE_FILTERS = [{ label: 'Pictures', extensions: ['png', 'jpg', 'jpeg'] }]

function bytesOf(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
/** A GEM Shell image read back as a data address (same origin: the canvas stays readable). */
async function dataOf(p: SkinPicture): Promise<string> {
  const img = new Image()
  img.src = p.url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return p.url.endsWith('.png') ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
}

type SkinsDoc = { version: 1; skins: LibrarySkin[]; selected?: string }

/** The saved document, checked (a skin that isn't one is left out; a built-in's id is never the user's). */
export function normalizeSkinsDoc(raw: unknown): SkinsDoc {
  const r = raw as { skins?: unknown; selected?: unknown } | null
  const skins: LibrarySkin[] = []
  const ids = new Set<string>()
  for (const s of Array.isArray(r?.skins) ? r!.skins : []) {
    const skin = normalizeSkin(s)
    if (!skin || isBuiltInSkin(skin.id) || ids.has(skin.id)) continue
    ids.add(skin.id)
    skins.push(skin)
    if (skins.length >= MAX_USER_SKINS) break
  }
  const selected = typeof r?.selected === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(r.selected) ? r.selected : undefined
  return { version: 1, skins, ...(selected ? { selected } : {}) }
}

const FILTERS = [{ label: 'GEM skins', extensions: [SKIN_FILE_EXTENSION] }]
const fileName = (name: string) => (name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').trim() || 'Skin').slice(0, 80) + '.' + SKIN_FILE_EXTENSION

export function useSkins(sdk: SkinsSdk | undefined, options: { doc: string; first: string; keepSelection?: boolean; notify?: (text: string) => void }) {
  const mine = ref<LibrarySkin[]>([]) as Ref<LibrarySkin[]>
  const selected = ref<string | undefined>()
  const loaded = ref(false)
  /** The skin being edited (a copy: the surface shows it while it's open), and the id it was opened from. */
  const draft = ref<LibrarySkin | null>(null) as Ref<LibrarySkin | null>
  const notify = (text: string) => options.notify?.(text)

  const builtIns = builtInSkinsFrom(options.first)
  const all = computed(() => [...builtIns, ...mine.value])

  void (async () => {
    try {
      const doc = normalizeSkinsDoc(await sdk?.configRead?.(options.doc))
      mine.value = doc.skins
      selected.value = doc.selected
    } catch { /* none yet */ }
    loaded.value = true
  })()

  async function write() {
    if (!sdk?.configWrite) return
    const doc: SkinsDoc = { version: 1, skins: mine.value, ...(options.keepSelection && selected.value ? { selected: selected.value } : {}) }
    try { await sdk.configWrite(options.doc, doc) } catch { notify("Your skins couldn't be saved.") }
  }

  /** The skin of this id, else the shop's own look. */
  function find(id: string | undefined): LibrarySkin {
    return all.value.find(s => s.id === id) ?? builtIns[0]
  }

  /** keepSelection: the look chosen, kept for every copy. */
  function select(id: string) {
    selected.value = find(id).id
    void write()
  }

  function add(skin: LibrarySkin): LibrarySkin | null {
    if (mine.value.length >= MAX_USER_SKINS) { notify(`You have ${MAX_USER_SKINS} skins: delete one to add another.`); return null }
    mine.value = [...mine.value, skin]
    return skin
  }

  /** A copy of any look, as the user's (named "… (copy)"), opened in the editor. */
  function duplicate(id: string): LibrarySkin | null {
    const from = find(id)
    const name = copyName(from.name, all.value.map(s => s.name))
    const copy: LibrarySkin = { format: from.format, id: newSkinId(name, all.value.map(s => s.id)), name, values: { ...from.values }, ...(from.pictures ? { pictures: { ...from.pictures } } : {}) }
    if (!add(copy)) return null
    void write()
    edit(copy.id)
    return copy
  }

  /** Opens one of the user's skins in the editor (a built-in: a copy of it). */
  function edit(id: string) {
    if (isBuiltInSkin(id)) { duplicate(id); return }
    const skin = mine.value.find(s => s.id === id)
    if (skin) draft.value = { ...skin, values: { ...skin.values }, ...(skin.pictures ? { pictures: { ...skin.pictures } } : {}) }
  }

  // ── 3.7.0: pictures ─────────────────────────────────────────────────────────────────────────────────────────────
  /** The pictures some skin (saved, or being edited) uses. */
  function usedAssets(): Set<string> {
    const out = new Set<string>()
    for (const s of [...mine.value, ...(draft.value ? [draft.value] : [])]) for (const p of Object.values(s.pictures ?? {})) out.add(p.assetId)
    return out
  }
  /** Deletes those of <ids> no skin uses any more. */
  function sweep(ids: Iterable<string>) {
    const used = usedAssets()
    for (const id of ids) if (!used.has(id)) void sdk?.mediaImageDelete?.(id).catch(() => { /* gone already */ })
  }
  const assetsOf = (s: LibrarySkin | null | undefined) => Object.values(s?.pictures ?? {}).map(p => p.assetId)
  const canAddPicture = computed(() => !!sdk?.ui && !!sdk.mediaImageCreate)

  /** A picture the user picks, added to the skin being edited (resolves with its name). */
  async function addPicture(): Promise<string | null> {
    const d = draft.value
    if (!d || !sdk?.ui || !sdk.mediaImageCreate) return null
    if (Object.keys(d.pictures ?? {}).length >= MAX_SKIN_PICTURES) { notify(`A skin holds at most ${MAX_SKIN_PICTURES} pictures.`); return null }
    const [path] = await sdk.ui().openFiles({ title: 'Add a picture to the skin', filters: IMAGE_FILTERS, acceptLabel: 'Add' }) ?? []
    if (!path) return null
    const png = /\.png$/i.test(path)
    try {
      const image = await sdk.mediaImageCreate({ type: 'file', path }, { width: PICTURE_MAX, height: PICTURE_MAX, fit: 'contain', format: png ? 'png' : 'jpeg', storage: 'persistent' })
      if (draft.value !== d) { sweep([image.assetId]); return null }
      const name = pictureName(path.split(/[\\/]/).pop() ?? 'picture', Object.keys(d.pictures ?? {}))
      d.pictures = { ...(d.pictures ?? {}), [name]: { url: image.url, assetId: image.assetId, width: image.width, height: image.height } }
      return name
    } catch (e) {
      notify(`That picture couldn't be added (${(e as { code?: string })?.code === 'E_QUOTA' ? 'no room left for pictures' : 'GEM Shell could not read it'}).`)
      return null
    }
  }
  /** Takes a picture off the skin being edited (deleted once no skin uses it). */
  function removePicture(name: string) {
    const d = draft.value
    if (!d?.pictures?.[name]) return
    const { [name]: _gone, ...rest } = d.pictures
    d.pictures = Object.keys(rest).length ? rest : undefined
  }
  /** Uses a picture as a tile for one of the skin's paints (at half its size: sharp on a 2× screen). */
  function usePicture(name: string, key: SkinKey) {
    const p = draft.value?.pictures?.[name]
    if (!p || !draft.value) return
    draft.value.values[key] = `picture(${name}) 0 0 / ${Math.max(1, Math.round(p.width / 2))}px ${Math.max(1, Math.round(p.height / 2))}px`
  }

  /** The editor's changes kept (checked again: what's saved is always a clean skin). */
  function saveDraft() {
    const d = draft.value
    const clean = d && normalizeSkin(d)
    if (!clean) return
    const before = assetsOf(mine.value.find(s => s.id === clean.id))
    const added = assetsOf(d)
    mine.value = mine.value.map(s => (s.id === clean.id ? clean : s))
    draft.value = null
    sweep([...before, ...added])
    void write()
  }
  function cancelDraft() {
    const added = assetsOf(draft.value)
    draft.value = null
    sweep(added)
  }

  function remove(id: string) {
    if (isBuiltInSkin(id)) return
    const gone = assetsOf(mine.value.find(s => s.id === id))
    mine.value = mine.value.filter(s => s.id !== id)
    if (draft.value?.id === id) draft.value = null
    if (selected.value === id) selected.value = undefined
    sweep(gone)
    void write()
  }

  const canImport = computed(() => !!sdk?.ui && !!sdk.fsReadText)
  const canExport = computed(() => !!sdk?.ui && !!sdk.fsWriteText)

  /** Loads .gemskin files the user picks: each one, as theirs. Resolves with the last one added. */
  async function importFiles(): Promise<LibrarySkin | null> {
    if (!sdk?.ui || !sdk.fsReadText) return null
    const paths = await sdk.ui().openFiles({ title: 'Load a skin', filters: FILTERS, multiple: true, acceptLabel: 'Load' })
    let last: LibrarySkin | null = null
    for (const path of paths ?? []) {
      const short = path.split(/[\\/]/).pop() ?? path
      let text: string
      try { text = (await sdk.fsReadText(path, { maxBytes: SKIN_FILE_MAX_BYTES })).text } catch { notify(`${short} couldn't be read.`); continue }
      const parsed = parseSkinFile(text)
      if ('error' in parsed) { notify(`${short}: ${parsed.error}`); continue }
      const taken = all.value.map(s => s.id)
      const skin: LibrarySkin = taken.includes(parsed.skin.id)
        ? { ...parsed.skin, id: newSkinId(parsed.skin.name, taken), name: all.value.some(s => s.name === parsed.skin.name) ? copyName(parsed.skin.name, all.value.map(s => s.name)) : parsed.skin.name }
        : parsed.skin
      // 3.7.0: its pictures, made anew by GEM Shell from the file's data (one it can't read is left out)
      let lostPictures = 0
      const entries = Object.entries(parsed.pictures)
      if (entries.length && sdk.mediaImageCreate) {
        const pictures: Record<string, SkinPicture> = {}
        for (const [name, p] of entries) {
          try {
            const image = await sdk.mediaImageCreate({ type: 'bytes', data: bytesOf(p.base64) }, { width: PICTURE_MAX, height: PICTURE_MAX, fit: 'contain', format: p.type === 'png' ? 'png' : 'jpeg', storage: 'persistent' })
            pictures[name] = { url: image.url, assetId: image.assetId, width: image.width, height: image.height }
          } catch { lostPictures += 1 }
        }
        if (Object.keys(pictures).length) skin.pictures = pictures
      } else lostPictures = entries.length
      parsed.dropped += lostPictures
      if (!add(skin)) { sweep(assetsOf(skin)); break }
      last = skin
      notify(parsed.dropped
        ? `Loaded "${skin.name}". ${parsed.dropped} of its values ${parsed.dropped === 1 ? "wasn't" : "weren't"} allowed and ${parsed.dropped === 1 ? 'was' : 'were'} left out.`
        : `Loaded "${skin.name}".`)
    }
    if (last) await write()
    return last
  }

  /** Saves a look to a .gemskin file the user picks (to share it). */
  async function exportSkin(id: string) {
    if (!sdk?.ui || !sdk.fsWriteText) return
    const skin = draft.value?.id === id ? draft.value : find(id)
    const path = await sdk.ui().saveFile({ title: 'Save the skin', filters: FILTERS, suggestedName: fileName(skin.name) })
    if (!path) return
    try {
      // 3.7.0: its pictures read back as data, into the file
      const data: Record<string, string> = {}
      for (const [name, p] of Object.entries(skin.pictures ?? {})) {
        try { data[name] = await dataOf(p) } catch { /* left out: the cache let it go */ }
      }
      await sdk.fsWriteText(path, skinFileText(normalizeSkin(skin) ?? skin, data), { overwrite: true })
      notify(`Saved "${skin.name}" to ${path.split(/[\\/]/).pop()}.`)
    } catch { notify("The skin couldn't be saved there.") }
  }

  return {
    all, mine, builtIns, loaded, selected, select, find, draft, duplicate, edit, saveDraft, cancelDraft, remove, importFiles, exportSkin,
    canImport, canExport, addPicture, removePicture, usePicture, canAddPicture,
  }
}

export type SkinsController = ReturnType<typeof useSkins>
