# GEM Corkboard

Sticky notes on a cork board, for the GEM Shell grid (a quarter of the screen or less) and the sidebar.

**0.2.2 (2026-11-02):**
- **A board as a file.** Boards ▾ ▸ *Save this board as a file…* (or the *Save as a file…* button in Export) writes a `.gembrd` file where you choose, with GEM Shell's save dialog; a stack exported the same way is a `.gemstk`, and Markdown a `.md`. *Open a board file…* (Boards ▾, the board's right-click, or *Open a file…* in Import) opens GEM Shell's file dialog filtered to `.gembrd` / `.gemstk` and adds it as a separate copy, as a pasted copy does. The file is the same JSON as a Corkboard copy; its pictures go in as WebP when that's smaller, since a Corkboard opens files up to 8 MB (a larger one is saved only after a warning). New capabilities: **Read** and **Write** (GEM Shell asks once).
- **Move to page** (right-click a stack, a group or a pinned picture): any page of the view, or a new one. It keeps its size when there's room, shrinks to fit when there isn't (2 × 2 → 2 × 1 → 1 × 2 → 1 × 1). When it can't fit even 1 × 1: if making some of the larger items there 1 × 1 would make room (the largest first, as few as needed), it asks before doing it; otherwise it says the page is full and moves nothing. Undo in the snackbar.

**0.2.1 (2026-11-02), after Guillaume's test of 0.2.0:**
- **Choosing a picture uses GEM Shell's own file dialog** (`ui.openFiles`, pictures only): *Pin a picture here…* (several at once, each on the next free cell) and *Insert a picture…* in a note. The asset is made from the path chosen (`mediaImageCreate({ type: 'file' })`). The widget has no browser file input left; any other file choice later goes through the same API.
- **A very small view** (under 460 px wide or 360 px high): the open note fills it, the dock of the other stacks is gone. ✕ goes back to the board to pick another stack.
- **A picture opened large is in front of everything.** The board's cards kept their stacking order (`z`) against the view, so the notes raised often showed above it; the board is its own layer now.

**0.2.0 (2026-11-02): tables and pictures on the board.** No shell change; a 0.1 desk loads as it was (no pictures, no tables yet).
- **Tables in a note** (a simple grid, no formulas):
  - *Table* in the note's footer, Alt+T, or right-click a line ▸ *Insert a table*: 3 × 3 with a header row, where the caret is (an empty line becomes the table);
  - in a cell, the list keys move: Tab the next cell (a new row after the last), Shift+Tab the previous one, Shift+Enter out of the table; Enter goes down a row, and on an empty last row leaves the table; the arrows cross cells at their edges and step out above and below;
  - ＋ on the right adds a column, ＋ underneath a row; drag a column's right edge to change its width;
  - right-click a cell: insert rows / columns there, delete the row / column (Undo in the snackbar), first row as a header, delete the table;
  - cells copied from Excel or Google Sheets, pasted on an empty line, become a table; pasted into a cell, they fill from it (the table grows);
  - search finds the cells' text; the board's preview shows the first rows; Markdown export writes a Markdown table.
- **Pictures pinned on the board** (a photo of someone, a blueprint, a reference):
  - paste a picture on the board, drop one there, or right-click the cork ▸ *Pin a picture here…*;
  - on the board it's a print with a pushpin, in the picture's own shape, slightly tilted, its caption written under it; drag it like a stack (push, Shift swaps, Alt places freely, onto a pin: into the group); its corner makes it up to 2 × 2. A wide picture takes two cells when they're free;
  - click it: it opens large over the board. Drag draws with the pen chosen below, right-drag erases, the wheel zooms around the pointer (− / Fit / ＋ and the keys - 0 +, double-click: fit ↔ actual size), middle-drag, Space + drag or ✋ moves it. What you draw shows on the print too. The caption is written at the top. Esc or ✕: back;
  - right-click it: open large, caption, clear the ink, pin into a group / take out, take it off the board (asks first, Undo after);
  - a board's export carries its pictures (with their ink and caption), so a pasted board copy has them.
- Paste a picture on the board **used to** make a new stack holding it; it now pins it. Into an open note it goes as before.

**0.1.1 (2026-11-02), after Guillaume's first test:**
- **Note titles:** right-click a note's tab ▸ *Give it a title…* (or double-click the tab). The title shows on the tab, in the note's header, on the board and in search; empty goes back to the first line. Right-click ＋ to start a note with a title.
- **Empty lines go:**
  - a line emptied (Enter made it, its text deleted) goes when the caret moves to another line;
  - empty lines left when you switch notes or close the stack go then;
  - kept: the note's only line, and the line under a picture or a sketch at the end.
- **Rebinding the list keys to plain keys works.** End the list on ↓, for example: the editor now leaves any key bound to one of its commands to the key mapper. Plain keys reach GEM Shell's dispatcher after the widget's own listener, and the editor's ↓ (next line) used to take it first. The commands and gestures moved to `commands.ts` so the editor can read them.

**0.1.0 (2026-11-02):** the first version, ported from the prototype agreed with Guillaume (artifact "Corkboard Prototype").
It needs two shell parts, both in `PhotinoVue1/CORKBOARD-SHELL-ADDITIONS.md`:
- **A:** the grid engine as `gridSnapshot` / `gridDrag` / `gridResize` / `gridFirstFree` from `gexplorer/widgets`;
- **B:** `gestures` in entry.ts, listed in Keyboard shortcuts and the cheat sheet.

## What it does
- **Boards:**
  - one desk per copy of the widget, which holds boards (General by default; others with a title or none, and a surface: cork, felt, slate, clay, plum, linen);
  - the board's name, top left, switches, creates, renames, exports and deletes them (deleting asks first, and Undo is offered after).
- **Stacks:**
  - a stack is a subject's notes; the board shows its top note;
  - drag one and the others are pushed aside live, by the hubs' own engine;
  - drop it on the **middle** of another to pile them, on an **edge** to push;
  - **Shift** swaps, **Alt** places it freely (or snaps, when snapping is off);
  - drag its **corner** to grow it (up to 2 × 2, pushing the others).
- **Pages:**
  - when the board is full, it pages: dots at the bottom, the wheel, PageUp / PageDown;
  - while dragging, hold at an edge or over a dot to change page; the empty dot is a new page.
- **Groups:**
  - a pin holds several stacks; its due date hangs off the pin, coloured as it nears and red when late;
  - drop a stack on a pin to put it in; open the group to see its stacks, and drop one on "‹ board" to take it out.
- **Flags:** Important, In progress, Waiting, Idea, Done, shown as markers on the stack's edge and chips in the open note. Search finds them too.
- **An open stack:**
  - the other stacks shrink to a strip (left, or along the top when narrow);
  - divider tabs on the right switch notes; drag a tab to reorder, onto another stack to move the note, onto ＋ for a new stack.
- **Lists:**
  - `- `, `[ ] `, `1. `, `# ` at a line's start make a bullet, a checkbox, a number, a heading;
  - Enter on an empty item steps out one level;
  - **Shift+Enter ends the list at once** and keeps writing under the item, lined up;
  - Tab / Shift+Tab indent from anywhere in the line;
  - Backspace at an item's start makes it plain text.
- **Ink:**
  - a sketch area (Sketch, Alt+S), or a pasted / dropped screenshot to draw on;
  - Alt-drag scribbles anywhere on the note; a right-drag erases;
  - pen pressure is followed. Pen mode (⋯): a pen draws anywhere, touch scrolls.
- **Tables (0.2.0):** a simple grid in a note, no formulas; see 0.2.0 above.
- **Pictures on the board (0.2.0):** pinned prints, opened large to view and draw; see 0.2.0 above.
- **Copies:**
  - Export a stack or a board as a Corkboard copy (pictures inlined) or as Markdown;
  - paste a copy onto any board, in any copy of the widget, to add it as a **separate duplicate** (not kept in sync).
- **Hints:** the footer and the board show the 1–2 keys or gestures that matter where you are, with your own keys (`sdk.keys()`). Each goes once used three times. ⋯ ▸ Key hints turns them off.

## Keys, gestures, menus
- **Commands** (entry.ts) appear in GEM Shell's Keyboard shortcuts, where the user rebinds them and stars them for the cheat sheet (F1).
  - The list keys (Shift+Enter, Tab, Shift+Tab, Ctrl+Enter, Ctrl+Shift+7 / 8 / 9 / 1 / 0, Alt+↑ / ↓) are `whileTyping` and act on the note's line only.
  - Enter, Backspace, Delete and the arrows are the editor's own keys.
- **Gestures:** double-click, Alt-drag, right-drag, pile, place freely, swap. They're listed the same way and can be starred, but they can't be rebound.
- **Menus:**
  - GEM Shell's (`ui.contextMenu`), for the board, a stack, a group, a note's text, a drawing, a tab, a table, a pinned picture (0.2.0: eight contexts);
  - live lists (flags, due dates, colours, groups, boards, stacks, pens) are declared submenus;
  - `menuStates` grey or hide what doesn't apply.
- **Dialogs:** board, group, due date, export and import are GEM Shell popovers; deletions use `ui.confirm`; Undo is in the snackbar.

## Data
- **Where:** `configRead` / `configWrite('desk-<sourceId>')`, a `DeskData` with `schema: 1` (model.ts).
- **0.2.0 adds, still `schema: 1`:** `photos` / `photo` on the desk (a 0.1 desk reads as none) and the `table` block (`rows` of cells' HTML, `head`, `widths` in %). Nothing of 0.1 changed shape. A 0.1.1 Corkboard doesn't know tables or pinned pictures: don't go back to it once you use them.
- **When it's saved:** 0.7 s after a change, and at once on suspend and unmount.
- **Pictures:**
  - persistent image assets (`mediaImageCreate`, Media capability), 1600 px at most, PNG;
  - a note keeps the asset id and url;
  - a pinned picture keeps its own asset the same way (0.2.0);
  - an asset is deleted 20 s after the last note or pinned picture using it goes (Undo may bring it back).
- **Copies** (exchange.ts): checked on the way in (known fields, sanitized text, bounded numbers, image data only), with new ids and new assets.

## Files
| File | What |
|---|---|
| `entry.ts` | manifest: menus, contexts, Media capability |
| `commands.ts` | the commands and gestures (entry.ts declares them; the editor reads which keys are commands) |
| `model.ts` | types, dates, parsing of lines, factories, HTML clean-up |
| `layout.ts` | pages over the shell's grid engine; re-flow when the column count changes |
| `store.ts` | the desk: load / save, views, every change, undo, pictures, learned hints |
| `exchange.ts` | export / import (JSON, Markdown), the Start here stack |
| `menus.ts` | menu declarations and their handling |
| `editor.ts` | the note editor (one contenteditable per line, and per table cell, imperative) |
| `table.ts` | tables: their HTML, rows / columns / widths, pasted cells, Markdown (0.2.0) |
| `ink.ts` | strokes, erasing, ink undo |
| `Widget.vue`, `Board.vue`, `StackView.vue` | toolbar, board, open stack |
| `PhotoView.vue` | a pinned picture opened large: zoom, ink, caption (0.2.0) |
| `dialogs/*.vue` | board, group, due date, copy, stack options |
| `corkboard.css` | everything `cb-*` |

## Checked before handing over (in the cloud)
- All `.vue` files compile with the starter's `@vue/compiler-sfc` 3.5.22.
- Everything type-checks under `strict` against `types/widgets-sdk.d.ts` and Vue's types, templates included.
- The packaging check's rules find nothing.
- A run in Chromium with a stand-in SDK, all without an error:
  - the board, opening a stack, the list keys, a sketch and a stroke;
  - piling, pushing, a 2 × 2 resize;
  - the menus' contexts and submenus, a new group with a due date, a new board, a board export.
- 0.2.0, the same checks, plus a run that loads a desk saved by 0.1.1 (a stack, a group): it shows as it was; then a table typed with Tab / Enter, left with Enter on an empty row, re-entered with ↑, a column deleted and a row inserted from the menu, cells pasted from a spreadsheet, a column dragged wider, Shift+Enter out; a picture pasted on the board (a wide one: 2 cells), opened, drawn on, zoomed with the wheel, captioned, the stroke undone, closed with Esc, dropped on a pin, and a board export carrying it. The 0.1.1 runs pass again.
- **Not run:** `npm run build` / `typecheck` on the real starter, and GEM Shell itself. Those are the gate.

## To check (in GEM Shell)
- [ ] `npm run typecheck -- corkboard` and `npm run build -- corkboard` pass.
- [ ] The first open shows the Start here stack. A second copy of the widget has its own desk.
- [ ] Drag a stack across others: they move aside live and settle on drop. On the middle of a stack: piled (Undo in the snackbar).
- [ ] The corner grows a stack to 2 × 1 and 2 × 2 and pushes the others; at the last row of a page it doesn't cross onto the next.
- [ ] Fill a page: a new stack goes to page 2; the dots, the wheel and PageUp / PageDown work; dragging to an edge flips.
- [ ] Shift+Enter, Tab, Ctrl+Enter in a list (the key mapper's commands while typing). Rebind one in Keyboard shortcuts: the footer hint shows the new key.
- [ ] Keyboard shortcuts ▸ GEM Corkboard lists the gestures with the 🖱 chip; star one, F1 shows it.
- [ ] Gestures (part B): Keyboard shortcuts ▸ GEM Corkboard lists the six with the 🖱 chip, and starring one shows it on F1's sheet. (A bad input, e.g. `'Win+Drag'` in commands.ts, is refused with a `[keys]` line; not worth testing on its own, Guillaume.)
- [ ] Right-click everywhere (board, stack, group, text, drawing, tab): the items and submenus, and Settings › Context Menu lists the six contexts.
- [ ] Paste a screenshot into a note, draw on it, right-drag to erase. Close GEM Shell, reopen: still there.
- [ ] Export a stack, paste the copy onto another board or another Corkboard copy: a separate duplicate, pictures included.
- [ ] Sidebar: the dock goes along the top, the tabs show numbers.
- [ ] 0.2.0: your migrated notes are all there after the update (nothing to do; a backup export first doesn't hurt).
- [ ] Alt+T (or *Table*): type, Tab across, Enter down; Enter on an empty last row leaves; right-click a cell for rows / columns. Keyboard shortcuts lists *Insert a table*.
- [ ] Copy a few cells in Excel / Google Sheets, paste on an empty line: a table.
- [ ] Paste a photo on the board, or drop a file from Explorer: a print. Click it, draw, zoom, caption; Esc. Close GEM Shell, reopen: still there with its ink.
- [ ] Settings › Context Menu lists eight Corkboard contexts (the table and the picture are new).
- [ ] 0.2.2: GEM Shell asks for Read and Write once. Save a board as a `.gembrd`, open it from another Corkboard copy (Boards ▾ ▸ Open a board file…): a separate copy, pictures included.
- [ ] Right-click a stack ▸ Move to page ▸ a full page of big stacks: it asks to make room; a page of 1 × 1 stacks: it says it's full.

## Known limits (0.1.0, 0.2.0)
- Tables: no merged cells, no sorting, no formulas (as agreed). Pasting cells into a line that has text puts the table under it. Ctrl+Z inside a cell undoes typing only.
- A pinned picture opened large shows one at a time; there's no pinch-zoom with two fingers yet (the wheel and − / ＋ do it).
- Selecting text across several lines, then typing, only edits the first line.
- The browser's text undo doesn't cross a structural change (a new bullet, an indent). Deletions have Undo in the snackbar.
- Margin scribbles stay where they were drawn if the note's text reflows (a narrower widget).
- With the focus in the search box, Tab is still the Corkboard's Indent command (the key mapper runs it while typing), so it doesn't move the focus.
