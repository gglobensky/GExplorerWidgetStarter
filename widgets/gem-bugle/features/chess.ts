export type ChessColor = 'white' | 'black'
export type ChessPiece = { color: ChessColor; kind: 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn' }
export type ChessPosition = {
  squares: Array<ChessPiece | null>
  turn: ChessColor
  castling: string
  enPassant?: string
}

const pieceKinds: Record<string, ChessPiece['kind']> = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
}

export function squareIndex(square: string): number {
  if (!/^[a-h][1-8]$/.test(square)) return -1
  return (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97
}

export function indexSquare(index: number): string {
  if (index < 0 || index >= 64) return ''
  return `${String.fromCharCode(97 + index % 8)}${8 - Math.floor(index / 8)}`
}

export function parseFen(fen: string): ChessPosition {
  const [placement, active = 'w', castling = '-', enPassant = '-'] = fen.trim().split(/\s+/)
  const ranks = placement?.split('/') ?? []
  if (ranks.length !== 8) throw new Error('The puzzle returned an invalid chess position.')
  const squares: Array<ChessPiece | null> = []
  for (const rank of ranks) {
    let count = 0
    for (const token of rank) {
      if (/\d/.test(token)) {
        const empty = Number(token)
        if (empty < 1 || empty > 8) throw new Error('The puzzle returned an invalid chess position.')
        squares.push(...Array(empty).fill(null))
        count += empty
      } else {
        const kind = pieceKinds[token.toLowerCase()]
        if (!kind) throw new Error('The puzzle returned an invalid chess position.')
        squares.push({ color: token === token.toUpperCase() ? 'white' : 'black', kind })
        count++
      }
    }
    if (count !== 8) throw new Error('The puzzle returned an invalid chess position.')
  }
  if (!['w', 'b'].includes(active) || squares.length !== 64) throw new Error('The puzzle returned an invalid chess position.')
  return {
    squares,
    turn: active === 'w' ? 'white' : 'black',
    castling,
    ...(enPassant !== '-' && squareIndex(enPassant) >= 0 ? { enPassant } : {}),
  }
}

export function applyUci(position: ChessPosition, move: string): ChessPosition {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error('The puzzle returned an invalid move.')
  const from = squareIndex(move.slice(0, 2))
  const to = squareIndex(move.slice(2, 4))
  const squares = [...position.squares]
  const piece = squares[from]
  if (!piece) throw new Error('The puzzle move starts from an empty square.')

  if (piece.kind === 'pawn' && !squares[to] && position.enPassant === move.slice(2, 4)) {
    const captured = to + (piece.color === 'white' ? 8 : -8)
    squares[captured] = null
  }
  if (piece.kind === 'king' && Math.abs(from % 8 - to % 8) === 2) {
    const homeRow = Math.floor(from / 8)
    const kingSide = to % 8 > from % 8
    const rookFrom = homeRow * 8 + (kingSide ? 7 : 0)
    const rookTo = homeRow * 8 + (kingSide ? 5 : 3)
    squares[rookTo] = squares[rookFrom]
    squares[rookFrom] = null
  }

  squares[from] = null
  const promotion = move[4]
  squares[to] = promotion ? { ...piece, kind: pieceKinds[promotion] ?? 'queen' } : piece
  const fromRow = Math.floor(from / 8)
  const toRow = Math.floor(to / 8)
  const enPassant = piece.kind === 'pawn' && Math.abs(fromRow - toRow) === 2
    ? indexSquare((from + to) / 2)
    : undefined
  return {
    squares,
    turn: position.turn === 'white' ? 'black' : 'white',
    castling: position.castling,
    ...(enPassant ? { enPassant } : {}),
  }
}

export function positionAfter(fen: string, moves: string[], count: number): ChessPosition {
  let position = parseFen(fen)
  for (const move of moves.slice(0, Math.max(0, count))) position = applyUci(position, move)
  return position
}
