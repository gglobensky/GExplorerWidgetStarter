// widgets/picture-editor/commands.ts
//
// THE PICTURE EDITOR'S KEYS AND GESTURES (0.1.0): what entry.ts declares to the key mapper (commands, run while the
// editor has your focus: Widget.vue onCommand) and to the key pages (gestures). The user changes the keys in
// Keyboard shortcuts. Ctrl+S is GEM Shell's own (it saves the window that has the focus): not declared here.

export const COMMANDS = [
    { id: 'undo', name: 'Undo', keys: ['Ctrl+Z'], description: 'Takes back the last stroke, erase or crop.' },
    { id: 'redo', name: 'Redo', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], description: 'Puts back what Undo took back.' },
    { id: 'copy', name: 'Copy the picture', keys: ['Ctrl+C'], description: 'Puts the picture, with your drawing and the crop, on the clipboard: paste it anywhere.' },
    { id: 'tool-pen', name: 'Pen', keys: ['P'], description: 'Draws freehand lines.' },
    { id: 'tool-highlighter', name: 'Highlighter', keys: ['H'], description: 'Draws wide, see-through strokes over text.' },
    { id: 'tool-arrow', name: 'Arrow', keys: ['A'], description: 'Drag from the tail to the point (Shift: steps of 45°).' },
    { id: 'tool-rect', name: 'Rectangle', keys: ['R'], description: 'Drag from one corner to the other (Shift: a square).' },
    { id: 'tool-ellipse', name: 'Ellipse', keys: ['E'], description: 'Drag across it (Shift: a circle).' },
    { id: 'tool-text', name: 'Text', keys: ['T'], description: 'Click where the text goes, then type it.' },
    { id: 'tool-eraser', name: 'Eraser', keys: ['X'], description: 'Removes the strokes you touch (a right-drag erases with any tool).' },
    { id: 'tool-crop', name: 'Crop', keys: ['C'], description: 'Drag the part of the picture to keep. Nothing is cut until you save or copy.' },
    // 0.3.0
    { id: 'tool-zones', name: 'Read text', keys: ['Shift+T'], description: 'Opens the text panel: drag zones over the text to read (right-click one to remove it), then Read.' },
    { id: 'zoom-fit', name: 'Fit to the window', keys: ['0'], description: 'Shows the whole picture.' },
]

export const GESTURES = [
    { id: 'erase', name: 'Erase strokes', input: 'RightDrag', description: 'Drag with the right button over strokes to remove them, whatever tool is chosen.' },
    { id: 'zoom', name: 'Zoom', input: 'Wheel', description: 'Turn the wheel over the picture to zoom around the pointer.' },
    { id: 'move', name: 'Move the picture', input: 'MiddleClick', description: 'Drag with the middle button (or hold Space and drag) to move a picture larger than the window.' },
]
