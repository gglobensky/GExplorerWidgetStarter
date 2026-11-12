// widgets/items/globalSelection.ts
//
// ONE SELECTION ACROSS PANES (0.15.0, 2026-11-12, Guillaume): selecting in one Items pane clears the others, so there
// is one selection at a time (one count, one answer to "what does Delete / Copy act on"). Focusing another pane, or
// scrolling it, clears nothing: only a selection made there.
// Items instances share this module (the widget's bundle loads once), so this is a plain list of listeners.
// The file dialog's Items take no part (choosing a folder there must not clear the selection it's for).

type Listener = (from: symbol) => void
const listeners = new Set<Listener>()

/** This pane has a selection now: the others clear theirs. */
export function claimSelection(from: symbol): void {
  for (const l of [...listeners]) l(from)
}

/** Another pane made a selection; returns the unsubscribe. */
export function onSelectionClaimed(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
