<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

/**
 * NOTE ABOUT FILE PICKERS / SAVE DIALOGS
 * --------------------------------------
 * We currently call the File System Access API (showOpenFilePicker / showSaveFilePicker)
 * directly from the widget. THIS BYPASSES your auth/ticket layer.
 * 
 * >>> TODO(GEX): Replace these calls with your audited Items-powered pickers
 * >>> and fsReadText/fsWriteText IPC once ready.
 * 
 * Every place where we use these APIs is clearly marked with BIG comments.
 */

const showQueue = ref(true)
function toggleQueue() { showQueue.value = !showQueue.value }

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
  missing?: boolean
  srcHint?: string
}

// keep your MIME list, add a companion extension list + combined accept
const ACCEPTED_MIMES = [
  'audio/mpeg','audio/mp3','audio/ogg','audio/oga',
  'audio/aac','audio/x-m4a','audio/flac','audio/wav','audio/webm'
]
const ACCEPTED_EXTS  = [
  '.mp3','.ogg','.oga','.aac','.m4a','.flac','.wav','.webm',
  '.gexm', // our playlist
  // (later we can add .m3u/.m3u8/.pls etc.)
]
const INPUT_ACCEPT = [...ACCEPTED_MIMES, ...ACCEPTED_EXTS].join(',')

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
 * micro  <= 200px: only play/pause (+add) (tooltip shows details)
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
  const t = queue.value[index]
  const a = audioEl.value!
  // Guard: unresolved entries should be skipped on load
  if (!t.url) return
  a.src = t.url
  a.load()
  currentTime.value = 0
  duration.value = 0
}

async function play(index?: number) {
  if (!audioEl.value) return
  if (typeof index === 'number') {
    load(index)
  } else if (currentIndex.value === -1 && queue.value.length) {
    // jump to first resolvable track
    const firstPlayable = queue.value.findIndex(t => !!t.url)
    if (firstPlayable >= 0) load(firstPlayable)
  }
  try {
    if (audioEl.value?.src) {
      await audioEl.value.play()
      isPlaying.value = true
    }
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
  // skip unresolved placeholders
  const start = n
  while (n !== currentIndex.value) {
    if (queue.value[n]?.url) break
    n = (n + 1) % queue.value.length
    if (n === start) break
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
  // skip unresolved placeholders backwards
  const start = p
  while (p !== currentIndex.value) {
    if (queue.value[p]?.url) break
    p = (p - 1 + queue.value.length) % queue.value.length
    if (p === start) break
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
    // NOTE: do not auto-play if that next item is unresolved
    load(nextIdx)
    if (isPlaying.value) play()
  } else if (index < currentIndex.value) {
    currentIndex.value -= 1
  }
}
function addFiles(files: FileList | File[]) {
  const tracks: Track[] = []
  for (const f of Array.from(files)) {
    const name = f.name || ''
    const lower = name.toLowerCase()
    const isAudio = ACCEPTED_MIMES.includes(f.type) ||
                    /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(name)

    if (!isAudio) continue

    const id = `${name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`
    const url = URL.createObjectURL(f)
    tracks.push({ id, name, url, type: f.type, srcHint: '', missing: false })
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
async function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = '' // always reset

  if (!files.length) return

  // split into playlists and audio
  const playlists: File[] = []
  const audios: File[] = []
  for (const f of files) {
    const lname = (f.name || '').toLowerCase()
    if (lname.endsWith('.gexm')) playlists.push(f)
    else audios.push(f)
  }

  if (audios.length) addFiles(audios)

  // Parse each .gexm and merge
  for (const pf of playlists) {
    try {
      const text = await pf.text()
      importGexm(text)  // defined below
    } catch (err) {
      console.warn('[gexm] failed to read:', pf.name, err)
      // (optional) surface a small UI message/snackbar here
    }
  }
}

function importGexm(jsonText: string) {
  let data: any
  try {
    data = JSON.parse(jsonText)
  } catch (e) {
    console.warn('[gexm] invalid JSON')
    return
  }

  if (!data || data.kind !== 'gexm.playlist' || !Array.isArray(data.items)) {
    console.warn('[gexm] not a valid gexm.playlist')
    return
  }

  const imported: Track[] = []
  for (const it of data.items as Array<any>) {
    const name = String(it?.name ?? 'Unknown')
    const href = String(it?.href ?? '')
    const type = typeof it?.type === 'string' ? it.type : ''
    const id = `${name}-${Math.random().toString(36).slice(2)}`

    // We can ONLY safely play http(s) directly right now.
    // blob: from a previous session will not resolve => mark missing/skipped.
    // file:// or raw paths will be addressed later via FsBridge (TODO).
    const hrefLower = href.toLowerCase()
    const looksPlayableNow = hrefLower.startsWith('http://') || hrefLower.startsWith('https://')

    if (looksPlayableNow) {
      imported.push({ id, name, url: href, type, srcHint: href, missing: false })
    } else {
      // mark as missing/skipped (your earlier requirement)
      imported.push({ id, name, url: '', type, srcHint: href, missing: true })
    }
  }

  const startEmpty = queue.value.length === 0
  queue.value.push(...imported)
  // keep current playback state; only autoload if previously empty
  if (startEmpty && queue.value.length) { load(0); play() }
}


// ----- Mount / unmount -----
onMounted(() => { if (audioEl.value) audioEl.value.volume = volume.value })
onBeforeUnmount(() => {
  for (const t of queue.value) if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url)
})

// ----- UI helpers -----
function toggleRepeat() {
  repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
}
function toggleShuffle() { shuffle.value = !shuffle.value }
function onRowDblClick(i: number) { if (queue.value[i]?.url) play(i) }

// Tooltip (tight)
const isTight = computed(() => layoutClass.value === 'micro' || layoutClass.value === 'ultra')
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

// ====== Queue title: rename inline + save/load ======
const queueName = ref('Queue')
const renaming = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
// add next to queueName/renaming/nameInput
const draftQueueName = ref('')

function beginRename() {
  draftQueueName.value = queueName.value
  renaming.value = true
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}
function cancelRename() { renaming.value = false }
function commitRename() {
  const v = draftQueueName.value.trim()
  if (v) queueName.value = v
  renaming.value = false
}

// Save playlist (.gexm)
/**
 * >>> TODO(GEX): replace File System Access API usage with audited Items-based save flow.
 */
async function savePlaylistGexm() {
  try {
    const payload = {
      kind: 'gexm.playlist',
      version: 1,
      name: queueName.value,
      items: queue.value.map(t => ({
        name: t.name,
        // WARNING: blob: URLs are ephemeral. This allows “documenting” the queue
        // for now; it won’t be fully portable. We keep a hint for future path.
        href: t.url || '',
        type: t.type || '',
        srcHint: t.srcHint || '',
        missing: !!t.missing,
      })),
    }
    const text = JSON.stringify(payload, null, 2)

    // --- TEMP: File System Access API ---
    // >>> TODO(GEX): swap to Items-powered “Save As…” and fsWriteText().
    // @ts-ignore
    if ('showSaveFilePicker' in window) {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: `${queueName.value || 'Playlist'}.gexm`,
        types: [{ description: 'GExplorer Music Playlist', accept: { 'application/json': ['.gexm'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(new Blob([text], { type: 'application/json' }))
      await writable.close()
      return
    }
    // Fallback: download via blob
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${queueName.value || 'Playlist'}.gexm`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    console.warn('[gexm:save] failed', e)
  }
}

// Load & merge (.gexm / .m3u / audio)
/**
 * >>> TODO(GEX): replace File System Access API usage with audited Items-based open flow.
 */
async function loadAndMerge() {
  try {
    // --- TEMP: File System Access API ---
    // @ts-ignore
    if ('showOpenFilePicker' in window) {
      // @ts-ignore
      const handles: FileSystemFileHandle[] = await window.showOpenFilePicker({
        multiple: true,
        types: [
          { description: 'Audio', accept: { 'audio/*': ['.mp3','.ogg','.oga','.aac','.m4a','.flac','.wav','.webm'] } },
          { description: 'GExplorer Playlist', accept: { 'application/json': ['.gexm'] } },
          { description: 'M3U Playlist', accept: { 'audio/x-mpegurl': ['.m3u','.m3u8'] } },
        ],
      })

      const toAdd: Track[] = []
      const placeholders: Track[] = []

      for (const h of handles) {
        const file = await h.getFile()
        const nameLower = file.name.toLowerCase()

        if (nameLower.endsWith('.gexm')) {
          try {
            const txt = await file.text()
            const j = JSON.parse(txt)
            if (j?.items && Array.isArray(j.items)) {
              for (const it of j.items) {
                // If we have a serializable href that is a file path, we can’t deref it here.
                // We keep a placeholder (missing=true) with a srcHint so the user sees what was intended.
                if (!it.href || String(it.href).startsWith('blob:')) {
                  placeholders.push({
                    id: `missing-${Math.random().toString(36).slice(2)}`,
                    name: it.name || '(unknown)',
                    url: '',
                    missing: true,
                    srcHint: it.srcHint || it.href || it.name || '',
                    type: it.type || '',
                  })
                } else {
                  // Best-effort: if it.href is a http(s) URL, try to stream as <audio> (CORS permitting)
                  // Otherwise, also keep as placeholder.
                  try {
                    const id = `ext-${Math.random().toString(36).slice(2)}`
                    toAdd.push({ id, name: it.name || it.href, url: String(it.href), type: it.type || '' })
                  } catch {
                    placeholders.push({
                      id: `missing-${Math.random().toString(36).slice(2)}`,
                      name: it.name || '(unknown)',
                      url: '',
                      missing: true,
                      srcHint: it.href || '',
                    })
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[gexm:open] parse failed', e)
          }
          continue
        }

        if (nameLower.endsWith('.m3u') || nameLower.endsWith('.m3u8')) {
          try {
            const txt = await file.text()
            const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            for (const line of lines) {
              if (line.startsWith('#')) continue
              // We can’t resolve local paths here; treat as placeholder
              placeholders.push({
                id: `m3u-${Math.random().toString(36).slice(2)}`,
                name: line.split(/[\\/]/).pop() || line,
                url: '',
                missing: true,
                srcHint: line,
              })
            }
          } catch (e) {
            console.warn('[m3u:open] parse failed', e)
          }
          continue
        }

        // Assume audio file
        if (ACCEPTED.includes(file.type) || /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(file.name)) {
          const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`
          const url = URL.createObjectURL(file)
          toAdd.push({ id, name: file.name, url, type: file.type })
        }
      }

      // Merge: add real tracks first, then placeholders (so play starts if empty)
      const startEmpty = queue.value.length === 0
      queue.value.push(...toAdd, ...placeholders)
      if (startEmpty && toAdd.length) { load(0); play() }
      return
    }

    // Fallback if FS Access API not available: just open the hidden input for audio files
    clickPick()
  } catch (e) {
    console.warn('[open] failed', e)
  }
}
</script>

<template>
  <div class="player-root"
       :class="[props.context, props.variant, layoutClass, { 'drag-over': draggingOver }]"
       ref="rootEl"
       @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">

    <!-- Hidden input for manual file picking -->
    <input ref="fileInput"
      type="file" multiple
      :accept="INPUT_ACCEPT"
      style="display:none"
      @change="onFileInput" />

    <!-- Controls -->
    <div class="controls" :class="layoutClass">
      <!-- Transport -->
      <div class="transport">
        <button v-if="layoutClass !== 'micro'" class="btn prev" title="Previous" :disabled="!canPrev" @click="prev">⏮</button>

        <button class="btn primary play" :title="playTooltip" :disabled="!hasTracks" @click="togglePlay">
          <span v-if="isPlaying">⏸</span><span v-else>▶</span>
        </button>

        <!-- Extra add button only in micro -->
        <button v-if="layoutClass === 'micro'" class="btn add" :title="addTooltip" @click="clickPick">⏏</button>

        <button v-if="layoutClass !== 'micro'" class="btn next" title="Next" :disabled="!canNext" @click="next">⏭</button>
      </div>

      <!-- Time / Seek -->
      <div class="time" v-if="layoutClass !== 'micro'">
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
      <div class="modes" v-if="layoutClass !== 'micro'">
        <button class="btn" :class="{ active: shuffle }" title="Shuffle" @click="toggleShuffle">🔀</button>
        <button class="btn" :class="{ active: repeat !== 'off' }" title="Repeat (off/all/one)" @click="toggleRepeat">
          <span v-if="repeat === 'off'">🔁</span>
          <span v-else-if="repeat === 'all'">🔂</span>
          <span v-else>🔂1</span>
        </button>
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
        <template v-if="!renaming">
          <strong class="qh-title" @dblclick="beginRename" :title="'Double-click to rename'">{{ queueName }}</strong>
        </template>
        <template v-else>
          <input
            ref="nameInput"
            class="qh-input"
            v-model="draftQueueName"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <!-- prevent blur firing before click -->
          <button class="icon-btn" title="Save name" @mousedown.prevent @click="commitRename">✔</button>
          <button class="icon-btn" title="Cancel"    @mousedown.prevent @click="cancelRename">✕</button>
        </template>
        <span class="count">{{ queue.length }}</span>
      </div>

      <div class="qh-actions">
        <button class="icon-btn" title="Load / merge (.gexm, .m3u, audio…)" @click="loadAndMerge">⤒</button>
        <button class="icon-btn" title="Save playlist (.gexm)" @click="savePlaylistGexm">💾</button>
        <button class="qh-toggle icon-btn" :aria-expanded="showQueue" :title="showQueue ? 'Hide list' : 'Show list'" @click="toggleQueue">
          <span v-if="showQueue">▾</span><span v-else>▸</span>
        </button>
      </div>
    </div>

    <!-- List (only when there are tracks AND it's expanded) -->
    <div v-if="queue.length && showQueue" class="queue">
      <div class="row header">
        <span>#</span><span>Title</span><span class="dur">Length</span><span class="act"></span>
      </div>
      <div v-for="(t, i) in queue" :key="t.id"
          class="row"
          :class="{ current: i === currentIndex, skipped: t.missing }"
          :title="t.missing ? (t.srcHint ? 'Unavailable: ' + t.srcHint : 'Unavailable') : ''"
          @dblclick="onRowDblClick(i)">
        <span class="idx">{{ i + 1 }}</span>
        <span class="title" :title="t.name">
          {{ t.name }}
          <em v-if="t.missing" class="skip-tag"> (skipped)</em>
        </span>
        <span class="dur mono" v-if="!t.missing && i === currentIndex && duration">{{ fmtTime(duration) }}</span>
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
.controls .transport{ grid-area:transport; display:flex; gap:var(--space-sm,8px); align-items:center; justify-content:center; }
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
/* MEDIUM / NARROW */
.controls.medium,
.controls.narrow{
  grid-template-columns:1fr 1fr;
  grid-template-areas:
    "transport time"
    "modes     volume";
}
/* ULTRA */
.controls.ultra{
  grid-template-columns:1fr;
  grid-template-areas:
    "transport"
    "time"
    "modes"
    "volume";
}
.controls.ultra .volume{ max-width:none; justify-self:stretch; }
/* MICRO */
.controls.micro{
  grid-template-columns:1fr;
  grid-template-areas:"transport";
}
.controls.micro .transport{ gap:6px; }
.controls.micro .transport .play{ height:32px; padding:0 12px; }
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

/* -------- Queue header -------- */
.queue-header {
  display:flex; align-items:center; justify-content:space-between;
  margin-top:var(--space-sm,8px); padding:6px 8px;
  border:1px solid var(--border,#555); border-radius:var(--radius-sm,6px);
  background:var(--surface-1,#1a1a1a);
}
.qh-left{ display:flex; align-items:baseline; gap:8px; }
.qh-title{ cursor:text; }
.qh-input{
  height:24px; padding:0 6px; border-radius:4px;
  border:1px solid var(--border,#555); background:var(--surface-2,#222); color:var(--fg,#eee);
}
.qh-actions{ display:flex; gap:6px; }
.qh-toggle{ width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; }
.count{ opacity:.7; font-size:12px; }

/* -------- Queue -------- */
.queue { overflow-y: auto; overflow-x: hidden; }
.row{
  display:grid; grid-template-columns:36px 1fr 70px 40px;
  align-items:center; gap:6px; padding:6px 8px;
  border-top:1px solid rgba(255,255,255,.05);
}
.row.header{ position:sticky; top:0; background:var(--surface-2,#222); font-weight:600; border-top:none; }
.row.current{ background:rgba(78,161,255,.12); outline:1px solid var(--accent,#4ea1ff); outline-offset:-1px; }
.row.missing .title{ opacity:.8; }
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

/* Micro/Ultra list simplification */
.player-root.micro .queue .row.header,
.player-root.ultra .queue .row.header { display:none !important; }
.player-root.micro .queue .row,
.player-root.ultra .queue .row { grid-template-columns: 1fr; }
.player-root.micro .queue .row .idx,
.player-root.micro .queue .row .dur,
.player-root.micro .queue .row .act,
.player-root.ultra .queue .row .idx,
.player-root.ultra .queue .row .dur,
.player-root.ultra .queue .row .act { display:none !important; }
.player-root.micro .queue .row .title,
.player-root.ultra .queue .row .title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Empty state */
.empty{ margin:auto; text-align:center; opacity:.85; }
.empty .btn{ margin-top:8px; }

.row.skipped { opacity: .7; filter: grayscale(0.2); }
.skip-tag { opacity: .75; font-style: normal; }

</style>
