// widgets/game-library/launch.ts
//
// Starting a game: its release's ways to start, best first (games.ts GameLaunch).
//   link  GEM Shell's app links (sdk.appLinks().open(uri): GAME-LIBRARY-SHELL-ADDITIONS.md, part A). Not in GEM
//         Shell yet: the widget asks for it by name and goes on to the next way when it's missing.
//   exe   sdk.openPath(path): the game's program, with this widget's Exec grant (the shell asks the user once).
//   app   sdk.installedApps().launch(appId): a Microsoft Store app (Xbox games, 0.8.0), asked once per app.
//   command  sdk.appLinks().launch(scheme, code) (0.16.0): a store's own program starts the game (Battle.net's
//         launch code; GEM Shell's part G). Older GEM Shells: skipped, the next way is tried.
// Both need the user's own click or key press in the widget (the shell's gesture rule): call play() straight from
// the click handler, before any await.
import type { GameLaunch, GameRelease } from './games.ts'

/** The part of GEM Shell this needs (the SDK's openPath, and app links once they land). */
export type LaunchPort = {
  openPath?: (path: string) => Promise<{ ok: boolean; reason?: string }>
  appLinks?: () => {
    open(uri: string): Promise<{ ok: boolean; reason?: string; error?: string }>
    available?(scheme: string): Promise<boolean>
    launch?(scheme: string, code: string): Promise<{ ok: boolean; reason?: string; error?: string }>
  }
  installedApps?: () => {
    launch(appId: string): Promise<{ ok: boolean; reason?: string; error?: string }>
  }
}

export type LaunchOutcome =
  | { ok: true; via: GameLaunch }
  /** Nothing could start it: why, said plainly for a snackbar. */
  | { ok: false; reason: 'no-way' | 'not-installed' | 'declined' | 'failed'; message: string }

const REASONS: Record<string, string> = {
  'no-gesture': 'GEM Shell only starts games right after a click or a key press in the Game Library.',
  'not-on-screen': 'The Game Library has to be on screen to start a game.',
  declined: 'Not allowed: you can change it in Settings ▸ Security ▸ Permissions.',
}

/** Starts the release: the first way that works. Never throws. */
export async function launchRelease(port: LaunchPort, release: GameRelease): Promise<LaunchOutcome> {
  if (!release.installed) return { ok: false, reason: 'not-installed', message: `${release.title} isn't installed.` }
  const missing: string[] = []
  let failure: LaunchOutcome | null = null
  for (const launch of release.launches) {
    try {
      if (launch.kind === 'link') {
        const links = port.appLinks?.()
        if (!links) { missing.push(launch.launcher); continue }
        const r = await links.open(launch.uri)
        if (r.ok) return { ok: true, via: launch }
        // The shell's reason and words, in the console for diagnosis (the query part left out, as the shell logs it)
        console.warn(`[game-library] ${launch.uri.split('?')[0]}: not opened (${r.reason ?? 'no reason'})`, r.error ?? '')
        if (r.reason === 'not-registered') { failure = { ok: false, reason: 'failed', message: `${launch.launcher} isn't installed on this computer.` }; continue }
        failure = {
          ok: false,
          reason: r.reason === 'declined' ? 'declined' : 'failed',
          message: REASONS[r.reason ?? ''] ?? `${launch.launcher} could not start ${release.title}${r.error ? `: ${r.error}` : '.'}${r.reason ? ` (${r.reason})` : ''}`,
        }
        if (r.reason === 'no-gesture' || r.reason === 'declined') return failure
      } else if (launch.kind === 'command') {
        const links = port.appLinks?.()
        if (!links?.launch) continue   // an older GEM Shell: the game's program, next
        const r = await links.launch(launch.scheme, launch.code)
        if (r.ok) return { ok: true, via: launch }
        console.warn(`[game-library] ${launch.scheme} launch ${launch.code}: not started (${r.reason ?? 'no reason'})`, r.error ?? '')
        failure = {
          ok: false,
          reason: r.reason === 'declined' ? 'declined' : 'failed',
          message: REASONS[r.reason ?? ''] ?? `${launch.launcher} could not start ${release.title}${r.error ? `: ${r.error}` : '.'}`,
        }
        if (r.reason === 'no-gesture' || r.reason === 'declined') return failure
      } else if (launch.kind === 'app') {
        const apps = port.installedApps?.()
        if (!apps) { missing.push(launch.launcher); continue }
        const r = await apps.launch(launch.appId)
        if (r.ok) return { ok: true, via: launch }
        console.warn(`[game-library] ${launch.appId}: not started (${r.reason ?? 'no reason'})`, r.error ?? '')
        if (r.reason === 'not-installed') { failure = { ok: false, reason: 'not-installed', message: `${release.title} isn't installed any more.` }; continue }
        failure = {
          ok: false,
          reason: r.reason === 'declined' ? 'declined' : 'failed',
          message: REASONS[r.reason ?? ''] ?? `${release.title} could not be started${r.error ? `: ${r.error}` : '.'}`,
        }
        if (r.reason === 'no-gesture' || r.reason === 'declined') return failure
      } else {
        if (!port.openPath) { missing.push('GEM Shell'); continue }
        const r = await port.openPath(launch.path)
        if (r.ok) return { ok: true, via: launch }
        failure = { ok: false, reason: 'failed', message: REASONS[r.reason ?? ''] ?? `${release.title} could not be started.` }
        if (r.reason === 'no-gesture') return failure
      }
    } catch (e) {
      failure = { ok: false, reason: 'failed', message: `${release.title} could not be started: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  if (failure) return failure
  if (missing.length) {
    return { ok: false, reason: 'no-way', message: `Starting ${missing[0]} games needs GEM Shell's ${missing[0] === 'Xbox' ? 'installed apps' : 'app links'}, which aren't in this version of GEM Shell yet.` }
  }
  return { ok: false, reason: 'no-way', message: `${release.title} has no way to start.` }
}

/** "Starts Steam" / "Starts Rockstar Games" when the release goes through a launcher; '' when it starts by itself. */
export function launcherNote(release: GameRelease): string {
  const first = release.launches[0]
  if (first?.kind === 'link' || first?.kind === 'command') return `Starts ${first.launcher}`
  if (first?.kind === 'exe' && first.launcher) return `Starts ${first.launcher}`
  return ''
}
