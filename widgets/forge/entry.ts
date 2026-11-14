// widgets/forge/entry.ts
//
// GEM FORGE 0.1.2 (2026-11-07): write, run and try widgets in GEM Shell (claude/plan-2026-11-06-code-playground.md;
// GEM Shell's part: PhotinoVue1/FORGE-SHELL-ADDITIONS.md, forge-1 to forge-4).
//   0.1a: a project (a folder, or a sample in memory), Explorer, the editor (CodeMirror 6), Run and live reload (on
//   save, and when a file changes on disk: an AI editing the folder), the problems on their lines, the console, the
//   preview in a real placement (grid, sidebar, toolbar) or a window, Copy for AI.
//   0.1b: pages of tiles (layout.ts, TileGrid.vue: the hubs' engine), Detach / Attach to… / Move to page… / Close,
//   ＋ Part, ✎ Arrange; kept while away (the lifecycle: the project as a resource cell, its snapshot as data).
//   0.1.2: closing GEM Shell asks about unsaved edits (sdk.ui().setDraft); a sample's unsaved marks kept; the
//   Preview part on another page.
//   0.1c (0.1.3): New ▾ (empty widget, clock sample: a real folder, with AGENTS.md, widgets-sdk.d.ts, tsconfig.json;
//   templates.ts), Widget ▾ Install / Update / Uninstall, the Explorer's right-click (GEM Shell's file menu), and
//   "Open in GEM Forge" on a folder in GEM Shell's explorer (actions).
//   0.1d (0.1.4): the playground (playground.ts): the toolbar's ⚒ popover, the sidebar's column, the IDE's
//   Playground part; Export .zip… (zip.ts) in place of Copy for AI.
//   0.1.5: ⤢ Full playground (the toolbar's popover, the sidebar): the whole playground in a GEM Forge window; the
//   result windows titled ("— Result", "— Preview").
//   0.1.6: Ctrl+A / Ctrl+Z / Ctrl+Y in a plain text field (the toolbar's line); the Explorer's New file… / New folder…
//   0.1.7 (layout v2): several previews (preview:n, each its own placement), a finer grid (24 columns, half rows),
//   the sidebar's height and the toolbar's width simulated on a preview (⇕), one highlight colour everywhere.
//   0.1.8: the editor's tabs (right-click menu, pinned, dragged with GEM Shell's sortable, ▾ for those that don't
//   fit, 1–3 rows), the editor's right-click menu, Show in the Explorer.
//   0.1.9: the Explorer's selection (Ctrl / Shift+click), Rename… (smart: the imports follow), Duplicate, Delete;
//   new names by the user's naming pattern; the grid preview resized by hand; a middle-click no longer scrolls.
//   0.1.10: the grid preview is a whole hub (its columns and rows: whole cells); the Explorer shows its selection
//   (a right-click selects); the project's name: the same menu on both clicks.
//   0.1.11: Go to file (Ctrl+P), Find in files (Ctrl+Shift+F, the Search part, Replace all), files dragged into
//   folders (imports follow), a dot on the page holding the editor while files are unsaved; no Rename… for several.
//   0.1.12: Undo (GEM Shell's snackbar) after a rename with its references, a move, a Replace all; the widget moved
//   in the simulated hub (✥).
//   0.2.0: npm packages (＋ Part ▸ Packages: Node's npm, by GEM Shell, install scripts never run; bundled into the
//   widget, their licences in its notices).
//   0.2.1: TypeScript as you type (GEM Shell's, in the page): completions, hovers, problems, go to definition (F12,
//   Ctrl+click), in .ts / .js files and a .vue file's scripts (lang.ts).
//   0.2.2: Tab takes a completion; TypeScript loads with the project (and checks the file shown once ready); Format
//   document (Shift+Alt+F) and Format on save (the editor's right-click), by TypeScript's formatter.
//   0.2.3: problems copied (⧉, right-click, selectable text); types checked again when another file changes
//   (package.json after Add); tooltips on line 1 open below; npm's bar. GEM Shell: no false "left out of the bundle"
//   for an import not used yet.
//   0.2.4: the console's stacks trimmed to the widget's frames (index.js:line:col); a snackbar when a version doesn't
//   build while the last one runs; Problems' "＋ Add <package>"; one problem tooltip at a time.
//   0.2.5: the stacks in the project's lines (the build's source map, smap.ts): Widget.vue:14:9, a link in Output.
//   0.2.6: Rename symbol (F2, every file, a .vue template's expressions too, Undo), Find references (Shift+F12),
//   signature help while typing a call's arguments, auto-imports (another file's export: its import added).
//   0.2.7: TypeScript's underlines follow the edits until checked again (no more an underline lines away); a stale
//   build problem's "＋ Add" hidden once the import changed.
//   0.2.8: the npm packages' own types (pkgtypes.ts: node_modules' .d.ts files, @types too): completions, hovers
//   and errors for date-fns & co.
//   0.2.9: the packages' types prepared a few files at a time between frames (GEM Shell's preparing()), a note with a
//   spinner meanwhile (the editor's corner, Problems), the check once they're ready.
//   0.2.10: Check all files (checks.ts: every .ts / .js / .vue file, Problems ▸ All files; Checks ▾: TypeScript,
//   ESLint and Prettier to come). F2 / Delete on the Explorer's selection (claimed: GEM Shell 2026-11-08).
//   0.2.11: F2 in the Explorer reached Rename symbol (GEM Shell runs the first of a widget's commands on a key):
//   from the Explorer, it's Rename the file (Widget.vue onCommand).
//   0.2.12: Prettier (GEM Shell 2026-11-08: sdk.dev().prettier(); pretty.ts): a check of Check all files, Format with
//   Prettier (the Explorer's right-click, a file or a folder), the formatter of Format document / Format on save (the
//   editor's right-click), the project's .prettierrc read. The Explorer's right-click: Check, Leave out of / Include
//   in Check all. ESLint: next (the project's own, through Node).
//   0.2.13: a .vue file's <script> / <style> Prettier can't read: said (Prettier left it as is and formatted the
//   rest); a run's problems in a file edited since are hidden until it runs again; ⊘ on what's left out of Check all.
//   Next: a .vue template's checks, contributed parts (git) (claude/plan-2026-11-07-forge-0-3.md).
//   Next: focus mode, the Layout lab, npm packages (claude/plan-2026-11-06-code-playground.md).
// Its id must stay 'forge': GEM Shell lets the built-in widget of that name build widgets, and no other.
import Widget from './Widget.vue'
import { COMMANDS } from './commands'

export default {
    api: '1.0',
    id: 'forge',
    version: '0.2.15',   // 0.2.15 (2026-11-14): "Open in GEM Forge" hidden in GEM Shell's file dialog (a default rule)
                         // 0.2.14 (2026-11-13): New project / a try as a project ask GEM Shell for an empty folder (require)
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    displayName: 'GEM Forge',
    description: 'Write, try and install your own widgets, in GEM Shell. Your AI can edit the files while you watch.',
    category: 'tools',
    icon: '⚒️',
    instance: 'placement',
    contexts: {
        grid: { minSize: { width: 420, height: 300 }, defaultSize: { width: '100%', height: '100%' } },
        // 0.1d: the playground (a column in the sidebar, a ⚒ button and its popover in the toolbar)
        sidebar: { minHeight: 320, maxHeight: 1400 },
        toolbar: {},
    },
    commands: COMMANDS,
    // GEM Shell's keys the editor needs while you type in it (Save the page, Up one folder elsewhere)
    // 0.2.6: F2 (GEM Shell's Rename in its explorer) is Rename symbol while you type in GEM Forge
    // 0.2.10: F2 and Delete also for the Explorer's selection while not typing (GEM Shell 2026-11-08)
    keyboard: { claims: ['Ctrl+S', 'Alt+Up', 'Ctrl+P', 'F2', 'Delete'] },
    // The Explorer's right-click: GEM Shell's file items (subject 'files') after GEM Forge's own
    // 0.1.11: several selected in the Explorer (Rename… left out)
    // 0.2.12: Check, Format with Prettier, Leave out of / Include in Check all
    menuStates: [
        { id: 'several', label: 'Several items selected' },
        { id: 'skipped', label: 'Left out of Check all' },
        { id: 'included', label: 'In Check all' },
        { id: 'no-prettier', label: 'No Prettier in this GEM Shell' },
    ],
    menuContexts: [
        { id: 'forge.file', label: 'File in GEM Forge', icon: '◇', subject: 'files' },
        { id: 'forge.folder', label: 'Folder in GEM Forge', icon: '▾', subject: 'files' },
    ],
    // 0.1.6: on a folder or the project's name (the Explorer's head)
    menus: {
        items: [
            { id: 'new-file', label: 'New file…', icon: '📄', contexts: ['forge.folder'] },
            { id: 'new-folder', label: 'New folder…', icon: '📁', contexts: ['forge.folder'] },
            // 0.1.9: a file (or several selected)
            { id: 'rename', label: 'Rename…', icon: '✎', contexts: ['forge.file'], hideWhen: ['several'] },
            { id: 'duplicate', label: 'Duplicate', icon: '⧉', contexts: ['forge.file'] },
            { id: 'delete', label: 'Delete', icon: '🗑', contexts: ['forge.file', 'forge.folder'] },
            // 0.2.12: the checks chosen (Problems ▸ Checks ▾) on these; Prettier on these; Check all without them
            { id: 'check', label: 'Check', icon: '✓', contexts: ['forge.file', 'forge.folder'] },
            { id: 'format-prettier', label: 'Format with Prettier', icon: '✨', contexts: ['forge.file', 'forge.folder'], hideWhen: ['no-prettier'] },
            { id: 'skip-checks', label: 'Leave out of Check all', icon: '⊘', contexts: ['forge.file', 'forge.folder'], hideWhen: ['skipped'] },
            { id: 'unskip-checks', label: 'Include in Check all', icon: '⊕', contexts: ['forge.file', 'forge.folder'], hideWhen: ['included'] },
        ],
    },
    // A folder in GEM Shell's explorer (or the folder shown) ▸ Open in GEM Forge (Widget.vue onWidgetAction)
    actions: [{
        id: 'open-project',
        label: 'Open in GEM Forge',
        accepts: { contexts: ['folder', 'background'], kinds: 'folders', count: { max: 1 } },
        // 0.2.15: not offered in GEM Shell's file dialog by default (the user can show it: sys:context-menus)
        contextMenu: { label: 'Open in GEM Forge', icon: '⚒️', hideWhen: ['place:dialog'] },
    }],
    capabilities: [
        { cap: 'Develop', reason: 'Builds the widgets you write into widgets GEM Shell can run (nothing runs while it builds).' },
        { cap: 'Read', reason: 'Reads the files of the project folders you open, and knows when they change.' },
        { cap: 'Write', reason: 'Saves your project\'s files in its folder, and the .zip archives you export.' },
        { cap: 'Clipboard', reason: 'Copy problems: puts your project\'s problems and console on the clipboard.' },
    ],
}
