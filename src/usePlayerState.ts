// usePlayerState.ts - Core player state and audio rack integration
import { ref, computed, onMounted } from 'vue'
import { useAudio, createLifecycle } from 'gexplorer/widgets'
import { renewStreamForSource  } from '/src/widgets/dnd/utils'
import { fsMintStreamHttp } from '/src/bridge/ipc'
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
}
export function usePlayerState(sourceId: string) {
    const life = createLifecycle(sourceId)
    const { prime, acquireElement, playlists } = useAudio()
    const sel = { ownerId: sourceId, category: 'music' as const, key: 'local-player' }
    const music = acquireElement({
        ownerId: sourceId,
        category: 'music',
        key: 'primary',
        persistent: true,
        keepOnSidebarCollapse: true,
        suspendPolicy: 'continue'
    })
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
        .map(t => ({ id: t.id, src: t.url, name: t.name, type: t.type }))
    }
    return {
        // Lifecycle
        life,
        // Audio
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

    onMounted(() => 
        {
            const audio = useAudio()
            audio.setRenewProvider(({ ownerId, sourcePath, mimeHint }) =>
                fsMintStreamHttp(sourcePath, 'local-player', ownerId, mimeHint)
        )
    })
}