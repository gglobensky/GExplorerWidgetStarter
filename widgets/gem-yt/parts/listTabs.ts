// The list beside a compact player (the sidebar's, the toolbar panel's): YouTube's Up next, your queue, or the video's
// description (its channel, Subscribe, likes): page regions of those names (rules/youtube.json).
export type ListTab = 'upNext' | 'queue' | 'description'

/** The region to place for a tab: the queue only while YouTube has one (else Up next). */
export function listPart(tab: ListTab, hasQueue: boolean): ListTab {
  return tab === 'queue' && !hasQueue ? 'upNext' : tab
}
