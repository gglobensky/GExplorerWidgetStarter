// widgets/monitor/inlineMenu.ts: the state of an InlineMenu (InlineMenu.vue), one per view.
import { reactive } from 'vue'

export type InlineMenuItem = {
    id?: string
    label?: string
    /** 'on': ✓; 'faint': a lighter ✓ (somewhere else: another page). */
    check?: 'on' | 'faint' | false
    /** a coloured dot before the label (a page's colour) */
    dot?: string
    /** a faint text after the label */
    hint?: string
    title?: string
    disabled?: boolean
    separator?: boolean
}

export function useInlineMenu(container: () => HTMLElement | null) {
    const state = reactive({
        open: false,
        label: '',
        items: [] as InlineMenuItem[],
        /** the anchor's rect and the container's size, in the container's coordinates */
        anchor: { top: 0, bottom: 0, left: 0, right: 0, width: 0 },
        box: { width: 0, height: 0 },
    })
    let resolve: ((id: string | null) => void) | null = null

    function open(anchor: HTMLElement, items: InlineMenuItem[], label = ''): Promise<string | null> {
        close(null)
        const c = container()
        if (!c) return Promise.resolve(null)
        const cr = c.getBoundingClientRect(), ar = anchor.getBoundingClientRect()
        Object.assign(state, {
            open: true, label, items: items.slice(0, 40),
            anchor: { top: ar.top - cr.top, bottom: ar.bottom - cr.top, left: ar.left - cr.left, right: ar.right - cr.left, width: ar.width },
            box: { width: cr.width, height: cr.height },
        })
        return new Promise(r => { resolve = r })
    }
    function close(id: string | null) {
        const r = resolve
        resolve = null
        state.open = false
        r?.(id)
    }
    return { state, open, close }
}

export type InlineMenuHandle = ReturnType<typeof useInlineMenu>
