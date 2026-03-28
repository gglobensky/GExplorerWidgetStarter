// src/widgets/gexchange/entry.ts
// Complete final version.
// No imports from @/internal or @/ui — all behavior via api parameter.
// Third parties can define identical hooks for their own schemes.

import ChatRoom from './ChatRoom.vue'

export default {
    id: 'gexchange',
    version: '1.0.0',
    displayName: 'GExchange',
    description: 'Secure file sharing and chat rooms',

    capabilities: [
     { cap: 'P2P',           reason: 'peer identity and channel management' },
     { cap: 'SecureStorage', reason: 'encrypted file vault per room' },
     { cap: 'Chat',          reason: 'real-time messaging with peers' },
     { cap: 'Network',       reason: 'outbound peer connections' },
    ],

    Component: ChatRoom,

    // ── Background Workers ────────────────────────────────────────────────────

    workers: [
        {
            id:            'gexchange-seeder',
            executable:    'workers/GExchangeSeeder.exe',
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

     vfsHandlers: [{
        // scheme is NOT declared — platform derives it from widget type ('gexchange')
        resolver: 'frontend',
        label:    'GExchange Secure Room',
        icon:     'mdi-chat-lock',
        ops: ['listDir', 'getMetadata', 'copy', 'delete', 'open', 'extract', 'mkdir'],
        handler:  () => import('./vfsHandler'),
 
        stateStyles: {
            ghost:    { opacity: 0.45, badge: '↓', badgeTitle: 'Not downloaded', cursor: 'default', dimName: true },
            fetching: { opacity: 0.65, badge: '⟳', badgeTitle: 'Downloading…',   animated: true },
            unseeded: { opacity: 0.85, badge: '◎', badgeTitle: 'Not seeding' },
            local:    {},
        },
 
        dragHooks: {
            onDragStart: async (entries, api) => {
                const ghosts = entries.filter((e: any) => e?.Meta?.blobState === 'ghost')
                const local  = entries.filter((e: any) => e?.Meta?.blobState !== 'ghost')
 
                if (ghosts.length > 0 && local.length === 0) {
                    const names  = ghosts.length === 1
                        ? `"${ghosts[0].Name}"`
                        : `${ghosts.length} files`
                    const result = await api.showPrompt({
                        id:   'gexchange:drag:ghost:download',
                        text: `${names} ${ghosts.length === 1 ? 'is' : 'are'} not downloaded yet.`,
                        actions: [
                            { label: 'Download', id: 'confirm' },
                            { label: 'Not now',  id: 'cancel'  },
                        ],
                    })
                    if (result.actionId === 'confirm') {
                        for (const e of ghosts) {
                            const roomId = e.FullPath.split('://')[1]?.split('/')[0] ?? ''
                            // dispatch is still available on the drag api for widget-specific calls
                            api.dispatch('gexchange:download', {
                                roomId,
                                hash:     e.Meta?.contentHash ?? '',
                                fileName: e.Name,
                            }).catch(console.warn)
                        }
                    }
                    return { entries: [], cancelled: true }
                }
 
                if (ghosts.length > 0) {
                    return {
                        entries:  local,
                        warnings: [`${ghosts.length} file${ghosts.length > 1 ? 's' : ''} skipped — not downloaded yet.`],
                    }
                }
 
                return { entries }
            },
 
            onDragEnd: async (effect, entries, _api) => {
                console.log(`[GExchange] drag ended: ${effect} × ${entries.length} file(s)`)
            },
        },
    }],

    // ── Extension Points ──────────────────────────────────────────────────────

   provides: [
       {
           point:     'gexchange.board',
           component: () => import('./VoicePanel.vue'),
           props: {
               label: '🎙 Voice',
               icon:  'mdi-microphone',
           },
       },
   ],

   consumes: [
       {
           point:    'gexchange.board',
           multiple: true,
       },
   ],

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