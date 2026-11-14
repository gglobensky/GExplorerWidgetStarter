// widgets/favorites/useFolderPopovers.ts
//
// 0.3.0 (GEM Shell E5c-2, claude/overlay-hardening-e5c-design.md): the folder dropdowns are GEM Shell's popovers, one
// per level, instead of elements this widget teleported into its overlay layer (clipped to its box + 24 px from E5c-3).
// openMenus (useFolderMenus.ts) stays the one state; this keeps the popovers in step with it:
//   - level 0 opens next to its folder pill (below it in a bar, to its right in the sidebar), a top-level popover;
//   - level k opens to the right of its row in level k-1, as that popover's child (`parent`), a HOVER level: GEM Shell
//     closes it once the pointer has been off it, its children and its parent for a moment (not during a drag);
//   - a popover GEM Shell closes (a click elsewhere, Esc, its hover leeway) cuts openMenus at that level;
//   - a level whose folder or anchor changed is closed and opened again.
// Each popover draws FolderMenu.vue for its level, reading openMenus through `ctx` (no props to update).
import { markRaw, watch, type Component, type Ref } from 'vue'
import type { MenuRow, OpenMenu } from './favorites.model'

/** What every level's FolderMenu.vue is given (the widget's state and handlers). */
export type FolderMenuCtx = {
  openMenus: Ref<OpenMenu[]>
  dropTargetFolderId: { readonly value: string | null }
  isDragging: () => boolean
  paneCount: (locations: string[] | undefined) => number
  favTip: (label: string | undefined, locations: string[] | undefined) => string
  onRowClick: (row: MenuRow, e: MouseEvent, level: number) => void
  onFolderHover: (row: MenuRow, el: HTMLElement, level: number) => void
  onItemHover: (level: number) => void
  onDropdownMenu: (folderId: string | null, e: MouseEvent) => void
  onFavoriteMenu: (id: string, e: MouseEvent) => void
  onFolderNodeMenu: (id: string, e: MouseEvent) => void
  removeFolder: (id: string) => void
  removeFavorite: (id: string) => void
  startMenuRowDrag: (row: MenuRow, folderId: string, e: PointerEvent) => void
  setMenuContainerRef: (menu: OpenMenu, el: HTMLElement | null) => void
  setMenuRowRef: (row: MenuRow, el: HTMLElement | null) => void
}

type PopoverHandle = { close(): void; update(props: Record<string, unknown>): void }
type Ui = {
  openPopover(opts: Record<string, unknown>): PopoverHandle | null
}

export type UseFolderPopoversOptions = {
  ui: () => Ui | undefined
  openMenus: Ref<OpenMenu[]>
  isSidebar: () => boolean
  component: Component
  /** Given to every level's FolderMenu (markRaw'd: functions and refs, read as they are). */
  ctx: object
}

/** The dropdowns' frame: Favorites' own dark look (GEM Shell's popover style, sanitised there). */
const MENU_STYLE = { background: 'rgba(10, 10, 10, 0.98)', borderColor: 'rgba(255, 255, 255, 0.14)', radius: 8, shadow: 'large', padding: 0 }

export function useFolderPopovers(opts: UseFolderPopoversOptions) {
  type Open = { folderId: string | null; anchor: HTMLElement; handle: PopoverHandle | null }
  const levels: Open[] = []
  const ctx = markRaw(opts.ctx)
  let syncing = false

  function closeFrom(i: number) {
    if (i >= levels.length) return
    const first = levels[i]
    levels.length = i
    first.handle?.close()   // GEM Shell closes its children with it
  }

  function sync() {
    const menus = opts.openMenus.value
    const ui = opts.ui()
    syncing = true
    try {
      // The levels still right
      let i = 0
      while (i < levels.length && i < menus.length && levels[i].folderId === menus[i].folderId && levels[i].anchor === menus[i].anchor) i++
      closeFrom(i)
      for (let k = i; k < menus.length; k++) {
        const m = menus[k]
        const anchor = m.anchor
        if (!ui || !anchor || !anchor.isConnected) { cut(k); return }
        const entry: Open = { folderId: m.folderId, anchor, handle: null }
        const handle = ui.openPopover({
          anchor,
          component: opts.component,
          props: { level: k, ctx },
          placement: k === 0 && !opts.isSidebar() ? 'below' : 'right',
          parent: k === 0 ? null : levels[k - 1]?.handle ?? null,
          hover: k > 0,
          maxWidth: 320,
          maxHeight: 640,
          style: MENU_STYLE,
          onClose: () => onClosed(entry),
        })
        if (!handle) { cut(k); return }
        entry.handle = handle
        levels[k] = entry
      }
    } finally {
      syncing = false
    }
  }

  /** openMenus loses level k and those under it (a level that couldn't open). */
  function cut(k: number) {
    if (opts.openMenus.value.length > k) opts.openMenus.value = opts.openMenus.value.slice(0, k)
  }

  /** GEM Shell closed a level (or we did): openMenus follows. */
  function onClosed(entry: Open) {
    if (syncing) return
    const i = levels.indexOf(entry)
    if (i < 0) return
    levels.length = i
    cut(i)
  }

  watch(() => opts.openMenus.value.map(m => [m.folderId, m.anchor] as const), () => sync(), { flush: 'post' })

  /** The instance goes: its popovers too. */
  function dispose() { closeFrom(0) }

  return { dispose }
}
