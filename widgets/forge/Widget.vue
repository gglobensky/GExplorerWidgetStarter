<!-- widgets/forge/Widget.vue -->
<!--
    GEM FORGE 0.1b: write, run and try a widget in GEM Shell, on pages of tiles (layout.ts, TileGrid.vue).
    A project is a folder (Open a folder…: read, watched, saved there) or a sample in memory (Save to a folder…).
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
            <button type="button" class="gf-btn" :disabled="s.loading" @click="openFolder">Open a folder…</button>
            <button type="button" class="gf-btn" :disabled="s.loading" @click="openClock">Clock sample</button>
            <button v-if="s.id && !s.folder" type="button" class="gf-btn" @click="project.saveToFolder()">Save to a folder…</button>
            <label class="gf-check" title="Run again after each save and each change on disk">
                <input v-model="s.liveReload" type="checkbox"> Live reload
            </label>
            <span class="gf-grow" />
            <button type="button" class="gf-btn" :disabled="!s.id" title="The project's files as one text, to paste in a chat" @click="copy('files')">Copy for AI</button>
            <button type="button" class="gf-btn" :disabled="!s.id" title="The problems and the console, to paste in a chat" @click="copy('problems')">Copy problems</button>
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
import { createProject, type Project, type Session } from './project'
import { CLOCK } from './samples'
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
async function openFolder() {
    const folder = await sdk.ui?.().pickFolder({ title: 'Open a widget project (its folder)', access: 'write', acceptLabel: 'Open' })
    if (folder) await project.openFolder(folder)
}
function openClock() {
    void project.openSample('Clock', CLOCK)
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
defineExpose({ onCommand })

// Without the lifecycle (an older GEM Shell): the project ends with the view
onBeforeUnmount(() => {
    window.clearTimeout(snapTimer)
    if (kept) kept.session = project.snapshot()
    if (!life) void project.dispose()
})
</script>
