// widgets/picture-editor/entry.ts
//
// GEM PICTURE EDITOR 0.1.0 (2026-11-05; PhotinoVue1 claude/paste-image-design.md round 3): GEM Shell's picture
// editor. role 'picture-editor': it runs in a window of its own, opened by "Edit picture" (the file menu), with ONE
// picture handed to it (that file only, while GEM Shell runs). Crop, pen, highlighter, arrow, rectangle, ellipse,
// text, eraser (the ink kit); Copy to the clipboard, Save (over the original or a copy), Discard. Unsaved changes come
// back after a restart (sdk.window().keep).
// 0.3.0 (GEM Shell P4b): Read text: zones over the text, read with GEM Shell's text recognition (sdk.text()), an
// editable panel, Copy text, Copy picture and text, Save text….
import Widget from './Widget.vue'
import { COMMANDS, GESTURES } from './commands'

export default {
    api: '1.0',
    id: 'picture-editor',
    version: '0.3.0',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    displayName: 'Picture Editor',
    description: 'Crops and draws on pictures and screenshots: pen, highlighter, arrows, shapes, text. Reads the text in them. Copy the result to the clipboard or save it.',
    category: 'media',
    icon: 'image',

    // GEM Shell's picture editor: a window of its own per picture, never placed in a hub, the sidebar or the toolbar
    role: 'picture-editor',

    commands: COMMANDS,
    gestures: GESTURES,

    defaults: { data: {}, view: {} },

    capabilities: [
        { cap: 'Read', reason: 'Opens the picture you hand it with Edit picture.' },
        { cap: 'Write', reason: 'Saves the picture (over the original, or as a copy where you choose) and the text read in it.' },
        { cap: 'Clipboard', reason: 'Copies the edited picture, or the text read in it, to the clipboard when you ask.' },
    ],
}
