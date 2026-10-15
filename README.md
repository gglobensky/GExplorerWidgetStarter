# GEM Shell widget starter

Widgets for GEM Shell (GExplorer), built against the public widget SDK (`gexplorer/widgets`,
typed in `types/widgets-sdk.d.ts`).

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
