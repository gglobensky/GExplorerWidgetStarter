// widgets/forge/commands.ts
//
// GEM FORGE 0.1: ITS KEYS. GEM Shell hides shortcut combos from widget code (Ctrl / Alt + a key, F-keys): the editor's
// own keymap never sees them, so each is a command here (the user can change them in Keyboard shortcuts), run while
// GEM Forge has the focus, typing included (whileTyping). Widget.vue's onCommand runs them on the editor or the project.
// Ctrl+S and Alt+Up are GEM Shell's too (Save the page, Up one folder): entry.ts claims them (keyboard.claims, with
// Develop), so they are GEM Forge's while you type in it, and the shell's everywhere else (GEM Shell 2026-11-07).
export const COMMANDS = [
    { id: 'save', name: 'Save the file', keys: ['Ctrl+S'], whileTyping: true, description: 'Saves the file shown in the editor (a sample: asks for a folder).' },
    { id: 'save-all', name: 'Save every file', keys: ['Ctrl+Shift+S'], whileTyping: true, description: 'Saves every file with changes.' },
    { id: 'run', name: 'Run', keys: ['F5'], whileTyping: true, description: 'Builds the project and runs it in the preview.' },
    { id: 'undo', name: 'Undo', keys: ['Ctrl+Z'], whileTyping: true, description: 'Undoes the last edit in the editor.' },
    { id: 'redo', name: 'Redo', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], whileTyping: true, description: 'Redoes what was undone.' },
    { id: 'find', name: 'Find', keys: ['Ctrl+F'], whileTyping: true, description: 'Opens the editor\'s search.' },
    { id: 'replace', name: 'Replace', keys: ['Ctrl+H'], whileTyping: true, description: 'Opens the editor\'s search with replace.' },
    { id: 'find-next', name: 'Find the next', keys: ['F3'], whileTyping: true, description: 'Goes to the next match.' },
    { id: 'find-prev', name: 'Find the previous', keys: ['Shift+F3'], whileTyping: true, description: 'Goes to the previous match.' },
    { id: 'select-all', name: 'Select all', keys: ['Ctrl+A'], whileTyping: true, description: 'Selects the whole file.' },
    { id: 'select-next', name: 'Select the next occurrence', keys: ['Ctrl+Shift+D'], whileTyping: true, description: 'Adds the next occurrence of the selection (several cursors).' },
    { id: 'comment', name: 'Comment the lines', keys: ['Ctrl+/'], whileTyping: true, description: 'Comments or uncomments the selected lines.' },
    { id: 'line-up', name: 'Move the line up', keys: ['Alt+Up'], whileTyping: true, description: 'Moves the line (or the selected lines) up.' },
    { id: 'line-down', name: 'Move the line down', keys: ['Alt+Down'], whileTyping: true, description: 'Moves the line (or the selected lines) down.' },
    { id: 'duplicate-line', name: 'Duplicate the line', keys: ['Ctrl+D', 'Shift+Alt+Down'], whileTyping: true, description: 'Copies the line (or the selected lines) below.' },
    { id: 'go-to-line', name: 'Go to a line', keys: ['Ctrl+G'], whileTyping: true, description: 'Asks for a line number and goes there.' },
    { id: 'autocomplete', name: 'Suggest', keys: ['Ctrl+Space'], whileTyping: true, description: 'Shows the completions at the cursor.' },
]
