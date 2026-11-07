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

- **A file explorer declares `role: 'explorer'` (2026-10-31)** in its `entry.ts` (the GExplorer does). One
  installed explorer is GEM Shell's **default**: folder tabs, the file dialog and every "open a folder" use
  it. Another one runs only where the user places it, a hub's grid, with a small `*` saying it isn't the
  default. Each explorer keeps its own menu layout and per-folder views (for now).
- **A navigable widget declares `role: 'navigable'` (2026-11-06)**: a folder of its own the user drives like a pane's
  (a console). Below, "A navigable widget".
- **The file explorer is a pane (2026-10-29).** Whichever widget is GEM Shell's explorer (today the
  GExplorer, `items`; the goal is that a better one can replace it) works in panes only: a folder tab, a
  hub's grid, the file dialog. Its navigation (its own Back / Forward / Up, the path bar, other widgets
  opening a folder in "the focused pane") and its focus (its keys, the pane GEM Shell aims at) are a
  pane's. The shell never offers it for the sidebar or the toolbar, whatever its `contexts` say, and
  shows a notice instead of running it if one was placed there before. An explorer replacing the
  GExplorer gets the same rule: build it for panes.
- **Your size (2026-10-31).** `props.placement.size.width` / `.height` are your box in CSS pixels, in every
  place, updated as the user resizes you (in a hub's grid and folder panes, `cols` / `rows` too). Lay yourself
  out from them instead of guessing the row height. They are information, not a control: the user sizes widgets
  by dragging in Edit Layout, and a widget never offers pixel fields for its own size.
- **Where `sdk.navigate` opens (2026-11-05).** The shell decides, from the user's setting (Settings ▸ Navigation)
  and the click itself, as browsers do: **Ctrl+click** or **middle-click** a new tab in the background,
  **Ctrl+Shift+click** a new tab switched to, **Shift+click** the whole tab. The shell reads the modifiers and the
  button from the user's own press in your widget: you don't pass them, and you can't fake them. Two things are
  yours: call `sdk.navigate` from a click **and from an `auxclick` with `button === 1`** (the browser never sends a
  middle-click as `click`), and stop the middle button's autoscroll on what navigates (`@mousedown.middle.prevent`):
  ```vue
  <button @click="go(fav)" @auxclick="e => { if (e.button === 1) go(fav) }" @mousedown.middle.prevent>…</button>
  ```
  A Ctrl+click on something your widget uses for selecting (Ctrl+click to add to a selection) isn't a navigation:
  the modifiers only count when `sdk.navigate` follows the press.

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
- To let people choose, declare `arranges` on a layout in `entry.ts` (next to `sizes`):
  `arranges: [{ id: 'rows', label: 'Arrange in rows' }, { id: 'columns', label: 'Arrange in columns' }]`.
  The Layout menu offers them after the sizes; the choice arrives in `props.config.view.arrange` and is kept
  per folder for an explorer (Items does this for Icons and Media).

## Drawing on pictures (the ink kit)

GEM Shell's picture editor and the Corkboard draw with the same kit (GEM Shell, 2026-11-05), from `gexplorer/widgets`:
`beginInk`, `drawInk`, `undoInk`, `flattenInk`, `inkPathD` and their types.

- **Your surface:** an `<svg>` over the picture with a `viewBox`. Strokes are kept in its units: give it a fixed width
  (`viewBox="0 0 1000 <h>"`) and the ink scales with the picture; or the picture's own pixels.
- **Your look:** `{ color: key => css, highlighter?: key => boolean }`. Keys are yours (`'k'`, `'hl'`...) or plain CSS
  colours; a CSS variable is fine on screen, `flattenInk` resolves it.
- **A gesture:** on `pointerdown`, `beginInk(e, svg, strokes, { mode, color, look, done })`. Modes: `draw` (freehand:
  smoothed for a mouse, pressure for a pen), `arrow`, `rect`, `ellipse` (dragged; Shift: square / circle / 45°),
  `text` (a click; `askText` shows your box and returns the words), `erase` (whole strokes; also the right button and
  a pen's eraser end). `done(u)`: save, and keep `u` for `undoInk(u)`. `gesture` tells whether a right-press erased
  (then it isn't a click for your context menu). The kit listens on `window` only while a stroke is under way.
- **Showing saved ink:** `drawInk(svg, strokes, look)`.
- **Into the pixels:** `flattenInk(img, strokes, look, { units, crop? })` → a PNG `Blob` (the picture's size, or the crop).
- Strokes are plain data: freehand `{ c, w, pts, p? }`, shapes `{ k, c, w, a, b }`, text `{ k: 'text', c, size, x, y, text }`.

## A picture editor (`role: 'picture-editor'`)

GEM Shell's picture editor is a widget (GEM Shell 2026-11-05; the official one: `widgets/picture-editor`). A widget
declaring `role: 'picture-editor'` in its `entry.ts` can be it: "Edit picture" (the file menu, on a PNG, JPEG, BMP or
WebP) hands it **one picture** and opens it in **a window of its own**. It runs nowhere else for now (no hub, sidebar
or toolbar), so it declares no `contexts`.

- **The window context.** `props.placement.context` is `'window'`, and `sdk.window()` is your window (null anywhere
  else): `opened` (`{ kind: 'file', path, name, needsElevation }`), `restored`, `setTitle`, `setDraft`, `keep`, `close`.
  GEM Shell draws the frame (your name, then your title; Fold, Maximize, Close); you draw inside it.
- **The picture handed to you** is yours to read and write, **that file only** (not its folder, not a file beside it),
  while GEM Shell runs. Read it with `sdk.fsReadBytes(opened.path, { type: 'image/png' })` and show
  `URL.createObjectURL(blob)` (GEM Shell's pages show `blob:` pictures, not the loopback stream's; a `blob:` picture
  keeps your canvas readable). Write it back with `sdk.fsWriteBytes(path, blob, { overwrite:
  true })`. A copy goes through `ui().saveFile` (the user's pick is the grant for the new file).
- **Your changes:** `setDraft({ dirty, save, discard })`. Closing with changes asks the user Save / Discard / Stay;
  Ctrl+S saves (GEM Shell's key: don't declare it); GEM Shell's close question counts them. `save` throws to keep them.
- **After a restart:** `keep(data)` (plain JSON, 2 MB) while changes aren't saved. GEM Shell offers "Unsaved edit of
  <title> — Resume / Discard" at the next start; Resume opens your window again with `restored`. `keep(null)` when
  nothing is left to keep. While something is kept, closing GEM Shell offers **Keep for later** beside Save and
  Discard: your changes stay as they are for the next start.
- **The clipboard:** `sdk.clipboardSetImage(pngBlob)` (Clipboard cap), right after the user's click or key in your
  widget only. `clipboardSetImage(png, { text })`: the picture and its text as one entry; `clipboardSetText(text)`.
- **Screenshots:** with "Edit" on GEM Shell's screenshot card, `opened.kind` is `'screenshot'`: GEM Shell's private
  copy of the clipboard's picture, deleted when your window closes. There is no original to save over: offer Save as
  (`ui().saveFile`, `startIn: opened.saveIn`, `suggestedName: opened.name`).

## Text in a picture

`sdk.text()` (GEM Shell 2026-11-05) reads the text in your own pixels, on this computer (Windows' own recognition;
nothing leaves the computer). No capability to declare.

```ts
const r = await sdk.text!().recognize(pngBlob)   // { language, text, lines: [{ text, words: [{ text, x, y, width, height }] }] }
```

- **The language:** `{ language: 'fr-FR' }`, one of `languages()`; none: the user's choice (Settings ▸ Pictures,
  `preferred()`), else their Windows languages. A language not in Windows: `E_NO_LANGUAGE` (the user adds it in
  Settings ▸ Time & language ▸ Language).
- **Errors** (`e.code`): `E_UNAVAILABLE`, `E_NO_LANGUAGE`, `E_BAD_PICTURE`, `E_TOO_LARGE` (32 MB), `E_TIMEOUT`,
  `E_FAILED`. One recognition at a time for all of GEM Shell: the next waits its turn.
- **Zones over a picture:** the ink kit's `beginInkZone` (drag a rectangle; a right-press on one removes it),
  `drawInkZones` (outlines numbered in reading order, never in the pixels) and `readInkText(img, strokes, look,
  { units, zones, read: png => sdk.text!().recognize(png) })`: the text zone by zone, joined by blank lines (no zone:
  the whole picture). Text recognition is a part of the kit you turn on by giving it that reader.
- **Copying it:** `sdk.clipboardSetText(text)` (Clipboard cap, on the user's click or key).

## The user's city

Declare `{ cap: 'Geolocation', reason: '…' }` (GEM Shell, 2026-10-30) and call `sdk.geolocate()` from a click or a
key press in your widget:

```ts
try {
  const city = await sdk.geolocate!()   // { name, region?, country?, countryCode, latitude, longitude }
} catch (e: any) {
  if (e.code === 'os-off') { /* the shell already offered the system's location settings */ }
}
```

- You get a **city** and **the city's coordinates**, never the computer's position (GEM Shell finds the nearest
  town offline; GeoNames data, CC BY 4.0).
- Only right after the user's own click or key press in your widget (`no-gesture` otherwise, in the security log):
  don't call it on mount or on a timer. Keep the city you got, and offer "Detect again".
- The user is asked first (the shell's consent dialog); errors carry a `code`: `no-gesture`, `declined`, `os-off`,
  `unavailable`, `timeout`, `error`.

## The installed programs (`Apps`)

Declare `Apps` (GEM Shell, 2026-11-01) to read the list of programs installed on this computer, and to start a
Microsoft Store app (an Xbox game):

```ts
capabilities: [{ cap: 'Apps', reason: 'Finds the games installed by Rockstar, the EA app, Ubisoft and Battle.net, and starts Xbox games.' }]
```

```ts
const r = await sdk.installedApps!().list()                 // the user is asked once
if (r.ok) for (const app of r.apps) console.log(app.name, app.publisher, app.installLocation, app.displayIcon)
await sdk.installedApps!().launch('Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft')   // from a click
```

- **The list** is what Windows' "Installed apps" page shows for desktop programs (the uninstall entries), with
  system components and updates left out. GEM Shell keeps it for 2 minutes; `{ refresh: true }` reads it again.
- **It gives no file access.** To read a program's folder, ask for Read as for any other folder.
- **Store apps aren't listed yet.** Find the ones you know (an Xbox game's `MicrosoftGame.config` names its package
  and its app), compute the package family name, and call `launch('<family name>!<app id>')`.
- **`launch`:** only right after the user's own click or key press in your widget. The user is asked once per app,
  with the name Windows shows for it. You get `not-installed` when Windows doesn't know that app.
- **Results:** `{ ok: true, … }` or `{ ok: false, reason: 'no-gesture' | 'declined' | 'not-installed' | 'bad-argument' |
  'unsupported' | 'failed' }`. Linux is `unsupported` for now.

## A navigable widget (`role: 'navigable'`)

GEM Shell 2026-11-06. A widget with a folder of its own that isn't a file explorer (a console's working folder)
declares `role: 'navigable'`. Placed in a hub's grid, it is a **pane**:
- a click focuses it, with the focus ring;
- the path bar shows its folder and moves it, and so do the pane's Back / Forward / Up, Favorites, Quick Links, and
  any widget opening a folder "in the focused pane". Their keys too, except inside a `captureKeys` element (a
  console's keys are its own there: "A console").

In the sidebar or the toolbar it is an ordinary widget (no pane, no focus): offer your own path field there
(`<gex-path-input>`, "A path field").

It is never an explorer: not a default explorer, not in folder tabs, the file dialog, "Swap for" or the file menus.
It is never `instance: 'global'` either: each placement is its own (its pane is its identity).

```ts
// entry.ts
role: 'navigable',
```

```ts
// Widget.vue
defineExpose({
    // The user moved the pane (and once on mount, with its current place)
    applyExternalCwd(locator: string) {
        if (locator === cwd.value || !isRealFolder(locator)) return reportWhereIAm()
        void goTo(locator)   // a console: session.cd(locator); `busy`: stay, and reportWhereIAm()
    },
    getNavState: () => ({ cwd: cwd.value }),
} satisfies WidgetNavigableExpose)

// You moved by yourself (the user typed `cd`): the pane, the path bar and its history follow
function reportWhereIAm() { if (cwd.value) void sdk.navigate?.(cwd.value, { replace: true }) }
function onFolderChanged(folder: string) { cwd.value = folder; void sdk.navigate?.(folder) }
```

- **Your own pane, without a click:** in a hub's grid, `sdk.navigate(folder)` moves your own pane (the same exception
  the explorer has). Anything else (a page, a new tab, several folders) needs the user's click, and in the sidebar or
  the toolbar every navigate does: there it goes to the focused pane, as any widget's.
- **It stays in your pane:** your saved view can't send your navigation to the whole tab (`navigateMode` is ignored).
- **Guard the loop:** your own `sdk.navigate` comes back to `applyExternalCwd` with the same folder: do nothing then.

## The computer's resources (`Performance`, `Processes`)

GEM Shell 2026-11-06 (`MONITOR-SHELL-ADDITIONS.md`). Read-only numbers, asked the first time (no click needed):

```ts
capabilities: [
  { cap: 'Performance', reason: 'Shows how busy your processor, memory, disks and network are.', together: true },
  { cap: 'Processes', reason: 'Shows which programs use them.', together: true },   // only if you list processes
]
```

```ts
const mon = sdk.monitor?.()
const r = await mon?.watch({ sets: ['cpu', 'memory'], intervalMs: 1000 }, s => {
  cpu.value = s.cpu?.total ?? 0          // 0–100; s.cpu.cores: one per logical processor
  used.value = s.memory ? s.memory.total - s.memory.available : 0
})
if (r?.ok) onBeforeUnmount(() => r.watch.stop())
```

- **Sets:** `cpu` (total, kernel, per core), `memory` (in use, committed, cache, pools, counts), `disks` (per physical
  disk: read / write bytes per second, active %, queue), `network` (per adapter: bytes per second, link speed), `gpu`
  (per GPU: load per engine kind, the busiest as `total`, dedicated / shared memory), `self` (GEM Shell's own use: its
  process and the ones it started, its web view's), `processes` (the busiest 1 024, with Processes).
- **Following a process:** `pid` (with Processes): it and the ones it started, summed, with each part (`follow`);
  `{ pid, gone: true }` once it ended.
- **No waste:** the backend reads only what some watch shows, once for every widget, at the fastest interval asked
  (500 ms at the fastest). Stop or narrow your watch (`change`) when you show less (folded, hidden).
- **Ends:** `stop()`, your widget removed, or a permission taken back (`onEnded`). 8 watches per copy.
- **Never:** a command line, a window title, a file, a user; nothing can be changed or stopped.
- **Not there yet:** temperatures and frame rates (they need administrator rights or drivers on Windows); Linux
  answers `available: false` for now.

## A console (`Terminal`)

Declare `Terminal` (GEM Shell, 2026-11-06) to run console sessions: Command Prompt, PowerShell, Git Bash, WSL. It's the
strongest permission there is (a console runs any command as the user): the question says so and asks once more
before Allow.

```ts
capabilities: [{ cap: 'Terminal', reason: 'Runs the consoles you open in it.' }],
keyboard: { claims: ['Ctrl+C', 'Ctrl+V', 'Esc'] },   // the keys a console can't do without (below)
```

```ts
const t = sdk.terminal!()
const s = await t.shells()          // { ok, available, shells: [{ id, label }] }: asks nothing (declined before the first grant)
const r = await t.open({ shell: 'pwsh', cwd: folder, cols: 80, rows: 24 })   // from a click: the user is asked once
if (r.ok) {
    r.session.onData(d => term.write(d))          // xterm.js, say
    term.onData(d => r.session.write(d))
    const release = t.captureKeys(termElement)    // the console's keys
}
await r.session.cd('D:\Projects')                // the ONLY way to move it (the path bar, a favorite, a menu item)
```

- **Moving to a folder:** `session.cd(path)`. GEM Shell quotes the folder for that shell and types the line only while
  the session waits at its prompt (`busy` otherwise: try again after the next prompt). Never `write()` a path: a folder
  named `x$(…)` would run code.
- **Where the shell is:** the output carries `OSC 133;A` (the prompt starts) and `OSC 9;9;"<folder>"`, and they are
  genuine: GEM Shell drops every other folder or prompt mark a program could print, and OSC 52 (clipboard). With
  xterm.js: `term.parser.registerOscHandler(9, …)` and `(133, …)`.
- **Keys:** inside the `captureKeys` element, while the user put the focus there and a session is live, every key
  reaches you (Ctrl / Alt combos, Esc) and no command runs, except the actions GEM Shell keeps on the user's keys:
  leave the pane, focus the next / previous pane, the cheat sheet. `keyboard.claims` takes such a key for you (the
  user is told once); claims that would leave no key to leave or move the focus are cut.
- **Copy:** `sdk.clipboardSetText` on a gesture. **Paste:** the browser's paste event reaches the focused console.
  **Links** in the output: `sdk.openUrl` on the user's click only.
- **Hidden:** sessions keep running. `sessions()` lists this copy's live ones after a remount; `session.replay()`
  gives the last 256 K characters to draw again. While one runs something, the tray shows a card with Stop.
- **Ends:** `kill()`, the widget removed, the permission taken back (at once), GEM Shell closing (everything the
  console started goes too). 16 consoles per copy, 32 in all. Linux: `unavailable` for now.
- **Where it starts (2026-11-06):** `open({ shell, cols, rows })` without `cwd` (or `''`) starts in the user's home folder.
- **A console in a popover (2026-11-06):** `ui.openPopover({ anchor, component, console: true })` (Terminal only,
  top-level, beside its anchor). A click in it counts as a click in your box however long it stays open (a plain
  popover's counts only for a minute after one), so the console keeps its keys; Escape with the focus in it is yours.
  It still closes on a click outside, Escape elsewhere, its anchor again and `close()`. GEM Console's toolbar uses it.
- **Example:** `widgets/console` (GEM Console).

## An app's links (steam://, uplay://…)

Declare `AppLinks` with the links your widget opens (GEM Shell, 2026-11-01), then call `sdk.appLinks().open()` from a
click or a key press:

```ts
capabilities: [
  { cap: 'AppLinks', reason: 'Starts your games through the store apps that own them.',
    links: [
      { scheme: 'steam', templates: ['steam://rungameid/{id}', 'steam://store/{id}'], label: 'Steam' },
      { scheme: 'com.epicgames.launcher', templates: ['com.epicgames.launcher://apps/{id}?action=launch&silent=true'], label: 'Epic Games' },
    ] },
]
```

```ts
const r = await sdk.appLinks!().open('steam://rungameid/620')
if (!r.ok && r.reason === 'not-registered') { /* Steam isn't installed */ }
const hasEpic = await sdk.appLinks!().available('com.epicgames.launcher')   // no prompt, nothing opened
```

- **Only the templates you declare** (GEM Shell 2026-11-03). A link must match one of its scheme's `templates` whole
  (`not-declared` otherwise): literal text, and `{id}` for one id (1 to 128 of `A-Z a-z 0-9 . _ : -` or `%3A`, an
  encoded `:`; no other `%`, no `/ ? & # = +`). Nothing can be added after the id: `steam://rungameid/620//-novid` (launch arguments) doesn't match
  `steam://rungameid/{id}`. At most 8 per scheme. GEM Shell's backend checks it too, against the templates the user
  approved. The old `prefixes` still load, each read as `<prefix>{id}`, with a console warning.
- **Asked once per scheme and set of templates.** The first link of a scheme opens GEM Shell's consent dialog, naming
  the app and listing the kinds of links ("Let Game Shop open Steam links: steam://rungameid/…, steam://store/…?").
  A new version declaring other templates asks again. The user sees and removes it in Settings ▸ Security ▸
  Permissions.
- **Only right after the user's own click or key press in your widget** (`no-gesture` otherwise, in the security log).
- **Never these:** `http(s)` (`openUrl`, which asks every time), `file`, `javascript`, `data`, `shell`, `search-ms`,
  the `ms-…` handlers (`ms-msdt`, `ms-settings`, Office…), GEM Shell's own. A declaration naming one is left out.
- **The app must be installed:** `not-registered` when no app opens the scheme (Windows' registered URL
  protocols). On Linux every link is `not-registered` for now.
- Results: `{ ok: true }` or `{ ok: false, reason: 'no-gesture' | 'not-declared' | 'declined' | 'not-registered' |
  'bad-argument' | 'failed', error? }`.

## Your size in a hub

Give your limits in **pixels** (GEM Shell 2026-11-06): what your content needs, and what it can use.

```ts
contexts: {
  grid: {
    minSize: { width: 220, height: 160 },        // px: never placed or resized smaller
    maxSize: { width: 900 },                      // px: never larger (a side left out: no limit)
    defaultSize: { width: '50%', height: '40%' }, // its starting size: a share of the hub's grid (or px)
  },
}
```

- A hub is a grid of cells whose size follows the window and the user's rows and columns. Your pixels are turned into
  cells when the user **adds** you or **resizes** you in Edit Layout, rounded **up** (never short of your minimum).
  Saved layouts are in cells and never move by themselves: a smaller window later, or more rows, can still make your
  box smaller than your minimum. Plan a compact layout (container queries) or let content scroll (`<gex-scroll-area>`).
- A minimum larger than the whole hub gets the whole hub.
- `{ cols, rows }` (cells) still works but is deprecated; both given, the stricter wins.
- Your real box: `placement.size.width / height` (px), with `cols / rows`.

## Several permissions in one question

Mark the permissions your widget always needs with `together: true` (GEM Shell 2026-11-06): the first time it needs
one of them, GEM Shell asks for all of them in **one question** instead of one question each.

```ts
capabilities: [
  { cap: 'Network', reason: 'Downloads the covers of your games.', together: true },
  { cap: 'Apps', reason: 'Finds the games you installed.', together: true },
  { cap: 'AppLinks', reason: 'Starts your games.', together: true, links: [ /* … */ ] },
  { cap: 'Read', reason: 'Reads the game folders you add.' },   // a folder: asked when you pick it
]
```

- **Nothing is asked ahead.** The question comes when your widget first needs one of them; the one needed now is
  marked so (even if it isn't marked `together`).
- **The user chooses each one** (a switch each, all on), or Allow all, or Cancel; until they take it back or for an
  hour. Each one allowed is a permission of its own in Settings ▸ Security, removable on its own.
- **What the user turned off** isn't in a group question again: you get the usual question when an action needs it.
  What they allowed and later took back (or that expired) is asked together again. A new version adding `together`
  permissions gets them asked the next time.
- **Only permissions about no folder** (Network, Geolocation, Terminal, AppLinks: each declared scheme, Apps: the
  list). Read, Write and the other folder ones are asked when the path is known; `together` on them is ignored.
- **Nothing gets weaker:** Geolocation, app links and starting an app still need the user's own click or key press
  each time.

## Settings

Declare fields in `entry.ts` (GEM Shell, 2026-10-30): GEM Shell draws them on your widget's page in Settings (its
Settings tab), checks and saves what the user picks, and gives it to you. One set of values for every copy of your
widget; per-copy choices stay in your own UI.

```ts
settings: {
  fields: [
    { key: 'units', type: 'choice', label: 'Temperature', default: 'C',
      choices: [{ value: 'C', label: 'Celsius' }, { value: 'F', label: 'Fahrenheit' }] },
    { key: 'refreshMinutes', type: 'number', label: 'Refresh every', unit: 'minutes', min: 5, max: 120, step: 5, slider: true, default: 15 },
    { key: 'rebuild', type: 'action', label: 'Rebuild the index', buttonLabel: 'Rebuild now' },
  ],
  groups: [{ title: 'Display', keys: ['units'] }],
},
```

```ts
const settings = sdk.settings?.()
const unit = computed(() => settings?.values.units === 'F' ? 'F' : 'C')     // reactive
settings?.onChange((values, key) => { /* after the user changed one */ })
const off = settings?.onAction('rebuild', async () => { /* the page's button */ })
```

- Types: `toggle`, `choice` (radios up to 4, a list beyond), `number` (`slider` with min and max), `text`, `path`
  (GEM Shell's path field), `color` (`#rrggbb`), `list` (of text or paths: add, remove, reorder), `keyValue`, and
  `action` (a button running your handler; enabled while a copy of your widget is open).
- `showWhen: { key, equals | in | truthy }` shows a field only when another fits. `hint` explains it.
- A field GEM Shell can't use is left out with a console error naming it. Values are checked against your
  declaration: what doesn't fit is replaced by the default. Each field has Reset; the page has Reset all.
- You never draw on the Settings page: it is GEM Shell's, so people can trust it.
- The user's changes are a draft until they press Save (2026-10-30): `onChange` fires once per Save (`key` is the
  field when one changed, `null` when several did). Action buttons run at once.

## The OS (`sdk.platform()`)

GEM Shell 2026-11-06. `sdk.platform?.()` is `'win32'`, `'darwin'` or `'linux'`: the OS GEM Shell's backend runs on, the
value GEM Shell's own OS switches use. No capability. Don't read `navigator.userAgent` or `navigator.platform` for it:
GEM Shell's web view doesn't say Windows reliably (GEM Console offered Linux shells on Windows that way).

```ts
const onWindows = (sdk.platform?.() ?? 'win32') === 'win32'
```

## GEM Shell's file preferences

Hidden and protected files are the user's choice for every widget alike (Settings ▸ Files & drives, 2026-10-31),
not each widget's. Read them with `sdk.prefs()` (read-only, reactive) and pass them to your listings:

```ts
const prefs = sdk.prefs?.()
const filter = computed(() => ({
  kinds: ['dir', 'dirLink'],
  ...(prefs?.showHidden ? { showHidden: true } : {}),
  ...(prefs?.showProtected ? { showProtected: true } : {}),   // honoured only while the user shows them
}))
watch(filter, () => reopen())   // the user changed them: list again
```

GEM Shell lists them on your widget's page ("Set by GEM Shell") when your widget follows them.

## Image storage

`sdk.mediaImageCreate(…, { storage })` keeps images in one of two places (Settings ▸ Widget storage shows both):
- `'cache'` (the default): **made again when needed**. Gone when unused for 30 days, beyond your room (500 MB), or
  when the user clears it. Right for anything you can fetch or decode again (posters, thumbnails).
- `'persistent'`: **kept until you delete it** (`mediaImageDelete`). Counts against your quota (200 MB). Right for
  what can't be made again (a frame the user picked, an edited cover).

Need more? Declare it in `entry.ts`; the user sees the reason on your page:

```ts
storage: {
  assets: { mb: 1024, reason: 'Covers you pick for your films' },   // asked once, the first time you need it
  cache:  { mb: 1500, reason: 'Posters of your whole library' },     // not asked (at most 2048)
},
```

The user can't resize these (your logic may count on them), only see them and clear your cache: expect a cached
URL to stop working, and make the image again.

## Shared libraries (a suite of widgets)

Code several of your widgets share (components, CSS, helpers, an animated logo…) lives **once** in
`shared/<name>/` and is **bundled into each widget** that imports it. Change it once, then rebuild the widgets that
use it:

```
npm run build -- --lib library-ui        # every widget importing it (directly or through another library)
npm run test  -- --lib library-ui        # shared/library-ui/tests/*.test.ts
```

A library is a folder with a `library.json` and an `index.ts` (its public face):

```
shared/library-ui/
  library.json   { "name": "library-ui", "version": "1.0.0", "licence": "PolyForm-Noncommercial-1.0.0",
                   "description": "…", "uses": ["gem-logo"] }
  index.ts       export { default as MediaShelf } from './MediaShelf.vue' …
  tests/         *.test.ts (optional)
```

```ts
import { MediaShelf, LibraryCase } from '@shared/library-ui'
```

- Import the library by name (`@shared/<name>`), never a file inside it: export what you need from its `index.ts`.
- A library imports `vue`, `gexplorer/widgets`, npm packages, its own files, and the libraries listed in its
  `uses`. Never a widget's files. The build refuses the rest, and loops between libraries.
- Each build says what it carried (`media-library carries library-ui 1.0.0`). Bump `version` when you change a
  library, so you can tell which build has which.
- Every widget stays **one file**, and GEM Shell's identity hash covers it: a library changes nothing about
  approval, and a change to it reaches a widget only when that widget is rebuilt (and updated). A few KB repeat
  across bundles; that's expected.
- Prefix a library's CSS classes (`.lib-library-ui-…`, or the suite's own prefix): its styles then never clash with a
  widget's.
- `npm run watch -- <type>` rebuilds a widget when a library it imports changes too.
- A suite kept in another repo can publish its library as an npm package instead: the build bundles npm packages
  the same way (and records their licences for the About page).
- An older `import … from '../../shared/x/…'` still builds, with a warning: switch it to `@shared/x`.
- What every widget should do the same way (hidden files, the listing filter, the clipboard, prefs) is the SDK's,
  not a library's.

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
- **Mouse gestures are listed too (2026-11-02).** What your widget does with the mouse (Alt-drag to draw,
  a right-drag to erase) isn't a command, but the user should find it where the keys are. Declare it:
  `gestures: [{ id, name, description, input: 'Alt+Drag' }]` (`WidgetGestureDecl`). It shows in Keyboard
  shortcuts and the cheat sheet with a mouse mark, and can be starred. It isn't rebindable and GEM Shell
  never runs it: your code reads the pointer, whose modifiers stay real.
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

## Drawing outside your box (GEM Shell 2026-10-31)

A widget draws **inside its own box**. Anything outside it goes through GEM Shell, which frames it
and names your widget: `sdk.ui().menu(...)` (a menu of choices), `sdk.ui().openPopover(...)` (your
own component in a panel the shell places and keeps on screen), message boxes.

What GEM Shell does at run time:
- **Your box contains you.** Nothing you render paints outside it; `position: fixed` inside it is
  relative to your box, not the window.
- **Your overlay layer** (`inject('widgetOverlay')`, where a `<Teleport>` of yours lands) draws under
  every shell dialog and is clipped to your box plus 24 px (never over the title bar): what you put
  there paints and takes clicks there only. A `<Teleport>` of yours lands there whatever its `to`
  says, unless `to` is an element of your own (your box, a GEM Shell slot inside it like the pane
  header, your layer, your popovers). In your popover's content (`openPopover`) it stays where it
  is, in the popover, unless it targets one of those.
- **Refused** (nothing happens, a line in the security log and a notice naming your widget): your
  code inserting into the page's `<body>` / `<html>` (`appendChild`, `append`, `insertAdjacentHTML`,
  `innerHTML`...), `document.write`, a modal `<dialog>` (`showModal`), a popover (`showPopover`).
- **Keys**: a `keydown` / `keyup` / `keypress` / `input` / `beforeinput` listener you add on `window`
  or `document` only sees the keys typed in your own box (or, with nothing focused, the keys pressed
  after the user last clicked in your widget). It never sees what is typed in the path bar, another
  widget or a shell field.
- Not a wall: widgets share one page. The official repo's review reads the code for the rest.

**Menus that open menus** (GEM Shell 2026-10-31). `openPopover` with an anchor inside one of your
open popovers (a row of a menu you opened) opens a **child level** next to it: the parent stays, a
new child of the same parent replaces the previous one, closing a level closes those under it, a
click in any level counts as inside the chain, Esc closes the deepest (8 levels at most). Drag and
drop between levels works: they are all your elements. `parent` overrides the guess: one of your
popover handles (a child of that one) or `null` (a top-level one; your others close).

```ts
// a folder row inside the first menu: its sub-folder opens beside it
ui.openPopover({ anchor: rowEl, component: FolderMenu, props: { folderId }, placement: 'right' })
```

A child level placed `'right'` / `'left'` sits against its parent's edge, at its row's height, never
over the parent. **Hover submenus**: `hover: true` on a child level lets it open on a hover (no
fresh click needed while the pointer is over your popover) and closes it by itself once the pointer
has been off it, its children and its parent for a moment; opening it again on its row leaves it open.

**Your look.** `openPopover({ ..., style })` restyles the frame: `background`, `color`,
`borderColor` (CSS colours or theme variables), `borderWidth` (0–3), `radius` (0–16), `shadow`
(`'none' | 'small' | 'normal' | 'large'`), `padding` (0–16). Size, position, stacking and the close
rules stay GEM Shell's; a `'center'` panel keeps GEM Shell's frame and title (your widget's name).

**Drag ghosts.** A drag that leaves your box can't show your own ghost element (clipped, or refused
in `<body>`). Ask GEM Shell for one at the start of the drag, while the user holds the button they
pressed in your widget:

```ts
const ghost = ui.dragGhost?.({ label: fav.label, icon: '★', offset: { x: 12, y: 8 },
                               style: { background: 'var(--surface-1)', borderColor: 'var(--accent)' } })
// it follows the pointer and closes by itself on release; ghost?.close() if your drag ends otherwise
```

Text only (label and sub-label 80 characters, icon 4); `style` takes colours and a radius. It is
hidden while GEM Shell asks the user something. While the button stays held, your widget's gesture
lasts (a menu you open by hovering a folder during a long drag is allowed).

**Windows** (GEM Shell 2026-11-05). Something the user keeps open while working elsewhere (details of a
file, a small tool) goes in a window GEM Shell frames: its header is GEM Shell's ("<your widget's name> —
title"), the drag handle, with **Fold** (into the operations tray: a card with Show and Close) and **Close**.
It stays until closed, your instance removed, or Escape in it; several at once (8 per instance); kept on
screen and under GEM Shell's dialogs. Open one as a popover: right after the user's own click or key in
your widget, while on screen.

```ts
const win = ui.openWindow?.({ component: Details, props: { path }, title: name, width: 420, height: 520 })
// win?.setTitle(...), win?.update({ ...allProps }), win?.fold(), win?.show(), win?.close()
```

`anchor` (an element of yours) opens it beside that element, else it is centred (cascading). Off by
default: `resizable: true` (a corner grip) and `remember: '<key>'` (its place, and size when resizable,
kept across restarts). The component gets `props.close()` and `inject('widgetSdk')`; a click in it counts
as your widget's own gesture (it may `sdk.reveal`, open a menu...).

**Saving what a window edits.** `saveFooter: true` puts GEM Shell's Discard / Save footer at the bottom,
always (greyed while nothing changed), for the whole window: register one draft covering everything your
window edits, every tab, and nothing changes before Save:

```ts
// in the window's component
props.setDraft?.({ dirty: () => changed.value, save: async () => { await apply() }, discard: () => reset() })
onBeforeUnmount(() => props.setDraft?.(null))
```

`save` throws to keep the changes (the footer shows its message). Closing the window with changes asks
Save / Discard / Stay; Ctrl+S saves the window that has the focus; GEM Shell's own close question lists it.

**Properties, for file explorers** (GEM Shell 2026-11-05). Any widget shows the Properties of files with
`ui.showProperties?.(paths, { count?, folder? })` (right after the user's click or key in it): a file explorer
draws them. GEM Shell's Properties entries (in your file menu, and in other widgets' file menus) go the same
way. The explorer draws the window: register
with `ui.onPropertiesRequest?.(req => ...)` (explorers only: `role: 'explorer'`), and unsubscribe on
unmount. `req`: `{ paths, count, folder, from? }` (a sample of paths when many: `count` says how many;
`folder`: the folder shown; `from`: the widget whose menu asked). The user's click counts as yours, so
`openWindow` works right away. The data, read as your widget: `sdk.fsProperties(paths)` (Metadata),
`sdk.mediaInfo(paths)` (Media: now also bitrates, frame rate, codec, channels, camera, exposure...),
`sdk.fsHash(path, { onProgress })` → `{ result, cancel() }` (Read), `sdk.fsSetAttributes(path,
{ readOnly?, hidden? })` (Write). A folder's size isn't read yet: it comes with GEM Shell's indexer. The
GExplorer's window (`widgets/items/PropertiesWindow.vue`, Alt+Enter) is the example.

**Permissions** (GEM Shell 2026-11-05). The same words on Windows and Linux: No access, Read, Read & run,
Read & write, Full control (`special`: a mix none of them says, sent back as it is). Reading needs Metadata:
`sdk.fsPermissions(path)` → `{ owner, group, entries, inherits, yourAccess, unixMode, features }` (`entries`:
`{ who, level, deny, inherited, appliesTo, rights, inheritanceFlags, propagationFlags }`; `features` says what
this drive can do: `supported`, `addPrincipals`, `deny`, `inheritance`, `changeOwner`, `search`, `unixBits`).
Changing them needs the **Permissions** capability (declare it with a reason; the user grants it per item or
folder, never "This file" only): `sdk.fsSetPermissions(path, { entries?, ownerId?, inherit?, unixMode? })`.
`entries` are the item's EXPLICIT rows as wanted (they replace them; inherited rows are its folder's). GEM Shell
itself asks before a risky change (your own access going down, Everyone getting write, inheritance off) and
offers "Retry as administrator": `E_CANCELLED` means the user kept them. People and groups:
`sdk.searchPrincipals(query, forPath)` → `{ items, directoryUnreachable }` (an empty query lists the built-in
ones; a domain that doesn't answer in time is said, not waited for) and `sdk.resolvePrincipal(name, forPath)`
for a typed `DOMAIN\name`. Ask GEM Shell's risk question when the user MAKES a choice:
`sdk.confirmPermissionChange(path, wholeDraftChange)` → `false` means "Keep them as they are": undo that last
choice only (accepted risks aren't asked again at Save). A refused owner fails with `E_INVALID_OWNER` and
`err.part === 'owner'` (nothing is written). Windows ADDS UP allowed rights (the folder's, the groups', the
item's): an allowed row at `none` takes nothing away; to mean "No access" there, write a denied row at `full`
(GExplorer does, and says so). Simpler (GEM Shell H4c-6): the model's `people` gives one line per person (their real
access, `fromFolder`, `setHere`, `lowered`), and a change's `people: [{ principalId, level | null }]` sets their real
access: GEM Shell writes the rows it takes (lowering below the folder's denies the difference; `null` puts them back
to the folder's); `ownerChoices` lists who may own the item without administrator
rights (others: tag them "needs admin": Save offers "Retry as administrator"). Linux shows three rows (owner, group,
everyone else) and the mode: UNTESTED until GEM Shell's Linux port. GExplorer's Permissions tab (`PermissionsTab.vue`, `permissionsDraft.ts`,
`PrincipalPicker.vue`) is the example: a draft saved by the window's footer with the rest.

**The packaging check.** Every `npm run build` / `watch` first reads your widget's sources and
styles (and the shared libraries it imports) for these:

| Rule | Level | What it finds |
|---|---|---|
| `page-root` | error | `document.body`, `document.documentElement` |
| `top-layer` | error | `showModal()`, `showPopover()`, `togglePopover()`, `<dialog>`, the `popover` attribute |
| `iframe` | error | an `<iframe>` |
| `eval` | error | `eval(...)`, `new Function(...)` |
| `page-keys` | error | a key / input listener on `window` or `document` (`addEventListener`, `onkeydown = ...`) |
| `teleport` | warning | `<Teleport to=...>` |
| `fixed` | warning | `position: fixed` |
| `vue-app` | warning | `createApp()`, `createSSRApp()`: a second Vue app |
| `shadow` | warning | `attachShadow()` |

An **error stops the build**. Change the code, or, for a case you can explain (the repo's review
reads it), allow the rule in `widgets/<type>/review.allow.json`:

```json
{ "allow": { "page-keys": "Queue keys after a click in the player (GEM Shell scopes them to it)." } }
```

(a reason of at least 15 characters per rule), or for one build only: `npm run build -- <type>
--allow <rule>`. The findings, what was allowed and why go to `dist/reviews/<type>.json` (next to the
build: `dist/runtime-widgets/<type>/` holds only `index.js`). After the build the bundle is read too:
an error rule found only in `index.js` (a bundled npm package) is listed as a warning. Comments are
not read.

## Credits and licences

GEM Shell's About page (Settings → About GEM Shell → Widgets) lists every widget with what its
`entry.ts` declares: `license` (the widget's own, an SPDX id), `about` (Markdown) and `credits`
(`{ name, text?, url?, logo? }`: data sources, services, artwork; `text` is Markdown). The types
and limits are `WidgetCreditsDeclaration` in `types/widgets-sdk.d.ts`. The build adds `notices`
itself: the licence of every npm package bundled into `index.js` (`tools/notices.mjs`), and warns
about a package with no licence or no LICENSE file.
