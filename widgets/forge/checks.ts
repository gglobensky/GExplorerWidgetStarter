// widgets/forge/checks.ts
//
// GEM FORGE 0.2.10: CHECK ALL FILES. The project's files checked one after the other (a frame between two: the page
// keeps drawing), their problems listed in Problems by file ("All files"). The checks are a list the user chooses
// from (Problems' Checks ▾); each takes a file and gives its problems.
// 0.2.12: Prettier (formatting: pretty.ts) is one of them; ESLint (the project's own, through Node) is next. A file
// or a folder is checked from the Explorer's right-click (Check: its entries replace the list's), and can be left
// out of Check all (Leave out of Check all: kept with the project).
import type { DevProblem } from 'gexplorer/widgets'
import type { Project } from './project'
import { languageFor, TS_FILE } from './lang'
import { prettyFor, SUPPORTED } from './pretty'
import { GUIDE_FILES } from './templates'

export type CheckId = 'typescript' | 'prettier' | 'eslint'
export type Check = {
    id: CheckId
    label: string
    /** Why it can't run (yet); null: it can. */
    unavailable(project: Project): string | null
    /** The files it looks at. */
    handles(path: string): boolean
    /** <path>'s problems (null: not checked: not ready). */
    run(project: Project, path: string): Promise<DevProblem[] | null>
}

export const CHECKS: Check[] = [
    {
        id: 'typescript',
        label: 'TypeScript (types, syntax)',
        unavailable: p => (p.dev?.language ? null : 'This GEM Shell has no TypeScript.'),
        handles: path => TS_FILE.test(path),
        run: (p, path) => languageFor(p).problemsOfFile(path),
    },
    {
        id: 'prettier',
        label: 'Prettier (formatting)',
        unavailable: p => (prettyFor(p).available() ? null : 'This GEM Shell has no Prettier (GEM Shell 2026-11-08 or later).'),
        handles: path => SUPPORTED.test(path),
        run: (p, path) => prettyFor(p).problemsOfFile(path),
    },
    {
        id: 'eslint',
        label: 'ESLint (rules)',
        unavailable: () => 'Coming next: the project\'s own ESLint (its eslint.config.js), run by Node.',
        handles: path => TS_FILE.test(path),
        run: async () => null,
    },
]

/** The checks chosen that can run. */
export const chosenChecks = (project: Project) => CHECKS.filter(c => project.state.checks.includes(c.id) && !c.unavailable(project))

/** A file Check all may look at: the project's own text (not node_modules', not the guide's, not GEM Forge's). */
const ownText = (project: Project, path: string) => {
    const f = project.file(path)
    return !!f && f.base64 === undefined && !path.startsWith('node_modules/') && !GUIDE_FILES.has(path) && !path.startsWith('__forge__/') && path !== 'package-lock.json'
}
/** 0.2.12: left out of Check all (the path, or a folder above it). */
export const isSkipped = (project: Project, path: string) => project.state.checkSkip.some(p => path === p || path.startsWith(`${p}/`))

/** The files Check all goes through: those a chosen check handles, not left out. */
export function checkedFiles(project: Project): string[] {
    const chosen = chosenChecks(project)
    return project.state.files
        .map(f => f.path)
        .filter(p => ownText(project, p) && !isSkipped(project, p) && chosen.some(c => c.handles(p)))
        .sort()
}

/** 0.2.12: the files under <paths> (files, or folders) a chosen check handles (left out or not: asked for). */
export function filesUnder(project: Project, paths: string[]): string[] {
    const chosen = chosenChecks(project)
    const under = (p: string) => paths.some(r => p === r || p.startsWith(`${r}/`))
    return project.state.files.map(f => f.path).filter(p => under(p) && ownText(project, p) && chosen.some(c => c.handles(p))).sort()
}

let running = 0
/** Checks every file with the chosen checks; Problems shows the progress, then the problems by file. */
export function checkAll(project: Project): Promise<void> {
    return runChecks(project, checkedFiles(project), false)
}
/** 0.2.12: checks these files and folders (the Explorer's Check); their entries replace the list's. */
export function checkPaths(project: Project, paths: string[]): Promise<void> {
    return runChecks(project, filesUnder(project, paths), true)
}

async function runChecks(project: Project, paths: string[], merge: boolean): Promise<void> {
    const s = project.state
    const run = ++running
    const chosen = chosenChecks(project)
    if (!chosen.length) { project.say('No check to run: choose one in Problems ▸ Checks ▾.', false); return }
    if (!paths.length) { project.say('Nothing to check there (no file the chosen checks look at).', false); return }
    const kept = merge ? s.checked.files.filter(f => !paths.includes(f.path)) : []
    const started = Date.now()
    s.checked = { running: true, done: 0, total: paths.length, at: 0, files: kept }
    const files: { path: string; items: DevProblem[] }[] = []
    for (const [i, path] of paths.entries()) {
        if (run !== running) return
        s.checked.done = i
        // A frame between two files (and a wait while a check gets ready: the packages' types, Prettier loading)
        await new Promise<void>(res => requestAnimationFrame(() => window.setTimeout(res, 0)))
        const items: DevProblem[] = []
        for (const c of chosen) {
            if (!c.handles(path)) continue
            let found = await c.run(project, path)
            for (let tries = 0; found === null && tries < 100 && run === running; tries++) {
                await new Promise(res => window.setTimeout(res, 150))
                found = await c.run(project, path)
            }
            items.push(...(found ?? []).map(p => ({ ...p, rule: p.rule ?? 'warning' })))
        }
        files.push({ path, items })
    }
    if (run !== running) return
    const all = [...kept, ...files.filter(f => f.items.length)].sort((a, b) => a.path.localeCompare(b.path))
    s.checked = { running: false, done: paths.length, total: paths.length, at: Date.now(), files: all }
    const n = files.reduce((a, f) => a + f.items.length, 0)
    const errors = files.reduce((a, f) => a + f.items.filter(p => p.rule === 'error').length, 0)
    const what = paths.length === 1 ? paths[0] : `${paths.length} files`
    project.say(n
        ? `Checked ${what} in ${((Date.now() - started) / 1000).toFixed(1)} s: ${errors} error${errors === 1 ? '' : 's'}, ${n - errors} warning${n - errors === 1 ? '' : 's'} (Problems ▸ All files).`
        : `Checked ${what}: no problems.`, errors === 0)
}

/** Stops a Check all under way, or clears its list. */
export function clearChecked(project: Project) {
    running++
    project.state.checked = { running: false, done: 0, total: 0, at: 0, files: [] }
}

/** 0.2.12: these files / folders left out of Check all, or back in. */
export function setSkipped(project: Project, paths: string[], skip: boolean) {
    const s = project.state
    // Included again: the entries for these and under them go (a folder above still left out says so)
    const rest = s.checkSkip.filter(p => !paths.some(r => p === r || p.startsWith(`${r}/`)))
    s.checkSkip = skip ? [...rest, ...paths].sort() : rest
    if (skip) s.checked.files = s.checked.files.filter(f => !isSkipped(project, f.path))
    const above = skip ? undefined : rest.find(p => paths.some(r => r.startsWith(`${p}/`)))
    if (above) { project.say(`${above} is left out of Check all, with everything in it: include that folder instead.`, false); return }
    project.say(skip
        ? `${paths.length === 1 ? paths[0] : `${paths.length} items`} left out of Check all (right-click ▸ Include in Check all brings ${paths.length === 1 ? 'it' : 'them'} back).`
        : `${paths.length === 1 ? paths[0] : `${paths.length} items`} back in Check all.`)
}
