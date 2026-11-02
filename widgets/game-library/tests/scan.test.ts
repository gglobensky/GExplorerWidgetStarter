import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { manualRelease, mergeReleases, playableRelease, recentlyPlayed, titleKey, gogRelease } from '../games.ts'
import { scanGames, type AppsPort, type FileEntry, type FilePort } from '../scan.ts'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** An in-memory computer: paths to file contents ('' for a file whose content doesn't matter). */
function memoryPort(files: Record<string, string>): FilePort {
  const norm = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase()
  const all = Object.keys(files)
  return {
    async list(path) {
      const dir = norm(path)
      const out = new Map<string, FileEntry>()
      for (const f of all) {
        if (!f.toLowerCase().startsWith(dir + '\\')) continue
        const rest = f.slice(dir.length + 1)
        const [name, ...more] = rest.split('\\')
        out.set(name, { name, path: `${path.replace(/[\\/]+$/, '')}\\${name}`, dir: more.length > 0 })
      }
      if (!out.size) throw new Error('not found')
      return [...out.values()]
    },
    async readText(path) {
      const hit = all.find(f => f.toLowerCase() === path.toLowerCase())
      if (hit === undefined) throw new Error('not found')
      return files[hit]
    },
    async kind(path) {
      const p = norm(path)
      if (all.some(f => f.toLowerCase() === p)) return 'file'
      return all.some(f => f.toLowerCase().startsWith(p + '\\')) ? 'dir' : null
    },
  }
}

const STEAM = 'C:\\Program Files (x86)\\Steam'
const computer = () => memoryPort({
  [`${STEAM}\\steamapps\\libraryfolders.vdf`]: fixture('libraryfolders.vdf'),
  [`${STEAM}\\steamapps\\appmanifest_620.acf`]: fixture('appmanifest_620.acf'),
  [`${STEAM}\\steamapps\\appmanifest_228980.acf`]: fixture('appmanifest_228980.acf'),
  [`${STEAM}\\steamapps\\appmanifest_244850.acf`]: fixture('appmanifest_244850.acf'),
  'D:\\SteamLibrary\\steamapps\\appmanifest_1169040.acf': fixture('appmanifest_1169040.acf'),
  [`${STEAM}\\appcache\\librarycache\\620\\library_600x900.jpg`]: '',
  [`${STEAM}\\appcache\\librarycache\\620\\a585\\library_hero.jpg`]: '',
  [`${STEAM}\\appcache\\librarycache\\244850\\a2c6\\library_capsule.jpg`]: '',
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\A.item': fixture('epic-sid-meier-s-civilization-vi.item'),
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\B.item': fixture('epic-dlc.item'),
  'E:\\Games\\UT2004\\goggame-1207658691.info': fixture('goggame-1207658691.info'),
})

test('scan: Steam (both libraries, tools left out, art), Epic, GOG in a folder of yours', async () => {
  const result = await scanGames(computer(), { gameFolders: ['E:\\Games'] })
  const titles = result.games.map(g => g.title).sort()
  assert.deepEqual(titles, ['Necesse', 'Portal 2', "Sid Meier's Civilization VI", 'Space Engineers', "Unreal Tournament 2004 Editor's Choice Edition"])
  assert.deepEqual(result.found, { steam: 3, epic: 1, gog: 1, rockstar: 0, ea: 0, ubisoft: 0, battlenet: 0, xbox: 0, curseforge: 0, manual: 0 })
  const portal = result.games.find(g => g.title === 'Portal 2')!
  assert.equal(portal.art?.box, `${STEAM}\\appcache\\librarycache\\620\\library_600x900.jpg`)
  assert.equal(portal.art?.hero, `${STEAM}\\appcache\\librarycache\\620\\a585\\library_hero.jpg`)
  assert.equal(result.games.find(g => g.title === 'Space Engineers')!.art?.box, `${STEAM}\\appcache\\librarycache\\244850\\a2c6\\library_capsule.jpg`)
  assert.equal(portal.releases[0].launches[0].kind, 'link')
  const ut = result.games.find(g => g.title.startsWith('Unreal'))!
  assert.deepEqual(ut.releases[0].launches, [{ kind: 'exe', path: 'E:\\Games\\UT2004\\System\\UT2004.exe' }])
})

test('scan: a store that is not installed is skipped quietly; a folder you gave that is missing is a warning', async () => {
  const empty = memoryPort({ 'C:\\x\\y.txt': '' })
  const quiet = await scanGames(empty)
  assert.equal(quiet.games.length, 0)
  assert.deepEqual(quiet.warnings, [])
  const loud = await scanGames(empty, { steamFolder: 'F:\\Steam', gameFolders: ['G:\\Nowhere'] })
  assert.equal(loud.warnings.length, 2)
})

test('scan: a Steam library that is gone (an unplugged drive) leaves the others', async () => {
  const files = computer()
  const result = await scanGames({ ...files, list: p => p.startsWith('D:') ? Promise.reject(new Error('drive not ready')) : files.list(p) })
  assert.ok(result.games.some(g => g.title === 'Portal 2'))
  assert.ok(!result.games.some(g => g.title === 'Necesse'))
  assert.match(result.warnings.join('\n'), /D:\\SteamLibrary.*drive not ready/)
})

test('games: the same game in two stores is one box, Steam first', () => {
  const games = mergeReleases([
    gogRelease({ gameId: '1', title: 'PORTAL 2™', installDir: 'E:\\P2', exe: 'E:\\P2\\portal2.exe', args: '' }),
    { store: 'steam', storeId: '620', title: 'Portal 2', installed: true, lastPlayed: 5, launches: [{ kind: 'link', uri: 'steam://rungameid/620', scheme: 'steam', launcher: 'Steam' }] },
    manualRelease('C:\\Games\\Other\\other.exe', 'Other'),
  ])
  assert.equal(games.length, 2)
  const portal = games.find(g => g.id === 'game:portal 2')!
  assert.deepEqual(portal.releases.map(r => r.store), ['steam', 'gog'])
  assert.equal(portal.title, 'Portal 2')
  assert.equal(portal.lastPlayedAt, 5)
  assert.equal(playableRelease(portal)?.store, 'steam')
  assert.equal(playableRelease({ ...portal, preferredStore: 'gog' })?.store, 'gog')
})

test('games: titles match without case, marks, accents or "The"', () => {
  assert.equal(titleKey('The Witcher® 3: Wild Hunt'), titleKey('witcher 3 wild hunt'))
  assert.equal(titleKey('Pokémon'), titleKey('Pokemon'))
  assert.equal(titleKey('Ratchet & Clank'), titleKey('Ratchet and Clank'))
  assert.notEqual(titleKey('Portal'), titleKey('Portal 2'))
})

test('games: recently played, most recent first, never-played left out', () => {
  const games = mergeReleases([
    { store: 'steam', storeId: '1', title: 'A', installed: true, lastPlayed: 10, launches: [] },
    { store: 'steam', storeId: '2', title: 'B', installed: true, lastPlayed: 30, launches: [] },
    { store: 'steam', storeId: '3', title: 'C', installed: true, launches: [] },
  ])
  assert.deepEqual(recentlyPlayed(games).map(g => g.title), ['B', 'A'])
})

// ── 0.8.0: the stores found in Windows' installed programs, and Xbox ─────────────────────────────────────────────
const MINECRAFT_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="0">
  <!-- trimmed -->
  <Identity Name="Microsoft.4297127D64EC6" Publisher="CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" Version="1.0.0.0" />
  <ExecutableList><Executable Name="Minecraft.exe" Id="Minecraft" TargetDeviceFamily="PC" /></ExecutableList>
  <ShellVisuals DefaultDisplayName="Minecraft Launcher" PublisherDisplayName="Microsoft Studios" StoreLogo="Images\\StoreLogo.png" Square150x150Logo="Images\\Square150x150Logo.png" />
</Game>`

const apps = (list: Parameters<typeof Array.prototype.push>[0][]): AppsPort => ({ list: async () => ({ apps: list as any }) })

test('scan: Rockstar from the installed programs, Xbox from its games folder, with how each starts', async () => {
  const fs = memoryPort({
    'C:\\XboxGames\\Minecraft Launcher\\Content\\MicrosoftGame.config': MINECRAFT_CONFIG,
    'C:\\XboxGames\\GameSave\\x.dat': '',
  })
  const result = await scanGames(fs, {}, apps([
    { id: 'win32:hklm:Rockstar Games Launcher', name: 'Rockstar Games Launcher', publisher: 'Rockstar Games', uninstallKey: 'Rockstar Games Launcher' },
    { id: 'win32:hklm:RDR2', name: 'Red Dead Redemption 2', publisher: 'Rockstar Games', installLocation: 'C:\\Program Files\\Rockstar Games\\Red Dead Redemption 2', displayIcon: 'C:\\Program Files\\Rockstar Games\\Red Dead Redemption 2\\RDR2.exe', sizeKb: 120 * 1024 * 1024, uninstallKey: '{D1D1-RDR2}' },
    { id: 'win32:hklm:7zip', name: '7-Zip 23.01', publisher: 'Igor Pavlov', uninstallKey: '7-Zip' },
  ]))
  assert.equal(result.found.rockstar, 1)
  assert.equal(result.found.xbox, 1)
  const rdr2 = result.games.find(g => g.title === 'Red Dead Redemption 2')!.releases[0]
  assert.equal(rdr2.store, 'rockstar')
  assert.deepEqual(rdr2.launches, [{ kind: 'exe', path: 'C:\\Program Files\\Rockstar Games\\Red Dead Redemption 2\\RDR2.exe', launcher: 'Rockstar Games' }])
  const mc = result.games.find(g => g.title === 'Minecraft Launcher')!
  assert.deepEqual(mc.releases[0].launches, [{ kind: 'app', appId: 'Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft', launcher: 'Xbox' }])
  assert.equal(mc.art?.logo, 'C:\\XboxGames\\Minecraft Launcher\\Content\\Images\\Square150x150Logo.png')
  assert.ok(!result.games.some(g => /launcher$/i.test(g.title) && g.releases[0].store === 'rockstar'))
})

test('scan: a Rockstar entry in a Steam game\'s folder is the Steam game; no installed programs: those stores skipped with a word', async () => {
  const withSteam = await scanGames(computer(), { stores: { xbox: false } }, apps([
    { id: 'x', name: 'Portal 2', publisher: 'Rockstar Games', installLocation: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Portal 2', uninstallKey: 'x' },
  ]))
  assert.equal(withSteam.found.rockstar, 0)
  const refused = await scanGames(computer(), { stores: { xbox: false } }, { list: async () => ({ error: 'not allowed' }) })
  assert.ok(refused.warnings.some(w => /Installed programs: not allowed/.test(w)))
  assert.equal(refused.found.steam, 3)
})

test('scan: the Xbox games folders of every drive, from the Store apps GEM Shell lists (0.11.2)', async () => {
  const { xboxRootsOf } = await import('../scan.ts')
  const apps = [
    { id: 'store:a', kind: 'store' as const, name: 'Forza Horizon 5', installLocation: 'D:\\XboxGames\\Forza Horizon 5\\Content', uninstallKey: '', appId: 'Microsoft.624F8B84B80_8wekyb3d8bbwe!Game' },
    { id: 'store:b', kind: 'store' as const, name: 'Hi-Fi Rush', installLocation: 'E:\\Games\\Hi-Fi RUSH\\Content\\', uninstallKey: '', appId: 'X_8wekyb3d8bbwe!Game' },
    { id: 'store:c', kind: 'store' as const, name: 'Calculator', installLocation: 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsCalculator_11.2_x64__8wekyb3d8bbwe', uninstallKey: '', appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
    { id: 'store:d', kind: 'store' as const, name: 'Game', installLocation: 'D:\\XboxGames\\Other\\Content', uninstallKey: '' },
    { id: 'win32:x', kind: 'desktop' as const, name: 'Thing', installLocation: 'F:\\X\\Y\\Content', uninstallKey: 'x' },
  ]
  assert.deepEqual(xboxRootsOf(apps), ['D:\\XboxGames', 'E:\\Games'])
})
