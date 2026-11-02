import assert from 'node:assert/strict'
import { test } from 'node:test'
import { staffPicks, titleLetter, titleRange, yearRange } from '../../../shared/library-ui/shelfLabels.ts'
import { gameTag, pickNote, pickScore } from '../shelf-labels.ts'

const g = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, year: 2000, playtimeMinutes: undefined, ...extra }) as any

test('the strips: letters and years', () => {
  assert.equal(titleLetter('The Witcher 3'), 'W')
  assert.equal(titleLetter('7 Days to Die'), '#')
  assert.equal(titleLetter('Élite'), 'E')
  assert.equal(titleRange([{ title: 'Alan Wake' }, { title: 'Doom' }]), 'A – D')
  assert.equal(titleRange([{ title: 'Myst' }, { title: 'Mario' }]), 'M')
  assert.equal(titleRange([]), undefined)
  assert.equal(yearRange([{ year: 2004 }, { year: 1998 }, { year: 0 }]), '1998 – 2004')
  assert.equal(yearRange([{ year: 0 }]), undefined)
})

test('staff picks: the best, one a dozen, not side by side', () => {
  const items = Array.from({ length: 24 }, (_, i) => ({ id: `g${i}` }))
  const score = (it: { id: string }) => ({ g3: 95, g4: 94, g10: 90, g11: 50 } as Record<string, number>)[it.id]
  assert.deepEqual([...staffPicks(items, score)].sort(), ['g10', 'g3'])
  assert.equal(staffPicks(items.slice(0, 5), () => 70).size, 0)
  assert.equal(staffPicks(items.slice(0, 3), it => (it.id === 'g1' ? 85 : undefined)).size, 1)
})

test('the Game Shop words: play time first, then players, critics, IGDB', () => {
  assert.equal(gameTag(g('a', { playtimeMinutes: 37 * 60 + 10 }), undefined), '37 h played')
  assert.equal(gameTag(g('a', { playtimeMinutes: 90 }), undefined), '1.5 h played')
  assert.equal(gameTag(g('a'), { reviews: { desc: '', score: 9, positive: 940, total: 1000 } }), '94% liked')
  assert.equal(gameTag(g('a'), { reviews: { desc: '', score: 0, positive: 9, total: 10 } }), undefined)
  assert.equal(gameTag(g('a'), { metacritic: 88 }), 'Metacritic 88')
  assert.equal(gameTag(g('a'), { igdbRating: 86.4, igdbRatingCount: 40 }), 'IGDB 86')
  assert.equal(pickScore({ metacritic: 91 }), 91)
  assert.match(pickNote(g('a', { playtimeMinutes: 140 * 60 }), undefined), /\n140 h and counting$/)
  assert.match(pickNote(g('a'), { reviews: { desc: '', score: 9, positive: 95, total: 100 } }), /\n95% of players loved it$/)
})
