// widgets/corkboard/entry.ts
//
// GEM CORKBOARD 0.1.0 (2026-11-02): sticky notes on a cork board. Stacks of notes per subject, snapped to a grid
// (GEM Shell's own hub engine pushes them aside) or placed freely; pinned groups with a due date; flags; several
// boards; lists that are easy to leave; ink on sketches and pasted screenshots. One desk per copy of the widget.
// 0.2.0: tables in notes (a simple grid, no formulas) and pictures pinned on the board, opened large to view and draw.
// Shell parts it relies on: PhotinoVue1/CORKBOARD-SHELL-ADDITIONS.md (A: the grid engine, B: gestures).
import Widget from './Widget.vue'
import { MENU_CONTEXTS, MENU_ITEMS, MENU_STATES } from './menus'
import { COMMANDS, GESTURES } from './commands'

export default {
    api: '1.0',
    id: 'corkboard',
    version: '0.2.4',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    displayName: 'GEM Corkboard',
    description: 'Sticky notes on a cork board: stacks per subject, pinned groups with due dates, checklists that are easy to leave, tables, pictures pinned on the board, ink.',
    category: 'productivity',
    icon: 'note',

    // One desk per copy (a hub can have its own "Project X" board); a copy exported and pasted into another is a
    // standalone duplicate (exchange.ts).
    instance: 'placement',

    contexts: {
        grid: { minSize: { cols: 2, rows: 2 }, defaultSize: { cols: 6, rows: 4 } },
        sidebar: { minHeight: 320, scroll: 'self' },
    },

    // ── Keys and gestures (commands.ts): the key mapper runs the commands while the Corkboard has your focus;
    // the gestures are listed beside them (GEM Shell 2026-11-02, CORKBOARD-SHELL-ADDITIONS.md B).
    commands: COMMANDS,
    gestures: GESTURES,

    menuContexts: MENU_CONTEXTS,
    menuStates: MENU_STATES,
    menus: { items: MENU_ITEMS },

    defaults: { data: {}, view: {} },

    capabilities: [
        { cap: 'Media', reason: 'Keeps the screenshots and pictures you paste into notes or pin on the board, so you can draw on them.' },
        { cap: 'Read', reason: 'Opens the pictures and the board files (.gembrd, .gemstk) you choose.' },
        { cap: 'Write', reason: 'Saves a board or a stack as a file where you choose.' },
    ],
}
