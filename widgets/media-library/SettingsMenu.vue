<script setup lang="ts">
// widgets/media-library/SettingsMenu.vue
//
// The library's settings panel (⚙): how the library and a focused title are shown, the media
// folders and their scan, and the optional TMDB connection. It only reports choices: the widget
// acts on them.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { DisplayMode, Progress } from './context'
import type { ScanState } from './useLibraryScan'
import { sourceLabel } from './useLibraryScan'
import type { TmdbState } from './useTmdbMatching'
import type { TmdbProgress } from './tmdb'
import type { BackgroundMode } from './useParkedPlayback'

defineProps<{
  displayMode: DisplayMode
  backgroundMode: BackgroundMode
  /** GEM Shell can show the movie in the tray card (sdk.video()). */
  canShowPicture: boolean
  sources: string[]
  canAddSource: boolean
  canScan: boolean
  scanState: ScanState
  scanWarnings: string[]
  scanTruncated: boolean
  scannedCount: number
  artworkProgress: Progress | null
  tmdbArtworkProgress: Progress | null
  tmdb: {
    available: boolean
    secretSet: boolean
    secretHint?: string
    hosts: readonly string[]
    busy: boolean
    state: TmdbState
    progress: TmdbProgress | null
    message: string
    canMatch: boolean
  }
}>()
const emit = defineEmits<{
  (e:'display-mode', mode:DisplayMode):void
  (e:'background-mode', mode:BackgroundMode):void
  (e:'add-source'):void
  (e:'remove-source', path:string):void
  (e:'scan'):void
  (e:'tmdb-connect'):void
  (e:'tmdb-forget'):void
  (e:'tmdb-match'):void
}>()

const BACKGROUND_CHOICES: ReadonlyArray<{ id:BackgroundMode; label:string; hint:string }> = [
  { id:'sound', label:'Keep playing audio when hidden', hint:'Switching tabs or folding the sidebar keeps the sound going (light on the processor); the picture comes back where it is.' },
  { id:'picture', label:'Keep playing when hidden', hint:'The movie goes on in its card in the operations tray, picture and all. Uses more of the graphics chip while the card shows.' },
  { id:'off', label:'Pause when hidden', hint:'Leaving the Video Club stops the movie; it reopens paused where it was.' },
]

const menu = ref<HTMLDetailsElement | null>(null)
const tab = ref<'display'|'library'>('display')

function close() {
  menu.value?.removeAttribute('open')
}

function pickDisplayMode(mode: DisplayMode) {
  emit('display-mode', mode)
  close()
}

function addSource() {
  close()
  emit('add-source')
}

function closeOutside(event: PointerEvent) {
  if (menu.value?.open && event.target instanceof Node && !menu.value.contains(event.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', closeOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside, true))
defineExpose({ close })
</script>

<template>
  <details ref="menu" class="media-library-menu">
    <summary aria-label="Open media library settings" title="Media library settings"><span aria-hidden="true">⚙</span></summary>
    <div class="media-library-menu-panel">
      <div class="media-library-menu-tabs" role="tablist" aria-label="Settings sections">
        <button type="button" role="tab" :aria-selected="tab === 'display'" :class="{ active:tab === 'display' }" @click="tab = 'display'"><span aria-hidden="true">◫</span>Display</button>
        <button type="button" role="tab" :aria-selected="tab === 'library'" :class="{ active:tab === 'library' }" @click="tab = 'library'"><span aria-hidden="true">▦</span>Library</button>
      </div>
      <section v-if="tab === 'display'" class="media-library-menu-tab-panel" role="tabpanel" aria-label="Display settings">
        <p class="media-library-menu-label">Look</p>
        <div class="media-library-display-choices" role="radiogroup" aria-label="Library look">
          <button type="button" role="radio" :aria-checked="displayMode === 'video-club'" :class="{ active:displayMode === 'video-club' }" @click="pickDisplayMode('video-club')">
            <span aria-hidden="true">⌂</span><b>Video Club</b><small>Walk the showroom aisle and open a case at the counter.</small>
          </button>
          <button type="button" role="radio" :aria-checked="displayMode === 'classic'" :class="{ active:displayMode === 'classic' }" @click="pickDisplayMode('classic')">
            <span aria-hidden="true">▤</span><b>Classic</b><small>Scroll the shelves and read a title's details page.</small>
          </button>
        </div>
        <p class="media-library-menu-label media-library-detail-label">Playback</p>
        <div class="media-library-background-choices" role="radiogroup" aria-label="When the Video Club is hidden">
          <label v-for="choice in BACKGROUND_CHOICES" :key="choice.id" class="media-library-toggle" :class="{ disabled:choice.id === 'picture' && !canShowPicture }">
            <input type="radio" name="media-library-background" :value="choice.id" :checked="backgroundMode === choice.id" :disabled="choice.id === 'picture' && !canShowPicture" @change="emit('background-mode', choice.id)" />
            <span><b>{{ choice.label }}</b><small>{{ choice.id === 'picture' && !canShowPicture ? 'Needs a newer GEM Shell.' : choice.hint }}</small></span>
          </label>
        </div>
      </section>
      <section v-else class="media-library-menu-tab-panel" role="tabpanel" aria-label="Media library settings">
        <div class="media-library-source-heading"><p class="media-library-menu-label">Media sources</p><small>{{ sources.length }}</small></div>
        <ul v-if="sources.length" class="media-library-sources">
          <li v-for="source in sources" :key="source" :title="source"><span><b>{{ sourceLabel(source) }}</b><small>{{ source }}</small></span><button type="button" :aria-label="`Remove ${sourceLabel(source)}`" @click="emit('remove-source', source)">×</button></li>
        </ul>
        <p v-else class="media-library-no-sources">No folders selected yet.</p>
        <p v-if="scanWarnings.length" class="media-library-scan-note" :title="scanWarnings.join('\n')">{{ scanWarnings.length }} folder {{ scanWarnings.length === 1 ? 'warning' : 'warnings' }}</p>
        <p v-if="scanTruncated" class="media-library-scan-note">Some folders are nested too deep to read; showing {{ scannedCount }} videos.</p>
        <p v-if="artworkProgress" class="media-library-scan-note">Preparing artwork {{ artworkProgress.completed }}/{{ artworkProgress.total }}…</p>
        <p v-if="tmdbArtworkProgress" class="media-library-scan-note">Importing TMDB artwork {{ tmdbArtworkProgress.completed }}/{{ tmdbArtworkProgress.total }}…</p>
        <button class="media-library-add-source" type="button" :disabled="!canAddSource" @click="addSource"><span aria-hidden="true">＋</span>Add media folder</button>
        <button v-if="sources.length && canScan" class="media-library-rescan" type="button" :disabled="scanState === 'scanning'" @click="emit('scan')"><span aria-hidden="true">↻</span>{{ scanState === 'scanning' ? 'Scanning…' : 'Scan again' }}</button>
        <p v-if="sources.length && canScan && tmdb.secretSet" class="media-library-scan-note">New titles found by a scan are matched with TMDB.</p>
        <div class="media-library-source-heading media-library-tmdb-heading"><p class="media-library-menu-label">TMDB metadata</p><small>{{ tmdb.state === 'ready' ? '✓' : tmdb.state === 'matching' ? '…' : 'β' }}</small></div>
        <div class="media-library-tmdb-secret" :class="{ connected:tmdb.secretSet }">
          <span>{{ tmdb.secretSet ? `Token saved ${tmdb.secretHint ?? ''}` : 'No API token saved' }}</span>
          <small>{{ tmdb.secretSet ? `Sent only to ${tmdb.hosts.join(', ')}` : 'Enter it through GEM Shell’s protected field.' }}</small>
        </div>
        <p class="media-library-tmdb-privacy">Stored OS-protected by GEM Shell. This widget never receives the token.</p>
        <div class="media-library-tmdb-actions">
          <button type="button" :disabled="!tmdb.available || tmdb.busy || tmdb.state === 'matching'" @click="emit('tmdb-connect')">{{ tmdb.busy ? 'Please wait…' : tmdb.secretSet ? 'Replace token' : 'Connect TMDB' }}</button>
          <button v-if="tmdb.secretSet" type="button" :disabled="tmdb.busy || tmdb.state === 'matching'" @click="emit('tmdb-forget')">Forget token</button>
          <button class="media-library-tmdb-match" type="button" :disabled="!tmdb.canMatch || !scannedCount" @click="emit('tmdb-match')">
            {{ tmdb.state === 'matching' ? `Matching ${tmdb.progress?.completed ?? 0}/${tmdb.progress?.total ?? scannedCount}…` : tmdb.state === 'ready' ? 'Refresh matches' : 'Match with TMDB' }}
          </button>
        </div>
        <p v-if="tmdb.message" class="media-library-tmdb-status" :class="{ error:tmdb.state === 'error' }">{{ tmdb.message }}</p>
        <p class="media-library-tmdb-credit"><b>TMDB</b> This product uses the TMDB API but is not endorsed or certified by TMDB. Posters and episode stills are cached by GEM Shell.</p>
      </section>
    </div>
  </details>
</template>
