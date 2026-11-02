<script setup lang="ts">
// GEM Game Shop (game-library 0.2.0, 2026-10-31; plan: claude/plan-2026-10-31-game-library.md). Every PC game on
// this computer in one shop: Steam, Epic, GOG and the games you add, one big box per game (one sticker per store),
// started in one click.
//   Shop     the shared store floor: "Recently played", "All games" and a rack per store at the head of the
//            aisle, then a rack per genre once the details are in (0.4.0)
//   Shelves  the classic layout: "Recently played", a shelf per genre, then a shelf per store
// The top bar is the Video Club's (0.7.0): ▦ Genres (opens a rack, or scrolls to a shelf), ⇅ the order of the boxes,
// ⚙ (library-ui LibraryMenu) with the look (Display) and the library (Library): the game folders, adding a game,
// looking again, online details. The Game Shop is global (0.7.1, Guillaume): the stores and the game folders are
// GEM Shell's settings (one set for every Game Shop: they're mostly fixed places); ⚙ shows the folders and points
// there. Per-Game Shop folders may come back with emulation (ROM folders).
// Finding the games: scan.ts (the stores' own files, Read capability). Starting them: launch.ts (Steam and Epic
// through GEM Shell's app links, GOG and your games from their exe). Details and art from the web (0.4.0, Network
// capability): online/details.ts (Steam's store, SteamGridDB with the user's key).
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { WidgetJob, WidgetMenuItemMessage, WidgetSdk } from 'gexplorer/widgets'
import { boxDirectionOf, LibraryFloor, staffPicks, titleRange, yearRange, LibraryMenu, MediaShelf, moveBoxFocus, SkinEditor, SkinPicker, skinClass, skinStyle, useBoxFlight, useSkins, type LibraryShelf } from '@shared/library-ui'
import GameDetail from './GameDetail.vue'
import GameMarks from './GameMarks.vue'
import LinkGame from './LinkGame.vue'
import ShopLogo from './ShopLogo.vue'
import { iconOf, iconSource, installableRelease, isModpack, minecraftIconOf, isInstalled, PLACEHOLDER_ART, playableRelease, recentlyPlayed, STORE_LABELS, STORES, titleFromExe, type GameItem, type GameRelease, type StoreId } from './games'
import { launchRelease, type LaunchPort } from './launch'
import { loadDoc, saveDoc, withEdit, withLink, type GameEdit, type LibraryDoc } from './library-store'
import { loadDetails, lookUpDetails, saveDetails, sgdbKeyChange, withoutSgdb, type DetailsDoc, type GameDetails } from './online/details'
import type { FetchPort } from './online/paced'
import { DETAILS_CELL, DETAILS_LOADED_CELL, LOOKING_UP_CELL, LOOKUP_JOB, LOOKUP_PROGRESS_CELL, lookUpTitle, ONLINE_NOTE_CELL, type LookUpProgress } from './online/lookup-job'
import { SGDB_HOSTS, SGDB_SECRET } from './online/sgdb'
import { IGDB_SECRET, igdbImage, igdbSession, searchIgdb, type IgdbGame } from './online/igdb'
import { pickQuip, QUIPS } from './playtime-quips'
import { titleKey } from './games'
import { fetchOwned, normalizeOwned, OWNED_DOC, ownedDue, ownedSession, STEAM_API_SECRET, type OwnedDoc } from './online/steam-owned'
import { filePortFor, findSteamId, scanGames, type AppsPort, type ScanResult, type ScanSettings } from './scan'
import { isSortMode, SORT_MODES, sortGames, type SortMode } from './sort'
import { useGameArt, type ArtJob } from './useGameArt'
import { gameTag, pickNote, pickScore } from './shelf-labels'

type DisplayMode = 'shop' | 'shelves'

const props = defineProps<{
  sourceId?: string
  config?: { data?: Record<string, unknown>; view?: { displayMode?: DisplayMode; sortMode?: SortMode } }
  placement?: { context: 'grid' | 'sidebar' | 'toolbar' | 'embedded'; size?: { width?: number; height?: number } }
}>()
const emit = defineEmits<{ (e: 'event', value: { type: string; payload: unknown }): void }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const life = sdk?.lifecycle?.()
const settings = sdk?.settings?.()
const art = useGameArt(sdk, life)
/** 0.17.2: "Stocking shelves…" while pictures are made (only once it lasts: no flash for a few). */
const stocking = ref(false)
let stockingTimer: ReturnType<typeof setTimeout> | undefined
watch(() => art.remaining.value > 0, busy => {
  if (stockingTimer) { clearTimeout(stockingTimer); stockingTimer = undefined }
  if (!busy) { stocking.value = false; return }
  stockingTimer = setTimeout(() => { stockingTimer = undefined; stocking.value = art.remaining.value > 0 }, 300)
}, { immediate: true })
/**
 * The shop's look, a library-ui skin (0.17.0). 0.21.0: chosen in the ⚙ menu (Display ▸ Store), with the user's own
 * skins (duplicated, edited, loaded from and saved to .gemskin files): kept in 'game-library-skins', for every Game
 * Shop. The look chosen on GEM Shell's settings page before 0.21.0 is the first one's.
 */
const skins = useSkins(sdk, { doc: 'game-library-skins', first: 'software-aisle', keepSelection: true, notify: text => snack(text, 'game-library-skins') })
const skinId = computed(() => skins.selected.value ?? (typeof settings?.values?.skin === 'string' ? settings.values.skin : 'software-aisle'))
/** What the shop shows: the skin being edited, else the one chosen. */
const skin = computed(() => skins.draft.value ?? skins.find(skinId.value))
const SKIN_HINTS: Record<string, string> = {
  'software-aisle': 'A 90s software store: slatwall, black metal shelving, lit signs.',
  'late-show': "The Video Club's: a plum wall, wooden shelves, neon signs.",
  'classic': 'Plain, as before 0.17.0.',
}

// ── What was found, and what the user keeps ──────────────────────────────────────────────────────────────────
// 0.18.1: the cells below are transient (kept in memory across remounts, never written to disk when GEM Shell puts
// the widget away): together they passed the 8 MB a widget may save for the next start (the details alone are
// 1.5 MB, and they are on disk already, in the widget's own documents). After a restart: a fresh scan, the documents.
const result = life?.persistRef<{ key: string; scan: ScanResult } | null>('game-library.scan', null, { transient: true }) ?? ref<{ key: string; scan: ScanResult } | null>(null)
const doc = ref<LibraryDoc>({ version: 1, manual: [], played: {}, preferred: {}, edits: {} })
const root = ref<HTMLElement | null>(null)
const scanning = ref(false)
const scanError = ref('')
let scanRevision = 0

// ── The game folders (0.7.1: GEM Shell's settings again, one list for every Game Shop) ───────────────────────
const stringList = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((f): f is string => typeof f === 'string' && !!f.trim()) : null)
/** The folders on GEM Shell's settings page: every Game Shop's. */
const sharedFolders = computed(() => stringList(settings?.values?.gameFolders) ?? [])
/**
 * Folders added in this Game Shop with 0.7.0 (when each had its own) and not in the settings: still searched, shown in
 * ⚙ so the user can move them to the settings or drop them. Nothing new is ever added here.
 */
const ownFolders = ref<string[]>(stringList(props.config?.data?.gameFolders) ?? [])
const localOnly = computed(() => ownFolders.value.filter(f => !sharedFolders.value.some(s => s.toLocaleLowerCase() === f.toLocaleLowerCase())))
const folders = computed(() => [...sharedFolders.value, ...localOnly.value])
function dropOwnFolder(path: string) {
  ownFolders.value = ownFolders.value.filter(f => f !== path)
  const { gameFolders: _gone, ...data } = props.config?.data ?? {}
  emit('event', { type: 'update:config', payload: { ...props.config, data: ownFolders.value.length ? { ...data, gameFolders: ownFolders.value } : data } })
  void rescan()
}
const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

// ── The Steam games owned (0.10.0): Steam's Web API with the user's key (online/steam-owned.ts) ─────────────────
const ownedDoc = ref<OwnedDoc>({ version: 1, games: [] })
/** Shown: the setting, Steam searched, details online. */
const ownedOn = computed(() => settings?.values?.owned !== false && settings?.values?.steam !== false && settings?.values?.online !== false)
const steamKeySet = ref(false)
/** Why the owned games aren't shown (no account found, the profile private, the key refused), for ⚙. */
const ownedNote = ref('')
let ownedRun = 0

/**
 * Reads the owned games again when due (force: now). A change rescans (the boxes come from the scan). Returns what
 * it did, for the settings page. Never throws.
 */
async function refreshOwned(force = false): Promise<string> {
  if (!ownedOn.value || !sdk?.networkFetch || !sdk.secrets) return ''
  const run = ++ownedRun
  let keySet: boolean
  try { keySet = !!(await sdk.secrets().status(STEAM_API_SECRET))?.set } catch { return '' }
  steamKeySet.value = keySet
  if (!keySet) {
    // The key forgotten: the owned games go with it
    if (ownedDoc.value.games.length) {
      ownedDoc.value = { version: 1, games: [] }
      void sdk.configWrite?.(OWNED_DOC, ownedDoc.value)
      await rescan()
    }
    ownedNote.value = ''
    return ''
  }
  if (!sdk.openListing || !sdk.fsReadText) return ''
  const steamId = await findSteamId(filePortFor(sdk, `game-library:${props.sourceId ?? 'default'}:owned`), scanSettings.value)
  if (run !== ownedRun) return ''
  if (!steamId) {
    ownedNote.value = "Steam's account on this computer wasn't found (Steam ▸ config ▸ loginusers.vdf): sign in to Steam once."
    return ownedNote.value
  }
  if (!force && !ownedDue(ownedDoc.value, steamId)) return ''
  try {
    const next = await fetchOwned(ownedSession(sdk as unknown as FetchPort), steamId)
    if (run !== ownedRun) return ''
    const changed = JSON.stringify(next.games) !== JSON.stringify(ownedDoc.value.games)
    ownedDoc.value = next
    void sdk.configWrite?.(OWNED_DOC, next)
    ownedNote.value = next.note ?? ''
    if (changed) await rescan()
    const waiting = result.value?.scan.notInstalled ?? 0
    return next.note ?? `Steam lists ${next.games.length} games you own${waiting ? `, ${waiting} not installed` : ''}.`
  } catch (e) {
    ownedNote.value = `Steam Web API: ${e instanceof Error ? e.message : String(e)}`
    return ownedNote.value
  }
}

const scanSettings = computed<ScanSettings>(() => {
  const v = settings?.values ?? {}
  const text = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '')
  const flag = (k: string) => v[k] !== false
  return {
    steamFolder: text('steamFolder'),
    epicManifests: text('epicManifests'),
    gameFolders: folders.value,
    stores: {
      steam: flag('steam'), epic: flag('epic'), gog: flag('gog'),
      rockstar: flag('rockstar'), ea: flag('ea'), ubisoft: flag('ubisoft'), battlenet: flag('battlenet'), xbox: flag('xbox'),
      curseforge: flag('curseforge'),
    },
    xboxFolders: stringList(v.xboxFolders) ?? [],
    curseforgeFolder: text('curseforgeFolder'),
    manual: doc.value.manual,
    owned: ownedOn.value ? ownedDoc.value.games : undefined,
    // 0.13.0: Epic's are in the launcher's own files: no key, no internet
    epicOwned: v.owned !== false,
  }
})
const scanKey = computed(() => JSON.stringify(scanSettings.value))

async function rescan() {
  if (!sdk?.openListing || !sdk.fsReadText) { scanError.value = 'GEM Shell gave this widget no file reading.'; return }
  const revision = ++scanRevision
  const key = scanKey.value
  scanning.value = true
  scanError.value = ''
  try {
    // Windows' installed programs (0.8.0): GEM Shell asks the user once; without it, those stores are skipped
    const installed = sdk.installedApps?.()
    const apps: AppsPort | undefined = installed && {
      async list() {
        const r = await installed.list()
        return r.ok ? { apps: r.apps } : { error: r.reason === 'declined' ? 'not allowed (Rockstar, EA, Ubisoft and Battle.net games are found there)' : (r.error ?? r.reason) }
      },
    }
    const scan = await scanGames(filePortFor(sdk, `game-library:${props.sourceId ?? 'default'}`), scanSettings.value, apps)
    if (revision === scanRevision) result.value = { key, scan }
  } catch (e) {
    if (revision === scanRevision) scanError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (revision === scanRevision) scanning.value = false
  }
}

// ── Online details (0.4.0) ───────────────────────────────────────────────────────────────────────────────────
// 0.14.0: the look-up runs as a background job (entry.ts `jobs.lookup`): it goes on when the Game Shop leaves the
// screen, its card in GEM Shell's operations tray (LookUpCard.vue), whose Stop ends it. What it changes lives in the
// lifecycle's cells (the same ones once the Game Shop is back, and the card's).
// Transient (0.18.1): a run doesn't outlive GEM Shell (a "looking up" saved for the next start would block every new one)
const cell = <T,>(key: string, initial: T) => life?.persistRef<T>(key, initial, { transient: true }) ?? ref(initial) as Ref<T>
const details = cell<DetailsDoc>(DETAILS_CELL, { version: 1, games: {} })
const detailsLoaded = cell(DETAILS_LOADED_CELL, false)
const detailsOf = (id: string): GameDetails | undefined => details.value.games[id]
const online = computed(() => settings?.values?.online !== false)
const sgdbConnected = ref(false)
const lookingUp = cell(LOOKING_UP_CELL, false)
/** How far the look-up is (0.5.0): "3 of 24". */
const lookUpProgress = cell<LookUpProgress | null>(LOOKUP_PROGRESS_CELL, null)
/** Why the last look-up stopped (the Network permission, the SteamGridDB key), shown under the top bar. */
const onlineNote = cell(ONLINE_NOTE_CELL, '')
/** The run that counts (a newer one, or Stop, takes over) and the pending save: shared by every mount and the job. */
const runner = life?.persistReactive('game-library.lookUpRunner', () => ({ run: 0, saveTimer: undefined as ReturnType<typeof setTimeout> | undefined }), { transient: true })
  ?? { run: 0, saveTimer: undefined as ReturnType<typeof setTimeout> | undefined }
let unmounted = false

function saveDetailsSoon() {
  if (runner.saveTimer) clearTimeout(runner.saveTimer)
  runner.saveTimer = setTimeout(() => { runner.saveTimer = undefined; void saveDetails(sdk ?? {}, details.value) }, 1500)
}

/** 0.11.0: the user's Twitch app for IGDB is saved (GEM Shell part C2). */
const igdbConnected = ref(false)
async function refreshIgdb() {
  try { igdbConnected.value = !!(await sdk?.secrets?.().status(IGDB_SECRET))?.set } catch { igdbConnected.value = false }
}

/** Whether the SteamGridDB key is saved; null when GEM Shell couldn't say. */
async function refreshSgdb(): Promise<boolean | null> {
  try {
    const set = !!(await sdk?.secrets?.().status(SGDB_SECRET))?.set
    sgdbConnected.value = set
    return sdk?.secrets ? set : null
  } catch {
    sgdbConnected.value = false
    return null
  }
}

/**
 * 0.9.0: the key was set or forgotten since the last look (here, or on GEM Shell's settings page with no Game Shop
 * open): forgotten, SteamGridDB's pictures go; set, the games it was asked for without one are due again. Returns
 * how many games lost pictures (null: nothing changed).
 */
function catchUpSgdb(keySet: boolean): number | null {
  const change = sgdbKeyChange(details.value, keySet)
  if (!change) return null
  details.value = change.doc
  saveDetailsSoon()
  return change.removed
}

/**
 * Looks up what's due (force: everything), in the background; one run at a time (a new one takes over from the
 * running one between two games). Resolves when it ends: callers that answer the user (the settings buttons, the
 * menu) don't wait for it (lookUpNow).
 */
async function lookUp(force = false) {
  const scanned = result.value?.scan.games
  if (!online.value || !sdk?.networkFetch || !scanned?.length) return
  const run = ++runner.run
  while (lookingUp.value) {
    await new Promise(resolve => setTimeout(resolve, 500))
    if (run !== runner.run) return
  }
  lookingUp.value = true
  onlineNote.value = ''
  // The job (once there's something to look up): it keeps the run going off screen; its card's Stop ends it
  let job: WidgetJob | null = null
  const jobs = sdk?.jobs?.()
  try {
    const keySet = await refreshSgdb()
    if (keySet !== null) catchUpSgdb(keySet)
    await refreshIgdb()
    const outcome = await lookUpDetails(sdk as unknown as FetchPort, scanned, details.value, {
      sgdb: sgdbConnected.value,
      igdb: igdbConnected.value,
      links: linkIds.value,
      force,
      onDetails: (id, d) => {
        details.value = { ...details.value, games: { ...details.value.games, [id]: d } }
        saveDetailsSoon()
      },
      // Off screen it goes on while its job does (no jobs API: it stops with the Game Shop, as before 0.14.0)
      stopped: () => run !== runner.run || (job ? !job.alive : !jobs && unmounted),
      onProgress: (done, total) => {
        if (run !== runner.run) return
        lookUpProgress.value = total ? { done, total, force } : null
        if (!total) return
        if (!job && jobs && done < total) {
          try { job = jobs.ensure(LOOKUP_JOB, { title: lookUpTitle(done, total) }) } catch (e) { console.warn('[game-library] no background job for the look-up', e) }
        } else job?.update({ title: lookUpTitle(done, total) })
      },
    })
    if (outcome.error) onlineNote.value = `Online details stopped: ${outcome.error}`
    else if (outcome.sgdbError) onlineNote.value = `SteamGridDB: ${outcome.sgdbError} Check the key in the Game Shop's settings.`
    else if (outcome.igdbError) onlineNote.value = `IGDB: ${outcome.igdbError} Check the Twitch app in the Game Shop's settings.`
    if (force && !outcome.error && run === runner.run && !unmounted) snack(`Looked up ${outcome.asked} ${outcome.asked === 1 ? 'game' : 'games'} again.`)
  } finally {
    lookingUp.value = false
    if (run === runner.run) lookUpProgress.value = null
    // Stopped from the card: the run that counts is over too (the next start goes on with what's still due)
    const ran = job as WidgetJob | null
    if (ran && !ran.alive && run === runner.run) runner.run += 1
    ran?.end()
  }
}

/** Stop (the Game Shop's own, beside the count): the run stops after the games it's on; what's due waits for the next start. */
function stopLookUp() {
  runner.run += 1
  sdk?.jobs?.().current(LOOKUP_JOB)?.end()
  snack('Stopped looking up details. The rest will be looked up at the next start.')
}

/** "Look up details again" (settings, menu): says so at once, then runs in the background. Returns what it said. */
function lookUpNow(): string {
  const say = (text: string) => { snack(text); return text }
  if (!online.value) return say('Turn on "Look up details online" first (the Game Shop\'s settings).')
  if (!sdk?.networkFetch) return say('GEM Shell gave this widget no network access.')
  const count = result.value?.scan.games.length ?? 0
  if (!count) return say('No games to look up yet.')
  void lookUp(true)
  return say(`Looking up ${count} ${count === 1 ? 'game' : 'games'} again (about ${Math.max(1, Math.round(count * 2 * 1.8 / 60))} min)…`)
}

/** The Game Shop is on screen (GEM Shell's key box opens only for a widget the user can see). */
function onScreen(): boolean {
  const el = root.value
  return !!el && el.isConnected && el.getClientRects().length > 0 && document.visibilityState !== 'hidden'
}

/** The user's free SteamGridDB key, typed into GEM Shell's own box (the widget never sees it). */
async function connectSgdb() {
  if (!sdk?.secrets) { snack("GEM Shell can't keep a key for this widget."); return }
  if (!onScreen()) { snack('Open the Game Shop, then right-click it ▸ Connect SteamGridDB… (the key box opens over the Game Shop).'); return }
  try {
    const { saved } = await sdk.secrets().prompt({ name: SGDB_SECRET, label: 'SteamGridDB API key (steamgriddb.com ▸ Preferences ▸ API)', hosts: [...SGDB_HOSTS] })
    if (!saved) return
    await refreshSgdb()
    snack('SteamGridDB is connected: looking for covers.')
    // The games SteamGridDB was asked for without a key are due again
    catchUpSgdb(true)
    void lookUp()
  } catch (e) {
    snack(`The key wasn't saved: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 0.9.0: the key was saved or forgotten on GEM Shell's settings page (its secret field). */
async function sgdbKeyChanged() {
  const keySet = await refreshSgdb()
  if (keySet === null) return
  const removed = catchUpSgdb(keySet)
  if (keySet) { snack('SteamGridDB is connected: looking for covers.'); void lookUp() }
  else if (removed) snack(`The SteamGridDB key is forgotten, and the pictures it found for ${removed} ${removed === 1 ? 'game' : 'games'}.`)
}

/** Forgets the key and the pictures SteamGridDB gave (Steam's own pictures stay: they need no key). */
async function forgetSgdb() {
  const { doc: stripped, removed } = withoutSgdb(details.value)
  details.value = { ...stripped, sgdbKey: false }
  saveDetailsSoon()
  let deleted = false
  try { deleted = !!(await sdk?.secrets?.().delete(SGDB_SECRET)) } catch { /* already gone */ }
  await refreshSgdb()
  snack(deleted || removed
    ? `The SteamGridDB key is forgotten${removed ? `, and the pictures it found for ${removed} ${removed === 1 ? 'game' : 'games'}` : ''}.`
    : 'There was no SteamGridDB key to forget.')
}

/** The genres or the description written here (null: back to Steam's). */
function editGame(game: GameItem, edit: GameEdit) {
  doc.value = withEdit(doc.value, game.id, edit)
  void saveDoc(sdk ?? {}, doc.value)
}

/** The rating box: Metacritic's page (steam: false), or the players' reviews on Steam's store (steam: true). */
function openReviews(game: GameItem, steam = false) {
  const d = detailsOf(game.id)
  const appId = game.releases.find(r => r.store === 'steam')?.storeId ?? d?.steamAppId
  const url = !steam && d?.metacritic
    ? d.metacriticUrl ?? `https://www.metacritic.com/search/${encodeURIComponent(game.title)}/`
    : appId ? `https://store.steampowered.com/app/${appId}/#app_reviews_hash` : ''
  if (!url || !sdk?.openUrl) return
  void sdk.openUrl(url, { title: !steam && d?.metacritic ? `${game.title} on Metacritic` : `${game.title}'s Steam reviews` })
}

/** 0.11.0: the rating box with IGDB's score only: its page on IGDB. */
function openIgdb(game: GameItem) {
  const url = detailsOf(game.id)?.igdbUrl
  if (url && sdk?.openUrl) void sdk.openUrl(url, { title: `${game.title} on IGDB` })
}

// ── The boxes ────────────────────────────────────────────────────────────────────────────────────────────────
const games = computed<GameItem[]>(() => (result.value?.scan.games ?? []).map(game => {
  const played = doc.value.played[game.id] ?? 0
  const box = art.urlFor(`box:${game.id}`)
  const d = detailsOf(game.id)
  const mine = doc.value.edits[game.id]
  // The scan's genres when nothing online says (a modpack: "Minecraft modpacks")
  const genres = mine?.genres ?? d?.genres ?? (game.genres.length ? game.genres : [])
  const link = doc.value.links?.[game.id]
  return {
    ...game,
    // 0.11.1: linked by hand to IGDB's game: its name on the box
    title: link?.name ?? game.title,
    year: d?.year ?? game.year,
    genres,
    primaryGenre: genres[0] ?? game.primaryGenre,
    synopsis: mine?.synopsis ?? d?.synopsis ?? game.synopsis,
    localMetadataOverride: !!mine,
    lastPlayedAt: Math.max(game.lastPlayedAt ?? 0, played) || undefined,
    preferredStore: doc.value.preferred[game.id],
    artwork: box ? { src: box, x: 50, y: 50, mode: 'cover' as const } : plainBox(game.id),
  }
}).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })))

/** 0.15.0: a box with no cover: the program's own icon on it, once made. */
function plainBox(id: string) {
  const src = art.urlFor(`icon:${id}`)
  const size = art.sizeFor(`icon:${id}`)
  return src && size ? { ...PLACEHOLDER_ART, icon: { src, ...size } } : PLACEHOLDER_ART
}

// ── Find its details (0.11.1): a box linked by hand to IGDB's game ─────────────────────────────────────────
const linkIds = computed(() => doc.value.links ?? {})
const linkingId = ref<string | null>(null)
const linkingGame = computed(() => games.value.find(g => g.id === linkingId.value) ?? null)
/** IGDB's covers in the list, by image id. */
const pickCovers = computed(() => {
  const out: Record<string, string> = {}
  for (const id of pickWanted.value) { const url = art.urlFor(`pick:${id}`); if (url) out[id] = url }
  return out
})
const pickWanted = ref<string[]>([])
function wantPickCovers(ids: string[]) {
  pickWanted.value = [...new Set([...pickWanted.value, ...ids])].slice(-80)
  art.want(ids.map((id): ArtJob => ({ key: `pick:${id}`, sources: [igdbImage(id, 'cover_big')], size: 'pick' })))
}
async function searchForLink(query: string, platform: number): Promise<IgdbGame[]> {
  if (!sdk?.networkFetch) throw new Error('GEM Shell gave this widget no network access.')
  return searchIgdb(igdbSession(sdk as unknown as FetchPort), query, platform, 16)
}
/** The game's details asked again now (after a link is made or taken off), as the look-up would. */
async function lookUpOne(gameId: string) {
  const game = result.value?.scan.games.find(g => g.id === gameId)
  if (!game || !sdk?.networkFetch) return
  await refreshIgdb()
  const outcome = await lookUpDetails(sdk as unknown as FetchPort, [game], details.value, {
    sgdb: sgdbConnected.value,
    igdb: igdbConnected.value,
    links: linkIds.value,
    force: true,
    onDetails: (id, d) => {
      details.value = { ...details.value, games: { ...details.value.games, [id]: d } }
      saveDetailsSoon()
    },
  })
  if (outcome.error || outcome.igdbError) snack(`Its details weren't looked up: ${outcome.error ?? outcome.igdbError}`)
}
/** Links the box to IGDB's game: what was guessed goes, that game's details come. */
function linkTo(gameId: string, chosen: IgdbGame) {
  doc.value = withLink(doc.value, gameId, { igdbId: chosen.id, name: chosen.name })
  void saveDoc(sdk ?? {}, doc.value)
  const { [gameId]: _guessed, ...rest } = details.value.games
  details.value = { ...details.value, games: rest }
  saveDetailsSoon()
  linkingId.value = null
  snack(`Linked to ${chosen.name}: looking up its details…`)
  void lookUpOne(gameId)
}
function unlink(gameId: string) {
  doc.value = withLink(doc.value, gameId, null)
  void saveDoc(sdk ?? {}, doc.value)
  const { [gameId]: _linked, ...rest } = details.value.games
  details.value = { ...details.value, games: rest }
  saveDetailsSoon()
  linkingId.value = null
  snack('Back to automatic: looking up its details again…')
  void lookUpOne(gameId)
}

/** A picture's sources, best first: this computer's file, then the web's (SteamGridDB, Steam's servers). */
function artJob(game: GameItem, kind: 'box' | 'hero' | 'logo'): ArtJob {
  return { key: `${kind}:${game.id}`, sources: [game.art?.[kind], ...(detailsOf(game.id)?.art?.[kind] ?? [])], size: kind }
}
watch(() => [result.value?.scan.games, details.value, art.failureCount()] as const, () => {
  const scanned = result.value?.scan.games ?? []
  const boxes = scanned.map((g: GameItem) => artJob(g, 'box'))
  art.want(boxes)
  // 0.15.0: the games with no cover anywhere: their program's icon instead (0.16.0: or whose covers all failed)
  art.want(scanned.flatMap((g: GameItem, i): ArtJob[] => {
    if (boxes[i].sources.some(Boolean) && !art.hasFailed(`box:${g.id}`)) return []
    const icon = iconOf(g)
    return icon ? [{ key: `icon:${g.id}`, sources: [iconSource(icon)], size: 'icon' }] : []
  }))
  // 0.23.0: Minecraft's icon for the modpacks' boxes, once (from Minecraft's own program here)
  if (scanned.some(isModpack))
    art.want([{ key: 'badge:minecraft', sources: [iconSource(minecraftIconOf(scanned))], size: 'badge' }])
}, { immediate: true })
/** 0.23.0: the badge on a box: Minecraft's icon on a modpack. */
const badgeOf = (game: GameItem) => (isModpack(game) ? art.urlFor('badge:minecraft') || undefined : undefined)

const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const matches = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  if (!q) return []
  return sorted.value.filter(g => g.title.toLocaleLowerCase().includes(q)
    || (detailsOf(g.id)?.developers ?? []).some(dev => dev.toLocaleLowerCase().includes(q)))
})

// ── The order of the boxes (⇅, 0.7.0) ─────────────────────────────────────────────────────────────────────────
const sortMode = life?.persistRef<SortMode>('game-library.sort-mode', isSortMode(props.config?.view?.sortMode) ? props.config!.view!.sortMode! : 'title')
  ?? ref<SortMode>(isSortMode(props.config?.view?.sortMode) ? props.config!.view!.sortMode! : 'title')
function setSortMode(mode: SortMode) {
  if (!isSortMode(mode)) return
  sortMode.value = mode
  void sdk?.setView?.({ sortMode: mode })
}
/** A game's score out of 100: Metacritic's, else the share of Steam's players who liked it. */
function ratingOf(game: GameItem): number | undefined {
  const d = detailsOf(game.id)
  if (d?.metacritic) return d.metacritic
  return d?.reviews?.total ? Math.round((d.reviews.positive / d.reviews.total) * 100) : d?.igdbRating
}
const sorted = computed(() => sortGames(games.value, sortMode.value, ratingOf))

const storeShelves = computed<LibraryShelf<GameItem>[]>(() => STORES
  .map(store => {
    const items = sorted.value.filter(g => g.releases.some(r => r.store === store))
    return { id: `store-${store}`, title: STORE_LABELS[store], note: `${items.length} ${items.length === 1 ? 'game' : 'games'}`, items }
  })
  .filter(shelf => shelf.items.length))
/** Continue playing (0.10.0: the installed games only; it was "Recently played"). */
const recentShelf = computed<LibraryShelf<GameItem> | null>(() => {
  const items = recentlyPlayed(games.value, 12, true)
  return items.length ? { id: 'recent', title: 'Continue playing', note: `${items.length} ${items.length === 1 ? 'game' : 'games'}`, items } : null
})
/** 0.10.0: the games owned and not installed (shrink-wrapped). */
const notInstalledShelf = computed<LibraryShelf<GameItem> | null>(() => {
  const items = sorted.value.filter(g => !isInstalled(g))
  return items.length ? { id: 'not-installed', title: 'Not installed', note: `${items.length} ${items.length === 1 ? 'game' : 'games'}`, items } : null
})
const allShelf = computed<LibraryShelf<GameItem>>(() => ({ id: 'all', title: 'All games', note: `${games.value.length} games`, items: sorted.value }))
/** A rack per genre Steam gave (0.4.0), the biggest first, the games without one on "Other games". */
const genreShelves = computed<LibraryShelf<GameItem>[]>(() => {
  const byGenre = new Map<string, GameItem[]>()
  for (const game of sorted.value) for (const genre of game.genres) byGenre.set(genre, [...(byGenre.get(genre) ?? []), game])
  if (!byGenre.size) return []
  const shelves = [...byGenre].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([genre, items]) => ({ id: `genre-${genre.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`, title: genre, note: `${items.length} ${items.length === 1 ? 'game' : 'games'}`, items }))
  const other = sorted.value.filter(g => !g.genres.length)
  return other.length ? [...shelves, { id: 'genre-other', title: 'Other games', note: `${other.length} ${other.length === 1 ? 'game' : 'games'}`, items: other }] : shelves
})
/** The aisle: the genres once known (the stores move to its head), else the stores. */
const floorShelves = computed(() => genreShelves.value.length ? genreShelves.value : storeShelves.value)
const featured = computed(() => [recentShelf.value, allShelf.value, notInstalledShelf.value, ...(genreShelves.value.length ? storeShelves.value : [])]
  .filter((s): s is LibraryShelf<GameItem> => !!s))
const classicShelves = computed(() => query.value.trim()
  ? [{ id: 'results', title: 'Found', note: `${matches.value.length} ${matches.value.length === 1 ? 'game' : 'games'}`, items: matches.value }]
  : [...(recentShelf.value ? [recentShelf.value] : []), ...genreShelves.value, ...storeShelves.value, ...(notInstalledShelf.value ? [notInstalledShelf.value] : [])])

// ── The shop floor ───────────────────────────────────────────────────────────────────────────────────────────
const displayMode = life?.persistRef<DisplayMode>('game-library.display-mode', props.config?.view?.displayMode === 'shelves' ? 'shelves' : 'shop')
  ?? ref<DisplayMode>(props.config?.view?.displayMode === 'shelves' ? 'shelves' : 'shop')
function setDisplayMode(mode: DisplayMode) {
  displayMode.value = mode
  rackId.value = null
  shelfJump.value = ''
  void sdk?.setView?.({ displayMode: mode })
}
const rackId = ref<string | null>(null)
const activeRack = computed(() => {
  if (query.value.trim()) return { id: 'results', title: 'Found', note: `${matches.value.length} ${matches.value.length === 1 ? 'game' : 'games'}`, items: matches.value }
  return [...featured.value, ...floorShelves.value].find(s => s.id === rackId.value) ?? null
})
// ── ▦ Genres (0.7.0, as the Video Club's): the shop opens the rack's department, the shelves scroll to it ───────
const browse = ref<HTMLElement | null>(null)
const menu = ref<{ close: () => void; open: (tab?: string) => void } | null>(null)
const jumpGroups = computed(() => displayMode.value === 'shop'
  ? [
      { label: 'Genres', shelves: genreShelves.value },
      { label: 'At the front', shelves: [recentShelf.value, allShelf.value, notInstalledShelf.value].filter((s): s is LibraryShelf<GameItem> => !!s) },
      { label: 'Stores', shelves: storeShelves.value },
    ].filter(g => g.shelves.length)
  : [{ label: 'Shelves', shelves: classicShelves.value }])
/** What the list shows: the open rack in the shop ('' on the floor), the last shelf jumped to in Shelves. */
const shelfJump = ref('')
const genreJump = computed(() => (displayMode.value === 'shop' ? rackId.value ?? '' : shelfJump.value))
function jumpTo(id: string) {
  if (!id) return
  query.value = ''
  openId.value = null
  if (displayMode.value === 'shop') { rackId.value = id; browse.value?.scrollTo({ top: 0 }); return }
  shelfJump.value = id
  requestAnimationFrame(() => browse.value?.querySelector<HTMLElement>(`[data-shelf-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

// 0.22.0 (library-ui 3.6.0): what's written on a department's shelves: a tag under each box, the shelf's range, a
// staff-pick card on the best (shelf-labels.ts)
const deptPicks = computed(() => (activeRack.value && activeRack.value.id !== 'results'
  ? staffPicks(activeRack.value.items, g => pickScore(detailsOf(g.id)))
  : new Set<string>()))
const shelfTag = (game: GameItem) => gameTag(game, detailsOf(game.id))
const shelfPick = (game: GameItem) => (deptPicks.value.has(game.id) ? pickNote(game, detailsOf(game.id)) : undefined)
const shelfStrip = (items: GameItem[]) => {
  if (activeRack.value?.id === recentShelf.value?.id) return undefined   // its own order
  return sortMode.value === 'title' ? titleRange(items) : sortMode.value === 'year' ? yearRange(items) : undefined
}

const caption = (game: GameItem) => game.releases.map(r => STORE_LABELS[r.store]).filter((s, i, all) => all.indexOf(s) === i).join(' · ')

// ── Opening and playing ──────────────────────────────────────────────────────────────────────────────────────
const openId = ref<string | null>(null)
const openGame = computed(() => games.value.find(g => g.id === openId.value) ?? null)

// ── Taking a box off the shelf (0.17.1; library-ui 3.3.0 useBoxFlight): the box slides to the open case, growing to
// its size, then the page appears around it; closing, it goes back to its place on the shelf ──
const { notePick } = useBoxFlight(root, openId, { shelves: '.gl-browse' })
const openDetails = computed(() => (openGame.value ? detailsOf(openGame.value.id) : undefined))
/**
 * 0.10.1: the line for the open game's play time: the one kept while its milestone is the same, else a new one at
 * random, kept (library doc `quips`) so it stays until the next milestone.
 */
const openQuip = computed(() => {
  const game = openGame.value
  if (!game) return undefined
  const steamId = game.releases.find(r => r.store === 'steam')?.storeId ?? detailsOf(game.id)?.steamAppId
  const keys = [...(steamId ? [`steam:${steamId}`] : []), `title:${titleKey(game.title)}`]
  return pickQuip(QUIPS, keys, game.playtimeMinutes, doc.value.quips?.[game.id])
})
watch(openQuip, quip => {
  const game = openGame.value
  if (!game || !quip) return
  const kept = doc.value.quips?.[game.id]
  if (kept && kept.at === quip.at && kept.text === quip.text) return
  doc.value = { ...doc.value, quips: { ...doc.value.quips, [game.id]: quip } }
  void saveDoc(sdk ?? {}, doc.value)
})
const heroUrl = computed(() => (openGame.value ? art.urlFor(`hero:${openGame.value.id}`) : ''))
const logoUrl = computed(() => (openGame.value ? art.urlFor(`logo:${openGame.value.id}`) : ''))
const shotUrls = computed(() => (openDetails.value?.screenshots ?? []).map((s, i) => ({
  thumb: art.urlFor(`shot:${openGame.value!.id}:${i}`),
  full: art.urlFor(`shot-full:${openGame.value!.id}:${i}`),
})))
watch([openGame, openDetails], () => {
  const game = openGame.value
  const d = openDetails.value
  if (!game) return
  art.want([artJob(game, 'hero'), artJob(game, 'logo'),
    ...(d?.screenshots ?? []).map((s, i): ArtJob => ({ key: `shot:${game.id}:${i}`, sources: [s.thumb], size: 'shot' }))])
})
/** A screenshot shown big: made when asked for. */
function wantShot(index: number) {
  const game = openGame.value
  const shot = openDetails.value?.screenshots?.[index]
  if (game && shot) art.want([{ key: `shot-full:${game.id}:${index}`, sources: [shot.full], size: 'shot-full' }])
}

function snack(text: string, id = 'game-library') {
  void sdk?.ui?.().snack({ id, text, timeoutMs: 6000, dedupe: 'replace' })
}

// The launch animation (0.3.0): the box lifts and a disc slides out of it while the store starts the game. It
// starts with the click, never delays the launch, and goes on its own (reduced motion: none, game-library.css).
const LAUNCH_SHOWN_MS = 1100
const launchingId = ref<string | null>(null)
let launchTimer: ReturnType<typeof setTimeout> | undefined
function showLaunch(game: GameItem) {
  launchingId.value = game.id
  if (launchTimer) clearTimeout(launchTimer)
  launchTimer = setTimeout(() => { launchingId.value = null }, LAUNCH_SHOWN_MS)
}

/** Called straight from the click (GEM Shell's gesture rule): nothing awaited before the launch. */
function play(game: GameItem, release: GameRelease | undefined = playableRelease(game)) {
  if (!release) {
    const owned = installableRelease(game)
    if (owned) install(game, owned)
    else snack(`${game.title} isn't installed.`)
    return
  }
  const launching = launchRelease(sdk as unknown as LaunchPort, release)   // started first, in the click's task
  showLaunch(game)
  void launching.then(outcome => {
    if (!outcome.ok) { snack(outcome.message); return }
    snack(outcome.via.kind === 'link' || outcome.via.kind === 'command' ? `Starting ${game.title} with ${outcome.via.launcher}…` : `Starting ${game.title}…`)
    if (release.store !== 'steam') {         // Steam keeps its own "last played"
      doc.value = { ...doc.value, played: { ...doc.value.played, [game.id]: Date.now() } }
      void saveDoc(sdk ?? {}, doc.value)
    }
  })
}

/** 0.10.0: a game owned and not installed: its store's install window (Steam's), from the click like Play. */
function install(game: GameItem, release: GameRelease) {
  const way = release.install
  if (!way) return
  const opening = launchRelease(sdk as unknown as LaunchPort, { ...release, installed: true, launches: [way] })
  void opening.then(outcome => snack(outcome.ok ? `${way.kind === 'link' ? way.launcher : 'The store'} opens its install window for ${game.title}.` : outcome.message))
}

function prefer(game: GameItem, store: StoreId) {
  doc.value = { ...doc.value, preferred: { ...doc.value.preferred, [game.id]: store } }
  void saveDoc(sdk ?? {}, doc.value)
}

function reveal(path: string) {
  void sdk?.reveal?.(path).then(r => { if (!r.ok && r.reason === 'not-found') snack('That folder is gone.') })
}

async function addGame() {
  const files = await sdk?.ui?.().openFiles({
    title: 'Add a game',
    filters: [{ label: 'Games and shortcuts', extensions: ['exe', 'lnk', 'url'] }],
    multiple: true,
    acceptLabel: 'Add to the library',
  })
  if (!files?.length) return
  const known = new Set(doc.value.manual.map(m => m.path.toLowerCase()))
  const added = files.filter(f => !known.has(f.toLowerCase())).map(path => ({ path, title: titleFromExe(path) }))
  if (!added.length) { snack('Already in the library.'); return }
  doc.value = { ...doc.value, manual: [...doc.value.manual, ...added] }
  await saveDoc(sdk ?? {}, doc.value)
  await rescan()
  snack(added.length === 1 ? `${added[0].title} is on the shelf.` : `${added.length} games are on the shelf.`)
}

async function removeGame(game: GameItem) {
  const paths = new Set(game.releases.filter(r => r.store === 'manual').map(r => r.storeId.toLowerCase()))
  doc.value = { ...doc.value, manual: doc.value.manual.filter(m => !paths.has(m.path.toLowerCase())) }
  await saveDoc(sdk ?? {}, doc.value)
  openId.value = null
  await rescan()
}

// ── Right-click menus (entry.ts menuContexts / menus) ────────────────────────────────────────────────────────
/** A box: Play, Open the box, Play uses ▸ (its stores), Show its folder, Steam store page, Remove (yours). */
function onBoxMenu(game: GameItem, event: MouseEvent) {
  const installed = game.releases.filter(r => r.installed)
  const main = playableRelease(game)
  const states: string[] = []
  if (!main) states.push('not-installed')
  if (installed.length < 2) states.push('one-store')
  if (!game.releases.some(r => r.store === 'steam')) states.push('not-steam')
  if (!game.releases.some(r => r.store === 'manual')) states.push('not-yours')
  void sdk?.ui?.().contextMenu(event, {
    context: 'game.box',
    ref: game.id,
    states,
    submenus: { 'play-with': installed.map(r => ({ id: `use.${r.store}`, label: STORE_LABELS[r.store], checked: r === main })) },
    widgetConfig: props.config,
  })
}

/** The shop around the boxes: Add a game, Look for games again, Look up details again, Connect SteamGridDB. */
function onShopMenu(event: MouseEvent) {
  event.preventDefault()
  const states: string[] = []
  if (sgdbConnected.value) states.push('sgdb-connected')
  if (!online.value) states.push('offline')
  void sdk?.ui?.().contextMenu(event, { context: 'game.shop', states, widgetConfig: props.config })
}

/** A menu choice (the shell lends it the user's gesture: launching, revealing and app links may follow). */
async function onMenuItem(m: WidgetMenuItemMessage) {
  const game = m.ref ? games.value.find(g => g.id === m.ref) : undefined
  if (m.itemId.startsWith('use.')) {
    const store = m.itemId.slice(4) as StoreId
    if (game && game.releases.some(r => r.store === store)) prefer(game, store)
    return
  }
  switch (m.itemId) {
    case 'play': if (game) play(game); break
    case 'details': if (game) openId.value = game.id; break
    case 'link': if (game) linkingId.value = game.id; break
    case 'folder': {
      const dir = game && (playableRelease(game)?.installDir ?? game.releases.find(r => r.installDir)?.installDir)
      if (dir) reveal(dir)
      break
    }
    case 'store': {
      const steam = game?.releases.find(r => r.store === 'steam')
      const links = (sdk as unknown as LaunchPort | undefined)?.appLinks?.()
      if (!steam || !links) break
      const r = await links.open(`steam://store/${steam.storeId}`)
      if (!r.ok && r.reason !== 'declined') snack(`Steam's store page didn't open${r.error ? `: ${r.error}` : '.'}`)
      break
    }
    case 'remove': if (game) await removeGame(game); break
    case 'add': await addGame(); break
    case 'rescan': await rescan(); break
    case 'look-up': lookUpNow(); break
    case 'sgdb': await connectSgdb(); break
    default: console.warn('[game-library] unknown menu item', m.itemId)
  }
}

// ── Keys (entry.ts commands) ─────────────────────────────────────────────────────────────────────────────────
function onCommand(id: string) {
  if (id === 'find') { searchInput.value?.focus(); searchInput.value?.select() }
  else if (id === 'rescan') void rescan()
  else if (id === 'play') { const game = openGame.value; if (game) play(game) }
  // 0.19.0: the arrows move along the shelves (not while a game is open: its page is in front)
  else if (boxDirectionOf(id) && !openGame.value) moveBoxFocus(browse.value, boxDirectionOf(id)!)
}
defineExpose({ onCommand, onMenuItem })

function back() {
  if (openId.value) openId.value = null
  else if (query.value) query.value = ''
  else rackId.value = null
}

// ── Start ────────────────────────────────────────────────────────────────────────────────────────────────────
const offs: Array<(() => void) | undefined> = []
onMounted(async () => {
  offs.push(
    // 0.9.0: they also run when asked on GEM Shell's settings page with no Game Shop open (whenClosed 'queue'),
    // and say what they did there ({ message }).
    settings?.onAction('rescan', async () => {
      await rescan()
      await refreshOwned(true)
      return { message: scanError.value ? `It failed: ${scanError.value}` : foundText.value || 'No games found.' }
    }),
    // Answers at once (the look-up goes on in the background): the settings page shows "Working…" until it does
    settings?.onAction('lookUp', () => ({ message: lookUpNow() })),
  )
  await settings?.ready
    // 0.14.0: loaded once per session: a look-up still running off screen has the newer details
  doc.value = await loadDoc(sdk ?? {})
  if (!detailsLoaded.value) { details.value = await loadDetails(sdk ?? {}); detailsLoaded.value = true }
  try { ownedDoc.value = normalizeOwned(await sdk?.configRead?.(OWNED_DOC)) } catch { /* none yet */ }
  // The SteamGridDB key may have been set or forgotten on the settings page while no Game Shop was open
  const keySet = await refreshSgdb()
  if (keySet !== null) catchUpSgdb(keySet)
  // The same settings as the scan kept by the lifecycle: no scan again on a remount
  if (result.value?.key !== scanKey.value) await rescan()
  offs.push(settings?.onChange((_values, key) => {
    if (key === 'skin') return   // 0.17.0: the look (reactive): nothing to look for again
    if (key === 'online') { if (online.value) void lookUp(); void rescan().then(() => refreshOwned()); return }
    if (key === 'sgdbKey') { void sgdbKeyChanged(); return }
    if (key === 'steamKey') { void refreshOwned(true); return }
    if (key === 'igdbApp') { void refreshIgdb().then(() => { if (igdbConnected.value) { snack('IGDB is connected: looking up your games there.'); void lookUp() } }); return }
    if (key === 'owned') { void rescan().then(() => refreshOwned()); return }
    void rescan()
  }))
  // A look-up still running (its job, while the Game Shop was away) goes on: no new one
  if (!lookingUp.value) void lookUp()
  void refreshOwned()
})
// A new scan (a game installed, a game added): its new games are looked up
watch(() => result.value?.scan.games, (list, before) => { if (list && before && list !== before) void lookUp() })
onBeforeUnmount(() => {
  unmounted = true
  for (const off of offs) off?.()
  if (launchTimer) clearTimeout(launchTimer)
  // Saved now; a look-up going on in its job keeps saving as it goes
  if (runner.saveTimer) { clearTimeout(runner.saveTimer); runner.saveTimer = undefined; void saveDetails(sdk ?? {}, details.value) }
})

const found = computed(() => result.value?.scan.found)
const warnings = computed(() => result.value?.scan.warnings ?? [])
/** "8 on Steam · 9 on Epic · 1 on Rockstar Games · 2 of yours" */
const foundText = computed(() => {
  const f = found.value as Partial<Record<StoreId, number>> | undefined
  if (!f) return ''
  return STORES.filter(s => f[s]).map(s => (s === 'manual' ? `${f[s]} of yours` : `${f[s]} on ${STORE_LABELS[s].replace(/ Games$/, '')}`)).join(' · ')
})
</script>

<template>
  <section
    ref="root"
    class="game-library gem-library-surface"
    :class="[{ sidebar: placement?.context === 'sidebar' }, skinClass(skin)]"
    :style="skinStyle(skin)"
    aria-label="GEM Game Shop"
  >
    <header class="gl-topbar">
      <nav class="gl-nav" aria-label="Shop navigation">
        <button type="button" class="gl-icon-button" :disabled="!openId && !query && !rackId" aria-label="Back" title="Back" @click="back">←</button>
        <ShopLogo class="gl-brand-logo" />
      </nav>
      <div class="gl-search" role="search">
        <span aria-hidden="true">⌕</span>
        <input ref="searchInput" v-model="query" type="text" inputmode="search" autocomplete="off" :spellcheck="false" placeholder="Find a game" aria-label="Find a game" />
        <button v-if="query" type="button" aria-label="Clear search" @click="query = ''">×</button>
      </div>
      <div class="gl-tools">
        <label v-if="games.length" class="glu-picker" :title="displayMode === 'shop' ? 'Go to a rack' : 'Go to a shelf'">
          <span aria-hidden="true">▦</span>
          <select :value="genreJump" aria-label="Go to a genre" @change="jumpTo(($event.target as HTMLSelectElement).value)">
            <option value="">Genres</option>
            <optgroup v-for="group in jumpGroups" :key="group.label" :label="group.label">
              <option v-for="shelf in group.shelves" :key="shelf.id" :value="shelf.id">{{ shelf.title }}</option>
            </optgroup>
          </select>
        </label>
        <label class="glu-picker gl-sort" title="Sort the games">
          <span aria-hidden="true">⇅</span>
          <select :value="sortMode" aria-label="Sort the games" @change="setSortMode(($event.target as HTMLSelectElement).value as SortMode)">
            <option v-for="mode in SORT_MODES" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
          </select>
        </label>
        <LibraryMenu ref="menu" label="Game Shop settings" :tabs="[{ id: 'display', label: 'Display', icon: '◫' }, { id: 'library', label: 'Library', icon: '▦' }]">
          <template #default="{ tab, close }">
            <template v-if="tab === 'display'">
              <p class="glu-menu-label">Look</p>
              <div class="glu-choices" role="radiogroup" aria-label="The Game Shop's look">
                <button type="button" role="radio" :aria-checked="displayMode === 'shop'" :class="{ active: displayMode === 'shop' }" @click="setDisplayMode('shop'); close()">
                  <span aria-hidden="true">⌂</span><b>Game shop</b><small>Walk the aisle of racks, by genre and by store, and open a box at the counter.</small>
                </button>
                <button type="button" role="radio" :aria-checked="displayMode === 'shelves'" :class="{ active: displayMode === 'shelves' }" @click="setDisplayMode('shelves'); close()">
                  <span aria-hidden="true">▤</span><b>Shelves</b><small>Scroll shelves of boxes: recently played, each genre, each store.</small>
                </button>
              </div>
              <div class="glu-menu-heading ruled"><p class="glu-menu-label">Store</p><small>{{ skins.all.value.length }}</small></div>
              <SkinPicker :skins="skins" :selected="skin.id" :hints="SKIN_HINTS" name="game-library-skin" @select="skins.select" @editing="close()" />
            </template>
            <template v-else>
              <div class="glu-menu-heading"><p class="glu-menu-label">Game folders</p><small>{{ folders.length }}</small></div>
              <ul v-if="folders.length" class="glu-menu-list">
                <li v-for="folder in sharedFolders" :key="folder" :title="folder" class="fixed">
                  <span><b>{{ folderName(folder) }}</b><small>{{ folder }}</small></span>
                </li>
                <li v-for="folder in localOnly" :key="`own:${folder}`" :title="`${folder}: added in this Game Shop before 0.7.1. Add it on the settings page to keep it, or remove it here.`">
                  <span><b>{{ folderName(folder) }} · this Game Shop only</b><small>{{ folder }}</small></span>
                  <button type="button" :aria-label="`Remove ${folderName(folder)}`" @click="dropOwnFolder(folder)">×</button>
                </li>
              </ul>
              <p v-else class="glu-menu-empty">No folders of yours. Steam, Epic and GOG Galaxy's usual folders are searched anyway.</p>
              <p class="glu-menu-status">Every Game Shop shares these. Add or remove them on the Game Shop's page in GEM Shell's settings (the widget's menu ▸ Configure).</p>
              <p v-if="warnings.length" class="glu-menu-note" :title="warnings.join('\n')">{{ warnings.length }} {{ warnings.length === 1 ? 'warning' : 'warnings' }}: {{ warnings[0] }}</p>
              <button class="glu-menu-add" type="button" :disabled="!sdk?.ui" @click="close(); addGame()"><span aria-hidden="true">＋</span>Add a game (an exe or a shortcut)</button>
              <button class="glu-menu-quiet" type="button" :disabled="scanning" @click="rescan()"><span aria-hidden="true">↻</span>{{ scanning ? 'Looking…' : 'Look for games again' }}</button>
              <p v-if="found" class="glu-menu-status">{{ foundText || 'No games found yet.' }}</p>

              <div class="glu-menu-heading ruled"><p class="glu-menu-label">Online details</p><small>{{ !online ? 'off' : lookingUp ? '…' : '✓' }}</small></div>
              <p class="glu-menu-status">
                <template v-if="!online">Turned off in GEM Shell's settings (the Game Shop's page).</template>
                <template v-else-if="lookingUp && lookUpProgress">Looking up <b>{{ lookUpProgress.done }} of {{ lookUpProgress.total }}</b> games…</template>
                <template v-else>Descriptions, genres, reviews and screenshots from Steam's store.</template>
              </p>
              <p class="glu-menu-status">{{ sgdbConnected ? 'SteamGridDB is connected: covers for the games without art.' : 'Covers for the games without art (Epic, GOG, yours) come from SteamGridDB, with a free key.' }}</p>
              <p class="glu-menu-status">{{ igdbConnected ? 'IGDB is connected: ratings, and the details of the games Steam doesn\'t sell.' : 'IGDB adds ratings, and the details of the games Steam doesn\'t sell: give it a free Twitch app on the Game Shop\'s page in GEM Shell\'s settings.' }}</p>
              <div class="glu-menu-actions">
                <button type="button" :disabled="!online || !sdk?.secrets" @click="close(); connectSgdb()">{{ sgdbConnected ? 'Replace key' : 'Connect SteamGridDB' }}</button>
                <button v-if="sgdbConnected" type="button" @click="forgetSgdb()">Forget key</button>
                <button type="button" class="wide" :disabled="!online || !games.length" @click="lookUpNow()">Look up details again</button>
              </div>
              <p v-if="onlineNote" class="glu-menu-note">{{ onlineNote }}</p>
              <p v-if="online" class="glu-menu-status">
                <template v-if="!ownedOn">The Steam games you haven't installed are hidden (GEM Shell's settings).</template>
                <template v-else-if="steamKeySet && ownedDoc.games.length">Steam: <b>{{ ownedDoc.games.length }}</b> games you own<template v-if="result?.scan.notInstalled">, {{ result.scan.notInstalled }} not installed (shrink-wrapped)</template>.</template>
                <template v-else-if="!steamKeySet">The Steam games you own but haven't installed, with your play time: add your Steam Web API key on the Game Shop's page in GEM Shell's settings.</template>
              </p>
              <p v-if="online && ownedOn && ownedNote" class="glu-menu-note">{{ ownedNote }}</p>
            </template>
          </template>
        </LibraryMenu>
      </div>
    </header>
    <SkinEditor :skins="skins" />
    <div v-if="scanning && games.length" class="gl-activity" role="status" aria-live="polite"><span aria-hidden="true">◌</span>Looking for games…</div>
    <div v-else-if="stocking" class="gl-activity" role="status" aria-live="polite"><span aria-hidden="true">◌</span>Stocking shelves…<b class="gl-activity-count">{{ art.remaining.value }} to go</b></div>
    <div v-else-if="lookingUp && lookUpProgress" class="gl-activity" role="status" aria-live="polite">
      <span aria-hidden="true">◌</span>Looking up covers and details…<b class="gl-activity-count">{{ lookUpProgress.done }} of {{ lookUpProgress.total }}</b>
      <button type="button" title="Stops after the games it's on; the rest is looked up at the next start" @click="stopLookUp()">Stop</button>
    </div>
    <div v-else-if="onlineNote" class="gl-activity gl-activity-note" role="status">
      <span aria-hidden="true">!</span>{{ onlineNote }}
      <button type="button" @click="onlineNote = ''; lookUp()">Try again</button>
    </div>

    <main ref="browse" class="gl-browse" @wheel.stop @click.capture="notePick" @contextmenu="onShopMenu">
      <div v-if="scanning && !games.length" class="gl-empty"><span aria-hidden="true">◌</span><strong>Stocking the shelves</strong><p>Looking in Steam, Epic and your game folders…</p></div>
      <div v-else-if="!games.length" class="gl-empty">
        <span aria-hidden="true">▣</span>
        <strong>{{ scanError ? 'Could not look for games' : 'No games found' }}</strong>
        <p>{{ scanError || 'Install a game with Steam or Epic, add a game folder in the Game Shop\'s settings, or add a game yourself.' }}</p>
        <button type="button" @click="addGame">Add a game…</button>
        <p v-if="warnings.length" class="gl-warnings">{{ warnings.join(' · ') }}</p>
      </div>
      <template v-else-if="displayMode === 'shop'">
        <LibraryFloor
          :shelves="floorShelves"
          :featured="featured"
          :active-shelf="activeRack"
          :selected-id="openId ?? undefined"
          variant="bigbox"
          items-noun="games"
          :set-count="n => `${n} ${n === 1 ? 'game' : 'games'}`"
          :row-count="row => `${row.total} ${row.total === 1 ? 'game' : 'games'}`"
          :caption="caption"
          :tag-for="shelfTag"
          :pick-for="shelfPick"
          :row-strip="shelfStrip"
          @select-shelf="rackId = $event"
          @open="openId = $event.id"
          @menu="onBoxMenu"
        >
          <template #intro>
            <p>{{ foundText }}</p>
            <h1 class="gl-wordmark-logo"><ShopLogo size="sign" /></h1>
            <span>Browse the aisle, step closer to a rack, or press ▶ on a box to play.</span>
          </template>
          <template #marks="{ item }"><GameMarks :game="item" :launching="launchingId === item.id" :badge="badgeOf(item)" @play="play" /></template>
        </LibraryFloor>
      </template>
      <template v-else>
        <MediaShelf
          v-for="shelf in classicShelves"
          :key="shelf.id"
          :shelf-id="shelf.id"
          :title="shelf.title"
          :note="shelf.note"
          :items="shelf.items"
          :selected-id="openId ?? undefined"
          variant="bigbox"
          :caption="caption"
          @open="openId = $event.id"
          @menu="onBoxMenu"
        >
          <template #marks="{ item }"><GameMarks :game="item" :launching="launchingId === item.id" :badge="badgeOf(item)" @play="play" /></template>
        </MediaShelf>
      </template>
    </main>

    <GameDetail
      v-if="openGame"
      :game="openGame"
      :details="openDetails"
      :edited="doc.edits[openGame.id] ? { synopsis: !!doc.edits[openGame.id].synopsis, genres: !!doc.edits[openGame.id].genres } : undefined"
      :hero-url="heroUrl"
      :logo-url="logoUrl"
      :shot-urls="shotUrls"
      :launching="launchingId === openGame.id"
      :quip="openQuip?.text"
      :can-reveal="!!sdk?.reveal"
      @close="openId = null"
      @play="release => openGame && play(openGame, release)"
      @install="release => openGame && install(openGame, release)"
      @prefer="store => openGame && prefer(openGame, store)"
      @reveal="reveal"
      @remove="openGame && removeGame(openGame)"
      @want-shot="wantShot"
      @open-reviews="openGame && openReviews(openGame)"
      @open-igdb="openGame && openIgdb(openGame)"
      @open-steam-reviews="openGame && openReviews(openGame, true)"
      @store-page="openGame && onMenuItem({ itemId: 'store', ref: openGame.id } as WidgetMenuItemMessage)"
      @edit="edit => openGame && editGame(openGame, edit)"
      @link="openGame && (linkingId = openGame.id)"
    />

    <LinkGame
      v-if="linkingGame"
      :key="linkingGame.id"
      :title="doc.links?.[linkingGame.id] ? linkingGame.title : (result?.scan.games.find(g => g.id === linkingGame!.id)?.title ?? linkingGame.title)"
      :linked-id="doc.links?.[linkingGame.id]?.igdbId"
      :connected="igdbConnected"
      :search="searchForLink"
      :covers="pickCovers"
      @want-covers="wantPickCovers"
      @choose="g => linkingGame && linkTo(linkingGame.id, g)"
      @unlink="linkingGame && unlink(linkingGame.id)"
      @close="linkingId = null"
    />
  </section>
</template>

<style src="./game-library.css"></style>
