// /src/widgets/favorites/useFavoritesDialog.ts
//
// CHANGED 0.2.0 (2026-10-28): the add / edit dialog is FavoriteDialog.vue, shown by the host in the middle
// of the window (ui.openPopover placement 'center': "Favorites — Add favorite"), no longer this widget's
// own full-window backdrop. New folder asks for its name in the host's prompt.
import { inject, type Ref } from 'vue'
import type { FavoriteTreeNode, WidgetSdk } from 'gexplorer/widgets'
import FavoriteDialog from './FavoriteDialog.vue'
import type { FavoriteDialogProps } from './favorites.model'

export type UseFavoritesDialogOptions = {
  /** Reads the favorites again (and keeps open folder menus in step). */
  refresh: () => Promise<void>
  /** An element of this widget the dialog belongs to (the host closes it when it leaves the page). */
  anchor: Ref<HTMLElement | null>
}

/** The most folders a favorite opens side by side (the most panes a tab has). */
const MAX_LOCATIONS = 4

export function useFavoritesDialog(opts: UseFavoritesDialogOptions) {
  const sdk = inject<WidgetSdk>('widgetSdk')
  const need = <K extends keyof WidgetSdk>(k: K): NonNullable<WidgetSdk[K]> => {
    const f = sdk?.[k]
    if (!f) throw new Error(`the SDK has no ${String(k)}: declare the 'Favorites' capability in entry.ts`)
    return f as NonNullable<WidgetSdk[K]>
  }
  const { refresh, anchor } = opts
  const say = (text: string) => { void sdk?.ui?.().snack({ text }) }

  function show(title: string, props: FavoriteDialogProps): boolean {
    const ui = sdk?.ui?.()
    const at = anchor.value
    if (!ui || !at) return false
    const handle = ui.openPopover({
      anchor: at,
      component: FavoriteDialog,
      placement: 'center',
      // 0.4.2: a press on the dimmed page doesn't close it (the form would be lost): its ✕, Cancel or Escape do
      modal: true,
      title,
      maxWidth: 440,
      maxHeight: 560,
      props: { ...props, onSaved: refresh },
    })
    // Refused: not on screen, or not right after the user's own click
    if (!handle) say('Show the favorites bar to add a favorite with options.')
    return !!handle
  }

  /** The + button: the folder you're browsing ('Location' cap in entry.ts), at the top level. */
  function openAddDialog(parentId = '') {
    const base = (sdk?.getCurrentPath?.() ?? '').trim()
    openAddDialogWith(base ? [base] : [], parentId, true)
  }

  /**
   * The add dialog on a place (the menus' "Add to favorites…": the folders chosen, or the place a tab
   * shows), in folder <parentId>. More than 4: the first 4, and the user is told.
   */
  function openAddDialogWith(locations: string[], parentId = '', canSwitch = false) {
    const list = locations.map(l => l.trim()).filter(Boolean)
    show('Add favorite', {
      mode: 'item',
      locations: list.slice(0, MAX_LOCATIONS),
      parentId,
      canSwitch,
      notice: list.length > MAX_LOCATIONS
        ? `A favorite opens up to ${MAX_LOCATIONS} folders side by side: the first ${MAX_LOCATIONS} are here.`
        : null,
    })
  }

  /** The dialog on favorite <id> (its menu's Edit…): its folders, name and the folder it is in. */
  async function openEditDialog(id: string) {
    const tree = await need('getGlobalFavorites')()
    let found: { label: string; locations: string[] } | null = null
    let parentId = ''
    const walk = (nodes: FavoriteTreeNode[], parent: string): boolean => {
      for (const n of nodes) {
        if (n.kind === 'item' && n.id === id) { found = n; parentId = parent; return true }
        if (n.kind === 'folder' && walk(n.children, n.id)) return true
      }
      return false
    }
    walk(tree, '')
    if (!found) { say('This favorite no longer exists.'); return }
    const item = found as { label: string; locations: string[] }
    show('Edit favorite', { mode: 'item', editingId: id, locations: item.locations, label: item.label, parentId })
  }

  /** New folder… (the menus): its name in the host's prompt, in folder <parentId> ('' = the top level). */
  async function newFolder(parentId = '') {
    const ui = sdk?.ui?.()
    if (!ui) return
    const name = await ui.prompt('Name of the new folder:', {
      title: 'New folder',
      value: 'New folder',
      okLabel: 'Create',
      validate: v => v.trim() ? null : 'A name is needed.',
    })
    if (name === null) return
    try {
      await need('addFolder')(name.trim(), parentId || undefined)
      await refresh()
    } catch (e: any) {
      say(`Folder not created: ${e?.message ?? e}`)
    }
  }

  /**
   * Remove a folder and all its nested contents. 0.3.11: asked first only when it holds something (an empty one goes
   * at once); GEM Shell's snackbar then offers Undo (everything back where it was).
   */
  async function handleRemoveFolder(folderId: string) {
    const folder = findFolder(await need('getGlobalFavorites')(), folderId)
    const inside = folder ? countInside(folder.children) : { items: 0, folders: 0 }
    if (inside.items || inside.folders) {
      const what = [
        inside.items ? `${inside.items} favorite${inside.items === 1 ? '' : 's'}` : '',
        inside.folders ? `${inside.folders} folder${inside.folders === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' and ')
      const ok = await sdk?.ui?.().confirm(
        `"${folder!.label}" holds ${what}. They go with it.`,
        { title: 'Remove this folder?', detail: 'Undo on the message that follows puts everything back.', okLabel: 'Remove', danger: true },
      )
      if (!ok) return
    }
    try {
      await need('removeFolder')(folderId)
      await refresh()
    } catch (e: any) {
      say(`Not removed: ${e?.message ?? e}`)
    }
  }

  /** Folder <id> in the tree (ids compared as GEM Shell does: case ignored). */
  function findFolder(nodes: FavoriteTreeNode[], id: string): Extract<FavoriteTreeNode, { kind: 'folder' }> | null {
    for (const n of nodes) {
      if (n.kind !== 'folder') continue
      if (n.id.toLowerCase() === id.toLowerCase()) return n
      const r = findFolder(n.children, id)
      if (r) return r
    }
    return null
  }

  /** The favorites and folders inside <nodes>, all levels. */
  function countInside(nodes: FavoriteTreeNode[]): { items: number; folders: number } {
    let items = 0, folders = 0
    for (const n of nodes) {
      if (n.kind === 'item') items++
      else { folders++; const c = countInside(n.children); items += c.items; folders += c.folders }
    }
    return { items, folders }
  }

  /** Remove a favorite (by its id). 0.3.11: no question; GEM Shell's snackbar offers Undo. */
  async function handleRemoveFavorite(id: string) {
    try {
      await need('removeFavorite')(id)
      await refresh()
    } catch (e: any) {
      say(`Not removed: ${e?.message ?? e}`)
    }
  }

  return {
    openAddDialog,
    openAddDialogWith,
    openEditDialog,
    newFolder,
    handleRemoveFolder,
    handleRemoveFavorite,
  }
}
