<script setup lang="ts">
import { computed } from 'vue'
import type { Sudoku } from '../daily'

const props = defineProps<{
  sudoku: Sudoku
  modelValue: number[]
}>()

const emit = defineEmits<{ (event: 'update:modelValue', value: number[]): void }>()
const complete = computed(() => props.modelValue.every(Boolean))
const correct = computed(() => complete.value && props.modelValue.every((value, index) => value === props.sudoku.solution[index]))

function setCell(index: number, event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  const digit = input.value.replace(/[^1-9]/g, '').slice(-1)
  const next = [...props.modelValue]
  next[index] = digit ? Number(digit) : 0
  emit('update:modelValue', next)
}

function clear(): void {
  emit('update:modelValue', [...props.sudoku.puzzle])
}
</script>

<template>
  <section class="sudoku-card" aria-labelledby="bugle-sudoku-title">
    <div class="sudoku-heading">
      <div>
        <span class="section-kicker">Daily diversion</span>
        <h2 id="bugle-sudoku-title">Sudoku</h2>
      </div>
      <button type="button" @click="clear">Clear pencil</button>
    </div>
    <div class="sudoku-grid" role="group" aria-label="Daily Sudoku grid">
      <template v-for="(given, index) in sudoku.puzzle" :key="index">
        <span v-if="given" class="sudoku-cell sudoku-given">{{ given }}</span>
        <input
          v-else
          class="sudoku-cell"
          inputmode="numeric"
          maxlength="1"
          :value="modelValue[index] || ''"
          :aria-label="`Row ${Math.floor(index / 9) + 1}, column ${index % 9 + 1}`"
          @input="setCell(index, $event)"
        >
      </template>
    </div>
    <p class="sudoku-status" aria-live="polite">
      {{ correct ? 'Solved — splendid work.' : complete ? 'Not quite. The press desk found an error.' : `${sudoku.clues} clues · one solution` }}
    </p>
  </section>
</template>
