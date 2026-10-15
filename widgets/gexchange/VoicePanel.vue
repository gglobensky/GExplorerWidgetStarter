<template>
    <div class="vp">

        <!-- ── Top bar ─────────────────────────────────────────────── -->
        <div class="vp-bar">
            <button class="vp-mic" :class="{ on: micActive, error: micError }" @click="toggleMic">
                <svg viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" stroke-width="1.4"/>
                    <path d="M3 7a5 5 0 0010 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <path d="M8 12v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                <span>{{ micActive ? 'Live' : micError ? 'Denied' : 'Start' }}</span>
            </button>

            <!-- Input level meter -->
            <div class="vp-level" title="Input level">
                <div class="vp-level-fill" :style="levelStyle" :class="{ clip: inputLevel > 0.95 }"/>
            </div>

            <!-- Preview controls -->
            <div class="vp-preview-btns">
                <!-- Record button — always enabled when mic is live -->
                <button
                    class="vp-icon-btn"
                    :class="{ active: recording }"
                    :disabled="playing"
                    @click="toggleRecord"
                    title="Record preview"
                >
                    <svg viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="5" :fill="micActive ? '#e05555' : 'currentColor'"/>
                    </svg>
                </button>

                <!-- Play button — enabled when preview is ready -->
                <button
                    class="vp-icon-btn"
                    :class="{ active: playing }"
                    :disabled="!previewBuffer || recording"
                    @click="togglePlay"
                    title="Play preview"
                >
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path v-if="!playing" d="M5 3l9 5-9 5V3z"/>
                        <rect v-else x="4" y="3" width="3" height="10" rx="1"/>
                    </svg>
                </button>
            </div>

            <span class="vp-status">{{ statusText }}</span>
        </div>

        <!-- ── Body ───────────────────────────────────────────────── -->
        <div class="vp-body">

            <!-- Effects list -->
            <div class="vp-effects">
                <div class="vp-section-label">Effects</div>

                <!-- Noise Gate -->
                <div class="vp-row" :class="{ enabled: fx.noiseGate.enabled }">
                    <button class="vp-toggle" @click="toggle('noiseGate')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Noise Gate</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Thresh</span>
                            <input type="range" min="0" max="0.15" step="0.001"
                                v-model.number="fx.noiseGate.threshold"
                                :disabled="!fx.noiseGate.enabled"/>
                            <span class="vp-val">{{ (fx.noiseGate.threshold * 100).toFixed(1) }}</span>
                        </label>
                    </div>
                </div>

                <!-- Pitch -->
                <div class="vp-row" :class="{ enabled: fx.pitch.enabled }">
                    <button class="vp-toggle" @click="toggle('pitch')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Pitch</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Semi</span>
                            <input type="range" min="-12" max="12" step="1"
                                v-model.number="fx.pitch.semitones"
                                :disabled="!fx.pitch.enabled"/>
                            <span class="vp-val">{{ fx.pitch.semitones > 0 ? '+' : '' }}{{ fx.pitch.semitones }}</span>
                        </label>
                    </div>
                </div>

                <!-- Robot -->
                <div class="vp-row" :class="{ enabled: fx.robot.enabled }">
                    <button class="vp-toggle" @click="toggle('robot')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Robot</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Freq</span>
                            <input type="range" min="10" max="120" step="1"
                                v-model.number="fx.robot.frequency"
                                :disabled="!fx.robot.enabled"/>
                            <span class="vp-val">{{ fx.robot.frequency }}Hz</span>
                        </label>
                        <label class="vp-sl">
                            <span>Mix</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.robot.mix"
                                :disabled="!fx.robot.enabled"/>
                            <span class="vp-val">{{ Math.round(fx.robot.mix * 100) }}%</span>
                        </label>
                    </div>
                </div>

                <!-- Chorus -->
                <div class="vp-row" :class="{ enabled: fx.chorus.enabled }">
                    <button class="vp-toggle" @click="toggle('chorus')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Chorus</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Rate</span>
                            <input type="range" min="0.1" max="8" step="0.1"
                                v-model.number="fx.chorus.rate"
                                :disabled="!fx.chorus.enabled"/>
                            <span class="vp-val">{{ fx.chorus.rate.toFixed(1) }}</span>
                        </label>
                        <label class="vp-sl">
                            <span>Depth</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.chorus.depth"
                                :disabled="!fx.chorus.enabled"/>
                            <span class="vp-val">{{ Math.round(fx.chorus.depth * 100) }}%</span>
                        </label>
                    </div>
                </div>

                <!-- Whisper -->
                <div class="vp-row" :class="{ enabled: fx.whisper.enabled }">
                    <button class="vp-toggle" @click="toggle('whisper')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Whisper</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Mix</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.whisper.mix"
                                :disabled="!fx.whisper.enabled"/>
                            <span class="vp-val">{{ Math.round(fx.whisper.mix * 100) }}%</span>
                        </label>
                    </div>
                </div>

                <!-- Bitcrusher -->
                <div class="vp-row" :class="{ enabled: fx.bitcrusher.enabled }">
                    <button class="vp-toggle" @click="toggle('bitcrusher')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Crusher</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Bits</span>
                            <input type="range" min="1" max="16" step="1"
                                v-model.number="fx.bitcrusher.bits"
                                :disabled="!fx.bitcrusher.enabled"/>
                            <span class="vp-val">{{ fx.bitcrusher.bits }}</span>
                        </label>
                        <label class="vp-sl">
                            <span>Rate</span>
                            <input type="range" min="1" max="32" step="1"
                                v-model.number="fx.bitcrusher.reduction"
                                :disabled="!fx.bitcrusher.enabled"/>
                            <span class="vp-val">÷{{ fx.bitcrusher.reduction }}</span>
                        </label>
                    </div>
                </div>

                <!-- Reverb -->
                <div class="vp-row" :class="{ enabled: fx.reverb.enabled }">
                    <button class="vp-toggle" @click="toggle('reverb')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Reverb</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Size</span>
                            <input type="range" min="0.1" max="6" step="0.1"
                                v-model.number="fx.reverb.duration"
                                :disabled="!fx.reverb.enabled"/>
                            <span class="vp-val">{{ fx.reverb.duration.toFixed(1) }}s</span>
                        </label>
                        <label class="vp-sl">
                            <span>Mix</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.reverb.mix"
                                :disabled="!fx.reverb.enabled"/>
                            <span class="vp-val">{{ Math.round(fx.reverb.mix * 100) }}%</span>
                        </label>
                    </div>
                </div>

                <!-- Echo -->
                <div class="vp-row" :class="{ enabled: fx.echo.enabled }">
                    <button class="vp-toggle" @click="toggle('echo')">
                        <span class="vp-dot"/>
                    </button>
                    <span class="vp-fx-name">Echo</span>
                    <div class="vp-sliders">
                        <label class="vp-sl">
                            <span>Time</span>
                            <input type="range" min="0.05" max="1" step="0.01"
                                v-model.number="fx.echo.delay"
                                :disabled="!fx.echo.enabled"/>
                            <span class="vp-val">{{ fx.echo.delay.toFixed(2) }}s</span>
                        </label>
                        <label class="vp-sl">
                            <span>Feed</span>
                            <input type="range" min="0" max="0.9" step="0.01"
                                v-model.number="fx.echo.feedback"
                                :disabled="!fx.echo.enabled"/>
                            <span class="vp-val">{{ Math.round(fx.echo.feedback * 100) }}%</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Presets panel -->
            <div class="vp-presets">
                <div class="vp-section-label">
                    Presets
                    <button class="vp-save-btn" @click="savePreset" title="Save current as preset">+</button>
                </div>

                <div class="vp-preset-list">
                    <div
                        v-for="p in allPresets"
                        :key="p.id"
                        class="vp-preset-row"
                        :class="{ active: activePresetId === p.id, builtin: p.builtIn }"
                        @click="loadPreset(p)"
                    >
                        <span class="vp-preset-name">{{ p.name }}</span>
                        <div class="vp-preset-actions">
                            <button
                                v-if="!p.builtIn"
                                class="vp-icon-btn sm"
                                @click.stop="sharePreset(p)"
                                title="Share in room"
                            >↑</button>
                            <button
                                v-if="!p.builtIn"
                                class="vp-icon-btn sm danger"
                                @click.stop="deletePreset(p.id)"
                                title="Delete"
                            >✕</button>
                        </div>
                    </div>
                    <div v-if="allPresets.length === 0" class="vp-empty">No presets yet</div>
                </div>

                <!-- Save dialog -->
                <div v-if="showSaveInput" class="vp-save-row">
                    <input
                        ref="saveInputRef"
                        v-model="savePresetName"
                        class="vp-name-input"
                        placeholder="Preset name…"
                        maxlength="32"
                        @keydown.enter="confirmSave"
                        @keydown.esc="showSaveInput = false"
                    />
                    <button class="vp-pill primary" @click="confirmSave" :disabled="!savePresetName.trim()">Save</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, inject, type ComputedRef } from 'vue'
import type { UseAudioChainReturn, FxState } from './useAudioChain'
import type { UseChannelReturn } from 'gexplorer/widgets'

const activeChannel = inject<ComputedRef<UseChannelReturn | undefined>>('gex:activeChannel')

// ── Props ─────────────────────────────────────────────────────────────────────
defineProps<{ label?: string; icon?: string }>()

// ── Audio chain (injected from ChatRoom) ──────────────────────────────────────
//
// useAudioChain owns the AudioContext and the full processing chain.
// VoicePanel is a pure control surface: it reads reactive state from the chain
// and mutates fxState directly — the chain's watcher handles apply + persist.

const audioChain = inject<UseAudioChainReturn>('gex:audioChain')

const fx         = audioChain?.fxState
const inputLevel = audioChain?.inputLevel ?? ref(0)

// ── UI state ──────────────────────────────────────────────────────────────────

const micActive  = ref(false)
const micError   = ref(false)
const statusText = ref('')
const recording  = ref(false)
const playing    = ref(false)

// Preset UI
const savedPresets   = ref<VoicePreset[]>([])
const activePresetId = ref<string | null>(null)
const showSaveInput  = ref(false)
const savePresetName = ref('')
const saveInputRef   = ref<HTMLInputElement | null>(null)

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoicePreset {
    id:       string
    name:     string
    builtIn?: boolean
    effects:  FxState
}

// ── Built-in presets ──────────────────────────────────────────────────────────

const BUILTIN_PRESETS: VoicePreset[] = [
    {
        id: 'builtin-robot', name: 'Robot', builtIn: true,
        effects: {
            noiseGate:  { enabled: false, threshold: 0.02 },
            pitch:      { enabled: false, semitones: 0 },
            robot:      { enabled: true,  frequency: 50, mix: 0.9 },
            chorus:     { enabled: false, rate: 0.5, depth: 0.3 },
            whisper:    { enabled: false, mix: 0.5 },
            bitcrusher: { enabled: true,  bits: 6, reduction: 2 },
            reverb:     { enabled: false, duration: 2, mix: 0.3 },
            echo:       { enabled: false, delay: 0.3, feedback: 0.4 },
        }
    },
    {
        id: 'builtin-chipmunk', name: 'Chipmunk', builtIn: true,
        effects: {
            noiseGate:  { enabled: false, threshold: 0.02 },
            pitch:      { enabled: true,  semitones: 7 },
            robot:      { enabled: false, frequency: 30, mix: 0.7 },
            chorus:     { enabled: true,  rate: 3, depth: 0.6 },
            whisper:    { enabled: false, mix: 0.5 },
            bitcrusher: { enabled: false, bits: 8, reduction: 4 },
            reverb:     { enabled: false, duration: 1, mix: 0.2 },
            echo:       { enabled: false, delay: 0.1, feedback: 0.2 },
        }
    },
    {
        id: 'builtin-demon', name: 'Demon', builtIn: true,
        effects: {
            noiseGate:  { enabled: false, threshold: 0.02 },
            pitch:      { enabled: true,  semitones: -7 },
            robot:      { enabled: true,  frequency: 20, mix: 0.5 },
            chorus:     { enabled: false, rate: 0.5, depth: 0.3 },
            whisper:    { enabled: false, mix: 0.5 },
            bitcrusher: { enabled: false, bits: 8, reduction: 4 },
            reverb:     { enabled: true,  duration: 3, mix: 0.4 },
            echo:       { enabled: true,  delay: 0.4, feedback: 0.5 },
        }
    },
    {
        id: 'builtin-cave', name: 'Cave', builtIn: true,
        effects: {
            noiseGate:  { enabled: false, threshold: 0.02 },
            pitch:      { enabled: false, semitones: 0 },
            robot:      { enabled: false, frequency: 30, mix: 0.7 },
            chorus:     { enabled: false, rate: 0.5, depth: 0.3 },
            whisper:    { enabled: false, mix: 0.5 },
            bitcrusher: { enabled: false, bits: 8, reduction: 4 },
            reverb:     { enabled: true,  duration: 5, mix: 0.6 },
            echo:       { enabled: true,  delay: 0.6, feedback: 0.6 },
        }
    },
    {
        id: 'builtin-ghost', name: 'Ghost', builtIn: true,
        effects: {
            noiseGate:  { enabled: false, threshold: 0.02 },
            pitch:      { enabled: true,  semitones: 3 },
            robot:      { enabled: false, frequency: 30, mix: 0.7 },
            chorus:     { enabled: true,  rate: 0.3, depth: 0.8 },
            whisper:    { enabled: true,  mix: 0.7 },
            bitcrusher: { enabled: false, bits: 8, reduction: 4 },
            reverb:     { enabled: true,  duration: 4, mix: 0.7 },
            echo:       { enabled: false, delay: 0.3, feedback: 0.4 },
        }
    },
    {
        id: 'builtin-radio', name: 'Walkie-Talkie', builtIn: true,
        effects: {
            noiseGate:  { enabled: true,  threshold: 0.03 },
            pitch:      { enabled: false, semitones: 0 },
            robot:      { enabled: false, frequency: 30, mix: 0.7 },
            chorus:     { enabled: false, rate: 0.5, depth: 0.3 },
            whisper:    { enabled: false, mix: 0.5 },
            bitcrusher: { enabled: true,  bits: 4, reduction: 3 },
            reverb:     { enabled: false, duration: 1, mix: 0.2 },
            echo:       { enabled: false, delay: 0.1, feedback: 0.1 },
        }
    },
]

const allPresets = computed(() => [...BUILTIN_PRESETS, ...savedPresets.value])

// ── Level meter ───────────────────────────────────────────────────────────────

const levelStyle = computed(() => ({
    width: micActive.value
        ? `${Math.min(100, inputLevel.value * 110)}%`
        : '0%',
    background: inputLevel.value > 0.95
        ? '#e05555'
        : inputLevel.value > 0.7
        ? '#f0a030'
        : 'var(--accent, #5b8ef0)',
}))

// ── Mic toggle ────────────────────────────────────────────────────────────────
//
// Preview mode (no active call):
//   Acquires the raw mic stream, runs it through the audio chain, and enables
//   the chain's built-in monitor tap so the user hears their processed voice
//   directly via ctx.destination. Same AudioContext, same clock, zero seams.
//
// Active call:
//   Chain is already running. monitorSelf on the voice channel routes encoded
//   audio back through the decode graph — the user hears exactly what peers hear.

async function toggleMic() {
    micActive.value ? await _stopMic() : await _startMic()
}

async function _startMic() {
    try {
        micError.value = false

        if (audioChain?.isProcessing.value) {
            // Call active — the chain is already running, enable loopback via voice channel
            if (activeChannel?.value?.monitorSelf)
                activeChannel.value.monitorSelf.value = true
        } else {
            // No call — acquire stream, build chain, open monitor tap
            const raw = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl:  false,
                    sampleRate:       48000,
                    channelCount:     1,
                }
            })
            await audioChain?.processStream(raw)
            if (audioChain) audioChain.monitorEnabled.value = true
        }

        micActive.value  = true
        statusText.value = 'Live'

    } catch (err: any) {
        micError.value   = true
        micActive.value  = false
        statusText.value = err.name === 'NotAllowedError' ? 'Mic denied' : 'Mic error'
        console.warn('[VoicePanel] Mic error:', err)
    }
}

async function _stopMic() {
    stopRecord()
    stopPlayback()

    if (audioChain?.isProcessing.value) {
        // Call active — just disable the loopback
        if (activeChannel?.value?.monitorSelf)
            activeChannel.value.monitorSelf.value = false
    } else {
        // No call — close the monitor tap and release the chain
        if (audioChain) audioChain.monitorEnabled.value = false
        await audioChain?.releaseStream()
    }

    micActive.value  = false
    statusText.value = ''
}

// ── Effect toggle ─────────────────────────────────────────────────────────────
//
// Mutating fxState directly triggers the watcher in useAudioChain, which calls
// _applyFx() and _saveConfig() automatically. No per-effect update functions needed.

function toggle(key: keyof FxState) {
    if (!fx) return
    fx[key].enabled = !fx[key].enabled
    activePresetId.value = null
}

// ── Preview recorder ──────────────────────────────────────────────────────────
//
// Records a clip from previewDest (the post-limiter tap, independent of
// externalGain) and plays it back through a separate AudioContext.
// Completely distinct from live monitoring — no shared state.

let mediaRecorder:  MediaRecorder | null = null
let recorderChunks: Blob[] = []
const previewBuffer = ref<AudioBuffer | null>(null)
let playbackCtx:    AudioContext | null = null
let playbackSource: AudioBufferSourceNode | null = null

function startRecord() {
    const stream = audioChain?.getPreviewStream()
    if (!stream || recording.value) return

    // Mute external output while previewing — don't send to callee
    if (audioChain) audioChain.externalMuted.value = true

    recorderChunks = []
    previewBuffer.value = null
    playing.value = false

    mediaRecorder = new MediaRecorder(stream)

    mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recorderChunks.push(e.data)
    }

    mediaRecorder.onstop = async () => {
        const blob   = new Blob(recorderChunks, { type: 'audio/webm' })
        const arrBuf = await blob.arrayBuffer()

        if (!playbackCtx || playbackCtx.state === 'closed')
            playbackCtx = new AudioContext()

        previewBuffer.value = await playbackCtx.decodeAudioData(arrBuf)
        statusText.value    = 'Preview ready — play to hear effects'

        if (audioChain) audioChain.externalMuted.value = false
    }

    mediaRecorder.start()
    recording.value  = true
    statusText.value = 'Recording…'
}

function stopRecord() {
    if (!recording.value || !mediaRecorder) return
    mediaRecorder.stop()
    recording.value = false
}

async function toggleRecord() {
    if (recording.value) {
        stopRecord()
    } else {
        if (!micActive.value) await _startMic()
        else startRecord()
    }
}

function startPlayback() {
    if (!previewBuffer.value || !playbackCtx) return

    if (audioChain) audioChain.externalMuted.value = true

    playbackSource = playbackCtx.createBufferSource()
    playbackSource.buffer = previewBuffer.value
    playbackSource.connect(playbackCtx.destination)
    playbackSource.onended = () => {
        playing.value = false
        statusText.value = ''
        if (audioChain) audioChain.externalMuted.value = false
    }
    playbackSource.start()
    playing.value    = true
    statusText.value = 'Playing…'
}

function stopPlayback() {
    playbackSource?.stop()
    playbackSource   = null
    playing.value    = false
    statusText.value = ''
    if (audioChain) audioChain.externalMuted.value = false
}

function togglePlay() { playing.value ? stopPlayback() : startPlayback() }

// ── Presets ───────────────────────────────────────────────────────────────────

function loadPreset(preset: VoicePreset) {
    if (!fx) return
    const e = preset.effects
    Object.assign(fx.noiseGate,  e.noiseGate)
    Object.assign(fx.pitch,      e.pitch)
    Object.assign(fx.robot,      e.robot)
    Object.assign(fx.chorus,     e.chorus)
    Object.assign(fx.whisper,    e.whisper)
    Object.assign(fx.bitcrusher, e.bitcrusher)
    Object.assign(fx.reverb,     e.reverb)
    Object.assign(fx.echo,       e.echo)

    activePresetId.value = preset.id
    statusText.value     = `Loaded: ${preset.name}`
}

function savePreset() {
    showSaveInput.value  = true
    savePresetName.value = ''
    nextTick(() => saveInputRef.value?.focus())
}

async function confirmSave() {
    const name = savePresetName.value.trim()
    if (!name || !fx) return

    const preset: VoicePreset = {
        id:      `user-${Date.now()}`,
        name,
        effects: JSON.parse(JSON.stringify(fx)),
    }

    savedPresets.value.push(preset)
    activePresetId.value = preset.id
    showSaveInput.value  = false
    savePresetName.value = ''
    await _persistPresets()
    statusText.value = `Saved: ${name}`
}

function deletePreset(id: string) {
    savedPresets.value = savedPresets.value.filter(p => p.id !== id)
    if (activePresetId.value === id) activePresetId.value = null
    _persistPresets()
}

async function sharePreset(preset: VoicePreset) {
    await navigator.clipboard.writeText(JSON.stringify(preset, null, 2))
    statusText.value = 'Copied to clipboard'
}

// ── Preset persistence ────────────────────────────────────────────────────────

const PRESET_STORAGE_KEY = 'vp_presets'

async function _loadPresets() {
    try {
        const raw = localStorage.getItem(PRESET_STORAGE_KEY)
        if (raw) savedPresets.value = JSON.parse(raw)
    } catch {
        savedPresets.value = []
    }
}

async function _persistPresets() {
    try {
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(savedPresets.value))
    } catch (err) {
        console.warn('[VoicePanel] Failed to persist presets:', err)
    }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
    await _loadPresets()
})

onUnmounted(async () => {
    stopRecord()
    stopPlayback()
    await playbackCtx?.close().catch(() => {})
    playbackCtx = null
    if (micActive.value) await _stopMic()
})
</script>

<style scoped>
.vp {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg, #111);
    color: var(--fg, #e8e8e8);
    font-family: var(--font, system-ui, sans-serif);
    font-size: 11px;
    overflow: hidden;
}

/* ── Top bar ────────────────────────────────────────────────────── */
.vp-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,.07));
    background: var(--bg-2, #171717);
    flex-shrink: 0;
}

.vp-mic {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-3, #1e1e1e);
    border: 1px solid var(--border, rgba(255,255,255,.07));
    border-radius: 5px;
    color: var(--fg-dim, #777);
    cursor: pointer;
    font-size: 10px;
    padding: 3px 7px 3px 5px;
    transition: all .15s;
    flex-shrink: 0;
}
.vp-mic svg { width: 12px; height: 12px; }
.vp-mic.on  { border-color: #4caf50; color: #4caf50; }
.vp-mic.error { border-color: #e05555; color: #e05555; }
.vp-mic:hover:not(.on):not(.error) { border-color: var(--accent, #5b8ef0); color: var(--fg, #e8e8e8); }

.vp-level {
    flex: 1;
    height: 6px;
    background: var(--bg-3, #1e1e1e);
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid var(--border, rgba(255,255,255,.07));
}
.vp-level-fill {
    height: 100%;
    border-radius: 3px;
    transition: width .04s linear, background .1s;
}

.vp-preview-btns { display: flex; gap: 2px; flex-shrink: 0; }

.vp-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: var(--bg-3, #1e1e1e);
    border: 1px solid var(--border, rgba(255,255,255,.07));
    border-radius: 4px;
    color: var(--fg-dim, #777);
    cursor: pointer;
    font-size: 10px;
    transition: all .12s;
}
.vp-icon-btn svg { width: 10px; height: 10px; }
.vp-icon-btn:hover:not(:disabled) { color: var(--fg, #e8e8e8); border-color: var(--accent, #5b8ef0); }
.vp-icon-btn.active { border-color: #e05555; color: #e05555; }
.vp-icon-btn:disabled { opacity: .3; cursor: not-allowed; }
.vp-icon-btn.sm { width: 18px; height: 18px; }
.vp-icon-btn.sm.danger:hover { border-color: #e05555; color: #e05555; }

.vp-status {
    font-size: 10px;
    color: var(--fg-muted, #444);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 80px;
    flex-shrink: 0;
}

/* ── Body ───────────────────────────────────────────────────────── */
.vp-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.vp-section-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--fg-muted, #444);
    padding: 4px 8px 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
}

/* ── Effects column ─────────────────────────────────────────────── */
.vp-effects {
    flex: 1;
    overflow-y: auto;
    border-right: 1px solid var(--border, rgba(255,255,255,.07));
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.vp-row {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,.05));
    opacity: .55;
    transition: opacity .12s;
}
.vp-row.enabled { opacity: 1; }
.vp-row:last-child { border-bottom: none; }

.vp-toggle {
    width: 16px;
    height: 16px;
    background: transparent;
    border: 1px solid var(--border, rgba(255,255,255,.12));
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
    transition: border-color .12s;
}
.vp-toggle:hover { border-color: var(--accent, #5b8ef0); }
.vp-row.enabled .vp-toggle { border-color: var(--accent, #5b8ef0); background: rgba(91,142,240,.15); }

.vp-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-muted, #444);
    transition: background .12s;
}
.vp-row.enabled .vp-dot { background: var(--accent, #5b8ef0); }

.vp-fx-name {
    font-size: 10px;
    font-weight: 600;
    color: var(--fg-dim, #777);
    width: 44px;
    flex-shrink: 0;
    padding-top: 2px;
    letter-spacing: .02em;
}
.vp-row.enabled .vp-fx-name { color: var(--fg, #e8e8e8); }

.vp-sliders {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
}

.vp-sl {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    color: var(--fg-muted, #444);
}
.vp-sl span:first-child { width: 30px; flex-shrink: 0; }
.vp-sl input[type=range] {
    flex: 1;
    height: 3px;
    accent-color: var(--accent, #5b8ef0);
    cursor: pointer;
    min-width: 0;
}
.vp-sl input:disabled { opacity: .35; cursor: not-allowed; }
.vp-val {
    font-size: 9px;
    color: var(--fg-dim, #777);
    width: 28px;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
}

/* ── Presets column ─────────────────────────────────────────────── */
.vp-presets {
    width: 110px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.vp-save-btn {
    background: transparent;
    border: none;
    color: var(--fg-muted, #444);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    transition: color .12s;
}
.vp-save-btn:hover { color: var(--accent, #5b8ef0); }

.vp-preset-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
}

.vp-preset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 0;
    transition: background .1s;
    gap: 4px;
}
.vp-preset-row:hover { background: var(--bg-3, #1e1e1e); }
.vp-preset-row.active { background: rgba(91,142,240,.12); }
.vp-preset-row.builtin .vp-preset-name { color: var(--fg-dim, #777); }

.vp-preset-name {
    font-size: 10px;
    color: var(--fg, #e8e8e8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}
.vp-preset-row.active .vp-preset-name { color: var(--accent, #5b8ef0); }

.vp-preset-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity .1s; }
.vp-preset-row:hover .vp-preset-actions { opacity: 1; }

.vp-empty {
    font-size: 10px;
    color: var(--fg-muted, #444);
    padding: 8px;
    text-align: center;
}

.vp-save-row {
    display: flex;
    gap: 4px;
    padding: 5px 6px;
    border-top: 1px solid var(--border, rgba(255,255,255,.07));
    flex-shrink: 0;
}

.vp-name-input {
    flex: 1;
    background: var(--bg-3, #1e1e1e);
    border: 1px solid var(--border, rgba(255,255,255,.07));
    border-radius: 4px;
    color: var(--fg, #e8e8e8);
    font-size: 10px;
    padding: 3px 5px;
    outline: none;
    min-width: 0;
}
.vp-name-input:focus { border-color: var(--accent, #5b8ef0); }

.vp-pill {
    background: var(--bg-3, #1e1e1e);
    border: 1px solid var(--border, rgba(255,255,255,.07));
    border-radius: 4px;
    color: var(--fg-dim, #777);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 6px;
    white-space: nowrap;
    transition: all .12s;
}
.vp-pill.primary { background: var(--accent, #5b8ef0); border-color: var(--accent, #5b8ef0); color: #fff; }
.vp-pill:disabled { opacity: .4; cursor: not-allowed; }

/* ── Scrollbar ──────────────────────────────────────────────────── */
.vp-effects::-webkit-scrollbar,
.vp-preset-list::-webkit-scrollbar { width: 3px; }
.vp-effects::-webkit-scrollbar-thumb,
.vp-preset-list::-webkit-scrollbar-thumb { background: var(--border, rgba(255,255,255,.07)); border-radius: 2px; }
</style>