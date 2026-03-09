// src/widgets/music/src/entry.ts

import Widget from './Widget.vue'

export default {
    api:     '1.0',
    id:      'local-player',
    version: '1.0.0',
    Component: Widget,
    dropAccepts: ['gex/file-refs'],

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