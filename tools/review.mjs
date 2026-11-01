// tools/review.mjs
//
// THE PACKAGING CHECK (GEM Shell 2026-10-31, Session E5e; claude/overlay-hardening-design.md M6)
// Every build reads the widget's sources (and the shared libraries it imports) for what GEM Shell refuses or
// changes at run time, so a widget author learns it at build time, and the official repo's review gets the list:
//
//   ERRORS (the build stops unless the widget allows the rule, with a reason)
//     page-root   document.body / document.documentElement: GEM Shell refuses a widget inserting into <body> / <html>
//     top-layer   showModal(), showPopover(), togglePopover(), <dialog>, the popover attribute: refused / hidden
//     iframe      an <iframe>: a page inside the widget, out of GEM Shell's checks
//     eval        eval(), new Function(): code made from text, unreviewable
//     page-keys   a keydown / keyup / keypress / input / beforeinput listener on window or document: it only sees
//                 the keys typed in the widget's own box
//   WARNINGS (built; listed for the review)
//     teleport    <Teleport to=…>: from GEM Shell E5c it lands in the widget's overlay layer (its box + 24 px)
//     fixed       position: fixed: relative to the widget's box (GEM Shell contains it), or the window in its overlay layer
//     shadow      attachShadow(): a shadow root (GEM Shell's styles and checks see less of it)
//
// ALLOWING A RULE (a reviewed case): widgets/<type>/review.allow.json
//     { "allow": { "<rule>": "<why this widget needs it: at least 15 characters>" } }
//   or, for one build only, `npm run build -- <type> --allow <rule>` (recorded as such, no reason).
//
// The result: dist/reviews/<type>.json (rule, level, file, line, the line's text, allowed and why), next to the
// build (not in dist/runtime-widgets/<type>/, which holds exactly index.js: what GEM Shell hashes). After the build
// the bundle itself is read too: an error rule found in index.js but not in the sources (a bundled npm package) is
// listed as a warning.
//
// Comments are left out of the reading (they can't run). Not a wall: what a regular expression can see. The repo's
// human / AI review reads the code itself.
import fs from 'node:fs'
import path from 'node:path'
import { closure, sharedDir, LibraryError } from './libs.mjs'

export const RULES = [
    {
        id: 'page-root', level: 'error',
        test: /\bdocument\s*\.\s*(body|documentElement)\b/,
        what: 'reaches the page\'s <body> / <html>: GEM Shell refuses a widget inserting there',
        fix: 'draw in your own box; outside it, use sdk.ui().menu, sdk.ui().openPopover or a message box',
    },
    {
        id: 'top-layer', level: 'error',
        test: /\.\s*(showModal|showPopover|togglePopover)\s*\(|<dialog\b|<[A-Za-z][^>]*\spopover(?=[\s=>\/])|\.popover\s*=\s*['"`]|setAttribute\s*\(\s*['"`]popover['"`]/,
        what: 'uses the browser\'s top layer (a modal <dialog>, a popover): GEM Shell refuses or hides it',
        fix: 'use a message box (sdk.ui().messageBox) or sdk.ui().openPopover',
    },
    {
        id: 'iframe', level: 'error',
        test: /<iframe\b|createElement\s*\(\s*['"`]iframe['"`]/i,
        what: 'makes an <iframe>: a page inside the widget, out of GEM Shell\'s checks',
        fix: 'show the content yourself; web pages open in the browser (sdk.openUrl)',
    },
    {
        id: 'eval', level: 'error',
        test: /(^|[^.\w$])eval\s*\(|\bnew\s+Function\s*\(/,
        what: 'makes code from text (eval / new Function): nobody can review what it runs',
        fix: 'write the code itself',
    },
    {
        id: 'page-keys', level: 'error',
        test: /\b(window|document)\s*\.\s*(addEventListener\s*\(\s*['"`](keydown|keyup|keypress|input|beforeinput)['"`]|on(keydown|keyup|keypress|input|beforeinput)\s*=(?!=))/,
        what: 'listens to keys page-wide: GEM Shell lets it see only the keys typed in the widget\'s own box',
        fix: 'listen on your own elements; actions on keys are commands (entry.ts commands, README "Keys")',
    },
    {
        id: 'teleport', level: 'warning',
        test: /<Teleport\b[^>]*\bto\s*=/i,
        what: 'teleports: from GEM Shell E5c it lands in your overlay layer (your box + 24 px) or a GEM Shell target inside your box, whatever `to` says',
        fix: 'for menus and panels outside your box, use sdk.ui().menu or sdk.ui().openPopover',
    },
    {
        id: 'fixed', level: 'warning',
        test: /position\s*:\s*fixed\b|\.position\s*=\s*['"`]fixed['"`]/,
        what: 'position: fixed: inside your box it is relative to your box (GEM Shell contains it); in your overlay layer, to the window (clipped to your box + 24 px from E5c)',
        fix: 'inside your box, position: absolute says the same, clearly; outside it, sdk.ui().openPopover',
    },
    {
        id: 'shadow', level: 'warning',
        test: /\.\s*attachShadow\s*\(/,
        what: 'makes a shadow root: GEM Shell\'s styles and checks see less of it',
        fix: 'scoped styles (<style scoped>) are enough in a widget',
    },
]
const RULE_IDS = new Set(RULES.map(r => r.id))
const MIN_REASON = 15

export class ReviewError extends Error {}
const fail = (m) => { throw new ReviewError(m) }
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/')

/** The text with its comments blanked (newlines kept, so line numbers hold). Strings are left alone. */
export function stripComments(text, file) {
    const blank = (s) => s.replace(/[^\n]/g, ' ')
    let out = text.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        (m, str) => (str ? m : blank(m)))
    if (/\.vue$/i.test(file)) out = out.replace(/<!--[\s\S]*?-->/g, blank)
    return out
}

/** The files read: sources and styles (tests, previews and node_modules left out). */
export function sourceFiles(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (e.name === 'tests' || e.name === 'preview' || e.name === 'node_modules') continue
            out.push(...sourceFiles(path.join(dir, e.name)))
        } else if (/\.(vue|ts|js|mjs|css)$/.test(e.name)) out.push(path.join(dir, e.name))
    }
    return out.sort()
}

/** widgets/<type>/review.allow.json: { allow: { rule: reason } }, checked. */
function readAllowFile(root, dir) {
    const file = path.join(dir, 'review.allow.json')
    if (!fs.existsSync(file)) return {}
    let j
    try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) }
    catch (e) { fail(`${rel(root, file)}: ${e.message}`) }
    const allow = j?.allow
    if (!allow || typeof allow !== 'object' || Array.isArray(allow)) fail(`${rel(root, file)}: { "allow": { "<rule>": "<reason>" } }.`)
    for (const [rule, reason] of Object.entries(allow)) {
        if (!RULE_IDS.has(rule)) fail(`${rel(root, file)}: unknown rule "${rule}" (${[...RULE_IDS].join(', ')}).`)
        if (typeof reason !== 'string' || reason.trim().length < MIN_REASON)
            fail(`${rel(root, file)}: "${rule}" needs its reason (why this widget needs it, at least ${MIN_REASON} characters).`)
    }
    return allow
}

/** The shared libraries a widget's files import ('@shared/<name>'), with the libraries they use. */
function librariesOf(root, files) {
    const names = new Set()
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`]@shared\/([a-z0-9-]+)/g)) names.add(m[1])
    const all = new Map()
    for (const n of names) {
        try { for (const [k, v] of closure(root, n)) all.set(k, v) }
        catch (e) { if (!(e instanceof LibraryError)) throw e }   // the build's own plugin says what's wrong
    }
    return [...all.keys()].sort()
}

/**
 * Reads widget <type>'s sources and styles (and its libraries'). <cliAllow>: rules allowed on the command line.
 * Returns { type, findings, blocking, allowed, libraries }.
 */
export function reviewWidget({ root, type, dir, cliAllow = [] }) {
    for (const r of cliAllow) if (!RULE_IDS.has(r)) fail(`--allow: unknown rule "${r}" (${[...RULE_IDS].join(', ')}).`)
    const allowFile = readAllowFile(root, dir)
    const own = sourceFiles(dir)
    const libraries = librariesOf(root, own)
    const files = [...own, ...libraries.flatMap(l => sourceFiles(path.join(sharedDir(root), l)))]
    const findings = []
    for (const file of files) {
        const lines = stripComments(fs.readFileSync(file, 'utf8'), file).split(/\r?\n/)
        const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/)
        lines.forEach((line, i) => {
            for (const rule of RULES) {
                if (!rule.test.test(line)) continue
                const f = { rule: rule.id, level: rule.level, file: rel(root, file), line: i + 1, text: raw[i].trim().slice(0, 200) }
                if (allowFile[rule.id]) Object.assign(f, { allowed: 'review.allow.json', reason: allowFile[rule.id].trim() })
                else if (cliAllow.includes(rule.id)) Object.assign(f, { allowed: 'command line (this build only, no reason)' })
                findings.push(f)
            }
        })
    }
    const blocking = findings.filter(f => f.level === 'error' && !f.allowed)
    return { type, findings, blocking, allowed: { ...allowFile, ...Object.fromEntries(cliAllow.map(r => [r, allowFile[r] ?? '(command line)'])) }, libraries }
}

/** The lines to print for a review (one per finding, then each rule's fix once). */
export function describeReview(review) {
    const out = []
    const seen = new Set()
    for (const f of review.findings) {
        const tag = f.level === 'error' ? (f.allowed ? 'allowed' : 'ERROR') : 'warning'
        out.push(`${tag} ${f.rule}: ${f.file}:${f.line}  ${f.text}${f.reason ? `  (allowed: ${f.reason})` : ''}`)
        seen.add(f.rule)
    }
    for (const id of seen) {
        const r = RULES.find(x => x.id === id)
        out.push(`  ${id}: ${r.what}. ${r.fix}.`)
    }
    return out
}

/** After the build: the bundle read for the error rules the sources didn't show (a bundled package); the file. */
export function writeReview({ root, review, bundle, version }) {
    const fromSources = new Set(review.findings.map(f => f.rule))
    const extra = []
    if (bundle && fs.existsSync(bundle)) {
        const text = fs.readFileSync(bundle, 'utf8')
        for (const rule of RULES) {
            if (rule.level !== 'error' || fromSources.has(rule.id)) continue
            const m = rule.test.exec(text)
            if (!m) continue
            const at = Math.max(0, m.index - 40)
            extra.push({ rule: rule.id, level: 'warning', file: rel(root, bundle), line: null,
                text: `in the built bundle, not in the sources (a bundled package?): …${text.slice(at, m.index + 60).replace(/\s+/g, ' ')}…` })
        }
    }
    const out = path.join(root, 'dist', 'reviews', `${review.type}.json`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const doc = {
        widget: review.type,
        version: version ?? null,
        checkedAt: new Date().toISOString(),
        rules: RULES.map(r => ({ id: r.id, level: r.level, what: r.what })),
        libraries: review.libraries,
        allowed: review.allowed,
        findings: [...review.findings, ...extra],
    }
    fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
    return { file: out, extra }
}
