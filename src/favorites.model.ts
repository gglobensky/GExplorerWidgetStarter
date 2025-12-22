import type {
  FavoriteEntry,
  FavoriteTreeNode,
} from '/src/widgets/contracts/favorites'

export type HostAction =
  | { type: 'nav'; to: string; replace?: boolean; sourceId?: string }
  | { type: 'open'; path: string }

export type MenuRow = {
  id: string
  type: 'folder' | 'item'
  label: string
  depth: number
  path?: string
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
  | { kind: 'item'; entry: FavoriteEntry }

export type RootRowId = string
export type FavoritesNodeKind = 'folder' | 'item'

export function rowId(row: RootRow): RootRowId {
  return row.kind === 'folder'
    ? `folder:${row.node.id}`
    : `item:${row.entry.path}`
}

export function menuRowId(row: MenuRow): RootRowId {
  if (row.type === 'folder') return `folder:${row.id}`
  return `item:${row.path ?? ''}`
}

export function parseRootRowId(id: RootRowId): { kind: FavoritesNodeKind; key: string } {
  if (id.startsWith('folder:')) return { kind: 'folder', key: id.slice('folder:'.length) }
  if (id.startsWith('item:')) return { kind: 'item', key: id.slice('item:'.length) }
  // Fallback: treat as item path
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
        path: (n as any).path,
      })
    }
  }
  return rows
}

export function buildRootRows(
  tree: FavoriteTreeNode[],
  flatItems: FavoriteEntry[],
): RootRow[] {
  const byPath = new Map<string, FavoriteEntry>()
  for (const f of flatItems) {
    if (f.path) byPath.set(f.path, f)
  }

  const rows: RootRow[] = []
  for (const n of tree) {
    if (n.kind === 'folder') {
      rows.push({ kind: 'folder', node: n })
    } else if (n.kind === 'item') {
      const path = (n as any).path as string | undefined
      if (!path) continue
      const entry = byPath.get(path) ?? ({
        path,
        label: (n as any).label,
      } as FavoriteEntry)
      rows.push({ kind: 'item', entry })
    }
  }
  return rows
}

export function guessLabelFromPath(path: string): string {
  const p = (path || '').replace(/[\\/]+$/, '')
  if (!p) return ''
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}
