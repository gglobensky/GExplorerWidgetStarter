// usePlayerState.ts - Core player state and audio rack integration
import { ref, computed, onMounted, inject } from '/runtime/vue.js '
import type { WidgetSdk } from 'gexplorer/widgets'
export type Track = {
    id: string
    name: string
    url: string
    type?: string
    artist?: string
    album?: string
    coverUrl?: string
    duration?: number
    missing?: boolean
    srcHint?: string
    _ownedBlob?: boolean
    /** The file it streams (its URL expires: renewed from it, also after a restart). */
    sourcePath?: string
    /** When its stream URL expires (ms or ISO). */
    expiresAt?: string | number | null
}

export function usePlayerState(sourceId: string) {
    // Called from Widget.vue's setup(), so inject() works here. It used to run
    // at module top level, where inject() returns undefined, so mintStreamHttp
    // was undefined and renewing an expired stream URL threw.
    const sdk = inject<WidgetSdk>('widgetSdk')
    if (!sdk) throw new Error('[local-player] usePlayerState: widgetSdk is not provided')
    const { mintStreamHttp } = sdk

    // Bound to this instance by the host (sandbox C3b): no id passed.
    const life = sdk.lifecycle!()
    // The audio rack, bound to this instance too (no owner id passed). The element lives
    // while the widget is mounted, or while the playback job holds it (Widget.vue).
    const audio = sdk.audio!()
    const { prime, acquireElement, playlists } = audio
    const sel = { category: 'music' as const, key: 'local-player' }
    const music = acquireElement({ category: 'music', key: 'primary', suspendPolicy: 'continue' })
    // === Core State (Persisted) ===
    const queue = life.persistRef<Track[]>('queue', [])
    const currentIndex = life.cell<number>('currentIndex', -1)
    const queueName = life.cell<string>('queueName', 'Queue')
    const repeat = life.cell<'off' | 'one' | 'all'>('repeat', 'off')
    const shuffle = life.cell<boolean>('shuffle', false)
    const lastNonZeroVolume = life.cell<number>('ui.lastNonZeroVol', 0.9)
    const playbackRate = life.cell<number>('playbackRate', 1.0)
    // === UI State (NOT persisted - driven by media element) ===
    const isPlaying = ref(false)
    const isLoading = ref(false)
    const currentTime = ref(0)
    const duration = ref(0)
    const volume = ref(0.9)
    const selectedIndex = ref<number>(-1)
    // === Computed ===
    const current = computed(() => queue.value[currentIndex.value] || null)
    const hasTracks = computed(() => queue.value.length > 0)
    const canPrev = computed(() => hasTracks.value)
    const canNext = computed(() => hasTracks.value)
    const currentTitle = computed(() => current.value?.name || '')
    const volumeIcon = computed(() => {
        if (volume.value === 0) return '🔇'
        if (volume.value <= 0.5) return '🔉'
        return '🔊'
    })
    const playbackRateLabel = computed(() => `${playbackRate.value.toFixed(2)}x`)
    // === Helpers ===
    function toPlaylistItems() {
        return queue.value
            .filter(t => !!t.url)
            .map(t => ({ id: t.id, src: t.url, name: t.name, type: t.type, sourcePath: t.sourcePath, expiresAt: t.expiresAt ?? undefined }))
    }
    

    // Expiring stream URLs are renewed through this widget's own minting (it was called
    // with the old (path, type, owner, mime) arguments: the mime hint got 'local-player').
    onMounted(() => {
        audio.setRenewProvider(({ sourcePath, mimeHint }) => mintStreamHttp!(sourcePath, mimeHint))
    })
    return {
        // Lifecycle
        life,
        // Audio
        audio,
        music,
        sel,
        playlists,
        prime,

        // State
        queue,
        currentIndex,
        queueName,
        repeat,
        shuffle,
        lastNonZeroVolume,
        playbackRate,
        isPlaying,
        isLoading,
        currentTime,
        duration,
        volume,
        selectedIndex,

        // Computed
        current,
        hasTracks,
        canPrev,
        canNext,
        currentTitle,
        volumeIcon,
        playbackRateLabel,

        // Helpers
        toPlaylistItems
    }
}