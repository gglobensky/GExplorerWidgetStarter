// widgets/game-library/stores/launchers.ts
//
// The stores that list their games only in Windows' installed programs (0.8.0, Phase 2; GEM Shell's
// sdk.installedApps(), GAME-LIBRARY-SHELL-ADDITIONS.md part B): Rockstar Games, the EA app, Ubisoft Connect and
// Battle.net. Each game's uninstall entry gives its name, folder and (usually) its program; pure, tested on entries
// shaped like real ones.
//   Ubisoft    the key "Uplay Install <id>": started with uplay://launch/<id>/0 (an app link)
//   Rockstar   publisher "Rockstar Games" (not the launcher, not Social Club): its program, which opens the launcher
//   EA         publisher "Electronic Arts" (not the EA app itself): its program, which goes through the EA app
//   Battle.net publisher "Blizzard Entertainment" (not Battle.net itself): its program
// An entry in a Steam or Epic game's folder is the same game sold there (Rockstar registers Steam's Red Dead
// Redemption 2 too): left out, the Steam or Epic box has it.
// Not games (0.8.1; Guillaume saw "Rockstar Games SDK"): the publishers' own tools share the publisher. Two checks,
// as no launcher keeps a list of its games in a form the widget can read:
//   - the name: launcher, SDK, engine, runtime, redistributable, anti-cheat, service, updater, tools, editor, server…
//   - the size, when the entry gives it: under 25 MB is a tool (0.8.2: was 150 MB, which an old EA classic like
//     Plants vs. Zombies could fall under; the name check catches the SDKs).
// Ubisoft's "Uplay Install <id>" entries are games by definition: only the name check applies.

export type LauncherStore = 'rockstar' | 'ea' | 'ubisoft' | 'battlenet'

/** What GEM Shell's list gives for a program (the SDK's InstalledApp, the fields read here). */
export type InstalledAppLike = {
  id: string
  name: string
  publisher?: string
  installLocation?: string
  displayIcon?: string
  sizeKb?: number
  uninstallKey: string
  /** 0.11.2: 'store' for a packaged app (GEM Shell lists the Store apps too), with its id. */
  kind?: 'desktop' | 'store'
  appId?: string
}

export type LauncherGame = {
  store: LauncherStore
  /** Stable per store: Ubisoft's game id, else the uninstall entry's key name. */
  id: string
  title: string
  installDir?: string
  /** The game's program, when the entry names one. */
  exe?: string
  /** Ubisoft's game id (for uplay://launch/<id>/0). */
  ubisoftId?: string
  sizeOnDisk?: number
}

/** What the publishers' tools are called (any store). */
const NOT_A_GAME = /\b(launcher|social ?club|sdk|engine|runtime|redist(ributable)?s?|anti-?cheat|easy ?anti ?cheat|battleye|service|services|helper|updater|update|installer|uninstaller|tools?|toolkit|editor|server|agent|overlay|driver|plugin|crash ?report(er)?|touchup|bootstrap(per)?)\b/i
/** Per store: its own apps' names. */
const STORE_APPS: Record<LauncherStore, RegExp> = {
  rockstar: /^rockstar games\b/i,
  ea: /^(ea app|ea desktop|origin)\b/i,
  ubisoft: /^(ubisoft connect|uplay)\b/i,
  battlenet: /^battle\.net\b/i,
}
/** Smaller than this (when the entry says): a tool, not a game. */
export const MIN_GAME_KB = 25 * 1024

/** Whether an entry of that store is a game (not the store's app, a tool, an SDK). */
export function looksLikeGame(store: LauncherStore, title: string, sizeKb?: number): boolean {
  if (STORE_APPS[store].test(title) || NOT_A_GAME.test(title)) return false
  if (store !== 'ubisoft' && sizeKb !== undefined && sizeKb > 0 && sizeKb < MIN_GAME_KB) return false
  return true
}

function storeOf(app: InstalledAppLike): LauncherStore | null {
  if (/^Uplay Install \d+$/i.test(app.uninstallKey)) return 'ubisoft'
  const publisher = app.publisher ?? ''
  if (/^Rockstar Games\b/i.test(publisher)) return 'rockstar'
  if (/^Electronic Arts\b/i.test(publisher)) return 'ea'
  if (/^Blizzard Entertainment\b/i.test(publisher)) return 'battlenet'
  return null
}

const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLocaleLowerCase()
/** inside(child, parent): the same folder or below it. */
function inside(child: string, parent: string): boolean {
  const c = norm(child)
  const p = norm(parent)
  return c === p || c.startsWith(p + '\\')
}

/**
 * The launcher stores' games in GEM Shell's list. skipDirs: the folders of games found in Steam or Epic (and their
 * libraries): an entry inside one is left out.
 */
export function pickLauncherGames(apps: InstalledAppLike[], skipDirs: string[] = []): LauncherGame[] {
  const out: LauncherGame[] = []
  const seen = new Set<string>()
  for (const app of apps) {
    const store = storeOf(app)
    if (!store) continue
    if (/^Steam App \d+$/i.test(app.uninstallKey)) continue
    const title = app.name.replace(/\s+/g, ' ').trim()
    if (!title) continue
    if (!looksLikeGame(store, title, app.sizeKb)) continue
    const installDir = app.installLocation?.trim() || undefined
    if (installDir && skipDirs.some(d => d && inside(installDir, d))) continue
    const exe = app.displayIcon && /\.exe$/i.test(app.displayIcon) ? app.displayIcon : undefined
    const ubisoftId = store === 'ubisoft' ? /(\d+)$/.exec(app.uninstallKey)?.[1] : undefined
    const id = ubisoftId ?? app.uninstallKey
    const key = `${store}:${id.toLocaleLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      store, id, title, installDir, exe, ubisoftId,
      sizeOnDisk: app.sizeKb && app.sizeKb > 0 ? app.sizeKb * 1024 : undefined,
    })
  }
  return out
}

export const UBISOFT_SCHEME = 'uplay'
export const ubisoftLaunchUri = (id: string) => `uplay://launch/${id}/0`
