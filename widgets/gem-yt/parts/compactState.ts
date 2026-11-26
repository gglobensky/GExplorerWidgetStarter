// What the sidebar's compact player keeps per copy (Widget.vue saves it in the copy's state, under `compact`): the
// video's height, the list's tab and ⤢.
import type { ListTab } from './listTabs'

export type CompactSaved = { videoH: number | null; tab: ListTab; full: boolean }

/** A saved value, checked (anything else: the defaults). */
export function readCompact(raw: unknown): CompactSaved {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const h = r.videoH
  return {
    videoH: typeof h === 'number' && Number.isFinite(h) && h >= 68 && h <= 4000 ? Math.round(h) : null,
    tab: r.tab === 'queue' || r.tab === 'description' ? r.tab : 'upNext',
    full: r.full === true,
  }
}
