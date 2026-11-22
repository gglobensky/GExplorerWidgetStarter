// widgets/items/quickFilter.ts
//
// Quick filters (2026-10-27): show everything, folders only or files only, and/or one type of file
// (a group like Pictures, a type the user made, or one extension). Applied by the backend listing
// (kinds + exts), saved with the folder's view like the layout. Chosen in the right-click menu's
// Filter submenu; a chip in the pane says when one is on.
// CHANGED 0.17.0 (2026-11-21, #16): several types at once (OR: Pictures or Videos), and Show with them (AND).
// "Files only" is called Hide folders (what it does next to a type: Pictures alone keeps the folders to go into).
// One chip per part (Show, Type), each with its menu; a saved filter of one type (`type`) still reads.
//
// The types: five built in (each can be hidden) and the user's own (a name and its extensions),
// kept for the whole widget in the 'file-types' document (not per folder).

export type ShowKinds = 'all' | 'folders' | 'files'
export type TypeGroup = 'pictures' | 'videos' | 'music' | 'documents' | 'archives'
/** A filter's type: a built-in group, `custom:<id>` (the user's), or `ext:<extension>` (no dot). */
export type TypeRef = TypeGroup | `custom:${string}` | `ext:${string}`
export type QuickFilter = { show: ShowKinds; types: TypeRef[] }
/** The most types one filter keeps at once. */
export const MAX_FILTER_TYPES = 16

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

export const NO_FILTER: QuickFilter = { show: 'all', types: [] }
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

export const SHOW_LABELS: Record<ShowKinds, string> = { all: 'Everything', folders: 'Folders only', files: 'Hide folders' }

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

/** One saved type reference, cleaned; null when it isn't one. */
function typeRefOf(v: unknown): TypeRef | null {
  if (typeof v !== 'string') return null
  if (v in TYPE_GROUPS) return v as TypeGroup
  if (/^ext:[a-z0-9]{1,16}$/.test(v)) return v as TypeRef
  if (/^custom:[a-z0-9-]{1,32}$/.test(v)) return v as TypeRef
  return null
}

/** A saved filter, cleaned (anything unknown becomes no filter). 0.17.0: `types`, or a filter saved before (`type`). */
export function quickFilterOf(value: unknown): QuickFilter {
  const raw = (value && typeof value === 'object' ? value : {}) as { show?: unknown; type?: unknown; types?: unknown }
  const show: ShowKinds = raw.show === 'folders' || raw.show === 'files' ? raw.show : 'all'
  const listed = Array.isArray(raw.types) ? raw.types : raw.type !== undefined ? [raw.type] : []
  const types: TypeRef[] = []
  for (const v of listed) {
    const ref = typeRefOf(v)
    if (ref && !types.includes(ref)) types.push(ref)
  }
  // Folders only leaves no file to pick a type of.
  return { show, types: show === 'folders' ? [] : types.slice(0, MAX_FILTER_TYPES) }
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

/** 0.17.0: the extensions a filter's types keep together (OR); undefined: any type (none, or none left). */
export function filterExts(filter: QuickFilter, registry: TypeRegistry = EMPTY_REGISTRY): string[] | undefined {
  const out: string[] = []
  for (const type of filter.types) for (const ext of typeExts(type, registry) ?? []) if (!out.includes(ext)) out.push(ext)
  return out.length ? out : undefined
}

/** "Pictures", "Pictures or Videos", "Pictures, Videos or 2 more". */
export function typesLabel(types: readonly TypeRef[], registry: TypeRegistry = EMPTY_REGISTRY): string {
  if (!types.length) return 'Any type'
  const names = types.map(t => typeLabel(t, registry))
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} or ${names[1]}`
  return names.length === 3 ? `${names[0]}, ${names[1]} or ${names[2]}` : `${names[0]}, ${names[1]} or ${names.length - 2} more`
}

/** The filter as it applies now: a deleted custom type is left out. */
export function effectiveFilter(filter: QuickFilter, registry: TypeRegistry): QuickFilter {
  const types = filter.types.filter(t => typeExts(t, registry))
  return types.length === filter.types.length ? filter : { ...filter, types }
}

export function isFiltering(filter: QuickFilter): boolean {
  return filter.show !== 'all' || filter.types.length > 0
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
  const quick = filterExts(filter, registry)
  let exts = dialogExts?.length ? dialogExts : undefined
  if (quick) exts = exts ? exts.filter(ext => quick.includes(ext)) : quick
  // A type filter that matches none of the dialog's types: nothing but folders, not everything.
  if (quick && exts && !exts.length) return { kinds: ['dir', 'dirLink'], exts: undefined }
  return { kinds: kinds ? [...kinds] : undefined, exts }
}

/** What the filter says in one line: "Hide folders · Pictures or Videos". */
export function chipLabel(filter: QuickFilter, registry: TypeRegistry = EMPTY_REGISTRY): string {
  return [filter.show !== 'all' ? SHOW_LABELS[filter.show] : '', filter.types.length ? typesLabel(filter.types, registry) : '']
    .filter(Boolean).join(' · ')
}

/** Every type named: "Pictures, Videos, Music or Documents" (a chip's tooltip). */
function allTypes(types: readonly TypeRef[], registry: TypeRegistry): string {
  const names = types.map(t => typeLabel(t, registry))
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/** 0.17.0: the pane's chips while a filter is on: one per part (Show, Type), each with its menu and its ✕. */
export function filterChips(filter: QuickFilter, registry: TypeRegistry = EMPTY_REGISTRY): Array<{ part: 'show' | 'type'; label: string; title: string }> {
  const chips: Array<{ part: 'show' | 'type'; label: string; title: string }> = []
  if (filter.show !== 'all') chips.push({ part: 'show', label: SHOW_LABELS[filter.show], title: `Show: ${SHOW_LABELS[filter.show]}` })
  // The chip may shorten ("or 2 more"); its tooltip names every type
  if (filter.types.length) chips.push({ part: 'type', label: typesLabel(filter.types, registry), title: `Type: ${allTypes(filter.types, registry)}` })
  return chips
}

/** 0.17.0: the filter without one of its parts (a chip's ✕). */
export function clearPart(filter: QuickFilter, part: 'show' | 'type'): QuickFilter {
  return part === 'show' ? { ...filter, show: 'all' } : { ...filter, types: [] }
}

/** 0.17.0: the filter with type <ref> on or off (OR with the others); Folders only becomes Everything to have files. */
export function toggleType(filter: QuickFilter, ref: TypeRef, on: boolean): QuickFilter {
  const types = filter.types.filter(t => t !== ref)
  if (on) types.push(ref)
  return quickFilterOf({ show: filter.show === 'folders' && on ? 'all' : filter.show, types })
}

/** A menu id for a type (type.pictures, type.custom.<id>, type.ext.<ext>) and back. */
export function typeMenuId(ref: TypeRef): string {
  if (ref.startsWith('custom:')) return `type.custom.${ref.slice(7)}`
  return ref.startsWith('ext:') ? `type.ext.${ref.slice(4)}` : `type.${ref}`
}
export function typeRefOfMenuId(id: string): TypeRef | null {
  if (id.startsWith('type.custom.')) return typeRefOf(`custom:${id.slice(12)}`)
  if (id.startsWith('type.ext.')) return typeRefOf(`ext:${id.slice(9)}`)
  return id.startsWith('type.') && id !== 'type.any' ? typeRefOf(id.slice(5)) : null
}

/**
 * 0.17.0: the rows of a Type menu (sdk.ui().openMenu): every type as a check box (the built-in ones not hidden, the
 * user's, the extensions in the filter, the focused file's), then Any type and Edit types…. Ids as typeMenuId.
 */
export function typeMenuRows(filter: QuickFilter, registry: TypeRegistry, focusedExt?: string) {
  const foldersOnly = filter.show === 'folders'
  const rows: Array<Record<string, unknown>> = menuTypes(registry).map(t => ({
    id: typeMenuId(t.ref), label: t.label, check: 'box', checked: filter.types.includes(t.ref),
    tooltip: t.exts.map(ext => `.${ext}`).join(' ').slice(0, 200),
  }))
  const exts = filter.types.filter(t => t.startsWith('ext:'))
  if (focusedExt && !exts.includes(`ext:${focusedExt}` as TypeRef)) exts.push(`ext:${focusedExt}` as TypeRef)
  for (const ref of exts) {
    rows.push({ id: typeMenuId(ref), label: typeLabel(ref), check: 'box', checked: filter.types.includes(ref),
      tooltip: ref === `ext:${focusedExt}` && !filter.types.includes(ref) ? 'The selected file\'s type' : undefined })
  }
  return [
    ...(foldersOnly ? [{ type: 'header', label: 'Folders only: no files to choose from' }] : []),
    ...rows,
    { type: 'separator' },
    { id: 'type.any', label: 'Any type', disabled: !filter.types.length },
    { id: 'types.edit', label: 'Edit types…', icon: '✎', tooltip: 'Make your own types, delete them, or hide built-in ones' },
  ]
}

/** 0.17.0: the rows of a Show menu (sdk.ui().openMenu): Everything / Folders only / Hide folders, as radios. */
export function showMenuRows(filter: QuickFilter) {
  return (['all', 'folders', 'files'] as ShowKinds[]).map(show => ({
    id: `show.${show}`, label: SHOW_LABELS[show], check: 'radio', checked: filter.show === show,
    tooltip: show === 'files' ? 'Only files (and what the Type keeps)' : show === 'folders' ? 'Only folders (the Type is cleared)' : undefined,
  }))
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
    { id: 'type.any', label: 'Any type', checked: !filter.types.length, disabled: foldersOnly },
    ...types.map(t => ({
      id: typeMenuId(t.ref),
      label: t.label,
      checked: filter.types.includes(t.ref),
      disabled: foldersOnly,
      title: t.exts.map(ext => `.${ext}`).join(' ').slice(0, 200),
    })),
  ]
  for (const ref of filter.types.filter(t => t.startsWith('ext:'))) typeEntries.push({ id: typeMenuId(ref), label: typeLabel(ref), checked: true })
  if (focusedExt && !filter.types.includes(`ext:${focusedExt}` as TypeRef)) typeEntries.push({ id: `type.ext.${focusedExt}`, label: `.${focusedExt} files`, checked: false, disabled: foldersOnly, title: 'The selected file\'s type' })
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
    { id: 'type', label: `Type: ${typesLabel(filter.types, registry)}`, children: typeEntries },
    ...(isFiltering(filter) ? [{ separator: true }, { id: 'clear', label: 'Clear filter' }] : []),
  ]
}

/** 0.9.0: a declared Filter entry's live state (GEM Shell's contextMenu opts.state). */
export type FilterEntryState = { checked?: boolean; disabled?: boolean; label?: string; title?: string }

/**
 * 0.9.0 (GEM Shell 2026-10-29, declared submenus): the Filter submenu as entry.ts declares it (menus.items
 * children): the live state of its declared entries, what fills its slots (sort.columns, type.list, type.focused),
 * and the menu situations ('unfiltered': Clear filter hides). Same entries and ids as filterMenu.
 */
export function filterMenuParts(filter: QuickFilter, registry: TypeRegistry, focusedExt?: string, sort?: SortState) {
  const foldersOnly = filter.show === 'folders'
  const current = sort ? SORT_COLUMNS.find(c => c.key === sort.key) : undefined
  const state: Record<string, FilterEntryState> = {
    show: { label: `Show: ${SHOW_LABELS[filter.show]}` },
    'show.all': { checked: filter.show === 'all' },
    'show.folders': { checked: filter.show === 'folders' },
    'show.files': { checked: filter.show === 'files' },
    type: { label: `Type: ${typesLabel(filter.types, registry)}` },
    'type.any': { checked: !filter.types.length, disabled: foldersOnly },
  }
  if (sort) state.sort = { label: `Sort: ${current?.label ?? 'Name'} ${sort.dir === 'asc' ? '↑' : '↓'}` }

  const typeList = menuTypes(registry).map(t => ({
    id: typeMenuId(t.ref),
    label: t.label,
    checked: filter.types.includes(t.ref),
    disabled: foldersOnly,
    title: t.exts.map(ext => `.${ext}`).join(' ').slice(0, 200),
  }))
  const focused: Array<{ id: string; label: string; checked?: boolean; disabled?: boolean; title?: string }> = []
  for (const ref of filter.types.filter(t => t.startsWith('ext:'))) focused.push({ id: typeMenuId(ref), label: typeLabel(ref), checked: true })
  if (focusedExt && !filter.types.includes(`ext:${focusedExt}` as TypeRef)) focused.push({ id: `type.ext.${focusedExt}`, label: `.${focusedExt} files`, checked: false, disabled: foldersOnly, title: 'The selected file\'s type' })
  const columns = sort ? SORT_COLUMNS.map(c => c.key === sort.key
    ? { id: `sort.${c.key}`, label: `${c.label} (${sort.dir === 'asc' ? 'ascending' : 'descending'})`, title: 'Choose again to reverse the order' }
    : { id: `sort.${c.key}`, label: c.label }) : []

  return {
    state,
    slots: { 'sort.columns': columns, 'type.list': typeList, 'type.focused': focused },
    states: isFiltering(filter) ? [] : ['unfiltered'],
  }
}

/** The order once a Sort entry is chosen (the same column again reverses, another starts ascending, like the headers); null: not a sort entry. */
export function applySortChoice(sort: SortState, choice: string): SortState | null {
  if (!choice.startsWith('sort.')) return null
  const key = choice.slice(5) as SortState['key']
  if (!SORT_COLUMNS.some(c => c.key === key)) return null
  return key === sort.key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
}

/**
 * The filter once a Filter menu entry is chosen; null: not a filter entry (types.edit). 0.17.0: a type entry turns
 * that type on or off (the others stay: OR); Any type clears them.
 */
export function applyFilterChoice(filter: QuickFilter, choice: string): QuickFilter | null {
  if (choice === 'clear') return { ...NO_FILTER, types: [] }
  if (choice.startsWith('show.')) {
    const show = choice.slice(5) as ShowKinds
    return show === 'all' || show === 'folders' || show === 'files' ? quickFilterOf({ show, types: filter.types }) : null
  }
  if (choice === 'type.any') return { show: filter.show, types: [] }
  const ref = typeRefOfMenuId(choice)
  return ref ? toggleType(filter, ref, !filter.types.includes(ref)) : null
}
