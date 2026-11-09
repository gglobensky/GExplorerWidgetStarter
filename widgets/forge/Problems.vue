<!-- widgets/forge/Problems.vue -->
<!-- GEM FORGE 0.1: the last build's errors and warnings; a click opens the file at the line. The packaging rules found, explained once each. -->
<!-- 0.2.1: TypeScript's problems in the file shown, as you type (lang.ts), after the build's. -->
<!-- 0.2.3: a problem's text can be selected; ⧉ copies it (right-click: Copy, Copy all). -->
<!-- 0.2.4: a missing npm package (the build's, TypeScript's "Cannot find module"): ＋ Add <name> runs npm (Packages shows it). -->
<!-- 0.2.10: Check all files (the toolbar; Checks ▾ chooses which) and its problems by file (All files). -->
<!-- 0.2.12: Prettier among the checks; how many files / folders are left out of Check all. -->
<!-- 0.2.13: a run's problems in a file edited since are hidden (a line says how many) until it runs again. -->
<template>
    <div class="gf-problems">
    <div class="gf-ptools">
        <template v-if="s.checked.running">
            <span class="gf-busy"><span class="gf-spin" />Checking {{ s.checked.done + 1 }} / {{ s.checked.total }}…</span>
            <button type="button" class="gf-ib" title="Stop checking" @click="clearChecked(project)">Stop</button>
        </template>
        <button v-else type="button" class="gf-ib" title="Checks every .ts / .js / .vue file of the project" @click="checkAll(project)">✓ Check all files</button>
        <button type="button" class="gf-ib" title="Which checks Check all files runs" @click="chooseChecks($event)">Checks ▾</button>
        <span v-if="s.checkSkip.length" class="gf-pskip" :title="`Left out of Check all (the Explorer's right-click ▸ Include in Check all):\n${s.checkSkip.join('\n')}`">{{ s.checkSkip.length }} left out</span>
        <span class="gf-pgrow" />
        <button v-if="!s.checked.running && s.checked.at" type="button" class="gf-ib" title="Clear the All files list" @click="clearChecked(project)">Clear</button>
    </div>
    <div class="gf-list">
        <div v-if="!errs.length && !warns.length && !stale && !typed.length && !s.checked.files.length && !s.checked.running" class="gf-empty">{{ s.build || s.lastOkAt ? 'No problems.' : 'Run the project to see its problems.' }}</div>
        <div v-for="(p, i) in errs" :key="'e' + i" class="gf-prob" :class="'err'" role="button" tabindex="0" @click="go(p)" @keydown.enter="go(p)" @contextmenu.prevent="menu($event, p)">
            <span class="gf-pi">✘</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">{{ where(p) }}</span>
            <button v-if="pkgOf(p)" type="button" class="gf-ib gf-padd" :disabled="s.pkg.busy" :title="`npm: add ${pkgOf(p)} to the project (GEM Shell asks first)`" @click.stop="project.addPackage(pkgOf(p)!)">＋ Add {{ pkgOf(p) }}</button>
            <button type="button" class="gf-ib gf-pcopy" title="Copy this problem" @click.stop="copy([p])">⧉</button>
        </div>
        <div v-for="(p, i) in warns" :key="'w' + i" class="gf-prob" :class="'warn'" role="button" tabindex="0" @click="go(p)" @keydown.enter="go(p)" @contextmenu.prevent="menu($event, p)">
            <span class="gf-pi">▲</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">{{ where(p) }}</span>
            <button v-if="pkgOf(p)" type="button" class="gf-ib gf-padd" :disabled="s.pkg.busy" :title="`npm: add ${pkgOf(p)} to the project (GEM Shell asks first)`" @click.stop="project.addPackage(pkgOf(p)!)">＋ Add {{ pkgOf(p) }}</button>
            <button type="button" class="gf-ib gf-pcopy" title="Copy this problem" @click.stop="copy([p])">⧉</button>
        </div>
        <div v-if="stale" class="gf-prob-head" title="Run (or save) to build again">{{ stale }} problem{{ stale === 1 ? '' : 's' }} from the last run hidden: {{ stale === 1 ? 'its file was' : 'their files were' }} edited since (Run or save to check again).</div>
        <p v-for="(n, i) in s.notes" :key="'n' + i" class="gf-note">{{ n }}</p>
        <div v-if="s.types === 'loading'" class="gf-prob-head">TypeScript is loading (once per GEM Shell run)…</div>
        <div v-if="s.typesNote" class="gf-prob-head gf-busy"><span class="gf-spin" />{{ s.typesNote }}</div>
        <template v-if="typed.length">
            <div class="gf-prob-head">As you type (TypeScript): {{ s.typeProblems.path }}</div>
        <div v-for="(p, i) in typed" :key="'t' + i" class="gf-prob" :class="p.rule === 'error' ? 'err' : 'warn'" role="button" tabindex="0" @click="go(p)" @keydown.enter="go(p)" @contextmenu.prevent="menu($event, p)">
            <span class="gf-pi">{{ p.rule === 'error' ? '✘' : '▲' }}</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">{{ where(p) }}</span>
            <button v-if="pkgOf(p)" type="button" class="gf-ib gf-padd" :disabled="s.pkg.busy" :title="`npm: add ${pkgOf(p)} to the project (GEM Shell asks first)`" @click.stop="project.addPackage(pkgOf(p)!)">＋ Add {{ pkgOf(p) }}</button>
            <button type="button" class="gf-ib gf-pcopy" title="Copy this problem" @click.stop="copy([p])">⧉</button>
        </div>
        </template>
        <template v-if="s.checked.files.length">
            <div class="gf-prob-head">All files ({{ s.checked.files.length }} with problems, {{ when }})</div>
            <template v-for="f in s.checked.files" :key="'f' + f.path">
                <div class="gf-pfile" :title="f.path">{{ f.path }} <span class="gf-pcount">{{ f.items.length }}</span></div>
                <div v-for="(p, i) in f.items" :key="f.path + i" class="gf-prob" :class="p.rule === 'error' ? 'err' : 'warn'" role="button" tabindex="0" @click="go(p)" @keydown.enter="go(p)" @contextmenu.prevent="menu($event, p)">
                    <span class="gf-pi">{{ p.rule === 'error' ? '✘' : '▲' }}</span><span class="gf-pt">{{ p.text }}</span><span class="gf-pw">{{ p.line }}:{{ p.column }}</span>
                    <button v-if="pkgOf(p)" type="button" class="gf-ib gf-padd" :disabled="s.pkg.busy" :title="`npm: add ${pkgOf(p)} to the project (GEM Shell asks first)`" @click.stop="project.addPackage(pkgOf(p)!)">＋ Add {{ pkgOf(p) }}</button>
                    <button type="button" class="gf-ib gf-pcopy" title="Copy this problem" @click.stop="copy([p])">⧉</button>
                </div>
            </template>
        </template>
        <div v-else-if="s.checked.at && !s.checked.running" class="gf-prob-head">All files: no problems ({{ when }}).</div>
    </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { DevProblem, WidgetSdk } from 'gexplorer/widgets'
import { packageOf, type Project } from './project'
import { CHECKS, checkAll, clearChecked } from './checks'

const props = defineProps<{ project: Project }>()
const s = props.project.state
// The file shown's, while it's still a file of the project
// 0.2.13: the last build's problems, those in files edited since left out (counted)
const errs = computed(() => s.errors.filter(p => !props.project.isStale(p)))
const warns = computed(() => s.warnings.filter(p => !props.project.isStale(p)))
const stale = computed(() => s.errors.length + s.warnings.length - errs.value.length - warns.value.length)
const typed = computed(() => (props.project.file(s.typeProblems.path) ? s.typeProblems.items : []))
const where = (p: DevProblem) => (p.file ? `${p.file}:${p.line}:${p.column}` : '')
function go(p: DevProblem) {
    // Selecting a problem's text (to copy it) isn't a click on it
    if (String(window.getSelection?.() ?? '').length) return
    if (p.file && props.project.file(p.file)) props.project.open(p.file, { line: p.line, column: p.column })
}

// 0.2.4: the npm package a problem asks for (only in a folder project, with a GEM Shell that has npm)
// 0.2.7: a build's problem is the last build's: its import must still be in the file (renamed since: no button)
function pkgOf(p: DevProblem): string | null {
    if (!s.folder || !props.project.dev?.packages) return null
    const build = /^"([^"]+)": an npm package/.exec(p.text)
    const m = build ?? /^Cannot find module '([^']+)'/.exec(p.text)
    if (!m) return null
    if (build) {
        const text = props.project.file(p.file)?.text ?? ''
        if (!text.includes(`'${m[1]}'`) && !text.includes(`"${m[1]}"`)) return null
    }
    return packageOf(m[1])
}

// 0.2.3: copy one, or all
const sdk = inject<WidgetSdk>('widgetSdk')!
const line = (p: DevProblem) => (where(p) ? `${where(p)}: ${p.text}` : p.text)
async function copy(list: DevProblem[]) {
    try {
        await sdk.clipboardSetText?.(list.map(line).join('\n'))
        props.project.say(list.length === 1 ? 'Problem copied.' : `${list.length} problems copied.`)
    } catch (err) {
        props.project.say(`Not copied: ${String((err as Error)?.message ?? err)}`, false)
    }
}
async function menu(e: MouseEvent, p: DevProblem) {
    const all = [...errs.value, ...warns.value, ...typed.value, ...s.checked.files.flatMap(f => f.items)]
    const id = await sdk.ui?.().menu(e, [{ id: 'copy', label: 'Copy' }, { id: 'all', label: `Copy all (${all.length})` }], { label: 'Problem' })
    if (id === 'copy') void copy([p])
    else if (id === 'all') void copy(all)
}

// 0.2.10: when the list was made; which checks run (ESLint, Prettier: shown, not yet chosen)
const when = computed(() => (s.checked.at ? new Date(s.checked.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''))
async function chooseChecks(e: MouseEvent) {
    const items = CHECKS.map(c => {
        const why = c.unavailable(props.project)
        return { id: c.id, label: `${s.checks.includes(c.id) && !why ? '✓ ' : '　'}${c.label}${why ? ' (coming)' : ''}`, disabled: !!why, title: why ?? undefined }
    })
    const id = await sdk.ui?.().menu(e, items, { label: 'Checks' })
    if (!id) return
    s.checks = s.checks.includes(id) ? s.checks.filter(c => c !== id) : [...s.checks, id]
}
</script>
