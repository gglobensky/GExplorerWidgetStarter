import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { launcherRelease } from '../games.ts'
import { launcherNote } from '../launch.ts'
import { looksLikeGame, pickLauncherGames, type InstalledAppLike } from '../stores/launchers.ts'
import { parseGameConfig, publisherId, titleFromFolder, xboxAppId } from '../stores/xbox.ts'

const app = (over: Partial<InstalledAppLike>): InstalledAppLike => ({ id: over.uninstallKey ?? 'k', name: 'X', uninstallKey: 'k', ...over })

test('launchers: each store by its entry, their own apps and tools left out', () => {
  const games = pickLauncherGames([
    app({ name: 'Red Dead Redemption 2', publisher: 'Rockstar Games', uninstallKey: '{RDR2}', displayIcon: 'C:\\R\\RDR2.exe', installLocation: 'C:\\R' }),
    app({ name: 'Rockstar Games Launcher', publisher: 'Rockstar Games', uninstallKey: 'RGL' }),
    app({ name: 'Rockstar Games Social Club', publisher: 'Rockstar Games', uninstallKey: 'SC' }),
    app({ name: 'EA app', publisher: 'Electronic Arts', uninstallKey: 'EA' }),
    app({ name: 'Battlefield 2042', publisher: 'Electronic Arts', uninstallKey: '{BF}', displayIcon: 'D:\\BF\\BF2042.exe' }),
    app({ name: 'Assassin\'s Creed Valhalla', publisher: 'Ubisoft', uninstallKey: 'Uplay Install 13504' }),
    app({ name: 'Battle.net', publisher: 'Blizzard Entertainment', uninstallKey: 'Battle.net' }),
    app({ name: 'Diablo IV', publisher: 'Blizzard Entertainment', uninstallKey: 'Diablo IV', displayIcon: 'E:\\D4\\Diablo IV Launcher.exe' }),
    app({ name: 'Notepad++', publisher: 'Notepad++ Team', uninstallKey: 'Notepad++' }),
  ])
  assert.deepEqual(games.map(g => [g.store, g.title]), [
    ['rockstar', 'Red Dead Redemption 2'], ['ea', 'Battlefield 2042'], ['ubisoft', "Assassin's Creed Valhalla"], ['battlenet', 'Diablo IV'],
  ])
  assert.equal(games[2].ubisoftId, '13504')
})

test('launchers: how each starts, and what Play says', () => {
  const [rdr2, ac] = pickLauncherGames([
    app({ name: 'Red Dead Redemption 2', publisher: 'Rockstar Games', uninstallKey: '{RDR2}', displayIcon: 'C:\\R\\RDR2.exe' }),
    app({ name: 'AC', publisher: 'Ubisoft', uninstallKey: 'Uplay Install 7' }),
  ]).map(launcherRelease)
  assert.equal(launcherNote(rdr2), 'Starts Rockstar Games')
  assert.deepEqual(ac.launches, [{ kind: 'link', uri: 'uplay://launch/7/0', scheme: 'uplay', launcher: 'Ubisoft Connect' }])
  assert.equal(launcherNote(ac), 'Starts Ubisoft Connect')
})

test('launchers: an entry inside a Steam or Epic folder is skipped (the same game sold there)', () => {
  const games = pickLauncherGames([
    app({ name: 'Red Dead Redemption 2', publisher: 'Rockstar Games', uninstallKey: 'R', installLocation: 'D:\\SteamLibrary\\steamapps\\common\\Red Dead Redemption 2\\' }),
    app({ name: 'GTA V', publisher: 'Rockstar Games', uninstallKey: 'Steam App 271590' }),
  ], ['D:/SteamLibrary/steamapps/common/Red Dead Redemption 2'])
  assert.deepEqual(games, [])
})

const sha256 = async (d: Uint8Array) => { const h = createHash('sha256').update(d).digest(); return h.buffer.slice(h.byteOffset, h.byteOffset + h.byteLength) as ArrayBuffer }

test('xbox: the publisher id is Windows\' (Microsoft: 8wekyb3d8bbwe)', async () => {
  assert.equal(await publisherId('CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US', sha256), '8wekyb3d8bbwe')
  assert.equal(await publisherId('CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'), '8wekyb3d8bbwe')
})

test('xbox: MicrosoftGame.config gives the app id and the name; ms-resource names fall back to the folder', async () => {
  const config = parseGameConfig('\uFEFF<Game><Identity Name="Studio.Game" Publisher="CN=A &amp; B" /><ExecutableList><Executable Name="g.exe" Id="Game" /></ExecutableList><ShellVisuals DefaultDisplayName="ms-resource:Title" StoreLogo="Store.png" /></Game>')!
  assert.equal(config.publisher, 'CN=A & B')
  assert.equal(config.displayName, undefined)
  assert.match(await xboxAppId(config) ?? '', /^Studio\.Game_[0-9a-z]{13}!Game$/)
  assert.equal(titleFromFolder('C:\\XboxGames\\Forza Horizon 5\\Content'), 'Forza Horizon 5')
  assert.equal(parseGameConfig('<Package/>'), null)
  assert.equal(await xboxAppId({ ...config, executableId: undefined }), null)
})

test('launchers: the publishers\' tools are not games (by name, and by size when the entry gives it)', () => {
  const games = pickLauncherGames([
    app({ name: 'Rockstar Games SDK', publisher: 'Rockstar Games', uninstallKey: 'SDK' }),
    app({ name: 'Rockstar Games Launcher', publisher: 'Rockstar Games', uninstallKey: 'RGL' }),
    app({ name: 'EA Anti-Cheat', publisher: 'Electronic Arts', uninstallKey: 'EAAC' }),
    app({ name: 'Frostbite Runtime', publisher: 'Electronic Arts', uninstallKey: 'FB' }),
    app({ name: 'Small Thing', publisher: 'Electronic Arts', uninstallKey: 'ST', sizeKb: 10 * 1024 }),
    app({ name: 'Plants vs. Zombies', publisher: 'Electronic Arts', uninstallKey: 'PVZ', sizeKb: 70 * 1024 }),
    app({ name: 'Red Dead Redemption 2', publisher: 'Rockstar Games', uninstallKey: 'RDR2', sizeKb: 120 * 1024 * 1024 }),
    app({ name: 'Battlefield 2042', publisher: 'Electronic Arts', uninstallKey: 'BF' }),
  ])
  assert.deepEqual(games.map(g => g.title), ['Plants vs. Zombies', 'Red Dead Redemption 2', 'Battlefield 2042'])
  assert.equal(looksLikeGame('ubisoft', "Assassin's Creed Valhalla", 10), true)
  assert.equal(looksLikeGame('rockstar', 'Grand Theft Auto V'), true)
})

test('starts a Battle.net game by its launch code, then its program, then its page', async () => {
  const { battlenetCode } = await import('../stores/battlenet.ts')
  const { launcherRelease } = await import('../games.ts')
  assert.equal(battlenetCode('Diablo® IV'), 'Fen')
  assert.equal(battlenetCode('Overwatch'), 'Pro')
  assert.equal(battlenetCode('World of Warcraft'), 'WoW')
  assert.equal(battlenetCode('Some Other Game'), undefined)
  const r = launcherRelease({ store: 'battlenet', id: 'Diablo IV', title: 'Diablo IV', exe: 'D:\\Games\\Diablo IV\\Diablo IV Launcher.exe' })
  assert.deepEqual(r.launches.map(l => l.kind), ['command', 'exe', 'link'])
  assert.deepEqual(r.launches[0], { kind: 'command', scheme: 'battlenet', code: 'Fen', launcher: 'Battle.net' })
  assert.deepEqual(r.launches[2], { kind: 'link', uri: 'battlenet://Fen', scheme: 'battlenet', launcher: 'Battle.net' })
  // Not in the list: its program only, as before
  assert.deepEqual(launcherRelease({ store: 'battlenet', id: 'X', title: 'Unknown Blizzard Game', exe: 'x.exe' }).launches.map(l => l.kind), ['exe'])
})
