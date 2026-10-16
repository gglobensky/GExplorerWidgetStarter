# Tree View host integration gaps

The production entry supports sidebar, grid and toolbar contexts. It imports only Vue and `gexplorer/widgets` and uses the injected SDK. Sample roots and the toolbar's local preview overlay exist only in `preview/`; production uses the host-owned `ui().openPopover()` API.

| Missing public contract | Blocked behavior | Connection point |
| --- | --- | --- |
| Reactive root catalog with stable IDs, locator, label, kind, hierarchy, availability and capabilities | Installed Hubs, VFS, Recycle Bin and network roots | `Widget.vue` roots computed source; `Root` / `RootSource` in `tree.ts`. Filesystem identity is currently normalized separately; virtual providers need stable IDs. |
| Recycle Bin listing/action provider | Restore, permanent delete, empty, metadata and live contents | Planned as its own GEM Shell feature (with recovery of deleted files), not a tree-only provider. Never read platform trash folders. |
| Network discovery and authentication provider | Discover machines/shares and connection state | Planned with GEM Shell's LAN features, in its own session. Known UNC folders may use the normal picker; `sys:network` is not a discovery root. |

Unavailable examples are labelled in the isolated preview only. Production does not advertise unavailable Hubs or special providers.

## Closed (2026-10-15, claude/host-topics-design.md in the shell project)

- **Favorites changes**: `sdk.onHostChange('favorites', ...)` (Favorites cap) fires for every change, whatever its source; `Widget.vue` reloads favorites on it.
- **Current location**: `sdk.getCurrentPath()` and `sdk.onHostChange('location', ...)` (Location cap): what the path bar shows, with `cause` (navigate / back / forward / focus / tab / restore) and `own`. The shell decides which pane navigates; the tree only tells it where. Follow / Browse modes and ancestor reveal can now be built on the topic (not done yet: a widget feature, not a missing contract).
- **Clipboard changes**: `sdk.onHostChange('clipboard', ...)` (Clipboard cap) fires when any app changes the OS clipboard (Windows; not on Linux yet). Cut-row styling can be built on it (not done yet).
- **Folder links** (2026-10-16): listing rows carry `LinkTarget` ('dir' for junctions / directory symlinks); the tree lists `kinds: ['dir', 'dirLink']`, marks links ↗, and its tooltip says where each points (`sdk.fsLinkTarget`, asked on hover), including a target that no longer exists or a folder above the link. Broken links are not detected while listing (one read per link); expanding one shows the usual error.
