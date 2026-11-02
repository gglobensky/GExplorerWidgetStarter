// widgets/game-library/playtime-quips.ts
//
// What the shop clerk says about your play time (0.10.1, Guillaume's idea): a short line under the time played,
// picked at random once per milestone and kept until the next one (library-store.ts `quips`), so two players can
// compare what they got. To add lines, add them here:
//   QUIPS.default[<hours>]           every game's lines from that many hours on (0: played, less than an hour)
//   QUIPS.games['steam:<app id>']    or 'title:<titleKey>' (games.ts titleKey): one game's own lines
//     mode 'add'      its lines join the default ones for the milestones it has
//     mode 'replace'  its lines are the only ones for the milestones it has (the others stay the default's)

/** The milestones, in hours. */
export const MILESTONES = [0, 1, 5, 10, 40, 100, 200, 500, 1000, 2000, 4000] as const
export type Milestone = (typeof MILESTONES)[number]

export type QuipLines = Partial<Record<Milestone, string[]>>
export type GameQuips = { mode: 'add' | 'replace'; lines: QuipLines }
export type QuipBook = { default: QuipLines; games: Record<string, GameQuips> }

export const QUIPS: QuipBook = {
  default: {
    0: [
      'Still smells like new plastic.',
      'The tutorial says hello.',
      "You've read the box longer than you've played it.",
    ],
    1: [
      'Officially past the opening cutscene.',
      'One hour in: you found the settings menu.',
      'Long enough to have opinions.',
    ],
    5: [
      'You know where the save button is now.',
      'The game is starting to remember your name.',
      'Five hours: a solid first date.',
    ],
    10: [
      'Double digits. Your chair has a dent now.',
      "You've stopped reading the tooltips.",
      'This is no longer a phase.',
    ],
    40: [
      'A full work week, but fun.',
      'You could have learned to juggle. You chose this.',
      'The loading screens are repeating their tips.',
    ],
    100: [
      'Triple digits. The game sends you holiday cards.',
      "You've earned a loyalty sticker.",
      "At this point it's a relationship.",
    ],
    200: [
      'Your mouse has asked for overtime pay.',
      'The townsfolk know your footsteps.',
      'The soundtrack plays in your dreams now.',
    ],
    500: [
      "That's three weeks of your life. No regrets?",
      'Half a thousand hours. The developers would like a word.',
      'You could play the credits from memory.',
    ],
    1000: [
      'A second home, with a pause button.',
      'Somewhere, the sun misses you.',
      "You're part of the furniture now.",
    ],
    2000: [
      'The game plays you now.',
      'Archaeologists will study your save file.',
      "That's a part-time job you paid for.",
    ],
    4000: [
      'Legends speak of your keyboard.',
      "You don't play this game. You live in it.",
      'Have you considered a monument?',
    ],
  },
  games: {
    // 7 Days to Die: a few of its own, with the default ones
    'steam:251570': {
      mode: 'add',
      lines: {
        10: ['Ten hours, and you still check behind every door.'],
        100: ["A hundred hours, and the zombies still don't knock."],
        1000: ['Day after day after day. The horde knows your address.'],
      },
    },
    // Portal 2: its own line at 10 hours, instead of the default ones
    'steam:620': {
      mode: 'replace',
      lines: {
        10: ['You think in portals now. Doors feel old-fashioned.', 'The turrets have started to like you.'],
      },
    },
  },
}

/** The milestone reached with <minutes> played; undefined when never played. */
export function milestoneOf(minutes: number | undefined): Milestone | undefined {
  if (!minutes || minutes <= 0) return undefined
  let reached: Milestone = 0
  for (const m of MILESTONES) if (minutes >= m * 60) reached = m
  return reached
}

/** The lines for one game at one milestone: its own (replace), or its own with the default ones (add). */
export function linesFor(book: QuipBook, keys: string[], milestone: Milestone): string[] {
  const base = book.default[milestone] ?? []
  for (const key of keys) {
    const own = book.games[key]
    const lines = own?.lines[milestone]
    if (!own || !lines?.length) continue
    return own.mode === 'replace' ? [...lines] : [...base, ...lines]
  }
  return [...base]
}

export type KeptQuip = { at: Milestone; text: string }

/**
 * The line to show: the one kept while the milestone is the same (and the line still exists), else a new one at
 * random. undefined when never played or no line exists.
 */
export function pickQuip(book: QuipBook, keys: string[], minutes: number | undefined, kept?: KeptQuip, random: () => number = Math.random): KeptQuip | undefined {
  const at = milestoneOf(minutes)
  if (at === undefined) return undefined
  const lines = linesFor(book, keys, at)
  if (!lines.length) return undefined
  if (kept && kept.at === at && lines.includes(kept.text)) return kept
  return { at, text: lines[Math.min(lines.length - 1, Math.floor(random() * lines.length))] }
}

/** "22 h", "45 min", "1.5 h". */
export function hoursText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours).toLocaleString()} h`
}
