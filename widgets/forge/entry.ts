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
//   Next: the toolbar and sidebar playgrounds (0.1d).
// Its id must stay 'forge': GEM Shell lets the built-in widget of that name build widgets, and no other.
import Widget from './Widget.vue'
import { COMMANDS } from './commands'

export default {
    api: '1.0',
    id: 'forge',
    version: '0.1.3',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    displayName: 'GEM Forge',
    description: 'Write, try and install your own widgets, in GEM Shell. Your AI can edit the files while you watch.',
    category: 'tools',
    icon: '⚒️',
    instance: 'placement',
    contexts: {
        grid: { minSize: { width: 420, height: 300 }, defaultSize: { width: '100%', height: '100%' } },
    },
    commands: COMMANDS,
    // GEM Shell's keys the editor needs while you type in it (Save the page, Up one folder elsewhere)
    keyboard: { claims: ['Ctrl+S', 'Alt+Up'] },
    // The Explorer's right-click: GEM Shell's file items (subject 'files') after GEM Forge's own
    menuContexts: [
        { id: 'forge.file', label: 'File in GEM Forge', icon: '◇', subject: 'files' },
        { id: 'forge.folder', label: 'Folder in GEM Forge', icon: '▾', subject: 'files' },
    ],
    menus: { items: [{ id: 'open-file', label: 'Open in the editor', icon: '✎', contexts: ['forge.file'] }] },
    // A folder in GEM Shell's explorer (or the folder shown) ▸ Open in GEM Forge (Widget.vue onWidgetAction)
    actions: [{
        id: 'open-project',
        label: 'Open in GEM Forge',
        accepts: { contexts: ['folder', 'background'], kinds: 'folders', count: { max: 1 } },
        contextMenu: { label: 'Open in GEM Forge', icon: '⚒️' },
    }],
    capabilities: [
        { cap: 'Develop', reason: 'Builds the widgets you write into widgets GEM Shell can run (nothing runs while it builds).' },
        { cap: 'Read', reason: 'Reads the files of the project folders you open, and knows when they change.' },
        { cap: 'Write', reason: 'Saves your project\'s files in its folder.' },
        { cap: 'Clipboard', reason: 'Copy for AI: puts your project\'s files, or its problems, on the clipboard.' },
    ],
}
