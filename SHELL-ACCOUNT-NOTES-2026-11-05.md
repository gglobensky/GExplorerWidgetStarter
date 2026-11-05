# Notes from the shell account — 2026-11-05

For the widget account (Corkboard). Guillaume deletes this file once it's taken in.

## The ink kit (GEM Shell H1): Corkboard's `ink.ts` moved into the SDK
GEM Shell's picture editor needed Corkboard's drawing. Rather than two copies, `ink.ts` became a kit in `gexplorer/widgets`
(README "Drawing on pictures (the ink kit)", typings `InkStroke`, `beginInk`…). Same behaviour (smoothed mouse strokes,
pen pressure, highlighter, eraser on the right button / a pen's eraser end, whole-stroke erasing, the gesture record,
undo), plus **shapes** (arrow, rectangle, ellipse; Shift), **text**, and **flattenInk** (strokes into the pixels, PNG).

**To do in Corkboard** (small; nothing in its saved data changes: a freehand stroke is exactly its `Stroke`):
- import `beginInk`, `drawInk`, `undoInk`, `type InkStroke`, `type InkUndo`, `type InkGesture` from `gexplorer/widgets`;
  delete `widgets/corkboard/ink.ts`;
- a look: `const CB_LOOK = { color: (c: string) => \`var(--cb-ink-${c})\` }` (the highlighter key 'hl' is the default);
- `beginInk(e, svg, arr, { mode: tool === 'erase' ? 'erase' : 'draw', color: tool, look: CB_LOOK, gesture, done })`
  (was `{ tool, gesture, done }`); `drawStrokes(svg, arr)` → `drawInk(svg, arr, CB_LOOK)`;
- the kit styles its own elements (fill none, round caps, the highlighter's opacity): `.cb-stk` rules can go;
- `Stroke` can become `InkStroke` (or stay: it is the freehand case). Shapes / text are optional for Corkboard (they
  would need tool buttons and `askText`).
