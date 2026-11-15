// widgets/console/termTheme.ts
//
// The terminal's colours (0.2.0: moved from Widget.vue, shared with TerminalPart.vue): GEM Console's CSS variables
// (console.css) read by a probe inside <at>, as #rrggbb (xterm.js reads no oklab() / color()).
export function termColors(at: HTMLElement | null): Record<string, string> {
    if (!at) return {}
    const probe = document.createElement('span')
    probe.style.display = 'none'
    at.appendChild(probe)
    // As #rrggbb: a theme's colour may compute to oklab() / color(), which xterm.js doesn't read (it drew black)
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const hex = (c: string, fallback: string) => {
        if (!ctx) return fallback
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = fallback
        ctx.fillStyle = c
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        return a === 0 ? fallback : '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
    }
    const read = (css: string, fallback: string) => {
        probe.style.color = ''
        probe.style.color = css
        const c = getComputedStyle(probe).color
        return c && c !== 'rgba(0, 0, 0, 0)' ? hex(c, fallback) : fallback
    }
    const out = {
        background: read('var(--gc-term)', '#151518'),
        foreground: read('var(--gc-fg)', '#e6e6e6'),
        cursor: read('var(--gc-accent)', '#5aa9d6'),
        cursorAccent: read('var(--gc-term)', '#151518'),
        selectionBackground: 'rgba(90, 169, 214, .35)',
    }
    probe.remove()
    return out
}
