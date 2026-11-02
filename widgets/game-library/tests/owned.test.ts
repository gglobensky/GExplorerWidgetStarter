import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installableRelease, isInstalled, mergeReleases, ownedSteamRelease, recentlyPlayed, steamRelease } from '../games.ts'
import { fetchOwned, normalizeOwned, ownedDue, ownedGamesUrl, ownedSession, OWNED_FOR_MS, parseOwnedGames, playtimeText, steamIdFromAccountId, steamIdFromLoginUsers } from '../online/steam-owned.ts'
import type { FetchPort } from '../online/paced.ts'
import { findSteamId, scanGames, type FileEntry, type FilePort } from '../scan.ts'

const LOGIN_USERS = `"users"
{
	"76561197960287930"
	{
		"AccountName"		"old"
		"MostRecent"		"0"
	}
	"76561198012345678"
	{
		"AccountName"		"guillaume"
		"PersonaName"		"Guillaume"
		"MostRecent"		"1"
	}
}`

test('owned: the Steam account last signed in, else the only userdata folder', () => {
  assert.equal(steamIdFromLoginUsers(LOGIN_USERS), '76561198012345678')
  assert.equal(steamIdFromLoginUsers('"users" { "76561197960287930" { "MostRecent" "0" } }'), '76561197960287930')
  assert.equal(steamIdFromLoginUsers('nothing here'), undefined)
  assert.equal(steamIdFromAccountId('52079950'), '76561198012345678')
  assert.equal(steamIdFromAccountId('0'), undefined)
})

test('owned: GetOwnedGames read, with play time and last play; the key goes as a header, never in the address', async () => {
  const games = parseOwnedGames({ response: { game_count: 3, games: [
    { appid: 620, name: 'Portal 2', playtime_forever: 1312, rtime_last_played: 1700000000 },
    { appid: 440, name: 'Team Fortress 2', playtime_forever: 0, rtime_last_played: 0 },
    { appid: 999, playtime_forever: 5 },
  ] } })
  assert.deepEqual(games, [
    { appId: '620', name: 'Portal 2', playtimeMinutes: 1312, lastPlayed: 1700000000000 },
    { appId: '440', name: 'Team Fortress 2', playtimeMinutes: 0, lastPlayed: 0 },
  ])
  const url = ownedGamesUrl('76561198012345678')
  assert.ok(url.startsWith('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?steamid=76561198012345678'))
  assert.ok(!/[?&]key=/.test(url))

  const seen: Array<{ url: string; headers: unknown }> = []
  const port: FetchPort = {
    async networkFetch(u, options) {
      seen.push({ url: u, headers: options?.headers })
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ response: {} }) }
    },
  }
  const doc = await fetchOwned(ownedSession(port, async () => {}), '76561198012345678', 5)
  assert.deepEqual((seen[0].headers as Record<string, unknown>)['x-webapi-key'], { secret: 'steamwebapi' })
  assert.equal(doc.games.length, 0)
  assert.match(doc.note ?? '', /private/)
  assert.equal(doc.at, 5)
})

test('owned: due again for another account or after a while; the stored document checked', () => {
  const doc = normalizeOwned({ steamId: '76561198012345678', at: 1000, games: [{ appId: '620', name: 'Portal 2', playtimeMinutes: 10, lastPlayed: 2000 }, { name: 'broken' }] })
  assert.deepEqual(doc.games, [{ appId: '620', name: 'Portal 2', playtimeMinutes: 10, lastPlayed: 2000 }])
  assert.equal(ownedDue(doc, '76561198012345678', 1000 + OWNED_FOR_MS - 1), false)
  assert.equal(ownedDue(doc, '76561198012345678', 1000 + OWNED_FOR_MS + 1), true)
  assert.equal(ownedDue(doc, '76561197960287930', 1001), true)
  assert.equal(normalizeOwned(null).games.length, 0)
})

test('owned: a game not installed is shrink-wrapped with Install; installed, it keeps its own box and gets the play time', () => {
  const portal = steamRelease({ appId: '620', name: 'Portal 2', installDir: 'C:\\Steam\\steamapps\\common\\Portal 2', library: 'C:\\Steam', installed: true, lastPlayed: 0, lastUpdated: 0, sizeOnDisk: 1 })
  const tf2 = ownedSteamRelease({ appId: '440', name: 'Team Fortress 2', playtimeMinutes: 90, lastPlayed: 3000 })
  const games = mergeReleases([portal, tf2])
  const wrapped = games.find(g => g.title === 'Team Fortress 2')!
  assert.equal(isInstalled(wrapped), false)
  assert.deepEqual(installableRelease(wrapped)?.install, { kind: 'link', uri: 'steam://install/440', scheme: 'steam', launcher: 'Steam' })
  assert.equal(wrapped.playtimeMinutes, 90)
  assert.equal(installableRelease(games.find(g => g.title === 'Portal 2')!), undefined)
  assert.deepEqual(recentlyPlayed(games, 12, true).map(g => g.title), [], 'Continue playing: installed games only')
  assert.deepEqual(recentlyPlayed(games).map(g => g.title), ['Team Fortress 2'])
  assert.equal(playtimeText(90), '1.5 h played')
  assert.equal(playtimeText(45), '45 min played')
  assert.equal(playtimeText(1312), '22 h played')
  assert.equal(playtimeText(0), '')
})

/** A tiny file system: path → text, folders from the paths. */
function fakeFs(files: Record<string, string>): FilePort {
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
        const name = rest[0]
        out.set(name, { name, path: `${path.replace(/\\+$/, '')}\\${name}`, dir: rest.length > 1 })
      }
      if (!out.size) throw new Error(`${path}: not found`)
      return [...out.values()]
    },
    async kind(path: string) {
      const dir = norm(path)
      if (all.some(p => norm(p) === dir)) return 'file'
      return all.some(p => norm(p).startsWith(dir + '\\')) ? 'dir' : null
    },
  } as unknown as FilePort
}

test('owned: the scan adds the owned games, Steam art and all, and counts them apart', async () => {
  const S = 'C:\\Steam'
  const fs = fakeFs({
    [`${S}\\steamapps\\libraryfolders.vdf`]: `"libraryfolders" { "0" { "path" "C:\\\\Steam" "apps" { "620" "1" } } }`,
    [`${S}\\steamapps\\appmanifest_620.acf`]: `"AppState" { "appid" "620" "name" "Portal 2" "installdir" "Portal 2" "StateFlags" "4" "LastPlayed" "1000" "SizeOnDisk" "10" }`,
    [`${S}\\appcache\\librarycache\\440\\library_600x900.jpg`]: '',
    [`${S}\\config\\loginusers.vdf`]: LOGIN_USERS,
  })
  const owned = [
    { appId: '620', name: 'Portal 2', playtimeMinutes: 1312, lastPlayed: 5_000_000 },
    { appId: '440', name: 'Team Fortress 2', playtimeMinutes: 90, lastPlayed: 3000 },
  ]
  const result = await scanGames(fs, { steamFolder: S, stores: { epic: false, gog: false, rockstar: false, ea: false, ubisoft: false, battlenet: false, xbox: false }, owned })
  assert.equal(result.found.steam, 1)
  assert.equal(result.notInstalled, 1)
  const portal = result.games.find(g => g.title === 'Portal 2')!
  assert.equal(portal.playtimeMinutes, 1312)
  assert.equal(portal.lastPlayedAt, 5_000_000, "Steam's latest play, on any computer")
  const tf2 = result.games.find(g => g.title === 'Team Fortress 2')!
  assert.equal(isInstalled(tf2), false)
  assert.ok(tf2.art?.box?.endsWith('library_600x900.jpg'))
  assert.equal(await findSteamId(fs, { steamFolder: S }), '76561198012345678')
  assert.equal(await findSteamId(fakeFs({ [`${S}\\userdata\\52079950\\config\\localconfig.vdf`]: '' }), { steamFolder: S }), '76561198012345678')
})

test('quips: one line per milestone, kept until the next; a game\'s own lines replace or join the default ones', async () => {
  const { linesFor, milestoneOf, pickQuip, QUIPS, MILESTONES, hoursText } = await import('../playtime-quips.ts')
  assert.equal(milestoneOf(0), undefined)
  assert.equal(milestoneOf(30), 0)
  assert.equal(milestoneOf(60), 1)
  assert.equal(milestoneOf(39 * 60), 10)
  assert.equal(milestoneOf(5000 * 60), 4000)
  for (const m of MILESTONES) assert.ok((QUIPS.default[m]?.length ?? 0) >= 2, `at least 2 lines at ${m} h`)
  const first = pickQuip(QUIPS, ['title:x'], 70, undefined, () => 0)!
  assert.equal(first.at, 1)
  assert.equal(pickQuip(QUIPS, ['title:x'], 200, first, () => .99), first, 'the same milestone: the same line')
  assert.equal(pickQuip(QUIPS, ['title:x'], 301, first, () => 0)!.at, 5, 'a new milestone: a new line')
  assert.deepEqual(linesFor(QUIPS, ['steam:620'], 10), QUIPS.games['steam:620'].lines[10])
  assert.equal(linesFor(QUIPS, ['steam:251570'], 100).length, (QUIPS.default[100]?.length ?? 0) + 1)
  assert.deepEqual(linesFor(QUIPS, ['steam:620'], 40), QUIPS.default[40], 'a milestone it has none for: the default lines')
  assert.equal(hoursText(1312), '22 h')
})

test('steam: a game\'s test builds are tools', async () => {
  const { isSteamTool } = await import('../stores/steam.ts')
  assert.equal(isSteamTool('1', "Tom Clancy's The Division PTS"), true)
  assert.equal(isSteamTool('2', 'Rainbow Six Siege - Test Server'), true)
  assert.equal(isSteamTool('3', 'Some Game Playtest'), true)
  assert.equal(isSteamTool('4', "Tom Clancy's The Division"), false)
  assert.equal(isSteamTool('5', 'Portal 2'), false)
})
