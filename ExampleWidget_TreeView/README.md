# Tree View · first review build

`ExampleWidget_TreeView` builds the `treeview` runtime widget. Production currently declares **sidebar** only. It uses real drives, user-picked folder roots and global Favorites through the public SDK.

Tree View opts into the Shell's `contexts.sidebar.fillRemaining` layout contract. The sidebar row consumes the available height without extending the sidebar document, while the tree viewport handles overflow with the shared scroll-hint controls.

## Build and copy to the local Release

From the starter directory:

```powershell
pnpm typecheck:treeview
pnpm test:treeview
pnpm build:treeview
pnpm copy:treeview:release
```

The copy step targets `C:\Repos\GEM Shell\Gexplorer\GExplorer\bin\Release\net8.0\win-x64\wwwroot\runtime-widgets\treeview\index.js` in the standard sibling-repository layout. It verifies the executable and runtime folder exist, backs up a different previous Tree View bundle, and verifies the copied SHA-256. It does not rebuild Shell, alter its source bundles, or edit the user's sidebar configuration. A custom release location can be passed with `-ReleaseRoot` to `tools/copy-treeview-release.ps1`.

Launch/restart that release's `GExplorer.exe`, then choose **Tree View** in the sidebar's widget picker. The host discovers runtime-widget directories. Allow the widget's Read and Favorites permissions through the normal host UI. A later full Shell rebuild may replace generated output; rerun the copy command afterward.

## Behavior

- A searchable **Go to** chooser with Recent, Files, and Favorites groups; one hierarchy at a time. Root tooltips show the path, kind, and remembered top-level folder count.
- Below 242px, the tree becomes a depth window: it shows the current folder's immediate children plus a folder-up control. Opening a child advances one level; the folder-up control returns to its parent. Widening restores the full expanded tree.
- Each root remembers expansion, selection, focus, loaded-page limits and scroll anchor for the host instance's lifetime, including sidebar suspend/remount. Added folders persist through host configuration. Session navigation state is not written to disk.
- Folder disclosure expands; the label navigates. Only folders are listed. Favorite files open directly; favorite folders navigate and enter focused view.
- Hovering a folder shows its direct subfolder count and full path in the shared tooltip. Unknown counts use a short-lived listing source that closes as soon as the count arrives or the pointer leaves; no descendant scan is performed.
- Focused view always offers `Entire <root>`. Context menu: Focus, Exit focused view, Minimize all, Minimize others, Refresh.
- Each expanded branch owns a source. Collapse, root change, suspension and unmount release sources. Large folders expose another 80 rows through Show more; requests are batched and visible rows are virtualized. No recursive prescan.
- Keyboard: Up/Down, Left/Right, Home/End, Enter, Space and sibling type-ahead. Home/End refer to loaded rows; Show more is a keyboard-accessible button. Full paths are available as tooltips.
- The shared `useScrollHints` API supplies small top and bottom paging controls whenever the tree or root chooser overflows. Native vertical scrollbars are hidden; wheel, touchpad and keyboard scrolling continue to work.
- In the sidebar, the widget fills the remaining vertical space. Its fixed header and location controls stay visible while only the folder rows scroll.
- Favorites reload on mount, selector opening and explicit Refresh. Live Follow and special-root integrations remain unavailable; see `API-GAPS.md`.

## Isolated interaction preview

```powershell
pnpm preview:treeview
```

Open `/ExampleWidget_TreeView/preview/` at the Vite URL. This sample-data page contains sidebar width adjustment, toolbar root arrows/dropdown, focused favorites, context-menu commands, empty/loading/access-error states, and a 5,000-folder fixture. The source count exposes watcher cleanup. Sample roots and overlay code are not imported by the production build.

Toolbar uses the shared horizontal scroll-hint interface in the preview. Browsing roots does not navigate; selecting a folder closes the dropdown, as do outside click and Escape. Production toolbar is deferred until the host exposes its internal anchored popover through the public SDK, including nested context-menu ownership and focus restoration.

## Validation and limits

Controller tests exercise identity boundaries, lazy expansion, reopening remembered descendants, bounded pages, watcher disposal, root switching, delayed results, access-denied retry and empty folders. The browser preview exercises the shared UI. These checks do not prove host consent, native icons, real listings or context menus; the Release copy is the next manual integration checkpoint.

The initial current-path snapshot selects its containing root when available. Automatic ancestor revelation and Follow/Browse require additional integration. Junctions/symbolic links are omitted because `link` does not identify whether the target is a directory. Grid context, automatic tidying and pinned branches are deferred.
