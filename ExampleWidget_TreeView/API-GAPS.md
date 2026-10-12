# Tree View host integration gaps

The production entry supports sidebar, grid and toolbar contexts. It imports only Vue and `gexplorer/widgets` and uses the injected SDK. Sample roots and the toolbar's local preview overlay exist only in `preview/`; production uses the host-owned `ui().openPopover()` API.

| Missing public contract | Blocked behavior | Connection point |
| --- | --- | --- |
| Reactive pane-scoped current locator and root identity | Follow/Browse synchronization, automatic ancestor reveal after address bar/Back/Forward/other widgets. No polling workaround. | `Widget.vue`: replace initial `getCurrentPath()` snapshot with an instance-scoped source; extend controller path reveal. |
| Reactive root catalog with stable IDs, locator, label, kind, hierarchy, availability and capabilities | Installed Hubs, VFS, Recycle Bin and network roots | `Widget.vue` roots computed source; `Root` / `RootSource` in `tree.ts`. Filesystem identity is currently normalized separately; virtual providers need stable IDs. |
| Authoritative Favorites subscription | Immediate changes from all host and widget sources | `refreshRoots()` in `Widget.vue`; currently refresh on mount, selector open and explicit Refresh. |
| Recycle Bin listing/action provider | Restore, permanent delete, empty, metadata and live contents | Root catalog adapter. Never read platform trash folders. |
| Network discovery and authentication provider | Discover machines/shares and connection state | Root catalog adapter. Known UNC folders may use the normal picker; `sys:network` is not a discovery root. |
| Public directory-link classification/traversal contract | Junctions and symbolic folder links in the tree | `Widget.vue` folder filter is `kinds: ['dir']`. The listing type distinguishes `link` but does not guarantee it targets a folder. Do not treat every link as a directory. |
| Clipboard-change subscription | Live cut-state styling when another application or GExplorer changes the OS clipboard | Basic copy, cut and paste already work through `clipboardCopyFiles`, `clipboardCutFiles` and `fsPasteClipboard`. A public event stream would avoid polling solely to fade or clear cut rows. |

Unavailable examples are labelled in the isolated preview only. Production does not advertise unavailable Hubs or special providers.
