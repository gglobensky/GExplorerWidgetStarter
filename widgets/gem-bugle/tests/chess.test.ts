import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyUci, indexSquare, parseFen, positionAfter, squareIndex } from '../features/chess.ts'

test('chess coordinates and FEN parsing preserve side to move', () => {
  assert.equal(squareIndex('a8'), 0)
  assert.equal(squareIndex('h1'), 63)
  assert.equal(indexSquare(36), 'e4')
  const position = parseFen('8/8/8/8/4P3/8/8/4K2k b - - 0 1')
  assert.equal(position.turn, 'black')
  assert.equal(position.squares[squareIndex('e4')]?.kind, 'pawn')
  assert.equal(position.squares[squareIndex('e4')]?.color, 'white')
})

test('UCI application handles ordinary moves, castling, promotion, and en passant', () => {
  const ordinary = applyUci(parseFen('8/8/8/8/8/8/4P3/4K2k w - - 0 1'), 'e2e4')
  assert.equal(ordinary.squares[squareIndex('e4')]?.kind, 'pawn')
  assert.equal(ordinary.enPassant, 'e3')

  const castle = applyUci(parseFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1'), 'e1g1')
  assert.equal(castle.squares[squareIndex('g1')]?.kind, 'king')
  assert.equal(castle.squares[squareIndex('f1')]?.kind, 'rook')

  const promotion = applyUci(parseFen('7k/P7/8/8/8/8/8/7K w - - 0 1'), 'a7a8n')
  assert.equal(promotion.squares[squareIndex('a8')]?.kind, 'knight')

  const enPassant = applyUci(parseFen('7k/8/8/3pP3/8/8/8/7K w - d6 0 1'), 'e5d6')
  assert.equal(enPassant.squares[squareIndex('d6')]?.kind, 'pawn')
  assert.equal(enPassant.squares[squareIndex('d5')], null)
})

test('a puzzle position can be reconstructed from persisted move progress', () => {
  const position = positionAfter('7k/8/8/8/8/8/4R3/7K w - - 0 1', ['e2e8', 'h8g7'], 2)
  assert.equal(position.squares[squareIndex('g7')]?.kind, 'king')
  assert.equal(position.squares[squareIndex('e8')]?.kind, 'rook')
  assert.equal(position.turn, 'white')
})
