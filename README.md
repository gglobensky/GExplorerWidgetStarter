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
