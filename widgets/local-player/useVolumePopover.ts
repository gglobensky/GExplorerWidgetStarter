// useVolumePopover.ts - the 🔊 button's slider, through the shell's popover (2026-10-23)
//
// sdk.ui().openPopover puts VolumePopover in the host's overlay next to the button: never
// clipped by the player's place, kept on screen, closed by a click elsewhere, Esc, the button
// again or the button leaving the page. The slider follows the volume while it's open.
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import VolumePopover from './VolumePopover.vue'

export function useVolumePopover(opts: {
    volume: () => number
    onInput: (value: number) => void
    onMute?: () => void
}) {
    const sdk = inject<WidgetSdk | null>('widgetSdk', null)
    const open = ref(false)
    let handle: { close(): void; update(props: Record<string, unknown>): void } | null = null
    let seq = 0

    const props = () => ({ volume: opts.volume(), onInput: opts.onInput, onMute: opts.onMute })

    /** The button's click: opens it, or closes it when open (the shell's toggle). */
    function toggle(ev: MouseEvent) {
        const anchor = ev.currentTarget as HTMLElement | null
        if (!anchor || !sdk) return
        const mine = ++seq
        const h = sdk.ui().openPopover({
            anchor,
            component: VolumePopover,
            props: props(),
            placement: 'below',
            onClose: () => {
                if (mine !== seq) return
                handle = null
                open.value = false
            },
        })
        if (mine !== seq) return
        handle = h
        open.value = !!h
    }

    watch(opts.volume, () => handle?.update(props()))
    onBeforeUnmount(() => handle?.close())

    return { open, toggle }
}
