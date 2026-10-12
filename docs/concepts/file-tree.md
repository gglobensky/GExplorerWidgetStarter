# File tree concept

## Product goal

The File Tree provides fast navigation without becoming a permanently expanded map of every drive and service. A root selector keeps one navigational world in view at a time. The tree remembers the user's place in each root, so switching roots is quick without accumulating unrelated branches in one hierarchy.

Sidebar is the first context. Grid can later provide a roomier navigation view. Toolbar should wait until the host exposes an anchored popover suitable for interactive widget content.

## Root selector

The top row displays the current root's icon, name and availability. Activating it opens a searchable, grouped selector:

- **Hubs** — Home and every installed/configured GEM Hub.
- **Favorites** — favorite folders that can become temporary focused roots; favorite files remain direct destinations.
- **Files** — local drives, removable drives and user-added folders.
- **Services** — registered VFS roots and, eventually, network locations.
- **System** — Recycle Bin when supported.
- **Available later** — optional disabled entries such as Network or Recycle Bin while their host provider is unavailable.

The selector should show recently used roots first and allow a small set of favorites. It should not render every root permanently above the tree. Disabled future roots belong in a clearly labelled secondary section and include a short explanation; they must never look clickable and then fail.

Root types have different behavior:

- A filesystem or hierarchical VFS root opens a navigable tree.
- A Hub is a navigation destination. If the Hub later exposes a hierarchy, the public root descriptor can say so.
- A special root such as Recycle Bin opens its host-provided listing and actions.
- An unavailable root describes what is missing without fabricating contents.

Switching roots preserves, per root, the expanded paths, selected path, scroll anchor and an optional temporary focus folder. Returning to a root restores that state.

Selecting a favorite folder navigates to it and focuses the tree there. This makes Favorites useful as clean entry points rather than reproducing their full hierarchy beside every drive. A favorite file opens through the host and does not become a tree root.

## A cleaner tree model

### Active path spine

The selected folder and its ancestors form the active spine. They receive stronger visual continuity than unrelated open branches. Navigation caused by the address bar, Back/Forward or another widget should reveal the spine without unexpectedly expanding every sibling.

A “keep tidy” preference can collapse branches that the user did not explicitly pin. Explicitly opened branches remain open. This avoids an aggressive accordion that continually destroys the user's exploration state.

### Focus a folder

Deep indentation wastes most of a narrow sidebar. “Focus this folder” temporarily promotes any folder to the top of the visible tree. A compact breadcrumb above the rows returns to its parent or original root. This preserves readable names at depth without horizontal scrolling.

Focused mode must always have an obvious exit. A persistent strip directly below the root selector shows `Focused: <folder>` and an `Entire <root>` button. The tree context menu also exposes “Exit focused view.” Leaving focus restores the root's previous expansion and scroll state rather than discarding it.

### Branch minimization

Every folder row's context menu includes:

- **Minimize all** — collapse every expanded branch in the current hierarchical root to its first level.
- **Minimize others** — preserve the right-clicked branch, its expanded descendants and the ancestors required to keep it visible; collapse every branch outside it.

These commands operate only within the selected root. They do not alter the remembered state of other roots. “Minimize others” is a quick manual cleanup and does not enable automatic accordion behavior.

### Predictable rows

- The disclosure control expands or collapses; the remaining row navigates.
- The disclosure target uses the full row height rather than a tiny triangle.
- Names truncate with a tooltip; the tree never introduces a horizontal scrollbar.
- Loading appears beneath the folder being expanded, without blocking other branches.
- Access errors stay inline with Retry and a plain explanation.
- Empty folders settle immediately instead of briefly showing a misleading disclosure state.
- File-system refreshes preserve selection and the scroll anchor.
- Stable full paths identify filesystem nodes; provider-issued stable IDs identify virtual nodes where available.

### Keyboard and assistive input

- Up/Down move through visible rows.
- Left collapses or moves to the parent; Right expands or moves to the first child.
- Home/End move to the first/last visible row.
- Enter navigates; Space toggles expansion.
- Type-ahead jumps among visible siblings.
- Tree, treeitem, level, expanded, selected, busy and disabled states are exposed with standard semantics.
- Touch and pen targets remain comfortable in the narrow layout.

## Features that improve on conventional trees

- **Per-root memory:** every root resumes where the user left it.
- **Focused subtree:** any deep folder can temporarily become the visible root.
- **Favorites as focus points:** favorite folders are clean, named entrances into deep locations.
- **Pinned branches:** a user can preserve a working branch while automatic tidying collapses incidental exploration.
- **Recent roots:** fast switching without keeping all roots expanded.
- **Reveal current location:** always available, but it does not steal scroll position while the user is manually exploring unless Follow is enabled.
- **Follow toggle:** Follow keeps the active location visible; Browse lets the user inspect elsewhere without the tree snapping back.
- **Copy path and open in new tab:** common navigation commands belong in the host context menu.
- **Honest capability states:** offline, disconnected, unavailable and coming-later roots have distinct visuals and explanations.
- **No recursive pre-scan:** children load only when a branch opens, keeping huge filesystems responsive.

Compacting single-child folder chains can be considered as an opt-in display mode. It saves space but can make individual folder operations and mental mapping less clear, so it should not be the default.

## Current public API fit

The public widget surface already supports much of a filesystem-root version:

- `getDrives()` and `subscribeDrives()` provide drive roots.
- `sdk.openListing()` provides paged, sorted, refreshable child listings.
- `ListingFilter.kinds` can request folders only.
- `runAction({ type: 'nav', to })` navigates through the host.
- `iconFor()` and `ensureIconsFor()` provide consistent icons.
- `sdk.ui().pickFolder()` can add a user-selected root with host-managed read consent.
- `sdk.getGlobalFavorites()` supplies the current Favorites tree when the widget declares the `Favorites` capability.

Each expanded node should own one listing source. Opening a node creates it; collapsing the node closes it and releases its watcher. Child folders are read in small visible ranges. The widget must not recursively enumerate a whole root.

Known UNC paths or mapped network drives can behave like ordinary filesystem roots when the host picker and listing service can access them. Network discovery and share enumeration are separate capabilities.

## Host API gaps

Each gap below states the tree behavior that requires it. This makes it possible to revisit the widget after a Shell sprint and connect the new contract without re-evaluating the entire design.

### Reactive, pane-scoped navigation

**Needed for:** keeping the selected row and active-path spine synchronized with Back, Forward, the address bar and navigation initiated by other widgets, including the correct side of a split pane.

`getCurrentPath()` is a one-time global read. The tree needs an instance-bound, read-only current locator that updates for Back, Forward, address-bar navigation and navigation initiated by another widget. It must be scoped to the pane the widget controls, especially when split panes exist.

A suitable surface could be `sdk.navigation()` with a reactive `currentLocator` and root identity, while `runAction({ type: 'nav' })` continues to perform navigation.

### Root and Hub catalog

**Needed for:** listing every configured GEM Hub in the root selector, discovering installed hierarchical VFS roots, showing host-provided labels/icons, and reflecting additions or removals without hard-coded root names.

Hubs are known internally through virtual-page configuration, and VFS providers are registered internally, but widgets cannot enumerate either collection. The tree should not hard-code Hub names or inspect configuration files belonging to the Shell.

The host should expose a reactive root catalog with stable fields such as:

```ts
type NavigationRoot = {
  id: string
  label: string
  locator: string
  kind: 'hub' | 'filesystem' | 'vfs' | 'special'
  icon?: string
  hierarchical: boolean
  available: boolean
  unavailableReason?: string
  capabilities?: Array<'list' | 'navigate' | 'watch' | 'restore' | 'empty'>
}
```

The catalog should merge Shell Hubs, drives, host special locations and installed VFS providers. Widgets then render what is available without assuming which Hubs exist.

### Favorites change subscription

**Needed for:** updating the root selector immediately when Favorites are added, removed, renamed, moved or reorganized anywhere else in GEM Shell.

The SDK can read Favorites, but it does not expose a host-owned reactive subscription. The existing Favorites widget broadcasts a convention through widget messaging after its own changes; that is not a complete notification contract for every Shell or widget source. The host should expose either a reactive Favorites source or an instance-bound change subscription. The tree can then reload `getGlobalFavorites()` after a notification.

### Recycle Bin listing and actions

**Needed for:** making Recycle Bin a real selectable root with live contents and safe restore, permanent-delete and empty commands.

The Shell already has internal recycle, capacity and restore machinery, but the public SDK does not expose the Recycle Bin as a listing root. A future special-location provider should supply:

- Paged entries with original path, deletion time, size, kind and source drive.
- Change notifications.
- Restore, permanent delete and empty actions with the host's existing confirmation, elevation, progress and undo behavior.
- A capability descriptor so the tree can hide or disable unsupported commands on other platforms.

Until that exists, Recycle Bin can appear only as an explicitly unavailable future root in design previews or configuration. The production tree should not attempt to read platform trash directories directly.

### Network locations

**Needed for:** showing a functional Network root that discovers machines/shares, reports connection state and lets the user authenticate through host-owned UI.

`sys:network` is currently a networking settings page, not a browsable LAN/SMB root. A true Network root needs host-owned discovery and authentication, or a VFS provider that supplies those functions. The public root catalog should report whether discovery is available.

Before discovery exists, users may add a known UNC path or mapped drive through the normal folder-root flow when the host supports it. A disabled “Network locations” entry in the selector can communicate the planned destination without placing a dead row in the active tree.

## Delivery sequence

1. Build the root-selector and tree interaction preview against a `RootSource` adapter with filesystem fixtures and clearly labelled unavailable Hub/Recycle/Network fixtures.
2. Implement drives and user-selected folders using public listings.
3. Add pane-scoped navigation synchronization when the host API exists.
4. Connect the public root catalog and enable Hubs/VFS sources without hard-coded names.
5. Connect Recycle Bin and Network providers as their capabilities arrive.
6. Add the grid context after the sidebar interaction is stable.

The adapter lets the UI advance while keeping every missing host integration visible and replaceable. It must not read Shell configuration or internal provider registries as a workaround.
