// widgets/game-library/games.ts
//
// A game on the shelf (GameItem: the library's LibraryItem plus its releases) and how the stores' finds become
// boxes: one box per game, whatever the number of stores it was found in (Portal 2 on Steam and on GOG: one box,
// two stickers), each release knowing how it starts.
import type { LibraryArtwork, LibraryItem } from '@shared/library-ui'
import type { EpicGame } from './stores/epic.ts'
import type { GogGame } from './stores/gog.ts'
import type { SteamApp } from './stores/steam.ts'
import type { LauncherGame } from './stores/launchers.ts'
import type { XboxGame } from './stores/xbox.ts'
import { UBISOFT_SCHEME, ubisoftLaunchUri } from './stores/launchers.ts'
import { BATTLENET_SCHEME, battlenetCode, battlenetPageUri } from './stores/battlenet.ts'
import { epicInstallUri, epicLaunchUri, type EpicOwned } from './stores/epic.ts'
import { steamInstallUri, steamRunUri } from './stores/steam.ts'
import { MODPACK_KIND, type CurseForgeInstance } from './stores/curseforge.ts'
import type { OwnedGame } from './online/steam-owned.ts'

export type StoreId = 'steam' | 'epic' | 'gog' | 'rockstar' | 'ea' | 'ubisoft' | 'battlenet' | 'xbox' | 'curseforge' | 'manual'

export const STORE_LABELS: Record<StoreId, string> = {
  steam: 'Steam', epic: 'Epic Games', gog: 'GOG', rockstar: 'Rockstar Games', ea: 'EA app', ubisoft: 'Ubisoft Connect',
  battlenet: 'Battle.net', xbox: 'Xbox', curseforge: 'CurseForge', manual: 'Added by you',
}
/** Every store, in the order a game's box shows them (and the store racks come). */
export const STORES: StoreId[] = ['steam', 'epic', 'gog', 'rockstar', 'ea', 'ubisoft', 'battlenet', 'xbox', 'curseforge', 'manual']

/**
 * One way to start a release, best first:
 *   link  through the store's app (GEM Shell's app links: steam://, com.epicgames.launcher://); `launcher` names it
 *   exe   the game's own program (GEM Shell's openPath, with this widget's Exec grant); `launcher`: the store's app
 *         it opens by itself (Rockstar's, EA's), for "Starts …"
 *   app   a Microsoft Store app by its id (GEM Shell's installedApps().launch, 0.8.0: Xbox games)
 */
export type GameLaunch =
  | { kind: 'link'; uri: string; scheme: string; launcher: string }
  | { kind: 'exe'; path: string; launcher?: string }
  | { kind: 'app'; appId: string; launcher: string }
  /** 0.16.0: a store's own program starts it (GEM Shell's launcher command: Battle.net's launch code). */
  | { kind: 'command'; scheme: string; code: string; launcher: string }

export type GameRelease = {
  store: StoreId
  /** The store's id for it (Steam app id, Epic app name, GOG game id; the exe's path for a game added by hand). */
  storeId: string
  title: string
  installDir?: string
  installed: boolean
  /** ms since 1970 (Steam says it; others: when this widget started it). */
  lastPlayed?: number
  sizeOnDisk?: number
  launches: GameLaunch[]
  /** 0.10.0: minutes played (Steam's Web API: on every computer). */
  playtimeMinutes?: number
  /** 0.10.0: how to install it, for a game owned and not installed (Steam's install dialog). */
  install?: GameLaunch
  /** 0.12.0: what it is, for the widgets that offer things for it ('minecraft.modpack': a CurseForge instance). */
  kind?: string
}

export type GameItem = LibraryItem & {
  releases: GameRelease[]
  /** The store Play uses when the game is in several (the user's choice, else the first that can start). */
  preferredStore?: StoreId
  /** ms since 1970: the most recent of its releases' (for "Recently played"). */
  lastPlayedAt?: number
  /** Art files on this computer, before they become images: the box, the wide banner, the logo. */
  art?: { box?: string; hero?: string; logo?: string }
  /** 0.10.0: minutes played, every store's that says (Steam). */
  playtimeMinutes?: number
}

export const PLACEHOLDER_ART: LibraryArtwork = { src: '', x: 0, y: 0, mode: 'placeholder' }

/**
 * 0.15.0: where a game's own icon is, for a box with no cover: the program an installed release starts (its .exe, a
 * shortcut added by hand) or its Store app. Not a CurseForge modpack's (CurseForge's own icon: the same on each).
 */
export function iconOf(game: Pick<GameItem, 'releases'>): { path: string } | { appId: string } | undefined {
  for (const release of game.releases) {
    if (!release.installed || release.store === 'curseforge') continue
    for (const launch of release.launches) {
      if (launch.kind === 'exe' && launch.path) return { path: launch.path }
      if (launch.kind === 'app' && launch.appId) return { appId: launch.appId }
    }
  }
  return undefined
}

export const ICON_FILE = 'icon-file:'
export const ICON_APP = 'icon-app:'
/** A program's icon as a picture's source (useGameArt): its file (an .exe, a shortcut, an .ico) or a Store app's id. */
export function iconSource(of: { path: string } | { appId: string }): string {
  return 'appId' in of ? ICON_APP + of.appId : ICON_FILE + of.path
}

/** 0.23.0: a CurseForge Minecraft instance (its release says: 'minecraft.modpack'). */
export const isModpack = (game: Pick<GameItem, 'releases'>) => game.releases.some(r => r.kind === 'minecraft.modpack')

/** 0.23.0: the Minecraft Launcher's Store app (the same id on every computer: its package family is Microsoft's). */
export const MINECRAFT_LAUNCHER_APP = 'Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft'
/**
 * 0.23.0: where the icon on a modpack's box comes from: Minecraft's own program on this computer (the Launcher found
 * among the games, by its title: an Xbox / Store box or a program), else the Launcher's Store app (GEM Shell makes its
 * icon only once the installed programs were allowed: never a question). Minecraft's own icon, from the user's own
 * install: nothing of it is shipped with the widget.
 */
export function minecraftIconOf(games: ReadonlyArray<Pick<GameItem, 'title' | 'releases'>>): { path: string } | { appId: string } {
  const launcher = games.find(g => !isModpack(g) && /^minecraft( launcher| java edition| for windows)?$/i.test(g.title.trim()))
  return (launcher && iconOf(launcher)) || { appId: MINECRAFT_LAUNCHER_APP }
}

/** What makes two titles the same game: case, accents, ™ ®, punctuation and "the" don't count. */
export function titleKey(title: string): string {
  return title
    .replace(/[™®©℠]/g, '')                       // before NFKD, which spells ™ as "TM"
    .normalize('NFKD').replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim()
}

export function steamRelease(app: SteamApp): GameRelease {
  return {
    store: 'steam', storeId: app.appId, title: app.name, installDir: app.installDir || undefined,
    installed: app.installed, lastPlayed: app.lastPlayed || undefined, sizeOnDisk: app.sizeOnDisk || undefined,
    launches: [{ kind: 'link', uri: steamRunUri(app.appId), scheme: 'steam', launcher: 'Steam' }],
  }
}

/** 0.10.0: a Steam game the user owns and hasn't installed (or the play time of one installed: see scan.ts). */
export function ownedSteamRelease(game: OwnedGame): GameRelease {
  return {
    store: 'steam', storeId: game.appId, title: game.name, installed: false, launches: [],
    lastPlayed: game.lastPlayed || undefined, playtimeMinutes: game.playtimeMinutes || undefined,
    install: { kind: 'link', uri: steamInstallUri(game.appId), scheme: 'steam', launcher: 'Steam' },
  }
}

/** 0.13.0: an Epic game owned and not installed (Epic's catalog cache): shrink-wrapped, Install opens the launcher. */
export function ownedEpicRelease(game: EpicOwned): GameRelease {
  return {
    store: 'epic', storeId: game.appName, title: game.title, installed: false, launches: [],
    install: { kind: 'link', uri: epicInstallUri(game), scheme: 'com.epicgames.launcher', launcher: 'Epic Games' },
  }
}

export function epicRelease(game: EpicGame): GameRelease {
  const link: GameLaunch = { kind: 'link', uri: epicLaunchUri(game), scheme: 'com.epicgames.launcher', launcher: 'Epic Games' }
  // Without an Epic sign-in the game starts from its exe too: no launcher window (but the launcher stays the
  // first choice: it applies updates and cloud saves).
  const launches: GameLaunch[] = game.requiresAuth || !game.exe ? [link] : [link, { kind: 'exe', path: game.exe }]
  return {
    store: 'epic', storeId: game.appName, title: game.title, installDir: game.installDir,
    installed: true, sizeOnDisk: game.sizeOnDisk || undefined, launches,
  }
}

export function gogRelease(game: GogGame): GameRelease {
  return {
    store: 'gog', storeId: game.gameId, title: game.title, installDir: game.installDir,
    installed: true, launches: [{ kind: 'exe', path: game.exe }],
  }
}

/** A game found in Windows' installed programs (Rockstar, EA, Ubisoft, Battle.net; 0.8.0). */
export function launcherRelease(game: LauncherGame): GameRelease {
  const launches: GameLaunch[] = []
  if (game.store === 'ubisoft' && game.ubisoftId) {
    launches.push({ kind: 'link', uri: ubisoftLaunchUri(game.ubisoftId), scheme: UBISOFT_SCHEME, launcher: 'Ubisoft Connect' })
  }
  // 0.16.0: Battle.net starts the game itself, by its launch code (GEM Shell's launcher command)
  const code = game.store === 'battlenet' ? battlenetCode(game.title) : undefined
  if (code) launches.push({ kind: 'command', scheme: BATTLENET_SCHEME, code, launcher: 'Battle.net' })
  // The game's program: Rockstar's and EA's open their launcher themselves
  if (game.exe) launches.push({ kind: 'exe', path: game.exe, launcher: game.store === 'ubisoft' ? undefined : STORE_LABELS[game.store] })
  // Last: Battle.net opened on the game's page (the user presses Play there)
  if (code) launches.push({ kind: 'link', uri: battlenetPageUri(code), scheme: BATTLENET_SCHEME, launcher: 'Battle.net' })
  return {
    store: game.store, storeId: game.id, title: game.title, installDir: game.installDir,
    installed: true, sizeOnDisk: game.sizeOnDisk, launches,
  }
}

/** An Xbox game: started as a Store app (0.8.0). */
export function xboxRelease(game: XboxGame): GameRelease {
  return {
    store: 'xbox', storeId: game.appId, title: game.title, installDir: game.installDir,
    installed: true, launches: [{ kind: 'app', appId: game.appId, launcher: 'Xbox' }],
  }
}

/**
 * 0.12.0: a CurseForge Minecraft instance. It starts through CurseForge (its program, when Windows lists it): the
 * user presses Play there, CurseForge has no link that starts one instance.
 */
export function curseforgeRelease(instance: CurseForgeInstance, curseforgeExe?: string): GameRelease {
  return {
    store: 'curseforge', storeId: instance.guid, title: instance.name, installDir: instance.installDir, installed: true,
    lastPlayed: instance.lastPlayed, playtimeMinutes: instance.playtimeMinutes, kind: MODPACK_KIND,
    launches: curseforgeExe ? [{ kind: 'exe', path: curseforgeExe, launcher: 'CurseForge' }] : [],
  }
}

/** A game the user added: an exe (or a shortcut to one). */
export function manualRelease(path: string, title: string): GameRelease {
  const dir = path.replace(/[\\/][^\\/]*$/, '')
  return { store: 'manual', storeId: path, title, installDir: dir, installed: true, launches: [{ kind: 'exe', path }] }
}

/** A readable title from an exe's name ("witcher3.exe" → "Witcher3", "Hades_Game.exe" → "Hades Game"). */
export function titleFromExe(path: string): string {
  const stem = (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim()
  return stem ? stem.charAt(0).toLocaleUpperCase() + stem.slice(1) : path
}


/**
 * The boxes: releases with the same title (titleKey) become one game. Its title is the first store's (Steam,
 * Epic, GOG, then yours), its id stable across scans ("game:<titleKey>"), its last play the most recent.
 */
export function mergeReleases(releases: GameRelease[]): GameItem[] {
  const groups = new Map<string, GameRelease[]>()
  for (const release of releases) {
    // A modpack is its own box, whatever its name (two instances of one pack, an instance named like a game)
    const key = release.store === 'curseforge' ? `curseforge ${release.storeId}` : titleKey(release.title) || release.storeId
    const list = groups.get(key) ?? []
    // The same store twice (a game in two Steam libraries, a file listed twice): kept once
    if (!list.some(r => r.store === release.store && r.storeId === release.storeId)) list.push(release)
    groups.set(key, list)
  }
  const items: GameItem[] = []
  let rank = 0
  for (const [key, list] of groups) {
    list.sort((a, b) => STORES.indexOf(a.store) - STORES.indexOf(b.store))
    const lastPlayed = Math.max(0, ...list.map(r => r.lastPlayed ?? 0))
    const playtime = list.reduce((sum, r) => sum + (r.playtimeMinutes ?? 0), 0)
    items.push({
      id: `game:${key}`,
      title: list[0].title,
      year: 0,
      primaryGenre: 'Games',
      genres: [],
      synopsis: '',
      artwork: PLACEHOLDER_ART,
      platform: 'pc',
      addedRank: rank++,
      path: list.find(r => r.installDir)?.installDir,
      releases: list,
      lastPlayedAt: lastPlayed || undefined,
      playtimeMinutes: playtime || undefined,
    })
  }
  return items
}

/** The release Play uses: the preferred store's when it can start, else the first installed one. */
export function playableRelease(game: GameItem): GameRelease | undefined {
  const installed = game.releases.filter(r => r.installed && r.launches.length)
  return installed.find(r => r.store === game.preferredStore) ?? installed[0]
}

/** Recently played: the games played at least once, most recent first (installedOnly: "Continue playing", 0.10.0). */
export function recentlyPlayed(games: GameItem[], max = 12, installedOnly = false): GameItem[] {
  return games.filter(g => g.lastPlayedAt && (!installedOnly || isInstalled(g)))
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)).slice(0, max)
}

/** Installed from at least one store. */
export function isInstalled(game: GameItem): boolean {
  return game.releases.some(r => r.installed)
}

/** 0.10.0: the release that can be installed (a game owned and not installed anywhere), if any. */
export function installableRelease(game: GameItem): GameRelease | undefined {
  return isInstalled(game) ? undefined : game.releases.find(r => r.install)
}
