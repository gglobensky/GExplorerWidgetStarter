# GEM Shell widget starter

Widgets for GEM Shell (GExplorer), built against the public widget SDK (`gexplorer/widgets`,
typed in `types/widgets-sdk.d.ts`).

## Licence

Source-available, free for noncommercial use: the PolyForm Noncommercial License 1.0.0
(`LICENSE.md`), with an additional permission (`ADDITIONAL-PERMISSION.md`): you may accept
donations, sponsorships or memberships (such as Patreon) for your work on software made with this
code, as long as that software stays free of charge for everyone. Selling it, charging for access
to it, or limiting it to paying supporters is commercial use, which the licence does not allow.
Each widget declares the licence in its `entry.ts` (`license`).

## Layout

```
widgets/<type>/        one folder per widget, named after its type
  entry.ts             the widget's definition: export default { id: '<type>', Component, ... }
  tsconfig.json        for npm run typecheck
  tests/*.test.ts      optional: npm run test
  preview/             optional: index.html + widgets-shim.ts, for npm run preview
shared/                code several widgets bundle (shared/library-ui)
types/                 the SDK's types
tools/widget.mjs       every command below
dist/runtime-widgets/  build output (not committed)
```

A widget's folder name is its type and must be the `id` in its `entry.ts`: the build stops
otherwise, and GEM Shell refuses a bundle whose id differs from its folder.

## Setup (once per machine)

1. Node 20 or later (the tests need 22.6 or later), then `npm install`.
2. Tell the build where GEM Shell is: copy `widget.build.example.json` to `widget.build.json`
   (not committed) and set `shellPublicDir` to GEM Shell's `GExplorer/UserInterface/public`
   folder. The environment variable `GEX_SHELL_PUBLIC_DIR` overrides it.

## Commands

```powershell
npm run build -- media-library                 # build and install in GEM Shell
npm run build -- media-library --no-install    # build only: dist/runtime-widgets/media-library/
npm run build -- --all                         # every widget
npm run watch -- media-library                 # rebuild and install on every save
npm run preview -- media-library               # sample-data preview (prints its address)
npm run test -- media-library
npm run typecheck -- media-library
```

With pnpm: `pnpm build media-library`, and so on.

`build` makes one file, `index.js`: CSS, images and lazy imports are inlined (GEM Shell's identity
hash covers that file). `vue` and `gexplorer/widgets` are not bundled; the shell provides them.
Installing copies it to `<shellPublicDir>/runtime-widgets/<type>/` and checks the copy's SHA-256.
Then build GEM Shell in Release: it ships everything in `public/runtime-widgets`.

## Adding a widget

Create `widgets/<type>/entry.ts` with `id: '<type>'` (lowercase letters, digits and dashes) and
copy a `tsconfig.json` from another widget. `npm run build -- <type>` finds it.

## Places

Where a widget can be placed comes from its `entry.ts` `contexts`: `grid` (a hub's grid), `sidebar`,
`toolbar`. Declare only the places your widget works in; it is offered for those only.

- **The file explorer is a pane (2026-10-29).** Whichever widget is GEM Shell's explorer (today the
  GExplorer, `items`; the goal is that a better one can replace it) works in panes only: a folder tab, a
  hub's grid, the file dialog. Its navigation (its own Back / Forward / Up, the path bar, other widgets
  opening a folder in "the focused pane") and its focus (its keys, the pane GEM Shell aims at) are a
  pane's. The shell never offers it for the sidebar or the toolbar, whatever its `contexts` say, and
  shows a notice instead of running it if one was placed there before. An explorer replacing the
  GExplorer gets the same rule: build it for panes.

## A path field

`<gex-path-input>` (GEM Shell, 2026-10-29) is the shell's path field: a text field with the path bar's predictions.
Use it wherever your widget asks for a path; it needs no import.

```vue
<gex-path-input v-model="folder" kind="folder" must-exist @valid="c => ok = c.ok" />
```

- Typing a separator lists that folder; typing filters; **Tab** takes the highlighted entry (no list: Tab moves
  the focus); Enter takes it after moving to it; Escape closes the list; Ctrl+Backspace deletes back to the previous
  separator. Folder variables work (`%APPDATA%\`, `~/`): only the ones that name folders.
- `v-model`: the text as typed. `lazy`: updated on Enter, blur and a pick only.
- `show-files` suggests files too (folders only by default); `exts: ['exe', 'lnk']` limits them.
- `must-exist`: a check line under it ("✓ Folder: C:\…", "There's no folder at …"); `kind` ('folder' | 'file' |
  'any') is what it expects; `@valid` gets `{ ok, exists, isDir, typed, expanded, unknown, message }`.
- `@enter`: Enter with nothing picked. `placeholder`, `disabled`, `input-id`, `:mono="false"`.
- It lists and checks **as your widget**: it needs your `Read` capability (without it, no suggestions), the same as
  your own listings.
- Its look: CSS variables `--gpi-bg`, `--gpi-border`, `--gpi-radius`, `--gpi-font-size`, `--gpi-fg`, `--gpi-pad`
  on it or a parent (your scoped classes don't reach inside it).

## Lists and grids, in rows or in columns

The list kit (GEM Shell, 2026-10-30) handles both flows: **rows** (left to right, then down; scrolls vertically)
and **columns** (top to bottom, then right; scrolls sideways). One `ListFlow` drives the three parts, so they
always agree:

```ts
import { createListFlow, lanesFor, useVirtualFlow, createVirtualGeometry, createListSelection } from 'gexplorer/widgets'

const lanes = ref(1)   // declared first: the flow reads it right away
const flow = createListFlow({ order: () => arrange.value, lanes: () => lanes.value })   // 'rows' | 'columns'
const v = useVirtualFlow({ scrollEl, sizerEl, rowsEl, flow, count: () => total.value,
                           onRange: (first, end) => source.ensure(first, end) })
watchEffect(() => { lanes.value = lanesFor(v.lines.viewportCross.value - 2 * pad, cellSize, gap) })
const selection = createListSelection({ source: () => src, flow, pageSize: () => v.pageLines.value - 1,
                                        onFocusMove: i => v.scrollToItem(i) })
const geo = createVirtualGeometry({ vlist: v.lines, scrollEl, flow, count: () => total.value, lane: () => laneGeometry() })
```

- `v.items` is one contiguous run of item indices: render them in order and let CSS place them
  (`grid-auto-flow: row` with `grid-template-columns: repeat(lanes, …)`, or `grid-auto-flow: column` with
  `grid-template-rows: repeat(lanes, …)`). `v.contentStyle` / `v.blockStyle` size and move them on the right axis.
- Lanes are yours to choose: `lanesFor(space, cell, gap)` over the viewport's other side
  (`v.lines.viewportCross`): its width in rows, its height in columns.
- Keys stay yours too (your keymap / commands): `selection.focusMove('left')` etc. go where the flow says.
  In columns, Left / Right move a column and Up / Down an item, and Down at a column's bottom continues at the
  top of the next one.
- Shift ranges and the marquee work unchanged (indices are contiguous in both orders); give the marquee
  driver's scroller `axis: () => flow.axis` so it auto-scrolls the right way.
- `useVirtualList` still works alone (now with `axis: 'x'`); `columns` options still mean a rows flow.

## Keys

What a widget does with keys (the key mapper, 2026-10-24):

- **Actions are commands.** Declare them in `entry.ts`:
  `commands: [{ id, name, description, keys?, whileTyping? }]` (`WidgetCommandDecl` in
  `types/widgets-sdk.d.ts`), and expose `onCommand(id)` from `Widget.vue`
  (`defineExpose({ onCommand })`). The host calls it when one of the keys is pressed while your
  widget has the user's focus (they clicked in it, or Tabbed into it). The user sees every command,
  with its description, in GEM Shell's Keyboard shortcuts page and can change its keys: write the
  description for them, plainly.
- **Under the mouse:** `when: 'hovered'` on a command also runs it for your widget while it is under the
  mouse, without the focus (for parts a click opens instead of focusing, as Favorites' pills: F2 renames
  the hovered folder). Find what is hovered in `onCommand` (`el.querySelector('[data-x]:hover')`).
- **Defaults:** at most 2 keys per command. A key the shell's own commands use (Ctrl+W, Ctrl+T,
  Alt+←...) is refused as a default: the user may still bind it to your command.
- **Buttons show their keys.** A button that does what a command does: `v-gex-command="'play-pause'"`
  (no `@click`). A click runs `onCommand('play-pause')`, as the key does, and the tooltip shows the
  command's name, its description and the keys the user chose; it follows their changes. Give your own
  texts with `v-gex-command="{ id: 'play-pause', content: 'Pause' }"` (`detail: ''` leaves the description
  out). A button with its own click: `v-gex-tooltip="{ content: 'Remove', command: 'remove-track' }"`
  adds only the keys. Elsewhere (a canvas, a status line): `sdk.keys!().of('play-pause')` and
  `onChange`. Don't write a key in a text yourself: the user may have changed it.
- **Shortcut keys are the shell's to see (2026-10-29).** Your code never sees a shortcut combo on a
  key event: Ctrl / Alt / Meta + a key, the F-keys, and Delete / Insert outside a text field read as
  nothing (`key` is `'Unidentified'`, no modifiers, `getModifierState()` false). Declare a command
  instead: the user sees it and can change its keys. Still yours to read: a modifier pressed alone
  (hold Ctrl to show something), any key without Ctrl / Alt / Meta (typing, type-ahead, Enter, Escape,
  Tab, Space, Backspace, arrows, Home / End, Page Up / Down, with or without Shift), Ctrl + an arrow /
  Home / End / Page Up / Page Down / Space (a list's conventions), and AltGr characters in a text
  field. Typing works as always. `npm run build` warns about a line that tests a modifier with a
  shortcut key.
- **Keys you don't use: leave them alone.** No `preventDefault` / `stopPropagation` on a key your
  widget does nothing with: the shell may act on it (Escape backs out one level: your selection
  first, then the focused pane).
- **A control's own keys stay yours**, without a command: arrows / Home / End / Enter in a list
  that has the focus, typing in a field. Listen to them on your own elements, not the whole
  document: on `document` they would take keys from every other widget and the shell.

## Credits and licences

GEM Shell's About page (Settings → About GEM Shell → Widgets) lists every widget with what its
`entry.ts` declares: `license` (the widget's own, an SPDX id), `about` (Markdown) and `credits`
(`{ name, text?, url?, logo? }`: data sources, services, artwork; `text` is Markdown). The types
and limits are `WidgetCreditsDeclaration` in `types/widgets-sdk.d.ts`. The build adds `notices`
itself: the licence of every npm package bundled into `index.js` (`tools/notices.mjs`), and warns
about a package with no licence or no LICENSE file.
