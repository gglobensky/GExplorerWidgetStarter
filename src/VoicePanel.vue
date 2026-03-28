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
                <button
                    class="vp-icon-btn"
                    :class="{ active: recording }"
                    :disabled="!micActive || playing"
                    @click="toggleRecord"
                    title="Record 5s preview"
                >
                    <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" :fill="recording ? '#e05555' : 'currentColor'"/></svg>
                </button>
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
                                @input="updateNoise" :disabled="!fx.noiseGate.enabled"/>
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
                                @input="updatePitch" :disabled="!fx.pitch.enabled"/>
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
                                @input="updateRobot" :disabled="!fx.robot.enabled"/>
                            <span class="vp-val">{{ fx.robot.frequency }}Hz</span>
                        </label>
                        <label class="vp-sl">
                            <span>Mix</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.robot.mix"
                                @input="updateRobot" :disabled="!fx.robot.enabled"/>
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
                                @input="updateChorus" :disabled="!fx.chorus.enabled"/>
                            <span class="vp-val">{{ fx.chorus.rate.toFixed(1) }}</span>
                        </label>
                        <label class="vp-sl">
                            <span>Depth</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.chorus.depth"
                                @input="updateChorus" :disabled="!fx.chorus.enabled"/>
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
                                @input="updateWhisper" :disabled="!fx.whisper.enabled"/>
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
                                @input="updateBitcrusher" :disabled="!fx.bitcrusher.enabled"/>
                            <span class="vp-val">{{ fx.bitcrusher.bits }}</span>
                        </label>
                        <label class="vp-sl">
                            <span>Rate</span>
                            <input type="range" min="1" max="32" step="1"
                                v-model.number="fx.bitcrusher.reduction"
                                @input="updateBitcrusher" :disabled="!fx.bitcrusher.enabled"/>
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
                                @input="updateReverb" :disabled="!fx.reverb.enabled"/>
                            <span class="vp-val">{{ fx.reverb.duration.toFixed(1) }}s</span>
                        </label>
                        <label class="vp-sl">
                            <span>Mix</span>
                            <input type="range" min="0" max="1" step="0.01"
                                v-model.number="fx.reverb.mix"
                                @input="updateReverb" :disabled="!fx.reverb.enabled"/>
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
                                @input="updateEcho" :disabled="!fx.echo.enabled"/>
                            <span class="vp-val">{{ fx.echo.delay.toFixed(2) }}s</span>
                        </label>
                        <label class="vp-sl">
                            <span>Feed</span>
                            <input type="range" min="0" max="0.9" step="0.01"
                                v-model.number="fx.echo.feedback"
                                @input="updateEcho" :disabled="!fx.echo.enabled"/>
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
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

// ── Props (from extension point registration) ─────────────────────────────────
defineProps<{ label?: string; icon?: string }>()

// ── SDK (injected from parent widget tree) ────────────────────────────────────
const sdk = inject<WidgetSdk>('widgetSdk')

// ── Types ─────────────────────────────────────────────────────────────────────

interface FxState {
    noiseGate:  { enabled: boolean; threshold: number }
    pitch:      { enabled: boolean; semitones: number }
    robot:      { enabled: boolean; frequency: number; mix: number }
    chorus:     { enabled: boolean; rate: number; depth: number }
    whisper:    { enabled: boolean; mix: number }
    bitcrusher: { enabled: boolean; bits: number; reduction: number }
    reverb:     { enabled: boolean; duration: number; mix: number }
    echo:       { enabled: boolean; delay: number; feedback: number }
}

interface VoicePreset {
    id:       string
    name:     string
    builtIn?: boolean
    effects:  FxState
}

// ── AudioWorklet processor source strings ─────────────────────────────────────
// Loaded via Blob URL so no separate worklet files are needed.

const PITCH_PROCESSOR = `
class PitchShifterProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{ name: 'pitch', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' }]
    }
    constructor() {
        super()
        this._buf = new Float32Array(8192)
        this._wp  = 0
        this._rp  = 0.0
    }
    process(inputs, outputs, params) {
        const inp = inputs[0]?.[0], out = outputs[0]?.[0]
        if (!inp || !out) return true
        const pitch = params.pitch[0], len = this._buf.length
        for (let i = 0; i < inp.length; i++) {
            this._buf[this._wp++ & (len - 1)] = inp[i]
            const s0 = Math.floor(this._rp) & (len - 1)
            const s1 = (s0 + 1) & (len - 1)
            const fr = this._rp - Math.floor(this._rp)
            out[i] = this._buf[s0] * (1 - fr) + this._buf[s1] * fr
            this._rp += pitch
            const diff = this._wp - this._rp
            if (diff > len * 0.75) this._rp += len * 0.25
            if (diff < len * 0.1)  this._rp  = this._wp - len * 0.4
        }
        return true
    }
}
registerProcessor('pitch-shifter', PitchShifterProcessor)
`

const BITCRUSHER_PROCESSOR = `
class BitcrusherProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'bits',      defaultValue: 8, minValue: 1,  maxValue: 16, automationRate: 'k-rate' },
            { name: 'reduction', defaultValue: 1, minValue: 1, maxValue: 50,  automationRate: 'k-rate' }
        ]
    }
    constructor() { super(); this._ph = 0; this._last = 0 }
    process(inputs, outputs, params) {
        const inp = inputs[0]?.[0], out = outputs[0]?.[0]
        if (!inp || !out) return true
        const step = Math.pow(0.5, params.bits[0] - 1)
        const red  = Math.max(1, Math.floor(params.reduction[0]))
        for (let i = 0; i < inp.length; i++) {
            if (++this._ph >= red) { this._ph = 0; this._last = step * Math.floor(inp[i] / step + 0.5) }
            out[i] = this._last
        }
        return true
    }
}
registerProcessor('bitcrusher', BitcrusherProcessor)
`

const NOISEGATE_PROCESSOR = `
class NoiseGateProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'threshold', defaultValue: 0.02, minValue: 0, maxValue: 0.15, automationRate: 'k-rate' },
            { name: 'enabled',   defaultValue: 1,    minValue: 0, maxValue: 1,    automationRate: 'k-rate' }
        ]
    }
    constructor() { super(); this._env = 0 }
    process(inputs, outputs, params) {
        const inp = inputs[0]?.[0], out = outputs[0]?.[0]
        if (!inp || !out) return true
        const thresh  = params.threshold[0]
        const enabled = params.enabled[0] > 0.5
        for (let i = 0; i < inp.length; i++) {
            const lvl = Math.abs(inp[i])
            this._env = lvl > this._env
                ? 0.999  * this._env + 0.001  * lvl
                : 0.9997 * this._env
            out[i] = (!enabled || this._env > thresh) ? inp[i] : inp[i] * 0.001
        }
        return true
    }
}
registerProcessor('noise-gate', NoiseGateProcessor)
`

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

// ── Reactive state ────────────────────────────────────────────────────────────

const fx = reactive<FxState>({
    noiseGate:  { enabled: false, threshold: 0.02 },
    pitch:      { enabled: false, semitones: 0 },
    robot:      { enabled: false, frequency: 30, mix: 0.7 },
    chorus:     { enabled: false, rate: 0.5, depth: 0.3 },
    whisper:    { enabled: false, mix: 0.5 },
    bitcrusher: { enabled: false, bits: 8, reduction: 4 },
    reverb:     { enabled: false, duration: 2, mix: 0.3 },
    echo:       { enabled: false, delay: 0.3, feedback: 0.4 },
})

const micActive      = ref(false)
const micError       = ref(false)
const inputLevel     = ref(0)
const recording      = ref(false)
const playing        = ref(false)
const previewBuffer  = ref<AudioBuffer | null>(null)
const activePresetId = ref<string | null>(null)
const savedPresets   = ref<VoicePreset[]>([])
const showSaveInput  = ref(false)
const savePresetName = ref('')
const saveInputRef   = ref<HTMLInputElement | null>(null)
const statusText     = ref('')

const allPresets = computed(() => [...BUILTIN_PRESETS, ...savedPresets.value])

// ── Audio graph refs ──────────────────────────────────────────────────────────

let ctx:              AudioContext | null = null
let stream:           MediaStream | null = null
let sourceNode:       MediaStreamAudioSourceNode | null = null
let analyserNode:     AnalyserNode | null = null
let noiseGateNode:    AudioWorkletNode | null = null
let pitchNode:        AudioWorkletNode | null = null
let robotOsc:         OscillatorNode | null = null
let robotGainIn:      GainNode | null = null
let robotGainWet:     GainNode | null = null
let robotGainDry:     GainNode | null = null
let chorusDelay:      DelayNode | null = null
let chorusLfo:        OscillatorNode | null = null
let chorusLfoGain:    GainNode | null = null
let chorusMix:        GainNode | null = null
let chorusDry:        GainNode | null = null
let whisperFilter:    BiquadFilterNode | null = null
let whisperShaper:    WaveShaperNode | null = null
let whisperGainWet:   GainNode | null = null
let whisperGainDry:   GainNode | null = null
let bitcrusherNode:   AudioWorkletNode | null = null
let convolverNode:    ConvolverNode | null = null
let reverbGainWet:    GainNode | null = null
let reverbGainDry:    GainNode | null = null
let echoDelay:        DelayNode | null = null
let echoFeedGain:     GainNode | null = null
let echoMix:          GainNode | null = null
let echoDry:          GainNode | null = null
let outputGain:       GainNode | null = null
let recorderDest:     MediaStreamAudioDestinationNode | null = null
let mediaRecorder:    MediaRecorder | null = null
let recorderChunks:   Blob[] = []
let meterFrame:       number | null = null
let playbackSource:   AudioBufferSourceNode | null = null
let workletLoaded =   false

// ── Level meter ───────────────────────────────────────────────────────────────

const levelStyle = computed(() => ({
    width: `${Math.min(100, inputLevel.value * 110)}%`,
    background: inputLevel.value > 0.95
        ? '#e05555'
        : inputLevel.value > 0.7
        ? '#f0a030'
        : 'var(--accent, #5b8ef0)',
}))

function startMeter() {
    if (!analyserNode) return
    const data = new Uint8Array(analyserNode.frequencyBinCount)

    function tick() {
        if (!analyserNode) return
        analyserNode.getByteTimeDomainData(data)
        let max = 0
        for (const v of data) {
            const n = Math.abs((v - 128) / 128)
            if (n > max) max = n
        }
        inputLevel.value = max
        meterFrame = requestAnimationFrame(tick)
    }
    meterFrame = requestAnimationFrame(tick)
}

function stopMeter() {
    if (meterFrame !== null) { cancelAnimationFrame(meterFrame); meterFrame = null }
    inputLevel.value = 0
}

// ── Worklet helpers ───────────────────────────────────────────────────────────

async function loadWorklet(code: string): Promise<void> {
    if (!ctx) return
    const blob = new Blob([code], { type: 'application/javascript' })
    const url  = URL.createObjectURL(blob)
    try { await ctx.audioWorklet.addModule(url) }
    finally { URL.revokeObjectURL(url) }
}

// ── Reverb IR generator ───────────────────────────────────────────────────────

function makeReverbIR(duration: number, decay: number): AudioBuffer {
    const len  = Math.floor(ctx!.sampleRate * duration)
    const buf  = ctx!.createBuffer(2, len, ctx!.sampleRate)
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c)
        for (let i = 0; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
}

// ── Whisper curve ─────────────────────────────────────────────────────────────

function makeWhisperCurve(): Float32Array {
    const n = 256, curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1
        curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 4))
    }
    return curve
}

// ── Audio graph construction ──────────────────────────────────────────────────

async function buildChain(): Promise<void> {
    if (!ctx || !sourceNode) return

    // ── Ensure worklets are loaded ─────────────────────────────────────────
    if (!workletLoaded) {
        await loadWorklet(NOISEGATE_PROCESSOR)
        await loadWorklet(PITCH_PROCESSOR)
        await loadWorklet(BITCRUSHER_PROCESSOR)
        workletLoaded = true
    }

    // ── Analyser ───────────────────────────────────────────────────────────
    analyserNode = ctx.createAnalyser()
    analyserNode.fftSize = 512

    // ── Noise gate ─────────────────────────────────────────────────────────
    noiseGateNode = new AudioWorkletNode(ctx, 'noise-gate')
    noiseGateNode.parameters.get('threshold')!.value = fx.noiseGate.threshold
    noiseGateNode.parameters.get('enabled')!.value   = fx.noiseGate.enabled ? 1 : 0

    // ── Pitch ──────────────────────────────────────────────────────────────
    pitchNode = new AudioWorkletNode(ctx, 'pitch-shifter')
    pitchNode.parameters.get('pitch')!.value = fx.pitch.enabled
        ? Math.pow(2, fx.pitch.semitones / 12)
        : 1.0

    // ── Robot (ring mod) ───────────────────────────────────────────────────
    robotOsc      = ctx.createOscillator()
    robotGainIn   = ctx.createGain()
    robotGainWet  = ctx.createGain()
    robotGainDry  = ctx.createGain()
    robotOsc.frequency.value = fx.robot.frequency
    robotOsc.type = 'sine'
    robotGainWet.gain.value  = fx.robot.enabled ? fx.robot.mix : 0
    robotGainDry.gain.value  = fx.robot.enabled ? 1 - fx.robot.mix : 1
    robotOsc.connect(robotGainIn.gain)
    robotOsc.start()

    // ── Chorus ────────────────────────────────────────────────────────────
    chorusDelay  = ctx.createDelay(0.05)
    chorusLfo    = ctx.createOscillator()
    chorusLfoGain = ctx.createGain()
    chorusMix    = ctx.createGain()
    chorusDry    = ctx.createGain()
    chorusDelay.delayTime.value = 0.025
    chorusLfo.frequency.value   = fx.chorus.rate
    chorusLfoGain.gain.value    = fx.chorus.depth * 0.01
    chorusMix.gain.value        = fx.chorus.enabled ? 0.5 : 0
    chorusDry.gain.value        = 1
    chorusLfo.connect(chorusLfoGain)
    chorusLfoGain.connect(chorusDelay.delayTime)
    chorusLfo.start()

    // ── Whisper ────────────────────────────────────────────────────────────
    whisperFilter   = ctx.createBiquadFilter()
    whisperShaper   = ctx.createWaveShaper()
    whisperGainWet  = ctx.createGain()
    whisperGainDry  = ctx.createGain()
    whisperFilter.type = 'highpass'
    whisperFilter.frequency.value = 800
    whisperShaper.curve = makeWhisperCurve()
    whisperGainWet.gain.value = fx.whisper.enabled ? fx.whisper.mix : 0
    whisperGainDry.gain.value = fx.whisper.enabled ? 1 - fx.whisper.mix : 1

    // ── Bitcrusher ─────────────────────────────────────────────────────────
    bitcrusherNode = new AudioWorkletNode(ctx, 'bitcrusher')
    bitcrusherNode.parameters.get('bits')!.value = fx.bitcrusher.enabled
        ? fx.bitcrusher.bits : 16
    bitcrusherNode.parameters.get('reduction')!.value = fx.bitcrusher.enabled
        ? fx.bitcrusher.reduction : 1

    // ── Reverb ─────────────────────────────────────────────────────────────
    convolverNode   = ctx.createConvolver()
    reverbGainWet   = ctx.createGain()
    reverbGainDry   = ctx.createGain()
    convolverNode.buffer = makeReverbIR(fx.reverb.duration, 2)
    reverbGainWet.gain.value = fx.reverb.enabled ? fx.reverb.mix : 0
    reverbGainDry.gain.value = fx.reverb.enabled ? 1 - fx.reverb.mix : 1

    // ── Echo ───────────────────────────────────────────────────────────────
    echoDelay    = ctx.createDelay(2)
    echoFeedGain = ctx.createGain()
    echoMix      = ctx.createGain()
    echoDry      = ctx.createGain()
    echoDelay.delayTime.value  = fx.echo.delay
    echoFeedGain.gain.value    = fx.echo.feedback
    echoMix.gain.value         = fx.echo.enabled ? 0.5 : 0
    echoDry.gain.value         = 1

    // ── Output ─────────────────────────────────────────────────────────────
    outputGain = ctx.createGain()
    outputGain.gain.value = 1.0

    // ── Recorder destination (for preview) ────────────────────────────────
    recorderDest = ctx.createMediaStreamDestination()

    // ── Wire the chain ─────────────────────────────────────────────────────
    // source → analyser → noiseGate → pitch → robot(dry+wet) → chorus(dry+wet)
    //       → whisper(dry+wet) → bitcrusher → reverb(dry+wet) → echo(dry+wet)
    //       → output → destination + recorderDest

    const merger = ctx.createGain() // acts as a summing junction

    // source → analyser → noiseGate → pitch
    sourceNode.connect(analyserNode)
    analyserNode.connect(noiseGateNode)
    noiseGateNode.connect(pitchNode)

    // pitch → robot dry + ring mod wet
    pitchNode.connect(robotGainDry)
    pitchNode.connect(robotGainIn)
    robotGainIn.connect(robotGainWet)
    robotGainDry.connect(merger)
    robotGainWet.connect(merger)

    // merger → chorus dry + modulated delay wet
    merger.connect(chorusDry)
    merger.connect(chorusDelay)
    chorusDelay.connect(chorusMix)
    const preChorusMerge = ctx.createGain()
    chorusDry.connect(preChorusMerge)
    chorusMix.connect(preChorusMerge)

    // preChorusMerge → whisper dry + filter→shaper wet
    preChorusMerge.connect(whisperGainDry)
    preChorusMerge.connect(whisperFilter)
    whisperFilter.connect(whisperShaper)
    whisperShaper.connect(whisperGainWet)
    const preCrusherMerge = ctx.createGain()
    whisperGainDry.connect(preCrusherMerge)
    whisperGainWet.connect(preCrusherMerge)

    // preCrusherMerge → bitcrusher → reverb dry + convolver wet
    preCrusherMerge.connect(bitcrusherNode)
    bitcrusherNode.connect(reverbGainDry)
    bitcrusherNode.connect(convolverNode)
    convolverNode.connect(reverbGainWet)
    const preEchoMerge = ctx.createGain()
    reverbGainDry.connect(preEchoMerge)
    reverbGainWet.connect(preEchoMerge)

    // preEchoMerge → echo dry + delay wet (with feedback)
    preEchoMerge.connect(echoDry)
    preEchoMerge.connect(echoDelay)
    echoDelay.connect(echoFeedGain)
    echoFeedGain.connect(echoDelay)
    echoDelay.connect(echoMix)
    const finalMerge = ctx.createGain()
    echoDry.connect(finalMerge)
    echoMix.connect(finalMerge)

    // finalMerge → output → destination + recorder
    finalMerge.connect(outputGain)
    outputGain.connect(ctx.destination)
    outputGain.connect(recorderDest)
}

// ── Mic toggle ────────────────────────────────────────────────────────────────

async function toggleMic() {
    if (micActive.value) {
        await teardownAudio()
    } else {
        await setupAudio()
    }
}

async function setupAudio() {
    try {
        micError.value = false
        ctx = new AudioContext()
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        sourceNode = ctx.createMediaStreamSource(stream)
        await buildChain()
        startMeter()
        micActive.value = true
        statusText.value = 'Live'
    } catch (err: any) {
        micError.value  = true
        micActive.value = false
        statusText.value = err.name === 'NotAllowedError' ? 'Mic denied' : 'Mic error'
        console.warn('[VoicePanel] Mic error:', err)
    }
}

async function teardownAudio() {
    stopMeter()
    stopRecord()
    stopPlayback()

    robotOsc?.stop()
    chorusLfo?.stop()

    stream?.getTracks().forEach(t => t.stop())
    await ctx?.close()

    ctx = sourceNode = analyserNode = noiseGateNode = pitchNode = null
    robotOsc = robotGainIn = robotGainWet = robotGainDry = null
    chorusDelay = chorusLfo = chorusLfoGain = chorusMix = chorusDry = null
    whisperFilter = whisperShaper = whisperGainWet = whisperGainDry = null
    bitcrusherNode = convolverNode = reverbGainWet = reverbGainDry = null
    echoDelay = echoFeedGain = echoMix = echoDry = outputGain = null
    recorderDest = null
    stream = null
    workletLoaded = false

    micActive.value = false
    statusText.value = ''
}

// ── Effect toggle + param updates ─────────────────────────────────────────────

function toggle(key: keyof FxState) {
    fx[key].enabled = !fx[key].enabled
    activePresetId.value = null

    switch (key) {
        case 'noiseGate':  updateNoise();      break
        case 'pitch':      updatePitch();      break
        case 'robot':      updateRobot();      break
        case 'chorus':     updateChorus();     break
        case 'whisper':    updateWhisper();    break
        case 'bitcrusher': updateBitcrusher(); break
        case 'reverb':     updateReverb();     break
        case 'echo':       updateEcho();       break
    }
}

function updateNoise() {
    if (!noiseGateNode) return
    noiseGateNode.parameters.get('threshold')!.value = fx.noiseGate.threshold
    noiseGateNode.parameters.get('enabled')!.value   = fx.noiseGate.enabled ? 1 : 0
}

function updatePitch() {
    if (!pitchNode) return
    pitchNode.parameters.get('pitch')!.value = fx.pitch.enabled
        ? Math.pow(2, fx.pitch.semitones / 12) : 1.0
}

function updateRobot() {
    if (!robotOsc || !robotGainWet || !robotGainDry) return
    robotOsc.frequency.value = fx.robot.frequency
    robotGainWet.gain.value  = fx.robot.enabled ? fx.robot.mix : 0
    robotGainDry.gain.value  = fx.robot.enabled ? 1 - fx.robot.mix : 1
}

function updateChorus() {
    if (!chorusLfo || !chorusLfoGain || !chorusMix) return
    chorusLfo.frequency.value   = fx.chorus.rate
    chorusLfoGain.gain.value    = fx.chorus.depth * 0.01
    chorusMix.gain.value        = fx.chorus.enabled ? 0.5 : 0
}

function updateWhisper() {
    if (!whisperGainWet || !whisperGainDry) return
    whisperGainWet.gain.value = fx.whisper.enabled ? fx.whisper.mix : 0
    whisperGainDry.gain.value = fx.whisper.enabled ? 1 - fx.whisper.mix : 1
}

function updateBitcrusher() {
    if (!bitcrusherNode) return
    bitcrusherNode.parameters.get('bits')!.value      = fx.bitcrusher.enabled ? fx.bitcrusher.bits : 16
    bitcrusherNode.parameters.get('reduction')!.value = fx.bitcrusher.enabled ? fx.bitcrusher.reduction : 1
}

function updateReverb() {
    if (!convolverNode || !reverbGainWet || !reverbGainDry || !ctx) return
    convolverNode.buffer     = makeReverbIR(fx.reverb.duration, 2)
    reverbGainWet.gain.value = fx.reverb.enabled ? fx.reverb.mix : 0
    reverbGainDry.gain.value = fx.reverb.enabled ? 1 - fx.reverb.mix : 1
}

function updateEcho() {
    if (!echoDelay || !echoFeedGain || !echoMix) return
    echoDelay.delayTime.value = fx.echo.delay
    echoFeedGain.gain.value   = fx.echo.feedback
    echoMix.gain.value        = fx.echo.enabled ? 0.5 : 0
}

// ── Preview record / play ─────────────────────────────────────────────────────

const PREVIEW_DURATION_MS = 5000

function toggleRecord() {
    recording.value ? stopRecord() : startRecord()
}

function startRecord() {
    if (!recorderDest || recording.value) return
    recorderChunks = []
    mediaRecorder = new MediaRecorder(recorderDest.stream)
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recorderChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
        const blob    = new Blob(recorderChunks, { type: 'audio/webm' })
        const arrBuf  = await blob.arrayBuffer()
        previewBuffer.value = await ctx!.decodeAudioData(arrBuf)
        statusText.value = 'Preview ready'
    }
    mediaRecorder.start()
    recording.value = true
    statusText.value = 'Recording…'
    setTimeout(stopRecord, PREVIEW_DURATION_MS)
}

function stopRecord() {
    if (!recording.value || !mediaRecorder) return
    mediaRecorder.stop()
    recording.value = false
}

function togglePlay() {
    playing.value ? stopPlayback() : startPlayback()
}

function startPlayback() {
    if (!previewBuffer.value || !ctx) return
    playbackSource = ctx.createBufferSource()
    playbackSource.buffer = previewBuffer.value
    playbackSource.connect(ctx.destination)
    playbackSource.onended = () => { playing.value = false }
    playbackSource.start()
    playing.value = true
    statusText.value = 'Playing…'
}

function stopPlayback() {
    playbackSource?.stop()
    playbackSource = null
    playing.value  = false
    statusText.value = ''
}

// ── Presets ───────────────────────────────────────────────────────────────────

function loadPreset(preset: VoicePreset) {
    const e = preset.effects
    Object.assign(fx.noiseGate,  e.noiseGate)
    Object.assign(fx.pitch,      e.pitch)
    Object.assign(fx.robot,      e.robot)
    Object.assign(fx.chorus,     e.chorus)
    Object.assign(fx.whisper,    e.whisper)
    Object.assign(fx.bitcrusher, e.bitcrusher)
    Object.assign(fx.reverb,     e.reverb)
    Object.assign(fx.echo,       e.echo)

    // Apply all to audio graph
    updateNoise(); updatePitch(); updateRobot(); updateChorus()
    updateWhisper(); updateBitcrusher(); updateReverb(); updateEcho()

    activePresetId.value = preset.id
    statusText.value = `Loaded: ${preset.name}`
}

function savePreset() {
    showSaveInput.value  = true
    savePresetName.value = ''
    nextTick(() => saveInputRef.value?.focus())
}

async function confirmSave() {
    const name = savePresetName.value.trim()
    if (!name) return

    const preset: VoicePreset = {
        id:      `user-${Date.now()}`,
        name,
        effects: JSON.parse(JSON.stringify(fx)),
    }

    savedPresets.value.push(preset)
    activePresetId.value = preset.id
    showSaveInput.value  = false
    savePresetName.value = ''
    await persistPresets()
    statusText.value = `Saved: ${name}`
}

function deletePreset(id: string) {
    savedPresets.value = savedPresets.value.filter(p => p.id !== id)
    if (activePresetId.value === id) activePresetId.value = null
    persistPresets()
}

async function sharePreset(preset: VoicePreset) {
    // TODO: Save to vault at gexchange://voiceEffects/{username}/{preset.name}.json
    // then attach as a room file so peers can download and import it.
    // Requires active room context — wire when file sharing layer is confirmed working.
    const json = JSON.stringify(preset, null, 2)
    await navigator.clipboard.writeText(json)
    statusText.value = 'Copied to clipboard (vault sharing coming soon)'
}

// ── Preset persistence (vault) ────────────────────────────────────────────────

const PRESET_STORAGE_KEY = 'vp_presets'

async function loadPersistedPresets() {
    try {
        const raw = localStorage.getItem(PRESET_STORAGE_KEY)
        if (raw) savedPresets.value = JSON.parse(raw)
    } catch {
        savedPresets.value = []
    }
}

async function persistPresets() {
    try {
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(savedPresets.value))
    } catch (err) {
        console.warn('[VoicePanel] Failed to persist presets:', err)
    }
}
// Note: vault-backed persistence (for cross-device sync) replaces localStorage
// once the vault token is reliably injectable into board provider components.
// The key will be: gexchange://config/voice-presets.json

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
    await loadPersistedPresets()
})

onUnmounted(async () => {
    await teardownAudio()
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