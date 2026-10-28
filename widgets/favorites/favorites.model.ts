import type {
  FavoriteTreeItem,
  FavoriteTreeNode,
} from 'gexplorer/widgets'

export type MenuRow = {
  id: string
  type: 'folder' | 'item'
  label: string
  depth: number
  /** An item: the place it opens (one location, or 2-4 folders side by side). */
  locations?: string[]
}

export type OpenMenu = {
  folderId: string | null
  label: string
  rows: MenuRow[]
  top: number
  left: number
}

// A "root row" in the sidebar list: either a folder node or a root-level item favorite
export type RootRow =
  | { kind: 'folder'; node: FavoriteTreeNode }
  | { kind: 'item'; entry: FavoriteTreeItem }

export type RootRowId = string
export type FavoritesNodeKind = 'folder' | 'item'

export function rowId(row: RootRow): RootRowId {
  return row.kind === 'folder'
    ? `folder:${row.node.id}`
    : `item:${row.entry.id}`
}

export function menuRowId(row: MenuRow): RootRowId {
  if (row.type === 'folder') return `folder:${row.id}`
  return `item:${row.id}`
}

export function parseRootRowId(id: RootRowId): { kind: FavoritesNodeKind; key: string } {
  if (id.startsWith('folder:')) return { kind: 'folder', key: id.slice('folder:'.length) }
  if (id.startsWith('item:')) return { kind: 'item', key: id.slice('item:'.length) }
  // Fallback: treat as an item id
  return { kind: 'item', key: id }
}

export function buildMenuRows(nodes: FavoriteTreeNode[]): MenuRow[] {
  const rows: MenuRow[] = []
  for (const n of nodes) {
    if (n.kind === 'folder') {
      rows.push({
        id: n.id,
        type: 'folder',
        label: n.label,
        depth: 0, // one level per dropdown → depth 0 inside each
      })
    } else {
      rows.push({
        id: n.id,
        type: 'item',
        label: n.label,
        depth: 0,
        locations: n.locations,
      })
    }
  }
  return rows
}

/** The top level of the tree as rows: folders and favorites, in the user's order. */
export function buildRootRows(tree: FavoriteTreeNode[]): RootRow[] {
  return tree.map(n => n.kind === 'folder'
    ? { kind: 'folder' as const, node: n }
    : { kind: 'item' as const, entry: n })
}

/** A favorite's tooltip: its name, then every folder it opens (side by side: all of them). */
export function placeTooltip(label: string | undefined, locations: string[] | undefined): string {
  const where = (locations ?? []).join('\n')
  return label ? (where ? `${label}\n${where}` : label) : where
}

export function guessLabelFromPath(path: string): string {
  const p = (path || '').replace(/[\\/]+$/, '')
  if (!p) return ''
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

/** FavoriteDialog.vue's props (0.2.0): adding or editing a favorite, or a new folder. */
export type FavoriteDialogProps = {
  /** 'item': a favorite; 'folder': a folder of favorites. */
  mode: 'item' | 'folder'
  /** Editing this favorite (else adding). */
  editingId?: string | null
  locations?: string[]
  label?: string
  /** The folder of favorites it goes in ('' = the top level). */
  parentId?: string
  /** Favorite / Folder can be switched (adding from the + button). */
  canSwitch?: boolean
  /** A note shown on opening (more than 4 folders were given). */
  notice?: string | null
  /** Done: the favorites changed. */
  onSaved?: () => void | Promise<void>
  close?: () => void
}
