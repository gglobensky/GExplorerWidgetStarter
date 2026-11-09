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

## 0.1.4 (2026-11-07): 0.1d, the playground, Export .zip

- **The playground** (`playground.ts`): one Vue file, or a few lines of script (run in an async function with `sdk`
  and Vue's functions at hand; a single expression is printed: `1 + 1`). Its own project in memory (`pg-<copy>`),
  kept with the lifecycle, never "unsaved".
  - **Toolbar:** GEM Forge is a ⚒ button; its popover has a line or two, Enter runs (Shift+Enter: a new line). A
    script runs out of sight; a Vue file opens in a 📌 window (reopened on each run).
  - **Sidebar:** the editor, the result (its real placement) and the console, in a column.
  - **IDE:** ＋ Part ▸ Playground, the same at full size, plus Open as a project… (an empty folder: New project's empty
    widget with your try as its Widget.vue and the permissions you allowed).
  - Tries ▾ (examples, your last 20), Allowed ▾ (Read, Write, Network, Clipboard: declared in its entry.ts, GEM Shell
    asks at first use). F5 / Ctrl+S in its editor run it.
- **Export .zip…** replaces Copy for AI: the project's files (unsaved edits included, line ends and BOMs as on disk)
  in one archive, a folder named after the project. Made by GEM Forge itself (`zip.ts`, the browser's deflate) until
  GEM Shell has an archive API.
- Each project's console only shows its own messages.

## 0.1.5 (2026-11-07)

- **⤢ Full playground** (the toolbar's popover; ⤢ in the sidebar): the whole playground in a window of its own,
  "GEM Forge — Playground" (resizable, its place remembered): the IDE part's layout, its result shown in the window.
- The result windows have a title: "Playground (being edited) — Result", "<project> (being edited) — Preview".

## 0.1.6 (2026-11-07)

- Ctrl+A, Ctrl+Z, Ctrl+Y work in the toolbar playground's line (and any plain text field of GEM Forge).
- The Explorer: right-click a folder or the project's name: **New file…**, **New folder…** (an empty folder shows until
  it has files). "Open in the editor" went (a click does it).

## 0.1.7 (2026-11-07): layout v2

- **Several previews:** ＋ Part ▸ ＋ Another preview (or a preview tab's ⋯ ▸ Another preview here): a small one on
  Code, a big one on its own page; each keeps its own placement.
- **A finer grid:** 24 columns, rows half as tall. Your saved pages are converted (their tiles keep their places).
- **Simulating the space** (⇕ on a preview in sidebar or toolbar placement): the sidebar's height, between the
  smallest and the largest it may give (from entry.ts's sidebar minHeight / maxHeight when declared), Squeeze to min /
  Stretch to max; the toolbar row's width (or as wide as it wants).
- One highlight colour everywhere (selected text in the toolbar's line and the console as in the editor).

## 0.1.8 (2026-11-07): tabs and menus

- **The editor's tabs:** a right-click: Close, Close others, Close to the right, Close saved, Pin / Unpin, Copy path,
  Copy relative path, Show in folder (GEM Shell's explorer), Show in the Explorer, Tab rows 1–3. Pinned tabs come first
  (📌, no ×, kept by Close others). Drag a tab to reorder (GEM Shell's sortable, as its own tabs). A middle-click
  closes. The tabs that don't fit the rows shown: ▾ (the active one is brought into view).
- **The editor's right-click:** Cut, Copy, Paste, Select all, Indent, Unindent, Toggle comment, Duplicate line, Move
  line up / down, Go to line…, Find, Replace.

## 0.1.9 (2026-11-07): project files

- **The Explorer:** Ctrl+click and Shift+click select several; their right-click has Delete (to the Recycle Bin, GEM
  Shell asks) and GEM Shell's own items for them all. A file: **Rename…** (when other files import it: Rename and
  update — their imports follow — or Rename only), **Duplicate** (GEM Shell's copy). Delete and Rename are also
  commands with no key by default (Delete and F2 are GEM Shell's): give them one in Keyboard shortcuts.
- **The project's name** (pointer cursor): a click shows New file…, New folder…, Show in folder, Copy path.
- **New file / New folder** suggest a free name with your naming pattern (Settings ▸ New items: "Untitled (2).vue"), and
  a taken name typed gets it too.
- **The grid preview** has a corner grip: resize its frame to see each size a hub can give it (the size shows
  beside it; ⤢ back to the part's box).
- A middle-click on a tab no longer starts the browser's scroll.

## 0.1.10 (2026-11-07)

- **The grid preview is a whole hub:** the preview box stands for a hub's grid (its 12 columns, your rows from Settings ▸
  Layout, its gaps), drawn as cells. The widget takes whole cells; its corner grip snaps to them (⤢: the whole hub).
  The size says the cells and the px they make in the box (a real hub, bigger, gives more px for the same cells).
- **The Explorer:** the selection is always shown, and a right-click selects the row it's on (unless that row is
  in the selection already): the menu acts on what you see selected. The file in the editor: a mark at its left.
- **The project's name:** a right-click shows the same menu as a click.

## 0.1.11 (2026-11-07)

- **Go to file** (Ctrl+P): a few letters of a file's name or path, in order ("wvue" finds Widget.vue); ↑ ↓, Enter.
  With nothing typed: the files you opened last first.
- **Find in files** (Ctrl+Shift+F, or ＋ Part ▸ Search): the project's files as GEM Forge has them (unsaved edits
  included), as you type; match case, whole words, regular expression; results by file, a click opens the line.
  Replace all: in the files listed (folded ones left out), unsaved until you save.
- **The Explorer:** drag files onto a folder (or the project's name) to move them: the imports that point to them,
  and their own, follow. Rename… is left out when several are selected.
- A dot on the page holding the editor while files are unsaved.

## 0.1.12 (2026-11-07)

- **Undo:** after Rename and update, a move (drag into a folder) and Replace all, GEM Shell's snackbar offers Undo
  (10 s): the files go back, their references too (files saved by the change are saved back).
- **The simulated hub:** ✥ (the frame's bottom-left grip) moves the widget to another place in the hub, by cells.

## 0.2.0 (2026-11-07)

- **npm packages** (＋ Part ▸ Packages; the project must be in a folder): Add a name (`date-fns`) or name@version
  (`chart.js@4`), several separated by spaces; ✕ removes one; Install all installs what package.json lists (after a
  git clone, say). Then `import { format } from 'date-fns'` in your code.
  - It's the npm of **Node.js** on your computer (nodejs.org, the LTS): GEM Shell runs it after asking you, in the
    project's folder, with **install scripts turned off** (`--ignore-scripts`: a package's code never runs while it
    installs). Without Node.js, the part says so.
  - package.json is made (a minimal one) on the first Add. node_modules stays out of the Explorer, the watch and
    the build's files; package.json and package-lock.json aren't sent to the build either.
  - Run and Install bundle the packages your code imports into the widget (one file, as before: nothing is loaded
    from the internet at run time). Their licences (name, version, licence, its text) go into the widget's notices.
  - A package's code runs as your widget's own: in its sandbox, with only the permissions it declares. The packaging
    check reads the whole bundle too: what a package does that the rules forbid (eval, say) shows in Problems as a
    warning naming the rule (index.js), so you know before you install.

## 0.2.1 (2026-11-07)

- **TypeScript as you type** (GEM Shell's own TypeScript, loaded the first time a .ts, .js or .vue file is shown: a
  second or two, once per GEM Shell run; "TypeScript 5.x: …" in Output):
  - **Completions** while you type a name or after a dot (Ctrl+Space anywhere): what TypeScript knows, the SDK's
    methods after `sdk.` included, with their signature and documentation beside the list.
  - **Hover** a name: its type and documentation.
  - **Problems as you type**, before any build: underlined in the editor, and listed in Problems ("As you type") for
    the file shown.
  - **Go to definition:** F12, Ctrl+click, or the editor's right-click. A name declared outside the project (the DOM,
    Vue) says where.
  - In a .vue file: its `<script>` blocks (the template keeps the Vue language's suggestions, and isn't checked).
  - The SDK's types: the project's widgets-sdk.d.ts, else GEM Forge's own copy. npm packages: their imports are
    accepted as `any` (their own types: later).
- Alt+click adds a cursor (Ctrl+click is Go to definition now).

## 0.2.2 (2026-11-08)

- **Tab takes the completion** selected (Enter too); without a list open, Tab indents as before.
- TypeScript **loads when the project opens** (not at the first keystroke), and checks the file shown as soon as it's
  ready: no more need to switch tabs. Problems says "TypeScript is loading…" meanwhile.
- **Format document** (Shift+Alt+F, or the editor's right-click) and **Format on save** (the right-click's toggle,
  off by default; kept with the project): TypeScript's own formatter: indentation and spaces in .ts / .js files and a
  .vue file's scripts (from their own indentation). Quotes and semicolons stay as written; the template and CSS
  aren't touched. Undo (Ctrl+Z) takes it back.
- Too many or too big files no longer turn TypeScript off for the whole project (package-lock.json is left out; the
  rest past the limits too).

## 0.2.3 (2026-11-08)

- **Problems can be copied:** select a problem's text, ⧉ on its line (hover), or right-click ▸ Copy / Copy all.
- TypeScript checks the file shown again when **another file changes** (package.json after Packages ▸ Add, a file it
  imports): no tab switch needed to clear `import … from 'date-fns'`.
- A problem's tooltip on **line 1** opens below the line (it was hidden under the tab bar).
- Packages: a **moving bar** and the seconds while npm works (npm prints nothing until it's done; its output follows).
- GEM Shell (DevBuild.cs): an import whose names aren't used yet (`import { format } from 'date-fns'` before writing
  `format(...)`) was reported as *"date-fns" was left out of the bundle*: esbuild drops it and lists it as external.
  Only imports the bundle still has count now.

## 0.2.4 (2026-11-08)

- **Output's stacks** show your widget's frames only, as `index.js:line:col`; GEM Shell's and Vue's runtime frames
  are counted on one line ("… 9 more in GEM Shell's runtime (Vue)").
- **A version that doesn't build** while the last one runs: a snackbar says the preview still runs the last version
  that built (once, until a build works again).
- **Problems ▸ ＋ Add date-fns** on a missing package (the build's "an npm package" and TypeScript's "Cannot find
  module"): npm adds it (GEM Shell asks first), the Packages part shows up with its progress.
- One problem tooltip at a time: while the red mark's (the gutter's) shows, the text's waits.

## 0.2.5 (2026-11-08)

- **Stacks in your own lines:** a run's build carries its source map (GEM Shell 2026-11-08); a frame that read
  `index.js:2:947` now reads `Widget.vue:11:12` (a package's: `date-fns/format.js:…`). In a .vue file, the line is
  found from the compiled module (its script's lines, a template's expression); when it can't be, index.js stays.
- In Output, a project file's place is a **link**: a click opens the file at that line.

## 0.2.6 (2026-11-08)

- **Rename symbol** (F2 in the editor, or right-click): the name at the cursor, in every file of the project, after
  asking the new name. In a .vue file, its template's expressions follow (`{{ … }}`, `:bound`, `@event`, `v-…`, `#slot`
  values: TypeScript doesn't read templates, GEM Forge renames them by the name). A name declared outside the project
  (the DOM's, Vue's) isn't renamed. Undo in the snackbar; nothing is saved until you save.
- **Find references** (Shift+F12, or right-click): where the name is used (◆ its declaration); pick one to go there.
- **Signature help:** typing `(` or `,` in a call shows its parameters, the current one in bold, with the docs.
- **Auto-imports:** completions include the exports of the project's other files ("from ./zones"); picking one adds
  its `import` too.
- Text changed by GEM Forge (Replace all, a rename) keeps the cursor where it was.
- GEM Shell (2026-11-08): no widget is named in it anymore: the developer APIs (sdk.dev()) are for a built-in widget
  declaring Develop, whichever it is (`dev:access`); GEM Forge is today's.

## 0.2.7 (2026-11-08)

- TypeScript's underlines move with your edits until they're computed again, and a check made for an older text is
  dropped: an underline could land lines away from its problem (a build's problems redrawn with older positions).
- Problems ▸ ＋ Add: on a build's problem (the last build's), only while the file still imports that package: renamed
  since (date-fmt → date-fns), the stale button goes; TypeScript's "Cannot find module" offers the current name.

## 0.2.8 (2026-11-08)

- **The npm packages' own types:** for each package package.json lists, its type files are read from the project's
  node_modules (package.json's `types`, every `types` of its `exports`, else index.d.ts; none: `@types/<name>`), with
  what they import (their files, other packages' types). Then `format(` shows its parameters, `dayjs().` its methods,
  a wrong argument is underlined, Go to definition says `date-fns/format.d.ts`. Read in the background once per change
  of the packages (Output says how many files and how long); a package without types stays `any`, as before.
- Limits: 1500 files and 12 MB a package, 4000 files and 32 MB in all.

## 0.2.9 (2026-11-08)

- **Less freeze when the packages' types arrive:** TypeScript parses them a few files at a time between frames (GEM
  Shell 2026-11-08), and the file is checked only once they're ready. A note with a spinner says what's going on
  (in the editor's corner and in Problems): reading, preparing (files left), checking. The last check still runs in
  one go on the page's thread (a few hundred ms for a big package): the spinner keeps turning meanwhile.

## 0.2.10 (2026-11-08)

- **Check all files** (Problems' toolbar, or the command): every .ts / .js / .vue file of the project (not
  node_modules'), one after the other with a frame between two, a count while it runs (Stop). Problems lists them
  under **All files**, by file; a click opens the file at the line, ⧉ / right-click copies. Saving or typing in a
  file updates its entry. **Checks ▾** chooses what runs: TypeScript today; ESLint (rules) and Prettier
  (formatting) are listed as coming, and will be more checks of the same shape. The choice is kept with the project.
- **F2 / Delete in the Explorer:** with a file selected (focus in GEM Forge, not in a text), F2 renames it and
  Delete deletes the selection (asks first). Typing in the editor, F2 is still Rename symbol. Needs GEM Shell
  2026-11-08 (focused claims); both can be changed in Keyboard shortcuts.

## 0.2.11 (2026-11-08)

- **F2 in the Explorer** renames the file. It reached Rename symbol (F2 too, and first in line); from the Explorer,
  GEM Forge now takes it as Rename the file.

## 0.2.12 (2026-11-08)

- **Prettier** (GEM Shell 2026-11-08 runs it in the page, from its own copy: nothing to install). Four ways in:
  - **Check all files:** turn it on in Problems ▸ **Checks ▾**. A file Prettier would format differently gets one
    warning at its first different line; .css, .md, .json, .html, .yaml files are checked too.
  - **The Explorer's right-click ▸ Format with Prettier:** a file, a folder or the selection. The files change in
    GEM Forge (● unsaved): Save all keeps it, closing without saving drops it.
  - **The editor's right-click ▸ Format with Prettier:** Prettier becomes the formatter of Format document
    (Shift+Alt+F) and Format on save, for every file it knows. Click again to go back to TypeScript's.
  - **The project's options:** `.prettierrc` or `.prettierrc.json` (JSON), or package.json's `"prettier"`. Only the
    formatting options are used (no plugins, no overrides). A `.js` or `.yaml` config isn't read: Output says so.
    Line ends: the file's own unless `endOfLine` says otherwise.
    `.prettierignore` isn't read yet: Leave out of Check all (below) does that job.
- **The Explorer's right-click ▸ Check:** the chosen checks on a file, a folder or the selection; their entries
  replace those in All files. **Leave out of Check all** / **Include in Check all:** kept with the project; Problems'
  toolbar says how many are left out (hover: which).
- The Explorer now lists .cjs, .scss, .less, .yaml files and `.prettierrc`, `.prettierignore`, `.editorconfig`,
  `.gitignore`.

## 0.2.13 (2026-11-08)

- **Prettier and a .vue file that doesn't parse:** Prettier left a `<script>` or `<style>` it couldn't read as it
  was and formatted the template, so it said "formatted". Each block is now read first: a syntax error there stops
  the formatting and says where (the Prettier check reports it too).
- **A run's problems follow your edits:** a problem from the last run (the build) in a file you edited since is
  hidden, and a line says how many until it runs again (Run, or save). TypeScript's as-you-type problems still
  update as you type.
- **⊘ in the Explorer** on a file or folder left out of Check all; what's inside a folder left out is dimmed.

Next: ESLint (the project's own, run by Node), a .vue template's checks, contributed parts (a git part from a git widget) (claude/plan-2026-11-07-forge-0-3.md).

## Files
`entry.ts`, `Widget.vue` (the bar, the pages, the lifecycle), `layout.ts` (pages of tiles), `TileGrid.vue`, `project.ts` (the project: files, saving, the watch, running), `Explorer.vue`,
`CodeEditor.vue`, `PreviewPart.vue`, `Problems.vue`, `Output.vue`, `commands.ts`, `samples.ts`, `templates.ts` (New ▾), `raw.d.ts`, `playground.ts`, `Playground.vue`, `PlayPopover.vue`,
`zip.ts`, `SearchPart.vue`, `QuickOpen.vue`, `names.ts`, `PackagesPart.vue` (0.2.0), `lang.ts` (0.2.1), `checks.ts` (0.2.10), `pretty.ts` (0.2.12), `forge.css`.
Bundles CodeMirror 6 (`codemirror`, `@codemirror/lang-*`: MIT).
