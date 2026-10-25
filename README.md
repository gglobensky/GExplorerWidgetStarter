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

## Keys

What a widget does with keys (the key mapper, 2026-10-24):

- **Actions are commands.** Declare them in `entry.ts`:
  `commands: [{ id, name, description, keys?, whileTyping? }]` (`WidgetCommandDecl` in
  `types/widgets-sdk.d.ts`), and expose `onCommand(id)` from `Widget.vue`
  (`defineExpose({ onCommand })`). The host calls it when one of the keys is pressed while your
  widget has the user's focus (they clicked in it, or Tabbed into it). The user sees every command,
  with its description, in GEM Shell's Keyboard shortcuts page and can change its keys: write the
  description for them, plainly.
- **Defaults:** at most 2 keys per command. A key the shell's own commands use (Ctrl+W, Ctrl+T,
  Alt+←...) is refused as a default: the user may still bind it to your command.
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
