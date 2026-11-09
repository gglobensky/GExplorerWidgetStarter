// widgets/forge/pkgtypes.ts
//
// GEM FORGE 0.2.8: THE NPM PACKAGES' OWN TYPES. For each package package.json lists, its type files read from the
// project's node_modules (GEM Forge's read grant on the folder), handed to TypeScript (sdk.dev().language()'s sync
// `packages`, GEM Shell 2026-11-08) at node_modules/<name>/…: completions after `format(`, hovers, real errors.
//   - Where they start: package.json's "types" / "typings", every "types" in its "exports" (subpaths: date-fns/locale),
//     else index.d.ts; none: @types/<name> (DefinitelyTyped), the same way.
//   - Then what they import: relative files (./add.js → ./add.d.ts, a folder → its index.d.ts), /// <reference path>,
//     and other packages they name (their own types, read the same way, once).
//   - Limits: 1500 files and 12 MB a package, 4000 files in all (GEM Shell's). A package without types stays `any`
//     (untyped): no error on its import, as before.

export type PackageTypes = { files: { path: string; text: string }[]; untyped: string[] }

const PER_PACKAGE_FILES = 1500
const PER_PACKAGE_BYTES = 12 * 1024 * 1024
const ALL_FILES = 4000

/** Every "types" (or "typings") string in package.json's exports, whatever the nesting (conditions, subpaths). */
function exportTypes(x: unknown, out: string[] = []): string[] {
    if (!x || typeof x !== 'object') return out
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if ((k === 'types' || k === 'typings') && typeof v === 'string') out.push(v)
        else if (typeof v === 'object') exportTypes(v, out)
    }
    return out
}

const norm = (p: string) => {
    const out: string[] = []
    for (const seg of p.split('/')) {
        if (!seg || seg === '.') continue
        if (seg === '..') out.pop()
        else out.push(seg)
    }
    return out.join('/')
}
const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'))
/** A package's name from a bare import ('date-fns/locale' → 'date-fns'). */
const nameOf = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])

/**
 * The type files of <names> (and of the packages their types import), read with <read> (a path relative to the
 * project folder: 'node_modules/date-fns/package.json'; null when missing).
 */
export async function readPackageTypes(names: string[], read: (rel: string) => Promise<string | null>): Promise<PackageTypes> {
    const files = new Map<string, string>()
    const untyped: string[] = []
    const done = new Set<string>()
    const tryRead = async (rel: string) => (files.has(rel) ? files.get(rel)! : await read(rel))

    async function one(name: string, asked: boolean): Promise<boolean> {
        if (done.has(name)) return true
        done.add(name)
        for (const root of [`node_modules/${name}`, `node_modules/@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`]) {
            const pkgText = await tryRead(`${root}/package.json`)
            if (pkgText == null) continue
            let pkg: any = {}
            try { pkg = JSON.parse(pkgText) } catch { /* a broken package.json: its index.d.ts may still be there */ }
            const starts = [pkg.types, pkg.typings, ...exportTypes(pkg.exports)].filter((s): s is string => typeof s === 'string')
            if (!starts.length) starts.push('index.d.ts')
            const found = await crawl(root, starts)
            if (found) {
                files.set(`${root}/package.json`, pkgText)
                return true
            }
        }
        if (asked) untyped.push(name)
        return false
    }

    /** From <starts> (relative to <root>), the type files and what they import. False: none found. */
    async function crawl(root: string, starts: string[]): Promise<boolean> {
        const queue = [...new Set(starts.map(s => norm(`${root}/${s}`)))]
        const seen = new Set<string>()
        const others = new Set<string>()
        let count = 0, bytes = 0, any = false
        while (queue.length && count < PER_PACKAGE_FILES && files.size < ALL_FILES) {
            const batch = queue.splice(0, 16).filter(p => !seen.has(p))
            batch.forEach(p => seen.add(p))
            const texts = await Promise.all(batch.map(async p => {
                // ./add.js → ./add.d.ts; a folder → its index.d.ts; a .d.ts as named
                const tries = /\.d\.[cm]?ts$/.test(p) ? [p]
                    : /\.(m|c)?js$/.test(p) ? [p.replace(/\.(m|c)?js$/, (_m, x) => `.d.${x ?? ''}ts`)]
                        : /\.(m|c)?ts$/.test(p) ? [p.replace(/\.(m|c)?ts$/, (_m, x) => `.d.${x ?? ''}ts`)]
                            : [`${p}.d.ts`, `${p}/index.d.ts`]
                for (const t of tries) {
                    if (files.has(t)) return null
                    const text = await tryRead(t)
                    if (text != null) return { path: t, text }
                }
                return null
            }))
            for (const f of texts) {
                if (!f || files.has(f.path)) continue
                if (bytes + f.text.length > PER_PACKAGE_BYTES) { queue.length = 0; break }
                files.set(f.path, f.text)
                any = true
                count++
                bytes += f.text.length
                const dir = dirOf(f.path)
                for (const m of f.text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"\n]+)['"]|\/\/\/\s*<reference\s+(path|types)\s*=\s*['"]([^'"]+)['"]/g)) {
                    const spec = m[1] ?? m[3]
                    if (!spec) continue
                    if (m[2] === 'types') { others.add(spec); continue }
                    if (spec.startsWith('.') || m[2] === 'path') queue.push(norm(`${dir}/${spec}`))
                    else if (!spec.startsWith('node:') && !/^[a-z]+:/.test(spec)) others.add(nameOf(spec))
                }
            }
        }
        for (const o of others) await one(o, false)
        return any
    }

    for (const n of names) await one(n, true)
    return { files: [...files].map(([path, text]) => ({ path, text })), untyped }
}
