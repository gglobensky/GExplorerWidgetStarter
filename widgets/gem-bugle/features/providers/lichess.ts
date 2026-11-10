import type { DailyFeatureAdapter, FeatureTextFetch } from '../adapter'

export type LichessDailyPuzzle = {
  kind: 'chess'
  provider: 'Lichess'
  dateKey: string
  sourceUrl: string
  id: string
  fen: string
  solution: string[]
  themes: string[]
  rating: number
  plays: number
  gameId: string
  clock: string
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

export function parseLichessDailyPuzzle(value: unknown, dateKey: string): LichessDailyPuzzle {
  const root = record(value)
  const game = record(root.game)
  const puzzle = record(root.puzzle)
  const solution = Array.isArray(puzzle.solution) ? puzzle.solution.filter((move: unknown): move is string => typeof move === 'string') : []
  const themes = Array.isArray(puzzle.themes) ? puzzle.themes.filter((theme: unknown): theme is string => typeof theme === 'string').slice(0, 12) : []
  if (typeof puzzle.id !== 'string' || typeof puzzle.fen !== 'string' || !solution.length || !solution.every(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) {
    throw new Error('Lichess did not provide a complete daily puzzle position.')
  }
  return {
    kind: 'chess',
    provider: 'Lichess',
    dateKey,
    sourceUrl: `https://lichess.org/training/${puzzle.id}`,
    id: puzzle.id,
    fen: puzzle.fen,
    solution,
    themes,
    rating: Number.isFinite(puzzle.rating) ? puzzle.rating : 0,
    plays: Number.isFinite(puzzle.plays) ? puzzle.plays : 0,
    gameId: typeof game.id === 'string' ? game.id : '',
    clock: typeof game.clock === 'string' ? game.clock : '',
  }
}

async function load(fetchText: FeatureTextFetch, dateKey: string): Promise<LichessDailyPuzzle> {
  const response = await fetchText(LICHESS_DAILY.endpoint)
  if (!response.ok) throw new Error(`Lichess returned HTTP ${response.status}.`)
  let value: unknown
  try { value = JSON.parse(await response.text()) } catch { throw new Error('Lichess returned an unreadable daily puzzle.') }
  return parseLichessDailyPuzzle(value, dateKey)
}

export const LICHESS_DAILY: DailyFeatureAdapter<LichessDailyPuzzle> = {
  id: 'lichess-daily-puzzle',
  endpoint: 'https://lichess.org/api/puzzle/daily',
  load,
}
