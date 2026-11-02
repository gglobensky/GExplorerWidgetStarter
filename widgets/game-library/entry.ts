// widgets/game-library/entry.ts
//
// GEM Game Shop (0.19.0, 2026-11-02): every PC game on this computer in one shop (plan:
// claude/plan-2026-10-31-game-library.md). Rewritten from the 0.1.0 stub (mock data, old messaging menus).
// Steam and Epic games start through GEM Shell's app links (AppLinks, 2026-11-01:
// PhotinoVue1/GAME-LIBRARY-SHELL-ADDITIONS.md part A): the user is asked once per store.
// Online details (0.4.0, Network): Steam's store (descriptions, genres, screenshots; no key) and SteamGridDB
// (covers, banners, logos; the user's own key, kept by GEM Shell as this widget's secret).
// 0.10.0: the Steam games the user owns and hasn't installed (shrink-wrapped, Install), and every Steam game's play
// time, from Steam's Web API with the user's own key (another secret, for api.steampowered.com).
import Widget from './Widget.vue'
import LookUpCard from './LookUpCard.vue'
import { LOOKUP_JOB } from './online/lookup-job'

export default {
  api: '1.0',
  id: 'game-library',
  version: '0.23.0',
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  displayName: 'GEM Game Shop',
  description: 'Every PC game on this computer (Steam, Epic, GOG, Rockstar, EA, Ubisoft, Battle.net, Xbox and the ones you add) in one 90s game shop, started in one click.',
  category: 'games',
  icon: 'gamepad',
  contexts: {
    grid: { minSize: { cols: 3, rows: 5 }, defaultSize: { cols: 8, rows: 6 } },
    // scroll 'self': the shop fills the row it's given and scrolls its own shelves (as the Video Club does)
    sidebar: { minHeight: 260, scroll: 'self' },
  },
  defaults: { data: {}, view: { displayMode: 'shop' } },
  // 0.14.0: looking up the games' details goes on off screen (Widget.vue's lookUp): its card shows in the operations
  // tray meanwhile; Stop there ends it (what's left is looked up at the next start).
  jobs: { [LOOKUP_JOB]: { card: LookUpCard } },
  commands: [
    { id: 'find', name: 'Find a game', keys: ['Ctrl+F'], description: 'Puts the cursor in the search box to find a game by its title.' },
    { id: 'play', name: 'Play the game', keys: ['Ctrl+Enter'], description: 'Starts the open game, with the store Play uses.' },
    { id: 'rescan', name: 'Look for games again', keys: ['F5'], description: 'Looks again in Steam, Epic and your game folders for games installed or removed.' },
    // 0.19.0: moving along the shelves (library-ui boxNav.ts): the box the focus is on is pulled out; Enter opens it
    { id: 'box-left', name: 'Previous box', keys: ['Left'], description: 'Moves to the box (or the rack) on the left; the box you are on is pulled out, Enter opens it.' },
    { id: 'box-right', name: 'Next box', keys: ['Right'], description: 'Moves to the box (or the rack) on the right.' },
    { id: 'box-up', name: 'Box above', keys: ['Up'], description: 'Moves to the box on the shelf above.' },
    { id: 'box-down', name: 'Box below', keys: ['Down'], description: 'Moves to the box on the shelf below.' },
  ],
  // Right-click menus (Widget.vue: sdk.ui().contextMenu, onMenuItem). A choice counts as the user's gesture in the
  // widget, so Play, Show its folder and the store page work from the menu.
  menuContexts: [
    { id: 'game.box', label: 'Game', icon: '🎮' },
    { id: 'game.shop', label: 'Game Shop background', icon: '🕹' },
  ],
  // The situations the menu adapts to (Widget.vue says which are true when it opens; the user can change what each
  // item does in Settings ▸ Context Menu).
  menuStates: [
    { id: 'not-installed', label: 'Not installed' },
    { id: 'one-store', label: 'Found in one store only' },
    { id: 'not-steam', label: 'Not on Steam' },
    { id: 'not-yours', label: 'Not added by you' },
    { id: 'sgdb-connected', label: 'SteamGridDB connected' },
    { id: 'offline', label: 'Online details turned off' },
  ],
  menus: {
    items: [
      { id: 'play', label: 'Play', icon: '▶', contexts: ['game.box'], disableWhen: ['not-installed'] },
      { id: 'details', label: 'Open the box', icon: '▣', contexts: ['game.box'] },
      // 0.11.1: link the box to IGDB's game by hand (LinkGame.vue)
      { id: 'link', label: 'Find its details…', icon: '🔎', contexts: ['game.box'] },
      // Its entries come with each right-click: the game's stores, the one Play uses ticked
      { id: 'play-with', type: 'submenu', label: 'Play uses', icon: '⇄', contexts: ['game.box'], hideWhen: ['one-store'] },
      { id: 'box.sep1', type: 'separator', contexts: ['game.box'] },
      { id: 'folder', label: 'Show its folder', icon: '📁', contexts: ['game.box'], disableWhen: ['not-installed'] },
      { id: 'store', label: 'Steam store page', icon: '🛒', contexts: ['game.box'], hideWhen: ['not-steam'] },
      { id: 'box.sep2', type: 'separator', contexts: ['game.box'], hideWhen: ['not-yours'] },
      { id: 'remove', label: 'Remove from the library', icon: '✕', contexts: ['game.box'], hideWhen: ['not-yours'] },

      { id: 'add', label: 'Add a game…', icon: '＋', contexts: ['game.shop'] },
      { id: 'rescan', label: 'Look for games again', icon: '↻', contexts: ['game.shop'] },
      { id: 'look-up', label: 'Look up details again', icon: '⟳', contexts: ['game.shop'], disableWhen: ['offline'] },
      { id: 'sgdb', label: 'Connect SteamGridDB…', icon: '🔑', contexts: ['game.shop'], hideWhen: ['sgdb-connected', 'offline'] },
    ],
  },
  capabilities: [
    { cap: 'Read', reason: "Reads Steam's and Epic's lists of installed games, and your game folders, to put your games on the shelves." },
    { cap: 'Media', reason: "Shows the box art Steam keeps on this computer, and the covers and screenshots found online." },
    // 0.21.0: exporting a skin (Display ▸ Store ▸ Export…): only the file the user picks in GEM Shell's save dialog
    { cap: 'Write', reason: 'Saves the skins you export (a .gemskin file, to share a look) to the file you choose.' },
    { cap: 'Exec', reason: 'Starts the games you play: GOG games and the games you added start from their own program.' },
    {
      cap: 'AppLinks',
      reason: 'Starts your Steam, Epic, Ubisoft and Battle.net games through their stores\' apps, the way their own Play buttons do.',
      links: [
        // steam://install/ (0.10.1): Steam's install window, for the games owned and not installed
        { scheme: 'steam', prefixes: ['steam://rungameid/', 'steam://store/', 'steam://install/'], label: 'Steam' },
        { scheme: 'com.epicgames.launcher', prefixes: ['com.epicgames.launcher://apps/'], label: 'Epic Games' },
        { scheme: 'uplay', prefixes: ['uplay://launch/'], label: 'Ubisoft Connect' },
        // 0.16.0: Battle.net starts a game by its launch code (GEM Shell's launcher command, launch: true); its links
        // open the game's page (the last way, when the command isn't there)
        { scheme: 'battlenet', prefixes: ['battlenet://'], label: 'Battle.net', launch: true },
      ],
    },
    { cap: 'Apps', reason: "Finds the games Rockstar, the EA app, Ubisoft Connect and Battle.net installed (they list them only among Windows' installed programs), and starts Xbox games." },
    { cap: 'Network', reason: "Looks up your games' descriptions, genres and screenshots on Steam's store, covers on SteamGridDB once you give it your key, ratings and details on IGDB once you give it your Twitch app, and the Steam games you own (with their play time) once you give it your Steam Web API key." },
  ],
  settings: {
    fields: [
      { key: 'steam', type: 'toggle', label: 'Steam', default: true },
      { key: 'steamFolder', type: 'path', kind: 'folder', label: 'Steam folder', hint: "Where steam.exe is. Empty: found by itself (Windows' installed programs, then Program Files). Your other Steam libraries are found from there.", default: '', showWhen: { key: 'steam', truthy: true } },
      { key: 'epic', type: 'toggle', label: 'Epic Games', default: true },
      { key: 'epicManifests', type: 'path', kind: 'folder', label: "Epic's manifests folder", hint: 'Empty: the usual place (%PROGRAMDATA%\\Epic\\EpicGamesLauncher\\Data\\Manifests, on the system drive).', default: '', showWhen: { key: 'epic', truthy: true } },
      { key: 'gog', type: 'toggle', label: 'GOG', default: true },
      { key: 'rockstar', type: 'toggle', label: 'Rockstar Games', default: true },
      { key: 'ea', type: 'toggle', label: 'EA app', default: true },
      { key: 'ubisoft', type: 'toggle', label: 'Ubisoft Connect', default: true },
      { key: 'battlenet', type: 'toggle', label: 'Battle.net', default: true },
      { key: 'xbox', type: 'toggle', label: 'Xbox (PC Game Pass, Microsoft Store)', default: true },
      // 0.12.0: CurseForge's Minecraft modpacks, each its own box
      { key: 'curseforge', type: 'toggle', label: 'CurseForge (Minecraft modpacks)', hint: "Each instance is a box. Play opens CurseForge, where you press Play: it has no way to start one from outside.", default: true },
      { key: 'curseforgeFolder', type: 'path', kind: 'folder', label: "CurseForge's modding folder", hint: "Empty: the one CurseForge's own settings name (Settings ▸ Minecraft ▸ Modding folder), else %USERPROFILE%\\curseforge\\minecraft. It holds the Instances folder.", default: '', showWhen: { key: 'curseforge', truthy: true } },
      { key: 'xboxFolders', type: 'list', item: 'path', kind: 'folder', label: 'Xbox games folders', hint: "Empty: found by itself, on every drive (GEM Shell's list of Store apps). Add one only if a game is missing.", maxItems: 10, default: [], showWhen: { key: 'xbox', truthy: true } },
      // Every Game Shop's (0.7.1: the Game Shop is global; its ⚙ ▸ Library shows them). Per-Game Shop folders may come
      // back with emulation (ROM folders).
      { key: 'gameFolders', type: 'list', item: 'path', kind: 'folder', label: 'Game folders', hint: "Folders holding games (GOG games, games installed by hand), for every Game Shop. Searched two levels deep. GOG Galaxy's usual folder is searched anyway.", maxItems: 20, default: [] },
      { key: 'rescan', type: 'action', label: 'Look for games again', buttonLabel: 'Look again', whenClosed: 'queue' },
      { key: 'online', type: 'toggle', label: 'Look up details online', hint: "Descriptions, genres, release years and screenshots from Steam's store (games sold on Steam, wherever you got them). Each game is looked up about once a month.", default: true },
      // 0.9.0 (GEM Shell part E2): the key on GEM Shell's page itself, with no Game Shop open. Forgetting it takes the
      // covers, banners and logos it found too (the next time a Game Shop opens, if none is open).
      { key: 'sgdbKey', type: 'secret', name: 'steamgriddb', hosts: ['www.steamgriddb.com'], label: 'SteamGridDB API key', hint: 'Covers, banners and logos for the games with none on this computer (Epic, GOG, yours). Free: sign in on steamgriddb.com, then Preferences ▸ API ▸ Generate API key. Forgetting it takes the pictures it found too; Steam\'s stay.', showWhen: { key: 'online', truthy: true } },
      // 0.10.0: Steam's Web API (GetOwnedGames), the user's own key, sent as the x-webapi-key header
      // 0.11.0: IGDB (Twitch's game database), the user's own Twitch app: GEM Shell part C2 (client credentials)
      { key: 'igdbApp', type: 'secret', kind: 'client-credentials', name: 'igdb', hosts: ['api.igdb.com'], tokenUrl: 'https://id.twitch.tv/oauth2/token', label: 'Twitch app for IGDB', hint: "Ratings, and descriptions, genres and covers of the games Steam doesn't sell. Free: dev.twitch.tv/console ▸ Register Your Application (OAuth Redirect URL: http://localhost, Category: Application Integration, Client Type: Confidential), then copy its Client ID and make a New Secret. GEM Shell checks them with Twitch before saving.", showWhen: { key: 'online', truthy: true } },
      { key: 'steamKey', type: 'secret', name: 'steamwebapi', hosts: ['api.steampowered.com'], label: 'Steam Web API key', hint: "The Steam games you own but haven't installed, and how long you've played each. Get one at steamcommunity.com/dev/apikey (signed in to Steam; any domain name will do). Your profile's game details must be public for Steam to list them.", showWhen: { key: 'online', truthy: true } },
      { key: 'owned', type: 'toggle', label: "Show the games you own but haven't installed", hint: "Shrink-wrapped, with Install (it opens the store's app). Epic's come from the launcher's own files; Steam's need the Steam Web API key.", default: true },
      { key: 'lookUp', type: 'action', label: 'Look up details again', hint: 'Now, for every game (otherwise once a month).', buttonLabel: 'Look up', whenClosed: 'queue', showWhen: { key: 'online', truthy: true } },
      // 0.17.0: the shop's look; 0.21.0: chosen in the shop's ⚙ menu (Display ▸ Store), with the user's own skins
    ],
    groups: [
      { title: 'Stores', description: "Rockstar, EA, Ubisoft and Battle.net games are found among Windows' installed programs (GEM Shell asks once). Every store's folder is found by itself, on any drive; the folder fields are for the ones it misses.", keys: ['steam', 'steamFolder', 'epic', 'epicManifests', 'gog', 'rockstar', 'ea', 'ubisoft', 'battlenet', 'xbox', 'xboxFolders', 'curseforge', 'curseforgeFolder'] },
      { title: 'Your games', keys: ['gameFolders', 'rescan'] },
      { title: 'Online details', keys: ['online', 'sgdbKey', 'igdbApp', 'steamKey', 'owned', 'lookUp'] },
    ],
  },
  credits: [
    { name: 'Steam', url: 'https://store.steampowered.com', text: "Box art is the art Steam keeps on this computer for your library. Descriptions, genres, release dates, Metacritic scores, players' review summaries and screenshots come from Steam's store. Steam and the Steam logo are trademarks of Valve Corporation; GEM Game Shop is not affiliated with Valve." },
    { name: 'Other stores', text: "Rockstar Games, EA, Ubisoft Connect, Battle.net and Xbox are trademarks of their owners. GEM Game Shop is not affiliated with any of them: it finds the games they installed and starts them the way their own apps do." },
    { name: 'SteamGridDB', url: 'https://www.steamgriddb.com', text: "When you connect your key, covers, banners and logos come from [SteamGridDB](https://www.steamgriddb.com), made by its community. GEM Game Shop is not affiliated with SteamGridDB." },
  ],
}
