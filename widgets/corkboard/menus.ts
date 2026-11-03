// widgets/corkboard/menus.ts
//
// THE RIGHT-CLICK MENUS (0.1.0): GEM Shell's own menus (sdk.ui().contextMenu), so the user arranges them in
// Settings › Context Menu like any widget's. The items are declared in entry.ts (MENU_CONTEXTS, MENU_ITEMS, below);
// the lists that change (flags, due dates, colours, groups, boards, stacks, ink tools) are declared submenus whose
// entries come with each right-click; menuStates grey or hide what doesn't apply (not in a group, one page...).
// A choice comes back to Widget.vue's onMenuItem → handle() here, with the context and the ref given at the click.
import type { WidgetSdk, WidgetMenuNode } from 'gexplorer/widgets'
import { FLAGS, PAPER_COLORS, COLOR_NAMES, PINS, TABLE_MAX, dueInfo, ymd, nextWeekday, isText, hasInk, type Stack, type Group, type Photo, type FlagId, type PaperColor, type PinColor } from './model'
import type { Desk } from './store'
import type { InkTool } from './ink'

export const MENU_CONTEXTS = [
    { id: 'corkboard.board', label: 'Corkboard: the board', icon: '📌' },
    { id: 'corkboard.stack', label: 'Corkboard: a stack', icon: '🗒' },
    { id: 'corkboard.group', label: 'Corkboard: a pinned group', icon: '📍' },
    { id: 'corkboard.text', label: 'Corkboard: a note’s text', icon: '✎' },
    { id: 'corkboard.ink', label: 'Corkboard: a drawing or picture', icon: '🖊' },
    { id: 'corkboard.tab', label: 'Corkboard: a note’s tab', icon: '🔖' },
    { id: 'corkboard.table', label: 'Corkboard: a table in a note', icon: '▦' },
    { id: 'corkboard.photo', label: 'Corkboard: a picture pinned on the board', icon: '🖼' },
]

export const MENU_STATES = [
    { id: 'not-in-group', label: 'Not in a group' },
    { id: 'one-page', label: 'The board has one page' },
    { id: 'one-board', label: 'There is one board' },
    { id: 'not-list', label: 'The line is not a list item' },
    { id: 'not-checkbox', label: 'The line is not a checkbox' },
    { id: 'first-level', label: 'The line is not indented' },
    { id: 'no-ink', label: 'Nothing drawn' },
    { id: 'no-due', label: 'No due date' },
    { id: 'one-row', label: 'The table has one row' },
    { id: 'one-col', label: 'The table has one column' },
    { id: 'table-full', label: 'The table is as large as it gets' },
]

const B = ['corkboard.board'], S = ['corkboard.stack'], G = ['corkboard.group'], T = ['corkboard.text'], K = ['corkboard.ink'], N = ['corkboard.tab'], TB = ['corkboard.table'], P = ['corkboard.photo']
export const MENU_ITEMS = [
    // the board
    { id: 'new-note-here', label: 'New note here', icon: '🗒', contexts: B },
    { id: 'new-checklist-here', label: 'New checklist here', icon: '☑', contexts: B },
    { id: 'new-drawing-here', label: 'New drawing here', icon: '🖊', contexts: B },
    { id: 'new-group-here', label: 'New group here…', icon: '📍', contexts: B },
    { id: 'pin-picture-here', label: 'Pin a picture here…', icon: '🖼', contexts: B },
    { id: 'board.sep1', type: 'separator', contexts: B },
    { id: 'snap', label: 'Snap to the grid', icon: '▦', contexts: B },
    { id: 'next-page', label: 'Next page', icon: '›', contexts: B, hideWhen: ['one-page'] },
    { id: 'prev-page', label: 'Previous page', icon: '‹', contexts: B, hideWhen: ['one-page'] },
    { id: 'back-to-board', label: 'Back to the board', icon: '↩', contexts: B, hideWhen: ['not-in-group'] },
    { id: 'board.sep2', type: 'separator', contexts: B },
    { id: 'import', label: 'Import a stack or a board…', icon: '⤓', contexts: B },
    { id: 'open-file', label: 'Open a Corkboard file…', icon: '📂', contexts: B },
    { id: 'export-board', label: 'Export this board…', icon: '⤒', contexts: B },
    { id: 'save-board-file', label: 'Save this board as a file…', icon: '💾', contexts: B },
    // a stack
    { id: 'open', label: 'Open', icon: '📖', contexts: [...S, ...G] },
    { id: 'flags', type: 'submenu', label: 'Flags', icon: '🚩', contexts: S },
    { id: 'due', type: 'submenu', label: 'Due date', icon: '📅', contexts: [...S, ...G] },
    { id: 'color', type: 'submenu', label: 'Colour', icon: '🎨', contexts: S },
    { id: 'stack.sep1', type: 'separator', contexts: S },
    { id: 'pin-group', type: 'submenu', label: 'Pin into a group', icon: '📍', contexts: [...S, ...P] },
    { id: 'leave-group', label: 'Take out of the group', icon: '↩', contexts: [...S, ...P], hideWhen: ['not-in-group'] },
    { id: 'move-page', type: 'submenu', label: 'Move to page', icon: '⇥', contexts: [...S, ...G, ...P] },
    { id: 'move-board', type: 'submenu', label: 'Move to board', icon: '⇄', contexts: S, hideWhen: ['one-board'] },
    { id: 'stack.sep2', type: 'separator', contexts: S },
    { id: 'export-stack', label: 'Export stack…', icon: '⤒', contexts: S },
    { id: 'delete-stack', label: 'Delete stack…', icon: '🗑', contexts: S },
    // a group
    { id: 'edit-group', label: 'Rename or set the due date…', icon: '✎', contexts: G },
    { id: 'pin-color', type: 'submenu', label: 'Pin colour', icon: '📍', contexts: G },
    { id: 'group.sep1', type: 'separator', contexts: G },
    { id: 'ungroup', label: 'Ungroup, keep the stacks', icon: '⇱', contexts: G },
    { id: 'delete-group', label: 'Delete the group and its stacks…', icon: '🗑', contexts: G },
    // a note's text
    { id: 'bullet', label: 'Bullet list', icon: '•', contexts: T },
    { id: 'checklist', label: 'Checklist', icon: '☑', contexts: T },
    { id: 'numbered', label: 'Numbered list', icon: '1.', contexts: T },
    { id: 'heading', label: 'Heading', icon: 'H', contexts: T },
    { id: 'plain', label: 'Plain text', icon: '¶', contexts: T },
    { id: 'text.sep1', type: 'separator', contexts: T },
    { id: 'indent', label: 'Indent', icon: '→', contexts: T },
    { id: 'outdent', label: 'Outdent', icon: '←', contexts: T, disableWhen: ['first-level'] },
    { id: 'end-list', label: 'End the list here', icon: '↵', contexts: T, hideWhen: ['not-list'] },
    { id: 'check', label: 'Tick or untick', icon: '✓', contexts: T, hideWhen: ['not-checkbox'] },
    { id: 'text.sep2', type: 'separator', contexts: T },
    { id: 'sketch', label: 'Insert a drawing', icon: '🖊', contexts: T },
    { id: 'picture', label: 'Insert a picture…', icon: '🖼', contexts: T },
    { id: 'table', label: 'Insert a table', icon: '▦', contexts: T },
    { id: 'text.sep3', type: 'separator', contexts: T },
    { id: 'delete-note', label: 'Delete this note', icon: '🗑', contexts: [...T, ...N] },
    // a drawing or a picture
    { id: 'ink-undo', label: 'Undo ink', icon: '↶', contexts: K },
    { id: 'ink-clear', label: 'Clear the ink', icon: '⌫', contexts: K, disableWhen: ['no-ink'] },
    { id: 'tool', type: 'submenu', label: 'Pen', icon: '🖊', contexts: K },
    { id: 'ink.sep1', type: 'separator', contexts: K },
    { id: 'remove-media', label: 'Remove it', icon: '🗑', contexts: K },
    // a note's tab
    { id: 'open-note', label: 'Open', icon: '📖', contexts: N },
    { id: 'title-note', label: 'Give it a title…', icon: '🏷', contexts: N },
    { id: 'move-note', type: 'submenu', label: 'Move to stack', icon: '⇄', contexts: N },
    { id: 'duplicate-note', label: 'Duplicate', icon: '⧉', contexts: N },
    // a table (0.2.0): at the cell right-clicked
    { id: 'tbl.row-above', label: 'Insert a row above', icon: '⤒', contexts: TB, disableWhen: ['table-full'] },
    { id: 'tbl.row-below', label: 'Insert a row below', icon: '⤓', contexts: TB, disableWhen: ['table-full'] },
    { id: 'tbl.col-left', label: 'Insert a column left', icon: '⇤', contexts: TB, disableWhen: ['table-full'] },
    { id: 'tbl.col-right', label: 'Insert a column right', icon: '⇥', contexts: TB, disableWhen: ['table-full'] },
    { id: 'table.sep1', type: 'separator', contexts: TB },
    { id: 'tbl.del-row', label: 'Delete the row', icon: '⌫', contexts: TB, disableWhen: ['one-row'] },
    { id: 'tbl.del-col', label: 'Delete the column', icon: '⌫', contexts: TB, disableWhen: ['one-col'] },
    { id: 'table.sep2', type: 'separator', contexts: TB },
    { id: 'tbl.header', label: 'First row is a header', icon: '▤', contexts: TB },
    { id: 'table.sep3', type: 'separator', contexts: TB },
    { id: 'remove-table', label: 'Delete the table', icon: '🗑', contexts: TB },
    // a picture pinned on the board (0.2.0)
    { id: 'open-photo', label: 'Open large', icon: '🔍', contexts: P },
    { id: 'caption-photo', label: 'Write a caption…', icon: '✎', contexts: P },
    { id: 'photo-ink-clear', label: 'Clear the ink', icon: '⌫', contexts: P, disableWhen: ['no-ink'] },
    { id: 'photo.sep1', type: 'separator', contexts: P },
    { id: 'delete-photo', label: 'Take it off the board…', icon: '🗑', contexts: P },
]

/** What the widget does for a choice the menus can't do alone (dialogs, the editor, the board's page). */
export type MenuActions = {
    newHere(kind: 'note' | 'checklist' | 'drawing', at: { col: number; row: number } | null): void
    newGroupHere(at: { col: number; row: number } | null): void
    /** A picture file to pin (0.2.0), at the cell right-clicked. */
    pickPhoto(at: { col: number; row: number } | null): void
    captionPhoto(p: Photo): void
    deletePhoto(p: Photo): void
    importCopy(): void
    /** 0.2.2: the board as a .gembrd file; a .gembrd / .gemstk file opened. */
    saveBoardFile(): void
    openFile(): void
    /** 0.2.2: an item to page `to` of the view (the page count: a new page). */
    moveToPage(it: Stack | Group | Photo, to: number): void
    exportBoard(): void
    exportStack(s: Stack): void
    deleteStack(s: Stack): void
    editGroup(g: Group): void
    deleteGroup(g: Group): void
    newGroupWith(s: Stack): void
    pickDue(t: Stack | Group): void
    /** The note's own title (a box asking it). */
    titleNote(noteId: string): void
    /** An editor command on a block of the open note ('bullet', 'indent'…, 'sketch', 'picture', 'table'). */
    editor(id: string, blockId: string): void
    /** A change to a table at its cell right-clicked ('row-above', 'del-col', 'header'…). */
    tableOp(op: string, blockId: string): void
    inkUndo(): void
    inkClear(blockId: string): void
    removeMedia(blockId: string): void
    setTool(t: InkTool): void
    tool(): InkTool
    flipPage(dir: number): void
    pages(): number
}

const TOOLS: [InkTool, string][] = [['k', 'Ink'], ['b', 'Blue'], ['r', 'Red'], ['hl', 'Highlighter'], ['erase', 'Eraser']]

function dueEntries(t: Stack | Group): WidgetMenuNode[] {
    const at = (n: number) => dueInfo(ymd(n))!.long
    return [
        { id: 'due.today', label: `Today · ${at(0)}` },
        { id: 'due.tomorrow', label: `Tomorrow · ${at(1)}` },
        { id: 'due.friday', label: `Friday · ${at(nextWeekday(5))}` },
        { id: 'due.monday', label: `Next Monday · ${at(nextWeekday(1))}` },
        { id: 'due.2w', label: `In two weeks · ${at(14)}` },
        { id: 'due.pick', label: 'Pick a date…' },
        { separator: true },
        { id: 'due.none', label: 'No due date', checked: !t.due, disabled: !t.due },
    ]
}

export function createMenus(sdk: WidgetSdk, desk: Desk, act: MenuActions) {
    const ui = sdk.ui!()
    /** Where a board right-click happened (a cell), for "New … here". */
    let at: { col: number; row: number } | null = null

    function base(context: string, ref?: string) {
        const d = desk.d.value
        const states: string[] = []
        if (!d.group) states.push('not-in-group')
        if (d.boards.length < 2) states.push('one-board')
        if (act.pages() < 2) states.push('one-page')
        return { context, ref, states, submenus: {} as Record<string, WidgetMenuNode[]>, state: {} as Record<string, { checked?: boolean; label?: string }> }
    }

    function openBoard(e: MouseEvent, cell: { col: number; row: number } | null) {
        at = cell
        const o = base('corkboard.board')
        o.state.snap = { checked: desk.d.value.snap }
        void ui.contextMenu(e, o)
    }
    function stackSubmenus(o: ReturnType<typeof base>, s: Stack) {
        const d = desk.d.value
        o.states = o.states.filter(x => x !== 'not-in-group')
        if (!s.group) o.states.push('not-in-group')
        if (!s.due) o.states.push('no-due')
        o.submenus.flags = FLAGS.map(([f, l]) => ({ id: 'flag.' + f, label: l, checked: s.flags.includes(f) }))
        o.submenus.due = dueEntries(s)
        o.submenus.color = PAPER_COLORS.map(c => ({ id: 'color.' + c, label: COLOR_NAMES[c], checked: s.color === c }))
        const groups = d.groups.filter(g => g.board === s.board && g.id !== s.group)
        o.submenus['pin-group'] = [...groups.map(g => ({ id: 'pingroup.' + g.id, label: g.name })), ...(groups.length ? [{ separator: true }] : []), { id: 'pingroup.new', label: 'New group…' }]
        o.submenus['move-board'] = d.boards.filter(b => b.id !== s.board).map(b => ({ id: 'toboard.' + b.id, label: b.title || 'Untitled board' }))
    }
    /** The view's pages but the one the item is on, and a new page (0.2.2). */
    function pageEntries(id: string): WidgetMenuNode[] {
        const n = act.pages(), L = desk.layoutNow(), r = L.rects.get(id), f = L.free.get(id)
        const on = r ? Math.floor(r.row / desk.geo.value.rows) : f ? f.page : -1
        return [
            ...Array.from({ length: n }, (_, i) => ({ id: 'page.' + i, label: `Page ${i + 1}${i === on ? ' (here)' : ''}`, disabled: i === on, checked: i === on })),
            { separator: true }, { id: 'page.new', label: 'A new page' },
        ]
    }
    function openStack(e: MouseEvent, s: Stack) {
        const o = base('corkboard.stack', s.id)
        stackSubmenus(o, s)
        o.submenus['move-page'] = pageEntries(s.id)
        void ui.contextMenu(e, o)
    }
    function openGroup(e: MouseEvent, g: Group) {
        const o = base('corkboard.group', g.id)
        o.submenus.due = dueEntries(g)
        o.submenus['move-page'] = pageEntries(g.id)
        o.submenus['pin-color'] = PINS.map(p => ({ id: 'pin.' + p, label: p[0].toUpperCase() + p.slice(1), checked: g.pin === p }))
        void ui.contextMenu(e, o)
    }
    function openText(e: MouseEvent, blockId: string) {
        const s = desk.focused.value; if (!s) return
        const b = desk.activeNote(s).blocks.find(x => x.id === blockId)
        const o = base('corkboard.text', blockId)
        if (b && isText(b)) {
            if (!['b', 'n', 'c'].includes(b.t)) o.states.push('not-list')
            if (b.t !== 'c') o.states.push('not-checkbox')
            if (!(b.lvl > 0)) o.states.push('first-level')
            for (const [id, t] of [['bullet', 'b'], ['checklist', 'c'], ['numbered', 'n'], ['heading', 'h'], ['plain', 'p']] as const) o.state[id] = { checked: b.t === t }
        }
        void ui.contextMenu(e, o)
    }
    function openInk(e: MouseEvent, blockId: string) {
        const s = desk.focused.value; if (!s) return
        const b = desk.activeNote(s).blocks.find(x => x.id === blockId)
        const o = base('corkboard.ink', blockId)
        if (!b || !hasInk(b) || !b.ink.length) o.states.push('no-ink')
        o.submenus.tool = TOOLS.map(([k, l]) => ({ id: 'tool.' + k, label: l, checked: act.tool() === k }))
        o.state['remove-media'] = { label: b?.t === 'img' ? 'Remove the picture' : 'Remove the sketch' }
        void ui.contextMenu(e, o)
    }
    function openTable(e: MouseEvent, blockId: string) {
        const s = desk.focused.value; if (!s) return
        const b = desk.activeNote(s).blocks.find(x => x.id === blockId)
        const o = base('corkboard.table', blockId)
        if (b?.t === 'table') {
            if (b.rows.length < 2) o.states.push('one-row')
            if ((b.rows[0]?.length ?? 0) < 2) o.states.push('one-col')
            if (b.rows.length >= TABLE_MAX.rows || (b.rows[0]?.length ?? 0) >= TABLE_MAX.cols) o.states.push('table-full')
            o.state['tbl.header'] = { checked: b.head }
        }
        void ui.contextMenu(e, o)
    }
    function openPhoto(e: MouseEvent, p: Photo) {
        const d = desk.d.value
        const o = base('corkboard.photo', p.id)
        o.states = o.states.filter(x => x !== 'not-in-group')
        if (!p.group) o.states.push('not-in-group')
        if (!p.ink.length) o.states.push('no-ink')
        if (d.photo === p.id) o.state['open-photo'] = { label: 'Back to the board' }
        if (p.caption) o.state['caption-photo'] = { label: 'Change the caption…' }
        const groups = d.groups.filter(g => g.board === p.board && g.id !== p.group)
        o.submenus['move-page'] = pageEntries(p.id)
        o.submenus['pin-group'] = groups.length ? groups.map(g => ({ id: 'pingroup.' + g.id, label: g.name })) : [{ id: 'pingroup.none', label: 'No group on this board', disabled: true }]
        void ui.contextMenu(e, o)
    }
    function openTab(e: MouseEvent, noteId: string) {
        const s = desk.focused.value; if (!s) return
        const o = base('corkboard.tab', noteId)
        const others = desk.viewStacks().filter(x => x.id !== s.id)
        if (desk.d.value.notes[noteId]?.title) o.state['title-note'] = { label: 'Change its title…' }
        o.submenus['move-note'] = [...others.map(x => ({ id: 'move.' + x.id, label: x.name })), ...(others.length ? [{ separator: true }] : []), { id: 'move.new', label: 'New stack' }]
        void ui.contextMenu(e, o)
    }

    /** A choice from one of these menus (Widget.vue's onMenuItem). */
    function handle(itemId: string, context: string, ref?: string) {
        const s = context === 'corkboard.stack' ? desk.stackById(ref) : null
        const g = context === 'corkboard.group' ? desk.groupById(ref) : null
        const p = context === 'corkboard.photo' ? desk.photoById(ref) : null
        const target: Stack | Group | null = s ?? g
        const dot = itemId.indexOf('.')
        const head = dot > 0 ? itemId.slice(0, dot) : itemId, tail = dot > 0 ? itemId.slice(dot + 1) : ''
        switch (head) {
            case 'new-note-here': return act.newHere('note', at)
            case 'new-checklist-here': return act.newHere('checklist', at)
            case 'new-drawing-here': return act.newHere('drawing', at)
            case 'new-group-here': return act.newGroupHere(at)
            case 'pin-picture-here': return act.pickPhoto(at)
            case 'open-photo': if (p) { if (desk.d.value.photo === p.id) desk.closePhoto(); else desk.openPhoto(p.id) } return
            case 'caption-photo': if (p) act.captionPhoto(p); return
            case 'photo-ink-clear': if (p) { desk.snapshot(); p.ink = []; desk.save(); desk.told('Ink cleared', true) } return
            case 'delete-photo': if (p) act.deletePhoto(p); return
            case 'snap': desk.d.value.snap = !desk.d.value.snap; desk.save(); return
            case 'next-page': return act.flipPage(1)
            case 'prev-page': return act.flipPage(-1)
            case 'back-to-board': return void desk.leaveGroup()
            case 'import': return act.importCopy()
            case 'open-file': return act.openFile()
            case 'save-board-file': return act.saveBoardFile()
            case 'page': {
                const it = s ?? g ?? p; if (!it) return
                return act.moveToPage(it, tail === 'new' ? act.pages() : Number(tail))
            }
            case 'export-board': return act.exportBoard()
            case 'open':
                if (s) desk.openStack(s.id); else if (g) desk.openGroup(g.id)
                return
            case 'flag': if (s) desk.toggleFlag(s, tail as FlagId); return
            case 'due':
                if (!target) return
                if (tail === 'pick') return act.pickDue(target)
                return desk.setDue(target, tail === 'today' ? ymd(0) : tail === 'tomorrow' ? ymd(1) : tail === 'friday' ? ymd(nextWeekday(5)) : tail === 'monday' ? ymd(nextWeekday(1)) : tail === '2w' ? ymd(14) : null)
            case 'color': if (s) desk.setColor(s, tail as PaperColor); return
            case 'pingroup':
                if (tail === 'new') { if (s) act.newGroupWith(s); return }
                { const gg = desk.groupById(tail), it = s ?? p; if (gg && it) desk.joinGroup(it, gg) }
                return
            case 'leave-group': { const it = s ?? p; if (it) desk.leaveGroupWith(it); return }
            case 'toboard': { const b = desk.d.value.boards.find(x => x.id === tail); if (s && b) desk.moveStackToBoard(s, b); return }
            case 'export-stack': if (s) act.exportStack(s); return
            case 'delete-stack': if (s) act.deleteStack(s); return
            case 'edit-group': if (g) act.editGroup(g); return
            case 'pin': if (g) desk.setPin(g, tail as PinColor); return
            case 'ungroup': if (g) desk.ungroup(g); return
            case 'delete-group': if (g) act.deleteGroup(g); return
            case 'bullet': case 'checklist': case 'numbered': case 'heading': case 'plain':
            case 'indent': case 'outdent': case 'end-list': case 'check': case 'sketch': case 'picture': case 'table':
                if (ref) act.editor(head, ref)
                return
            case 'delete-note':
                if (context === 'corkboard.tab' && ref) desk.deleteNote(ref)
                else { const f = desk.focused.value; if (f?.active) desk.deleteNote(f.active) }
                return
            case 'ink-undo': return act.inkUndo()
            case 'ink-clear': if (ref) act.inkClear(ref); return
            case 'tool': return act.setTool(tail as InkTool)
            case 'remove-media': case 'remove-table': if (ref) act.removeMedia(ref); return
            case 'tbl': if (ref) act.tableOp(tail, ref); return
            case 'open-note': if (ref) desk.selectNote(ref); return
            case 'title-note': if (ref) act.titleNote(ref); return
            case 'move': if (ref) desk.moveNote(ref, tail === 'new' ? null : tail); return
            case 'duplicate-note': if (ref) desk.duplicateNote(ref); return
            default: console.warn('[corkboard] unknown menu item', itemId)
        }
    }

    return { openBoard, openStack, openGroup, openText, openInk, openTab, openTable, openPhoto, handle }
}
export type Menus = ReturnType<typeof createMenus>
