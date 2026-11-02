// widgets/game-library/stores/curseforge.ts
//
// CurseForge's Minecraft modpacks (0.12.0): each instance a box of its own. CurseForge keeps them in its "modding
// folder" (Settings ▸ Minecraft), <root>\Instances\<instance>\minecraftinstance.json: the name, Minecraft's version,
// the mod loader, the last play, the time played, a picture (one set by the user, or the modpack's). The root is
// found on any computer: the Game Shop's setting, else the one CurseForge's own settings name
// (%APPDATA%\CurseForge\storage.json, "minecraft-settings".minecraftRoot), else its usual place
// (%USERPROFILE%\curseforge\minecraft). Pure: tested on files shaped like real ones.
// CurseForge has no link that starts one instance: Play opens CurseForge (its program, from Windows' installed
// programs), where the user presses Play. A modpack's box says what it is (MODPACK_KIND), for another widget (a
// modpack manager) to offer its own menu items on it.

export const CURSEFORGE_SETTINGS = '%APPDATA%\\CurseForge\\storage.json'
export const CURSEFORGE_USUAL_ROOT = '%USERPROFILE%\\curseforge\\minecraft'
/** What a modpack's box is, for the widgets that offer things for one. */
export const MODPACK_KIND = 'minecraft.modpack'

export type CurseForgeInstance = {
  /** CurseForge's id for the instance. */
  guid: string
  name: string
  installDir: string
  /** "1.20.1" */
  minecraft?: string
  /** "Forge", "NeoForge", "Fabric", "Quilt"; with its version. */
  loader?: string
  loaderVersion?: string
  /** ms since 1970 */
  lastPlayed?: number
  playtimeMinutes?: number
  /** A picture: a file the user set, or the modpack's own (https). */
  image?: string
  /** The modpack it was installed from, if any (CurseForge's project). */
  modpack?: { id: number; name: string; version?: string }
}

/** storage.json's Minecraft root (CurseForge's modding folder), if it names one. */
export function rootFromSettings(text: string): string | undefined {
  try {
    const all = JSON.parse(text.replace(/^﻿/, ''))
    const raw = all?.['minecraft-settings']
    const settings = typeof raw === 'string' ? JSON.parse(raw) : raw
    const root = settings?.minecraftRoot
    return typeof root === 'string' && root.trim() ? root.trim() : undefined
  } catch {
    return undefined
  }
}

const LOADERS: Array<[RegExp, string]> = [[/^neoforge/i, 'NeoForge'], [/^forge/i, 'Forge'], [/^fabric/i, 'Fabric'], [/^quilt/i, 'Quilt']]

/** "forge-47.2.1" → Forge 47.2.1, "neoforge-21.1.233" → NeoForge 21.1.233, "fabric-0.15.7-1.20.1" → Fabric 0.15.7. */
export function loaderOf(name: string | undefined): { loader?: string; version?: string } {
  if (!name) return {}
  for (const [re, label] of LOADERS) {
    if (!re.test(name)) continue
    const version = /-(\d+(?:\.\d+)+)/.exec(name)?.[1]
    return { loader: label, version }
  }
  return {}
}

const time = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined
  const ms = Date.parse(v)
  return Number.isFinite(ms) && ms > Date.UTC(2000, 0, 1) ? ms : undefined
}

/** minecraftinstance.json, read; null when it isn't a Minecraft instance (or is broken). */
export function parseInstance(text: string, folder: string): CurseForgeInstance | null {
  let raw: any
  try { raw = JSON.parse(text.replace(/^﻿/, '')) } catch { return null }
  if (!raw || typeof raw !== 'object') return null
  if (raw.gameTypeID !== undefined && raw.gameTypeID !== 432) return null   // 432: Minecraft
  if (raw.isValid === false || raw.isEnabled === false) return null
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 200) : folder.split(/[\\/]/).filter(Boolean).pop() ?? ''
  if (!name) return null
  const guid = typeof raw.guid === 'string' && /^[0-9a-f-]{36}$/i.test(raw.guid) ? raw.guid.toLowerCase() : `folder:${folder.toLowerCase()}`
  const { loader, version } = loaderOf(raw.baseModLoader?.name)
  // timePlayed: milliseconds (931 plays, 2,750,565,673: 764 hours)
  const played = typeof raw.timePlayed === 'number' && raw.timePlayed > 0 ? Math.round(raw.timePlayed / 60000) : undefined
  const pack = raw.installedModpack
  const image = typeof raw.profileImagePath === 'string' && raw.profileImagePath.trim() ? raw.profileImagePath.trim()
    : typeof pack?.thumbnailUrl === 'string' && /^https:\/\//i.test(pack.thumbnailUrl) ? pack.thumbnailUrl : undefined
  return {
    guid,
    name,
    installDir: folder.replace(/[\\/]+$/, ''),
    minecraft: typeof raw.gameVersion === 'string' && raw.gameVersion ? raw.gameVersion : undefined,
    loader,
    loaderVersion: version,
    lastPlayed: time(raw.lastPlayed),
    playtimeMinutes: played || undefined,
    image,
    modpack: pack && typeof pack === 'object' && typeof pack.addonID === 'number' && pack.addonID > 0
      ? { id: pack.addonID, name: typeof pack.name === 'string' ? pack.name : name, version: typeof pack.installedFile?.displayName === 'string' ? pack.installedFile.displayName : undefined }
      : undefined,
  }
}

/** "Minecraft 1.20.1 · Forge 47.2.1" */
export function instanceLine(i: Pick<CurseForgeInstance, 'minecraft' | 'loader' | 'loaderVersion'>): string {
  return [i.minecraft ? `Minecraft ${i.minecraft}` : 'Minecraft', i.loader ? [i.loader, i.loaderVersion].filter(Boolean).join(' ') : undefined].filter(Boolean).join(' · ')
}

/** The newest screenshot of an instance (Minecraft names them by date: the last by name). */
export function newestScreenshot(names: string[]): string | undefined {
  return names.filter(n => /\.(png|jpe?g)$/i.test(n)).sort().pop()
}
