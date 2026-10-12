import type { ListingEntry, ListingListener, ListingSnapshot, ListingSource } from 'gexplorer/widgets'
import type { Root, RootSource } from '../tree'

export const roots: Root[] = [
  { id: 'work', label: 'Work folders', path: 'C:/Sample work', group: 'Files', kind: 'folder' },
  { id: 'archive', label: 'Archive', path: 'D:/Sample archive', group: 'Files', kind: 'folder' },
  { id: 'favorite', label: 'Design notes', path: 'C:/Sample work/Projects/GEM/Design', group: 'Favorites', kind: 'favorite' },
  { id: 'hub', label: 'Sample Hub', path: '', group: 'Available later', kind: 'unavailable', reason: 'Preview only · public Hub catalog required' },
  { id: 'trash', label: 'Recycle Bin', path: '', group: 'Available later', kind: 'unavailable', reason: 'Preview only · listing provider required' },
  { id: 'network', label: 'Network locations', path: '', group: 'Available later', kind: 'unavailable', reason: 'Preview only · discovery provider required' },
]
const folders: Record<string, string[]> = {
  'C:/Sample work': ['Projects', 'Documents', 'Photos', 'Empty folder', 'Slow folder', 'Restricted folder', 'Many folders'],
  'C:/Sample work/Projects': ['GEM', 'Research', 'A very long project name that remains readable through its tooltip'],
  'C:/Sample work/Projects/GEM': ['Design', 'Engineering', 'Releases'],
  'C:/Sample work/Projects/GEM/Design': ['Concepts', 'Interaction studies'],
  'C:/Sample work/Projects/GEM/Design/Concepts': ['Navigation'],
  'C:/Sample work/Projects/GEM/Design/Concepts/Navigation': ['Tree view'],
  'C:/Sample work/Documents': ['Invoices', 'Notes', 'Reports'],
  'C:/Sample work/Photos': ['2024', '2025', '2026'],
  'C:/Sample work/Slow folder': ['Loaded successfully'],
  'C:/Sample work/Many folders': Array.from({ length: 5000 }, (_, i) => `Folder ${String(i + 1).padStart(4, '0')}`),
  'D:/Sample archive': ['Backups', 'Completed projects'],
  'D:/Sample archive/Backups': ['September', 'October'],
}
export function createFixtures(onNavigate: (path: string) => void, onCount: (count: number) => void = () => {}, delay = 120): RootSource {
  let active = 0
  return {
    navigate: onNavigate,
    open(path) {
      active++; onCount(active)
      let closed = false, retried = false
      const listeners = new Set<ListingListener>()
      let snapshot: ListingSnapshot = { status: 'loading', total: 0, version: 0, sort: { key: 'name', dir: 'asc', foldersFirst: true }, progress: null, stale: false, error: null, rowsTick: 0, basePath: path }
      const entries: ListingEntry[] = (folders[path] || []).map(Name => ({ Name, FullPath: `${path}/${Name}`, Kind: 'dir', Ext: '', IconKey: '', Hidden: false, Size: null, ModifiedAt: null }))
      const notify = () => listeners.forEach(fn => fn(snapshot))
      let timer: ReturnType<typeof setTimeout>
      const load = () => {
        snapshot = { ...snapshot, status: 'loading', error: null }; notify()
        timer = setTimeout(() => {
          if (closed) return
          const denied = path.endsWith('Restricted folder') && !retried
          snapshot = { ...snapshot, status: denied ? 'error' : 'ready', total: entries.length, version: snapshot.version + 1, error: denied ? { code: 'E_ACCESS_DENIED', message: 'Access denied (sample). Retry to simulate consent.' } : null }; notify()
        }, path.endsWith('Slow folder') ? delay * 15 : delay)
      }
      load()
      const source: ListingSource = {
        snapshot: () => snapshot,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        at: index => entries[index], ensure() {}, setSort() {},
        find: async names => names.map(name => entries.findIndex(e => e.Name === name)),
        rows: async (start, end, version) => {
          if (version !== undefined && version !== snapshot.version) throw Object.assign(new Error('Order changed'), { code: 'E_VERSION' })
          return entries.slice(start, end)
        },
        refresh(options) { if (closed) return; retried ||= !!options?.user; clearTimeout(timer); load() },
        close() { if (closed) return; closed = true; clearTimeout(timer); listeners.clear(); active--; onCount(active) },
      }
      return source
    },
  }
}
