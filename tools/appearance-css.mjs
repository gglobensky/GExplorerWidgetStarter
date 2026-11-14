// tools/appearance-css.mjs
//
// SIZES THAT FOLLOW APPEARANCE (2026-11-14, GEM Shell A3e). A PostCSS plugin the build runs on every style a widget
// has (a .vue file's <style>, a .css file it imports): the author writes plain px, and the built CSS follows the user's
// Appearance settings (Settings ▸ Appearance: Text size, on top of the OS text scale; Roundness).
//
//   font-size, the font shorthand, line-height    13px -> calc(var(--base-font-size, 12px) * 13 / 12)   ("13px at 100 %")
//   border-radius and the per-corner forms         6px -> calc(var(--base-radius, 16px) * 6 / 16)         ("6px at 100 %")
//   a custom property named for a size            --my-font-size: 12px, --my-radius: 8px: the same
//
// Every px in those values, a clamp()'s limits and a var()'s fallback included. Nothing changes at 100 %: GEM Shell's
// --base-font-size is 12px and --base-radius 16px there. A line that really means px says so in a comment on that
// line: /* px-ok */. 0 and percentages are left alone; so is everything else (padding, width, gap...).
//
// Sizes set from code (an inline :style, el.style.fontSize) are not CSS the build sees: use the SDK's textPx(13) /
// radius(6) there (npm run check:px lists them). The same rule as GEM Shell's own code (its scripts/check-fixed-px.mjs).

const PX = /(?<![\w.#-])(\d+(?:\.\d+)?)px\b/g

const TEXT_PROPS = new Set(['font-size', 'font', 'line-height'])
const isRadiusProp = (p) => /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/.test(p)
const customKind = (p) => /^--[\w-]*radius[\w-]*$/i.test(p) ? 'radius' : /^--[\w-]*font(-size)?[\w-]*$/i.test(p) ? 'text' : null

const trim = (n) => String(Number(n))
// With their 100 % values as fallbacks: a built widget looks right where GEM Shell's tokens aren't (its preview page)
export const textPx = (n) => `calc(var(--base-font-size, 12px) * ${trim(n)} / 12)`
export const radiusPx = (n) => `calc(var(--base-radius, 16px) * ${trim(n)} / 16)`

// The fallbacks this step writes (var(--base-font-size, 12px)): never converted again
const OWN_FALLBACK = /var\(--base-(?:font-size|radius),\s*\d+(?:\.\d+)?px\)/g

/**
 * <value> with its px sizes in Appearance form (<kind>: 'text' or 'radius'). Exported for tests and other builds.
 * Idempotent (FIXED 2026-11-14: a build hung): what it already wrote is left as is.
 */
export function adaptValue(value, kind) {
    const to = kind === 'radius' ? radiusPx : textPx
    const kept = []
    const hidden = value.replace(OWN_FALLBACK, (m) => `\u0000${kept.push(m) - 1}\u0000`)
    const out = hidden.replace(PX, (m, n) => (Number(n) === 0 ? m : to(n)))
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)])
}

/** The declaration's source line says px-ok (a comment on that line). */
function pxOk(decl) {
    const css = decl.source?.input?.css
    const line = decl.source?.start?.line
    if (!css || !line) return false
    const text = css.split(/\r?\n/)[line - 1] ?? ''
    return text.includes('px-ok')
}

/** The plugin: appearanceCss() in a PostCSS plugin list (Vite: css.postcss.plugins). */
export function appearanceCss() {
    return {
        postcssPlugin: 'gex-appearance-sizes',
        // FIXED (2026-11-14, a build hung on a widget's style): ONE pass over the stylesheet. A Declaration visitor is
        // run again on every declaration it changed, and the px fallback it wrote was converted again, forever.
        Once(root) {
            root.walkDecls((decl) => {
                const prop = decl.prop.toLowerCase()
                const kind = TEXT_PROPS.has(prop) ? 'text' : isRadiusProp(prop) ? 'radius' : customKind(prop)
                if (!kind || !decl.value.includes('px') || pxOk(decl)) return
                // A font shorthand's family can be a quoted name: only what is outside quotes is changed there
                const next = prop === 'font' ? adaptOutsideQuotes(decl.value, kind) : adaptValue(decl.value, kind)
                if (next !== decl.value) decl.value = next
            })
        },
    }
}
appearanceCss.postcss = true

function adaptOutsideQuotes(value, kind) {
    return value.split(/("[^"]*"|'[^']*')/).map((part, i) => (i % 2 ? part : adaptValue(part, kind))).join('')
}
