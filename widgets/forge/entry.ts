// widgets/forge/entry.ts
//
// GEM FORGE 0.1.1 (2026-11-07): write, run and try widgets in GEM Shell (claude/plan-2026-11-06-code-playground.md;
// GEM Shell's part: PhotinoVue1/FORGE-SHELL-ADDITIONS.md, forge-1 to forge-4).
//   0.1a: a project (a folder, or a sample in memory), Explorer, the editor (CodeMirror 6), Run and live reload (on
//   save, and when a file changes on disk: an AI editing the folder), the problems on their lines, the console, the
//   preview in a real placement (grid, sidebar, toolbar) or a window, Copy for AI.
//   0.1b: pages of tiles (layout.ts, TileGrid.vue: the hubs' engine), Detach / Attach to… / Move to page… / Close,
//   ＋ Part, ✎ Arrange; kept while away (the lifecycle: the project as a resource cell, its snapshot as data).
//   Next: new projects and install (0.1c), the toolbar and sidebar playgrounds (0.1d).
// Its id must stay 'forge': GEM Shell lets the built-in widget of that name build widgets, and no other.
import Widget from './Widget.vue'
import { COMMANDS } from './commands'

export default {
    api: '1.0',
    id: 'forge',
    version: '0.1.1',
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
    capabilities: [
        { cap: 'Develop', reason: 'Builds the widgets you write into widgets GEM Shell can run (nothing runs while it builds).' },
        { cap: 'Read', reason: 'Reads the files of the project folders you open, and knows when they change.' },
        { cap: 'Write', reason: 'Saves your project\'s files in its folder.' },
        { cap: 'Clipboard', reason: 'Copy for AI: puts your project\'s files, or its problems, on the clipboard.' },
    ],
}
