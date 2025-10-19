<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { createDnD, type CreateDnDOptions, type DnDHandle } from '/src/widgets/dnd.ts'

/**
 * NOTE ABOUT FILE PICKERS / SAVE DIALOGS
 * We currently call the File System Access API directly from the widget.
 * THIS BYPASSES your auth/ticket layer.
 *
 * >>> TODO(GEX): Replace these calls with your audited Items-powered pickers
 * >>> and fsReadText/fsWriteText IPC once ready.
 */

let rafId = 0;
function rafBatch(fn: () => void) {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    fn();
  });
}

// ---- Props ----
const props = defineProps<{
  config?: Record<string, any>
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    layout: string
    size?: any
  }
  runAction?: (a: any) => void
  context?: 'sidebar' | 'grid'
  variant?: 'compact' | 'expanded' | 'collapsed'
  width?: number
  height?: number
  theme?: string
  editMode?: boolean
}>()

// ---- Computed host context ----
const hostContext = computed<'grid' | 'sidebar' | 'embedded'>(() =>
  props.placement?.context ?? props.context ?? 'sidebar'
)

const hostLayout = computed<string>(() =>
  props.placement?.layout ?? props.variant ?? 'expanded'
)

watch(() => hostLayout.value, () => {
  nextTick(() => {
    if (hostLayout.value !== 'compact' && rootEl.value) {
      ro?.disconnect()
      containerWidth.value = 0
      measureNow()
      ro = new ResizeObserver(() => measureNow())
      ro.observe(rootEl.value)
    }
  })
})

const queueEl = ref<HTMLElement | null>(null)

// ---- Types ----
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

// ---- Constants ----
const ACCEPTED_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/oga',
  'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/wav', 'audio/webm'
]

const ACCEPTED_EXTS = [
  '.mp3', '.ogg', '.oga', '.aac', '.m4a', '.flac', '.wav', '.webm', '.gexm'
]

const INPUT_ACCEPT = [...ACCEPTED_MIMES, ...ACCEPTED_EXTS].join(',')

const LONG_PRESS_MS = 400
const SEEK_TICK_MS = 80
const SEEK_DELTA = 0.25

// ---- UI state ----
const prefersReduced = ref(false);
const showVolPop = ref(false)
const showQueue = ref(true)
const isPressing = ref(false)
let longTimer: number | undefined
let seekTimer: number | undefined

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  if (t.closest('.queue')) isPressing.value = true
}

function onPointerUp() {
  isPressing.value = false
}

function toggleQueue() {
  showQueue.value = !showQueue.value
}

// ---- Adaptive layout measurement ----
const rootEl = ref<HTMLElement | null>(null)
const controlsEl = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const volBtnEl = ref<HTMLElement | null>(null)
const volPopStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })

let ro: ResizeObserver | null = null

const measureNow = () => {
  const el = controlsEl.value || rootEl.value;
  if (!el) return;
  const w = el.offsetWidth | 0;  // fast int
  if (Math.abs(w - containerWidth.value) >= 1) containerWidth.value = w;
};

const hostWidthFallback = computed<number>(() => {
  const p = props.placement?.size
  const w =
    typeof p?.width === 'number' && p.width > 0
      ? p.width
      : typeof props.width === 'number' && props.width > 0
        ? props.width
        : 0
  return w
})

const layoutClass = computed(() => {
  const w = containerWidth.value || hostWidthFallback.value || 0
  if (w <= 200) return 'micro'
  if (w <= 280) return 'ultra'
  if (w <= 360) return 'narrow'
  if (w <= 520) return 'medium'
  return 'wide'
})

// ---- Player state ----
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
const currentTitle = computed(() => queue.value[currentIndex.value]?.name || '')

// ---- Queue title / rename ----
const queueName = ref('Queue')
const renaming = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
const draftQueueName = ref('')

// ---- DnD Manager ----
let dnd: DnDHandle<Track> | null = null

const dndVersion = ref(0)
let wasDragging = false

const respectReduced = computed(() => false/* props.config?.respectReducedMotion ?? true */);
const marqueeBox = ref<HTMLElement | null>(null)
const marqueeCopy = ref<HTMLElement | null>(null)
const marqueeOn    = ref(false)
const marqueeDir   = computed(() => props.config?.marqueeDirection ?? 'right'); // 'left'|'right'
const marqueeSpeed = computed(() => Number(props.config?.marqueeSpeed ?? 35));  // px/sec (slower)

let marqueeRO: ResizeObserver | null = null

let lastBoxW = -1, lastCopyW = -1, lastNeeds = false, lastDir = '';

const _cssCache = new WeakMap<HTMLElement, Record<string, string>>();
function setVar(el: HTMLElement, name: string, val: string) {
  const cache = _cssCache.get(el) || {};
  if (cache[name] === val) return;         // no-op if unchanged
  el.style.setProperty(name, val);
  cache[name] = val;
  _cssCache.set(el, cache);
}

// handy manual probe from DevTools
// call window.__gex_probe() in console to dump current state
// @ts-ignore
(window as any).__gex_probe = function () {
  const box = marqueeBox?.value as HTMLElement | null;
  const copy = marqueeCopy?.value as HTMLElement | null;
  const track = box?.querySelector('.marquee-track') as HTMLElement | null;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animName = track ? getComputedStyle(track).animationName : '(no track)';

  console.log('[probe] currentIndex:', currentIndex.value,
              'currentTitle:', queue.value[currentIndex.value]?.name);
  console.log('[probe] box:', box, 'copy:', copy, 'track:', track);
  console.log('[probe] sizes -> box.clientWidth:', box?.clientWidth,
              'copy.scrollWidth:', copy?.scrollWidth);
  console.log('[probe] marqueeOn:', marqueeOn.value,
              'has .run? ', box?.classList.contains('run'));
  console.log('[probe] prefers-reduced-motion?', reduce,
              'computed animationName:', animName);
};

function updateMarquee() {
  const box  = marqueeBox.value;
  const copy = marqueeCopy.value;
  if (!box || !copy) { marqueeOn.value = false; return; }

  const dir   = marqueeDir.value;
  const boxW  = Math.round(box.clientWidth);      // stable px
  const copyW = Math.ceil(copy.scrollWidth);      // integer px, avoids shimmer
  const needs = (!respectReduced.value || !prefersReduced.value) && copyW > boxW + 1;

  // Set dir attribute early so CSS can pick frames, but only if changed
  if (box.getAttribute('data-dir') !== dir) box.setAttribute('data-dir', dir);

  // Bail out if nothing effectively changed (±1 px tolerance + same state)
  const sameBox  = Math.abs(boxW  - lastBoxW)  <= 1;
  const sameCopy = Math.abs(copyW - lastCopyW) <= 1;
  const sameDir  = (dir === lastDir);
  if (sameBox && sameCopy && sameDir && needs === lastNeeds) return;

  marqueeOn.value = needs;

  if (!needs) {
    // Transition from running → stopped (or still stopped)
    // Only do the heavy reset when we *were* running.
    if (lastNeeds) {
      const track = box.querySelector('.marquee-track') as HTMLElement | null;
      if (track) {
        track.style.animation = 'none';
        track.style.transform = 'translate3d(0,0,0)';
        requestAnimationFrame(() => { if (track) track.style.animation = ''; });
      }
      // Clear vars only once (and only if we had set them before)
      box.style.removeProperty('--gap');
      box.style.removeProperty('--travel');
      box.style.removeProperty('--marquee-dur');
      _cssCache.delete(box);
    }
    // update caches and leave
    lastBoxW = boxW; lastCopyW = copyW; lastNeeds = needs; lastDir = dir;
    return;
  }

  // Compute one-tile travel and duration
  const GAP_PX = Math.round(Math.max(28, boxW));
  const travel = copyW + GAP_PX;
  const speed  = Math.max(10, Number(marqueeSpeed.value || 35));
  const durSec = travel / speed;

  // Only touch the DOM if a value actually changed
  setVar(box, '--gap',         `${GAP_PX}px`);
  setVar(box, '--travel',      `${travel}px`);
  setVar(box, '--marquee-dur', `${durSec.toFixed(3)}s`);

  // update caches
  lastBoxW = boxW; lastCopyW = copyW; lastNeeds = needs; lastDir = dir;
}




function observeIfPossible(el: HTMLElement | null) {
  if (el && marqueeRO) marqueeRO.observe(el)
}
function unobserveIfPossible(el: HTMLElement | null) {
  if (el && marqueeRO) marqueeRO.unobserve(el)
}

// replace the previous watcher with this:
watch(
  [currentIndex, () => queue.value.length, () => layoutClass.value, currentTitle],
  () => rafBatch(updateMarquee),
  { flush: 'post', immediate: true }
);

// Also re-bind the observer whenever the refs re-point
watch([marqueeBox, marqueeCopy], ([box, copy], [prevBox, prevCopy]) => {
  // Only (un)observe if the observer exists,
  // but ALWAYS schedule an update.
  if (marqueeRO) {
    unobserveIfPossible(prevBox);
    unobserveIfPossible(prevCopy);
    observeIfPossible(box);
    observeIfPossible(copy);
  }
  rafBatch(updateMarquee);
}, { flush: 'post' });

function onDnDUpdate() {
  dndVersion.value++;
  if (!dnd) return;
  const { isDragging } = dnd.getState();

  if (wasDragging && !isDragging) {
    document.body.style.cursor = '';   // ← reset
    const committed = dnd.getOrderedList();
    const same =
      committed.length === queue.value.length &&
      committed.every((t, i) => t.id === queue.value[i]?.id);

    if (!same) {
      const currentId = queue.value[currentIndex.value]?.id;
      queue.value = committed.slice();
      if (currentId) {
        const newIdx = queue.value.findIndex(t => t.id === currentId);
        if (newIdx >= 0) currentIndex.value = newIdx;
      }
    }
  }
  wasDragging = isDragging;
}

const dndState = computed(() =>
  (void dndVersion.value, dnd?.getState() ?? { isDragging: false, draggingId: null, hoverIdx: null })
)
const displayQueue = computed<Track[]>(() =>
  (void dndVersion.value, dnd?.getDisplayList() ?? [])
)
// ---- Computed ----
const hasTracks = computed(() => queue.value.length > 0)
const canPrev = computed(() => queue.value.length > 0)
const canNext = computed(() => queue.value.length > 0)
const current = computed(() => queue.value[currentIndex.value] || null)

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

// ---- Lifecycle ----
onMounted(async () => {
  if (audioEl.value) audioEl.value.volume = volume.value

  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('blur', onPointerUp)

  // Marquee-size observer
  marqueeRO = new ResizeObserver(() => {
    rafBatch(updateMarquee);
  });

  watch(marqueeOn, (running) => {
    const box  = marqueeBox.value;
    const copy = marqueeCopy.value;
    if (!marqueeRO || !box || !copy) return;

    if (running) {
      observeIfPossible(box);
      observeIfPossible(copy);
    } else {
      // We’re not animating; no need to watch text/box resizes here.
      unobserveIfPossible(box);
      unobserveIfPossible(copy);
    }
  }, { flush: 'post', immediate: true });

  const registerAllRefs = () => {
    if (!showQueue.value || !queueEl.value || !dnd) return;     // bail fast
    const rows = queueEl.value.querySelectorAll('.row.item');   // scoped, not document-wide
    rows.forEach(el => {
      const trackId = el.getAttribute('data-track-id');
      const track = queue.value.find(t => t.id === trackId);
      if (track) dnd.registerRef(track, el as HTMLElement);
    });
  };

  watch([() => queue.value.length, showQueue], async () => {
    if (!showQueue.value) return;
    await nextTick();      // ensure DOM nodes exist
    registerAllRefs();
  }, { flush: 'post' });

  // Main layout observer
  ro = new ResizeObserver(() => {
    rafBatch(() => {
      measureNow();
      updateMarquee(); // keep marquee in sync with width changes
    });
  });
  if (controlsEl.value) ro.observe(controlsEl.value)
  if (rootEl.value) ro.observe(rootEl.value)

  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (mq) {
    prefersReduced.value = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      prefersReduced.value = e.matches;
      rafBatch(updateMarquee);
    };
    mq.addEventListener?.('change', onChange);
    // cleanup
    onBeforeUnmount(() => mq.removeEventListener?.('change', onChange));
  }

  await nextTick();
  rafBatch(() => {
    measureNow();
    if (!containerWidth.value && hostWidthFallback.value) {
      containerWidth.value = hostWidthFallback.value;
    }
    updateMarquee();
  });
});


onBeforeUnmount(() => {
  for (const t of queue.value) if (t.url?.startsWith?.('blob:')) URL.revokeObjectURL(t.url)

  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
  clearLong()
  clearSeek()
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('blur', onPointerUp)

  ro?.disconnect()
  ro = null

  dnd?.destroy()
  dnd = null
  marqueeRO?.disconnect()
})

// ---- Format & volume ----
function fmtTime(sec: number) {
  if (!isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function setVolume(v: number) {
  const clamped = Math.min(1, Math.max(0, v))
  volume.value = clamped
  if (clamped > 0) lastNonZeroVolume.value = clamped
  if (audioEl.value) audioEl.value.volume = clamped
}

function toggleMute() {
  setVolume(volume.value > 0 ? 0 : lastNonZeroVolume.value || 0.5)
}

// ---- Player controls ----
function load(index: number) {
  if (index < 0 || index >= queue.value.length) return
  currentIndex.value = index
  const t = queue.value[index]
  const a = audioEl.value!
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
  if (repeat.value === 'one') {
    play(currentIndex.value)
    return
  }
  if (shuffle.value) {
    let n = currentIndex.value
    if (queue.value.length > 1) {
      while (n === currentIndex.value) n = Math.floor(Math.random() * queue.value.length)
    }
    load(n)
    play()
    return
  }
  let n = currentIndex.value + 1
  if (n >= queue.value.length) {
    if (repeat.value === 'all') n = 0
    else {
      pause()
      return
    }
  }
  const start = n
  while (n !== currentIndex.value) {
    if (queue.value[n]?.url) break
    n = (n + 1) % queue.value.length
    if (n === start) break
  }
  load(n)
  play()
}

function prev() {
  if (!queue.value.length) return
  if (audioEl.value && currentTime.value > 2) {
    audioEl.value.currentTime = 0
    return
  }
  let p = currentIndex.value - 1
  if (p < 0) {
    if (repeat.value === 'all') p = queue.value.length - 1
    else {
      pause()
      return
    }
  }
  const start = p
  while (p !== currentIndex.value) {
    if (queue.value[p]?.url) break
    p = (p - 1 + queue.value.length) % queue.value.length
    if (p === start) break
  }
  load(p)
  play()
}

// ---- Audio events ----
function onTimeUpdate() {
  if (audioEl.value) currentTime.value = audioEl.value.currentTime
}

function onLoadedMeta() {
  if (audioEl.value) duration.value = audioEl.value.duration || 0
}

function onEnded() {
  next()
}

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

// ---- Queue ops ----
function removeAt(realIndex: number) {
  const t = queue.value[realIndex];
  if (t?.url?.startsWith?.('blob:')) URL.revokeObjectURL(t.url);

  const wasCurrent = realIndex === currentIndex.value;
  queue.value.splice(realIndex, 1);
  ensureDnD();
  // (rest unchanged…)
}

function clearQueue() {
  pause();
  for (const t of queue.value) {
    if (t.url?.startsWith?.('blob:')) URL.revokeObjectURL(t.url);
  }
  queue.value = [];
  currentIndex.value = -1;
  currentTime.value = 0;
  duration.value = 0;
  ensureDnD();
}

function addFiles(files: FileList | File[]) {
  const tracks: Track[] = []
  for (const f of Array.from(files)) {
    const name = f.name || ''
    const isAudio =
      ACCEPTED_MIMES.includes(f.type) ||
      /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(name)
    if (!isAudio) continue
    const id = `${name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`
    const url = URL.createObjectURL(f)
    tracks.push({ id, name, url, type: f.type, srcHint: '', missing: false })
  }
  if (!tracks.length) return
  const startEmpty = queue.value.length === 0
  queue.value.push(...tracks)
  dnd?.setOrderedList(queue.value)

  if (startEmpty) {
    load(0)
    play()
  }

  ensureDnD()
}

// ---- DnD ----
function prevent(e: Event) {
  e.preventDefault()
  e.stopPropagation()
}

function onDragEnter(e: DragEvent) {
  prevent(e)
  draggingOver.value = true
}

function onDragOver(e: DragEvent) {
  prevent(e)
}

function onDragLeave(e: DragEvent) {
  prevent(e)
  draggingOver.value = false
}

function onDrop(e: DragEvent) {
  prevent(e)
  draggingOver.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

// ---- File picker ----
const fileInput = ref<HTMLInputElement | null>(null)

function clickPick() {
  fileInput.value?.click()
}

async function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!files.length) return

  const playlists: File[] = []
  const audios: File[] = []
  for (const f of files) {
    const lname = (f.name || '').toLowerCase()
    if (lname.endsWith('.gexm')) playlists.push(f)
    else audios.push(f)
  }

  if (audios.length) addFiles(audios)
  for (const pf of playlists) {
    try {
      const text = await pf.text()
      importGexm(text)
    } catch (err) {
      console.warn('[gexm] failed to read:', pf.name, err)
    }
  }
}

function importGexm(jsonText: string) {
  let data: any
  try {
    data = JSON.parse(jsonText)
  } catch {
    return
  }
  if (!data || data.kind !== 'gexm.playlist' || !Array.isArray(data.items)) return

  const imported: Track[] = []
  for (const it of data.items as Array<any>) {
    const name = String(it?.name ?? 'Unknown')
    const href = String(it?.href ?? '')
    const type = typeof it?.type === 'string' ? it.type : ''
    const id = `${name}-${Math.random().toString(36).slice(2)}`
    const hrefLower = href.toLowerCase()
    const looksPlayableNow =
      hrefLower.startsWith('http://') || hrefLower.startsWith('https://')

    if (looksPlayableNow) {
      imported.push({ id, name, url: href, type, srcHint: href, missing: false })
    } else {
      imported.push({ id, name, url: '', type, srcHint: href, missing: true })
    }
  }

  const startEmpty = queue.value.length === 0
  queue.value.push(...imported)
  dnd?.setOrderedList(queue.value)

  if (startEmpty && queue.value.length) {
    load(0)
    play()
  }

  ensureDnD()
}

// ---- Queue title / rename ----
function beginRename() {
  draftQueueName.value = queueName.value
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
  if (v) queueName.value = v
  renaming.value = false
}

// ---- Save/Load playlist ----
async function savePlaylistGexm() {
  try {
    const payload = {
      kind: 'gexm.playlist',
      version: 1,
      name: queueName.value,
      items: queue.value.map(t => ({
        name: t.name,
        href: t.url || '',
        type: t.type || '',
        srcHint: t.srcHint || '',
        missing: !!t.missing
      }))
    }
    const text = JSON.stringify(payload, null, 2)

    // @ts-ignore
    if ('showSaveFilePicker' in window) {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: `${queueName.value || 'Playlist'}.gexm`,
        types: [
          {
            description: 'GExplorer Music Playlist',
            accept: { 'application/json': ['.gexm'] }
          }
        ]
      })
      const writable = await handle.createWritable()
      await writable.write(new Blob([text], { type: 'application/json' }))
      await writable.close()
      return
    }

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

async function loadAndMerge() {
  try {
    // @ts-ignore
    if ('showOpenFilePicker' in window) {
      // @ts-ignore
      const handles: FileSystemFileHandle[] = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Audio',
            accept: { 'audio/*': ['.mp3', '.ogg', '.oga', '.aac', '.m4a', '.flac', '.wav', '.webm'] }
          },
          {
            description: 'GExplorer Playlist',
            accept: { 'application/json': ['.gexm'] }
          },
          {
            description: 'M3U Playlist',
            accept: { 'audio/x-mpegurl': ['.m3u', '.m3u8'] }
          }
        ]
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
                if (!it.href || String(it.href).startsWith('blob:')) {
                  placeholders.push({
                    id: `missing-${Math.random().toString(36).slice(2)}`,
                    name: it.name || '(unknown)',
                    url: '',
                    missing: true,
                    srcHint: it.srcHint || it.href || it.name || '',
                    type: it.type || ''
                  })
                } else {
                  const id = `ext-${Math.random().toString(36).slice(2)}`
                  toAdd.push({
                    id,
                    name: it.name || it.href,
                    url: String(it.href),
                    type: it.type || ''
                  })
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
            const lines = txt
              .split(/\r?\n/)
              .map(s => s.trim())
              .filter(Boolean)
            for (const line of lines) {
              if (line.startsWith('#')) continue
              placeholders.push({
                id: `m3u-${Math.random().toString(36).slice(2)}`,
                name: line.split(/[\\/]/).pop() || line,
                url: '',
                missing: true,
                srcHint: line
              })
            }
          } catch (e) {
            console.warn('[m3u:open] parse failed', e)
          }
          continue
        }

        if (
          ACCEPTED_MIMES.includes(file.type) ||
          /\.(mp3|ogg|oga|aac|m4a|flac|wav|webm)$/i.test(file.name)
        ) {
          const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`
          const url = URL.createObjectURL(file)
          toAdd.push({ id, name: file.name, url, type: file.type })
        }
      }

      const startEmpty = queue.value.length === 0
      queue.value.push(...toAdd, ...placeholders)
      dnd?.setOrderedList(queue.value)

      if (startEmpty && toAdd.length) {
        load(0)
        play()
      }
      return
    }

    clickPick()
  } catch (e) {
    console.warn('[open] failed', e)
  }

  ensureDnD()
}

// ---- UI helpers ----
function toggleRepeat() {
  repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
}

function toggleShuffle() {
  shuffle.value = !shuffle.value
}

function onRowDblClickDisplay(iDisplay: number) {
  const item = displayQueue.value[iDisplay]
  if (item?.url) {
    const realIdx = queue.value.findIndex(t => t.id === item.id)
    if (realIdx >= 0) play(realIdx)
  }
}

// ---- Row dragging ----
function startRowDrag(iDisplay: number, event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.icon-btn')) return
  event.preventDefault() // stops text selection on initial down
  dnd?.startDrag(iDisplay, event as PointerEvent)
  document.body.style.cursor = 'grabbing'
}

function ensureDnD() {
  if (!dnd && queue.value.length > 0) {
    dnd = createDnD(queue.value, {
      identity: t => t.id,
      orientation: 'vertical',
      dragThresholdPx: 4,
      onUpdate: onDnDUpdate,
      scrollContainer: () => queueEl.value,
      containerClassOnDrag: 'gex-dragging',
      rowSelector: '.row.item',
      autoScroll: { marginPx: 56, maxSpeedPxPerSec: 900 },
    });
  } else {
    dnd?.setOrderedList(queue.value);
  }
}

// ---- Compact layout helpers ----
function toggleVolPop() {
  if (showVolPop.value) {
    showVolPop.value = false
    return
  }
  const btn = volBtnEl.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  volPopStyle.value = {
    left: `${Math.round(r.left + r.width / 2)}px`,
    top: `${Math.round(r.bottom + 8)}px`
  }
  showVolPop.value = true
}

function closeVolPop() {
  showVolPop.value = false
}

function onDocClick(e: MouseEvent) {
  if (!showVolPop.value) return
  const t = e.target as HTMLElement
  if (!t.closest('.vol-pop') && !t.closest('[data-vol-btn]')) closeVolPop()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeVolPop()
}

// ---- Long-press seek ----
function startSeek(dir: 1 | -1) {
  if (!audioEl.value || !duration.value) return
  seekTimer = window.setInterval(() => {
    if (!audioEl.value || !duration.value) return
    const next = Math.max(
      0,
      Math.min(duration.value, (audioEl.value.currentTime || 0) + dir * SEEK_DELTA)
    )
    audioEl.value.currentTime = next
  }, SEEK_TICK_MS)
}

function clearSeek() {
  if (seekTimer) {
    clearInterval(seekTimer)
    seekTimer = undefined
  }
}

function clearLong() {
  if (longTimer) {
    clearTimeout(longTimer)
    longTimer = undefined
  }
}

function onPrevDown() {
  clearLong()
  longTimer = window.setTimeout(() => startSeek(-1), LONG_PRESS_MS)
}

function onPrevUp() {
  const didLong = !!seekTimer
  clearLong()
  clearSeek()
  if (!didLong) prev()
}

function onNextDown() {
  clearLong()
  longTimer = window.setTimeout(() => startSeek(1), LONG_PRESS_MS)
}

function onNextUp() {
  const didLong = !!seekTimer
  clearLong()
  clearSeek()
  if (!didLong) next()
}

// rock-solid setters for template ref callbacks
function setMarqueeBox(el: Element | null) {
  // accept either Element or null
  marqueeBox.value = (el as HTMLElement) || null
}
function setMarqueeCopy(el: Element | null) {
  marqueeCopy.value = (el as HTMLElement) || null
}

</script>

<template>
  <!-- Hidden input used by both layouts -->
  <input
    ref="fileInput"
    type="file"
    multiple
    :accept="INPUT_ACCEPT"
    style="display: none"
    @change="onFileInput"
  />

  <!-- COMPACT VARIANT -->
  <template v-if="hostLayout === 'compact'">
    <div class="compact">
      <!-- Title strip with volume button at right -->
      <div class="compact-title" :title="playTooltip">
        <span class="title-text">{{ current?.name || 'No track' }}</span>
        <button
          ref="volBtnEl"
          class="btn vol-in-title"
          data-vol-btn
          :class="{ active: volume === 0 }"
          title="Volume"
          @click.stop="toggleVolPop"
        >
          🔊
        </button>
      </div>

      <!-- fixed overlay popover so it never clips -->
      <div v-if="showVolPop" class="vol-pop fixed" :style="volPopStyle" @click.stop>
        <input
          class="vol-vertical"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          @input="volInput"
        />
      </div>

      <!-- Single-row controls, centered; play/open share a slot -->
      <div class="compact-controls">
        <button
          class="btn"
          :disabled="!canPrev"
          @pointerdown.prevent="onPrevDown"
          @pointerup.prevent="onPrevUp"
          @pointercancel.prevent="onPrevUp"
        >
          ◀
        </button>
        <div class="pair">
          <button
            class="btn"
            :title="playTooltip"
            :disabled="!hasTracks"
            @click="togglePlay"
          >
            <span v-if="isPlaying">⏸</span><span v-else>▶</span>
          </button>
          <button class="btn" title="Add files…" @click="clickPick">⏏</button>
        </div>
        <button
          class="btn"
          :disabled="!canNext"
          @pointerdown.prevent="onNextDown"
          @pointerup.prevent="onNextUp"
          @pointercancel.prevent="onNextUp"
        >
          ▶
        </button>
      </div>
    </div>
  </template>

  <!-- EXPANDED VARIANT -->
  <template v-else>
    <div
      class="player-root"
      :class="[hostContext, hostLayout, layoutClass, { 'drag-over': draggingOver, dragging: dndState.isDragging, pressing: isPressing }]"
      @pointerdown="onPointerDown"
      ref="rootEl"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- Controls (observed for width adaptivity) -->
      <div class="controls" :class="layoutClass" ref="controlsEl">
        <div class="transport">
          <button v-if="layoutClass !== 'micro'" class="btn prev" title="Previous" :disabled="!canPrev" @click="prev">⏮</button>
          <button class="btn primary play" :title="playTooltip" :disabled="!hasTracks" @click="togglePlay">
            <span v-if="isPlaying">⏸</span><span v-else>▶</span>
          </button>
          <button v-if="layoutClass === 'micro'" class="btn add" :title="addTooltip" @click="clickPick">⏏</button>
          <button v-if="layoutClass !== 'micro'" class="btn next" title="Next" :disabled="!canNext" @click="next">⏭</button>
        </div>
        <div class="time" v-if="layoutClass !== 'micro'">
          <span class="mono left">{{ fmtTime(currentTime) }}</span>
          <input
            class="seek"
            type="range"
            min="0"
            max="1"
            step="0.001"
            :value="duration ? currentTime / duration : 0"
            :disabled="!hasTracks || !duration"
            @input="seek"
            :title="fmtTime(currentTime) + ' / ' + fmtTime(duration || 0)"
          />
          <span class="mono right">-{{ fmtTime(Math.max(0, (duration || 0) - currentTime)) }}</span>
        </div>
        <div class="modes" v-if="layoutClass !== 'micro'">
          <button class="btn" :class="{ active: shuffle }" title="Shuffle" @click="toggleShuffle">🔀</button>
          <button class="btn" :class="{ active: repeat !== 'off' }" title="Repeat (off/all/one)" @click="toggleRepeat">
            <span v-if="repeat === 'off'">🔁</span>
            <span v-else-if="repeat === 'all'">🔂</span>
            <span v-else>🔂1</span>
          </button>
          <button class="btn" title="Add files…" @click="clickPick">⏏</button>
        </div>
        <div class="volume" v-if="layoutClass !== 'micro'">
          <button class="btn mute" :class="{ active: volume === 0 }" title="Mute/Unmute" @click="toggleMute">🔊</button>
          <input class="vol" type="range" min="0" max="1" step="0.01" :value="volume" @input="volInput" />
        </div>
      </div>

      
      <!-- Compact inline volume for ultra/narrow/micro -->
      <div class="volume-line"
          v-if="layoutClass === 'micro'">
        <input class="vol vol-line" type="range" min="0" max="1" step="0.01" :value="volume" @input="volInput" />
      </div>


      <!-- Header -->
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
            <button class="icon-btn" title="Save name" @mousedown.prevent @click="commitRename">✔</button>
            <button class="icon-btn" title="Cancel" @mousedown.prevent @click="cancelRename">✕</button>
          </template>
          <span class="count">{{ queue.length }}</span>
        </div>
        <div class="qh-actions">
          <button class="icon-btn" title="Save playlist (.gexm)" @click="savePlaylistGexm">💾</button>
        </div>
      </div>

      <!-- New centered collapse/expand control for all layouts -->
      <div v-if="queue.length" class="queue-collapse-tab">
        <button class="tab-btn" :aria-expanded="showQueue" @click="toggleQueue"
                :title="showQueue ? 'Hide list' : 'Show list'">
          <span v-if="showQueue">▾</span><span v-else>▸</span>
        </button>
      </div>

      <!-- List -->
      <div v-if="queue.length && showQueue" class="queue" ref="queueEl">
        <div class="row header">
          <span>#</span><span>Title</span><span class="dur">Length</span><span class="act"></span>
        </div>
        <div
            v-for="(t, i) in displayQueue"
            :key="t.id"
            :data-track-id="t.id"
            class="row item"
            :class="{
              skipped: t.missing,
              'is-dragging': dndState.isDragging && dndState.draggingId === t.id,
              current: t.id === queue[currentIndex]?.id
            }"
            @dblclick="onRowDblClickDisplay(i)"
            @pointerdown="startRowDrag(i, $event)"
          >
            <span class="idx">{{ i + 1 }}</span>

            <span class="title" :title="t.name">
              <template v-if="t.id === queue[currentIndex]?.id">
                <!-- container is the ref we measure; it owns the clip and width -->
                <span :ref="setMarqueeBox" class="marquee" :data-dir="marqueeDir" :class="{ run: marqueeOn }">
                  <span class="marquee-track">
                    <span :ref="setMarqueeCopy" class="copy real">{{ t.name }}</span>
                    <span class="copy twin" aria-hidden="true">{{ t.name }}</span>
                  </span>
              </span>
              </template>
              <template v-else>
                {{ t.name }}
              </template>

              <em v-if="t.missing" class="skip-tag"> (skipped)</em>
            </span>

            <span class="dur mono" v-if="!t.missing && t.id === queue[currentIndex]?.id && duration">{{ fmtTime(duration) }}</span>
            <span class="dur mono" v-else>–</span>

            <span class="act">
              <button class="icon-btn" title="Remove" @click="removeAt(queue.findIndex(track => track.id === t.id))">✕</button>
            </span>
          </div>
      </div>

      <!-- Empty -->
      <div v-if="queue.length === 0" class="empty">
        <p>Drop audio files here or</p>
        <button class="btn" @click="clickPick">Add files…</button>
      </div>
    </div>
  </template>

  <!-- Audio element -->
  <audio ref="audioEl" @loadedmetadata="onLoadedMeta" @timeupdate="onTimeUpdate" @ended="onEnded" preload="metadata" />
</template>

<style scoped>
.player-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-sm, 8px);
  box-sizing: border-box;
}

.player-root.drag-over {
  outline: 2px dashed var(--accent, #4ea1ff);
  outline-offset: -2px;
}

.player-root.dragging,
.player-root.dragging * {
  -webkit-user-select: none;
  user-select: none;
}

/* -------- Controls grid -------- */
.controls {
  display: grid;
  gap: var(--space-sm, 8px);
  align-items: center;
  justify-items: center;
  padding: var(--space-xs, 6px) var(--space-sm, 8px);
  background: var(--surface-1, #1a1a1a);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
  box-sizing: border-box;
  overflow: hidden;
}

.controls .transport {
  grid-area: transport;
  display: flex;
  gap: var(--space-sm, 8px);
  align-items: center;
  justify-content: center;
}

.controls .time {
  grid-area: time;
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  min-width: 0;
  justify-self: stretch;
}

.controls .modes {
  grid-area: modes;
  display: flex;
  gap: var(--space-sm, 8px);
  align-items: center;
}

.controls .volume {
  grid-area: volume;
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  max-width: 240px;
  justify-self: end;
}

.controls .seek {
  flex: 1;
  min-width: 80px;
}

.controls .vol {
  width: 100%;
}

/* WIDE */
.controls.wide {
  grid-template-columns: auto minmax(180px, 1fr) auto minmax(140px, 240px);
  grid-template-areas: 'transport time modes volume';
}

/* MEDIUM / NARROW */
.controls.medium,
.controls.narrow {
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    'transport time'
    'modes volume';
}

/* ULTRA */
.controls.ultra {
  grid-template-columns: 1fr;
  grid-template-areas:
    'transport'
    'time'
    'modes'
    'volume';
}

.controls.ultra .volume {
  max-width: none;
  justify-self: stretch;
}

/* MICRO */
.controls.micro {
  grid-template-columns: 1fr;
  grid-template-areas: 'transport';
}

.controls.micro .transport {
  gap: 6px;
}

.controls.micro .transport .play {
  height: 32px;
  padding: 0 12px;
}

/* Hide time labels on tight layouts */
.controls.narrow .time .mono,
.controls.ultra .time .mono,
.controls.micro .time .mono {
  display: none;
}

/* Buttons */
.btn {
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  cursor: pointer;
  transition: all 0.12s ease;
}

.btn:hover:not(:disabled) {
  background: var(--surface-3, #333);
  border-color: var(--accent, #4ea1ff);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn.primary {
  font-weight: 700;
}

.btn.active {
  border-color: var(--accent, #4ea1ff);
  box-shadow: 0 0 0 1px var(--accent, #4ea1ff) inset;
}

.mono {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

/* -------- Queue header -------- */
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

.qh-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.qh-title {
  cursor: text;
}

.qh-input {
  height: 24px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
}

.qh-actions {
  display: flex;
  gap: 6px;
}

.qh-toggle {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.count {
  opacity: 0.7;
  font-size: 12px;
}

/* -------- Queue -------- */
.queue {
  overflow-y: auto;
  overflow-x: hidden;
  contain: layout paint;
}

.row {
  display: grid;
  grid-template-columns: 36px 1fr 70px 40px;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: var(--surface-2, #222);
  transition: border-color 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
}

.row.header {
  position: sticky;
  top: 0;
  background: var(--surface-2, #222);
  font-weight: 600;
  border-top: none;
}

.player-root.pressing .row:hover {
  background: rgba(78, 161, 255, 0.12);
  outline: 1px solid var(--accent, #4ea1ff);
  outline-offset: -1px;
}

.idx {
  opacity: 0.6;
}

.title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dur {
  text-align: right;
  opacity: 0.8;
}

.act {
  display: flex;
  justify-content: flex-end;
}

.icon-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--border, #555);
  display: grid;
  place-items: center;
  background: var(--surface-2, #222);
  color: var(--fg, #eee);
  cursor: pointer;
  transition: all 0.12s ease;
}

.row.current .idx::before { content: "▶ "; color: var(--accent, #4ea1ff); }

.modes .btn.active {
  box-shadow: none;
  border-color: var(--border, #555);
  background: var(--surface-2, #222);
  color: var(--accent, #4ea1ff);  /* simple, consistent highlight */
}

.icon-btn:hover {
  background: var(--surface-3, #333);
  border-color: var(--accent, #4ea1ff);
}

/* Micro/Ultra list simplification */
.player-root.micro .queue .row.header,
.player-root.ultra .queue .row.header {
  display: none !important;
}

.player-root.micro .queue .row,
.player-root.ultra .queue .row {
  grid-template-columns: 1fr;
}

.player-root.micro .queue .row .idx,
.player-root.micro .queue .row .dur,
.player-root.micro .queue .row .act,
.player-root.ultra .queue .row .idx,
.player-root.ultra .queue .row .dur,
.player-root.ultra .queue .row .act {
  display: none !important;
}

.player-root.micro .queue .row .title,
.player-root.ultra .queue .row .title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Empty state */
.empty {
  margin: auto;
  text-align: center;
  opacity: 0.85;
}

.empty .btn {
  margin-top: 8px;
}

.row.skipped {
  opacity: 0.7;
  filter: grayscale(0.2);
}

.skip-tag {
  opacity: 0.75;
  font-style: normal;
}

/* Row dragging */
.row {
  cursor: grab;
}

.row:active {
  cursor: grabbing;
}

.row.is-dragging {
  border: 2px solid var(--accent, #4ea1ff);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  opacity: 1;
}

.player-root.dragging .row:hover {
  border-color: transparent;
  box-shadow: none;
}

/* ===== Compact layout ===== */
.compact {
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compact-title {
  position: relative;
  text-align: center;
  font-weight: 600;
  padding: 2px 36px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--surface-1, #1a1a1a);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
}

.compact-title .vol-in-title {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  height: 22px;
  padding: 0 6px;
}

.compact-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(44px, 1fr));
  gap: var(--space-sm, 8px);
  align-items: stretch;
  justify-items: stretch;
  width: max-content;
  margin: 0 auto;
}

@media (pointer: coarse) {
  .compact-controls {
    grid-template-columns: repeat(3, minmax(52px, 1fr));
  }
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.pair .btn {
  height: auto;
  padding: 0 6px;
  line-height: 1;
}

.vol-pop.fixed {
  position: fixed;
  transform: translateX(-50%);
  padding: 8px;
  background: var(--surface-1, #1a1a1a);
  border: 1px solid var(--border, #555);
  border-radius: var(--radius-sm, 6px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
  z-index: 9999;
}

.vol-vertical {
  writing-mode: vertical-rl;
  direction: ltr;
  height: 120px;
}

/* Current row (distinct from drag) */
.row.current {
  position: relative;
  background: linear-gradient(90deg, rgba(78,161,255,.10), transparent 60%);
  box-shadow: inset 0 0 0 1px rgba(78,161,255,.28);
}
.row.current::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--accent, #4ea1ff);
  border-radius: 2px;
}
.row.current .title { font-weight: 600; color: #d9ecff; } /* a touch brighter */
.row.current .idx::before { content: "▶ "; color: var(--accent, #4ea1ff); }

/* Ensure the marquee container is clipped by the column */
/* Marquee container (unchanged) */
.marquee{
  position:relative; display:block; overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 24px,#000 calc(100% - 24px),transparent 100%);
          mask-image:linear-gradient(90deg,transparent 0,#000 24px,#000 calc(100% - 24px),transparent 100%);
}

/* Track: gap is always present so measurements and keyframes match from frame 0 */
.marquee .marquee-track{
  display:flex;
  will-change: transform;
  transform: translate3d(0,0,0);
  gap: var(--gap,28px);                 /* gap always on */
}

/* Only show the twin once we are actually running */
.marquee .copy[aria-hidden="true"]{ visibility: hidden; }  /* occupies space, no flash */
.marquee.run .copy[aria-hidden="true"]{ visibility: visible; }

/* Copies */
.marquee .copy{ flex:0 0 auto; min-width:max-content; }

/* Directions + animation (unchanged) */
.marquee.run[data-dir="left"]  .marquee-track{
  animation: slide-left var(--marquee-dur,12s) linear infinite both;
}
.marquee.run[data-dir="right"] .marquee-track{
  flex-direction: row-reverse;          /* real title sits at x=0 */
  animation: slide-right var(--marquee-dur,12s) linear infinite both;
}

/* exact one-tile travel (copy + gap) */
@keyframes slide-left  {
  from { transform: translate3d(0,0,0); }
  to   { transform: translate3d(calc(-1 * var(--travel,300px)),0,0); }
}
@keyframes slide-right {
  from { transform: translate3d(calc(var(--travel,300px)),0,0); }
  to   { transform: translate3d(0,0,0); }
}

/* pause affordance */
.marquee:hover .marquee-track,
.marquee:focus-within .marquee-track {
  animation-play-state: paused;
}

.row .title { display: block; min-width: 0; }  /* not inline */

.volume-line {
  margin-top: 6px;
  padding: 0 2px;
}
.volume-line .vol-line {
  width: 100%;
}

 .queue-collapse-row {
  display: flex;
  justify-content: center;
  margin: 2px 0 6px;        /* closer to header */
}

.queue-collapse-row .icon-btn.arrow {
  min-width: 56px;          /* wider tab feel */
  height: 16px;             /* thinner */
  padding: 0 10px;
  border-radius: 10px;      /* pill/tab look */
  line-height: 16px;
  opacity: 0.9;
}

.queue-collapse-row .icon-btn.arrow:hover {
  opacity: 1;
}
/* Center the collapse tab (class name now matches the template) */
.queue-collapse-tab {
  display: flex;
  justify-content: center;
  margin: 2px 0 6px;
}

.tab-btn {
  min-width: 44px;
  height: 14px;
  padding: 0 8px;
  line-height: 14px;
  border: 1px solid var(--border, #555);
  border-top: none;
  border-radius: 0 0 10px 10px;
  background: var(--surface-1, #1a1a1a);
  color: var(--fg, #eee);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .12s ease;
}
.tab-btn:hover {
  background: var(--surface-3, #333);
  border-color: var(--accent, #4ea1ff);
}

.marquee.run .marquee-track { animation-play-state: running !important; }
</style>