// widgets/game-library/stores/gog.ts
//
// GOG games carry their own description in their folder: goggame-<id>.info (JSON) with the game's name and its
// "play tasks" (the exe to run, its arguments). GOG games are DRM-free: they start from their exe, no launcher.
// Found by looking in GOG Galaxy's games folder and in the game folders the user adds.

export const GOG_DEFAULT_FOLDERS = ['C:\\Program Files (x86)\\GOG Galaxy\\Games', 'C:\\GOG Games']

export type GogGame = {
  gameId: string
  title: string
  installDir: string
  /** The primary play task's exe, full path. */
  exe: string
  /** Its arguments, as written in the file (passed on once GEM Shell can start a program with arguments). */
  args: string
}

export function isGogInfoFile(name: string): boolean {
  return /^goggame-\d+\.info$/i.test(name)
}

type PlayTask = { isPrimary?: boolean; category?: string; type?: string; path?: string; arguments?: string; workingDir?: string }

/**
 * A goggame-<id>.info file, found in installDir. Null when it has no game to start: no name, no file task, or the
 * file belongs to DLC (rootGameId names another game).
 */
export function parseGogInfo(text: string, installDir: string): GogGame | null {
  let data: Record<string, unknown>
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const gameId = String(data.gameId ?? '')
  const title = typeof data.name === 'string' ? data.name : ''
  if (!gameId || !title) return null
  const root = data.rootGameId == null ? '' : String(data.rootGameId)
  if (root && root !== gameId) return null
  const tasks = (Array.isArray(data.playTasks) ? data.playTasks : []) as PlayTask[]
  const files = tasks.filter(t => (t.type ?? 'FileTask') === 'FileTask' && typeof t.path === 'string' && t.path)
  const task = files.find(t => t.isPrimary && (t.category ?? 'game') === 'game')
    ?? files.find(t => t.isPrimary)
    ?? files.find(t => (t.category ?? 'game') === 'game')
  if (!task?.path) return null
  const dir = installDir.replace(/[\\/]+$/, '')
  const rel = task.path.replace(/\//g, '\\').replace(/^\\+/, '')
  return { gameId, title, installDir: dir, exe: /^[a-z]:\\/i.test(rel) ? rel : `${dir}\\${rel}`, args: task.arguments ?? '' }
}
