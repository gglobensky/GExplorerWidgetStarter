// src/widgets/music/src/entry.ts

import Widget from './Widget.vue'
import PlayerCard from './PlayerCard.vue'

export default {
    api:     '1.0',
    id:      'local-player',
    version: '1.0.0',
    Component: Widget,

    // ── Instance ─────────────────────────────────────────────────────────────
    // 'global': one player for the whole shell. Placed in the sidebar and in a
    // hub's grid (or in two hubs), every copy shows the same queue and the same
    // music; a drop or a menu action is handled once (by the copy last used).
    // Default 'placement': one instance per spot in a layout.
    instance: 'global',

    // ── Drops ────────────────────────────────────────────────────────────────
    // Reference example of a drop zone (host: widgets/dnd/dropSpec.ts). Every
    // field is shown; the ones marked "default" could be left out.
    //
    // The zone is tied to an element in the template: <div v-gex-drop="'queue'">
    // (here the widget root, so drops work in the compact and expanded layouts).
    // The host decides on every hover whether the zone takes what is dragged,
    // shows why not in the cursor tip, and delivers only the audio files of a
    // mixed drop ('dnd:drop' { data, zone: 'queue', skipped }).
    drop: {
        zones: {
            queue: {
                label: 'Queue',                                   // default: the zone id, capitalized
                payloads: ['gex/file-refs', 'gex/file-selection'], // default
                accepts: {
                    kinds: ['file'],                              // default with mime / extensions: files only
                    mime: ['audio/*'],                            // audio files (the host's file-type table)
                    maxCount: 10_000,                             // resolveDropRefs' cap (DROP_REFS_MAX)
                },
                autoFilter: true,                                 // default: take the audio of a mixed drop
                effect: 'copy',                                   // default: the files stay where they are
            },
        },
    },

    // ── Background jobs ──────────────────────────────────────────────────────
    // The music goes on when the player unloads (another tab, a closed sidebar):
    // Widget.vue starts the 'playback' job on its first play and holds its audio
    // element in it. While no Local Player is on screen, PlayerCard shows in the
    // operations tray (the host's frame adds Open and Stop). Closing GEM Shell
    // ends it, without a question.
    // Recovery (claude/job-recovery-design.md, R): GEM Shell stopped while it played (a
    // crash, its window lost, the session ended): the next start resumes at the same track
    // and time once the player is opened. Only when the user keeps widgets' state after a
    // restart (requiresRestore): the queue comes back with it.
    jobs: {
        playback: { card: PlayerCard, recovery: 'resume', requiresRestore: true },
    },

    menuContexts: [
        { id: 'player.track',      label: 'Track in queue', icon: '🎵', builtin: false },
        { id: 'player.background', label: 'Player area',    icon: '🖥',  builtin: false },
    ],

    contexts: {
        grid: {
            layouts: [
                { id: 'compact',    icon: '─',  tooltip: 'Compact Player'   },
                { id: 'expanded',   icon: '▦',  tooltip: 'Player + Queue'   },
                { id: 'visualizer', icon: '〰', tooltip: 'Visualizer Mode'  },
            ],
            minSize: { cols: 2, rows: 2 },
        },
        sidebar: {
            layouts: [
                { id: 'compact',  icon: '─', tooltip: 'Mini Player' },
                { id: 'expanded', icon: '▦', tooltip: 'Full Player' },
            ],
            minHeight: 120,
        },
    },

    actions: [
        {
            id:           'play',
            label:        'Play',
            targetWidget: 'items',
            accepts: {
                contexts:   ['file'],
                extensions: ['.mp3', '.flac', '.wav', '.mp4'],
            },
            contextMenu: {
                label:        'Play in Local Player',
                icon:         '▶',
                submenuLabel: 'Local Player',
            },
        },
        {
            id:           'enqueue',
            label:        'Add to queue',
            targetWidget: 'items',
            accepts: {
                contexts:   ['file'],
                extensions: ['.mp3', '.flac', '.wav'],
            },
            contextMenu: {
                label:        'Enqueue',
                icon:         '➕',
                submenuLabel: 'Local Player',
            },
        },
    ],

    defaults: {
        data: {
            queueName: 'Queue',
        },
        view: {
            volume:  0.9,
            repeat:  'off',
            shuffle: false,
        },
    },

    capabilities: [
        { cap: 'Read',  reason: 'Reads audio files and playlists chosen by the user' },
        { cap: 'Write', reason: 'Saves playlists to disk' },
        { cap: 'Media', reason: 'Streams audio files via HTTP for playback' },
    ]
}