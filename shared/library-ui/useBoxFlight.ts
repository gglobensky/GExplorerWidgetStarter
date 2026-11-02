// shared/library-ui/useBoxFlight.ts
//
// Taking a box off the shelf, for any shop (3.3.0; the Game Shop's first, 0.17.2): opening a box, a copy of it slides
// from the shelf to where the open case will be, growing to its size (0.5 s), and the store page appears around it
// once it's there; closing, it shrinks back into its place on the shelf (the box there hidden until it lands).
//
//   const { notePick } = useBoxFlight(root, openId, { shelves: '.my-browse' })
//   <main class="my-browse" @click.capture="notePick">…</main>
//
// root: the widget's gem-library-surface element (the copy is drawn in it); openId: the open item's id (null: none);
// shelves: where its boxes are (a selector inside root). Only when the open page is a StoreDetail (`.glu-sd`): other
// pages (the Video Club's Classic details) open as before. Nothing moves with "reduce motion" (fly.ts).
import { watch, type Ref } from 'vue'
import { flyCopy } from './fly'

export function useBoxFlight(root: Ref<HTMLElement | null>, openId: Ref<string | null | undefined>, options: { shelves: string }) {
  let pickedCase: HTMLElement | null = null
  let closingFrom: DOMRect | null = null

  /** Notes the box clicked (bind with @click.capture on the shelves' container: before the open). */
  function notePick(event: Event) {
    const target = event.target as HTMLElement | null
    pickedCase = target?.closest?.<HTMLElement>('.glu-case') ?? null
  }

  /** The box on screen for this item: the one clicked, else the first of it the shelves show. */
  function boxOnShelf(id: string): HTMLElement | null {
    if (pickedCase?.isConnected && pickedCase.dataset.itemId === id) return pickedCase
    return root.value?.querySelector<HTMLElement>(`${options.shelves} .glu-case[data-item-id="${CSS.escape(id)}"]`) ?? null
  }

  // Before the open case goes: where it was, to fly back from
  watch(openId, (id, prev) => {
    if (id || !prev) return
    const open = root.value?.querySelector<HTMLElement>('.glu-sd-case')
    closingFrom = open ? open.getBoundingClientRect() : null
  }, { flush: 'pre' })

  watch(openId, async (id, prev) => {
    const host = root.value
    if (!host) return
    if (id && !prev) {
      const shell = boxOnShelf(id)?.querySelector<HTMLElement>('.glu-case-shell')
      const page = host.querySelector<HTMLElement>('.glu-sd')
      const target = page?.querySelector<HTMLElement>('.glu-sd-case')
      if (shell && page && target) {
        page.classList.add('glu-sd-waiting')
        const to = target.getBoundingClientRect()
        await flyCopy(host, shell, shell.getBoundingClientRect(), to, [], { keepMs: 260 })
        page.classList.remove('glu-sd-waiting')
        page.classList.add('glu-sd-arrived')
      }
    } else if (!id && prev) {
      const from = closingFrom
      closingFrom = null
      const box = boxOnShelf(prev)
      const shell = box?.querySelector<HTMLElement>('.glu-case-shell')
      if (from && box && shell) await flyCopy(host, shell, from, shell.getBoundingClientRect(), [box.querySelector<HTMLElement>('.glu-case-body')])
    }
    if (!id) pickedCase = null
  }, { flush: 'post' })

  return { notePick }
}
