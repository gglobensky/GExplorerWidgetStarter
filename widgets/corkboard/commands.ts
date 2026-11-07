// widgets/corkboard/commands.ts
//
// THE CORKBOARD'S KEYS AND GESTURES (0.1.1; 0.2.0: Insert a table; 0.2.5: New line in the same item): what entry.ts declares to the key mapper (commands) and to the key
// pages (gestures, CORKBOARD-SHELL-ADDITIONS.md B). Here, not in entry.ts, so the editor can read which keys are
// commands: a plain key bound to one (Down, Enter...) is left to the key mapper, never handled by the editor first.

/** Run while the Corkboard has your focus; the user changes them in Keyboard shortcuts. The list keys run while
 *  typing in a note (whileTyping), and only act on a note's line. */
export const COMMANDS = [
    { id: 'new-note', name: 'New note', keys: ['Alt+N'], whileTyping: true,
      description: 'Adds a note to the open stack, or starts a new stack on the board, with the cursor in it.' },
    { id: 'find', name: 'Search notes', keys: ['Ctrl+F'], whileTyping: true,
      description: 'Puts the cursor in the search box: every board, every note.' },
    { id: 'sketch', name: 'Insert a drawing', keys: ['Alt+S'], whileTyping: true,
      description: 'Adds a blank drawing area under the line you are on.' },
    { id: 'table', name: 'Insert a table', keys: ['Alt+T'], whileTyping: true,
      description: 'Adds a table (3 × 3, a header row) where the cursor is. In a cell: Tab goes to the next one, Enter down a row.' },
    { id: 'next-note', name: 'Next note in the stack', keys: ['Alt+PageDown'], whileTyping: true,
      description: 'Opens the next note of the open stack (the tab below).' },
    { id: 'prev-note', name: 'Previous note in the stack', keys: ['Alt+PageUp'], whileTyping: true,
      description: 'Opens the previous note of the open stack (the tab above).' },
    { id: 'flag-important', name: 'Flag the stack as important', keys: ['Alt+I'], whileTyping: true,
      description: 'Puts the red Important flag on the open stack, or takes it off.' },
    { id: 'ink-undo', name: 'Undo the last ink', keys: ['Ctrl+Z'],
      description: 'Takes back the last stroke drawn or erased (outside the text: in text, Ctrl+Z undoes typing).' },
    { id: 'next-page', name: 'Next page of the board', keys: ['PageDown'],
      description: 'Shows the next page of stacks when the board has more than one.' },
    { id: 'prev-page', name: 'Previous page of the board', keys: ['PageUp'],
      description: 'Shows the previous page of stacks.' },
    // 0.2.5 (Guillaume): Shift+Enter is a new line inside the item; ending the list has no key of its own by default
    { id: 'line-break', name: 'New line in the same item', keys: ['Shift+Enter'], whileTyping: true,
      description: 'Starts a new line inside the list item or table cell you are in, so an item can have several lines.' },
    { id: 'end-list', name: 'End the list, keep writing', whileTyping: true,
      description: 'Starts a plain line under the list item you are on, lined up with its text (in a table: leaves it). No key by default: Down on the last item, or Enter on an empty one, ends a list too.' },
    { id: 'indent', name: 'Indent the line', keys: ['Tab'], whileTyping: true,
      description: 'Moves the line one level in, wherever the cursor is in it (a sub-item in a list).' },
    { id: 'outdent', name: 'Outdent the line', keys: ['Shift+Tab'], whileTyping: true,
      description: 'Moves the line one level out.' },
    { id: 'check', name: 'Checkbox: make or tick', keys: ['Ctrl+Enter'], whileTyping: true,
      description: 'Turns the line into a checkbox, or ticks / unticks it when it is one.' },
    { id: 'bullet', name: 'Bullet list', keys: ['Ctrl+Shift+8'], whileTyping: true,
      description: 'Makes the line a bullet (again: plain text).' },
    { id: 'numbered', name: 'Numbered list', keys: ['Ctrl+Shift+7'], whileTyping: true,
      description: 'Makes the line a numbered item (again: plain text).' },
    { id: 'checklist', name: 'Checklist', keys: ['Ctrl+Shift+9'], whileTyping: true,
      description: 'Makes the line a checkbox (again: plain text).' },
    { id: 'heading', name: 'Heading', keys: ['Ctrl+Shift+1'], whileTyping: true,
      description: 'Makes the line a heading (again: plain text).' },
    { id: 'plain', name: 'Plain text', keys: ['Ctrl+Shift+0'], whileTyping: true,
      description: 'Makes the line plain text, lined up where its text was.' },
    { id: 'line-up', name: 'Move the line up', keys: ['Alt+Up'], whileTyping: true,
      description: 'Swaps the line with the one above it.' },
    { id: 'line-down', name: 'Move the line down', keys: ['Alt+Down'], whileTyping: true,
      description: 'Swaps the line with the one below it.' },
]

/** Listed with the commands in Keyboard shortcuts and the cheat sheet, where the user can star them; read by the
 *  widget, never rebound. */
export const GESTURES = [
    { id: 'new-here', name: 'New note where you click', input: 'DoubleClick',
      description: 'Double-click the cork: a note starts there, the cursor in it.' },
    { id: 'scribble', name: 'Scribble on a note', input: 'Alt+Drag',
      description: 'Hold Alt and drag anywhere on an open note to draw in its margin.' },
    { id: 'erase', name: 'Erase ink', input: 'RightDrag',
      description: 'Drag with the right button over strokes on a drawing or a picture to erase them.' },
    { id: 'pile', name: 'Pile stacks together', input: 'Drag',
      description: 'Drop a stack on the middle of another to pile their notes, or on a pin to put it in that group. On an edge: it pushes the other aside.' },
    { id: 'place-free', name: 'Place a stack freely', input: 'Alt+Drag',
      description: 'Hold Alt while dragging a stack to drop it off the grid (or onto it, when snapping is off).' },
    { id: 'swap', name: 'Swap two stacks', input: 'Shift+Drag',
      description: 'Hold Shift while dropping a stack on another: they trade places.' },
]

/** The commands that run while typing (the editor steps aside for their keys). */
export const TYPING_COMMANDS = COMMANDS.filter(c => c.whileTyping).map(c => c.id)
