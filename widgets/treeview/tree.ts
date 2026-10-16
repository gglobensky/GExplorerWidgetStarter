import type { ListingSource } from 'gexplorer/widgets'

export type Root = {
  id: string
  label: string
  path: string
  group: string
  kind: 'folder' | 'favorite' | 'destination' | 'unavailable'
  reason?: string
  capacity?: { total?: number; free?: number; fsType?: string; kind?: string }
}
export type RootState = {
  expanded: string[]
  selected: string
  focus: string
  scroll: number
  rootTotal?: number
  anchor?: string
  limits?: Record<string, number>
  columnPath?: string
  narrowPath?: string
  narrowScroll?: number
  narrowAnchor?: string
  beforeFocus?: { expanded: string[]; scroll: number; anchor?: string; columnPath?: string; narrowPath?: string; narrowScroll?: number; narrowAnchor?: string }
}
export type TreeMemory = { active: string; roots: Record<string, RootState>; recent: string[] }
export interface RootSource {
  open(path: string, options?: { consent?: boolean }): ListingSource
  navigate(path: string): void
  /** Where a folder link points, and whether it exists (sdk.fsLinkTarget): the link tooltip. */
  linkTarget?(path: string): Promise<{ target: string | null; targetExists: boolean | null } | null>
}
export const newState = (): RootState => ({ expanded: [], selected: '', focus: '', scroll: 0 })
export const newMemory = (): TreeMemory => ({ active: '', roots: {}, recent: [] })

// Filesystem identity only. VFS providers will supply their own identity policy.
export function key(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  return /^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized
}
export function within(path: string, parent: string): boolean {
  const a = key(path), b = key(parent)
  return a === b || a.startsWith(b === '/' ? b : b + '/')
}
export function label(path: string): string { return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path }
function parent(path: string): string {
  const value = path.replace(/[\\/]+$/, '')
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  return index < 0 ? '' : value.slice(0, index) || '/'
}
export function minimizeOthers(expanded: string[], branch: string): string[] {
  return expanded.filter(path => within(path, branch) || within(branch, path))
}

export type Node = { path: string; name: string; link?: boolean; children: Node[]; total: number; status: 'loading' | 'ready' | 'error'; error: string; version: number; limit: number; loadingMore: boolean }
type Session = { node: Node; source: ListingSource; off: () => void; request: number; loadedVersion: number }
export type TreeRow = { id: string; node: Node; depth: number; parent: string; type: 'node' | 'loading' | 'error' | 'more' | 'empty'; pos?: number; size?: number }

/** Owns only the listings visible under expanded branches; state survives their disposal. */
export class TreeController {
  sessions = new Map<string, Session>()
  root: Node | null = null
  state: RootState = newState()
  private adapter: RootSource
  private changed: () => void
  constructor(adapter: RootSource, changed: () => void) { this.adapter = adapter; this.changed = changed }
  setRoot(path: string, state: RootState) {
    this.close()
    this.state = state
    if (!path) return
    this.root = this.makeNode(path, label(path))
    this.open(this.root)
  }
  private makeNode(path: string, name: string, link = false): Node {
    return { path, name, link, children: [], total: 0, status: 'loading', error: '', version: -1, limit: this.state.limits?.[key(path)] || 80, loadingMore: false }
  }
  isExpanded(path: string) { return this.state.expanded.some(p => key(p) === key(path)) }
  private live(s: Session) { return this.sessions.get(key(s.node.path)) === s }
  private open(node: Node) {
    if (this.sessions.has(key(node.path))) return
    node.status = 'loading'; node.error = ''
    let source: ListingSource
    try { source = this.adapter.open(node.path) }
    catch (error) { node.status = 'error'; node.error = this.message(error); this.changed(); return }
    const s: Session = { node, source, off: () => {}, request: 0, loadedVersion: -1 }
    this.sessions.set(key(node.path), s)
    const update = () => {
      if (!this.live(s)) return
      const snap = source.snapshot()
      node.total = snap.total
      if (snap.status === 'error' || snap.status === 'closed') {
        node.status = 'error'; node.error = snap.error?.message || 'This folder is no longer available.'
      } else if (snap.status === 'loading') node.status = 'loading'
      else if (snap.version !== s.loadedVersion) {
        s.loadedVersion = snap.version
        void this.read(s)
      } else if (!node.loadingMore && !node.error) node.status = 'ready'
      this.changed()
    }
    s.off = source.subscribe(update)
    update()
  }
  private message(error: unknown) { return error instanceof Error ? error.message : 'The folder could not be read.' }
  private async read(s: Session) {
    const request = ++s.request
    const snapshot = s.source.snapshot()
    s.node.loadingMore = true
    try {
      const entries = []
      const end = Math.min(snapshot.total, s.node.limit)
      for (let start = 0; start < end; start += 80) {
        entries.push(...await s.source.rows(start, Math.min(start + 80, end), snapshot.version))
        if (!this.live(s) || request !== s.request) return
      }
      if (!this.live(s) || request !== s.request) return
      const old = new Map(s.node.children.map(n => [key(n.path), n]))
      s.node.children = entries.map(entry => {
        const existing = old.get(key(entry.FullPath))
        // Folder links (junctions, directory symlinks) are listed with the folders (kinds 'dirLink')
        const link = entry.Kind === 'link' && entry.LinkTarget === 'dir'
        if (existing) { existing.name = entry.Name; existing.link = link; return existing }
        return this.makeNode(entry.FullPath, entry.Name, link)
      })
      const retained = new Set(s.node.children.map(n => key(n.path)))
      for (const node of old.values()) if (!retained.has(key(node.path))) this.closeBranch(node.path)
      s.node.version = snapshot.version; s.node.status = 'ready'; s.node.error = ''
      for (const child of s.node.children) if (this.isExpanded(child.path)) this.open(child)
    } catch (error) {
      if (!this.live(s) || request !== s.request) return
      if ((error as { code?: string })?.code === 'E_VERSION') {
        s.loadedVersion = -1
        // The next ready snapshot reloads the new order; if it is already ready, retry now.
        const current = s.source.snapshot()
        if (current.status === 'ready') { s.loadedVersion = current.version; void this.read(s) }
      } else { s.node.status = 'error'; s.node.error = this.message(error) }
    } finally {
      if (this.live(s) && request === s.request) { s.node.loadingMore = false; this.changed() }
    }
  }
  find(path: string): Node | undefined {
    if (!this.root) return
    const visit = (n: Node): Node | undefined => key(n.path) === key(path) ? n : n.children.map(visit).find(Boolean)
    return visit(this.root)
  }
  async revealChild(path: string): Promise<Node | undefined> {
    const existing = this.find(path)
    if (existing) return existing
    const s = this.sessions.get(key(parent(path)))
    if (!s) return
    try {
      const [index] = await s.source.find([label(path)])
      if (index < 0 || !this.live(s)) return
      const limit = Math.ceil((index + 1) / 80) * 80
      if (limit > s.node.limit) {
        s.node.limit = limit
        ;(this.state.limits ??= {})[key(s.node.path)] = limit
      }
      await this.read(s)
      return this.find(path)
    } catch { return }
  }
  toggle(node: Node) {
    if (this.isExpanded(node.path)) {
      this.state.expanded = this.state.expanded.filter(p => key(p) !== key(node.path))
      this.closeBranch(node.path)
    } else {
      this.state.expanded.push(node.path)
      this.open(node)
    }
    this.changed()
  }
  minimize(branch?: string) {
    this.state.expanded = branch ? minimizeOthers(this.state.expanded, branch) : []
    for (const s of [...this.sessions.values()]) {
      if (s.node !== this.root && !this.isExpanded(s.node.path)) this.closeBranch(s.node.path)
    }
    this.changed()
  }
  more(node: Node) {
    const s = this.sessions.get(key(node.path))
    if (!s || node.loadingMore) return
    node.limit += 80
    ;(this.state.limits ??= {})[key(node.path)] = node.limit
    void this.read(s); this.changed()
  }
  retry(node: Node) {
    const s = this.sessions.get(key(node.path))
    if (s) { s.loadedVersion = -1; node.error = ''; s.source.refresh({ user: true }) }
    else this.open(node)
  }
  refresh() { for (const s of this.sessions.values()) { s.loadedVersion = -1; s.source.refresh({ user: true }) } }
  rows(): TreeRow[] {
    const rows: TreeRow[] = []
    const children = (node: Node, depth: number) => {
      this.levelRows(node, depth).forEach(row => {
        rows.push(row)
        const child = row.node
        if (row.type === 'node' && this.isExpanded(child.path)) children(child, depth + 1)
      })
    }
    if (this.root) children(this.root, 1)
    return rows
  }
  levelRows(node: Node, depth = 1): TreeRow[] {
    const rows: TreeRow[] = node.children.map((child, i) => ({
      id: key(child.path), node: child, type: 'node', depth, parent: node.path, pos: i + 1, size: node.total,
    }))
    const type = node.status === 'error' ? 'error' : node.status === 'loading' ? 'loading' : node.children.length < node.total ? 'more' : !node.children.length ? 'empty' : null
    if (type) rows.push({ id: `${key(node.path)}::${type}`, node, type, depth, parent: node.path })
    return rows
  }
  private closeBranch(path: string) {
    for (const [id, s] of [...this.sessions]) if (within(s.node.path, path)) {
      this.sessions.delete(id); s.request++; s.off(); s.source.close()
    }
  }
  close() {
    const sessions = [...this.sessions.values()]
    this.sessions.clear(); this.root = null
    for (const s of sessions) { s.request++; s.off(); s.source.close() }
  }
}
