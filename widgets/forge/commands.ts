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
    // 0.2.1: TypeScript (lang.ts). Ctrl+click on a name does the same.
    { id: 'go-to-definition', name: 'Go to definition', keys: ['F12'], whileTyping: true, description: 'Opens the file where the name at the cursor is declared, at its line (Ctrl+click too).' },
    // 0.2.6: TypeScript's rename and references (F2 / Shift+F12: the editor's while you type in it)
    { id: 'rename-symbol', name: 'Rename symbol', keys: ['F2'], whileTyping: true, description: 'Renames the name at the cursor in every file (a .vue template\'s expressions too); Undo in the snackbar.' },
    { id: 'find-references', name: 'Find references', keys: ['Shift+F12'], whileTyping: true, description: 'Lists where the name at the cursor is used; pick one to go there.' },
    // 0.2.2: TypeScript's formatter (the editor's right-click: Format on save)
    // 0.2.10: every file, by the checks chosen (Problems ▸ Checks ▾)
    { id: 'check-all', name: 'Check all files', keys: [], description: 'Checks every .ts / .js / .vue file of the project (TypeScript; more checks to come) and lists their problems in Problems.' },
    { id: 'format-document', name: 'Format document', keys: ['Shift+Alt+F'], whileTyping: true, description: 'The file shown, by the formatter chosen in the editor\'s right-click: TypeScript (indentation and spaces of .ts, .js, a .vue file\'s scripts) or Prettier (.ts .js .vue .css .md .json…, the project\'s .prettierrc).' },
    // 0.1.11: Go to file, Find in files (Ctrl+P is claimed in entry.ts: GEM Shell's while not typing in GEM Forge)
    { id: 'go-to-file', name: 'Go to a file', keys: ['Ctrl+P'], whileTyping: true, description: 'A file of the project by a few letters of its name.' },
    { id: 'find-in-files', name: 'Find in files', keys: ['Ctrl+Shift+F'], whileTyping: true, description: 'Searches every file of the project (the Search part).' },
    // 0.1.9: the Explorer's selection. No key by default: Delete and F2 are GEM Shell's own (its explorer's), and a
    // widget can't take them outside a text field; the user may give these one in Keyboard shortcuts.
    // 0.2.10: F2 / Delete claimed (entry.ts) for these while the focus is in GEM Forge but not in a text (GEM Shell
    // 2026-11-08): the Explorer's selection; typing in the editor, F2 is Rename symbol and Delete deletes text.
    { id: 'delete-files', name: 'Delete the selected files', keys: ['Delete'], description: 'In the Explorer: the selected files and folders to the Recycle Bin (GEM Shell asks first).' },
    { id: 'rename-file', name: 'Rename the file', keys: ['F2'], description: 'In the Explorer: renames the selected file, its references updated if you want.' },
]
