import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconOf, iconSource, type GameRelease } from '../games.ts'

const release = (over: Partial<GameRelease>): GameRelease => ({ store: 'manual', storeId: 'x', title: 'X', installed: true, launches: [], ...over })

test("finds a game's own icon: the program it starts, or its Store app", () => {
  assert.deepEqual(iconOf({ releases: [release({ launches: [{ kind: 'exe', path: 'D:\\Games\\X\\x.exe' }] })] }), { path: 'D:\\Games\\X\\x.exe' })
  assert.deepEqual(iconOf({ releases: [release({ store: 'xbox', launches: [{ kind: 'app', appId: 'Pub.Game_8wekyb3d8bbwe!App', launcher: 'Xbox' }] })] }), { appId: 'Pub.Game_8wekyb3d8bbwe!App' })
  // A store link first, the exe after it: the exe's icon
  assert.deepEqual(iconOf({ releases: [release({ store: 'ea', launches: [{ kind: 'link', uri: 'origin2://x', scheme: 'origin2', launcher: 'EA' }, { kind: 'exe', path: 'C:\\EA\\g.exe' }] })] }), { path: 'C:\\EA\\g.exe' })
})

test('has no icon for a game not installed, a link only, or a CurseForge modpack', () => {
  assert.equal(iconOf({ releases: [release({ installed: false, launches: [{ kind: 'exe', path: 'x.exe' }] })] }), undefined)
  assert.equal(iconOf({ releases: [release({ launches: [{ kind: 'link', uri: 'steam://run/1', scheme: 'steam', launcher: 'Steam' }] })] }), undefined)
  assert.equal(iconOf({ releases: [release({ store: 'curseforge', launches: [{ kind: 'exe', path: 'CurseForge.exe', launcher: 'CurseForge' }] })] }), undefined)
})

test("names an icon's source apart from a file's", () => {
  assert.equal(iconSource({ path: 'C:\\a.exe' }), 'icon-file:C:\\a.exe')
  assert.equal(iconSource({ appId: 'A_8wekyb3d8bbwe!App' }), 'icon-app:A_8wekyb3d8bbwe!App')
})

import { minecraftIconOf, MINECRAFT_LAUNCHER_APP } from '../games.ts'
test("a modpack's badge: Minecraft's own program here, else the Launcher's Store app", () => {
  const launcher = { title: 'Minecraft Launcher', releases: [{ store: 'xbox', installed: true, launches: [{ kind: 'app', appId: 'X!Minecraft' }] }] } as any
  const pack = { title: 'Minecraft', releases: [{ store: 'curseforge', kind: 'minecraft.modpack', installed: true, launches: [] }] } as any
  assert.deepEqual(minecraftIconOf([pack, launcher]), { appId: 'X!Minecraft' })
  assert.deepEqual(minecraftIconOf([pack]), { appId: MINECRAFT_LAUNCHER_APP })
})
