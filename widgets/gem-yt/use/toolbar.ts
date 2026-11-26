// GEM YT in the toolbar: a strip (parts/ToolbarStrip.vue) and its panel (parts/ToolbarPanel.vue). The page sits in
// the widget's frame (1 px, out of view: its sound keeps it running). ▣ or ☰ opens a panel under the strip
// (ui.openPopover); its body reports itself and the page moves over it (surface.moveTo: no reload), then YouTube's
// player or list is placed there (page regions). Closed: the page goes back to the frame, still playing.
import { computed, ref, shallowRef, watch, type Component, type Ref } from 'vue'
import { isWatchUrl } from '../core/watchLayout'
import { listPart, type ListTab } from '../parts/listTabs'

export type PanelView = 'video' | 'list'
type Panel = { handle: { close(): void; update(p: Record<string, unknown>): void }; view: PanelView; tab: ListTab; el: HTMLElement | null; w: number; h: number }

export function useToolbar(o: {
  sdk: unknown
  /** the web surface (null until the page is open) */
  surface: () => any
  frame: Ref<HTMLElement | null>
  nowInfo: Ref<Record<string, string | null>>
  nowLine: Ref<string>
  media: Ref<{ playing: boolean } & Record<string, unknown> | null>
  sound: Ref<{ playing: boolean; muted: boolean }>
  currentUrl: Ref<string>
  avatar: () => string | undefined
  panelComponent: Component
  snack: (text: string) => void
  status: Ref<string>
}) {
  const watchingVideo = computed(() => !!o.nowInfo.value.videoId || isWatchUrl(o.currentUrl.value))
  const stripTitle = computed(() => (watchingVideo.value ? o.nowInfo.value.title || o.nowLine.value || 'YouTube' : 'YouTube'))
  const stripAvatar = computed(o.avatar)
  const stripInitial = computed(() => (o.nowInfo.value.channelName || 'Y').slice(0, 1).toUpperCase())
  const canMedia = computed(() => typeof o.surface()?.media === 'function' || !!o.media.value)

  const panel = shallowRef<Panel | null>(null)
  const tick = ref(0)
  const panelView = computed(() => { void tick.value; return panel.value?.view ?? null })
  let sent = ''

  function panelProps(view: PanelView, tab: ListTab) {
    return {
      view, tab, watching: watchingVideo.value, title: stripTitle.value, queue: o.nowInfo.value.queue ?? null,
      onBody: panelBody, onView: (v: PanelView) => setPanel(v, null), onTab: (t: ListTab) => setPanel(null, t),
    }
  }
  function openPanel(view: PanelView, anchor: HTMLElement) {
    const ui = (o.sdk as any)?.ui?.()
    const s = o.surface()
    if (!s || !ui?.openPopover) return
    if (typeof s.moveTo !== 'function') { o.snack('This GEM Shell can’t show the video in a panel yet.'); return }
    const old = panel.value
    if (old) old.handle.close()
    if (old && old.view === view) return
    const tab: ListTab = old?.tab ?? 'upNext'
    let mine: Panel | null = null
    const h = ui.openPopover({
      anchor, component: o.panelComponent, props: panelProps(view, tab), placement: 'below', maxWidth: 640, maxHeight: 640,
      onClose: () => { if (panel.value === mine) { panel.value = null; tick.value++; sent = ''; pageHome() } },
    })
    if (!h) return
    mine = { handle: h, view, tab, el: null, w: 0, h: 0 }
    panel.value = mine
    tick.value++
  }
  function setPanel(view: PanelView | null, tab: ListTab | null) {
    const p = panel.value
    if (!p) return
    p.view = view ?? p.view
    p.tab = tab ?? p.tab
    p.handle.update(panelProps(p.view, p.tab))
    tick.value++
  }
  /** The panel's body (null: gone), with its size */
  function panelBody(el: HTMLElement | null, w: number, h: number) {
    const p = panel.value
    if (!p) return
    if (!el) { if (p.el) { p.el = null; pageHome() } return }
    if (el !== p.el) {
      if (!o.surface()?.moveTo?.(el)) return
      p.el = el
    }
    p.w = w; p.h = h
    tick.value++
  }
  /** The page back in the frame (out of view): the whole page again, so a panel opened later starts clean */
  function pageHome() {
    const s = o.surface()
    if (!s || !o.frame.value) return
    s.moveTo?.(o.frame.value)
    void s.regions?.('youtube', null)
  }
  // What the panel's body shows: YouTube's player or its list, else the whole page (not on a video: browse, pick one)
  watch(() => [tick.value, watchingVideo.value, o.nowInfo.value.queue] as const, () => {
    const p = panel.value
    const s = o.surface()
    if (!p?.el || !s?.regions || p.w < 120 || p.h < 68) return
    const part = p.view === 'video' ? 'player' : listPart(p.tab, !!o.nowInfo.value.queue)
    const place = watchingVideo.value ? { [part]: { x: 0, y: 0, width: Math.floor(p.w), height: Math.floor(p.h) } } : null
    const k = JSON.stringify(place)
    if (k === sent) return
    sent = k
    void s.regions('youtube', place).then((r: any) => { if (r && !r.ok) o.status.value = `Panel: ${r.error ?? r.reason}` })
  })
  // The panel's head follows what's playing
  watch(() => [watchingVideo.value, stripTitle.value, o.nowInfo.value.queue] as const, () => {
    const p = panel.value
    if (p) p.handle.update(panelProps(p.view, p.tab))
  })

  async function toggleMedia() {
    const s = o.surface()
    if (!s?.media) return
    const r = await s.media('toggle')
    if (r?.ok && o.media.value) o.media.value = { ...o.media.value, playing: r.playing }
  }
  function toggleMute() { o.surface()?.mute?.(!o.sound.value.muted) }
  /** The widget is leaving: the panel closes */
  function closePanel() { const p = panel.value; panel.value = null; p?.handle.close() }

  return { watchingVideo, stripTitle, stripAvatar, stripInitial, canMedia, panelView, openPanel, toggleMedia, toggleMute, closePanel }
}
