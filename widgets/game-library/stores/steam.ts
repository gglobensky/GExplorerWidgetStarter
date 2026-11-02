// widgets/game-library/stores/steam.ts
//
// What Steam's own files say (all text, read with the Read capability, no network):
//   <Steam>\steamapps\libraryfolders.vdf        every library folder (C:\Program Files (x86)\Steam, D:\SteamLibrary...)
//   <library>\steamapps\appmanifest_<id>.acf    one installed app: name, install folder, state, last played
//   <Steam>\appcache\librarycache\<id>\...       the art Steam shows in its library, for every game the user owns:
//                                                library_600x900.jpg (the box), library_hero.jpg, logo.png; some
//                                                inside a hash-named subfolder, some games only library_capsule.jpg
// Started with steam://rungameid/<id> (GEM Shell's app links: GAME-LIBRARY-SHELL-ADDITIONS.md, part A).
import { parseVdf, vdfGet, vdfNumber, vdfString, type VdfObject } from './vdf.ts'

export const STEAM_DEFAULT_FOLDER = 'C:\\Program Files (x86)\\Steam'

export type SteamLibraryFolder = { path: string; appIds: string[] }

export type SteamApp = {
  appId: string
  name: string
  /** Its folder: <library>\steamapps\common\<installdir>. */
  installDir: string
  library: string
  /** Fully installed (StateFlags has bit 4); false while it downloads or updates. */
  installed: boolean
  /** ms since 1970, 0 when never played. */
  lastPlayed: number
  lastUpdated: number
  sizeOnDisk: number
}

/** libraryfolders.vdf: the libraries and the apps Steam knows in each. */
export function parseLibraryFolders(text: string): SteamLibraryFolder[] {
  const root = vdfGet(parseVdf(text), 'libraryfolders')
  if (!root || typeof root === 'string') return []
  const out: SteamLibraryFolder[] = []
  for (const value of Object.values(root)) {
    if (typeof value === 'string') continue          // very old format: "1" "D:\\SteamLibrary"
    const path = vdfString(value, 'path')
    if (!path) continue
    const apps = vdfGet(value, 'apps')
    out.push({ path, appIds: apps && typeof apps !== 'string' ? Object.keys(apps) : [] })
  }
  // The oldest format: "1"  "D:\\SteamLibrary" directly under libraryfolders
  for (const [key, value] of Object.entries(root as VdfObject)) {
    if (/^\d+$/.test(key) && typeof value === 'string' && value.includes('\\')) out.push({ path: value.replace(/\\\\/g, '\\'), appIds: [] })
  }
  return out
}

/** One appmanifest_<id>.acf. Null when it isn't one. */
export function parseAppManifest(text: string, library: string): SteamApp | null {
  const state = vdfGet(parseVdf(text), 'AppState')
  if (!state || typeof state === 'string') return null
  const appId = vdfString(state, 'appid')
  const name = vdfString(state, 'name')
  const installdir = vdfString(state, 'installdir')
  if (!appId || !name) return null
  const flags = vdfNumber(state, 'StateFlags') ?? 0
  const lib = library.replace(/[\\/]+$/, '')
  return {
    appId,
    name,
    installDir: installdir ? `${lib}\\steamapps\\common\\${installdir}` : '',
    library: lib,
    installed: (flags & 4) === 4,
    lastPlayed: (vdfNumber(state, 'LastPlayed') ?? 0) * 1000,
    lastUpdated: (vdfNumber(state, 'LastUpdated') ?? 0) * 1000,
    sizeOnDisk: vdfNumber(state, 'SizeOnDisk') ?? 0,
  }
}

/** Steam's own tools, runtimes and redistributables: not games, never shown. */
/** Steam's own tools, runtimes and redistributables: not games, never shown. Mostly found by name (Proton, the
 *  Steam Linux Runtime...); these ids have names that don't say it. */
const TOOL_IDS = new Set([
  '228980',            // Steamworks Common Redistributables
  '218', '215',        // Source SDK Base 2007, Source SDK
])
// 0.10.1: and a game's test builds, sold apart (Guillaume saw "Tom Clancy's The Division PTS"): PTS, Public Test
// (Server / Realm / Branch), Test Server, Playtest, Beta Server.
const TOOL_NAME = /^(steamworks common redistributables|steam linux runtime|proton\b|steamvr\b|source sdk|source dedicated server|.* dedicated server$|.* sdk$|.*\b(pts|public test(ing)?( server| realm| branch| build)?|test server|playtest|beta server)\)?$)/i

export function isSteamTool(appId: string, name: string): boolean {
  return TOOL_IDS.has(appId) || TOOL_NAME.test(name.trim())
}

export function steamRunUri(appId: string): string { return `steam://rungameid/${appId}` }
export function steamStoreUri(appId: string): string { return `steam://store/${appId}` }
/** Steam's install dialog for a game owned and not installed (0.10.0). */
export function steamInstallUri(appId: string): string { return `steam://install/${appId}` }

/** The art files of a game's librarycache folder (names relative to it, any depth), best first. */
export type SteamArt = { box?: string; hero?: string; logo?: string; header?: string }

/**
 * From the relative paths found in librarycache\<id> (e.g. "library_600x900.jpg",
 * "a585...\\library_hero.jpg"), the box, hero, logo and header. The box prefers library_600x900_2x, then
 * library_600x900, then library_capsule (portrait too).
 */
export function chooseSteamArt(files: string[]): SteamArt {
  const byName = (re: RegExp) => files.filter(f => re.test(f.split(/[\\/]/).pop() ?? ''))
  const first = (...res: RegExp[]) => { for (const re of res) { const hit = byName(re)[0]; if (hit) return hit } return undefined }
  return {
    box: first(/^library_600x900_2x\.(jpg|png)$/i, /^library_600x900\.(jpg|png)$/i, /^library_capsule\.(jpg|png)$/i),
    hero: first(/^library_hero\.(jpg|png)$/i),
    logo: first(/^logo\.png$/i),
    header: first(/^library_header\.(jpg|png)$/i, /^header\.(jpg|png)$/i),
  }
}
