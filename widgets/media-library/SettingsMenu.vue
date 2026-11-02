<script setup lang="ts">
// widgets/media-library/SettingsMenu.vue
//
// The library's settings panel (⚙): how the library and a focused title are shown, the media
// folders and their scan, and the optional TMDB connection. It only reports choices: the widget
// acts on them. The media folders are this Video Club's own (one hub's Video Club on movies, another on vacation
// videos), so they stay here rather than on GEM Shell's settings page.
import { ref } from 'vue'
import { LibraryMenu, SkinPicker, type SkinsController } from '@shared/library-ui'
import type { DisplayMode, Progress } from './context'
import type { ScanState } from './useLibraryScan'
import { sourceLabel } from './useLibraryScan'
import type { TmdbState } from './useTmdbMatching'
import type { TmdbProgress } from './tmdb'
import type { BackgroundMode } from './useParkedPlayback'

defineProps<{
  displayMode: DisplayMode
  /** 0.13.0: the library-ui skin's id (this copy's). */
  skin: string
  /** 0.16.0: the looks, built in and the user's (library-ui useSkins). */
  skins: SkinsController
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
/** 0.13.0: the store's built-in looks (the Video Club's first: useSkins), and a line about each. */
const SKIN_HINTS: Record<string, string> = {
  'late-show': 'A video store at night: plum walls, wooden shelves, neon signs, a confetti carpet.',
  'software-aisle': "The Game Shop's: slatwall, metal shelving, lit signs.",
  'classic': 'As before.',
}
const emit = defineEmits<{
  (e:'display-mode', mode:DisplayMode):void
  (e:'skin', id:string):void
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

// library-ui's LibraryMenu (0.11.0, 2026-11-01: the Game Shop's ⚙, made from this one): the panel, its tabs and
// closing on a click outside are its; the content and the choices stay here.
const menu = ref<InstanceType<typeof LibraryMenu> | null>(null)
const TABS = [{ id:'display', label:'Display', icon:'◫' }, { id:'library', label:'Library', icon:'▦' }]

function close() {
  menu.value?.close()
}

function pickDisplayMode(mode: DisplayMode) {
  emit('display-mode', mode)
  close()
}

function addSource() {
  close()
  emit('add-source')
}

defineExpose({ close, open:(tab?: string) => menu.value?.open(tab) })
</script>

<template>
  <LibraryMenu ref="menu" label="Video Club settings" :tabs="TABS">
    <template #default="{ tab }">
      <template v-if="tab === 'display'">
        <p class="glu-menu-label">Look</p>
        <div class="glu-choices" role="radiogroup" aria-label="Library look">
          <button type="button" role="radio" :aria-checked="displayMode === 'video-club'" :class="{ active:displayMode === 'video-club' }" @click="pickDisplayMode('video-club')">
            <span aria-hidden="true">⌂</span><b>Video Club</b><small>Walk the showroom aisle and open a case at the counter.</small>
          </button>
          <button type="button" role="radio" :aria-checked="displayMode === 'classic'" :class="{ active:displayMode === 'classic' }" @click="pickDisplayMode('classic')">
            <span aria-hidden="true">▤</span><b>Classic</b><small>Scroll the shelves and read a title's details page.</small>
          </button>
        </div>
        <div class="glu-menu-heading ruled"><p class="glu-menu-label">Store</p></div>
        <SkinPicker :skins="skins" :selected="skin" :hints="SKIN_HINTS" name="media-library-skin" @select="id => emit('skin', id)" @editing="menu?.close()" />
        <div class="glu-menu-heading ruled"><p class="glu-menu-label">Playback</p></div>
        <div role="radiogroup" aria-label="When the Video Club is hidden">
          <label v-for="choice in BACKGROUND_CHOICES" :key="choice.id" class="glu-toggle" :class="{ disabled:choice.id === 'picture' && !canShowPicture }">
            <input type="radio" name="media-library-background" :value="choice.id" :checked="backgroundMode === choice.id" :disabled="choice.id === 'picture' && !canShowPicture" @change="emit('background-mode', choice.id)" />
            <span><b>{{ choice.label }}</b><small>{{ choice.id === 'picture' && !canShowPicture ? 'Needs a newer GEM Shell.' : choice.hint }}</small></span>
          </label>
        </div>
      </template>
      <template v-else>
        <div class="glu-menu-heading"><p class="glu-menu-label">Media folders</p><small>{{ sources.length }}</small></div>
        <ul v-if="sources.length" class="glu-menu-list">
          <li v-for="source in sources" :key="source" :title="source"><span><b>{{ sourceLabel(source) }}</b><small>{{ source }}</small></span><button type="button" :aria-label="`Remove ${sourceLabel(source)}`" @click="emit('remove-source', source)">×</button></li>
        </ul>
        <p v-else class="glu-menu-empty">No folders selected yet.</p>
        <p class="glu-menu-status">This Video Club's own: another one on the hub can show other folders.</p>
        <p v-if="scanWarnings.length" class="glu-menu-note" :title="scanWarnings.join('\n')">{{ scanWarnings.length }} folder {{ scanWarnings.length === 1 ? 'warning' : 'warnings' }}</p>
        <p v-if="scanTruncated" class="glu-menu-note">Some folders are nested too deep to read; showing {{ scannedCount }} videos.</p>
        <p v-if="artworkProgress" class="glu-menu-note">Preparing artwork {{ artworkProgress.completed }}/{{ artworkProgress.total }}…</p>
        <p v-if="tmdbArtworkProgress" class="glu-menu-note">Importing TMDB artwork {{ tmdbArtworkProgress.completed }}/{{ tmdbArtworkProgress.total }}…</p>
        <button class="glu-menu-add" type="button" :disabled="!canAddSource" @click="addSource"><span aria-hidden="true">＋</span>Add media folder</button>
        <button v-if="sources.length && canScan" class="glu-menu-quiet" type="button" :disabled="scanState === 'scanning'" @click="emit('scan')"><span aria-hidden="true">↻</span>{{ scanState === 'scanning' ? 'Scanning…' : 'Scan again' }}</button>
        <p v-if="sources.length && canScan && tmdb.secretSet" class="glu-menu-status">New titles found by a scan are matched with TMDB.</p>

        <div class="glu-menu-heading ruled"><p class="glu-menu-label">TMDB metadata</p><small>{{ tmdb.state === 'ready' ? '✓' : tmdb.state === 'matching' ? '…' : 'β' }}</small></div>
        <div class="media-library-tmdb-secret" :class="{ connected:tmdb.secretSet }">
          <span>{{ tmdb.secretSet ? `Token saved ${tmdb.secretHint ?? ''}` : 'No API token saved' }}</span>
          <small>{{ tmdb.secretSet ? `Sent only to ${tmdb.hosts.join(', ')}` : 'Enter it through GEM Shell’s protected field.' }}</small>
        </div>
        <p class="media-library-tmdb-privacy">Stored OS-protected by GEM Shell. This widget never receives the token.</p>
        <div class="glu-menu-actions">
          <button type="button" :disabled="!tmdb.available || tmdb.busy || tmdb.state === 'matching'" @click="emit('tmdb-connect')">{{ tmdb.busy ? 'Please wait…' : tmdb.secretSet ? 'Replace token' : 'Connect TMDB' }}</button>
          <button v-if="tmdb.secretSet" type="button" :disabled="tmdb.busy || tmdb.state === 'matching'" @click="emit('tmdb-forget')">Forget token</button>
          <button class="wide" type="button" :disabled="!tmdb.canMatch || !scannedCount" @click="emit('tmdb-match')">
            {{ tmdb.state === 'matching' ? `Matching ${tmdb.progress?.completed ?? 0}/${tmdb.progress?.total ?? scannedCount}…` : tmdb.state === 'ready' ? 'Refresh matches' : 'Match with TMDB' }}
          </button>
        </div>
        <p v-if="tmdb.message" class="media-library-tmdb-status" :class="{ error:tmdb.state === 'error' }">{{ tmdb.message }}</p>
        <p class="media-library-tmdb-credit"><b>TMDB</b> This product uses the TMDB API but is not endorsed or certified by TMDB. Posters and episode stills are cached by GEM Shell.</p>
      </template>
    </template>
  </LibraryMenu>
</template>
