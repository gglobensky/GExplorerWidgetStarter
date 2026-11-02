// widgets/game-library/online/lookup-job.ts
//
// The look-up as a background job (0.14.0): entry.ts declares the kind (`jobs.lookup`, its card LookUpCard.vue);
// Widget.vue starts it once a run has games to look up and ends it when the run does. The job keeps the Game Shop's
// instance alive off screen, so the run goes on (Steam, SteamGridDB and IGDB pace their own requests); the card's
// Stop ends the job, and the run stops after the games it's on. What's still due is looked up at the next start
// (nothing to resume: each game says when it was asked).
// The run's state is in the lifecycle's cells (these keys): the Game Shop once back on screen and the card read them.

export const LOOKUP_JOB = 'lookup'
export const DETAILS_CELL = 'game-library.details'
export const DETAILS_LOADED_CELL = 'game-library.detailsLoaded'
export const LOOKING_UP_CELL = 'game-library.lookingUp'
export const LOOKUP_PROGRESS_CELL = 'game-library.lookUpProgress'
export const ONLINE_NOTE_CELL = 'game-library.onlineNote'

/** How far the run is: games done, games due; force: "Look up details again" (every game). */
export type LookUpProgress = { done: number; total: number; force?: boolean }

/** The card's title: "Game details · 12 of 340". */
export function lookUpTitle(done: number, total: number): string {
  return `Game details · ${Math.min(done, total)} of ${total}`
}

/** About how long the rest takes (two games at a time, ~1.8 s a request, ~2 requests a game): "about 4 min". */
export function timeLeft(done: number, total: number): string {
  const seconds = Math.max(0, total - done) * 1.8
  if (seconds < 60) return 'under a minute'
  return `about ${Math.round(seconds / 60)} min`
}
