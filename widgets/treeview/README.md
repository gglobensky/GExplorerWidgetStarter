# Tree View · adaptive sidebar, grid and toolbar build

`widgets/treeview` builds the `treeview` runtime widget for the **sidebar**, **grid** and **toolbar**. It uses real drives and global Favorites through the public SDK.

Tree View opts into the Shell's `contexts.sidebar.fillRemaining` layout contract. The sidebar row consumes the available height without extending the sidebar document, while the tree viewport handles overflow with the shared scroll-hint controls.

## Build and install

From the starter folder:

```powershell
npm run typecheck -- treeview
npm run test -- treeview
npm run build -- treeview
```

`build` writes `dist/runtime-widgets/treeview/index.js` and installs it in GEM Shell's `UserInterface/public/runtime-widgets/treeview/` (where GEM Shell is: the starter's README); `--no-install` builds only. It does not change Shell source or the user's sidebar configuration.

Build GEM Shell in Release, start it, then choose **Tree View** in the sidebar, grid, or toolbar widget picker. The host discovers runtime-widget directories. Allow the widget's Read, Metadata, Clipboard, Write and Favorites permissions through the normal host UI.

## Behavior

- A searchable **Go to** chooser with Recent, Files, and Favorites groups; one hierarchy at a time. Drive roots show free and total capacity plus a usage bar. Root tooltips also show the path, kind and remembered top-level folder count.
- Below 242px, the tree becomes a depth window: it shows the current folder's immediate children plus a folder-up control. Opening a child advances one level; the folder-up control returns to its parent. Widening restores the full expanded tree.
- In a grid cell 448px or wider, each opened folder gets its own column. The current branch stays visible across the row, each column scrolls independently, and shared left/right paging controls appear when deeper levels overflow. The strip returns to its right edge after remount so the deepest remembered folder is visible first. Header fold controls close their column and every deeper level. Smaller grid cells use the normal expandable tree; cells below 242px keep the depth window.
- In the toolbar, the active root sits between previous/next controls. Clicking it opens the tree in the Shell-owned popover layer, outside the toolbar's clipping boundary. Navigation closes the popover; outside click and Escape are handled by the host.
- Each root remembers expansion, selection, focus, loaded-page limits and scroll anchor for the host instance's lifetime, including sidebar suspend/remount. Session navigation state is not written to disk.
- **New folder** (`+`) creates a uniquely named folder in the deepest visible level, reveals it even when it falls beyond the current 80-row page, and opens the shared inline rename overlay. The widget uses the host's Write permission for both creation and rename.
- Folder disclosure expands; the label navigates. Only folders are listed. Favorite files open directly; favorite folders navigate and enter focused view.
- Hovering a folder shows its direct subfolder count and full path in the shared tooltip. Protected folders say **Needs elevated access**; the hover probe never opens a consent prompt. Unknown counts use a short-lived listing source that closes as soon as the count arrives or the pointer leaves; no descendant scan is performed.
- Focused view always offers `Entire <root>`. Context menu: OS Copy, Cut and Paste into folder, Focus, Exit focused view and Refresh. Outline layouts also offer Minimize all and Minimize others; column layouts omit them because they show only one active branch. Ctrl+C, Ctrl+X and Ctrl+V operate on the keyboard-focused folder through the same public clipboard APIs.
- Each expanded branch owns a source. Collapse, root change, suspension and unmount release sources. Large folders expose another 80 rows through Show more; requests are batched and visible rows are virtualized. No recursive prescan.
- Keyboard: Up/Down, Left/Right, Home/End, Enter, Space and sibling type-ahead. Home/End refer to loaded rows; Show more is a keyboard-accessible button. Full paths are available as tooltips.
- The shared `useScrollHints` API supplies small top and bottom paging controls whenever the tree or root chooser overflows. Native vertical scrollbars are hidden. In column view a normal wheel scrolls the hovered column vertically, while horizontal wheel/trackpad input scrolls the columns.
- In the sidebar, the widget fills the remaining vertical space. Its fixed header and location controls stay visible while only the folder rows scroll.
- Favorites reload on mount, explicit Refresh, and whenever they change anywhere (the `favorites` host topic). Live Follow is not built yet (the `location` topic it needs exists); special-root integrations remain unavailable; see `API-GAPS.md`.

## Isolated interaction preview

```powershell
npm run preview -- treeview
```

Open the address it prints (`/widgets/treeview/preview/`). This sample-data page contains sidebar width adjustment, the adaptive grid view, toolbar root arrows/dropdown, focused favorites, context-menu commands, empty/loading/access-error states, and a 5,000-folder fixture. The source count exposes watcher cleanup. Sample roots and the preview's local overlay code are not imported by the production build.

Toolbar uses the shared horizontal scroll-hint interface in the preview. Browsing roots does not navigate; selecting a folder closes the dropdown, as do outside click and Escape. Production uses `sdk.ui().openPopover()` so the Shell owns positioning, clipping escape, outside-click handling, Escape and lifecycle teardown.

## Validation and limits

Controller tests exercise identity boundaries, lazy expansion, reopening remembered descendants, bounded pages, watcher disposal, root switching, delayed results, access-denied retry and empty folders. The browser preview exercises the shared UI. These checks do not prove host consent, native icons, real listings or context menus; the Release copy is the next manual integration checkpoint.

The folder you're browsing when the tree opens (`sdk.getCurrentPath()`, Location cap) selects its containing root when available. Automatic ancestor revelation and Follow/Browse can be built on the `location` host topic (not done yet). Folder links (junctions, directory symlinks) are listed with the folders, marked ↗; hovering one says where it points. File links and `.lnk` shortcuts are not listed. Automatic tidying and pinned branches are deferred.
