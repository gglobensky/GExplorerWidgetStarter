// widgets/game-library/scan.ts
//
// Finds the games on this computer: Steam (its libraries and box art), Epic (its manifests), GOG (goggame-*.info
// in the game folders), Rockstar, EA, Ubisoft and Battle.net (Windows' installed programs: AppsPort, 0.8.0), Xbox
// (MicrosoftGame.config in the Xbox games folders, 0.8.0), and the games the user added. Reads through a small port (FilePort) so the tests can run
// it on an in-memory copy of real folders; filePortFor(sdk) is the real one (Read capability: no prompt, the
// shell audits each folder once).
import type { ListingEntry, ListingSnapshot, ListingSource, WidgetSdk } from 'gexplorer/widgets'
import { chooseSteamArt, isSteamTool, parseAppManifest, parseLibraryFolders, STEAM_DEFAULT_FOLDER } from './stores/steam.ts'
import { EPIC_MANIFESTS_FOLDER, parseCatalogCache, parseEpicItem } from './stores/epic.ts'
import { GOG_DEFAULT_FOLDERS, isGogInfoFile, parseGogInfo } from './stores/gog.ts'
import { steamIdFromAccountId, steamIdFromLoginUsers, type OwnedGame } from './online/steam-owned.ts'
import { CURSEFORGE_SETTINGS, CURSEFORGE_USUAL_ROOT, instanceLine, newestScreenshot, parseInstance, rootFromSettings, type CurseForgeInstance } from './stores/curseforge.ts'
import { curseforgeRelease, ownedEpicRelease, epicRelease, gogRelease, launcherRelease, manualRelease, mergeReleases, ownedSteamRelease, steamRelease, titleFromExe, xboxRelease, type GameItem, type GameRelease, type StoreId } from './games.ts'
import { pickLauncherGames, type InstalledAppLike, type LauncherStore } from './stores/launchers.ts'
import { parseGameConfig, titleFromFolder, XBOX_DEFAULT_FOLDERS, xboxAppId } from './stores/xbox.ts'

export type FileEntry = { name: string; path: string; dir: boolean }

export interface FilePort {
  /** A folder's entries; rejects when it can't be read (missing, denied). */
  list(path: string): Promise<FileEntry[]>
  /** A small text file (at most maxBytes, 1 MB by default); rejects when it can't be read. */
  readText(path: string, maxBytes?: number): Promise<string>
  /** 'dir', 'file' or null (nothing there). */
  kind(path: string): Promise<'dir' | 'file' | null>
  /**
   * 0.12.0: "%PROGRAMDATA%\Epic" made a real path (GEM Shell's folder variables): the usual folders are found on
   * any computer, not taken for C:. Missing: the path as given.
   */
  expand?(path: string): Promise<string>
}

/** Windows' installed programs (GEM Shell's sdk.installedApps().list(), part B); null when GEM Shell can't. */
export interface AppsPort {
  list(): Promise<{ apps: InstalledAppLike[] } | { error: string }>
}

export type ScanSettings = {
  /** Steam's folder (where steam.exe is); empty: the usual place. */
  steamFolder?: string
  /** Epic's manifests folder; empty: the usual place. */
  epicManifests?: string
  /** Folders holding games (GOG games, games installed by hand): searched two levels deep. */
  gameFolders?: string[]
  /** Programs the user added as games (exe paths), with the titles they gave. */
  manual?: Array<{ path: string; title?: string }>
  stores?: Partial<Record<Exclude<StoreId, 'manual'>, boolean>>
  /** Folders holding Xbox games (empty: C:\XboxGames). */
  xboxFolders?: string[]
  /** 0.12.0: CurseForge's modding folder (empty: the one CurseForge's own settings name, else its usual place). */
  curseforgeFolder?: string
  /**
   * 0.10.0: the Steam games the user owns (Steam's Web API, online/steam-owned.ts): those not installed get a box
   * (shrink-wrapped, Install), and the installed ones their play time.
   */
  owned?: OwnedGame[]
  /** 0.13.0: the Epic games owned and not installed too (Epic's catalog cache), shrink-wrapped. */
  epicOwned?: boolean
}

export type ScanResult = {
  games: GameItem[]
  /** What could not be read, for the settings panel ("D:\SteamLibrary: not found"). */
  warnings: string[]
  /** What was found where (for the settings panel): the installed games. */
  found: Record<StoreId, number>
  /** 0.10.0: Steam games owned and not installed (0.13.0: and Epic's). */
  notInstalled?: number
}

const join = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}\\${name}`
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function steamReleases(fs: FilePort, folder: string, warnings: string[], owned: OwnedGame[] = []): Promise<{ releases: GameRelease[]; owned: number; art: Map<string, ReturnType<typeof chooseSteamArt>> }> {
  const releases: GameRelease[] = []
  const art = new Map<string, ReturnType<typeof chooseSteamArt>>()
  let libraries: string[] = [folder]
  try {
    const listed = parseLibraryFolders(await fs.readText(join(folder, 'steamapps\\libraryfolders.vdf'))).map(l => l.path)
    if (listed.length) libraries = listed
  } catch (e) {
    warnings.push(`Steam (${folder}): ${message(e)}`)
    return { releases, owned: 0, art }
  }
  const seen = new Set<string>()
  for (const library of libraries) {
    const key = library.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    let entries: FileEntry[]
    try { entries = await fs.list(join(library, 'steamapps')) } catch (e) { warnings.push(`Steam library ${library}: ${message(e)}`); continue }
    for (const entry of entries) {
      if (entry.dir || !/^appmanifest_\d+\.acf$/i.test(entry.name)) continue
      try {
        const app = parseAppManifest(await fs.readText(entry.path), library)
        if (app && !isSteamTool(app.appId, app.name)) releases.push(steamRelease(app))
      } catch (e) { if (warnings.length < 20) warnings.push(`${entry.path}: ${message(e)}`) }
    }
  }
  // 0.10.0: the owned games. Installed: their play time (on every computer) and the latest play. Not installed: a box.
  const byId = new Map(releases.map(r => [r.storeId, r]))
  let notInstalled = 0
  for (const game of owned) {
    const release = byId.get(game.appId)
    if (release) {
      release.playtimeMinutes = game.playtimeMinutes || undefined
      if (game.lastPlayed > (release.lastPlayed ?? 0)) release.lastPlayed = game.lastPlayed
      continue
    }
    if (isSteamTool(game.appId, game.name)) continue
    const own = ownedSteamRelease(game)
    releases.push(own)
    byId.set(game.appId, own)
    notInstalled += 1
  }
  // Steam's own art for each game found: <Steam>\appcache\librarycache\<id>, files at its top and one level down.
  // Steam keeps it for the games owned too, installed or not.
  const cache = join(folder, 'appcache\\librarycache')
  for (const release of releases) {
    const dir = join(cache, release.storeId)
    try {
      const files: string[] = []
      for (const entry of await fs.list(dir)) {
        if (!entry.dir) { files.push(entry.path); continue }
        try { for (const inner of await fs.list(entry.path)) if (!inner.dir) files.push(inner.path) } catch { /* skipped */ }
      }
      art.set(release.storeId, chooseSteamArt(files))
    } catch { /* no art for it: a plain box */ }
  }
  return { releases, owned: notInstalled, art }
}

/**
 * 0.10.0: the SteamID64 of the account signed in to Steam on this computer: config\loginusers.vdf (the most recent),
 * else the only userdata\<account id> folder. undefined when it can't be told.
 */
// ── Where the stores are, on any computer (0.12.0) ──────────────────────────────────────────────────────────────
// Nothing is taken for C:\ any more: the user's setting first, then what Windows' installed programs say (Steam's
// folder), then the usual places through folder variables (%PROGRAMFILES(X86)%, %PROGRAMDATA%, %SYSTEMDRIVE%).

const expandIn = (fs: FilePort) => async (p: string) => { try { return fs.expand ? await fs.expand(p) : p } catch { return p } }
const parentOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '')

/** The first of <candidates> that is a folder. */
async function firstFolder(fs: FilePort, candidates: Array<string | undefined>): Promise<string | undefined> {
  const seen = new Set<string>()
  for (const c of candidates) {
    const p = c?.trim()
    if (!p || seen.has(p.toLowerCase())) continue
    seen.add(p.toLowerCase())
    try { if ((await fs.kind(p)) === 'dir') return p } catch { /* not there */ }
  }
  return undefined
}

/** Steam's folder: the setting, Steam's entry among the installed programs, then Program Files (x86) and Program Files. */
export async function steamFolderOf(fs: FilePort, settings: ScanSettings = {}, programs: InstalledAppLike[] = []): Promise<string | undefined> {
  if (settings.steamFolder?.trim()) return settings.steamFolder.trim()
  const expand = expandIn(fs)
  const listed = programs.filter(p => /^steam$/i.test(p.name.trim()) && /valve/i.test(p.publisher ?? ''))
    .flatMap(p => [p.installLocation, p.displayIcon && /steam\.exe$/i.test(p.displayIcon) ? parentOf(p.displayIcon) : undefined])
  return firstFolder(fs, [...listed, await expand('%PROGRAMFILES(X86)%\\Steam'), await expand('%PROGRAMFILES%\\Steam'), STEAM_DEFAULT_FOLDER])
}

/** Epic's manifests: the setting, else %PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests. */
async function epicFolderOf(fs: FilePort, settings: ScanSettings): Promise<string | undefined> {
  if (settings.epicManifests?.trim()) return settings.epicManifests.trim()
  return firstFolder(fs, [await expandIn(fs)('%PROGRAMDATA%\\Epic\\EpicGamesLauncher\\Data\\Manifests'), EPIC_MANIFESTS_FOLDER])
}

/** CurseForge's modding folder: the setting, the one CurseForge's settings name, its usual place. */
export async function curseforgeRootOf(fs: FilePort, settings: ScanSettings = {}): Promise<string | undefined> {
  if (settings.curseforgeFolder?.trim()) return settings.curseforgeFolder.trim()
  const expand = expandIn(fs)
  let named: string | undefined
  try { named = rootFromSettings(await fs.readText(await expand(CURSEFORGE_SETTINGS), 512 * 1024)) } catch { /* CurseForge isn't installed, or never set it */ }
  return firstFolder(fs, [named, await expand(CURSEFORGE_USUAL_ROOT)])
}

/** The desktop programs of GEM Shell's list (asked once per scan: the shell keeps the list two minutes). */
async function programsOf(apps: AppsPort | undefined): Promise<InstalledAppLike[]> {
  if (!apps) return []
  try {
    const listed = await apps.list()
    return 'error' in listed ? [] : listed.apps.filter(a => a.kind !== 'store')
  } catch { return [] }
}

/** 0.12.0: the CurseForge instances of <root>\Instances, each a box (its picture, or its newest screenshot). */
async function curseforgeReleases(fs: FilePort, root: string, exe: string | undefined, warnings: string[], art: Map<string, { box?: string; hero?: string; about: string }>): Promise<GameRelease[]> {
  const out: GameRelease[] = []
  let entries: FileEntry[]
  try { entries = await fs.list(join(root, 'Instances')) } catch (e) { warnings.push(`CurseForge (${root}): ${message(e)}`); return out }
  for (const entry of entries) {
    if (!entry.dir) continue
    let instance: CurseForgeInstance | null = null
    try {
      // Its file lists every mod: a big one (1.4 MB with 300 mods)
      instance = parseInstance(await fs.readText(join(entry.path, 'minecraftinstance.json'), 8 * 1024 * 1024), entry.path)
    } catch (e) {
      if (warnings.length < 20 && !/not found|E_NOT_FOUND/i.test(message(e))) warnings.push(`${entry.path}: ${message(e)}`)
      continue
    }
    if (!instance) continue
    out.push(curseforgeRelease(instance, exe))
    let shot: string | undefined
    try {
      const names = (await fs.list(join(entry.path, 'screenshots'))).filter(f => !f.dir).map(f => f.name)
      const newest = newestScreenshot(names)
      if (newest) shot = join(join(entry.path, 'screenshots'), newest)
    } catch { /* no screenshots */ }
    const box = instance.image ?? shot
    const about = `${instanceLine(instance)}. A CurseForge instance${instance.modpack ? ` of ${instance.modpack.name}${instance.modpack.version ? ` (${instance.modpack.version})` : ''}` : ''}, in ${instance.installDir}.`
    art.set(instance.guid, { box, hero: shot, about })
  }
  return out
}

export async function findSteamId(fs: FilePort, settings: ScanSettings = {}): Promise<string | undefined> {
  const folder = await steamFolderOf(fs, settings) ?? STEAM_DEFAULT_FOLDER
  try {
    const id = steamIdFromLoginUsers(await fs.readText(join(folder, 'config\\loginusers.vdf')))
    if (id) return id
  } catch { /* not readable: userdata next */ }
  try {
    const accounts = (await fs.list(join(folder, 'userdata'))).filter(e => e.dir && /^\d+$/.test(e.name) && e.name !== '0')
    if (accounts.length === 1) return steamIdFromAccountId(accounts[0].name)
  } catch { /* nothing to tell */ }
  return undefined
}

async function epicReleases(fs: FilePort, folder: string, warnings: string[]): Promise<GameRelease[]> {
  const out: GameRelease[] = []
  let entries: FileEntry[]
  try { entries = await fs.list(folder) } catch (e) { warnings.push(`Epic (${folder}): ${message(e)}`); return out }
  for (const entry of entries) {
    if (entry.dir || !/\.item$/i.test(entry.name)) continue
    try {
      const game = parseEpicItem(await fs.readText(entry.path))
      if (game) out.push(epicRelease(game))
    } catch (e) { if (warnings.length < 20) warnings.push(`${entry.path}: ${message(e)}`) }
  }
  return out
}

/** goggame-*.info in each folder, its subfolders, and theirs (a games folder > a game > a GOG subfolder). */
async function gogReleases(fs: FilePort, folders: string[], warnings: string[], gameDirs: string[] = []): Promise<GameRelease[]> {
  const out: GameRelease[] = []
  const found = new Set<string>()
  async function visit(dir: string, depth: number, root: boolean) {
    let entries: FileEntry[]
    try { entries = await fs.list(dir) } catch (e) { if (root) warnings.push(`${dir}: ${message(e)}`); return }
    for (const entry of entries) {
      if (entry.dir || !isGogInfoFile(entry.name)) continue
      try {
        const game = parseGogInfo(await fs.readText(entry.path), dir)
        if (game && !found.has(game.gameId)) { found.add(game.gameId); out.push(gogRelease(game)) }
      } catch { /* a broken info file: skipped */ }
    }
    if (depth <= 0) return
    for (const entry of entries) if (entry.dir) await visit(entry.path, depth - 1, false)
  }
  for (const folder of folders) if (folder.trim()) await visit(folder, 2, true)
  // A game's own folder (from the installed programs): its info file is at its top
  for (const dir of gameDirs) if (dir.trim()) await visit(dir, 0, false)
  return out
}

/** Rockstar, EA, Ubisoft, Battle.net: their games in Windows' installed programs (not those in Steam's or Epic's folders). */
/** The Store apps of GEM Shell's list (0.11.2); none when it can't give them. */
async function storeAppsOf(apps: AppsPort | undefined): Promise<InstalledAppLike[]> {
  if (!apps) return []
  try {
    const listed = await apps.list()
    return 'error' in listed ? [] : listed.apps.filter(a => a.kind === 'store')
  } catch { return [] }
}

async function launcherReleases(apps: AppsPort | undefined, wanted: LauncherStore[], skipDirs: string[], warnings: string[]): Promise<GameRelease[]> {
  if (!apps || !wanted.length) return []
  let listed: Awaited<ReturnType<AppsPort['list']>>
  try { listed = await apps.list() } catch (e) { warnings.push(`Installed programs: ${message(e)}`); return [] }
  if ('error' in listed) { warnings.push(`Installed programs: ${listed.error}`); return [] }
  return pickLauncherGames(listed.apps.filter(a => a.kind !== 'store'), skipDirs).filter(g => wanted.includes(g.store)).map(launcherRelease)
}

/** Xbox games: each folder of an Xbox games folder with a MicrosoftGame.config (in Content, or the folder itself). */
/**
 * 0.11.2: the Xbox games folders the Store apps' list points to, on any drive (it replaces looking for .GamingRoot):
 * a game made for the Xbox app is installed in <folder>\<game>\Content, and that is its package's folder.
 */
export function xboxRootsOf(apps: InstalledAppLike[]): string[] {
  const roots = new Map<string, string>()
  for (const app of apps) {
    if (app.kind !== 'store' || !app.installLocation) continue
    const parts = app.installLocation.replace(/[\\/]+$/, '').split(/[\\/]/)
    if (parts.length < 3 || !/^content$/i.test(parts[parts.length - 1])) continue
    const root = parts.slice(0, -2).join('\\')
    roots.set(root.toLocaleLowerCase(), /^[a-z]:$/i.test(root) ? root + '\\' : root)
  }
  return [...roots.values()]
}

async function xboxReleases(fs: FilePort, folders: string[], warnings: string[], own: boolean, logos: Map<string, string>, names: Map<string, string> = new Map()): Promise<GameRelease[]> {
  const out: GameRelease[] = []
  const seen = new Set<string>()
  for (const root of folders) {
    let entries: FileEntry[]
    try { entries = await fs.list(root) } catch (e) { if (own) warnings.push(`Xbox (${root}): ${message(e)}`); continue }
    for (const entry of entries) {
      if (!entry.dir) continue
      for (const dir of [join(entry.path, 'Content'), entry.path]) {
        let xml: string
        try { xml = await fs.readText(join(dir, 'MicrosoftGame.config')) } catch { continue }
        const config = parseGameConfig(xml)
        const appId = config ? await xboxAppId(config).catch(() => null) : null
        if (!config || !appId) { if (warnings.length < 20) warnings.push(`${dir}: not an Xbox game GEM Shell can start`); break }
        if (seen.has(appId.toLowerCase())) break
        seen.add(appId.toLowerCase())
        // The name Windows shows (GEM Shell's list) when the config's is a resource name it can't read
        out.push(xboxRelease({ appId, title: config.displayName || names.get(appId.toLowerCase()) || titleFromFolder(dir), installDir: dir }))
        if (config.logos[0]) logos.set(appId, join(dir, config.logos[0].replace(/\//g, '\\')))
        break
      }
    }
  }
  return out
}

/**
 * Every store, then the boxes (one per game). A store that isn't installed is skipped quietly when its folder is
 * the usual one; a folder the user gave that can't be read becomes a warning.
 */
export async function scanGames(fs: FilePort, settings: ScanSettings = {}, apps?: AppsPort): Promise<ScanResult> {
  const warnings: string[] = []
  const stores = { steam: true, epic: true, gog: true, rockstar: true, ea: true, ubisoft: true, battlenet: true, xbox: true, curseforge: true, ...settings.stores }
  const found: Record<StoreId, number> = { steam: 0, epic: 0, gog: 0, rockstar: 0, ea: 0, ubisoft: 0, battlenet: 0, xbox: 0, curseforge: 0, manual: 0 }
  const expand = expandIn(fs)
  const programs = await programsOf(apps)
  const releases: GameRelease[] = []
  let steamArt = new Map<string, ReturnType<typeof chooseSteamArt>>()
  let notInstalled = 0
  const epicArt = new Map<string, { box?: string; hero?: string; logo?: string; about?: string }>()

  if (stores.steam) {
    const folder = await steamFolderOf(fs, settings, programs)
    if (folder) {
      const steam = await steamReleases(fs, folder, warnings, settings.owned)
      releases.push(...steam.releases)
      steamArt = steam.art
      found.steam = steam.releases.length - steam.owned
      notInstalled = steam.owned
    }
  }
  if (stores.epic) {
    const folder = await epicFolderOf(fs, settings)
    if (folder) {
      const epic = await epicReleases(fs, folder, warnings)
      releases.push(...epic)
      found.epic = epic.length
      // 0.13.0: the catalog cache (beside Manifests): every Epic game's box art, and the games owned not installed
      try {
        const owned = parseCatalogCache(await fs.readText(join(parentOf(folder), 'Catalog\\catcache.bin'), 8 * 1024 * 1024))
        const installed = new Set(epic.map(r => r.storeId.toLowerCase()))
        for (const game of owned) {
          epicArt.set(game.appName.toLowerCase(), { box: game.box, hero: game.hero, logo: game.logo, about: game.description })
          if (installed.has(game.appName.toLowerCase()) || !settings.epicOwned) continue
          releases.push(ownedEpicRelease(game))
          notInstalled += 1
        }
      } catch { /* no catalog cache: the installed games only */ }
    }
  }
  if (stores.gog) {
    const own = (settings.gameFolders ?? []).filter(f => f.trim())
    const usual: string[] = []
    const places = [await expand('%PROGRAMFILES(X86)%\\GOG Galaxy\\Games'), await expand('%SYSTEMDRIVE%\\GOG Games'), ...GOG_DEFAULT_FOLDERS]
    for (const f of places) if (!usual.some(u => u.toLowerCase() === f.toLowerCase()) && (await fs.kind(f).catch(() => null)) === 'dir') usual.push(f)
    // 0.12.0: and every GOG game Windows' installed programs list (GOG Galaxy registers each one), wherever it is
    const listed = programs.filter(p => /^GOG(\.com)?\b/i.test(p.publisher ?? '') && p.installLocation).map(p => p.installLocation!)
    const gog = await gogReleases(fs, [...usual, ...own], warnings, listed)
    releases.push(...gog)
    found.gog = gog.length
  }
  // The launcher stores, from Windows' list; a game in a Steam or Epic folder is that store's (already found)
  const wanted = (['rockstar', 'ea', 'ubisoft', 'battlenet'] as const).filter(s => stores[s])
  const skipDirs = releases.filter(r => (r.store === 'steam' || r.store === 'epic') && r.installDir).map(r => r.installDir!)
  for (const release of await launcherReleases(apps, [...wanted], skipDirs, warnings)) {
    releases.push(release)
    found[release.store] += 1
  }
  const xboxLogos = new Map<string, string>()
  if (stores.xbox) {
    const own = (settings.xboxFolders ?? []).filter(f => f.trim())
    const usual: string[] = []
    if (!own.length) for (const f of [await expand('%SYSTEMDRIVE%\\XboxGames'), ...XBOX_DEFAULT_FOLDERS]) if (!usual.some(u => u.toLowerCase() === f.toLowerCase()) && (await fs.kind(f).catch(() => null)) === 'dir') usual.push(f)
    // 0.11.2: and the Xbox games folders of every drive, from GEM Shell's list of Store apps (asked once already)
    const storeApps = await storeAppsOf(apps)
    const names = new Map(storeApps.filter(a => a.appId).map(a => [a.appId!.toLowerCase(), a.name]))
    const folders = [...(own.length ? own : usual)]
    for (const root of xboxRootsOf(storeApps)) if (!folders.some(f => f.replace(/[\\/]+$/, '').toLocaleLowerCase() === root.replace(/[\\/]+$/, '').toLocaleLowerCase())) folders.push(root)
    const xbox = await xboxReleases(fs, folders, warnings, own.length > 0, xboxLogos, names)
    releases.push(...xbox)
    found.xbox = xbox.length
  }
  // 0.12.0: CurseForge's Minecraft instances
  const cfArt = new Map<string, { box?: string; hero?: string; about: string }>()
  if (stores.curseforge) {
    const root = await curseforgeRootOf(fs, settings)
    if (root) {
      const exe = programs.find(p => /^curseforge\b/i.test(p.name.trim()) && p.displayIcon && /\.exe$/i.test(p.displayIcon))?.displayIcon
      const cf = await curseforgeReleases(fs, root, exe, warnings, cfArt)
      releases.push(...cf)
      found.curseforge = cf.length
    } else if (settings.curseforgeFolder?.trim()) warnings.push(`CurseForge (${settings.curseforgeFolder}): not found`)
  }
  for (const item of settings.manual ?? []) {
    if (!item.path?.trim()) continue
    releases.push(manualRelease(item.path, item.title?.trim() || titleFromExe(item.path)))
    found.manual += 1
  }

  const games = mergeReleases(releases)
  for (const game of games) {
    const steam = game.releases.find(r => r.store === 'steam')
    const art = steam ? steamArt.get(steam.storeId) : undefined
    if (art && (art.box || art.hero || art.logo)) game.art = { box: art.box, hero: art.hero, logo: art.logo }
    // An Xbox game's own logo, from its package, when there's nothing better
    const xbox = game.releases.find(r => r.store === 'xbox')
    const logo = xbox ? xboxLogos.get(xbox.storeId) : undefined
    if (logo && !game.art?.logo) game.art = { ...game.art, logo }
    // An Epic game: Epic's own box art, banner and logo (after this computer's files: Steam's, the Xbox logo)
    const epicOne = game.releases.find(r => r.store === 'epic')
    const ea = epicOne ? epicArt.get(epicOne.storeId.toLowerCase()) : undefined
    if (ea) {
      game.art = { box: game.art?.box ?? ea.box, hero: game.art?.hero ?? ea.hero, logo: game.art?.logo ?? ea.logo }
      if (!game.synopsis && ea.about) game.synopsis = ea.about
    }
    // A modpack: its picture, what it runs on, on its own rack
    const cf = game.releases.find(r => r.store === 'curseforge')
    if (cf) {
      const pic = cfArt.get(cf.storeId)
      if (pic?.box) game.art = { ...game.art, box: pic.box }
      if (pic?.hero) game.art = { ...game.art, hero: pic.hero }
      if (pic) game.synopsis = pic.about
      game.genres = ['Minecraft modpacks']
      game.primaryGenre = 'Minecraft modpacks'
    }
  }
  return { games, warnings, found, notInstalled }
}

// ── The real port: GEM Shell's listing and file reading ─────────────────────────────────────────────────────────

function settled(source: ListingSource): Promise<ListingSnapshot> {
  return new Promise(resolve => {
    const current = source.snapshot()
    if (current.status !== 'loading') { resolve(current); return }
    const off = source.subscribe(snapshot => {
      if (snapshot.status !== 'loading') { off(); resolve(snapshot) }
    })
  })
}

const ROWS_PAGE = 1000

/** FilePort over the SDK (Read capability). owner: a prefix for this widget's listings. */
export function filePortFor(sdk: WidgetSdk, owner: string): FilePort {
  let count = 0
  return {
    async list(path) {
      if (!sdk.openListing) throw new Error('GEM Shell gave this widget no folder listings.')
      const source = sdk.openListing(path, { owner: `${owner}:${count++}`, autoRefresh: false, sort: { key: 'name', dir: 'asc', foldersFirst: true } })
      try {
        const snapshot = await settled(source)
        if (snapshot.status !== 'ready') throw new Error(snapshot.error?.message || 'could not be read')
        const rows: ListingEntry[] = []
        for (let start = 0; start < snapshot.total; start += ROWS_PAGE) {
          rows.push(...await source.rows(start, Math.min(snapshot.total, start + ROWS_PAGE), snapshot.version))
        }
        return rows.map(r => ({ name: r.Name, path: r.FullPath, dir: r.Kind === 'dir' }))
      } finally {
        source.close()
      }
    },
    async readText(path, maxBytes = 1024 * 1024) {
      if (!sdk.fsReadText) throw new Error('GEM Shell gave this widget no file reading.')
      return (await sdk.fsReadText(path, { maxBytes })).text
    },
    async expand(path) {
      const expand = (sdk as { expandPath?: (p: string) => Promise<string> }).expandPath
      return expand ? expand(path) : path
    },
    async kind(path) {
      if (!sdk.fsValidate) return null
      const v = await sdk.fsValidate(path)
      return v.ok && v.exists ? (v.isDir ? 'dir' : 'file') : null
    },
  }
}
