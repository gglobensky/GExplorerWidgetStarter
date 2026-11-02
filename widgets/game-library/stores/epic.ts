// widgets/game-library/stores/epic.ts
//
// What the Epic Games launcher says: one JSON file per installed app in
//   C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item
// Started through the launcher (com.epicgames.launcher://apps/<namespace>:<item>:<app>?action=launch, GEM
// Shell's app links), or straight from its exe when the game doesn't need an Epic sign-in (bRequiresAuth false).

export const EPIC_MANIFESTS_FOLDER = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

export type EpicGame = {
  /** The launcher's id for the app ("Kinglet"). */
  appName: string
  namespace: string
  catalogItemId: string
  title: string
  installDir: string
  /** The exe, full path (InstallLocation + LaunchExecutable). */
  exe: string
  /** Needs an Epic sign-in: only the launcher can start it. */
  requiresAuth: boolean
  sizeOnDisk: number
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * One .item file. Null for what isn't a playable game: DLC (MainGameAppName names another app), an incomplete
 * install, an app outside "games", or a file that isn't a manifest.
 */
export function parseEpicItem(text: string): EpicGame | null {
  let data: Record<string, unknown>
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const appName = str(data.AppName)
  const title = str(data.DisplayName)
  const installDir = str(data.InstallLocation).replace(/\//g, '\\').replace(/\\+$/, '')
  if (!appName || !title || !installDir) return null
  if (data.bIsIncompleteInstall === true) return null
  const main = str(data.MainGameAppName)
  if (main && main !== appName) return null                       // DLC of another app
  const categories = Array.isArray(data.AppCategories) ? data.AppCategories.map(String) : []
  if (categories.length && !categories.includes('games')) return null
  if (data.bIsExecutable === false) return null
  const launch = str(data.LaunchExecutable).replace(/\//g, '\\').replace(/^\\+/, '')
  return {
    appName,
    namespace: str(data.CatalogNamespace),
    catalogItemId: str(data.CatalogItemId),
    title,
    installDir,
    exe: launch ? `${installDir}\\${launch}` : '',
    requiresAuth: data.bRequiresAuth !== false,
    sizeOnDisk: typeof data.InstallSize === 'number' ? data.InstallSize : 0,
  }
}

/** The launcher's link that starts the game (silently: no launcher window when it can avoid one). */
export function epicLaunchUri(game: Pick<EpicGame, 'namespace' | 'catalogItemId' | 'appName'>): string {
  const id = [game.namespace, game.catalogItemId, game.appName].map(encodeURIComponent).join('%3A')
  return `com.epicgames.launcher://apps/${id}?action=launch&silent=true`
}

// ── The Epic games owned (0.13.0) ───────────────────────────────────────────────────────────────────────────────
// The Epic Games launcher keeps the catalog entries of the user's library in Data\Catalog\catcache.bin: base64 of a
// JSON list (games, their add-ons and DLC, engines, apps), each with its namespace, catalog id, the app name its
// install and launch links take (releaseInfo[].appId), its pictures (DieselGameBoxTall: the box) and description.
// The games of it not installed get a shrink-wrapped box with Install (the launcher's install link).

export type EpicOwned = {
  appName: string
  namespace: string
  catalogItemId: string
  title: string
  developer?: string
  description?: string
  /** https pictures: the tall box, the wide banner, the logo. */
  box?: string
  hero?: string
  logo?: string
}

/** catcache.bin's games for Windows (not add-ons, DLC, engines or apps); [] when it can't be read. */
export function parseCatalogCache(text: string): EpicOwned[] {
  let list: any
  try {
    const raw = text.trim()
    const json = raw.startsWith('[') ? raw : decodeBase64(raw)
    list = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  const out: EpicOwned[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const paths = new Set((Array.isArray(item.categories) ? item.categories : []).map((c: any) => c?.path))
    if (!paths.has('games') || paths.has('addons') || paths.has('digitalextras')) continue
    if (item.mainGameItem && typeof item.mainGameItem === 'object' && item.mainGameItem.id) continue   // a DLC
    const release = (Array.isArray(item.releaseInfo) ? item.releaseInfo : [])
      .find((r: any) => typeof r?.appId === 'string' && (!Array.isArray(r.platform) || r.platform.includes('Windows')))
    if (!release || typeof item.title !== 'string' || typeof item.namespace !== 'string' || typeof item.id !== 'string') continue
    if (seen.has(release.appId)) continue
    seen.add(release.appId)
    const image = (type: string) => (Array.isArray(item.keyImages) ? item.keyImages : [])
      .find((k: any) => k?.type === type && typeof k.url === 'string' && /^https:\/\//i.test(k.url))?.url as string | undefined
    out.push({
      appName: release.appId,
      namespace: item.namespace,
      catalogItemId: item.id,
      title: item.title.trim().slice(0, 200),
      developer: typeof item.developer === 'string' && item.developer.trim() ? item.developer.trim() : undefined,
      description: typeof item.description === 'string' && item.description.trim() && item.description.trim() !== item.title.trim() ? item.description.trim().slice(0, 900) : undefined,
      box: image('DieselGameBoxTall') ?? image('OfferImageTall'),
      hero: image('DieselGameBox') ?? image('DieselGameBoxWide') ?? image('OfferImageWide'),
      logo: image('DieselGameBoxLogo'),
    })
  }
  return out
}

/** base64 → text (UTF-8), in Node and in the browser. */
function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** The launcher's install window for a game owned and not installed. */
export function epicInstallUri(game: Pick<EpicOwned, 'namespace' | 'catalogItemId' | 'appName'>): string {
  const id = [game.namespace, game.catalogItemId, game.appName].map(encodeURIComponent).join('%3A')
  return `com.epicgames.launcher://apps/${id}?action=install`
}
