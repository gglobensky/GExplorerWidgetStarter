# library-ui 2.1.0: the library look

This is the look shared by GEM's media libraries: the **Video Club** (`widgets/media-library`) and the **Game Library** (`widgets/game-library`).
It's bundled into each widget that imports it.
How shared libraries work (imports, builds, versions) is in the starter's README, under "Shared libraries".

```ts
import { LibraryFloor, MediaShelf, LibraryCase, ArtworkFrame, formatYear, type LibraryItem } from '@shared/library-ui'
```

The styles come with the import (`index.ts` imports `library-ui.css`).
Put your widget's root inside `.gem-library-surface`, which sets the `--glu-*` colours.

## What's here, and what isn't

The library holds only what **any shop of boxes** needs. What only one kind of item has stays in its widget.

| Here (shared) | In the widget |
|---|---|
| `LibraryItem`: id, title, year, platform, genres, synopsis, artwork, rank, new arrival, path, local edits | The Video Club's `MovieItem` (`movie-types.ts`): runtime, rating, scene previews, watch progress, series and episodes, extras, TMDB |
| `LibraryCase`: a box on a shelf, with a `variant` (its box style) and a `marks` slot for what sits on it | What sits on the box: the Video Club's `CaseMarks.vue` (watched, progress); the Game Library's store stickers and Play button (to come) |
| `MediaShelf`: a titled shelf that scrolls sideways (the classic layout), with A–Z jump and paging, and a `tools` slot | The Video Club's `ClubShelf.vue`: the season filter of a series shelf |
| `LibraryFloor`: the store floor (an aisle of racks, featured racks first, a rack's department) with `intro` and `focus-tools` slots and the words of its counts | The Video Club's `StoreFloor.vue`: the wordmark, series grouped on racks (`showroomRowsFor`), the season filter, "movies" and "episodes" |
| `ArtworkFrame`, `formatYear` | `formatRuntime`, `formatCue`, `extraDisplayName`, `seasons.ts` |
| The styles of boxes, shelves, the floor and artwork (`glu-case*`, `glu-shelf*`, `glu-floor*`, `glu-artwork`, `glu-alpha-jump`) | The movie detail page (`LibraryDetail.vue` and `library-movie.css` in the Video Club) |

**Rule of thumb:** a piece moves here once a **second** widget needs it, not before.
Example: the case flip, the description and genre editors and the rating stars of the movie detail page move here only when the Game Library's detail page uses them.

## The components

All of them are generic over your item type (`<script setup generic="T extends LibraryItem">`). You get your own type back in events and slots.

- **`SkinPicker`** / **`SkinEditor`** (3.5.0): the looks in a shop's ⚙ menu and the skin editor; both take
  `:skins="useSkins(…)"`. Skins are data (`skins.ts`), shared as `.gemskin` files.
- **`LibraryCase`**
  - props: `item`, `selected`, `variant` (`'dvd'` by default, `'bigbox'` for PC games);
  - events: `open(item)`, `menu(item, event)`;
  - slot: `#marks="{ item }"`, drawn over the artwork.
- **`MediaShelf`**
  - props: `title`, `shelfId`, `note`, `items`, `selectedId`, `variant`;
  - slots: `#tools` (before the A–Z jump), `#marks`;
  - `resetPosition()` (on its ref) clears the A–Z jump and scrolls back to the start. Call it after you change what the shelf shows.
  - It shows the items as given: to filter them, pass the filtered list.
- **`LibraryFloor`**
  - The aisle:
    - `shelves` (genre racks) and `featured` (racks at the head of the aisle);
    - a rack's rows and count: `rowsFor(shelf, maxRows)` and `countFor(shelf)`. By default they're its items, 6 to a row,
      as many rows as the rack's height holds (`maxRows`, 3 to 10);
    - the words of the counts: `rowCount(row)`, `setCount(n)`, `setUnit` and `itemsNoun`. By default they say "titles".
  - A rack's department:
    - `activeShelf` opens it;
    - `activeItems` and `activeNote` when you filter it (a season, for example);
    - a shelf with `groups` (sets) gets one row per set.
  - Slots: `#intro` (the floor's heading), `#focus-tools` (beside the department's title), `#marks`.
  - `jumpTo(shelfId)` (on its ref, 2.4.0) centres a rack in the aisle and lights it for a moment. The racks are
    reached from the widget's own top-bar list (`glu-picker`, below). The floor no longer draws a list of its own:
    2.3.0's doubled the Video Club's "Genres".
  - Events: `select-shelf(id)`, `open(item)`, `menu(item, event)`.
  - **Next:** platform sections (PC, then consoles) for the Game Library's emulation. Every item already has a `platform`.
- **`StoreDetail`** (2.2.0): an item opened in the shop, the Video Club's movie-store page made shared.
  - The box sits in the middle, as big as the widget allows. A click turns it over (`v-model:flipped`).
  - Its colours come from the box's art: `--store-base`, `--store-accent` and `--store-text`.
  - Props: `item`, `kicker` (the line above, "From Action"), `flipped`, `ratio` (2/3).
  - Slots:
    - `#controls`: the left column's big buttons (`<button class="primary">`, icon in `<span>`, words in `<b>`);
    - `#front`: over the front's art;
    - `#back`: the back. `glu-sd-backdrop`, `glu-sd-tile` (a picture pinned on it) and `glu-sd-back-copy` are styled for it;
    - `#stage`: over the box (`glu-sd-edit-tools`, `glu-sd-editor`);
    - `#side`: the right column (`glu-sd-rating`: a `<button>`, or a `<div class="static">`);
    - `#behind`: behind the box (a disc);
    - `#overlay`: over the whole page.
  - Event: `close` (← or Esc).
  - The Game Shop uses it (0.5.0), and the Video Club's movie-store look since 0.11.0: its scene previews and
    player in `back` and `stage`, its extras under the rating in `side`, its disc and ✎ in `behind`. Its Classic
    details page stays its own (`glu-detail`, `library-movie.css`).

- **`LibraryMenu`** (2.4.0): the ⚙ menu of a shop's top bar, the Video Club's settings menu made shared.
  - Props: `tabs` (`[{ id, label, icon }]`) and `label` (its tooltip).
  - The default slot gets `{ tab, close }`. On its ref: `open(tab?)` and `close()`. A click outside or Esc closes it.
  - Classes for what goes in it:
    - `glu-menu-label` and `glu-menu-heading` (with a count, `.ruled` for a line above);
    - `glu-choices`: big buttons, each with an icon, a name and a line that says what it does;
    - `glu-toggle`, `glu-menu-list` (folders), `glu-menu-empty`;
    - `glu-menu-add` (dashed "＋ Add…"), `glu-menu-quiet`;
    - `glu-menu-actions` (`.wide` spans the row), `glu-menu-status`, `glu-menu-note`.
- **Top-bar lists** (2.4.0): `<label class="glu-picker"><span>▦</span><select>…</select></label>`, the Video Club's
  Genres and Sort look.
- Both shops use these: the Game Shop since 0.7.0, the Video Club since 0.11.0 (its own copies are gone).
  - `glu-toggle.disabled` (2.5.0): a choice that can't be made here.
  - In a widget narrower than 520 px (the top bar on two rows), the panel is shorter (2.5.0).

## History

- **3.8.0 (2026-11-09):** exported `.gemskin` files identify their compatibility family (`library-store`) through
  the shared GEM skin header. Old headerless library skins still load; another widget family's skin is identified by
  name instead of reported as corrupt. The extension remains `.gemskin` for every widget.
- **3.7.1 (2026-11-02):** the showroom's shelves are level across racks: when some rack's rows have labels (the
  Video Club's series and sets), every row keeps the label's room, empty shelves included ("Continue watching" sat
  higher than the genres).
- **3.7.0 (2026-11-02):** pictures in skins. A skin's `pictures` (name → a GEM Shell image kept for the widget,
  `/wasset/<id>.jpg|png`, checked by `normalizeSkin`); a value uses one as `picture(name)` (`cleanSkinValue`: a bare
  name only; `skinStyle` / `withPictures` make it `url("/wasset/…")`, or `none` when the skin has no such picture). In a
  `.gemskin` file they travel as PNG / JPEG data (at most 6, 2 MB each, a file at most 8 MB); loading one makes each
  through GEM Shell (`mediaImageCreate` bytes, persistent: decoded and re-encoded), never from the file as is. The
  editor's Pictures section: Add a picture… (a PNG or JPEG), one click to tile it on the wall, the floor or the back
  panel. A picture no skin uses any more is deleted (`mediaImageDelete`). No GEM Shell change.
- **3.6.0 (2026-11-02):** what's written on a department's shelves (`shelfLabels.ts`, LibraryFloor `tagFor`,
  `pickFor`, `rowStrip`; LibraryCase `tag`, `pick`): a paper tag under each box on the shelf's front edge, a yellow
  strip at the shelf's left end ("A – D", "1998 – 2004"), and a handwritten staff-pick card (Ink Free / Segoe Print,
  system fonts) on the best of a department, one per dozen (`staffPicks`, `staffOpener`).
- **3.5.0 (2026-11-02):** skins people make and share (like Winamp skins).
  - `useSkins(sdk, { doc, first, keepSelection?, notify? })`: the built-in looks (the shop's own first) and the user's,
    kept in the shop's config document `doc` (every copy of the shop has them). `duplicate`, `edit` (into `draft`:
    bind `draft ?? find(selected)` on the surface, so the shop shows it live), `saveDraft`, `cancelDraft`, `remove`,
    `importFiles` (ui().openFiles + fsReadText, at most 64 KB a file), `exportSkin` (ui().saveFile + fsWriteText:
    only the file picked; the widget needs the Write capability). `keepSelection`: the document also keeps the look
    chosen (`selected`, `select`).
  - `SkinPicker` (the looks in the ⚙ menu, a swatch each; the chosen one's Duplicate, Edit, Export…, Delete; Load a
    skin…) and `SkinEditor` (a panel beside the shelves: name, author, every value by group; a value not allowed is
    marked and not used).
  - `skins.ts`: `.gemskin` files (`skinFileText`, `parseSkinFile`: through `normalizeSkin`, with how many values were
    left out), `SKIN_FIELDS` (the editor's labels, groups and kinds), `newSkinId`, `copyName`, `builtInSkinsFrom`.
- **3.4.1 (2026-11-02):** holding an arrow key: the view follows the focus (moves less than 250 ms apart scroll at
  once instead of restarting a smooth scroll each time).
- **3.4.0 (2026-11-02):** `boxNav.ts`: `moveBoxFocus(container, dir)` moves the focus to the nearest box (or
  showroom rack) that way, by where they are on screen, and scrolls it into view; `boxDirectionOf('box-left')`. The
  widgets declare `box-left` / `box-right` / `box-up` / `box-down` commands (Left / Right / Up / Down) for GEM
  Shell's key mapper and call it from onCommand. The focused box is the pulled-out one (its :focus-visible look).
- **3.3.1 (2026-11-02):** a skinned rack shows all the shelves its height holds, the empty ones too (a real unit).
- **3.3.0 (2026-11-02):** `useBoxFlight(root, openId, { shelves })`: the box flight for any shop (the Game Shop's,
  now shared): opening, the box slides to the open case growing to its size, then the store page appears around it;
  closing, it goes back to its place. The Video Club uses it too (its Video Club look; Classic opens as before).
- **3.2.1 (2026-11-02):** `flyCopy` slides and grows the box straight to its place (0.5 s, no lift; `options.ms`,
  `options.keepMs`: the copy stays over its place while what replaces it fades in). A store page can wait for its box:
  `glu-sd-waiting` (hidden, still), then `glu-sd-arrived` (fades in around it).
- **3.2.0 (2026-11-02):** `fly.ts`: `flyCopy(host, source, from, to, hide)` flies a copy of a box between two places
  (a box taken off the shelf into the open case and back; nothing with reduced motion), `settledRect()` measures a
  place without an opening animation's slide. A box carries `data-item-id`. Skinned: the showroom's boxes are bigger
  and centred (up to 50px wide, as tall as the shelf allows); a department's unit runs to the bottom of the view and
  past it (no wall under a short department, windowed or not), its rows centred.
- **3.1.0 (2026-11-02): skinned units and shelves.** With a skin, a rack is a shelving unit: side uprights, its
  sign across the top, shelves with a top face, a front edge and a shade under them, what doesn't fit shown as spines
  at the shelf's end (with "+N" on the edge), and a base. A department is one unit seen straight on (posts at both
  sides, flat shelves). Boxes no longer turn on their own: one point of view, a side face on the right and a contact
  shadow; a hovered or selected box lifts, its shadow dropping away. `classic` is unchanged.
- **3.0.0 (2026-11-02): skins.** The look of a shop as data (`skins.ts`): named values (wall, light, floor, units,
  shelves, signs, colours) that `skinStyle(skin)` turns into `--skin-*` variables and `skinClass(skin)` marks, both
  bound on the widget's `gem-library-surface` element. Every shared style reads `var(--skin-…, <the classic value>)`.
  Built in: `classic` (as before), `late-show` (the Video Club's), `software-aisle` (the Game Shop's). A skinned
  showroom has a floor the racks stand on (it bleeds over the scroller's padding: `--glu-bleed-x` / `--glu-bleed-b`)
  and lit signs. `normalizeSkin()` checks a shared skin (later: skins people make): known names only, plain CSS values
  (colours, lengths, gradients), no url() or anything that could load or escape. Major: the rack's sign and edges
  look different when skinned; nothing changes with `classic`.
- **2.10.0 (2026-11-02):** the store page of a plain box takes its colours from the box's icon (`artwork.icon`), not
  the title's pair.
- **2.9.0 (2026-11-02):** `artwork.icon` ({ src, width, height }): a plain box (placeholder) shows the program's
  icon in its middle, at most twice its own size (the Game Shop's games with no cover).
- **2.8.0 (2026-11-01):** `rowsFor(shelf, maxRows)`: a widget's own rack rows get the rows the rack's height holds
  (3 to 10), so the Video Club's racks fill a tall widget too, with no row cut off; measured from the tallest row.
- **2.7.1 (2026-11-01):** the windowed department drew its rows a viewport above where they belonged (an empty
  screen once the scroll stopped). The rows in view now come from where the rows sit on screen against the visible
  part of their scroller, read on every scroll frame; no scroller to find or offset to measure.
- **2.7.0 (2026-11-01):** a big department (more than 8 rows, no sets) draws only the rows in view: "All games" with 800 boxes no longer draws them all at once.
- **2.6.0 (2026-11-01):** a rack on the floor shows as many rows as its height holds, 3 to 10: a tall widget fills
  its racks instead of showing three rows and "+N more". Measured from the drawn rack; the Video Club's own rows
  (rowsFor) are unchanged.
- **2.5.1 (2026-11-01):** `StoreDetail` no longer flashes the title's colours before the art's: each art's colours are
  kept once read, the title's are used only if the art isn't read within 220 ms, and the page eases between them.
- **2.5.0 (2026-11-01):** the Video Club moves onto `StoreDetail`, `LibraryMenu` and `glu-picker`. Added for it:
  `glu-toggle.disabled` and the shorter panel in narrow widgets.
- **2.4.0 (2026-11-01):**
  - `LibraryMenu` and `glu-picker`.
  - The floor's jump list is gone (it doubled the Video Club's "Genres"); `jumpTo` is on the floor's ref.
- **2.3.0 (2026-11-01):**
  - `LibraryFloor` gets the jump list, in the Video Club and the Game Shop alike.
  - Fix: the floor's heading had lost its style in the 2.0.0 split (the CSS said `glu-floor-floor-intro`, the page
    `glu-floor-intro`). It's centred again, with the Video Club's type, as before the split.
- **2.2.0 (2026-11-01):** `StoreDetail`, the shared store page (classes `glu-sd-*`, in `library-ui.css`). Nothing
  else changed: the Video Club looks the same.
- **2.1.0 (2026-10-31):** for the Game Shop.
  - `variant="bigbox"`: a 90s PC game box (matte cardboard, square corners, a deep side; `--glu-box-side` colours the side). Without art it's plain cardboard: the widget prints the title through `marks`.
  - `caption` on `LibraryCase`, `MediaShelf` and `LibraryFloor`: the line under a box's title (the Game Shop shows its stores). Without it, the year, as before.
- **2.0.0 (2026-10-31):** the split.
  - Movie fields and helpers, the seasons, the movie detail page and its styles went back to the Video Club.
  - The Video Club's showroom became `LibraryFloor`. Its classes were renamed `media-store-*` → `glu-floor-*`.
  - Boxes got a `variant` and slots.
  - The Video Club looks and behaves as before.
- **1.0.0:** the Video Club's shelves, cases and detail page, first shared.
