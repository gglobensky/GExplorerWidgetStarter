// tools/notices.mjs
//
// THE LICENCES OF WHAT A WIDGET BUNDLES (2026-10-16). Used by widget.mjs: the build makes the
// widget's definition carry `notices`, one per npm package whose code ended up in its index.js,
// with the package's licence and the text of its LICENSE / NOTICE files. GEM Shell shows them on
// its About page (Widgets tab). vue and gexplorer/widgets are not bundled (the shell provides
// them, and lists them in its own licences), so they never appear here.
//
// How: the build's entry is a small wrapper,
//     import def from '<widget>/entry.ts'
//     import notices from 'virtual:gex-widget-notices'
//     export default Object.assign({}, def, { notices: [...(def.notices ?? []), ...notices] })
// The virtual module is a placeholder string; once the bundle is rendered (when every module in
// it is known), the placeholder is replaced by the list. A placeholder that is not found exactly
// once fails the build: a widget is never shipped without its notices.
import fs from 'node:fs'
import path from 'node:path'

export const NOTICES_ID = 'virtual:gex-widget-notices'
const RESOLVED = '\0gex-widget-notices'
export const PLACEHOLDER = '__GEX_WIDGET_NOTICES_9c1e5b__'
const ENTRY_SUFFIX = '__gex_widget_entry__.js'
const MAX_TEXT = 200_000
const LICENSE_FILE = /^(licen[cs]e|copying)([.-].*)?$/i
const NOTICE_FILE = /^notice(\.(txt|md))?$/i

/** The package folder a module file belongs to (…/node_modules/<name> or …/node_modules/@scope/<name>), or null. */
export function packageDirOf(moduleId) {
    let id = String(moduleId ?? '')
    if (id.startsWith('\0')) return null
    id = id.split('?')[0].split(path.sep).join('/')
    const at = id.lastIndexOf('/node_modules/')
    if (at < 0) return null
    const rest = id.slice(at + '/node_modules/'.length).split('/')
    const parts = rest[0]?.startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
    if (!parts.length || parts.some(p => !p)) return null
    return id.slice(0, at) + '/node_modules/' + parts.join('/')
}

function readText(file) {
    try {
        const t = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()
        return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '\n…' : t
    } catch { return undefined }
}

function fileIn(dir, pattern) {
    try {
        const name = fs.readdirSync(dir).filter(f => pattern.test(f)).sort((a, b) => a.length - b.length)[0]
        return name ? path.join(dir, name) : undefined
    } catch { return undefined }
}

/** An https address for the package (homepage, else repository), or undefined. */
function urlOf(pkg) {
    const candidates = [pkg.homepage, typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url]
    for (let c of candidates) {
        if (typeof c !== 'string') continue
        c = c.trim().replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
        if (/^github:/.test(c)) c = 'https://github.com/' + c.slice(7)
        else if (/^[\w.-]+\/[\w.-]+$/.test(c)) c = 'https://github.com/' + c
        if (/^https:\/\//.test(c)) return c
    }
    return undefined
}

function licenseOf(pkg) {
    if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim()
    if (pkg.license?.type) return String(pkg.license.type)
    if (Array.isArray(pkg.licenses) && pkg.licenses.length) return pkg.licenses.map(l => l?.type ?? l).filter(Boolean).join(' OR ')
    return ''
}

/**
 * The notices for a set of bundled module ids: one per package (name@version), sorted by name.
 * warn(message) is called for a package without a licence or without licence text.
 */
export function collectNotices(moduleIds, warn = () => {}) {
    const dirs = new Set()
    for (const id of moduleIds) {
        const dir = packageDirOf(id)
        if (dir) dirs.add(dir)
    }
    const byKey = new Map()
    for (const dir of dirs) {
        let pkg
        try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { continue }
        if (!pkg?.name) continue
        const key = `${pkg.name}@${pkg.version ?? ''}`
        if (byKey.has(key)) continue
        const license = licenseOf(pkg)
        const licenseFile = fileIn(dir, LICENSE_FILE)
        const noticeFile = fileIn(dir, NOTICE_FILE)
        const entry = { name: String(pkg.name), license: license || 'UNKNOWN' }
        if (pkg.version) entry.version = String(pkg.version)
        const url = urlOf(pkg)
        if (url) entry.url = url
        const text = licenseFile && readText(licenseFile)
        if (text) entry.text = text
        const notice = noticeFile && readText(noticeFile)
        if (notice) entry.notice = notice
        if (!license) warn(`${key}: its package.json names no licence (shown as UNKNOWN). Check the package before shipping it.`)
        else if (!text) warn(`${key}: no LICENSE file in the package (the About page shows the licence name only).`)
        byKey.set(key, entry)
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)))
}

/** The wrapper entry's id for a widget folder (a file that does not exist: the plugin provides it). */
export function wrapperEntry(widgetDir) {
    return path.join(widgetDir, ENTRY_SUFFIX)
}

/** The Vite plugin: the wrapper entry, the placeholder module, and the replacement once rendered. */
export function widgetNotices({ widgetDir, warn }) {
    const wrapper = wrapperEntry(widgetDir).split(path.sep).join('/')
    const entry = path.join(widgetDir, 'entry.ts').split(path.sep).join('/')
    const isWrapper = (id) => id.split(path.sep).join('/') === wrapper
    return {
        name: 'gex-widget-notices',
        enforce: 'pre',
        resolveId(id) {
            if (id === NOTICES_ID) return RESOLVED
            if (isWrapper(id)) return wrapper
            return null
        },
        load(id) {
            if (id === RESOLVED) return `export default ${JSON.stringify(PLACEHOLDER)}\n`
            if (id === wrapper) return [
                `import def from ${JSON.stringify(entry)}`,
                `import notices from ${JSON.stringify(NOTICES_ID)}`,
                `const own = Array.isArray(def && def.notices) ? def.notices : []`,
                `export default Object.assign({}, def, { notices: own.concat(notices) })`,
                '',
            ].join('\n')
            return null
        },
        renderChunk(code, chunk) {
            const list = collectNotices(chunk.moduleIds ?? Object.keys(chunk.modules ?? {}), warn)
            const literal = new RegExp(`(["'\`])${PLACEHOLDER}\\1`, 'g')
            const found = code.match(literal)?.length ?? 0
            if (found !== 1) throw new Error(`notices: the placeholder was found ${found} times in ${chunk.fileName} (expected once).`)
            return { code: code.replace(literal, () => JSON.stringify(list)), map: null }
        },
    }
}
