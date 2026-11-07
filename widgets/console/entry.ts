// widgets/console/entry.ts
//
// GEM CONSOLE 0.1.0 (2026-11-06): consoles like Visual Studio's terminal: tabs of sessions, each in the shell you pick
// (Command Prompt, Windows PowerShell, PowerShell 7, Git Bash, WSL distros).
//   - In a hub's grid it is a PANE (role 'navigable'): the path bar, Favorites, Back / Forward / Up move it, and a `cd`
//     typed in it moves the path bar.
//   - In the sidebar: its own path field and a favorites menu.
//   - In the toolbar: a button that grows into a console (a console popover), with its own path field.
//   - "Open console here" on folder menus moves the console you placed (it never opens a new widget).
// 0.1.1: the sidebar shows the console (it showed the path field only); a move waiting because something is typed says
// "at the next prompt" (GEM Shell no longer counts the terminal's own focus reports as typing: console-5).
// 0.1.2: the sidebar really shows the console (its height as a min-height: GEM Shell's flex host ignored the height);
// Git Bash / WSL no longer look busy at their prompt (GEM Shell: console-6).
// 0.1.3: Start ▾ chooses the shell of the first console (GEM Shell: console-7, no freeze the first time).
// 0.1.4: a spinner while a console starts ("Starting PowerShell 7…", or a tab beside the others); ready for a Linux
// GEM Shell (POSIX paths compared with their case, xterm.js's ConPTY mode for Windows sessions only).
// 0.1.5: the OS from GEM Shell (sdk.platform): 0.1.4 read the user agent and offered Linux shells on Windows.
// 0.1.6: links in the output open on Ctrl+click (GEM Shell's openUrl asks first; a program's own OSC 8 links too).
// Shell parts it relies on: PhotinoVue1/CONSOLE-SHELL-ADDITIONS.md (A: sessions, B: the SDK and raw keys, C: the
// navigable role, E: console popovers and the home folder default).
import Widget from './Widget.vue'

export default {
    api: '1.0',
    id: 'console',
    version: '0.1.6',
    license: 'PolyForm-Noncommercial-1.0.0',
    Component: Widget,
    displayName: 'GEM Console',
    description: 'Consoles in tabs: Command Prompt, PowerShell, Git Bash and WSL. In a hub it follows the path bar; "Open console here" on any folder.',
    category: 'tools',
    icon: 'terminal',

    // A pane in a hub's grid: GEM Shell's path bar, Back / Forward / Up and Favorites move it (Widget.vue exposes
    // applyExternalCwd). Never a file explorer.
    role: 'navigable',
    instance: 'placement',

    contexts: {
        grid: { minSize: { width: 320, height: 160 }, defaultSize: { width: '50%', height: '40%' } },
        sidebar: { minHeight: 220, maxHeight: 900 },
        toolbar: { width: 40 },
    },

    // The keys a console can't do without, among those GEM Shell keeps for itself (leave the pane: Esc by default).
    // F6 / Shift+F6 still move the focus out; the user is told once (GEM Shell's snackbar).
    keyboard: { claims: ['Esc'] },

    actions: [
        {
            id: 'open-here',
            label: 'Open console here',
            accepts: { contexts: ['folder', 'background'], kinds: 'folders', count: { max: 1 } },
            contextMenu: { label: 'Open console here', icon: '>_', submenuLabel: 'GEM Console' },
        },
    ],

    defaults: { data: {}, view: {} },

    capabilities: [
        { cap: 'Terminal', reason: 'Runs the consoles you open in it, as you.' },
        { cap: 'Favorites', reason: 'Lists your favorite folders, to move a console there.' },
        { cap: 'Clipboard', reason: 'Copies the text you select in a console.' },
    ],
}
