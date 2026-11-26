// GEM YT 1.0 (2026-11-24): the ＋ tag picker, shared by the Creators tiles and the Channel part. GEM Shell's menu: a
// check per tag (click: on / off), New tag… (the bar's name box). Live: the rows are read again as the tags change.
import type { Tag } from '../core/tags'

export type TagMenu = { close(): void; update?(): void }

export function openTagMenu(
  ui: any, at: HTMLElement, channel: { id: string; name: string }, tags: () => Tag[],
  on: { toggle(tagId: string): void; add(): void; closed?(): void },
): TagMenu | null {
  if (!ui?.openMenu) { on.add(); return null }
  const rows = () => {
    const list = tags()
    const has = new Set(list.filter(t => t.channels.includes(channel.id)).map(t => t.id))
    return [
      { type: 'header', label: `Tags of ${channel.name}` },
      ...list.map(t => ({ id: t.id, label: t.name, detail: `${t.channels.length}`, check: 'box', checked: has.has(t.id) })),
      ...(list.length ? [{ type: 'separator' }] : []),
      { id: '__new', label: 'New tag…', icon: '＋' },
    ]
  }
  return ui.openMenu({
    at, items: rows, label: 'Tags',
    onToggle: (row: { id: string }) => on.toggle(row.id),
    onPick: (row: { id: string }) => { if (row.id === '__new') on.add(); else on.toggle(row.id) },
    onClose: () => on.closed?.(),
  })
}
