# File Tree widget handoff

## Objective

Create a new `ExampleWidget_FileTree` widget with a polished sidebar-first navigation experience. Its defining interaction is a root selector that keeps only one hierarchy visible at a time. The implementation must use the public widget SDK and record missing capabilities without importing GEM Shell internals.

Read the full product and API design first:

- `docs/concepts/file-tree.md`
- `types/widgets-sdk.d.ts`

The related future concepts are recorded in `docs/concepts/notes-board.md` and `docs/concepts/app-snapper.md`; they are outside this implementation session.

## Established product decisions

- Sidebar is the first production context.
- The root selector groups Hubs, Favorites, Files, Services, System and optionally Available later.
- Only one hierarchical root is shown in the tree at a time.
- Filesystem/VFS roots provide trees. Hubs are navigation destinations unless a future root descriptor marks them hierarchical.
- Favorite folders navigate and enter focused view. Favorite files remain direct destinations.
- Each root remembers expansion, selection, scroll position and focused folder independently.
- Focused view has an always-visible `Entire <root>` exit control and an “Exit focused view” context-menu command.
- A folder context menu contains “Focus this folder,” “Minimize all” and “Minimize others.”
- “Minimize all” collapses the current root to its first level.
- “Minimize others” keeps the clicked branch, its expanded descendants and required ancestors, while collapsing everything outside that branch.
- Rows never create a horizontal scrollbar. Deep navigation is handled by focused view, truncation and tooltips.
- Listing is lazy. Open a source only for an expanded branch and close it when the branch collapses.
- Follow and Browse are separate modes so external navigation cannot continually steal the user's scroll position.
- Hubs, Recycle Bin and Network must not be implemented through private Shell configuration, platform folders or internal registries.

## Public APIs available now

- `getDrives()` / `subscribeDrives()` for drives.
- `sdk.openListing(path, { filter: { kinds: ['dir'] } })` for folder children.
- `runAction({ type: 'nav', to: path })` for host navigation.
- `iconFor()` / `ensureIconsFor()` for icons.
- `sdk.ui().pickFolder({ access: 'read' })` for user-added folder roots.
- `sdk.getGlobalFavorites()` with the `Favorites` capability for the Favorites hierarchy.
- `sdk.ui().contextMenu()` plus manifest menu declarations for host-owned row menus.
- `getCurrentPath()` for an initial best-effort path snapshot only.

## API gaps and the behavior each one blocks

1. **Reactive, pane-scoped current locator**
   - Needed to synchronize the selected row and active-path spine with Back, Forward, the address bar and other widgets, especially in split panes.
   - Do not poll `getCurrentPath()` as a workaround.

2. **Reactive navigation-root and Hub catalog**
   - Needed to enumerate configured Hubs and registered VFS/special roots with stable IDs, labels, icons, hierarchy and availability.
   - Do not hard-code Hub names or read `widget-libraries/grid/*` directly.

3. **Favorites change subscription**
   - Needed to refresh the selector after Favorites change elsewhere in the Shell.
   - The Favorites widget's `favorites:changed` message is a peer convention, not a complete host notification contract; do not treat it as authoritative.

4. **Recycle Bin provider**
   - Needed for paged contents, original location/deletion metadata, watching, restore, permanent delete and empty operations.
   - Do not read `$Recycle.Bin` or platform trash directories.

5. **Network discovery/provider**
   - Needed for machine/share discovery, availability and host-owned authentication.
   - `sys:network` is settings, not a browsable network root. Known UNC paths or mapped drives may be ordinary user-added roots if the public picker/listing APIs support them.

Keep these gaps in the new widget's own `API-GAPS.md`, including the blocked behavior, suggested contract and exact place where the widget can later connect it.

## Suggested first-session scope

1. Scaffold `ExampleWidget_FileTree` and its isolated preview/build configuration without changing Shell code.
2. Define a `RootSource` adapter so production sources and preview fixtures share the same UI model.
3. Build the root selector, focused-view strip and a responsive sidebar shell.
4. Implement drives and user-selected folders through public APIs.
5. Implement lazy folder expansion, cleanup, loading/error rows and stable expansion state.
6. Implement Favorites as focus destinations from `getGlobalFavorites()`.
7. Add the host context menu and the three branch commands.
8. Add keyboard tree semantics, focus handling, tooltips and reduced-motion behavior.
9. Create `API-GAPS.md` before adding preview fixtures for unavailable Hubs, Recycle Bin or Network.
10. Verify build output without committing or pushing unless the user requests it.

## Preview fixtures versus production behavior

The isolated preview may contain clearly labelled sample Hubs, Recycle Bin and Network roots to validate layout and unavailable states. Production code should show only roots supplied by public APIs, plus deliberate “Available later” entries approved as product UI. Fixtures must never inspect or emulate private Shell services.

## Repository state and boundaries

- The repository already contains uncommitted Weather widget and build-configuration work. Preserve it.
- Do not modify `ExampleWidget_GExplorer`, `ItemsWidget_V1.0`, `ExampleWidget_LocalPlayer`, P2P features or GEM Shell source.
- Public API issues belong in the new widget's `API-GAPS.md`; implementation pauses at the missing integration point.
- The tree should have its own build entry and preview rather than replacing the root starter widget.

## First review checkpoint

Before connecting real listings, review a preview showing:

- Switching among several roots while each preserves its state.
- A favorite folder entering and exiting focused view.
- Deep paths without horizontal scrolling.
- “Minimize all” and “Minimize others” on a branched fixture.
- Loading, empty, access-denied and unavailable-root states.
- Narrow and moderately wide sidebar allocations.

After the interaction is accepted, connect drives, Favorites and filesystem listings through the public SDK.
