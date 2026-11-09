<!-- widgets/forge/Widget.vue -->
<!--
    GEM FORGE 0.1c: write, run and try a widget in GEM Shell, on pages of tiles (layout.ts, TileGrid.vue).
    A project is a folder (Open a folder…: read, watched, saved there). New ▾ makes one from a template (templates.ts)
    in an empty folder the user picks or makes. Widget ▾: Install / Update / Uninstall (GEM Shell asks each time).
    A folder in GEM Shell's explorer ▸ Open in GEM Forge (entry.ts actions: onWidgetAction).
    A project in memory (a 0.1a/0.1b sample, restored) still has Save to a folder….
    Run builds it (sdk.dev().build) and runs it as dev-<project> (sdk.dev().run); live reload runs it again after
    each save and each change on disk (an AI writing the files).
    KEPT WHILE AWAY (the lifecycle): the project lives as long as this copy (a resource cell: a tab switch finds it as
    it was, watch, runs and editor states included); its snapshot (a data cell) brings it back after GEM Shell put the
    copy away. The pages are this copy's view (view.forge).
    0.1d, THE PLAYGROUND (playground.ts): in the toolbar, GEM Forge is a ⚒ button opening the playground's popover
    (PlayPopover.vue); in the sidebar, the playground in a column (Playground.vue); in a hub, the IDE, with the
    playground as a part (＋ Part ▸ Playground). Its own project in memory, kept with the lifecycle like the main one.
    Export .zip… (zip.ts) replaces Copy for AI: the project in one file.
-->
<template>
    <div v-if="where === 'toolbar'" class="gf-tb">
        <button ref="tbBtn" type="button" class="gf-tb-btn" :class="{ open: popOpen }" title="GEM Forge's playground: a line of code, run at once" @click="openPop">⚒</button>
        <span ref="tbHost" class="gf-tb-host" aria-hidden="true" />
    </div>
    <div v-else-if="where === 'sidebar'" class="gf-pop gf-play-wrap">
        <Playground :play="play" size="side" />
    </div>
    <div v-else class="gf" :class="{ narrow }">
        <header class="gf-bar">
            <span class="gf-logo">⚒</span>
            <strong>GEM Forge</strong>
            <button ref="newBtn" type="button" class="gf-btn" :disabled="s.loading" title="A new project, in an empty folder you pick or make" @click="newMenu">New ▾</button>
            <button type="button" class="gf-btn" :disabled="s.loading" @click="openFolder">Open a folder…</button>
            <button v-if="s.id && !s.folder" type="button" class="gf-btn" @click="project.saveToFolder()">Save to a folder…</button>
            <label class="gf-check" title="Run again after each save and each change on disk">
                <input v-model="s.liveReload" type="checkbox"> Live reload
            </label>
            <span class="gf-grow" />
            <button type="button" class="gf-btn" :disabled="!s.id" title="The project's files in one .zip archive (for an AI, or to share)" @click="project.exportZip()">Export .zip…</button>
            <button type="button" class="gf-btn" :disabled="!s.id" title="The problems and the console, to paste in a chat" @click="copy('problems')">Copy problems</button>
            <button ref="widgetBtn" type="button" class="gf-btn" :disabled="!s.id || s.installing" title="Install, update or uninstall this widget" @click="widgetMenu">{{ s.installing ? 'Installing…' : 'Widget ▾' }}</button>
            <button type="button" class="gf-run" :disabled="!s.id || s.building" @click="project.run()">{{ s.building ? 'Building…' : '▶ Run' }}</button>
        </header>
        <div v-if="s.status" class="gf-status" :class="{ bad: !s.statusOk }">{{ s.status }}</div>

        <nav class="gf-pages">
            <template v-for="p in layout.pages" :key="p.id">
                <input v-if="renaming === p.id" ref="renameBox" v-model="renameText" class="gf-page-name"
                       @keydown.enter="finishRename" @keydown.esc="renaming = ''" @blur="finishRename">
                <button v-else type="button" class="gf-page" :class="{ on: p.id === layout.page }"
                        title="Double-click to rename; right-click for more" @click="change({ ...layout, page: p.id })"
                        @dblclick="startRename(p.id)" @contextmenu.prevent="pageMenu($event, p.id)">{{ pageName(layout, p) }}<span v-if="dirtyPage === p.id" class="gf-dirty" title="Files not saved">●</span></button>
            </template>
            <button type="button" class="gf-page gf-page-add" title="A new page" :disabled="layout.pages.length >= MAX_PAGES" @click="change(addPage(layout))">＋</button>
            <span class="gf-grow" />
            <button ref="partBtn" type="button" class="gf-btn" @click="partMenu">＋ Part</button>
            <button v-if="!narrow" type="button" class="gf-btn" :class="{ on: arranging }" title="Move and resize the tiles of this page" @click="arranging = !arranging">✎ {{ arranging ? 'Done' : 'Arrange' }}</button>
        </nav>

        <TileGrid class="gf-main" :project="project" :layout="layout" :arranging="arranging && !narrow" :narrow="narrow" @change="change" />
    </div>
</template>

<script setup lang="ts">
import './forge.css'
import { computed, inject, markRaw, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import type { DevPreviewHandle } from 'gexplorer/widgets'
import Playground from './Playground.vue'
import PlayPopover from './PlayPopover.vue'
import QuickOpen from './QuickOpen.vue'
import { createPlayground, playStoreInit, isSfc, type Playground as PlaygroundApi, type PlayStore } from './playground'
import type { WidgetSdk, WidgetPlacement } from 'gexplorer/widgets'
import { createProject, projectIdOf, type Project, type Session } from './project'
import { TEMPLATES, templateFiles, type TemplateKind } from './templates'
import TileGrid from './TileGrid.vue'
import { checkAll, checkPaths, setSkipped } from './checks'
import { prettyFor, prettierDone, SUPPORTED } from './pretty'
import {
    cleanLayout, addPage, renamePage, removePage, placeAlone, findPart, setActive, pageName,
    PARTS, PART_TITLES, MAX_PAGES, MULTI, newPartId, partTitle, previewOpts, setPreviewOpts, type Layout, type PartId,
} from './layout'

const props = defineProps<{ sourceId: string; placement?: WidgetPlacement; config?: { view?: Record<string, unknown> } }>()
const sdk = inject<WidgetSdk>('widgetSdk')!

// ── The project: kept while this copy lives (a resource), its snapshot kept while it's away (data) ─────────────────
const life = sdk.lifecycle?.()
const project: Project = life
    ? life.persistRef<Project>('gf-project', () => markRaw(createProject(sdk)), { dispose: p => void p.dispose() }).value
    : createProject(sdk)
const kept = life?.persistReactive<{ session: Session | null }>('gf-session', () => ({ session: null }))
const s = project.state
// Back after GEM Shell put this copy away (or restarted): the project from its snapshot
if (!s.id && kept?.session) void project.restore(kept.session)
// The snapshot follows the project (a second after the last change: typing doesn't write it each key)
let snapTimer = 0
watch(() => [s.id, s.folder, s.active, s.openTabs.length, s.liveReload, s.files.map(f => f.text.length).join(',')], () => {
    if (!kept) return
    window.clearTimeout(snapTimer)
    snapTimer = window.setTimeout(() => { kept.session = project.snapshot() }, 1000)
})
life?.onSuspend(() => { if (kept) { window.clearTimeout(snapTimer); kept.session = project.snapshot() } })

// ── The playground (0.1d): its project in memory, its permissions and history, kept the same way ─────────────────
const where = computed(() => (props.placement?.context === 'toolbar' ? 'toolbar' : props.placement?.context === 'sidebar' ? 'sidebar' : 'ide'))
const playStore = life?.persistReactive<PlayStore>('gf-play-store', playStoreInit) ?? playStoreInit()
const play: PlaygroundApi = life
    ? life.persistRef<PlaygroundApi>('gf-play', () => markRaw(createPlayground(sdk, props.sourceId, playStore)), { dispose: p => void p.project.dispose() }).value
    : createPlayground(sdk, props.sourceId, playStore)
const playKept = life?.persistReactive<{ session: Session | null }>('gf-play-session', () => ({ session: null }))
const ps = play.project.state
if (!ps.id && playKept?.session) void play.project.restore(playKept.session)
let playTimer = 0
watch(() => [ps.id, ps.files.map(f => f.text.length).join(',')], () => {
    if (!playKept) return
    window.clearTimeout(playTimer)
    playTimer = window.setTimeout(() => { playKept.session = play.project.snapshot() }, 1000)
})
life?.onSuspend(() => { if (playKept) { window.clearTimeout(playTimer); playKept.session = play.project.snapshot() } })
provide('gfPlay', play)
// 0.1.7: each preview part's options (its placement, the simulated sizes), kept in the layout (this copy's view)
provide('gfPreviewOpts', {
    get: (id: string) => previewOpts(layout.value, id),
    set: (id: string, o: Record<string, unknown>) => change(setPreviewOpts(layout.value, id, o)),
})
// Open as a project… (the IDE's Playground part): an empty folder, New project's empty widget with this try
provide('gfPlayAsProject', async () => {
    const folder = await sdk.ui?.().pickFolder({ title: 'Your try as a project: an EMPTY folder for it (its name is the project\'s)', access: 'write', acceptLabel: 'Make the project here' })
    if (!folder || !(await leaveProject())) return
    const name = folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'My widget'
    const id = projectIdOf(name)
    const own = new Map(play.asProjectFiles().map(f => [f.path, f.text]))
    const caps = JSON.stringify(playStore.caps.map(cap => ({ cap, reason: 'TODO: say what it uses this for.' })))
    const files = templateFiles('empty', id, name).map(f => f.path === 'entry.ts'
        ? { ...f, text: f.text.replace('capabilities: [],', `capabilities: ${caps},`) }
        : own.has(f.path) ? { ...f, text: own.get(f.path)! } : f)
    if (await project.createAt(folder, files)) project.say(`${name}: your try is its Widget.vue (widget ${id}).`)
})

// The toolbar: ⚒ opens the popover. A script runs in a 1 px preview out of sight (it remounts on each run); a Vue
// file opens in a window (reopened by GEM Shell on each new run)
const tbBtn = ref<HTMLElement | null>(null)
const tbHost = ref<HTMLElement | null>(null)
const popOpen = ref(false)
let tbPreview: DevPreviewHandle | null = null
function openPop() {
    const ui = sdk.ui?.()
    if (!ui || !tbBtn.value || popOpen.value) return
    popOpen.value = true
    ui.openPopover({
        anchor: tbBtn.value, component: PlayPopover, placement: 'below', maxWidth: 520,
        props: { play, onRun: () => void tbRun(), onWindow: () => void tbWindow(), onExpand: () => openFullPlay() },
        onClose: () => { popOpen.value = false },
    })
}
async function tbRun() {
    const dev = play.project.dev
    if (!(await play.run()) || !dev) return
    if (isSfc(play.code())) {
        tbPreview?.close()
        tbPreview = null
        if (!ps.reopened) await tbWindow()
    } else if (!tbPreview && tbHost.value) {
        const r = await dev.preview(tbHost.value, play.id, { context: 'toolbar' })
        if (r.ok) tbPreview = r.preview
    }
}
async function tbWindow() {
    const r = await play.project.dev?.openWindow(play.id, { title: 'Result' })
    if (r && !r.ok) play.project.log('warn', r.error)
}

// 0.1.5: the whole playground in a window of GEM Forge's own ("GEM Forge — Playground"), from the toolbar's popover
// or the sidebar's ⤢: the IDE part's layout (its result shown in the window: dev.preview takes our windows)
let fullWin: { show(): void; readonly open: boolean } | null = null
function openFullPlay() {
    const ui = sdk.ui?.()
    if (fullWin?.open) { fullWin.show(); return }
    fullWin = ui?.openWindow?.({
        component: Playground, props: { play, size: 'full' }, title: 'Playground',
        width: 960, height: 640, resizable: true, remember: 'forge-playground',
        onClose: () => { fullWin = null },
    }) ?? null
    if (!fullWin) play.project.log('warn', 'The window could not open (an older GEM Shell, or not right after your click).')
}
provide('gfPlayExpand', openFullPlay)

// ── Unsaved edits when GEM Shell closes (sdk.ui().setDraft: no save bar, only the close question) ────────────────
// Save and close: Save all (a sample has no folder yet: it stays open, the message says why); Close without saving:
// the edits dropped; Keep for later: the snapshot (written now) brings them back next time.
sdk.ui?.().setDraft?.({
    label: () => s.name,
    dirty: () => project.dirtyPaths().length > 0,
    save: async () => {
        if (!s.folder) throw new Error('a sample in memory: use Save to a folder… in GEM Forge first (or Keep for later)')
        await project.saveAll()
        const left = project.dirtyPaths()
        if (left.length) throw new Error(`not saved: ${left.join(', ')}`)
    },
    discard: () => project.discardAll(),
    keepable: () => {
        if (!kept) return false
        window.clearTimeout(snapTimer)
        kept.session = project.snapshot()
        return true
    },
})

// ── The pages (this copy's view) ──────────────────────────────────────────────────────────────────────────────────
const layout = ref<Layout>(cleanLayout(props.config?.view?.forge))
watch(() => props.config?.view?.forge, v => { if (v) layout.value = cleanLayout(v) })
function change(l: Layout) {
    layout.value = l
    void sdk.setView?.({ forge: JSON.parse(JSON.stringify(l)) })
}
const arranging = ref(false)
const narrow = computed(() => (props.placement?.size?.width ?? 1200) < 760)

const renaming = ref('')
const renameText = ref('')
const renameBox = ref<HTMLInputElement[] | HTMLInputElement | null>(null)
async function startRename(id: string) {
    const p = layout.value.pages.find(x => x.id === id)
    renaming.value = id
    renameText.value = p?.name ?? ''
    await nextTick()
    const box = Array.isArray(renameBox.value) ? renameBox.value[0] : renameBox.value
    box?.focus()
    box?.select()
}
function finishRename() {
    if (!renaming.value) return
    change(renamePage(layout.value, renaming.value, renameText.value))
    renaming.value = ''
}
async function pageMenu(e: MouseEvent, id: string) {
    const id2 = await sdk.ui?.().menu(e, [
        { id: 'rename', label: 'Rename' },
        { id: 'remove', label: 'Remove the page', disabled: layout.value.pages.length < 2, title: 'Its parts leave the layout: ＋ Part brings them back' },
    ])
    if (id2 === 'rename') void startRename(id)
    else if (id2 === 'remove') change(removePage(layout.value, id))
}

// ＋ Part: ✓ on this page, "✓ (on <page>)" elsewhere: picking one elsewhere (or none) puts it on this page
const partBtn = ref<HTMLElement | null>(null)
async function partMenu() {
    const l = layout.value
    // 0.1.7: Preview may be there several times (preview, preview:2…): each placed one listed, then "Another preview"
    const placed = new Set(l.pages.flatMap(p => p.tiles.flatMap(t => t.parts)))
    const items = PARTS.flatMap(k => {
        const ids: PartId[] = MULTI.includes(k) ? [...placed].filter(id => id.split(':')[0] === k).sort() : [k]
        if (!ids.length) ids.push(k)
        const rows = ids.map(pid => {
            const at = findPart(l, pid)
            const here = at?.page.id === l.page
            return {
                id: pid,
                label: here ? `✓ ${partTitle(pid)}` : at ? `✓ ${partTitle(pid)} (on ${pageName(l, at.page)})` : PART_TITLES[k],
                title: here ? 'On this page' : at ? 'On another page: pick it to move it here' : 'Not placed: pick it to add it here',
            }
        })
        if (MULTI.includes(k) && placed.has(k)) rows.push({ id: `new:${k}`, label: `＋ Another ${PART_TITLES[k].toLowerCase()}`, title: 'One more on this page, with its own placement', disabled: !newPartId(l, k) } as any)
        return rows
    })
    const id = partBtn.value ? await sdk.ui?.().menu(partBtn.value, items, { label: 'Parts' }) : null
    if (!id) return
    if (id.startsWith('new:')) {
        const nid = newPartId(l, id.slice(4) as any)
        if (nid) change(placeAlone(l, nid, l.page))
        return
    }
    const pid = id as PartId
    const at = findPart(l, pid)
    if (at?.page.id === l.page) change(setActive(l, at.tile.id, pid))
    else change(placeAlone(l, pid, l.page))
}

// ── The bar's actions ─────────────────────────────────────────────────────────────────────────────────────────────
/** Before another project replaces this one: its unsaved edits saved, dropped, or kept (false: stay). */
async function leaveProject(): Promise<boolean> {
    const dirty = project.dirtyPaths()
    if (!dirty.length) return true
    const r = await sdk.ui?.().messageBox({
        title: `${s.name}: save your changes?`,
        message: dirty.length === 1 ? `${dirty[0]} has changes not saved.` : `${dirty.length} files have changes not saved.`,
        variant: 'warning',
        buttons: [
            { id: 'cancel', label: 'Cancel', cancel: true },
            { id: 'discard', label: 'Don\'t save', danger: true },
            { id: 'save', label: s.folder ? 'Save' : 'Save to a folder…', default: true },
        ],
    })
    if (!r || !r.button || r.button === 'cancel') return false
    if (r.button === 'discard') { project.discardAll(); return true }
    if (!s.folder) return await project.saveToFolder()
    await project.saveAll()
    return project.dirtyPaths().length === 0
}

async function openFolder() {
    const folder = await sdk.ui?.().pickFolder({ title: 'Open a widget project (its folder)', access: 'write', acceptLabel: 'Open' })
    if (folder && await leaveProject()) await project.openFolder(folder)
}

// New ▾: a template in an empty folder the user picks (or makes, with the dialog's New folder): named after it
const newBtn = ref<HTMLElement | null>(null)
async function newMenu() {
    if (!newBtn.value) return
    const id = await sdk.ui?.().menu(newBtn.value, TEMPLATES.map(t => ({ id: t.kind, label: t.label, title: t.title })), { label: 'New project' })
    if (id) await newProject(id as TemplateKind)
}
async function newProject(kind: TemplateKind) {
    const t = TEMPLATES.find(x => x.kind === kind)!
    const folder = await sdk.ui?.().pickFolder({
        title: `${t.label.replace('…', '')}: an EMPTY folder for it (New folder makes one; its name is the project's)`,
        access: 'write', acceptLabel: 'Make the project here',
    })
    if (!folder || !(await leaveProject())) return
    const name = folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || t.name
    const id = projectIdOf(name)
    if (id === 'forge' || id.startsWith('dev-')) { project.say(`"${name}": pick another name (${id} is GEM Shell's).`, false); return }
    if (await project.createAt(folder, templateFiles(kind, id, name))) project.say(`${name}: made from the ${kind === 'clock' ? 'clock sample' : 'empty widget'} (widget ${id}). AGENTS.md is the guide for your AI.`)
}

// Widget ▾: Install / Update / Uninstall (each asked by GEM Shell)
const widgetBtn = ref<HTMLElement | null>(null)
async function widgetMenu() {
    if (!widgetBtn.value) return
    const ui = sdk.ui?.()
    if (!ui) return
    await project.refreshInstalled()
    const w = s.widgetId
    const items = !w
        ? [{ id: 'none', label: 'entry.ts has no id: nothing to install', disabled: true }]
        : s.installed === 'builtin'
            ? [{ id: 'none', label: `${w} comes with GEM Shell: change the id in entry.ts`, disabled: true }]
            : [
                s.installed === 'yours'
                    ? { id: 'install', label: `Update ${w}`, title: 'Installs this version in place of yours (GEM Shell asks first)' }
                    : { id: 'install', label: `Install as ${w}`, title: 'Your widget, in Add widget (GEM Shell asks first)' },
                { id: 'uninstall', label: `Uninstall ${w}`, disabled: s.installed !== 'yours', title: s.installed === 'yours' ? 'Removed from GEM Shell; the project folder stays' : 'Not installed' },
            ]
    const id = await ui.menu(widgetBtn.value, items, { label: 'Widget' })
    if (id === 'install') await project.install()
    else if (id === 'uninstall') await project.uninstall()
}

// A folder in GEM Shell's explorer ▸ Open in GEM Forge (entry.ts actions)
async function onWidgetAction(msg: { payload?: { actionId?: string; args?: { paths?: string[] }; tokens?: { dir?: string } } }) {
    if (msg?.payload?.actionId !== 'open-project') return
    const folder = msg.payload.args?.paths?.[0] || msg.payload.tokens?.dir || ''
    if (!folder) return
    if (folder === s.folder) { project.say(`${s.name} is already open.`); return }
    if (await leaveProject()) await project.openFolder(folder)
}

async function copy(what: 'files' | 'problems') {
    try {
        await sdk.clipboardSetText?.(project.asText(what))
        project.say(what === 'files' ? 'The project\'s files are on the clipboard: paste them in a chat with your AI.' : 'The problems and the console are on the clipboard.')
    } catch (err) {
        project.say(`Not copied: ${String((err as Error)?.message ?? err)}`, false)
    }
}

/** Keys (commands.ts): the project's, else the editor's. */
function onCommand(id: string) {
    // 0.2.10: F2 in the Explorer is Rename the file. GEM Shell gives F2 to Rename symbol too while not typing (F2 is
    // a widget's key there, the shell's explorer's: not one of its own, so no claim needed or applied), and that
    // command comes first: from the Explorer, it's the file's rename.
    if (id === 'rename-symbol' && (document.activeElement as HTMLElement | null)?.closest?.('.gf-explorer')) id = 'rename-file'
    // 0.1.6: a plain text field of ours has the focus (the toolbar playground's line, a field in a part): its own
    // select all / undo / redo (the editor's commands caught those keys and sent them to an editor not there)
    const el = document.activeElement as HTMLElement | null
    // (0.1.11: only the text field's own commands; Go to file, Find in files… go on)
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && !el.closest('.cm-editor')
        && ['select-all', 'undo', 'redo', 'run', 'save', 'save-all'].includes(id)) {
        if (id === 'select-all') (el as HTMLInputElement).select()
        else if (id === 'undo' || id === 'redo') document.execCommand(id)
        else if (id === 'run' || id === 'save' || id === 'save-all') {
            if (el.closest('.gf-play')) void (where.value === 'toolbar' ? tbRun() : play.run())
            else if (id === 'run') void project.run()
        }
        return
    }
    // In the playground (its editor has the focus): its own run, its editor
    if (where.value !== 'ide' || (document.activeElement as HTMLElement | null)?.closest?.('.gf-play')) {
        if (id === 'save' || id === 'save-all' || id === 'run') void play.run()
        else play.project.exec(id)
        return
    }
    // 0.1.11: Go to file, Find in files
    if (id === 'go-to-file') { goToFile(); return }
    if (id === 'find-in-files') { findInFiles(); return }
    // 0.2.10: Check all files (Problems shown)
    if (id === 'check-all') { project.showPart('problems'); void checkAll(project); return }
    // 0.1.9: the Explorer's selection (keys the user gave these commands)
    if (id === 'delete-files') { void project.deletePaths(topLevel([...s.selected])); return }
    if (id === 'rename-file') { const one = s.selected.length === 1 ? s.selected[0] : s.active; if (one) void renameAsk(one); return }
    switch (id) {
        case 'save': void (s.folder ? project.save() : project.saveToFolder()); return
        case 'save-all': void (s.folder ? project.saveAll() : project.saveToFolder()); return
        case 'run': void project.run(); return
        default: project.exec(id)
    }
}
// GEM Forge's own items in the Explorer's right-click menu (entry.ts menus)
async function onMenuItem(m: { itemId?: string; ref?: string }) {
    const ref = typeof m?.ref === 'string' ? m.ref : ''
    if (m?.itemId === 'rename') return renameAsk(ref)
    if (m?.itemId === 'duplicate') return project.duplicatePaths(selectionOr(ref).filter(p => !!project.file(p)))
    if (m?.itemId === 'delete') return project.deletePaths(topLevel(selectionOr(ref)))
    // 0.2.12: Check, Format with Prettier, Leave out of / Include in Check all
    if (m?.itemId === 'check') { project.showPart('problems'); return checkPaths(project, topLevel(selectionOr(ref))) }
    if (m?.itemId === 'format-prettier') return formatWithPrettier(topLevel(selectionOr(ref)))
    if (m?.itemId === 'skip-checks' || m?.itemId === 'unskip-checks') return setSkipped(project, topLevel(selectionOr(ref)), m.itemId === 'skip-checks')
    if (m?.itemId !== 'new-file' && m?.itemId !== 'new-folder') return
    const dir = ref
    const isFile = m.itemId === 'new-file'
    // 0.1.9: the suggestion is already free (the user's naming pattern: "Untitled (2).vue"); a taken name typed gets it too
    const suggested = await project.freeNameIn(dir, isFile ? 'Untitled.vue' : 'components', !isFile)
    const name = await sdk.ui?.().prompt(isFile ? `A new file in ${dir || s.name}:` : `A new folder in ${dir || s.name}:`, {
        title: isFile ? 'New file' : 'New folder', value: suggested,
        validate: v => project.checkName(v), okLabel: 'Make it',
    })
    if (!name) return
    if (isFile) await project.createFile(dir, name)
    else await project.createFolder(dir, name)
}
provide('gfMenuItem', onMenuItem)

/** 0.2.12: Prettier on these files and folders' (unsaved: Save all keeps it; the file shown follows). */
async function formatWithPrettier(paths: string[]) {
    const pretty = prettyFor(project)
    const under = (p: string) => paths.some(r => p === r || p.startsWith(`${r}/`))
    const files = s.files.filter(f => f.base64 === undefined && under(f.path) && SUPPORTED.test(f.path) && !f.path.startsWith('node_modules/') && !f.path.startsWith('__forge__/'))
    if (!files.length) { project.say('Nothing Prettier formats there.', false); return }
    const texts: Record<string, string> = {}
    const failed: string[] = []
    for (const f of files) {
        const r = await pretty.format(f.path, f.text)
        if (!r) { if (!pretty.available()) { project.say('Prettier needs GEM Shell 2026-11-08 or later.', false); return } continue }
        if ('error' in r) { failed.push(f.path); project.log('warn', `${f.path}: not formatted by Prettier: ${r.error}${r.line ? ` (line ${r.line})` : ''}`); continue }
        if (r.text !== f.text) texts[f.path] = r.text
        prettierDone(project, f.path)
    }
    const n = Object.keys(texts).length
    if (n) project.setTexts(texts)
    const one = files.length === 1 ? files[0].path : `${files.length} files`
    project.say(failed.length
        ? `Prettier: ${n} formatted, ${failed.length} not (they don't parse: Output says where).`
        : n ? `${one}: ${n === 1 && files.length === 1 ? 'formatted' : `${n} formatted`} by Prettier (not saved yet).` : `${one}: already formatted.`, !failed.length)
}

// ── Go to file, Find in files (0.1.11) ──────────────────────────────────────────────────────────────────────────
// The page holding the editor gets a dot while files are unsaved
const dirtyPage = computed(() => (project.dirtyPaths().length ? findPart(layout.value, 'code')?.page.id ?? '' : ''))

let quick: { close(): void } | null = null
function goToFile() {
    const ui = sdk.ui?.()
    const anchor = (document.activeElement as HTMLElement | null)?.closest?.('.gf') as HTMLElement | null
    if (!ui || !s.files.length) return
    quick?.close()
    quick = ui.openPopover({
        anchor: anchor ?? (partBtn.value as HTMLElement), component: QuickOpen, placement: 'center', title: 'Go to file', maxWidth: 560,
        props: {
            files: s.files.map(f => f.path), recent: s.recent,
            onPick: (p: string) => { quick?.close(); quick = null; project.open(p) },
            onCancel: () => { quick?.close(); quick = null },
        },
        onClose: () => { quick = null },
    })
}
// 0.2.4: the project asks for a part (Problems' "＋ Add <name>" shows Packages): placed here, or brought forward
watch(() => s.showPart?.seq, () => {
    const kind = s.showPart?.kind as PartId | undefined
    if (!kind) return
    const l = layout.value
    const at = findPart(l, kind)
    if (!at) change(placeAlone(l, kind, l.page))
    else if (at.page.id !== l.page || at.tile.active !== kind) change(setActive({ ...l, page: at.page.id }, at.tile.id, kind))
})

function findInFiles() {
    const l = layout.value
    const at = findPart(l, 'search')
    if (!at) change(placeAlone(l, 'search', l.page))
    else if (at.page.id !== l.page || at.tile.active !== 'search') change(setActive({ ...l, page: at.page.id }, at.tile.id, 'search'))
    // The editor's selection, when there is one on a single line
    const sel = (window.getSelection?.()?.toString() ?? '').trim()
    void nextTick(() => project.focusSearch(sel && !sel.includes('\n') ? sel.slice(0, 200) : ''))
}

/** The Explorer's selection when <ref> is in it, else <ref> alone. */
function selectionOr(ref: string): string[] {
    const sel = s.selected
    return ref && !sel.includes(ref) ? [ref] : sel.length ? [...sel] : ref ? [ref] : []
}
/** Without what's inside a folder also in the list. */
const topLevel = (paths: string[]) => paths.filter(p => !paths.some(q => q !== p && p.startsWith(`${q}/`)))

/** Rename…: the new name, then (when other files import it) whether their references follow. */
async function renameAsk(rel: string) {
    const ui = sdk.ui?.()
    if (!ui || !project.file(rel)) return
    const old = rel.split('/').pop()!
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    const name = await ui.prompt(`A new name for ${old}:`, {
        title: 'Rename', value: old, okLabel: 'Rename',
        validate: v => project.checkName(v) ?? (v.trim() !== old && project.file((dir ? `${dir}/` : '') + v.trim()) ? 'A file of that name is already there.' : null),
    })
    if (!name || name.trim() === old) return
    const to = (dir ? `${dir}/` : '') + name.trim()
    const plan = project.renamePlan(rel, to)
    if (!plan.length) { await project.renameFile(rel, name); return }
    const n = plan.reduce((a, e) => a + e.count, 0)
    const r = await ui.messageBox({
        title: `Rename ${old} to ${name.trim()}`,
        message: `${n} reference${n === 1 ? '' : 's'} to it in ${plan.length} file${plan.length === 1 ? '' : 's'}: ${plan.map(e => e.path).slice(0, 4).join(', ')}${plan.length > 4 ? '…' : ''}.`,
        detail: 'Update them (smart rename: the imports keep working), or rename the file only.',
        buttons: [
            { id: 'cancel', label: 'Cancel', cancel: true },
            { id: 'only', label: 'Rename only' },
            { id: 'all', label: 'Rename and update', default: true },
        ],
    })
    if (!r?.button || r.button === 'cancel') return
    await project.renameFile(rel, name, r.button === 'all' ? plan : [])
}
defineExpose({ onCommand, onWidgetAction, onMenuItem })

// Without the lifecycle (an older GEM Shell): the project ends with the view
onBeforeUnmount(() => {
    window.clearTimeout(snapTimer)
    window.clearTimeout(playTimer)
    if (kept) kept.session = project.snapshot()
    if (playKept) playKept.session = play.project.snapshot()
    tbPreview?.close()
    if (!life) { sdk.ui?.().setDraft?.(null); void project.dispose(); void play.project.dispose() }
})
</script>
