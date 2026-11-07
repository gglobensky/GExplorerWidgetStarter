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
-->
<template>
    <div class="gf" :class="{ narrow }">
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
            <button type="button" class="gf-btn" :disabled="!s.id" title="The project's files as one text, to paste in a chat" @click="copy('files')">Copy for AI</button>
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
                        @dblclick="startRename(p.id)" @contextmenu.prevent="pageMenu($event, p.id)">{{ pageName(layout, p) }}</button>
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
import { computed, inject, markRaw, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { WidgetSdk, WidgetPlacement } from 'gexplorer/widgets'
import { createProject, projectIdOf, type Project, type Session } from './project'
import { TEMPLATES, templateFiles, type TemplateKind } from './templates'
import TileGrid from './TileGrid.vue'
import {
    cleanLayout, addPage, renamePage, removePage, placeAlone, findPart, setActive, pageName,
    PARTS, PART_TITLES, MAX_PAGES, type Layout, type PartKind,
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
    const items = PARTS.map(k => {
        const at = findPart(l, k)
        const here = at?.page.id === l.page
        return {
            id: k,
            label: here ? `✓ ${PART_TITLES[k]}` : at ? `✓ ${PART_TITLES[k]} (on ${pageName(l, at.page)})` : PART_TITLES[k],
            title: here ? 'On this page' : at ? 'On another page: pick it to move it here' : 'Not placed: pick it to add it here',
        }
    })
    const id = partBtn.value ? await sdk.ui?.().menu(partBtn.value, items, { label: 'Parts' }) : null
    if (!id) return
    const kind = id as PartKind
    const at = findPart(l, kind)
    if (at?.page.id === l.page) change(setActive(l, at.tile.id, kind))
    else change(placeAlone(l, kind, l.page))
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
    switch (id) {
        case 'save': void (s.folder ? project.save() : project.saveToFolder()); return
        case 'save-all': void (s.folder ? project.saveAll() : project.saveToFolder()); return
        case 'run': void project.run(); return
        default: project.exec(id)
    }
}
// GEM Forge's own items in the Explorer's right-click menu (entry.ts menus)
function onMenuItem(m: { itemId?: string; ref?: string }) {
    if (m?.itemId === 'open-file' && m.ref) project.open(m.ref)
}
defineExpose({ onCommand, onWidgetAction, onMenuItem })

// Without the lifecycle (an older GEM Shell): the project ends with the view
onBeforeUnmount(() => {
    window.clearTimeout(snapTimer)
    if (kept) kept.session = project.snapshot()
    if (!life) { sdk.ui?.().setDraft?.(null); void project.dispose() }
})
</script>
