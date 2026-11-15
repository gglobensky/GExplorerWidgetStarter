// tools/appearance-css.mjs
//
// SIZES THAT FOLLOW APPEARANCE (2026-11-14, GEM Shell A3e). A PostCSS plugin the build runs on every style a widget
// has (a .vue file's <style>, a .css file it imports): the author writes plain px, and the built CSS follows the user's
// Appearance settings (Settings ▸ Appearance: Text size, on top of the OS text scale; Roundness).
//
//   font-size, the font shorthand, line-height    13px -> calc(var(--base-font-size, 12px) * 13 / 12)   ("13px at 100 %")
//   border-radius and the per-corner forms         6px -> calc(var(--base-radius, 16px) * 6 / 16)         ("6px at 100 %")
//   a custom property named for a size            --my-font-size: 12px, --my-radius: 8px: the same
//   small boxes of a rule with a text size         .btn { width: 31px; font-size: 14px }  (px-ok): the 31px -> calc(var(--base-font-size,
//     (NEW 2026-11-15)                             12px) * 31 / 12): width, height, their min-/max- forms, inline-/block-size,
//                                                  flex-basis and flex, each px up to 64 (an icon button grows with its glyph;
//                                                  a panel or a column, larger, stays)
//   @container conditions (NEW 2026-11-14)        (max-width: 260px) -> (max-width: 21.6667em): the breakpoint moves
//                                                  with the text (em in a container query: the container's text size;
//                                                  @media is the window's size: left alone)
//
// Every px in those values, a clamp()'s limits and a var()'s fallback included. Nothing changes at 100 %: GEM Shell's
// --base-font-size is 12px and --base-radius 16px there. A line that really means px says so in a comment on that
// line: /* px-ok */. 0 and percentages are left alone; so is everything else (padding, width, gap...).
//
// Sizes set from code (an inline :style, el.style.fontSize) are not CSS the build sees: use textPx(13) / radiusPx(6)
// from 'gexplorer/widgets' there (npm run check:px lists them).
// GEM Shell has the same plugin for its own build and GEM Forge's (src/theme/appearanceCss.ts): KEEP THE TWO ALIKE.

const PX = /(?<![\w.#-])(\d+(?:\.\d+)?)px\b/g

const TEXT_PROPS = new Set(['font-size', 'font', 'line-height'])
// NEW (2026-11-15): a rule that sets a text size has its small boxes follow it (the glyph and its box stay together)
const BOX_PROPS = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'inline-size', 'block-size',
    'min-inline-size', 'min-block-size', 'max-inline-size', 'max-block-size', 'flex-basis', 'flex'])
export const BOX_MAX_PX = 64
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

/** NEW (2026-11-15): <value>'s px up to BOX_MAX_PX in text form (a box sized for its rule's text). */
export function adaptBox(value) {
    return value.replace(PX, (m, n) => (Number(n) === 0 || Number(n) > BOX_MAX_PX ? m : textPx(n)))
}

/** NEW (2026-11-15): the rule sets a text size the build converts (a px one, not px-ok). */
function setsTextSize(rule) {
    return (rule.nodes ?? []).some((d) => d.type === 'decl' && TEXT_PROPS.has(d.prop.toLowerCase())
        && PX_IN.test(d.prop.toLowerCase() === 'font' ? d.value.replace(/"[^"]*"|'[^']*'/g, '') : d.value) && !pxOk(d))
}
const PX_IN = /(?<![\w.#-])\d+(?:\.\d+)?px\b/

/** NEW (2026-11-14): a container query's px in em of a 12px text (the breakpoint follows the text size). */
export function adaptQuery(params) {
    return params.replace(PX, (m, n) => (Number(n) === 0 ? m : `${Math.round(Number(n) / 12 * 10000) / 10000}em`))
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
            // NEW (2026-11-15), first (it reads the text sizes as written): the small boxes of a rule with a text size
            root.walkRules((rule) => {
                if (!setsTextSize(rule)) return
                for (const decl of rule.nodes) {
                    if (decl.type !== 'decl' || !BOX_PROPS.has(decl.prop.toLowerCase()) || !decl.value.includes('px') || pxOk(decl)) continue
                    const next = adaptBox(decl.value)
                    if (next !== decl.value) decl.value = next
                }
            })
            root.walkDecls((decl) => {
                const prop = decl.prop.toLowerCase()
                const kind = TEXT_PROPS.has(prop) ? 'text' : isRadiusProp(prop) ? 'radius' : customKind(prop)
                if (!kind || !decl.value.includes('px') || pxOk(decl)) return
                // A font shorthand's family can be a quoted name: only what is outside quotes is changed there
                const next = prop === 'font' ? adaptOutsideQuotes(decl.value, kind) : adaptValue(decl.value, kind)
                if (next !== decl.value) decl.value = next
            })
            // NEW (2026-11-14): container queries' breakpoints
            root.walkAtRules((at) => {
                if (at.name.toLowerCase() !== 'container' || !at.params.includes('px') || pxOk(at)) return
                at.params = adaptQuery(at.params)
            })
        },
    }
}
appearanceCss.postcss = true

function adaptOutsideQuotes(value, kind) {
    return value.split(/("[^"]*"|'[^']*')/).map((part, i) => (i % 2 ? part : adaptValue(part, kind))).join('')
}
