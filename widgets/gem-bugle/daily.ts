export type Sudoku = {
  puzzle: number[]
  solution: number[]
  clues: number
}

export function hashText(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function randomFrom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ next >>> 15, next | 1)
    next ^= next + Math.imul(next ^ next >>> 7, next | 61)
    return ((next ^ next >>> 14) >>> 0) / 4294967296
  }
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function pattern(row: number, column: number): number {
  return (row * 3 + Math.floor(row / 3) + column) % 9
}

function candidateMask(board: number[], index: number): boolean[] {
  const allowed = Array(10).fill(true) as boolean[]
  const row = Math.floor(index / 9)
  const column = index % 9
  for (let i = 0; i < 9; i++) {
    allowed[board[row * 9 + i]] = false
    allowed[board[i * 9 + column]] = false
  }
  const boxRow = Math.floor(row / 3) * 3
  const boxColumn = Math.floor(column / 3) * 3
  for (let r = boxRow; r < boxRow + 3; r++)
    for (let c = boxColumn; c < boxColumn + 3; c++) allowed[board[r * 9 + c]] = false
  return allowed
}

export function countSudokuSolutions(input: number[], stopAt = 2): number {
  const board = [...input]
  let found = 0
  const solve = (): void => {
    if (found >= stopAt) return
    let bestIndex = -1
    let bestCandidates: number[] = []
    for (let index = 0; index < 81; index++) {
      if (board[index]) continue
      const mask = candidateMask(board, index)
      const candidates = Array.from({ length: 9 }, (_, i) => i + 1).filter(n => mask[n])
      if (!candidates.length) return
      if (bestIndex < 0 || candidates.length < bestCandidates.length) {
        bestIndex = index
        bestCandidates = candidates
        if (candidates.length === 1) break
      }
    }
    if (bestIndex < 0) {
      found++
      return
    }
    for (const value of bestCandidates) {
      board[bestIndex] = value
      solve()
      board[bestIndex] = 0
      if (found >= stopAt) return
    }
  }
  solve()
  return found
}

export function generateSudoku(dateKey: string, targetClues = 34): Sudoku {
  const random = randomFrom(hashText(`GEM-BUGLE:${dateKey}`))
  const groups = [0, 1, 2]
  const rows = shuffled(groups, random).flatMap(group => shuffled(groups, random).map(row => group * 3 + row))
  const columns = shuffled(groups, random).flatMap(group => shuffled(groups, random).map(column => group * 3 + column))
  const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random)
  const solution = rows.flatMap(row => columns.map(column => digits[pattern(row, column)]))
  const puzzle = [...solution]
  for (const index of shuffled(Array.from({ length: 81 }, (_, i) => i), random)) {
    if (puzzle.filter(Boolean).length <= targetClues) break
    const value = puzzle[index]
    puzzle[index] = 0
    if (countSudokuSolutions(puzzle, 2) !== 1) puzzle[index] = value
  }
  return { puzzle, solution, clues: puzzle.filter(Boolean).length }
}

export function localDateKey(time = Date.now()): string {
  const date = new Date(time)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function editionNumber(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T12:00:00Z`) / 86_400_000)
}
