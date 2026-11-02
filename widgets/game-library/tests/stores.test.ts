import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseVdf, vdfNumber, vdfString } from '../stores/vdf.ts'
import { chooseSteamArt, isSteamTool, parseAppManifest, parseLibraryFolders, steamRunUri } from '../stores/steam.ts'
import { epicLaunchUri, parseEpicItem } from '../stores/epic.ts'
import { parseGogInfo } from '../stores/gog.ts'

// Fixtures: trimmed copies of real files (Guillaume's Steam and Epic, 2026-10-31; ids and tokens removed).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

test('vdf: nested blocks, escapes, comments, any key case', () => {
  const v = parseVdf('// header\n"A"\n{\n\t"Path"\t\t"C:\\\\Games\\\\x"\n\t"n"  "42"\n\t"inner" { "k" "v" }\n}\n')
  assert.equal(vdfString(v, 'a', 'path'), 'C:\\Games\\x')
  assert.equal(vdfNumber(v, 'A', 'n'), 42)
  assert.equal(vdfString(v, 'A', 'inner', 'K'), 'v')
  assert.equal(vdfString(v, 'A', 'missing'), undefined)
})

test('vdf: a broken file gives what was read', () => {
  const v = parseVdf('"A" { "x" "1" "B" { "y" "2"')
  assert.equal(vdfString(v, 'A', 'x'), '1')
  assert.equal(vdfString(v, 'A', 'B', 'y'), '2')
})

test('steam: libraryfolders.vdf lists every library and its apps', () => {
  const libs = parseLibraryFolders(fixture('libraryfolders.vdf'))
  assert.deepEqual(libs.map(l => l.path), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary'])
  assert.ok(libs[0].appIds.includes('620'))
  assert.ok(libs[1].appIds.includes('1091500'))
})

test('steam: an app manifest gives the name, folder, state and last play', () => {
  const app = parseAppManifest(fixture('appmanifest_620.acf'), 'C:\\Program Files (x86)\\Steam\\')
  assert.ok(app)
  assert.equal(app.appId, '620')
  assert.equal(app.name, 'Portal 2')
  assert.equal(app.installDir, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Portal 2')
  assert.equal(app.installed, true)
  assert.equal(app.lastPlayed, 1771903693 * 1000)
  assert.equal(steamRunUri(app.appId), 'steam://rungameid/620')
})

test('steam: a game still downloading is not installed; garbage is not a manifest', () => {
  const app = parseAppManifest('"AppState" { "appid" "5" "name" "X" "StateFlags" "1026" "installdir" "X" }', 'D:\\L')
  assert.equal(app?.installed, false)
  assert.equal(parseAppManifest('nothing here', 'D:\\L'), null)
})

test('steam: tools and runtimes are not games', () => {
  const redist = parseAppManifest(fixture('appmanifest_228980.acf'), 'C:\\S')!
  assert.equal(isSteamTool(redist.appId, redist.name), true)
  assert.equal(isSteamTool('1493710', 'Proton Experimental'), true)
  assert.equal(isSteamTool('1628350', 'Steam Linux Runtime 3.0 (sniper)'), true)
  assert.equal(isSteamTool('620', 'Portal 2'), false)
  assert.equal(isSteamTool('244850', 'Space Engineers'), false)
})

test('steam: the box, hero and logo from librarycache, at any depth', () => {
  // Steam's layout in Guillaume's cache: 620 has the box at its top, 244850 only a capsule in a hash folder
  const portal = chooseSteamArt(['C:\\c\\620\\25a5.jpg', 'C:\\c\\620\\library_600x900.jpg', 'C:\\c\\620\\logo.png', 'C:\\c\\620\\a585\\library_hero.jpg', 'C:\\c\\620\\faff\\library_header.jpg'])
  assert.equal(portal.box, 'C:\\c\\620\\library_600x900.jpg')
  assert.equal(portal.hero, 'C:\\c\\620\\a585\\library_hero.jpg')
  assert.equal(portal.logo, 'C:\\c\\620\\logo.png')
  const se = chooseSteamArt(['C:\\c\\244850\\a2c6\\library_capsule.jpg', 'C:\\c\\244850\\5584\\logo.png', 'C:\\c\\244850\\fc21\\library_hero_blur.jpg'])
  assert.equal(se.box, 'C:\\c\\244850\\a2c6\\library_capsule.jpg')
  assert.equal(se.hero, undefined)                                   // the blurred hero isn't the hero
  assert.equal(chooseSteamArt(['x\\library_600x900.jpg', 'x\\library_600x900_2x.jpg']).box, 'x\\library_600x900_2x.jpg')
})

test('epic: a manifest gives the title, folder, exe and launch link', () => {
  const civ = parseEpicItem(fixture('epic-sid-meier-s-civilization-vi.item'))
  assert.ok(civ)
  assert.equal(civ.title, "Sid Meier's Civilization VI")
  assert.equal(civ.installDir, 'C:\\Program Files\\Epic Games\\SidMeiersCivilizationVI')
  assert.equal(civ.exe, 'C:\\Program Files\\Epic Games\\SidMeiersCivilizationVI\\Base\\Binaries\\Win64EOS\\Civ6_Launcher.exe')
  assert.equal(civ.requiresAuth, true)
  assert.equal(epicLaunchUri(civ), 'com.epicgames.launcher://apps/cd14dcaa4f3443f19f7169a980559c62%3A42ac1ee840304cb1807172a9b47dc8e3%3AKinglet?action=launch&silent=true')
  assert.equal(parseEpicItem(fixture('epic-dead-island-2.item'))?.exe, 'D:\\Games\\DeadIsland2\\DeadIsland.exe')
})

test('epic: DLC, broken files and incomplete installs are left out', () => {
  assert.equal(parseEpicItem(fixture('epic-dlc.item')), null)
  assert.equal(parseEpicItem('{ not json'), null)
  const incomplete = JSON.parse(fixture('epic-dead-island-2.item'))
  incomplete.bIsIncompleteInstall = true
  assert.equal(parseEpicItem(JSON.stringify(incomplete)), null)
})

test('gog: the primary game task becomes the exe', () => {
  const ut = parseGogInfo(fixture('goggame-1207658691.info'), 'C:\\GOG Games\\UT2004\\')
  assert.ok(ut)
  assert.equal(ut.title, "Unreal Tournament 2004 Editor's Choice Edition")
  assert.equal(ut.exe, 'C:\\GOG Games\\UT2004\\System\\UT2004.exe')
  assert.equal(parseGogInfo('{"gameId":"2","name":"DLC","rootGameId":"1","playTasks":[{"isPrimary":true,"path":"a.exe"}]}', 'C:\\x'), null)
  assert.equal(parseGogInfo('{"gameId":"3","name":"Docs only","playTasks":[{"type":"URLTask","link":"https://gog.com"}]}', 'C:\\x'), null)
})

test('epic: the games owned, from the launcher\'s catalog cache (base64 JSON); add-ons, DLC and engines left out', async () => {
  const { parseCatalogCache, epicInstallUri } = await import('../stores/epic.ts')
  const items = [
    { id: 'c1', namespace: 'wombat', title: 'World War Z', developer: 'Saber', description: 'Zombies.', categories: [{ path: 'games' }, { path: 'applications' }], releaseInfo: [{ appId: 'Wombat', platform: ['Windows'] }], keyImages: [{ type: 'DieselGameBoxTall', url: 'https://cdn1.epicgames.com/wombat/tall.jpg' }, { type: 'DieselGameBox', url: 'https://cdn1.epicgames.com/wombat/wide.jpg' }], mainGameItem: { namespace: '', id: '' } },
    { id: 'c2', namespace: 'wombat', title: 'World War Z - DLC', categories: [{ path: 'games' }, { path: 'addons' }], releaseInfo: [{ appId: 'WombatDlc' }] },
    { id: 'c3', namespace: 'wombat', title: 'Season pass', categories: [{ path: 'games' }], releaseInfo: [{ appId: 'Pass' }], mainGameItem: { namespace: 'wombat', id: 'c1' } },
    { id: 'c4', namespace: 'ue', title: 'Unreal Engine', categories: [{ path: 'engines' }], releaseInfo: [{ appId: 'UE_5.1' }] },
    { id: 'c5', namespace: 'mac', title: 'Mac only', categories: [{ path: 'games' }], releaseInfo: [{ appId: 'MacOnly', platform: ['Mac'] }] },
  ]
  const text = Buffer.from(JSON.stringify(items)).toString('base64')
  const owned = parseCatalogCache(text)
  assert.deepEqual(owned.map(g => g.title), ['World War Z'])
  assert.equal(owned[0].box, 'https://cdn1.epicgames.com/wombat/tall.jpg')
  assert.equal(owned[0].hero, 'https://cdn1.epicgames.com/wombat/wide.jpg')
  assert.equal(epicInstallUri(owned[0]), 'com.epicgames.launcher://apps/wombat%3Ac1%3AWombat?action=install')
  assert.deepEqual(parseCatalogCache('not base64 at all'), [])
})
