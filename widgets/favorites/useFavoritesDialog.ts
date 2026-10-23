// /src/widgets/favorites/useFavoritesDialog.ts
import { ref, computed, inject } from 'vue'
import {
  FavoriteTreeNode,
  type WidgetSdk
} from 'gexplorer/widgets'
import { guessLabelFromPath } from './favorites.model'

export type UseFavoritesDialogOptions = {
  /** Reads the favorites again (and keeps open folder menus in step). */
  refresh: () => Promise<void>
}

export type FolderOption = { id: string; label: string; depth: number }

export function useFavoritesDialog(opts: UseFavoritesDialogOptions) {
  // The user's favorites come through the widget's SDK ('Favorites' cap in entry.ts).
  const sdk = inject<WidgetSdk>('widgetSdk')
  const need = <K extends keyof WidgetSdk>(k: K): NonNullable<WidgetSdk[K]> => {
    const f = sdk?.[k]
    if (!f) throw new Error(`the SDK has no ${String(k)}: declare the 'Favorites' capability in entry.ts`)
    return f as NonNullable<WidgetSdk[K]>
  }
  const { refresh } = opts

  // Dialog state
  const showAddDialog = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  // Form fields. A favorite opens a place (2026-10-22): one location, or 2-4 folders side by side.
  const newLocations = ref<string[]>([''])
  const newLabel = ref('')
  const addMode = ref<'item' | 'folder'>('item')
  const newParentId = ref<string>('') // '' = root, otherwise a folder id

  // Folder options for parent dropdown
  const folderOptions = ref<FolderOption[]>([])

  // Computed labels
  /** The favorite being edited (Edit…, 2026-10-23); null: adding. */
  const editingId = ref<string | null>(null)

  const addDialogTitle = computed(() =>
    editingId.value ? 'Edit favorite' : addMode.value === 'folder' ? 'Add folder' : 'Add favorite'
  )

  const addButtonLabel = computed(() =>
    editingId.value ? 'Save' : addMode.value === 'folder' ? 'Create' : 'Add'
  )

  /** The most folders a favorite opens side by side (the most panes a tab has). */
  const MAX_LOCATIONS = 4

  /** The locations typed, trimmed, empty rows left out. */
  const filledLocations = computed(() => newLocations.value.map(l => l.trim()).filter(Boolean))

  /** The name a favorite gets when no label is typed (the service's default too). */
  const labelPlaceholder = computed(() => {
    if (addMode.value === 'folder') return 'New folder'
    const names = filledLocations.value.map(guessLabelFromPath).filter(Boolean)
    return names.length ? names.join(' + ') : 'Downloads'
  })

  const canAddLocation = computed(() => newLocations.value.length < MAX_LOCATIONS)

  function addLocationRow() {
    if (canAddLocation.value) newLocations.value = [...newLocations.value, '']
  }

  function removeLocationRow(index: number) {
    const next = newLocations.value.filter((_, i) => i !== index)
    newLocations.value = next.length ? next : ['']
  }

  // The folder dialog this popup opened, while it is shown: closing the popup closes it too (2026-10-23)
  let picking: AbortController | null = null

  /** Row <index> gets a folder chosen in the host's folder dialog. */
  async function browseLocation(index: number) {
    const ui = sdk?.ui?.()
    if (!ui?.pickFolder || picking) return
    const current = newLocations.value[index]?.trim()
    const ctrl = new AbortController()
    picking = ctrl
    let chosen: string | null = null
    try {
      chosen = await ui.pickFolder({ title: 'Folder for this favorite', startIn: current || undefined, acceptLabel: 'Use this folder', signal: ctrl.signal })
    } finally {
      if (picking === ctrl) picking = null
    }
    if (!chosen || ctrl.signal.aborted || !showAddDialog.value) return
    const next = newLocations.value.slice()
    next[index] = chosen
    newLocations.value = next
  }

  /**
   * Build folder options for the parent dropdown
   */
  async function refreshFolderOptions() {
    try {
      const tree = await need('getGlobalFavorites')()

      const opts: FolderOption[] = []

      const walk = (nodes: FavoriteTreeNode[], depth: number) => {
        for (const n of nodes) {
          if (n.kind === 'folder') {
            opts.push({ id: n.id, label: n.label, depth })
            walk(n.children, depth + 1)
          }
        }
      }

      walk(tree, 0)
      folderOptions.value = opts
    } catch (e) {
      console.error('[favorites] refreshFolderOptions failed:', e)
      // keep previous options if something goes wrong
    }
  }

  /**
   * Open the add dialog (prefills with current path)
   */
  function openAddDialog() {
    // The folder you're browsing ('Location' cap in entry.ts)
    const base = (sdk?.getCurrentPath?.() ?? '').trim()
    openAddDialogWith(base ? [base] : [])
  }

  /**
   * Open the add dialog on a place (the menus' "Add to favorites…": the folders chosen, or the place a
   * tab shows). More than 4: the first 4, and the user is told.
   */
  function openAddDialogWith(locations: string[]) {
    const list = locations.map(l => l.trim()).filter(Boolean)
    editingId.value = null
    addMode.value = 'item'
    newLocations.value = list.length ? list.slice(0, MAX_LOCATIONS) : ['']
    newLabel.value = ''
    newParentId.value = '' // root by default
    error.value = list.length > MAX_LOCATIONS
      ? `A favorite opens up to ${MAX_LOCATIONS} folders side by side: the first ${MAX_LOCATIONS} are here.`
      : null

    void refreshFolderOptions()
    showAddDialog.value = true
  }

  /**
   * The dialog on favorite <id> (its menu's Edit…): its folders, name and the folder it is in.
   */
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
    if (!found) { void sdk?.ui?.().snack({ text: 'This favorite no longer exists.' }); return }
    const item = found as { label: string; locations: string[] }
    editingId.value = id
    addMode.value = 'item'
    newLocations.value = item.locations.length ? [...item.locations] : ['']
    newLabel.value = item.label
    newParentId.value = parentId
    error.value = null
    void refreshFolderOptions()
    showAddDialog.value = true
  }

  /**
   * Close the add dialog
   */
  function closeAddDialog() {
    showAddDialog.value = false
    error.value = null
    editingId.value = null
    picking?.abort()
    picking = null
  }

  /**
   * Confirm and execute add favorite/folder
   */
  async function confirmAddFavorite() {
    const locations = filledLocations.value
    const label = newLabel.value.trim()
    const parentId = newParentId.value || null

    saving.value = true
    error.value = null

    try {
      if (editingId.value) {
        if (!locations.length) return
        // An empty name: the default one (the folders' names)
        await need('updateFavorite')(editingId.value, { label, locations, parentFolderId: parentId })
      } else if (addMode.value === 'folder') {
        if (!label) return
        await need('addFolder')(label, parentId)
        await refreshFolderOptions()
      } else {
        if (!locations.length) return
        // Not a place (a page among folders, more than 4): the service says why, shown in the dialog
        const r = await need('addFavorite')(locations, label || undefined, parentId)
        if (!r.added) void sdk?.ui?.().snack({ text: `${label || labelPlaceholder.value} is already a favorite.` })
      }

      await refresh()

      closeAddDialog()
    } catch (e: any) {
      console.error('[favorites] addFavorite/addFolder failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
    } finally {
      saving.value = false
    }
  }

  /**
   * Remove a folder and all its nested contents
   */
  async function handleRemoveFolder(folderId: string) {
    // A box titled with the widget's name, by the host (sdk.ui()).
    const ok = await sdk?.ui?.().confirm(
      'Its favorites and the folders inside it go with it. This cannot be undone.',
      { title: 'Delete this folder?', okLabel: 'Delete', danger: true },
    )
    if (!ok) return

    error.value = null
    try {
      await need('removeFolder')(folderId)
      await refresh()
    } catch (e: any) {
      console.error('[favorites] removeFolder failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
    }
  }

  /**
   * Remove a favorite (by its id)
   */
  async function handleRemoveFavorite(id: string) {
    error.value = null
    try {
      await need('removeFavorite')(id)
      await refresh()
    } catch (e: any) {
      console.error('[favorites] removeFavorite failed:', e)
      error.value = String(e?.message ?? e ?? 'Error')
    }
  }

  return {
    // Dialog state
    showAddDialog,
    saving,
    error,

    // Form fields
    editingId,
    newLocations,
    newLabel,
    addMode,
    newParentId,

    // Folder options
    folderOptions,

    // Computed
    addDialogTitle,
    addButtonLabel,
    labelPlaceholder,
    canAddLocation,
    filledLocations,

    // Methods
    openAddDialog,
    openAddDialogWith,
    openEditDialog,
    addLocationRow,
    removeLocationRow,
    browseLocation,
    closeAddDialog,
    confirmAddFavorite,
    handleRemoveFolder,
    handleRemoveFavorite,
    refreshFolderOptions,
  }
}
