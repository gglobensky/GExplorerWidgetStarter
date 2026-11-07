// widgets/forge/templates.ts
//
// GEM FORGE 0.1c: what New project writes in the folder it makes. Every project starts as a real folder (no project in
// memory any more): Save writes there, the folder watch follows what an AI writes there.
//   empty: the smallest widget (entry.ts, Widget.vue) with the boilerplate commented.
//   clock: the clock sample (samples.ts), its id and name the project's.
// Both carry the guide for AIs: AGENTS.md (the SDK's rules), widgets-sdk.d.ts (the starter's typings, as GEM Forge was
// built with them) and a tsconfig.json pointing 'gexplorer/widgets' at it (editors and AIs read the types; GEM Forge's
// build leaves these three out: buildFilesOf, project.ts).
import SDK_TYPINGS from '../../types/widgets-sdk.d.ts?raw'
import { CLOCK, type SampleFile } from './samples'

export type TemplateKind = 'empty' | 'clock'

export const TEMPLATES: { kind: TemplateKind; label: string; title: string; name: string }[] = [
    { kind: 'empty', label: 'Empty widget…', title: 'A widget with only the boilerplate: entry.ts and Widget.vue', name: 'My widget' },
    { kind: 'clock', label: 'Clock sample…', title: 'The clock: shows more as its box grows (a good first try)', name: 'Clock' },
]

/** Files of the guide (never sent to the build). */
export const GUIDE_FILES = new Set(['AGENTS.md', 'widgets-sdk.d.ts', 'tsconfig.json'])

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** The files of a new project <name> (its widget's id: <id>). */
export function templateFiles(kind: TemplateKind, id: string, name: string): SampleFile[] {
    const own = kind === 'clock' ? clockFiles(id, name) : emptyFiles(id, name)
    return [...own, { path: 'AGENTS.md', text: agentsMd(id, name) }, { path: 'tsconfig.json', text: TSCONFIG }, { path: 'widgets-sdk.d.ts', text: SDK_TYPINGS }]
}

function emptyFiles(id: string, name: string): SampleFile[] {
    return [
        {
            path: 'entry.ts',
            text: `// entry.ts: what GEM Shell reads about this widget before it runs it (AGENTS.md says more).
import Widget from './Widget.vue'

export default {
    api: '1.0',
    // Its name once installed: lower-case letters, digits and single dashes (not a built-in widget's).
    id: '${q(id)}',
    version: '0.1.0',
    Component: Widget,
    displayName: '${q(name)}',
    description: '',
    icon: '🧩',
    // What it may use, each asked to the user at first use: { cap: 'Read', reason: 'Shows the pictures of a folder.' }
    capabilities: [],
}
`,
        },
        {
            path: 'Widget.vue',
            text: `<!-- Widget.vue: what the widget shows. It draws in its own box only (placement.size: that box). -->
<template>
    <div class="w" :class="size">
        <strong>${escHtml(name)}</strong>
        <span class="dim">{{ props.placement?.size?.width ?? '?' }} × {{ props.placement?.size?.height ?? '?' }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { WidgetSdk, WidgetPlacement } from 'gexplorer/widgets'

const props = defineProps<{ sourceId: string; placement?: WidgetPlacement; config?: { view?: Record<string, unknown> } }>()
// GEM Shell's API for this copy (widgets-sdk.d.ts): sdk.ui(), sdk.lifecycle(), sdk.fsReadText…
const sdk = inject<WidgetSdk>('widgetSdk')!
void sdk

/** Small in a toolbar or a crowded sidebar, roomier in a hub. */
const size = computed(() => ((props.placement?.size?.width ?? 300) < 200 ? 'small' : 'large'))
</script>

<style scoped>
.w { height: 100%; box-sizing: border-box; padding: 8px; display: grid; place-content: center; gap: 4px; text-align: center; }
.w.small { padding: 2px; font-size: .9em; }
.dim { opacity: .6; font-size: .85em; }
</style>
`,
        },
    ]
}

function clockFiles(id: string, name: string): SampleFile[] {
    return CLOCK.map(f => {
        let text = f.text.replace(/docs\/forge-samples\/clock\//g, '')
        if (f.path === 'entry.ts') {
            text = text
                .replace(/\/\/ GEM FORGE SAMPLE[\s\S]*?\n(?=import )/, '// The clock sample of GEM Forge: it shows more as its box grows.\n')
                .replace("id: 'my-clock'", `id: '${q(id)}'`)
                .replace("name: 'Clock'", `displayName: '${q(name)}'`)
                .replace(/\n {4}license: '[^']*',/, '')
        }
        return { path: f.path, text }
    })
}

function escHtml(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/[{}]/g, '')
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "paths": { "gexplorer/widgets": ["./widgets-sdk.d.ts"] }
  },
  "include": ["**/*.ts", "**/*.vue"]
}
`

function agentsMd(id: string, name: string): string {
    return `# ${name}: a GEM Shell widget (for AIs and people editing it)

This folder is a widget project, opened in **GEM Forge** (GEM Shell's editor). GEM Forge watches the folder: when you
write a file here, it rebuilds and runs the widget again within a second or so. Its problems (and the widget's console)
show in GEM Forge; the user can copy them for you with *Copy problems*.

## The files
- \`entry.ts\`: the manifest (default export): \`id\` (\`${id}\`: its name once installed; lower-case, digits, single
  dashes), \`version\`, \`Component\`, \`displayName\`, \`description\`, \`icon\`, \`capabilities\`, and optionally
  \`commands\` (keys), \`contexts\` (sizes per placement), \`menus\` / \`menuContexts\` / \`actions\` (context menus).
- \`Widget.vue\`: the component (Vue 3, \`<script setup lang="ts">\`). Props: \`sourceId\`, \`placement\` (its box:
  \`placement.size.width / height\`, its context: grid, sidebar, toolbar), \`config\` (\`config.view\`: what
  \`sdk.setView\` saved for this copy). Other \`.vue\` / \`.ts\` / \`.css\` files may be imported with relative paths.
- \`widgets-sdk.d.ts\`: **the whole API, with its rules in the comments: read it before using something.** Import its
  types from \`'gexplorer/widgets'\` (tsconfig.json points there). The SDK itself: \`inject<WidgetSdk>('widgetSdk')\`.
- This file, \`tsconfig.json\` and \`widgets-sdk.d.ts\` are not part of the widget (GEM Forge doesn't build them).

## The rules GEM Shell enforces
- **Draw in your own box only.** Never reach the page's own body or html element, never use the browser's top layer
  (modal dialog elements, popovers), no iframes, no second Vue app. Menus, popovers and dialogs outside the box:
  \`sdk.ui().menu\`, \`openPopover\`, \`messageBox\`, \`prompt\`, \`confirm\`, \`snack\`. Fixed positioning is relative
  to your box.
- **No code from text:** no \`eval\`, no \`new Function\`. GEM Shell refuses them.
- **Keys:** never listen on \`window\` / \`document\`; listen on your own elements. Actions on keys are commands
  (entry.ts \`commands\`, then \`defineExpose({ onCommand })\`): the user can change their keys.
- **Permissions:** each capability used (Read, Write, Network, Clipboard, Exec…) is declared in entry.ts with a reason
  the user reads (\`{ cap: 'Read', reason: '…' }\`); GEM Shell asks the user at first use. What the user gives while the
  project is edited in GEM Forge lasts while GEM Shell runs.
- **The user's gesture:** opening a link, a file or a place (\`sdk.navigate\`, \`openPath\`, \`openUrl\`, \`reveal\`),
  menus and file dialogs work only right after the user's own click or key press in the widget.
- **Packages:** no npm packages yet (only \`vue\` and \`'gexplorer/widgets'\`): write the code in the project.

## Size and placement
A widget can be in a hub's grid (any size), the sidebar (a column, about 280 px wide) or the toolbar (a 36 px strip,
with a popover). Read \`placement.size\` and show less when it is small: GEM Forge's Preview shows each placement.

## Keeping state (the lifecycle)
GEM Shell may unload a widget that isn't shown and bring it back. \`sdk.lifecycle()\`: \`persistReactive(key, init)\`
for plain data (kept, even across a restart), \`persistRef(key, init, { dispose })\` for resources (timers, watches:
rebuilt, never saved), \`onSuspend(fn)\`. A data cell holds plain data only (no class instances, Maps, functions).

## Installing
GEM Forge's *Widget ▾ ▸ Install* builds the widget as \`${id}\` and installs it after GEM Shell's question; *Update*
replaces it: its copies on screen restart with the new version (their lifecycle data kept).
`
}
