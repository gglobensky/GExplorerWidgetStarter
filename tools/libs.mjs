// tools/libs.mjs
//
// SHARED LIBRARIES (2026-10-31; README "Shared libraries"). Code a suite of widgets shares (components, CSS,
// helpers, an animated logo...) lives ONCE in shared/<name>/ and is bundled into each widget that imports it:
// change it once, rebuild its widgets (npm run build -- --lib <name>). GEM Shell's identity hash still covers
// exactly what runs (each widget is one file); a few KB repeat across bundles, which is fine.
//
//   shared/<name>/library.json   { "name": "<name>", "version": "1.2.0", "licence": "...",
//                                  "description"?: "...", "uses"?: ["<other library>"] }
//   shared/<name>/index.ts       its public face: what widgets import
//   shared/<name>/tests/*.test.ts   npm run test -- --lib <name>
//
// Widgets import   import { MediaShelf } from '@shared/library-ui'
// The build checks:
//   - a library imported has a valid library.json, named after its folder;
//   - only the public face: '@shared/<name>/x' is refused (export it from index.ts);
//   - a library imports only vue, gexplorer/widgets, npm packages, its own files and the libraries in its "uses"
//     (never a widget's files, never another library it doesn't declare); "uses" has no cycles;
//   - a widget reaching into shared/ by a relative path ('../../shared/x/...'): a warning (use '@shared/x').
// Each build lists the libraries it carried, with their versions.
import fs from 'node:fs'
import path from 'node:path'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const PREFIX = '@shared/'

export class LibraryError extends Error {}
const fail = (m) => { throw new LibraryError(m) }

export function sharedDir(root) { return path.join(root, 'shared') }

/** Every folder of shared/ (library.json or not). */
export function libraryFolders(root) {
    const dir = sharedDir(root)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
}

/** shared/<name>/library.json, checked. */
export function readLibrary(root, name) {
    if (!NAME.test(name)) fail(`"${name}": a library's name is lowercase letters, digits and single dashes (library-ui).`)
    const dir = path.join(sharedDir(root), name)
    if (!fs.existsSync(dir)) fail(`no library "${name}" (shared/${name}/). Libraries: ${libraryFolders(root).join(', ') || '(none)'}`)
    const file = path.join(dir, 'library.json')
    if (!fs.existsSync(file)) fail(`shared/${name} has no library.json ({ "name": "${name}", "version": "1.0.0", "licence": "..." }).`)
    let j
    try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
    catch (e) { fail(`shared/${name}/library.json: ${e.message}`) }
    if (!j || typeof j !== 'object' || Array.isArray(j)) fail(`shared/${name}/library.json: an object.`)
    const known = ['name', 'version', 'licence', 'description', 'uses']
    const unknown = Object.keys(j).filter(k => !known.includes(k))
    if (unknown.length) fail(`shared/${name}/library.json: unknown ${unknown.join(', ')} (${known.join(', ')}).`)
    if (j.name !== name) fail(`shared/${name}/library.json names "${j.name}": a library's folder is named after it.`)
    if (typeof j.version !== 'string' || !VERSION.test(j.version)) fail(`shared/${name}/library.json: version as 1.2.0.`)
    if (typeof j.licence !== 'string' || !j.licence.trim()) fail(`shared/${name}/library.json: licence (an SPDX id, as a widget's).`)
    const uses = j.uses ?? []
    if (!Array.isArray(uses) || uses.some(u => typeof u !== 'string' || !NAME.test(u) || u === name))
        fail(`shared/${name}/library.json: uses is a list of other libraries' names.`)
    const index = ['index.ts', 'index.js'].map(f => path.join(dir, f)).find(f => fs.existsSync(f))
    if (!index) fail(`shared/${name} has no index.ts (its public face: what widgets import).`)
    return { name, version: j.version, licence: j.licence.trim(), description: j.description ?? '', uses, dir, index }
}

/** Every library a library needs (itself first), checked for cycles. */
export function closure(root, name, trail = []) {
    if (trail.includes(name)) fail(`libraries use each other in a loop: ${[...trail, name].join(' → ')}.`)
    const lib = readLibrary(root, name)
    const out = new Map([[name, lib]])
    for (const u of lib.uses) for (const [k, v] of closure(root, u, [...trail, name])) out.set(k, v)
    return out
}

const inside = (file, dir) => {
    const r = path.relative(dir, file)
    return !!r && !r.startsWith('..') && !path.isAbsolute(r)
}

/** The library a file belongs to (its folder name under shared/), or null. */
function libraryOf(root, file) {
    const s = sharedDir(root)
    if (!inside(file, s)) return null
    return path.relative(s, file).split(path.sep)[0] || null
}

const clean = (id) => (id ?? '').split('?')[0]

/**
 * The Vite / Rollup plugin: resolves '@shared/<name>' and enforces the rules above. <who>: the widget built
 * ("media-library"), for messages. <onUsed>(libs): the libraries carried, after the build.
 */
export function sharedLibraries({ root, who, warn, onUsed }) {
    const used = new Map()
    const widgets = path.join(root, 'widgets')
    return {
        name: 'gex-shared-libraries',
        enforce: 'pre',
        buildStart() { used.clear() },
        async resolveId(source, importer, opts) {
            if (!importer || source.startsWith('\0')) {
                if (source.startsWith(PREFIX)) return this.error(`${source}: imported from nowhere`)
                return null
            }
            const from = clean(importer)
            const fromLib = libraryOf(root, from)

            // '@shared/<name>': the library's public face
            if (source.startsWith(PREFIX)) {
                const rest = source.slice(PREFIX.length)
                const [name, ...deep] = rest.split('/')
                try {
                    if (deep.length) fail(`${rel(root, from)}: '${source}' reaches inside the library: import '@shared/${name}' (export what you need from its index.ts).`)
                    if (fromLib) {
                        const self = readLibrary(root, fromLib)
                        if (name !== fromLib && !self.uses.includes(name))
                            fail(`shared/${fromLib} imports '@shared/${name}' without declaring it: add "${name}" to its library.json "uses".`)
                    }
                    for (const [k, v] of closure(root, name)) used.set(k, v)
                    return readLibrary(root, name).index
                } catch (e) {
                    return this.error(e instanceof LibraryError ? e.message : String(e?.message ?? e))
                }
            }

            // Anything else: where it lands
            const resolved = await this.resolve(source, importer, { ...opts, skipSelf: true })
            if (!resolved || resolved.external) return resolved
            const to = clean(resolved.id)
            if (!path.isAbsolute(to) || to.includes(`${path.sep}node_modules${path.sep}`)) return resolved
            const toLib = libraryOf(root, to)

            if (fromLib) {
                // A library: its own files, or a library it declares (by '@shared/...' only)
                if (toLib === fromLib) return resolved
                if (toLib) return this.error(`shared/${fromLib} imports ${rel(root, to)} by path: import '@shared/${toLib}' (declared in its "uses").`)
                if (inside(to, widgets)) return this.error(`shared/${fromLib} imports a widget's file (${rel(root, to)}): a library never depends on a widget.`)
                if (inside(to, root)) return this.error(`shared/${fromLib} imports ${rel(root, to)}, outside the library.`)
                return resolved
            }
            if (toLib) {
                // A widget reaching into shared/ by a relative path: works, but no checks, no version
                try { for (const [k, v] of closure(root, toLib)) used.set(k, v) } catch { /* no library.json yet: warned below */ }
                warn?.(`${rel(root, from)} imports ${rel(root, to)} by path: import '@shared/${toLib}' instead (its checks and version apply then).`)
            }
            return resolved
        },
        generateBundle() {
            const libs = [...used.values()]
            onUsed?.(libs)
        },
    }
}

const rel = (root, p) => path.relative(root, p).split(path.sep).join('/')

/** Widgets whose sources import <name> (directly, or through a library that uses it). */
export function widgetsUsing(root, name, listWidgets, filesOf) {
    readLibrary(root, name)
    // Libraries depending on <name>, transitively
    const libs = new Set([name])
    let grew = true
    while (grew) {
        grew = false
        for (const l of libraryFolders(root)) {
            if (libs.has(l)) continue
            let lib
            try { lib = readLibrary(root, l) } catch { continue }
            if (lib.uses.some(u => libs.has(u))) { libs.add(l); grew = true }
        }
    }
    const pattern = new RegExp(`(@shared/|shared/)(${[...libs].map(l => l.replace(/-/g, '\\-')).join('|')})(['"/])`)
    return listWidgets().filter(type =>
        filesOf(path.join(root, 'widgets', type)).some(f => pattern.test(fs.readFileSync(f, 'utf8'))))
}
