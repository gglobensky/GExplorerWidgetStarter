// src/widgets/gexchange/entry.ts
import ChatRoom from './ChatRoom.vue'

export default {
    id: 'gexchange',
    version: '1.0.0',
    displayName: 'GExchange',
    description: 'Secure file sharing and chat rooms',

    capabilities: [
        { cap: 'Read',    reason: 'Lists room contents via the virtual vault filesystem' },
        { cap: 'Write',   reason: 'Ingests files into the secure vault on drop' },
        { cap: 'Network', reason: 'P2P room synchronization and peer file transfer' },
    ],

    Component: ChatRoom,

    // ── Background Workers ────────────────────────────────────────────────────
    // Declared here so the shell can start them at app-start without mounting
    // the widget. Workers are separate executables — the shell owns their lifetime.
    // Use createLifecycle().worker('gexchange-seeder') inside components to observe.

    workers: [
        {
            id:            'gexchange-seeder',
            executable:    'workers/GExchangeSeeder.exe',  // relative to widget bundle root
            startOn:       'app-start',
            restartPolicy: 'on-crash',
            singleton:     true,
            caps:          ['Network', 'Ipc'],
            pipes:         ['status', 'commands'],
            description:   'P2P seeder and DHT peer discovery for GExchange rooms',
        },
        {
            id:            'gexchange-push',
            executable:    'workers/GExchangePush.exe',
            startOn:       'app-start',
            restartPolicy: 'on-crash',
            singleton:     true,
            caps:          ['Network', 'Ipc'],
            pipes:         ['status'],
            description:   'Push notification listener for room events',
        },
    ],

    // ── Virtual Filesystem ────────────────────────────────────────────────────

    vfsHandlers: [
        {
            scheme: 'gexchange',
            label:  'GExchange Secure Room',
            icon:   'mdi-chat-lock',
            resolver: 'backend',
            ops: ['listDir', 'getMetadata', 'copy', 'delete', 'open', 'watch', 'extract'],
            backendEndpoints: {
                listDir:     'gexchange:listDir',
                getMetadata: 'gexchange:getMetadata',
                copy:        'gexchange:ingest',
                delete:      'gexchange:delete',
                open:        'gexchange:open',
                watch:       'gexchange:watch',
         		extract: 	 'gexchange:extract',
            },
        },
    ],

    // ── Extension Points ──────────────────────────────────────────────────────

    consumes: [
        {
            point:    'gexchange.board',
            multiple: true,
        },
    ],

    // provides: [
    //     {
    //         point:     'shell.controlPanel.icon',
    //         component: () => import('./ControlPanelIcon.vue'),
    //         props:     { label: 'GExchange', icon: 'mdi-chat-lock' },
    //     },
    // ],

    // ── Layout ────────────────────────────────────────────────────────────────

    contexts: {
        grid: {
            minSize:     { cols: 3, rows: 3 },
            defaultSize: { cols: 4, rows: 4 },
        },
    },

    defaults: {
        data: { room: '' },
        view: { layout: 'chat' },
    },
}