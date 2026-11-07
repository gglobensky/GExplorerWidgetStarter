# GEM Forge

Write, run and try widgets inside GEM Shell. Your AI can edit the project's files on disk while you watch the
preview. GEM Shell's part: `PhotinoVue1/FORGE-SHELL-ADDITIONS.md` (forge-1 to forge-4); the design:
`claude/plan-2026-11-06-code-playground.md` (project doc); the look: the "GEM Forge Prototype" artifact
(`docs/forge-samples/prototype/`).

**Its id must stay `forge`**: GEM Shell lets the built-in widget of that name build widgets, and no other.

## 0.1.0 (2026-11-07): 0.1a, the core
- **A project** is a folder (Open a folder…: every file, its subfolders too, `node_modules` / `.git` / `dist` left
  out; 300 files at most) or a sample in memory (Clock sample; Save to a folder… makes it a folder's). Each file is
  saved with its line ends and byte order mark as found.
- **Run** (▶ or F5): GEM Shell builds it (`sdk.dev().build`) and runs it as `dev-<project>` (`run`). **Live reload**
  runs it again after each save and each change on disk (an AI writing the files; `watch`). A build with problems
  leaves the last good one running: the preview says so.
- **A file changed on disk while you edited it here**: ⚠ in the Explorer, and the editor asks: Keep mine / Take the
  disk's.
- **Explorer** (● not saved), **Code** (CodeMirror 6: TypeScript, Vue, CSS, JSON; a tab per open file, each with its
  own undo), **Preview** (a real placement drawn by GEM Shell: grid, sidebar, toolbar; ⧉ a window), **Problems** (a
  click opens the line), **Output** (the project's console). Narrow: one part at a time, as tabs.
- **Copy for AI** (the project's files as one text) and **Copy problems** (the problems and the console).
- **Keys** (commands.ts, changeable in Keyboard shortcuts): GEM Shell hides shortcut combos from widgets, so the
  editor's are commands: Ctrl+S, Ctrl+Shift+S, F5, Ctrl+Z / Y, Ctrl+F / H, F3, Ctrl+A, Ctrl+D, Ctrl+/, Alt+↑ / ↓,
  Shift+Alt+↓, Ctrl+G, Ctrl+Space.
- Permissions: Develop (building), Read (the project's files), Write (saving them), Clipboard (Copy for AI).

## 0.1.1 (2026-11-07): 0.1b, pages of tiles, kept while away
- **Pages** (the bar under the buttons): Code and Preview to start; ＋ adds one (8 at most); double-click a page to
  rename it, right-click to rename or remove it (its parts leave the layout: ＋ Part brings them back).
- **Tiles** on a 12-column grid (GEM Shell's hub engine: the others make room). A tile holds parts as tabs; a tab's ⋯
  (or a right-click): **Detach** (its own tile), **Attach to…** (a tab of another tile), **Move to page…**, **Close**.
  **＋ Part**: ✓ on this page, "✓ (on <page>)" elsewhere (picking it moves it here). **✎ Arrange**: drag a tile by its
  head, resize it from its corner. Narrow: the page's parts as tabs, one at a time. Saved in this copy's view.
- **Kept while away** (the lifecycle): the project lives as long as this copy of GEM Forge (a tab switch finds it as
  it was: its watch, its runs, each file's undo and cursor); when GEM Shell puts the copy away or restarts, its
  snapshot brings it back: the folder read again, unsaved edits on top, the open files and cursors, live reload.

## 0.1.2 (2026-11-07): asks before GEM Shell closes

- Closing GEM Shell with unsaved edits asks: Save and close (Save all; a sample must be saved to a folder first),
  Close without saving, Keep for later (they come back next time), Cancel. No save bar: changing page asks nothing.
- A sample's unsaved marks come back with it after a restart.
- The Preview part works on any page (it showed nothing when it lived on a page other than the one you ran from).

## 0.1.3 (2026-11-07): 0.1c, real projects, install

- **New ▾** ▸ Empty widget… / Clock sample…: pick (or make, with the dialog's New folder) an EMPTY folder; its name is
  the project's (and the widget's id). GEM Forge writes the files there and opens it: Ctrl+S saves straight to disk.
  Every new project carries `AGENTS.md` (the rules, for your AI), `widgets-sdk.d.ts` (the SDK's typings) and a
  `tsconfig.json` pointing `gexplorer/widgets` at it. These three (and any `.md` / `.d.ts`) are never built.
- **Widget ▾** ▸ Install as / Update / Uninstall (GEM Shell asks each time). Install builds the widget under entry.ts's
  id; the build is kept while the files don't change (a slow first build: click Install again).
- **The Explorer's right-click:** GEM Shell's file menu (Open, Open with, Show in folder, Copy path…) plus Open in
  the editor.
- **GEM Shell's explorer ▸ a folder (or the folder shown) ▸ Open in GEM Forge.** Unsaved edits: Save / Don't save /
  Cancel first (also before New and Open a folder…).
- The Clock sample in memory is gone (a project restored from 0.1b in memory still has Save to a folder…).

Next: the toolbar and sidebar playgrounds (0.1d).

## Files
`entry.ts`, `Widget.vue` (the bar, the pages, the lifecycle), `layout.ts` (pages of tiles), `TileGrid.vue`, `project.ts` (the project: files, saving, the watch, running), `Explorer.vue`,
`CodeEditor.vue`, `PreviewPart.vue`, `Problems.vue`, `Output.vue`, `commands.ts`, `samples.ts`, `templates.ts` (New ▾), `raw.d.ts`, `forge.css`.
Bundles CodeMirror 6 (`codemirror`, `@codemirror/lang-*`: MIT).
