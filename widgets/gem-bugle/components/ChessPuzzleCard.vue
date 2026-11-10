<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { indexSquare, positionAfter, squareIndex, type ChessPiece } from '../features/chess'
import type { LichessDailyPuzzle } from '../features/providers/lichess'

const props = defineProps<{
  puzzle: LichessDailyPuzzle
  progress: number
}>()

const emit = defineEmits<{
  (event: 'update:progress', value: number): void
  (event: 'open'): void
}>()

const selected = ref('')
const feedback = ref('')
const position = computed(() => positionAfter(props.puzzle.fen, props.puzzle.solution, props.progress))
const orientation = computed(() => positionAfter(props.puzzle.fen, [], 0).turn)
const displayIndices = computed(() => {
  const indices = Array.from({ length: 64 }, (_, index) => index)
  return orientation.value === 'white' ? indices : indices.reverse()
})
const solved = computed(() => props.progress >= props.puzzle.solution.length)
const theme = computed(() => props.puzzle.themes
  .filter(value => !['short', 'long', 'middlegame', 'endgame', 'opening'].includes(value))
  .slice(0, 2)
  .map(value => value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
  .join(' · '))

watch(() => props.puzzle.id, () => {
  selected.value = ''
  feedback.value = ''
})

const glyphs: Record<string, string> = {
  'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
  'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
}

function glyph(piece: ChessPiece | null): string {
  return piece ? glyphs[`${piece.color}-${piece.kind}`] : ''
}

function squareLabel(index: number, piece: ChessPiece | null): string {
  const square = indexSquare(index)
  return piece ? `${square}, ${piece.color} ${piece.kind}` : `${square}, empty`
}

function choose(index: number): void {
  if (solved.value) return
  const square = indexSquare(index)
  const piece = position.value.squares[index]
  if (!selected.value) {
    if (!piece || piece.color !== position.value.turn) return
    selected.value = square
    feedback.value = ''
    return
  }
  if (selected.value === square) {
    selected.value = ''
    return
  }
  if (piece?.color === position.value.turn) {
    selected.value = square
    return
  }
  const fromPiece = position.value.squares[squareIndex(selected.value)]
  const promotion = fromPiece?.kind === 'pawn' && (square.endsWith('1') || square.endsWith('8')) ? 'q' : ''
  const baseMove = `${selected.value}${square}`
  const expected = props.puzzle.solution[props.progress]
  const attempted = expected?.startsWith(baseMove) ? expected : `${baseMove}${promotion}`
  selected.value = ''
  if (attempted !== expected) {
    feedback.value = 'That is not the editor’s move. Try another line.'
    return
  }
  let next = props.progress + 1
  if (next < props.puzzle.solution.length) next++
  emit('update:progress', next)
  feedback.value = next >= props.puzzle.solution.length ? 'Solved — a fine combination.' : 'Correct. The reply is on the board.'
}
</script>

<template>
  <section class="chess-card" aria-labelledby="bugle-chess-title">
    <header>
      <div>
        <span class="section-kicker">From Lichess</span>
        <h2 id="bugle-chess-title">Daily chess</h2>
      </div>
      <button type="button" @click="emit('open')">Open original</button>
    </header>
    <div class="chess-meta">
      <span>{{ orientation === 'white' ? 'White' : 'Black' }} to move</span>
      <span v-if="puzzle.rating">Rated {{ puzzle.rating }}</span>
      <span v-if="theme">{{ theme }}</span>
    </div>
    <div class="chess-board" role="group" :aria-label="`Daily chess puzzle. ${orientation} to move.`">
      <button
        v-for="index in displayIndices"
        :key="index"
        type="button"
        class="chess-square"
        :class="{ dark: (Math.floor(index / 8) + index % 8) % 2 === 1, selected: selected === indexSquare(index) }"
        :aria-label="squareLabel(index, position.squares[index])"
        :aria-pressed="selected === indexSquare(index)"
        @click="choose(index)"
      >{{ glyph(position.squares[index]) }}</button>
    </div>
    <p class="chess-status" aria-live="polite">{{ solved ? 'Solved — a fine combination.' : feedback || 'Select a piece, then its destination.' }}</p>
  </section>
</template>
