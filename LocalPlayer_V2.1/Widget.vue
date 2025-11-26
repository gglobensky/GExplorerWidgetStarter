<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { usePlayerState } from './usePlayerState'
import { usePlaylist, INPUT_ACCEPT } from './usePlaylist'
import { useMarquee } from './useMarquee'
import { useDnD } from './useDnD'
import { fileRefsToPlaylistItems } from '/src/widgets/dnd/utils'
import { useKeyboardNav } from './useKeyboardNav'
import CompactLayout from './CompactLayout.vue'
import ExpandedLayout from './ExpandedLayout.vue'

import {
  extractGexPayload,
  hasGexPayload,
  authorizeFileRefs,
  FileRefData
} from 'gexplorer/widgets'

const props = defineProps<{
  config?: Record<string, any>
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    layout: string
    size?: any
    resizing: boolean
    resizePhase?: 'active' | 'idle'
  }
  runAction?: (a: any) => void
  context?: 'sidebar' | 'grid'
  variant?: 'compact' | 'expanded' | 'collapsed'
  width?: number
  height?: number
  theme?: string
  editMode?: boolean
  sourceId: string
}>()

const onMediaError = (e: Event) => {
  const t = e.target as HTMLMediaElement
  console.error('[Widget] Media error:', {
    src: t.currentSrc || t.src,
    error: t.error?.code,
    errorMessage: t.error?.message,
    currentTrack: state.current.value?.name,
    currentIndex: state.currentIndex.value
  })
}

type Track = {
  id: string
  url: string
  name: string
  type?: string
}

const expandedLayoutRef = ref<InstanceType<typeof ExpandedLayout> | null>(null)

// ===== PLAYER STATE =====
const state = usePlayerState(props.sourceId)

// ===== LAYOUT =====
const widgetRootEl = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

// utility: common parent dir
function commonDir(paths: string[]) {
  const parts = paths.map(p => p.replace(/\\/g, '/').split('/'))
  let i = 0
  while (true) {
    const seg = parts[0][i]
    if (!seg) break
    if (!parts.every(a => a[i] === seg)) break
    i++
  }
  const shared = parts[0].slice(0, i).join('/')
  return shared.endsWith(':') ? shared + '/' : shared || '/'
}

// Convert file-refs → streaming playlist items (gex://) → Tracks
async function refsToTracks(
  refs: FileRefData[],
  receiverWidgetType: string,
  receiverWidgetId: string
): Promise<Track[]> {
  const items = await fileRefsToPlaylistItems(refs, receiverWidgetType, receiverWidgetId)
  return items.map(it => ({
    id: it.id || it.src,
    url: it.src,
    name: it.name || it.src.split(/[\\/]/).pop() || 'track',
    type: it.type
  }))
}

// Push tracks into queue and sync the underlying playlists engine
async function appendTracks(tracks: Track[]) {
  if (!tracks.length) return
  state.queue.value = state.queue.value.concat(tracks)
  state.playlists.setItems(state.sel, state.toPlaylistItems(), { keepCurrent: true })
}

// rAF + idle-gated width pipeline ------------------------------------------
let pendingWidth: number | null = null
let rafForWidth = 0

function commitWidth(w: number) {
  if (Math.abs(w - containerWidth.value) < 1) return
  containerWidth.value = w | 0
}

function scheduleWidth(w: number, src: 'host' | 'ro' = 'ro') {
  pendingWidth = w | 0
  if (props.placement?.resizePhase === 'active' && src === 'ro') return
  if (rafForWidth) return
  rafForWidth = requestAnimationFrame(() => {
    rafForWidth = 0
    if (pendingWidth != null) {
      commitWidth(pendingWidth)
      pendingWidth = null
    }
  })
}

function seedMeasureNow() {
  const el = widgetRootEl.value
  if (!el) return
  const w = Math.round(el.getBoundingClientRect().width || 0)
  if (w) scheduleWidth(w)
}

watch(() => props.placement?.resizePhase, (phase) => {
  if (phase === 'idle' && pendingWidth != null) {
    commitWidth(pendingWidth)
    pendingWidth = null
  }
})
// ---------------------------------------------------------------------------

const hostContext = computed<'grid' | 'sidebar' | 'embedded'>(() =>
  props.placement?.context ?? props.context ?? 'sidebar'
)

const hostLayout = computed<string>(() =>
  props.placement?.layout ?? props.variant ?? 'expanded'
)

const hostWidth = computed(() => {
  const p = props.placement?.size
  return typeof p?.width === 'number' && p.width > 0
    ? p.width
    : typeof props.width === 'number' && props.width > 0
      ? props.width
      : 0
})
watch(hostWidth, (w) => {
  if (w > 0) scheduleWidth(Math.round(w), 'host')
})

const layoutClass = computed(() => {
  const w = containerWidth.value || hostWidth.value || 0
  if (w <= 160) return 'micro'
  if (w <= 260) return 'ultra'
  if (w <= 320) return 'narrow'
  if (w <= 400) return 'medium'
  return 'wide'
})

watch(() => hostLayout.value, () => {
  nextTick(() => {
    if (hostLayout.value !== 'compact') seedMeasureNow()
  })
})

// ===== DND (list reordering) =====
const showQueue = state.life.cell<boolean>('ui.showQueue', true)
const dnd = useDnD(
  state.queue,
  state.currentIndex,
  showQueue,
  () => expandedLayoutRef.value?.queueEl || null,
  state.toPlaylistItems,
  state.playlists,
  state.sel
)

// ===== PLAYLIST OPS =====
const playlist = usePlaylist(
  state.queue,
  state.currentIndex,
  state.queueName,
  state.isPlaying,
  state.music,
  state.playlists,
  state.sel,
  state.toPlaylistItems,
  () => dnd.ensureSortable(),           // <- if your useDnD exposes ensureDnD()
  'local-player',                  // <- receiverWidgetType
  props.sourceId                   // <- receiverWidgetId
)


// ===== KEYBOARD NAV =====
const keyboard = useKeyboardNav(
  state.queue,
  state.selectedIndex,
  state.hasTracks,
  play
)

// ===== MARQUEE =====
const marquee = useMarquee(
  state.currentTitle,
  layoutClass,
  computed(() => props.placement?.resizePhase),
  computed(() => props.config)
)

// Rack index → sync current/selected
type RackIndexEvt = CustomEvent<{
  listId: string
  index?: number
  item?: { id?: string; url?: string } | null
}>
const onRackIndex = (e: Event) => {
  const d = (e as RackIndexEvt).detail
  let real = typeof d.index === 'number' ? d.index : -1
  if (real < 0 && d.item) {
    const { id, url } = d.item
    if (id) real = state.queue.value.findIndex(t => t.id === id)
    if (real < 0 && url) real = state.queue.value.findIndex(t => t.url === url)
  }
  if (real >= 0) {
    if (state.currentIndex.value !== real) state.currentIndex.value = real
    if (state.selectedIndex.value !== real) state.selectedIndex.value = real
  }
}

// ===== PLAYER CONTROLS =====
async function play(index?: number) {
  await state.prime()
  state.isLoading.value = true

  if (typeof index === 'number') {
    if (index >= 0 && index < state.queue.value.length && state.queue.value[index]?.url) {
      const idx = await state.playlists.playIndex(state.sel, index, state.music)
      if (idx >= 0) {
        state.currentIndex.value = idx
        state.selectedIndex.value = idx
        state.isPlaying.value = true
      }
    }
    state.isLoading.value = false
    return
  }

  if (state.currentIndex.value === -1) {
    const first = state.queue.value.findIndex(t => !!t.url)
    if (first >= 0) {
      const idx = await state.playlists.playIndex(state.sel, first, state.music)
      if (idx >= 0) {
        state.currentIndex.value = idx
        state.selectedIndex.value = idx
        state.isPlaying.value = true
      }
      state.isLoading.value = false
      return
    }
  }

  try { await state.music.play(); state.isPlaying.value = true } catch { state.isPlaying.value = false }
  setTimeout(() => { state.isLoading.value = false }, 300)
}

function pause() {
  state.music.pause()
  state.isPlaying.value = false
}

function togglePlay() {
  if (!state.hasTracks.value) return
  state.isPlaying.value ? pause() : play()
}

function next() {
  state.playlists.next(state.sel, state.music).then((idx: number) => {
    if (idx >= 0) {
      state.currentIndex.value = idx
      state.selectedIndex.value = idx
    } else {
      pause()
    }
  })
}

function prev() {
  state.playlists.prev(state.sel, state.music).then((idx: number) => {
    if (idx >= 0) {
      state.currentIndex.value = idx
      state.selectedIndex.value = idx
    } else {
      pause()
    }
  })
}

function seek(e: Event) {
  if (!state.duration.value) return
  const v = parseFloat((e.target as HTMLInputElement).value)
  state.music.currentTime = v * state.duration.value
}

function adjustSpeed(delta: number) {
  const newRate = Math.max(0.25, Math.min(3.0, state.playbackRate.value + delta))
  state.playbackRate.value = newRate
  state.music.playbackRate = newRate
}

function setVolume(v: number) {
  const clamped = Math.min(1, Math.max(0, v))
  state.volume.value = clamped
  if (clamped > 0) state.lastNonZeroVolume.value = clamped
  state.music.volume = clamped
}

function toggleMute() {
  setVolume(state.volume.value > 0 ? 0 : state.lastNonZeroVolume.value || 0.5)
}

function volInput(v: number) {
  setVolume(v)
}

function toggleShuffle() {
  state.shuffle.value = !state.shuffle.value
  state.playlists.setOptions(state.sel, { shuffle: state.shuffle.value })
}

function toggleRepeat() {
  state.repeat.value = state.repeat.value === 'off' ? 'all' : state.repeat.value === 'all' ? 'one' : 'off'
  state.playlists.setOptions(state.sel, { repeat: state.repeat.value })
}

async function clickPick() {
  // Prefer host dialog; falls back to browser picker or <input> inside the hook.
  await playlist.loadAndMerge()
}

function toggleQueue() {
  showQueue.value = !showQueue.value
}

// ===== QUEUE RENAME =====
const renaming = ref(false)
const draftQueueName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function beginRename() {
  draftQueueName.value = state.queueName.value
  renaming.value = true
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

function cancelRename() {
  renaming.value = false
}

function commitRename() {
  const v = draftQueueName.value.trim()
  if (v) state.queueName.value = v
  renaming.value = false
}

// ===== ROW INTERACTIONS =====
async function onRowDblClick(track: any) {
  if (dnd.sortableState.value.isDragging) return
  const realIdx = state.queue.value.findIndex(t => t.id === track.id)
  const idx = await state.playlists.playIndex(state.sel, realIdx, state.music)
  if (idx >= 0) {
    state.currentIndex.value = idx
    state.selectedIndex.value = idx
  }
}

function onRowClick(index: number) {
  keyboard.selectRow(index)
}

// ===== DRAG & DROP (FILES) =====
const draggingOver = ref(false)

function prevent(e: Event) { e.preventDefault(); e.stopPropagation() }
function onDragEnter(e: DragEvent) { prevent(e); draggingOver.value = true }
function onDragOver(e: DragEvent) { prevent(e) }
function onDragLeave(e: DragEvent) { prevent(e); draggingOver.value = false }

async function onDrop(e: DragEvent) {
  prevent(e)
  draggingOver.value = false

  if (hasGexPayload(e)) {
    const payload = extractGexPayload(e)
    if (!payload) return

    if (payload.type === 'gex/file-refs') {
      const auth = await authorizeFileRefs(
        'local-player',
        props.sourceId,
        payload,
        { requiredCaps: ['Read'] }
      )
      if (!auth.ok) return

      const tracks = await refsToTracks(
        payload.data as FileRefData[],
        'local-player',
        props.sourceId
      )

      await appendTracks(tracks)

      if (state.queue.value.length === tracks.length && tracks.length) {
        await play(0)
      }
      return
    }
  }

  if (e.dataTransfer?.files?.length) {
    await playlist.addFiles(e.dataTransfer.files)
  }
}

// ===== MEDIA EVENTS =====
const onMediaPlay = () => { state.isPlaying.value = true }
const onMediaPause = () => { state.isPlaying.value = false }
const onTimeUpdate = async () => {
  state.currentTime.value = state.music.currentTime || 0
}

const onLoadedMeta = (e: Event) => {
  const t = e.target as HTMLMediaElement | null
  const d = t?.duration ?? state.music.duration
  state.duration.value = Number.isFinite(d) ? d : 0
}

const onVolumeChange = () => {
  const v = state.music.volume
  if (v !== state.volume.value) {
    state.volume.value = v
    if (v > 0) state.lastNonZeroVolume.value = v
  }
}

function hydrateFromHandle() {
  state.volume.value = state.music.volume
  if (state.volume.value > 0) state.lastNonZeroVolume.value = state.volume.value
  state.isPlaying.value = !state.music.paused
  state.currentTime.value = state.music.currentTime || 0
  state.duration.value = state.music.duration || 0
}

// ===== LIFECYCLE =====
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  state.music.addEventListener('play', onMediaPlay)
  state.music.addEventListener('pause', onMediaPause)
  state.music.addEventListener('timeupdate', onTimeUpdate)
  state.music.addEventListener('loadedmetadata', onLoadedMeta as any)
  state.music.addEventListener('volumechange', onVolumeChange)
  state.music.addEventListener('error', onMediaError)
  state.music.addEventListener('rack:playlistindex', onRackIndex as EventListener)

  state.playlists.register(state.sel, state.toPlaylistItems(), {
    autoNext: 'linear',
    repeat: state.repeat.value,
    shuffle: state.shuffle.value,
    dedupe: false
  })
  state.playlists.setItems(state.sel, state.toPlaylistItems(), { keepCurrent: true })
  state.playlists.bindToHandle(state.sel, state.music)

  await nextTick()
  seedMeasureNow()
  resizeObserver = new ResizeObserver((entries) => {
    const e = entries[0]
    const w = 'contentBoxSize' in e && e.contentBoxSize
      ? (Array.isArray(e.contentBoxSize) ? e.contentBoxSize[0].inlineSize : e.contentBoxSize.inlineSize)
      : e.contentRect.width
    scheduleWidth(Math.round(w), 'ro')
  })
  if (widgetRootEl.value) resizeObserver.observe(widgetRootEl.value)

  hydrateFromHandle()
})

onBeforeUnmount(() => {
  if (rafForWidth) cancelAnimationFrame(rafForWidth)
  resizeObserver?.disconnect()

  state.music.removeEventListener('play', onMediaPlay)
  state.music.removeEventListener('pause', onMediaPause)
  state.music.removeEventListener('timeupdate', onTimeUpdate)
  state.music.removeEventListener('loadedmetadata', onLoadedMeta as any)
  state.music.removeEventListener('volumechange', onVolumeChange)
  state.music.removeEventListener('error', onMediaError)
  state.music.removeEventListener('rack:playlistindex', onRackIndex as EventListener)

  state.playlists.unbind(state.sel)
  dnd.sortable?.destroy()
})
</script>

<template>
  <div
    ref="widgetRootEl"
    class="widget-root"
    :style="{ '--widget-w': (containerWidth || hostWidth) + 'px' }"
  >
    <!-- Compact Layout -->
    <CompactLayout
      v-if="hostLayout === 'compact'"
      :current="state.current.value"
      :has-tracks="state.hasTracks.value"
      :is-playing="state.isPlaying.value"
      :volume="state.volume.value"
      :volume-icon="state.volumeIcon.value"
      :play-tooltip="`${state.isPlaying.value ? 'Pause' : 'Play'}${state.current.value ? '\n' + state.current.value.name : ''}`"
      @toggle-play="togglePlay"
      @click-pick="clickPick"
      @vol-input="volInput"
    />

    <!-- Expanded Layout -->
    <ExpandedLayout
      v-else
      ref="expandedLayoutRef"
      :queue="state.queue.value"
      :display-queue="dnd.displayQueue.value"
      :current-index="state.currentIndex.value"
      :selected-index="state.selectedIndex.value"
      :current="state.current.value"
      :has-tracks="state.hasTracks.value"
      :can-prev="state.canPrev.value"
      :can-next="state.canNext.value"
      :is-playing="state.isPlaying.value"
      :is-loading="state.isLoading.value"
      :current-time="state.currentTime.value"
      :duration="state.duration.value"
      :volume="state.volume.value"
      :repeat="state.repeat.value"
      :shuffle="state.shuffle.value"
      :queue-name="state.queueName.value"
      :volume-icon="state.volumeIcon.value"
      :playback-rate="state.playbackRate.value"
      :playback-rate-label="state.playbackRateLabel.value"
      :sortable-state="dnd.sortableState.value"
      :layout-class="layoutClass"
      :show-queue="showQueue"
      :renaming="renaming"
      :draft-queue-name="draftQueueName"
      :marquee-on="marquee.marqueeOn.value"
      :marquee-dir="marquee.marqueeDir.value"
      :resize-phase="props.placement?.resizePhase"
      :set-marquee-box="marquee.setMarqueeBox"
      :set-marquee-copy="marquee.setMarqueeCopy"
      @toggle-play="togglePlay"
      @prev="prev"
      @next="next"
      @seek="seek"
      @adjust-speed="adjustSpeed"
      @toggle-shuffle="toggleShuffle"
      @toggle-repeat="toggleRepeat"
      @click-pick="clickPick"
      @toggle-mute="toggleMute"
      @vol-input="volInput"
      @toggle-queue="toggleQueue"
      @begin-rename="beginRename"
      @cancel-rename="cancelRename"
      @commit-rename="commitRename"
      @update:draft-queue-name="(v) => draftQueueName = v"
      @save-playlist="playlist.savePlaylistGexm"
      @row-dblclick="onRowDblClick"
      @row-click="onRowClick"
      @start-row-drag="dnd.startRowDrag"
      @remove-at="playlist.removeAt"
      @drag-enter="onDragEnter"
      @drag-over="onDragOver"
      @drag-leave="onDragLeave"
      @drop="onDrop"
    />
  </div>
</template>
