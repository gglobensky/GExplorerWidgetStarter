<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const showQueue = ref(true)          // NEW: queue visibility

function toggleQueue() {             // NEW: toggle
  showQueue.value = !showQueue.value
}

const props = defineProps<{
  context?: 'sidebar' | 'grid',
  variant?: 'compact' | 'expanded' | 'collapsed',
  width?: number,
  height?: number,
  gridSize?: { cols: number; rows: number }
}>()

type Track = {
  id: string
  name: string
  url: string
  type?: string
  artist?: string
  album?: string
  coverUrl?: string
  duration?: number
}

const ACCEPTED = [
  'audio/mpeg','audio/mp3','audio/ogg','audio/oga',
  'audio/aac','audio/x-m4a','audio/flac','audio/wav','audio/webm'
]

// ----- ResizeObserver -> layout class -----
const rootEl = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
let ro: ResizeObserver | null = null
let roRaf: number | null = null

onMounted(() => {
  if (!rootEl.value) return
  ro = new ResizeObserver(entries => {
    const w = Math.round(entries[0]?.contentRect?.width || 0)
    if (roRaf) cancelAnimationFrame(roRaf)
    roRaf = requestAnimationFrame(() => {
      if (Math.abs(w - containerWidth.value) >= 3) containerWidth.value = w
      roRaf = null
    })
  })
  ro.observe(rootEl.value)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  if (roRaf) cancelAnimationFrame(roRaf)
  ro = null
  roRaf = null
})

/**
 * micro  <= 200px: only play/pause (tooltip shows details)
 * ultra  <= 280px: 1 group per row (4 rows)
 * narrow <= 360px: 2 groups/row (transport|time, modes|volume)
 * medium <= 520px: 2 groups/row, roomier seek
 * wide   >  520px: single row
 */
const layoutClass = computed(() => {
  const w = containerWidth.value
  if (w <= 200) return 'micro'
  if (w <= 280) return 'ultra'
  if (w <= 360) return 'narrow'
  if (w <= 520) return 'medium'
  return 'wide'
})

// ----- Player state -----
const audioEl = ref<HTMLAudioElement | null>(null)
const queue = ref<Track[]>([])
const currentIndex = ref<number>(-1)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.9)
const lastNonZeroVolume = ref(0.9)
const repeat = ref<'off' | 'one' | 'all'>('off')
const shuffle = ref(false)
const draggingOver = ref(false)

const hasTracks = computed(() => queue.value.length > 0)
const canPrev = computed(() => queue.value.length > 0)
const canNext = computed(() => queue.value.length > 0)
const current = computed(() => queue.value[currentIndex.value] || null)

function fmtTime(sec: number) {
  if (!isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${s.toString().padStart(2,'0')}`
}

function setVolume(v: number) {
  const clamped = Math.min(1, Math.max(0, v))
  volume.value = clamped
  if (clamped > 0) lastNonZeroVolume.value = clamped
  if (audioEl.value) audioEl.value.volume = clamped
}
function toggleMute() {
  if (volume.value > 0) setVolume(0)
  else setVolume(lastNonZeroVolume.value || 0.5)
}

function load(index: number) {
  if (index < 0 || index >= queue.value.length) return
  currentIndex.value = index
  const a = audioEl.value!
  a.src = queue.value[index].url
  a.load()
  currentTime.value = 0
  duration.value = 0
}

async function play(index?: number) {
  if (!audioEl.value) return
  if (typeof index === 'number') {
    load(index)
  } else if (currentIndex.value === -1 && queue.value.length) {
    load(0)
  }
  try {
    await audioEl.value.play()
    isPlaying.value = true
  } catch {
    isPlaying.value = false
  }
}
function pause() {
  audioEl.value?.pause()
  isPlaying.value = false
}
function togglePlay() {
  if (!hasTracks.value) return
  isPlaying.value ? pause() : play()
}

function next() {
  if (!queue.value.length) return
  if (repeat.value === 'one') { play(currentIndex.value); return }

  if (shuffle.value) {
    let n = currentIndex.value
    if (queue.value.length > 1) {
      while (n === currentIndex.value) n = Math.floor(Math.random() * queue.value.length)
    }
    load(n); play(); return
  }

  let n = currentIndex.value + 1
  if (n >= queue.value.length) {
    if (repeat.value === 'all') n = 0
    else { pause(); return }
  }
  load(n); play()
}
function prev() {
  if (!queue.value.length) return
  if (audioEl.value && currentTime.value > 2) { audioEl.value.currentTime = 0; return }
  let p = currentIndex.value - 1
  if (p < 0) {
    if (repeat.value === 'all') p = queue.value.length - 1
    else { pause(); return }
  }
  load(p); play()
}

function onTimeUpdate() { if (audioEl.value) currentTime.value = audioEl.value.currentTime }
function onLoadedMeta()  { if (audioEl.value) duration.value = audioEl.value.duration || 0 }
function onEnded() { next() }

function seek(e: Event) {
  if (!audioEl.value || !duration.value) return
  const t = e.target as HTMLInputElement
  const v = parseFloat(t.value)
  audioEl.value.currentTime = v * duration.value
}
function volInput(e: Event) {
  const t = e.target as HTMLInputElement
  setVolume(parseFloat(t.value))
}

// ----- Queue ops -----
function clearQueue() {
  pause()
  queue.value = []
  currentIndex.value = -1
  currentTime.value = 0
  duration.value = 0
}
function removeAt(index: number) {
  const wasCurrent = index === currentIndex.value
  queue.value.splice(index, 1)
  if (wasCurrent) {
    if (queue.value.length === 0) { clearQueue(); return }
    const nextIdx = Math.min(index, queue.value.length - 1)
    load(nextIdx)
    if (isPlaying.value) play()
  } else if (index < currentIndex.value) {
    currentIndex.value -= 1
  }
}
function addFiles(files: FileList | File[]) {
  const tracks: Track[] = []
  for (const f of Array.from(files)) {
    const typeOk = ACCEPTED.includes(f.type) || /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(f.name)
    if (!typeOk) continue
    const id = `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`
    const url = URL.createObjectURL(f)
    tracks.push({ id, name: f.name, url, type: f.type })
  }
  if (!tracks.length) return
  const startEmpty = queue.value.length === 0
  queue.value.push(...tracks)
  if (startEmpty) { load(0); play() }
}

// ----- DnD + file picker -----
function prevent(e: Event) { e.preventDefault(); e.stopPropagation() }
function onDragEnter(e: DragEvent) { prevent(e); draggingOver.value = true }
function onDragOver(e: DragEvent) { prevent(e) }
function onDragLeave(e: DragEvent) { prevent(e); draggingOver.value = false }
function onDrop(e: DragEvent) {
  prevent(e); draggingOver.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

const fileInput = ref<HTMLInputElement | null>(null)
function clickPick() { fileInput.value?.click() }
function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

// ----- Mount / unmount -----
onMounted(() => { if (audioEl.value) audioEl.value.volume = volume.value })
onBeforeUnmount(() => { for (const t of queue.value) if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url) })

// ----- UI helpers -----
function toggleRepeat() {
  repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
}
function toggleShuffle() { shuffle.value = !shuffle.value }
function onRowDblClick(i: number) { play(i) }

// Tooltip for micro layout
const microTooltip = computed(() => {
  const title = current.value?.name || 'No track'
  const t = `${fmtTime(currentTime.value)} / ${fmtTime(duration.value || 0)}`
  return `${title}\n${t}`
})

// after layoutClass computed
const isTight = computed(() => layoutClass.value === 'micro' || layoutClass.value === 'ultra')

// unified tooltip text for the play/pause & add buttons
const playTooltip = computed(() => {
  const head = isPlaying.value ? 'Pause' : 'Play'
  const name = queue.value[currentIndex.value]?.name
  const timeLine = `${fmtTime(currentTime.value)} / ${fmtTime(duration.value || 0)}`
  return name ? `${head}\n${name}\n${timeLine}` : head
})

const addTooltip = computed(() => {
  const name = queue.value[currentIndex.value]?.name
  const timeLine = `${fmtTime(currentTime.value)} / ${fmtTime(duration.value || 0)}`
  return name ? `Add files…\n${name}\n${timeLine}` : 'Add files…'
})
</script>

<template>
  <div class="player-root"
       :class="[props.context, props.variant, layoutClass, { 'drag-over': draggingOver }]"
       ref="rootEl"
       @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">

    <!-- Hidden input for manual file picking -->
    <input ref="fileInput"
           type="file" multiple
           :accept="ACCEPTED.join(',')"
           style="display:none"
           @change="onFileInput" />

    <!-- Controls -->
    <div class="controls" :class="layoutClass">
      <!-- Transport -->
      <div class="transport">
      <!-- Prev/Next only when not in micro -->
      <button
        v-if="layoutClass !== 'micro'"
        class="btn prev"
        title="Previous"
        :disabled="!canPrev"
        @click="prev">⏮</button>

      <button
        class="btn primary play"
        :title="playTooltip"
        :disabled="!hasTracks"
        @click="togglePlay">
        <span v-if="isPlaying">⏸</span><span v-else>▶</span>
      </button>

      <!-- Extra add button only in micro -->
      <button
        v-if="layoutClass === 'micro'"
        class="btn add"
        :title="addTooltip"
        @click="clickPick">⏏</button>

      <button
        v-if="layoutClass !== 'micro'"
        class="btn next"
        title="Next"
        :disabled="!canNext"
        @click="next">⏭</button>
    </div>

      <!-- Time / Seek -->
      <div class="time"  v-if="layoutClass !== 'micro'">
        <span class="mono left">{{ fmtTime(currentTime) }}</span>
        <input class="seek" type="range"
               min="0" max="1" step="0.001"
               :value="duration ? currentTime / duration : 0"
               :disabled="!hasTracks || !duration"
               @input="seek"
               :title="fmtTime(currentTime) + ' / ' + fmtTime(duration || 0)" />
        <span class="mono right">-{{ fmtTime(Math.max(0, (duration || 0) - currentTime)) }}</span>
      </div>

      <!-- Modes -->
      <div class="modes"  v-if="layoutClass !== 'micro'">
        <button class="btn" :class="{ active: shuffle }" title="Shuffle" @click="toggleShuffle">🔀</button>
        <button class="btn" :class="{ active: repeat !== 'off' }" title="Repeat (off/all/one)" @click="toggleRepeat">
          <span v-if="repeat === 'off'">🔁</span>
          <span v-else-if="repeat === 'all'">🔂</span>
          <span v-else>🔂1</span>
        </button>
        <!-- Add files lives here -->
        <button class="btn" title="Add files…" @click="clickPick">⏏</button>
      </div>

      <!-- Volume -->
      <div class="volume" v-if="layoutClass !== 'micro'">
        <button class="btn mute" :class="{ active: volume === 0 }" title="Mute/Unmute" @click="toggleMute">🔊</button>
        <input class="vol" type="range" min="0" max="1" step="0.01" :value="volume" @input="volInput" />
      </div>
    </div>

    <!-- Header (only when there are tracks) -->
    <div v-if="queue.length" class="queue-header">
      <div class="qh-left">
        <strong>Queue</strong>
        <span class="count">{{ queue.length }}</span>
      </div>
      <button
        class="qh-toggle icon-btn"
        :aria-expanded="showQueue"
        :title="showQueue ? 'Hide list' : 'Show list'"
        @click="toggleQueue"
      >
        <span v-if="showQueue">▾</span>
        <span v-else>▸</span>
      </button>
    </div>

    <!-- List (only when there are tracks AND it's expanded) -->
    <div v-if="queue.length && showQueue" class="queue">
      <div class="row header">
        <span>#</span><span>Title</span><span class="dur">Length</span><span class="act"></span>
      </div>
      <div v-for="(t, i) in queue" :key="t.id"
          class="row"
          :class="{ current: i === currentIndex }"
          @dblclick="onRowDblClick(i)">
        <span class="idx">{{ i + 1 }}</span>
        <span class="title" :title="t.name">{{ t.name }}</span>
        <span class="dur mono" v-if="i === currentIndex && duration">{{ fmtTime(duration) }}</span>
        <span class="dur mono" v-else>–</span>
        <span class="act">
          <button class="icon-btn" title="Remove" @click="removeAt(i)">✕</button>
        </span>
      </div>
    </div>

    <!-- Empty (only when there are NO tracks at all) -->
    <div v-if="queue.length === 0" class="empty">
      <p>Drop audio files here or</p>
      <button class="btn" @click="clickPick">Add files…</button>
    </div>

    <!-- Audio element -->
    <audio ref="audioEl"
           @loadedmetadata="onLoadedMeta"
           @timeupdate="onTimeUpdate"
           @ended="onEnded"
           preload="metadata" />
  </div>
</template>

<style scoped>
.player-root{
  display:flex; flex-direction:column; height:100%;
  background:var(--surface-2,#222); color:var(--fg,#eee);
  border:1px solid var(--border,#555); border-radius:var(--radius-md,8px);
  padding:var(--space-sm,8px); box-sizing:border-box;
}
.player-root.drag-over{ outline:2px dashed var(--accent,#4ea1ff); outline-offset:-2px; }

/* -------- Controls grid -------- */
.controls{
  display:grid; gap:var(--space-sm,8px);
  align-items:center; justify-items:center;
  padding:var(--space-xs,6px) var(--space-sm,8px);
  background:var(--surface-1,#1a1a1a);
  border:1px solid var(--border,#555); border-radius:var(--radius-sm,6px);
  box-sizing:border-box; overflow:hidden;
}

.controls .transport {
  grid-area: transport;
  display: flex;
  gap: var(--space-sm, 8px);
  align-items: center;
  justify-content: center; 
}
.controls .time{ grid-area:time; display:flex; align-items:center; gap:var(--space-sm,8px); min-width:0; justify-self:stretch; }
.controls .modes{ grid-area:modes; display:flex; gap:var(--space-sm,8px); align-items:center; }
.controls .volume{ grid-area:volume; display:flex; gap:6px; align-items:center; width:100%; max-width:240px; justify-self:end; }
.controls .seek{ flex:1; min-width:80px; }
.controls .vol { width:100%; }

/* WIDE: single row (time grows; volume constrained) */
.controls.wide{
  grid-template-columns:auto minmax(180px,1fr) auto minmax(140px, 240px);
  grid-template-areas:"transport time modes volume";
}

/* MEDIUM: 2 rows (centered columns) */
.controls.medium{
  grid-template-columns:1fr 1fr;
  grid-template-areas:
    "transport time"
    "modes     volume";
}

/* NARROW: same as medium but labels hidden (see below) */
.controls.narrow{
  grid-template-columns:1fr 1fr;
  grid-template-areas:
    "transport time"
    "modes     volume";
}

/* ULTRA: each group full row; let volume expand full width */
.controls.ultra{
  grid-template-columns:1fr;
  grid-template-areas:
    "transport"
    "time"
    "modes"
    "volume";
}
.controls.ultra .volume{ max-width:none; justify-self:stretch; }

/* MICRO: only play/pause centered */
.controls.micro{
  grid-template-columns:1fr;
  grid-template-areas:"transport";
}

.controls.micro .transport .play{ height:32px; padding:0 12px; }

.controls.micro .transport,
.controls.ultra .transport {
  gap: 6px; /* a hair tighter than default */
}

/* Hide time labels on tight layouts */
.controls.narrow .time .mono,
.controls.ultra  .time .mono,
.controls.micro  .time .mono{ display:none; }

/* Buttons */
.btn{
  height:28px; padding:0 8px; border-radius:var(--radius-sm,6px);
  border:1px solid var(--border,#555); background:var(--surface-2,#222);
  color:var(--fg,#eee); cursor:pointer; transition:all .12s ease;
}
.btn:hover:not(:disabled){ background:var(--surface-3,#333); border-color:var(--accent,#4ea1ff); }
.btn:disabled{ opacity:.4; cursor:not-allowed; }
.btn.primary{ font-weight:700; }
.btn.active{ border-color:var(--accent,#4ea1ff); box-shadow:0 0 0 1px var(--accent,#4ea1ff) inset; }
.mono{ font-variant-numeric:tabular-nums; opacity:.8; }

/* -------- Queue -------- */
.queue { overflow-y: auto; overflow-x: hidden; }

.row{
  display:grid; grid-template-columns:36px 1fr 70px 40px;
  align-items:center; gap:6px; padding:6px 8px;
  border-top:1px solid rgba(255,255,255,.05);
}
.row.header{ position:sticky; top:0; background:var(--surface-2,#222); font-weight:600; border-top:none; }
.row.current{ background:rgba(78,161,255,.12); outline:1px solid var(--accent,#4ea1ff); outline-offset:-1px; }
.idx{ opacity:.6; }
.title{ overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.dur{ text-align:right; opacity:.8; }
.act{ display:flex; justify-content:flex-end; }

.icon-btn{
  width:22px; height:22px; border-radius:4px;
  border:1px solid var(--border,#555); background:var(--surface-2,#222);
  color:var(--fg,#eee); cursor:pointer; transition:all .12s ease;
}
.icon-btn:hover{ background:var(--surface-3,#333); border-color:var(--accent,#4ea1ff); }

/* In MICRO & ULTRA, show only the Title column */
/* Never show horizontal scroll in the queue */
.queue { overflow-y: auto; overflow-x: hidden; }

/* In micro/ultra, hide the header row entirely */
.player-root.micro .queue .row.header,
.player-root.ultra .queue .row.header {
  display: none !important;
}

/* In micro/ultra, collapse to a single column: Title only */
.player-root.micro .queue .row,
.player-root.ultra .queue .row {
  grid-template-columns: 1fr; /* title column only */
}

/* Hide the other cells in micro/ultra rows */
.player-root.micro .queue .row .idx,
.player-root.micro .queue .row .dur,
.player-root.micro .queue .row .act,
.player-root.ultra .queue .row .idx,
.player-root.ultra .queue .row .dur,
.player-root.ultra .queue .row .act {
  display: none !important;
}

/* Keep long titles tidy */
.player-root.micro .queue .row .title,
.player-root.ultra .queue .row .title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Queue header (compact, aligns with your theme) */
.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-sm, 8px);
  padding: 6px 8px;
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-1, #1a1a1a);
}

.queue-header .qh-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.queue-header .count {
  opacity: 0.7;
  font-size: 12px;
}

/* reuse your small icon button style */
.qh-toggle {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* In micro/ultra, keep header super tight */
.player-root.micro .queue-header,
.player-root.ultra .queue-header {
  padding: 4px 6px;
}

/* Empty state */
.empty{ margin:auto; text-align:center; opacity:.85; }
.empty .btn{ margin-top:8px; }
</style>
