# GEM Game Shop (game-library)

Every PC game on this computer in one shop: Steam, Epic, GOG and the games you add. Each game gets one big box, with a sticker for each store it's in, and starts in one click. The plan is `claude/plan-2026-10-31-game-library.md` in the project; the shell side is `PhotinoVue1/GAME-LIBRARY-SHELL-ADDITIONS.md`.

## What's new in 0.23.0 (2026-11-02)

- Minecraft's icon on the modpacks' boxes (a badge in the corner): taken from Minecraft's own program on this
  computer: the Minecraft Launcher found among the games, else its Store app (`MINECRAFT_LAUNCHER_APP`; GEM Shell makes
  its icon only once the installed programs were allowed, so never a new question). Nothing of Minecraft's is shipped
  with the widget; without the Launcher, no badge.

## What's new in 0.22.0 (2026-11-02)

- Labels on the department shelves (library-ui 3.6.0, `shelf-labels.ts`): under each box, how long you've played it
  ("37 h played"), else what players or critics think ("94% liked", "Metacritic 88", "IGDB 86"); the shelf's range at
  its left end ("A – D" sorted by title, the years sorted by year); a handwritten staff-pick card on the best rated
  games of a department ("Staff pick! / 94% of players loved it", "… / 140 h and counting").
- Pictures in skins (library-ui 3.7.0): the editor's Pictures section (a PNG or JPEG, tiled on the wall, the floor or
  the back panel in one click, or `picture(name)` in any paint); they're saved in the `.gemskin` file. The example
  `skins/arcade-night.gemskin` now has a cosmic arcade carpet (drawn for it, 256 px, a seamless tile).

## What's new in 0.21.1 (2026-11-02)

- Fixed "GEM Game Shop: part of its state can't be kept, so it will start without it": the pictures' bookkeeping
  (`game-library.art-state`: Maps, Sets, timers) is now a resource cell (`dispose`), which GEM Shell never copies when
  it puts the widget away. After that, the bookkeeping is rebuilt from the remembered pictures (`game-library-art`),
  icons' sizes included.

## What's new in 0.21.0 (2026-11-02)

- Skins of your own (library-ui 3.5.0), like Winamp skins: ⚙ ▸ Display ▸ Store lists the looks (Software aisle first)
  and yours. **Duplicate** any look and change it in the editor beside the shelves (the shop shows it as you go):
  the wall, the units, the shelves, the floor, the signs and the colours. **Export…** saves it as a `.gemskin` file to
  share; **Load a skin…** adds one (only colours, gradients and sizes are kept: a skin can't load anything). Kept in
  `configWrite('game-library-skins')` with the look chosen, for every Game Shop (it was on GEM Shell's settings page:
  the one chosen there is kept until you pick another). New permission: **Write**, only for the file you pick in the
  save dialog.
- An example to load: `skins/arcade-night.gemskin` (a midnight arcade: cosmic carpet, chrome shelves, magenta neon).
- Fixed: a skin's Accent and Second accent now reach the Game Shop (its own teal and magenta were fixed in its CSS).

## What's new in 0.20.0 (2026-11-02)

- The pictures show at once after a restart: which picture goes with which box is remembered in its own document
  (`configWrite('game-library-art')`, `art-memory.ts`: each picture's GEM Shell address, its size and a short hash of
  its source, never the source itself; at most 5000, the newest). GEM Shell already kept the pictures themselves; only
  this link was lost, so every box asked again. Each remembered picture is loaded quietly in the background once it's
  asked for; one GEM Shell's cache let go (or that the user cleared) is made again. A picture whose source changed is
  made again too. IGDB's search covers are not remembered.

## What's new in 0.19.0 (2026-11-02)

- The arrow keys move along the shelves: the box (or, in the showroom, the rack) you're on is pulled out, Enter
  opens it. Four commands of GEM Shell's key mapper ("Previous box", "Next box", "Box above", "Box below": Left,
  Right, Up, Down by default; Settings ▸ Keyboard shortcuts to change them), library-ui's `moveBoxFocus`.

## What's new in 0.18.1 (2026-11-02)

- Fixed "its state could not be saved for the next start (… would pass 8,388,608 bytes)": the scan, the online
  details, the pictures' addresses and the look-up's progress are kept in memory only (`transient` lifecycle cells),
  never in what GEM Shell saves when it puts the widget away. The details were on disk already (the widget's own
  document); after a restart the shop scans again (it sees what was installed meanwhile). Also fixed with it: a
  look-up still running when GEM Shell closed was saved as running and kept any new one from starting.

## What's new in 0.18.0 (2026-11-02)

- The Game Shop's logo: a floppy disk with GEM on its label and GAME SHOP in pixel letters (`ShopLogo.vue`, all
  drawn in SVG, the 5×7 letters too: no font to ship), in the top bar and on the showroom's sign.
- The box flight is library-ui's now (`useBoxFlight`, 3.3.0): the same for the Video Club.

## What's new in 0.17.2 (2026-11-02)

- Opening a box: it slides from the shelf to the middle, growing to its size in the open case (half a second), then
  the page appears around it.
- "Stocking shelves…" (with how many pictures are left) while the boxes' pictures are being made.

## What's new in 0.17.1 (2026-11-02)

- Opening a box takes it off the shelf: it lifts, then flies into the open case; closing puts it back in its place.
- Back from another hub, the shelves fill at once: the pictures made this session are kept (the lifecycle), and new
  ones reach the boxes in batches instead of one re-render each (six made at a time, was four).
- Bigger boxes on the showroom's racks, centred; a short department's unit runs to the bottom (library-ui 3.2.0).

## What's new in 0.17.0 (2026-11-02)

- A new store look, "Software aisle" (library-ui 3.0.0 skins): a warm grey slatwall with light pooling from above,
  black metal racks with lit white signs, the racks standing on a checkered tile floor, teal and magenta on the signs
  only. GEM Shell's settings ▸ Game Shop ▸ Look: Software aisle (the default), Late show (the Video Club's) or
  Classic (as before). The racks themselves (uprights, thick shelves, label strips) come next.

## What's new in 0.16.0 (2026-11-02)

- Battle.net games start in one click: GEM Shell starts Battle.net with the game's launch code
  (`Battle.net.exe --exec="launch Fen"`, GEM Shell's launcher command, part G), as Battle.net's own Play button
  does. The codes by the game's name are in `stores/battlenet.ts` (Overwatch, WoW, Diablo, StarCraft, Hearthstone,
  Call of Duty...). The game's program comes next, then Battle.net opened on the game's page. Asked once: "open
  Battle.net links".
- A box whose cover links all failed shows its program's icon too, and the open game's colours come from its icon
  (library-ui 2.10.0).

## What's new in 0.15.0 (2026-11-02)

- A game with no cover anywhere (a game you added, many EA, Ubisoft, Battle.net, Rockstar and Xbox games) shows its
  own icon on its box: the program's (its .exe or shortcut) or the Store app's, made by GEM Shell with its
  transparency (library-ui 2.9.0 draws it). An icon Windows only has small is drawn at most twice its size.

## What's new in 0.14.0 (2026-11-02)

- Looking up covers and details goes on when you leave the Game Shop: it runs as a background job, with a card in
  GEM Shell's operations tray ("Game details · 12 of 340", the time left). Stop there, or beside the count in the Game
  Shop, ends it after the games it's on; the rest is looked up at the next start.
- Back in the Game Shop, the run in progress shows where it is (no new run starts over it).

## What's new in 0.13.1 (2026-11-01)

- The pictures stay between starts: GEM Shell now keeps the pictures it makes from Steam's own files instead of making
  them again at each start (each start added a copy to the cache's index: 3,505 entries for 940 pictures). The cache
  itself is small: 81 MB for about 900 games (covers 40 to 100 KB, already JPEG at the size drawn), well within the
  usual 500 MB room, so the Game Shop asks for no more.
- The details were already kept (each game about once a month). What still runs at a start is the games never looked
  up yet (the owned ones, hundreds with Epic's library, come after the installed ones): it goes on where it stopped.

## What's new in 0.13.0 (2026-11-01)

- **Your Epic library:** every Epic game you own, from the launcher's own files (`Data\Catalog\catcache.bin`, next to its manifests). No key and no internet needed.
  - The ones not installed are shrink-wrapped on the shelves, with Install (the Epic launcher's install window).
  - Add-ons, DLC, Unreal Engine and Mac-only games are left out.
  - "Show the games you own but haven't installed" covers Epic and Steam now.
- **Epic's own box art, banner and logo** for every Epic game, installed or not, and its description until Steam or IGDB gives a better one.
- **The online look-up does the installed games first;** the hundreds not installed come after. The first run takes a while: watch the counter in the top bar.
- **Taller racks** (library-ui 2.6.0): a rack on the floor shows as many rows as the widget's height holds, up to 10, instead of three.

## What's new in 0.12.0 (2026-11-01)

- **CurseForge's Minecraft modpacks** (`stores/curseforge.ts`), each instance its own box:
  - its name, Minecraft's version and the mod loader (on the back of the box);
  - its last play and time played, from CurseForge's own counts;
  - its picture (yours, or the modpack's), else its newest screenshot;
  - a CF sticker, a "Minecraft modpacks" rack and a CurseForge store rack.
  - **Play opens CurseForge** ("Starts CurseForge"); press Play on the modpack there. CurseForge has no way to start one instance from outside.
  - Modpacks aren't looked up online (their names are yours). "Find its details…" still works.
  - Each box says what it is (`kind: 'minecraft.modpack'`, with its folder), so a modpack manager widget can add its own menu items to it later.
- **No store taken for C:\ any more.** Each one's folder is found by itself, on any drive:
  - **Steam:** where Windows' installed programs say Steam is, then `%PROGRAMFILES(X86)%`, then `%PROGRAMFILES%`.
  - **Epic:** `%PROGRAMDATA%`.
  - **GOG:** `%PROGRAMFILES(X86)%\GOG Galaxy\Games` and `%SYSTEMDRIVE%\GOG Games`, plus every GOG game Windows lists, wherever it is.
  - **Xbox:** `%SYSTEMDRIVE%\XboxGames`, plus the Store apps' folders on every drive.
  - **CurseForge:** the modding folder CurseForge's own settings name (`%APPDATA%\CurseForge\storage.json`), else `%USERPROFILE%\curseforge\minecraft`.
  - The folder fields in the settings are for whatever is still missed. This uses GEM Shell's new `sdk.expandPath`; older shells fall back to the usual C:\ places.

## What's new in 0.11.2 (2026-11-01)

- **Xbox games on every drive:** GEM Shell now lists the Store apps too (part B, the rest). An Xbox app game lives in `<folder>\<game>\Content`, so every such folder is scanned, whatever its drive or name; you no longer need to add them under "Xbox games folders".
- Their names come from Windows' list when the game's own file only names a resource it can't read.

## What's new in 0.11.1 (2026-11-01)

**Find its details…** (`LinkGame.vue`): link a box by hand to the right IGDB game, when the guesses miss (a SNES decomp you added, a title spelled its own way).
- **Where:** right-click a box ▸ Find its details…, or 🔎 Find details on an opened box.
- **How:** a window over the shop, already searched for the box's title. Change the words or the platform (Any, PC, Super Nintendo, N64…), then click the right game.
- **From then on**, that game wins over the guesses: its name goes on the box, and its description, genres, year, screenshots, cover first, and rating.
  - A box linked by hand is never searched on Steam by its title. A game you own on Steam keeps its Steam data where IGDB has none.
  - The link is kept in the library document (`links`). Your own G / ¶ edits still win over it.
  - "Back to automatic" takes the link off.
- It needs the Twitch app for IGDB.

## What's new in 0.11.0 (2026-11-01)

**IGDB** (Twitch's game database, `online/igdb.ts`), with your own free Twitch app (GEM Shell part C2):
- **Set it up:** on the Game Shop's page in GEM Shell's settings, "Twitch app for IGDB": its Client ID and a Client secret (dev.twitch.tv/console ▸ Register Your Application). GEM Shell checks them with Twitch before saving, gets the tokens itself, and the Game Shop never sees either.
- **What it adds:**
  - a rating for every game IGDB knows (critics and players, out of 100), shown when there's no Metacritic score and no Steam reviews, and used by "best rated";
  - for the games Steam doesn't sell (Epic, GOG, Xbox, yours): the description, genres, year, screenshots and cover;
  - its cover and artwork, after the other pictures.
- **How a game is found:** a Steam game by its app id (IGDB's store links), the others by their exact title (PC). Asked again after a month (a week when not found), like Steam.
- `searchIgdb` (any platform) is ready for the manual link that comes next (a SNES game added by hand, say).

## What's new in 0.10.1 (2026-11-01)

- **Install works:** the button wasn't connected, and Steam's install links weren't declared (`steam://install/` is now one of the Steam app link's prefixes).
- **The time box,** under the rating on an opened game: the hours played, and a line from the clerk about them (`playtime-quips.ts`).
  - Milestones: under an hour, then 1, 5, 10, 40, 100, 200, 500, 1000, 2000 and 4000 hours, at least 2 lines each.
  - The line is picked at random when a milestone is reached, then kept until the next one (the library document's `quips`), so players can compare theirs.
  - Games can have their own lines (`QUIPS.games['steam:<app id>']` or `'title:<titleKey>'`), either replacing the default lines for a milestone (`mode: 'replace'`, Portal 2 at 10 h) or joining them (`'add'`, 7 Days to Die).
- **No colour flicker on opening a game** (library-ui 2.5.1): the page waits up to 220 ms for the cover's colours instead of showing the title's colours first, remembers them, and eases from one game's to the next.
- **A game's test builds are left out,** sold apart on Steam like tools: "PTS", "Public Test", "Test Server", "Playtest", "Beta Server" ("Tom Clancy's The Division PTS").

## What's new in 0.10.0 (2026-11-01)

**The Steam games you own but haven't installed, and your play time** (Steam's Web API, `online/steam-owned.ts`):
- **Your own Steam Web API key** goes in a new field on the Game Shop's page in GEM Shell's settings, "Steam Web API key". Get it at steamcommunity.com/dev/apikey (signed in; any domain name will do).
  - GEM Shell sends it to api.steampowered.com only, as the `x-webapi-key` header (never in the address); the widget never sees it.
  - The account is the one last signed in to Steam on this computer (`Steam\config\loginusers.vdf`; else the only `userdata` folder).
  - Your profile's game details must be public, or Steam lists nothing (⚙ says so).
- **Not installed:** shrink-wrapped boxes (the plastic, a "Not installed" sticker), on their racks and on their own "Not installed" rack.
  - Their art is Steam's, from this computer (Steam keeps it for the games you own).
  - Opened, they show **Install**: Steam's install window.
  - "Show the Steam games you haven't installed" (on by default) hides them.
- **Play time:** every Steam game's, from every computer ("22 h played", on the back of the box). The last play is Steam's latest too.
- **"Continue playing"** (it was "Recently played"): the installed games, last played first.
- The list is read again every 6 hours, on "Look again", and when the key changes. Forgetting the key takes the games not installed off the shelves.
- The details of the new games are looked up as for the others (Steam's store, about 4 s a game, the first time only).

## What's new in 0.9.0 (2026-11-01)

The Game Shop's page in GEM Shell's settings works with no Game Shop open (GEM Shell part E: `GAME-LIBRARY-SHELL-ADDITIONS.md`, `docs/claude/shell-changes-2026-11-01-settings-closed.md`):
- **"Look again" and "Look up"** are asked for when no Game Shop is open, and run when one opens. With one open, they run at once, as before. Either way, the page says what they did ("Found 12 games…", "Looking up 24 games again…").
- **The SteamGridDB key** is one field, "SteamGridDB API key", with Enter it / Replace / Forget. The key box is GEM Shell's own, over the settings page.
- **A Game Shop that opens later catches up:**
  - key forgotten: the covers, banners and logos SteamGridDB found go (Steam's stay);
  - key set: the games asked without a key are looked up again.
  - The details remember the key's state at the last look (`sgdbKey`).
- The ⚙ menu and the right-click "Connect SteamGridDB…" still work as before.
- **Not a game below 25 MB (0.8.2):** a Rockstar, EA or Blizzard entry under 25 MB is a tool (it was 150 MB, which a small classic like Plants vs. Zombies could fall under). Steam, Epic, GOG, Xbox and your own games are never checked.

## What's new in 0.8.1 (2026-11-01)

- **The publishers' tools stay off the shelves** (Guillaume saw "Rockstar Games SDK" next to Red Dead Redemption 2).
  None of these launchers keeps a list of its games the widget can read, so two checks decide (`looksLikeGame`):
  - **the name:** launcher, SDK, engine, runtime, redistributable, anti-cheat, service, updater, installer, tools,
    editor, server, overlay, driver…;
  - **the size,** when the entry gives it: under 25 MB is a tool (0.8.2: it was 150 MB, which a small classic
    like Plants vs. Zombies could fall under; the name check is what catches the SDKs).
  - Only these four stores' entries are checked. Steam, Epic, GOG, Xbox and your own games never are.
  - Ubisoft's "Uplay Install <id>" entries are always games, so only the name check applies to them.

## What's new in 0.8.0 (2026-11-01)

Phase 2: the stores that only Windows knows about. GEM Shell now lists the installed programs and starts Store apps
(`sdk.installedApps()`, part B of the shell additions). The Game Shop declares `Apps`, and GEM Shell asks once
before showing it the list.

- **From Windows' installed programs** (`stores/launchers.ts`):
  - **Rockstar Games:** publisher "Rockstar Games" (not the launcher, not Social Club). It starts from its program,
    which opens the Rockstar launcher.
  - **EA app:** publisher "Electronic Arts" (not the EA app itself). It starts from its program.
  - **Ubisoft Connect:** the entry "Uplay Install <id>". It starts with `uplay://launch/<id>/0`, a newly declared app
    link, asked once.
  - **Battle.net:** publisher "Blizzard Entertainment". It starts from its program.
  - **An entry inside a Steam or Epic game's folder** is that store's copy (Rockstar registers Steam's Red Dead
    Redemption 2 too), so it's left out.
  - Starting from a program uses the Exec permission, asked once per program, as for GOG games.
- **Xbox** (`stores/xbox.ts`):
  - Every folder of `C:\XboxGames` (or the Xbox games folders in the settings) that has a `MicrosoftGame.config`.
  - The config gives the package and the game's program. The Game Shop works out the Store app id from them
    (Windows' publisher hash, checked against Microsoft's `8wekyb3d8bbwe`), and GEM Shell starts it. GEM Shell asks
    once per game, naming it as Windows does.
  - The package's logo is the box's logo when there's no other art.
- **Stickers:** R★, EA, UBI, B.NET, XBOX.
- **Settings:** a toggle for each store, and the Xbox games folders.
- **If the list of programs isn't allowed,** those four stores are skipped, and ⚙ ▸ Library says why.

## What's new in 0.7.1 (2026-11-01)

- **The Game Shop is global again** (Guillaume: it scans mostly fixed places, unlike the Video Club). The game folders
  are back on GEM Shell's settings page, one list for every Game Shop.
  - ⚙ ▸ Library shows that list and says where to change it.
  - A folder added in one Game Shop with 0.7.0 is still searched and shows as "this Game Shop only", with × to drop
    it. Add it on the settings page to keep it for every Game Shop.
  - Per-Game Shop folders may come back with emulation (ROM folders).

## What's new in 0.7.0 (2026-11-01)

- **The top bar is the Video Club's:**
  - **▦ Genres:** in the shop it opens a rack, as a click on it does; in Shelves it scrolls to the shelf. Genres
    come first, then the racks at the front, then the stores.
  - **⇅ Sort:** Title A–Z, Last played, Newest first, Best rated (Metacritic, else the share of Steam's players who
    liked it), Largest first. It orders the boxes on every rack and shelf; Recently played keeps its own order.
    It's kept with the view, as the Video Club's.
  - **⚙**, library-ui's shared `LibraryMenu`, with two tabs:
    - **Display:** the look as big buttons that say what each one does (Game shop / Shelves).
    - **Library:** this Game Shop's game folders (add, remove), Add a game, Look for games again, what was found,
      and Online details (where they're at, SteamGridDB, Look up details again).
  - The ▤ ☰ ↻ ＋ buttons are gone from the top bar: they're in ⚙. F5 and the right-click menu still look again.
- **Each Game Shop has its own game folders** (undone in 0.7.1), as each Video Club has its media folders. They're kept with the
  Game Shop (its config data), so a hub can have one Game Shop for your Steam games and another for a folder of
  old games.
  - **Carried over once:** a Game Shop with no folders of its own starts with the list in GEM Shell's settings.
    That field is now called "Game folders (before 0.7.0)" and can go in a later version.
  - The stores' settings (Steam, Epic, GOG on or off, their folders) and the online toggle stay on GEM Shell's
    settings page, one set for every Game Shop.
- **Shelves** shows Recently played, then a shelf per genre, then a shelf per store.
- **Steam reviews show (0.6.2 fix).** Steam's `appreviews?json=1` now sends you to the store's home page, so every
  game came back with nothing. The Game Shop now reads `appreviewhistogram`, which the store's own pages use (JSON,
  no key, all languages). It adds up the monthly totals and says them in Steam's words, with Steam's thresholds
  (`reviewWords`). 7 Days to Die: 86% of about 295,000, "Very Positive", as on its store page. Games without reviews
  yet get them on the next look-up, with no need to ask.

## What's new in 0.6.1 (2026-11-01)

- **Fix: GEM Shell's errors are read as their status.** `networkFetch` rejects any answer that isn't 2xx
  ("HTTP 404: Not Found") instead of returning it. Until now:
  - a game SteamGridDB doesn't know (404) was retried for about 13 s, then given up;
  - a refused key (401) and "slow down" (429) weren't recognised either.

  Now a 404 means "not found" at once, a refused key stops SteamGridDB, and a 429 is waited out.
- **Steam reviews, to see why a game shows none:**
  - the rating box says "Reviews not looked up yet" or "No Steam reviews";
  - the console gets a `[game-library] Steam gave no review summary for app …` line with what Steam answered, or
    `… reviews of … were unavailable: <why>`.
- **One Network question instead of five** comes from GEM Shell (`consent/service.ts`, part F of the shell
  additions).

## What's new in 0.6.0 (2026-11-01)

- **What Steam's players say:** the game's Steam review summary, in all languages, looked up with its details and
  again every week (`appreviews`, no key).
  - **Without a Metacritic score,** the rating box shows Steam's verdict instead: the stars, the share of positive
    reviews (92%), Steam's words in Steam's colours ("Overwhelmingly Positive" blue, "Mixed" sand, "Negative" red)
    and how many reviews. A click opens the reviews on Steam's store.
  - **With a Metacritic score,** Steam's words go under it ("Steam: Very Positive").
- **Jump to a genre:** a list at the top right of the shop floor (library-ui 2.3.0) centres the rack you choose and
  lights it. The Video Club gets it too.
- **The floor's heading** is centred again (a library-ui fix).

## What's new in 0.5.0 (2026-11-01)

- **An opened game is a store page, like the Video Club's movie store.** It's built on library-ui 2.2.0's shared
  `StoreDetail`.
  - **The box** is as big as the widget allows, with its colours taken from its art.
  - **A click turns it over.** The back shows the banner, up to four screenshots pinned on it, and the copy box:
    genres, title, description, then year · makers · last played.
  - **Screenshots:** click one to see it big. ← → go through them all; Esc or a click puts it back.
  - **Left column:** Play (with "Starts Steam" under it), Show folder, Steam page, and Remove for a game you added.
  - **Right column:** the rating box, the Video Club's, with Metacritic's score out of 100. A click opens the
    game's Metacritic page so you can read the reviews; GEM Shell asks first, as for any web link. Without a
    score, the box opens the game's reviews on Steam's store. Under it are the stores the game is in, each with its
    own ▶, and **Use for Play** when there are several.
- **Edit the genres and the description:** turn the box over, then press **G** or **¶**. Your edits are kept in
  `configWrite('game-library')` (`edits`) and win over what Steam says. **Use Steam's** puts Steam's back.
- **The settings buttons answer at once:**
  - **Look up details again** says how many games and about how long, then runs in the background. The line under
    the top bar counts them ("3 of 24").
  - **Forget** removes the key and the pictures SteamGridDB found. Steam's own pictures stay, since they need no
    key.
  - **Enter your key…** explains what to do when the Game Shop isn't on screen: GEM Shell's key box only opens over
    a widget you can see.

## What's new in 0.4.0 (2026-11-01)

Online details (Phase 3). The Game Shop now asks for the **Network** permission; GEM Shell asks you once.

- **Steam's store** (no key needed): description, genres, release year, Metacritic score, developers, publishers and
  up to 8 screenshots. A game from another store is looked up by its title on Steam's store. Only the same title
  counts, so an Epic or GOG game sold on Steam gets the same details. Requests are spaced 1.8 s apart, because Steam
  allows about 200 in 5 minutes.
- **SteamGridDB** (your free key): covers, banners and logos for games with no art on this computer (Epic, GOG and
  your own games). Connect it from Settings ▸ the Game Shop ▸ **Online details ▸ Enter your key…**, or right-click
  the shop ▸ **Connect SteamGridDB…**. GEM Shell keeps the key as this widget's secret and only ever sends it to
  `www.steamgriddb.com`; the widget never sees it. Only still PNG and JPEG images are requested, since GEM Shell's
  images don't take WebP.
- **Which picture wins:** the file on this computer, then SteamGridDB, then Steam's servers (the store's library
  art). If one fails, the next is tried.
- **Kept, not asked every time:** the details are saved in `configWrite('game-library-details')`. A game that was
  found is looked up again after 30 days, and one that wasn't after a week. **Look up details again** (in
  Settings, or by right-clicking the shop) asks again now. The look-up runs in the background after a scan, two
  games at a time, and the games with nothing yet go first.
- **The shop floor gets genre racks:** once genres are known, the aisle has one rack per genre (the biggest first,
  then "Other games"), and the store racks move to the head of the aisle. The Shelves layout stays one shelf per
  store, for people who like it plain.
- **The back of the box** (an opened game):
  - the game's logo instead of its title;
  - its year, genres and makers;
  - its Metacritic score (green from 75, red under 50);
  - what it's about;
  - a strip of screenshots: click one to see it big, then Esc or a click to put it back.
- **Search** also finds a game by its developer.
- **If something goes wrong:** when the Network permission is refused or SteamGridDB refuses the key, a line under
  the top bar says so and offers **Try again**. If the key is refused, SteamGridDB stops for that run but Steam's
  details go on.
- **Settings:** a new group, **Online details**:
  - **Look up details online** (on by default);
  - **Enter your key…**;
  - **Forget**;
  - **Look up**.

  An action runs in every open Game Shop, and a key belongs to one Game Shop, so a second Game Shop asks for its
  own key.

## What's new in 0.3.0 (2026-11-01)

- **Right-click a box:**
  - Play, Open the box;
  - **Play uses ▸** (its stores, the one Play uses ticked; only for a game in several stores);
  - Show its folder;
  - Steam store page (Steam games);
  - Remove from the library (games you added).
- **Right-click the shop:** Add a game…, Look for games again.
- **The menus are declared** (`menuContexts`, `menuStates`, `menus` in `entry.ts`): you can rearrange them in
  Settings ▸ Context Menu. A choice counts as your click, so Play and the store page work from the menu.
- **The launch:** the box lifts and glows, and a disc rises out of it while the store starts the game; in an
  opened game it slides out of the box's side. It starts with the click and never delays the launch (about a
  second). Reduced motion: none.

## What's new in 0.2.1 (2026-11-01)

- **Steam and Epic games start.** GEM Shell now opens an installed app's links for widgets (`AppLinks`). The Game Shop
  declares Steam's (`steam://rungameid/`, `steam://store/`) and Epic's (`com.epicgames.launcher://apps/`). The first
  time you play a Steam game, GEM Shell asks once whether the Game Shop may open Steam links; the same for Epic.
  You can take it back in Settings ▸ Security ▸ Permissions.

## What's new in 0.2.0 (2026-10-31)

This replaces the 0.1.0 stub, which had mock data and the old messaging menus.

- **Finding games** (`scan.ts`, `stores/`) reads the stores' own files, with no network:
  - **Steam:** every library in `libraryfolders.vdf` and each game's `appmanifest_*.acf` (name, folder, whether it's fully installed, last played). Steam's tools (redistributables, Proton, runtimes) are left out.
  - **Epic:** `ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item`. DLC, incomplete installs and non-games are left out.
  - **GOG:** `goggame-<id>.info` in GOG Galaxy's usual folder and in your game folders (two levels deep).
  - **Your games:** add an exe, a `.lnk` or a `.url` shortcut with **＋**.
  - **The same game in several stores** gets one box and one sticker per store. Steam comes first unless you choose **Use for Play** on the game.
- **Box art:** Steam keeps art for every game you own in `appcache\librarycache`. The shop uses the 600×900 box (or the capsule) and shows the hero banner behind an opened game. Games without art get a plain cardboard box with the title printed on it. Online art (SteamGridDB) comes later.
- **Layouts:**
  - **Game shop** (▤): the shared store floor. "Recently played" and "All games" sit at the head of the aisle, then one rack per store.
  - **Shelves** (☰): the classic layout, one shelf per store.
- **Playing** (`launch.ts`): ▶ on a box (on hover or keyboard focus), **Play** in an opened game, or Ctrl+Enter.
  - **GOG games and your games** start from their own program. GEM Shell asks for the Exec permission once.
  - **Steam and Epic games** start through GEM Shell's **app links** (`steam://`, `com.epicgames.launcher://`; 0.2.1).
  - **Epic games that don't need a sign-in** fall back to their exe. None of Guillaume's do.
- **Recently played:** Steam's own dates, plus the games you start from here (other stores don't record when you played).
- **Settings** (GEM Shell's Settings, the Game Shop's page):
  - the stores on or off;
  - Steam's folder and Epic's manifests folder, if they're not in the usual place;
  - your game folders;
  - **Look again**.
- **Keys:** Ctrl+F to find a game, Ctrl+Enter to play the open game, F5 to look again.

## Files

| File | What it does |
|---|---|
| `stores/launchers.ts`, `stores/xbox.ts` | Rockstar, EA, Ubisoft, Battle.net from Windows' installed programs; Xbox games from their MicrosoftGame.config (0.8.0, tested). |
| `stores/vdf.ts`, `steam.ts`, `epic.ts`, `gog.ts` | Read each store's files (pure, tested on trimmed copies of real files in `tests/fixtures`). |
| `games.ts` | The game model (`GameItem`: the library's item plus its releases), merging stores into one box per game, Recently played. |
| `scan.ts` | Runs every store through a small file port (`filePortFor(sdk)` is the real one; the tests use an in-memory one). |
| `launch.ts` | Starts a release, trying its ways to start in order; errors in plain words. |
| `art-memory.ts` | The pictures remembered between starts (`configWrite('game-library-art')`): checked, trimmed, pure. |
| `library-store.ts` | What the user keeps: their games, last played, preferred store (`configWrite('game-library')`). |
| `online/paced.ts` | Requests to one service, spaced out and retried; refusals that stop the run (`OnlineFatalError`). |
| `online/steam-store.ts` | Steam's store: appdetails, storesearch, appreviews (no key). |
| `online/sgdb.ts` | SteamGridDB: boxes, heroes and logos, and search by title (the user's key, as a GEM Shell secret). |
| `online/details.ts` | What's due, the look-up run, the saved details (`configWrite('game-library-details')`). |
| `sort.ts` | The ⇅ orders (tested). |
| `useGameArt.ts` | Turns art files and https images into images (`mediaImageCreate`, cache room), with fallbacks. |
| `Widget.vue`, `GameMarks.vue`, `GameDetail.vue`, `game-library.css` | The shop, what sits on a box, an opened game (on library-ui's `StoreDetail`), the look (`gl-*`). |

## Next

- **Phase 2, still to do:** Store apps in GEM Shell's list (needs Windows' package API), app icons, Battle.net's own
  links (`battlenet://<game>`), Xbox games folders found from each drive's `.GamingRoot`.
- **Phase 3, still to do:** IGDB (games that aren't on Steam) once GEM Shell supports client-credentials secrets
  (part C2 of the shell additions); details in your own language.
- **Phase 4:** play time, and the launcher closing by itself when the game ends (on ice).
