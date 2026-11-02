import assert from 'node:assert/strict'
import { test } from 'node:test'
import { instanceLine, loaderOf, newestScreenshot, parseInstance, rootFromSettings } from '../stores/curseforge.ts'
import { curseforgeRootOf, scanGames, steamFolderOf, type FileEntry, type FilePort } from '../scan.ts'
import { isInstalled, playableRelease } from '../games.ts'

const INSTANCE = JSON.stringify({
  baseModLoader: { forgeVersion: '21.1.233', name: 'neoforge-21.1.233', type: 6 },
  lastPlayed: '2026-09-28T20:48:09.589Z', playedCount: 931, timePlayed: 2750565673,
  installedModpack: null, profileImagePath: null, guid: '5F515202-3651-4441-BEDA-9451A9CEBC36', gameTypeID: 432,
  installPath: 'D:\\Games\\Minecraft_Instances\\Instances\\1.21.1_Neoforge_ModMaking\\', name: '1.21.1_Neoforge_ModMaking',
  isValid: true, isEnabled: true, gameVersion: '1.21.1', installedAddons: [{ name: 'Create' }],
})

test('curseforge: an instance read (its loader, version, last play and time played)', () => {
  const i = parseInstance(INSTANCE, 'D:\\Games\\Minecraft_Instances\\Instances\\1.21.1_Neoforge_ModMaking\\')!
  assert.equal(i.guid, '5f515202-3651-4441-beda-9451a9cebc36')
  assert.equal(i.name, '1.21.1_Neoforge_ModMaking')
  assert.equal(i.loader, 'NeoForge')
  assert.equal(i.loaderVersion, '21.1.233')
  assert.equal(i.minecraft, '1.21.1')
  assert.equal(i.lastPlayed, Date.parse('2026-09-28T20:48:09.589Z'))
  assert.equal(i.playtimeMinutes, 45843)
  assert.equal(instanceLine(i), 'Minecraft 1.21.1 · NeoForge 21.1.233')
  assert.deepEqual(loaderOf('forge-47.2.1'), { loader: 'Forge', version: '47.2.1' })
  assert.deepEqual(loaderOf('fabric-0.15.7-1.20.1'), { loader: 'Fabric', version: '0.15.7' })
  assert.equal(parseInstance('{"gameTypeID": 1, "name": "WoW"}', 'x'), null, 'another game of CurseForge')
  assert.equal(parseInstance('not json', 'x'), null)
  const pack = parseInstance(JSON.stringify({ name: 'ATM9', gameTypeID: 432, installedModpack: { addonID: 715572, name: 'All the Mods 9', thumbnailUrl: 'https://media.forgecdn.net/avatars/1.png', installedFile: { displayName: 'ATM9-0.2.44' } } }), 'D:\\I\\ATM9')!
  assert.equal(pack.image, 'https://media.forgecdn.net/avatars/1.png')
  assert.deepEqual(pack.modpack, { id: 715572, name: 'All the Mods 9', version: 'ATM9-0.2.44' })
  assert.equal(newestScreenshot(['2024-01-02_10.00.00.png', '2025-03-01_09.00.00.png', 'notes.txt']), '2025-03-01_09.00.00.png')
})

test('curseforge: the modding folder CurseForge\'s own settings name', () => {
  const storage = JSON.stringify({ 'minecraft-settings': JSON.stringify({ minecraftRoot: 'D:\\Games\\Minecraft_Instances', preferredRelease: 0 }) })
  assert.equal(rootFromSettings(storage), 'D:\\Games\\Minecraft_Instances')
  assert.equal(rootFromSettings('{}'), undefined)
  assert.equal(rootFromSettings('broken'), undefined)
})

/** A tiny file system; %VARIABLES% expanded from a table. */
function fakeFs(files: Record<string, string>, vars: Record<string, string> = {}): FilePort {
  const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const all = Object.keys(files)
  return {
    async readText(path: string) {
      const hit = all.find(p => norm(p) === norm(path))
      if (hit === undefined) throw new Error(`${path}: not found`)
      return files[hit]
    },
    async list(path: string) {
      const dir = norm(path)
      const out = new Map<string, FileEntry>()
      for (const p of all) {
        if (!norm(p).startsWith(dir + '\\')) continue
        const rest = p.slice(dir.length + 1).split('\\')
        out.set(rest[0], { name: rest[0], path: `${path.replace(/\\+$/, '')}\\${rest[0]}`, dir: rest.length > 1 })
      }
      if (!out.size) throw new Error(`${path}: not found`)
      return [...out.values()]
    },
    async kind(path: string) {
      const dir = norm(path)
      if (all.some(p => norm(p) === dir)) return 'file'
      return all.some(p => norm(p).startsWith(dir + '\\')) ? 'dir' : null
    },
    async expand(path: string) {
      return path.replace(/%([^%]+)%/g, (m, v: string) => vars[v.toUpperCase()] ?? m)
    },
  }
}

test('curseforge: its instances found through its settings, on another drive, each its own box', async () => {
  const fs = fakeFs({
    'C:\\Users\\g\\AppData\\Roaming\\CurseForge\\storage.json': JSON.stringify({ 'minecraft-settings': JSON.stringify({ minecraftRoot: 'D:\\Games\\Minecraft_Instances' }) }),
    'D:\\Games\\Minecraft_Instances\\Instances\\ModMaking\\minecraftinstance.json': INSTANCE,
    'D:\\Games\\Minecraft_Instances\\Instances\\ModMaking\\screenshots\\2025-03-01_09.00.00.png': '',
    'D:\\Games\\Minecraft_Instances\\Instances\\Empty\\options.txt': '',
  }, { APPDATA: 'C:\\Users\\g\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\g' })
  assert.equal(await curseforgeRootOf(fs), 'D:\\Games\\Minecraft_Instances')
  const apps = { async list() { return { apps: [{ id: 'win32:hkcu:cf', kind: 'desktop' as const, name: 'CurseForge', publisher: 'Overwolf', displayIcon: 'C:\\Users\\g\\AppData\\Local\\Overwolf\\CurseForge.exe', uninstallKey: 'cf' }] } } }
  const off = { steam: false, epic: false, gog: false, rockstar: false, ea: false, ubisoft: false, battlenet: false, xbox: false }
  const result = await scanGames(fs, { stores: off }, apps)
  assert.equal(result.found.curseforge, 1)
  const box = result.games[0]
  assert.equal(box.title, '1.21.1_Neoforge_ModMaking')
  assert.deepEqual(box.genres, ['Minecraft modpacks'])
  assert.ok(box.art?.box?.endsWith('2025-03-01_09.00.00.png'), 'no picture of its own: its newest screenshot')
  assert.equal(box.releases[0].kind, 'minecraft.modpack')
  assert.equal(isInstalled(box), true)
  assert.deepEqual(playableRelease(box)?.launches[0], { kind: 'exe', path: 'C:\\Users\\g\\AppData\\Local\\Overwolf\\CurseForge.exe', launcher: 'CurseForge' })
})

test('folders: Steam found where Windows says it is, on any drive; then Program Files through its variable', async () => {
  const fs = fakeFs({ 'E:\\Valve\\Steam\\steam.exe': '', 'D:\\Programs (x86)\\Steam\\steam.exe': '' }, { 'PROGRAMFILES(X86)': 'D:\\Programs (x86)' })
  const programs = [{ id: 'x', name: 'Steam', publisher: 'Valve Corporation', displayIcon: 'E:\\Valve\\Steam\\steam.exe', uninstallKey: 'Steam' }]
  assert.equal(await steamFolderOf(fs, {}, programs), 'E:\\Valve\\Steam')
  assert.equal(await steamFolderOf(fs, {}, []), 'D:\\Programs (x86)\\Steam')
  assert.equal(await steamFolderOf(fs, { steamFolder: 'F:\\S' }, programs), 'F:\\S', 'the setting first')
})
