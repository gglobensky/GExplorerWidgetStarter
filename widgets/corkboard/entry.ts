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
    version: '0.4.0',   // 0.4.0 (2026-11-21): board and stack files are v2, an archive (corkboard.json + the pictures as files: no data: addresses, the "a connection from app/data" block; opens up to 256 MB, was 8); v1 files still open. 0.3.1 (2026-11-21): round checkboxes: "( ) " / "(x) " make one; right-click a box ▸ Round / Square checkboxes changes its whole list. 0.3.0 (2026-11-14): the board's surface follows GEM Shell's Widget backgrounds (opacity); the chrome on GEM Shell's colours. 0.2.6 (2026-11-14): sizes follow Appearance (built with the Text size / Roundness step)
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
