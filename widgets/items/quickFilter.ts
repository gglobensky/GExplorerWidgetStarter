// widgets/items/quickFilter.ts
//
// Quick filters (2026-10-27): show everything, folders only or files only, and/or one type of file
// (a group like Pictures, a type the user made, or one extension). Applied by the backend listing
// (kinds + exts), saved with the folder's view like the layout. Chosen in the right-click menu's
// Filter submenu; a chip in the pane says when one is on.
//
// The types: five built in (each can be hidden) and the user's own (a name and its extensions),
// kept for the whole widget in the 'file-types' document (not per folder).

export type ShowKinds = 'all' | 'folders' | 'files'
export type TypeGroup = 'pictures' | 'videos' | 'music' | 'documents' | 'archives'
/** A filter's type: a built-in group, `custom:<id>` (the user's), or `ext:<extension>` (no dot). */
export type TypeRef = TypeGroup | `custom:${string}` | `ext:${string}`
export type QuickFilter = { show: ShowKinds; type: TypeRef | null }

export type CustomType = { id: string; label: string; exts: string[] }
/** The list's order (the Details headers' too). */
export type SortState = { key: 'name' | 'kind' | 'ext' | 'size' | 'modified'; dir: 'asc' | 'desc' }
export const SORT_COLUMNS: Array<{ key: SortState['key']; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'ext', label: 'Extension' },
  { key: 'size', label: 'Size' },
  { key: 'modified', label: 'Modified' },
]
/** The user's types and the built-in ones they hid ('file-types' document). */
export type TypeRegistry = { custom: CustomType[]; hidden: TypeGroup[] }

export const NO_FILTER: QuickFilter = { show: 'all', type: null }
export const EMPTY_REGISTRY: TypeRegistry = { custom: [], hidden: [] }
export const TYPES_DOCUMENT = 'file-types'

export const TYPE_GROUPS: Record<TypeGroup, { label: string; exts: string[] }> = {
  pictures:  { label: 'Pictures',  exts: ['jpg','jpeg','png','gif','bmp','webp','tif','tiff','heic','heif','avif','svg','ico','raw','cr2','cr3','nef','arw','dng','psd'] },
  videos:    { label: 'Videos',    exts: ['mp4','m4v','mkv','avi','mov','wmv','webm','mpg','mpeg','ts','m2ts','mts','flv','3gp','ogv'] },
  music:     { label: 'Music',     exts: ['mp3','flac','wav','aac','m4a','ogg','oga','opus','wma','aif','aiff','alac','mid','midi'] },
  documents: { label: 'Documents', exts: ['pdf','doc','docx','odt','rtf','txt','md','xls','xlsx','ods','csv','ppt','pptx','odp','epub','pages','numbers','key'] },
  archives:  { label: 'Archives',  exts: ['zip','rar','7z','tar','gz','tgz','bz2','xz','zst','iso','cab'] },
}
export const GROUP_IDS = Object.keys(TYPE_GROUPS) as TypeGroup[]

export const SHOW_LABELS: Record<ShowKinds, string> = { all: 'Everything', folders: 'Folders only', files: 'Files only' }

const EXT = /^[a-z0-9]{1,16}$/
const CUSTOM_ID = /^[a-z0-9-]{1,32}$/

/** "jpg, .PNG  webp" -> ['jpg', 'png', 'webp'] (lowercase, no dots, no repeats, at most 64). */
export function parseExtensions(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[\s,;|]+/)) {
    const ext = part.trim().replace(/^\*?\./, '').toLowerCase()
    if (EXT.test(ext) && !out.includes(ext)) out.push(ext)
  }
  return out.slice(0, 64)
}

/** A saved registry, cleaned. */
export function registryOf(value: unknown): TypeRegistry {
  const raw = (value && typeof value === 'object' ? value : {}) as { custom?: unknown; hidden?: unknown }
  const custom: CustomType[] = []
  for (const entry of Array.isArray(raw.custom) ? raw.custom : []) {
    const e = entry as Partial<CustomType>
    if (typeof e?.id !== 'string' || !CUSTOM_ID.test(e.id) || typeof e.label !== 'string' || !e.label.trim()) continue
    const exts = Array.isArray(e.exts) ? e.exts.filter((x): x is string => typeof x === 'string' && EXT.test(x)) : []
    if (exts.length && !custom.some(c => c.id === e.id)) custom.push({ id: e.id, label: e.label.trim().slice(0, 40), exts })
  }
  const hidden = Array.isArray(raw.hidden) ? GROUP_IDS.filter(id => (raw.hidden as unknown[]).includes(id)) : []
  return { custom: custom.slice(0, 50), hidden }
}

/** A new type's id from its name ("Raw photos" -> "raw-photos"), unique in the registry. */
export function customTypeId(label: string, registry: TypeRegistry): string {
  const base = label.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'type'
  let id = base
  for (let n = 2; registry.custom.some(c => c.id === id); n += 1) id = `${base}-${n}`
  return id
}

/** The types the Filter menu offers, in order: the built-in ones not hidden, then the user's. */
export function menuTypes(registry: TypeRegistry): Array<{ ref: TypeRef; label: string; exts: string[] }> {
  return [
    ...GROUP_IDS.filter(id => !registry.hidden.includes(id)).map(id => ({ ref: id as TypeRef, label: TYPE_GROUPS[id].label, exts: TYPE_GROUPS[id].exts })),
    ...registry.custom.map(c => ({ ref: `custom:${c.id}` as TypeRef, label: c.label, exts: c.exts })),
  ]
}

/** A saved filter, cleaned (anything unknown becomes no filter). */
export function quickFilterOf(value: unknown): QuickFilter {
  const raw = (value && typeof value === 'object' ? value : {}) as { show?: unknown; type?: unknown }
  const show: ShowKinds = raw.show === 'folders' || raw.show === 'files' ? raw.show : 'all'
  let type: TypeRef | null = null
  if (typeof raw.type === 'string') {
    if (raw.type in TYPE_GROUPS) type = raw.type as TypeGroup
    else if (/^ext:[a-z0-9]{1,16}$/.test(raw.type)) type = raw.type as TypeRef
    else if (/^custom:[a-z0-9-]{1,32}$/.test(raw.type)) type = raw.type as TypeRef
  }
  // Folders only leaves no file to pick a type of.
  return { show, type: show === 'folders' ? null : type }
}

/** The extensions a type keeps (lowercase, no dot); undefined for any type, or a type that no longer exists. */
export function typeExts(type: TypeRef | null, registry: TypeRegistry = EMPTY_REGISTRY): string[] | undefined {
  if (!type) return undefined
  if (type.startsWith('ext:')) return [type.slice(4)]
  if (type.startsWith('custom:')) return registry.custom.find(c => `custom:${c.id}` === type)?.exts
  return TYPE_GROUPS[type as TypeGroup]?.exts
}

export function typeLabel(type: TypeRef | null, registry: TypeRegistry = EMPTY_REGISTRY): string {
  if (!type) return 'Any type'
  if (type.startsWith('ext:')) return `.${type.slice(4)} files`
  if (type.startsWith('custom:')) return registry.custom.find(c => `custom:${c.id}` === type)?.label ?? 'Any type'
  return TYPE_GROUPS[type as TypeGroup]?.label ?? 'Any type'
}

/** The filter as it applies now: a deleted custom type counts as no type. */
export function effectiveFilter(filter: QuickFilter, registry: TypeRegistry): QuickFilter {
  return filter.type && !typeExts(filter.type, registry) ? { ...filter, type: null } : filter
}

export function isFiltering(filter: QuickFilter): boolean {
  return filter.show !== 'all' || filter.type !== null
}

/**
 * The backend listing's filter part for a quick filter. `dialogExts`: a dialog's own filter (the
 * file dialog's "Images (*.png…)"), kept: a type filter narrows it further. Folders always pass an
 * extension filter (the backend's rule), so "Pictures" still shows the folders to go into;
 * "Files only" hides them.
 */
export function listingKinds(filter: QuickFilter, dialogExts?: string[], registry: TypeRegistry = EMPTY_REGISTRY): { kinds?: Array<'dir' | 'file' | 'link' | 'dirLink'>; exts?: string[] } {
  const kinds = filter.show === 'folders' ? ['dir', 'dirLink'] as const
    : filter.show === 'files' ? ['file', 'link'] as const
      : undefined
  const quick = typeExts(filter.type, registry)
  let exts = dialogExts?.length ? dialogExts : undefined
  if (quick) exts = exts ? exts.filter(ext => quick.includes(ext)) : quick
  // A type filter that matches none of the dialog's types: nothing but folders, not everything.
  if (quick && exts && !exts.length) return { kinds: ['dir', 'dirLink'], exts: undefined }
  return { kinds: kinds ? [...kinds] : undefined, exts }
}

/** What the pane's chip says while a filter is on: "Files only · Pictures". */
export function chipLabel(filter: QuickFilter, registry: TypeRegistry = EMPTY_REGISTRY): string {
  return [filter.show !== 'all' ? SHOW_LABELS[filter.show] : '', filter.type ? typeLabel(filter.type, registry) : '']
    .filter(Boolean).join(' · ')
}

/**
 * The Filter submenu's entries (sdk.ui().contextMenu opts.submenus.filter): Sort ▸ (when `sort` is
 * given: List and Grid have no headers to click), Show ▸, Type ▸, Clear filter. Ids: sort.<key>,
 * show.<kind>, type.any, type.<group>, type.custom.<id>, type.ext.<ext>, types.edit, clear.
 * Sort says "(ascending)" / "(descending)" on the current column instead of a tick.
 */
export function filterMenu(filter: QuickFilter, registry: TypeRegistry, focusedExt?: string, sort?: SortState) {
  const types = menuTypes(registry)
  const foldersOnly = filter.show === 'folders'
  const typeEntries: Array<Record<string, unknown>> = [
    { id: 'type.any', label: 'Any type', checked: !filter.type, disabled: foldersOnly },
    ...types.map(t => ({
      id: t.ref.startsWith('custom:') ? `type.custom.${t.ref.slice(7)}` : `type.${t.ref}`,
      label: t.label,
      checked: filter.type === t.ref,
      disabled: foldersOnly,
      title: t.exts.map(ext => `.${ext}`).join(' ').slice(0, 200),
    })),
  ]
  const extRef = focusedExt ? `ext:${focusedExt}` : null
  if (filter.type?.startsWith('ext:')) typeEntries.push({ id: `type.ext.${filter.type.slice(4)}`, label: typeLabel(filter.type), checked: true })
  else if (extRef) typeEntries.push({ id: `type.ext.${focusedExt}`, label: `Only .${focusedExt} files`, checked: false, disabled: foldersOnly, title: 'The selected file\'s type' })
  typeEntries.push({ separator: true }, { id: 'types.edit', label: 'Edit types…', title: 'Make your own types, delete them, or hide built-in ones' })
  const current = sort ? SORT_COLUMNS.find(c => c.key === sort.key) : undefined
  const sortEntries = sort ? [{
    id: 'sort',
    label: `Sort: ${current?.label ?? 'Name'} ${sort.dir === 'asc' ? '↑' : '↓'}`,
    children: SORT_COLUMNS.map(c => c.key === sort.key
      ? { id: `sort.${c.key}`, label: `${c.label} (${sort.dir === 'asc' ? 'ascending' : 'descending'})`, title: 'Choose again to reverse the order' }
      : { id: `sort.${c.key}`, label: c.label }),
  }] : []
  return [
    ...sortEntries,
    { id: 'show', label: `Show: ${SHOW_LABELS[filter.show]}`, children: (['all', 'folders', 'files'] as ShowKinds[]).map(show => ({ id: `show.${show}`, label: SHOW_LABELS[show], checked: filter.show === show })) },
    { id: 'type', label: `Type: ${typeLabel(filter.type, registry)}`, children: typeEntries },
    ...(isFiltering(filter) ? [{ separator: true }, { id: 'clear', label: 'Clear filter' }] : []),
  ]
}

/** The order once a Sort entry is chosen (the same column again reverses, another starts ascending, like the headers); null: not a sort entry. */
export function applySortChoice(sort: SortState, choice: string): SortState | null {
  if (!choice.startsWith('sort.')) return null
  const key = choice.slice(5) as SortState['key']
  if (!SORT_COLUMNS.some(c => c.key === key)) return null
  return key === sort.key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
}

/** The filter once a Filter menu entry is chosen; null: not a filter entry (types.edit). */
export function applyFilterChoice(filter: QuickFilter, choice: string): QuickFilter | null {
  if (choice === 'clear') return { ...NO_FILTER }
  if (choice.startsWith('show.')) {
    const show = choice.slice(5) as ShowKinds
    return show === 'all' || show === 'folders' || show === 'files' ? { show, type: show === 'folders' ? null : filter.type } : null
  }
  const keepShow: ShowKinds = filter.show === 'folders' ? 'all' : filter.show
  if (choice === 'type.any') return { show: filter.show, type: null }
  if (choice.startsWith('type.custom.')) return quickFilterOf({ show: keepShow, type: `custom:${choice.slice(12)}` })
  if (choice.startsWith('type.ext.')) return quickFilterOf({ show: keepShow, type: `ext:${choice.slice(9)}` })
  if (choice.startsWith('type.')) return quickFilterOf({ show: keepShow, type: choice.slice(5) })
  return null
}
