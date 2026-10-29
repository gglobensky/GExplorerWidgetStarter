// tools/widget.mjs
//
// THE WIDGET COMMANDS (2026-10-15). One script for every widget: a widget is a folder
// widgets/<type>/ whose name is its type, the id its entry.ts declares (checked on every build).
//
//   npm run build     -- <type> [--no-install] [--sourcemap]   (or --all instead of <type>)
//   npm run watch     -- <type> [--no-install]                 rebuilds (and installs) on save
//   npm run preview   -- <type> [--port <n>]                   widgets/<type>/preview/ with sample data
//   npm run test      -- <type>                                widgets/<type>/tests/*.test.ts
//   npm run typecheck -- <type>                                widgets/<type>/tsconfig.json
// (pnpm: pnpm build <type> ...)
//
// BUILD: widgets/<type>/entry.ts -> dist/runtime-widgets/<type>/index.js, ONE file: CSS injected
// by the JS, assets and lazy imports inlined (GEM Shell's identity hash covers that file: a widget
// is exactly what was approved). vue and gexplorer/widgets are not bundled: the shell provides
// them at run time (/runtime/vue.js).
// NOTICES (2026-10-16, tools/notices.mjs): the built definition carries `notices`, the licence of
// every npm package bundled into index.js (with its LICENSE / NOTICE text), for GEM Shell's About
// page; the entry's own `notices` (code copied in by hand) are kept first.
//
// INSTALL (unless --no-install): the bundle is copied to GEM Shell's
// UserInterface/public/runtime-widgets/<type>/ (that folder then holds exactly index.js) and the
// copy's SHA-256 is checked. The next Release build of GEM Shell carries it to the app. Never into
// bin\...: a Release build replaces the output's runtime-widgets with public's.
// Where GEM Shell is (first found):
//   1. the environment variable GEX_SHELL_PUBLIC_DIR;
//   2. widget.build.json (this machine's, not committed): { "shellPublicDir": "<path>" }
//      (copy widget.build.example.json).
// A path that is not GEM Shell's public folder (no runtime-widgets folder in it) is an error.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { widgetNotices, wrapperEntry } from './notices.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WIDGETS = path.join(ROOT, 'widgets')
const DIST = path.join(ROOT, 'dist', 'runtime-widgets')
const CONFIG = path.join(ROOT, 'widget.build.json')
const CONFIG_KEYS = ['shellPublicDir']
const TYPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const require = createRequire(import.meta.url)

class Failure extends Error {}
const fail = (message) => { throw new Failure(message) }
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
const log = (message) => console.log(`[widget] ${message}`)

const USAGE = `Usage:
  npm run build     -- <type> [--no-install] [--sourcemap]    (or --all)
  npm run watch     -- <type> [--no-install]
  npm run preview   -- <type> [--port <n>]
  npm run test      -- <type>
  npm run typecheck -- <type>
<type>: a folder of widgets/ (its entry.ts declares the same id).`

// ── Arguments ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const [command, ...rest] = argv
    const opts = { command, type: null, all: false, install: true, sourcemap: false, port: null }
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === '--no-install') opts.install = false
        else if (a === '--sourcemap') opts.sourcemap = true
        else if (a === '--all') opts.all = true
        else if (a === '--port') {
            const n = Number(rest[++i])
            if (!Number.isInteger(n) || n < 1 || n > 65535) fail('--port: a port number (1-65535).')
            opts.port = n
        }
        else if (a.startsWith('-')) fail(`unknown option ${a}\n${USAGE}`)
        else if (opts.type) fail(`one widget at a time (got ${opts.type} and ${a})\n${USAGE}`)
        else opts.type = a
    }
    const known = { build: ['install', 'sourcemap', 'all'], watch: ['install'], preview: ['port'], test: [], typecheck: [] }
    if (!command || !(command in known)) fail(`unknown command "${command ?? ''}"\n${USAGE}`)
    const allowed = new Set(known[command])
    if (!opts.install && !allowed.has('install')) fail(`--no-install: not an option of ${command}`)
    if (opts.sourcemap && !allowed.has('sourcemap')) fail(`--sourcemap: not an option of ${command}`)
    if (opts.port != null && !allowed.has('port')) fail(`--port: not an option of ${command}`)
    if (opts.all && !allowed.has('all')) fail(`--all: not an option of ${command}`)
    if (opts.all && opts.type) fail('--all or a widget, not both')
    if (!opts.all && !opts.type) fail(`which widget? ${listWidgets().join(', ') || '(none in widgets/)'}\n${USAGE}`)
    return opts
}

// ── Widgets ────────────────────────────────────────────────────────────────

function listWidgets() {
    if (!fs.existsSync(WIDGETS)) return []
    return fs.readdirSync(WIDGETS, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(WIDGETS, d.name, 'entry.ts')))
        .map(d => d.name)
        .sort()
}

function widgetDir(type) {
    if (!TYPE.test(type)) fail(`"${type}": a widget type is lowercase letters, digits and single dashes (media-library).`)
    const dir = path.join(WIDGETS, type)
    if (!fs.existsSync(path.join(dir, 'entry.ts')))
        fail(`no widget "${type}" (widgets/${type}/entry.ts). Widgets: ${listWidgets().join(', ') || '(none)'}`)
    return dir
}

/** The id the entry's default export declares (a string literal), read from its source. */
function declaredId(entryFile) {
    let ts
    try { ts = require('typescript') } catch { fail('typescript is not installed: run npm install.') }
    const where = rel(entryFile)
    const text = fs.readFileSync(entryFile, 'utf8')
    const sf = ts.createSourceFile(entryFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const unwrap = (e) => {
        while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)
            || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression
        return e
    }
    let expr = null
    for (const st of sf.statements) if (ts.isExportAssignment(st) && !st.isExportEquals) expr = unwrap(st.expression)
    if (!expr) fail(`${where}: no "export default" (the widget's definition).`)
    if (ts.isCallExpression(expr) && expr.arguments.length) expr = unwrap(expr.arguments[0])   // defineWidget({ ... })
    if (ts.isIdentifier(expr)) {                                                                // const def = { ... }; export default def
        const name = expr.text
        expr = null
        for (const st of sf.statements) {
            if (!ts.isVariableStatement(st)) continue
            for (const d of st.declarationList.declarations)
                if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) expr = unwrap(d.initializer)
        }
    }
    if (!expr || !ts.isObjectLiteralExpression(expr)) fail(`${where}: the default export must be the widget's definition object.`)
    const idProps = expr.properties.filter(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === 'id')
    if (idProps.length !== 1 || !ts.isPropertyAssignment(idProps[0]))
        fail(`${where}: the definition must declare its id once, as  id: '<type>'.`)
    const value = unwrap(idProps[0].initializer)
    if (!ts.isStringLiteralLike(value)) fail(`${where}: id must be a plain string ('${path.basename(path.dirname(entryFile))}'), not an expression.`)
    return value.text
}

function checkId(type, dir) {
    const id = declaredId(path.join(dir, 'entry.ts'))
    if (id !== type)
        fail(`widgets/${type}/entry.ts declares id "${id}": a widget's folder is named after its id. Rename the folder or the id.`)
}

// ── Where GEM Shell is ─────────────────────────────────────────────────────

function shellPublicDir() {
    let dir = (process.env.GEX_SHELL_PUBLIC_DIR ?? '').trim()
    let from = 'GEX_SHELL_PUBLIC_DIR'
    if (!dir) {
        from = 'widget.build.json'
        if (!fs.existsSync(CONFIG))
            fail('nowhere to install the widget. Copy widget.build.example.json to widget.build.json and set shellPublicDir '
                + "to GEM Shell's GExplorer/UserInterface/public folder, or set GEX_SHELL_PUBLIC_DIR, or build with --no-install.")
        let cfg
        try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^﻿/, '')) }
        catch (e) { fail(`widget.build.json: ${e.message}`) }
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail('widget.build.json: an object, { "shellPublicDir": "<path>" }.')
        const unknown = Object.keys(cfg).filter(k => !CONFIG_KEYS.includes(k))
        if (unknown.length)
            fail(`widget.build.json: unknown setting ${unknown.join(', ')}. Its only setting is shellPublicDir (see widget.build.example.json).`)
        if (typeof cfg.shellPublicDir !== 'string' || !cfg.shellPublicDir.trim()) fail('widget.build.json: shellPublicDir is missing.')
        dir = cfg.shellPublicDir.trim()
    }
    dir = path.resolve(ROOT, dir)
    if (!fs.existsSync(path.join(dir, 'runtime-widgets')))
        fail(`${from}: ${dir} is not GEM Shell's UserInterface/public folder (it has no runtime-widgets folder).`)
    return dir
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/** The output folder holds exactly index.js (one file: what GEM Shell's identity hash covers). */
function checkOutput(type) {
    const out = path.join(DIST, type)
    const files = fs.existsSync(out) ? fs.readdirSync(out) : []
    if (files.length !== 1 || files[0] !== 'index.js')
        fail(`dist/runtime-widgets/${type} should hold only index.js, found: ${files.join(', ') || 'nothing'}.`)
    return path.join(out, 'index.js')
}

function install(type, publicDir) {
    const source = checkOutput(type)
    const target = path.join(publicDir, 'runtime-widgets', type)
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })
    const copy = path.join(target, 'index.js')
    fs.copyFileSync(source, copy)
    const hash = sha256(source)
    if (sha256(copy) !== hash) fail(`the copy in ${target} does not match the build.`)
    log(`${type} installed: ${copy} (sha256 ${hash.slice(0, 12)}…). Build GEM Shell (Release) to ship it.`)
}

// ── Commands ───────────────────────────────────────────────────────────────

async function dep(name) {
    try { return await import(name) }
    catch (e) {
        if (e?.code === 'ERR_MODULE_NOT_FOUND') fail(`${name} is not installed: run npm install.`)
        throw e
    }
}

// ── Keys hint (2026-10-29) ─────────────────────────────────────────────────
// GEM Shell hides shortcut combos from widget code (Ctrl / Alt / Meta + a key, F-keys, Delete / Insert
// outside a text field: the event reads as nothing). A widget's actions are commands (README, Keys).
// A warning, not an error: a line testing a modifier together with a key that makes it a shortcut, in a
// file that listens to keys. Fed to the official repo's review too.
const KEY_LISTENER = /\bkey(down|up|press)\b/i
const MODIFIER_READ = /\b(ctrlKey|altKey|metaKey)\b|getModifierState\s*\(/
const SHORTCUT_KEY = /\.key\b[^\n]*['"`][a-z0-9]['"`]|\[\s*['"`][a-z0-9]['"`]\s*,|['"`]F([1-9]|1[0-9]|2[0-4])['"`]|['"`](Delete|Insert)['"`]|getModifierState\s*\(|\.keyCode\b|\.which\b/i

function filesOf(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (e.name === 'tests' || e.name === 'preview' || e.name === 'node_modules') continue
            out.push(...filesOf(path.join(dir, e.name)))
        } else if (/\.(vue|ts|js|mjs)$/.test(e.name)) out.push(path.join(dir, e.name))
    }
    return out
}

function checkKeys(type, dir) {
    for (const file of filesOf(dir)) {
        const text = fs.readFileSync(file, 'utf8')
        if (!KEY_LISTENER.test(text)) continue
        text.split(/\r?\n/).forEach((line, i) => {
            if (MODIFIER_READ.test(line) && SHORTCUT_KEY.test(line)) {
                log(`${type}: ${rel(file)}:${i + 1} reads a shortcut key on a key event. GEM Shell hides those `
                    + 'from widgets: declare a command in entry.ts instead (README, Keys).')
            }
        })
    }
}

async function build(type, { watch = false, install: doInstall = true, sourcemap = false } = {}) {
    const dir = widgetDir(type)
    checkId(type, dir)
    checkKeys(type, dir)
    const publicDir = doInstall ? shellPublicDir() : null      // before building: a wrong setting fails first
    const { build: viteBuild } = await dep('vite')
    const vue = (await dep('@vitejs/plugin-vue')).default
    const cssInjectedByJs = (await dep('vite-plugin-css-injected-by-js')).default

    const output = {
        name: 'gex-widget-output',
        apply: 'build',
        // After each write (each rebuild in watch mode): one file, then installed.
        writeBundle() {
            try {
                checkOutput(type)
                if (publicDir) install(type, publicDir)
                else log(`${type} built: dist/runtime-widgets/${type}/index.js (not installed: --no-install).`)
            } catch (e) {
                throw new Error(e instanceof Failure ? e.message : String(e?.message ?? e))
            }
        },
    }

    await viteBuild({
        configFile: false,
        root: ROOT,
        clearScreen: false,
        logLevel: 'info',
        plugins: [widgetNotices({ widgetDir: dir, warn: (m) => log(`${type}: ${m}`) }), vue(), cssInjectedByJs(), output],
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        build: {
            target: 'es2020',
            outDir: path.join(DIST, type),
            emptyOutDir: true,
            copyPublicDir: false,
            cssCodeSplit: false,
            minify: 'esbuild',
            sourcemap: sourcemap ? 'inline' : false,
            assetsInlineLimit: 100 * 1024 * 1024,
            lib: { entry: wrapperEntry(dir), formats: ['es'], fileName: () => 'index.js' },
            rollupOptions: {
                external: ['vue', 'gexplorer/widgets'],
                output: {
                    paths: { vue: '/runtime/vue.js', 'gexplorer/widgets': '/runtime/vue.js' },
                    inlineDynamicImports: true,
                },
            },
            watch: watch ? {} : null,
        },
    })
    if (watch) log(`watching widgets/${type} (Ctrl+C to stop)`)
}

async function preview(type, port) {
    const dir = widgetDir(type)
    const html = path.join(dir, 'preview', 'index.html')
    const shim = path.join(dir, 'preview', 'widgets-shim.ts')
    if (!fs.existsSync(html)) fail(`widgets/${type} has no preview (widgets/${type}/preview/index.html).`)
    if (!fs.existsSync(shim)) fail(`widgets/${type}/preview/widgets-shim.ts is missing (what gexplorer/widgets is in the preview).`)
    const { createServer } = await dep('vite')
    const vue = (await dep('@vitejs/plugin-vue')).default
    const server = await createServer({
        configFile: false,
        root: ROOT,
        clearScreen: false,
        plugins: [vue()],
        resolve: { alias: { 'gexplorer/widgets': shim } },
        server: { host: '127.0.0.1', port: port ?? 5173, strictPort: port != null },
    })
    await server.listen()
    const base = (server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`).replace(/\/?$/, '/')
    log(`${type} preview: ${base}widgets/${type}/preview/`)
}

function test(type) {
    const dir = path.join(widgetDir(type), 'tests')
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.test.ts')).sort() : []
    if (!files.length) fail(`widgets/${type} has no tests (widgets/${type}/tests/*.test.ts).`)
    const [major, minor] = process.versions.node.split('.').map(Number)
    if (major < 22 || (major === 22 && minor < 6)) fail(`the tests run TypeScript directly: Node 22.6 or later (this is ${process.versions.node}).`)
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files.map(f => rel(path.join(dir, f)))],
        { cwd: ROOT, stdio: 'inherit' })
    return r.status ?? 1
}

function typecheck(type) {
    const tsconfig = path.join(widgetDir(type), 'tsconfig.json')
    if (!fs.existsSync(tsconfig)) fail(`widgets/${type}/tsconfig.json is missing.`)
    const vueTsc = path.join(ROOT, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
    if (!fs.existsSync(vueTsc)) fail('vue-tsc is not installed: run npm install.')
    const r = spawnSync(process.execPath, [vueTsc, '--noEmit', '-p', rel(tsconfig)], { cwd: ROOT, stdio: 'inherit' })
    if (r.status === 0) log(`${type}: no type errors.`)
    return r.status ?? 1
}

async function main() {
    const opts = parseArgs(process.argv.slice(2))
    switch (opts.command) {
        case 'build':
            if (opts.all) {
                const types = listWidgets()
                if (!types.length) fail('no widgets in widgets/.')
                if (opts.install) shellPublicDir()                          // a wrong setting fails before any build
                for (const t of types) checkId(t, widgetDir(t))              // every id before any build
                for (const t of types) await build(t, { install: opts.install, sourcemap: opts.sourcemap })
                log(`built ${types.length} widgets: ${types.join(', ')}`)
            } else {
                await build(opts.type, { install: opts.install, sourcemap: opts.sourcemap })
            }
            return 0
        case 'watch': await build(opts.type, { watch: true, install: opts.install }); return null
        case 'preview': await preview(opts.type, opts.port); return null
        case 'test': return test(opts.type)
        case 'typecheck': return typecheck(opts.type)
    }
}

try {
    const code = await main()
    if (code != null) process.exitCode = code
} catch (e) {
    if (e instanceof Failure) {
        console.error(`[widget] error: ${e.message}`)
        process.exitCode = 1
    } else {
        console.error(e?.message ? `[widget] error: ${e.message}` : e)
        process.exitCode = 1
    }
}
