// src/widgets/gexchange/useAudioChain.ts
//
// Owns the full audio processing chain for GExchange voice calls.
// ChatRoom mounts this once and keeps it for the session lifetime.
// VoicePanel injects it as a pure control surface — no audio ownership there.
//
// CHAIN:
//   raw mic stream
//     → MediaStreamAudioSourceNode
//     → NoiseGate (worklet)
//     → Pitch (worklet)
//     → Robot (ring mod)
//     → Chorus
//     → Whisper
//     → Bitcrusher (worklet)
//     → Reverb
//     → Echo
//     → Limiter (always on — protects peers from loud transients)
//     → externalGain (mute gate — 0 when externalMuted)
//     → externalDest.stream  ← what startCall receives
//     → previewDest.stream   ← independent tap for buffer record (unaffected by externalGain)
//     → monitorGain          ← direct ctx.destination tap for live monitoring
//
// MONITOR:
//   monitorEnabled connects limiterNode directly into ctx.destination via a
//   GainNode. Single AudioContext clock — no MediaRecorder, no codec, no seams.
//   Set monitorEnabled.value = true to hear yourself live. Works in preview
//   mode (no call) and independently of externalMuted.
//
// CONFIG:
//   Persisted via sdk.configWrite('fx') → config/gexchange/fx.json
//   Loaded on mount, saved on every change via deep watch.
//   Defaults apply on first run.

import { ref, reactive, watch, type Ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIG_KEY  = 'fx'
const SAMPLE_RATE = 48000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FxState {
    noiseGate:  { enabled: boolean; threshold: number }
    pitch:      { enabled: boolean; semitones: number }
    robot:      { enabled: boolean; frequency: number; mix: number }
    chorus:     { enabled: boolean; rate: number; depth: number }
    whisper:    { enabled: boolean; mix: number }
    bitcrusher: { enabled: boolean; bits: number; reduction: number }
    reverb:     { enabled: boolean; duration: number; mix: number }
    echo:       { enabled: boolean; delay: number; feedback: number }
}

export interface UseAudioChainReturn {
    // ── Provided to VoicePanel ────────────────────────────────────────────
    fxState:         FxState
    externalMuted:   Ref<boolean>
    monitorEnabled:  Ref<boolean>
    isProcessing:    Ref<boolean>
    inputLevel:      Ref<number>

    // ── Actions ───────────────────────────────────────────────────────────
    processStream:    (raw: MediaStream) => Promise<MediaStream>
    releaseStream:    () => Promise<void>
    getPreviewStream: () => MediaStream | null

    // ── Lifecycle ─────────────────────────────────────────────────────────
    load:    () => Promise<void>
    dispose: () => Promise<void>
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_FX: FxState = {
    noiseGate:  { enabled: false, threshold: 0.02 },
    pitch:      { enabled: false, semitones: 0 },
    robot:      { enabled: false, frequency: 30,  mix: 0.7 },
    chorus:     { enabled: false, rate: 0.5,      depth: 0.3 },
    whisper:    { enabled: false, mix: 0.5 },
    bitcrusher: { enabled: false, bits: 8,         reduction: 4 },
    reverb:     { enabled: false, duration: 2,     mix: 0.3 },
    echo:       { enabled: false, delay: 0.3,      feedback: 0.4 },
}

// ── Worklet processor sources ─────────────────────────────────────────────────
// Inlined so no separate worklet files are needed.

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
            if (pitch !== 1.0) {
                const diff = this._wp - this._rp
                if (diff > len * 0.75) this._rp += len * 0.25
                if (diff < len * 0.1)  this._rp  = this._wp - len * 0.4
            }
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
            { name: 'reduction', defaultValue: 1, minValue: 1,  maxValue: 50, automationRate: 'k-rate' }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReverbIR(ctx: AudioContext, duration: number, decay = 2): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c)
        for (let i = 0; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
}

function makeWhisperCurve(): Float32Array {
    const n = 256, curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1
        curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 4))
    }
    return curve
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useAudioChain(sdk: WidgetSdk): UseAudioChainReturn {
    // ── Reactive state ────────────────────────────────────────────────────

    const fxState        = reactive<FxState>(JSON.parse(JSON.stringify(DEFAULT_FX)))
    const externalMuted  = ref(false)
    const monitorEnabled = ref(false)
    const isProcessing   = ref(false)
    const inputLevel     = ref(0)
    let _meterFrame: number | null = null

    // ── Audio nodes ───────────────────────────────────────────────────────

    let ctx:           AudioContext | null = null
    let workletLoaded = false

    // Source
    let sourceNode:    MediaStreamAudioSourceNode | null = null

    // Effect nodes
    let noiseGateNode:   AudioWorkletNode | null = null
    let pitchNode:       AudioWorkletNode | null = null
    let robotOsc:        OscillatorNode | null = null
    let robotGainIn:     GainNode | null = null
    let robotGainWet:    GainNode | null = null
    let robotGainDry:    GainNode | null = null
    let chorusDelay:     DelayNode | null = null
    let chorusLfo:       OscillatorNode | null = null
    let chorusLfoGain:   GainNode | null = null
    let chorusMix:       GainNode | null = null
    let chorusDry:       GainNode | null = null
    let whisperFilter:   BiquadFilterNode | null = null
    let whisperShaper:   WaveShaperNode | null = null
    let whisperGainWet:  GainNode | null = null
    let whisperGainDry:  GainNode | null = null
    let bitcrusherNode:  AudioWorkletNode | null = null
    let convolverNode:   ConvolverNode | null = null
    let reverbGainWet:   GainNode | null = null
    let reverbGainDry:   GainNode | null = null
    let echoDelay:       DelayNode | null = null
    let echoFeedGain:    GainNode | null = null
    let echoMix:         GainNode | null = null
    let echoDry:         GainNode | null = null
    let analyserNode:    AnalyserNode | null = null
    let previewDest:     MediaStreamAudioDestinationNode | null = null

    // Output routing
    let limiterNode:   DynamicsCompressorNode | null = null
    let externalGain:  GainNode | null = null
    let externalDest:  MediaStreamAudioDestinationNode | null = null

    // ── Monitor tap — direct ctx.destination connection ───────────────────
    // Single AudioContext, single clock: zero seams, zero codec artifacts.
    // monitorGain.gain is 0 (silent) until monitorEnabled is set true.
    let monitorGain:   GainNode | null = null

    // ── Config ────────────────────────────────────────────────────────────

    async function _loadConfig(): Promise<void> {
        try {
            const saved = await sdk.configRead?.<FxState>(CONFIG_KEY)
            if (saved) {
                for (const key of Object.keys(DEFAULT_FX) as (keyof FxState)[]) {
                    if (saved[key]) Object.assign(fxState[key], saved[key])
                }
            }
        } catch (err) {
            console.warn('[useAudioChain] Failed to load fx config:', err)
        }
    }

    async function _saveConfig(): Promise<void> {
        try {
            await sdk.configWrite?.(CONFIG_KEY, JSON.parse(JSON.stringify(fxState)))
        } catch (err) {
            console.warn('[useAudioChain] Failed to save fx config:', err)
        }
    }

    // ── Watchers ──────────────────────────────────────────────────────────

    // Deep watch fxState — persist and apply on every change
    watch(
        () => JSON.stringify(fxState),
        () => {
            _saveConfig()
            if (ctx) _applyFx()
        }
    )

    watch(externalMuted,  v => { if (externalGain) externalGain.gain.value = v ? 0 : 1 })

    // Monitor tap: flip the gain in-graph — no rebuild needed.
    watch(monitorEnabled, v => { if (monitorGain) monitorGain.gain.value = v ? 1 : 0 })

    // ── Worklet loader ────────────────────────────────────────────────────

    async function _loadWorklet(code: string): Promise<void> {
        if (!ctx) return
        const blob = new Blob([code], { type: 'application/javascript' })
        const url  = URL.createObjectURL(blob)
        try   { await ctx.audioWorklet.addModule(url) }
        finally { URL.revokeObjectURL(url) }
    }

    // ── Chain builder ─────────────────────────────────────────────────────

    async function _buildChain(): Promise<void> {
        if (!ctx || !sourceNode) return

        if (!workletLoaded) {
            await _loadWorklet(NOISEGATE_PROCESSOR)
            await _loadWorklet(PITCH_PROCESSOR)
            await _loadWorklet(BITCRUSHER_PROCESSOR)
            workletLoaded = true
        }

        // ── Noise gate ────────────────────────────────────────────────────
        noiseGateNode = new AudioWorkletNode(ctx, 'noise-gate')

        // ── Pitch ─────────────────────────────────────────────────────────
        pitchNode = new AudioWorkletNode(ctx, 'pitch-shifter')

        // ── Robot (ring mod) ──────────────────────────────────────────────
        robotOsc     = ctx.createOscillator()
        robotGainIn  = ctx.createGain()
        robotGainWet = ctx.createGain()
        robotGainDry = ctx.createGain()
        robotOsc.type = 'sine'
        robotOsc.connect(robotGainIn.gain)
        robotOsc.start()

        // ── Chorus ────────────────────────────────────────────────────────
        chorusDelay   = ctx.createDelay(0.05)
        chorusLfo     = ctx.createOscillator()
        chorusLfoGain = ctx.createGain()
        chorusMix     = ctx.createGain()
        chorusDry     = ctx.createGain()
        chorusDelay.delayTime.value = 0.025
        chorusLfo.connect(chorusLfoGain)
        chorusLfoGain.connect(chorusDelay.delayTime)
        chorusLfo.start()

        // ── Whisper ───────────────────────────────────────────────────────
        whisperFilter  = ctx.createBiquadFilter()
        whisperShaper  = ctx.createWaveShaper()
        whisperGainWet = ctx.createGain()
        whisperGainDry = ctx.createGain()
        whisperFilter.type = 'highpass'
        whisperFilter.frequency.value = 800
        whisperShaper.curve = makeWhisperCurve() as unknown as Float32Array<ArrayBuffer>

        // ── Bitcrusher ────────────────────────────────────────────────────
        bitcrusherNode = new AudioWorkletNode(ctx, 'bitcrusher')

        // ── Reverb ────────────────────────────────────────────────────────
        convolverNode  = ctx.createConvolver()
        reverbGainWet  = ctx.createGain()
        reverbGainDry  = ctx.createGain()
        convolverNode.buffer = makeReverbIR(ctx, fxState.reverb.duration)

        // ── Echo ──────────────────────────────────────────────────────────
        echoDelay    = ctx.createDelay(2)
        echoFeedGain = ctx.createGain()
        echoMix      = ctx.createGain()
        echoDry      = ctx.createGain()
        echoDelay.connect(echoFeedGain)
        echoFeedGain.connect(echoDelay)

        // ── Limiter (always on) ───────────────────────────────────────────
        limiterNode = ctx.createDynamicsCompressor()
        limiterNode.threshold.value = -6
        limiterNode.knee.value      = 0
        limiterNode.ratio.value     = 20
        limiterNode.attack.value    = 0.001
        limiterNode.release.value   = 0.1

        // ── Preview tap (independent of externalGain) ─────────────────────
        previewDest = ctx.createMediaStreamDestination()
        limiterNode.connect(previewDest)

        // ── Monitor tap (direct to speakers — same context, zero seams) ───
        // gain is 0 until monitorEnabled.value is set true.
        monitorGain = ctx.createGain()
        monitorGain.gain.value = monitorEnabled.value ? 1 : 0
        limiterNode.connect(monitorGain)
        monitorGain.connect(ctx.destination)

        // ── External output routing ───────────────────────────────────────
        externalGain = ctx.createGain()
        externalGain.gain.value = externalMuted.value ? 0 : 1

        externalDest = ctx.createMediaStreamDestination()
        externalDest.channelCount = 1
        externalDest.channelCountMode = 'explicit'

        // ── Wire the chain ────────────────────────────────────────────────

        const robotMerge   = ctx.createGain()
        const chorusMerge  = ctx.createGain()
        const whisperMerge = ctx.createGain()
        const reverbMerge  = ctx.createGain()
        const echoMerge    = ctx.createGain()

        // source → analyser → noiseGate → pitch
        analyserNode = ctx.createAnalyser()
        analyserNode.fftSize = 512
        sourceNode.connect(analyserNode)
        analyserNode.connect(noiseGateNode)
        noiseGateNode.connect(pitchNode)

        // pitch → robot dry + wet → robotMerge
        pitchNode.connect(robotGainDry)
        pitchNode.connect(robotGainIn)
        robotGainIn.connect(robotGainWet)
        robotGainDry.connect(robotMerge)
        robotGainWet.connect(robotMerge)

        // robotMerge → chorus dry + delay wet → chorusMerge
        robotMerge.connect(chorusDry)
        robotMerge.connect(chorusDelay)
        chorusDelay.connect(chorusMix)
        chorusDry.connect(chorusMerge)
        chorusMix.connect(chorusMerge)

        // chorusMerge → whisper dry + filter/shaper wet → whisperMerge
        chorusMerge.connect(whisperGainDry)
        chorusMerge.connect(whisperFilter)
        whisperFilter.connect(whisperShaper)
        whisperShaper.connect(whisperGainWet)
        whisperGainDry.connect(whisperMerge)
        whisperGainWet.connect(whisperMerge)

        // whisperMerge → bitcrusher → reverb dry + convolver wet → reverbMerge
        whisperMerge.connect(bitcrusherNode)
        bitcrusherNode.connect(reverbGainDry)
        bitcrusherNode.connect(convolverNode)
        convolverNode.connect(reverbGainWet)
        reverbGainDry.connect(reverbMerge)
        reverbGainWet.connect(reverbMerge)

        // reverbMerge → echo dry + delay wet → echoMerge
        reverbMerge.connect(echoDry)
        reverbMerge.connect(echoDelay)
        echoDelay.connect(echoMix)
        echoDry.connect(echoMerge)
        echoMix.connect(echoMerge)

        // echoMerge → limiter → [previewDest | monitorGain | externalGain → externalDest]
        echoMerge.connect(limiterNode)
        limiterNode.connect(externalGain)

        const monoSplitter = ctx.createChannelSplitter(2)
        const monoMerger   = ctx.createChannelMerger(1)
        externalGain.connect(monoSplitter)
        monoSplitter.connect(monoMerger, 0, 0)
        monoMerger.connect(externalDest)

        _startMeter(analyserNode!)
        _applyFx()

        console.log('[useAudioChain] Chain built')
    }

    // ── Apply fx state to nodes ───────────────────────────────────────────

    function _applyFx(): void {
        if (!ctx) return

        if (noiseGateNode) {
            noiseGateNode.parameters.get('threshold')!.value = fxState.noiseGate.threshold
            noiseGateNode.parameters.get('enabled')!.value   = fxState.noiseGate.enabled ? 1 : 0
        }

        if (pitchNode) {
            pitchNode.parameters.get('pitch')!.value = fxState.pitch.enabled
                ? Math.pow(2, fxState.pitch.semitones / 12)
                : 1.0
        }

        if (robotOsc && robotGainWet && robotGainDry) {
            robotOsc.frequency.value = fxState.robot.frequency
            robotGainWet.gain.value  = fxState.robot.enabled ? fxState.robot.mix : 0
            robotGainDry.gain.value  = fxState.robot.enabled ? 1 - fxState.robot.mix : 1
        }

        if (chorusLfo && chorusLfoGain && chorusMix) {
            chorusLfo.frequency.value  = fxState.chorus.rate
            chorusLfoGain.gain.value   = fxState.chorus.depth * 0.01
            chorusMix.gain.value       = fxState.chorus.enabled ? 0.5 : 0
        }

        if (whisperGainWet && whisperGainDry) {
            whisperGainWet.gain.value = fxState.whisper.enabled ? fxState.whisper.mix : 0
            whisperGainDry.gain.value = fxState.whisper.enabled ? 1 - fxState.whisper.mix : 1
        }

        if (bitcrusherNode) {
            bitcrusherNode.parameters.get('bits')!.value      = fxState.bitcrusher.enabled
                ? fxState.bitcrusher.bits : 16
            bitcrusherNode.parameters.get('reduction')!.value = fxState.bitcrusher.enabled
                ? fxState.bitcrusher.reduction : 1
        }

        if (convolverNode && reverbGainWet && reverbGainDry && ctx) {
            convolverNode.buffer     = makeReverbIR(ctx, fxState.reverb.duration)
            reverbGainWet.gain.value = fxState.reverb.enabled ? fxState.reverb.mix : 0
            reverbGainDry.gain.value = fxState.reverb.enabled ? 1 - fxState.reverb.mix : 1
        }

        if (echoDelay && echoFeedGain && echoMix) {
            echoDelay.delayTime.value = fxState.echo.delay
            echoFeedGain.gain.value   = fxState.echo.feedback
            echoMix.gain.value        = fxState.echo.enabled ? 0.5 : 0
        }
    }

    // ── Teardown ──────────────────────────────────────────────────────────

    function _teardown(): void {
        _stopMeter()
        robotOsc?.stop()
        chorusLfo?.stop()

        sourceNode?.disconnect()
        monitorGain?.disconnect()

        ctx = sourceNode = null
        noiseGateNode = pitchNode = null
        analyserNode = null
        previewDest = null
        monitorGain = null
        robotOsc = robotGainIn = robotGainWet = robotGainDry = null
        chorusDelay = chorusLfo = chorusLfoGain = chorusMix = chorusDry = null
        whisperFilter = whisperShaper = whisperGainWet = whisperGainDry = null
        bitcrusherNode = convolverNode = reverbGainWet = reverbGainDry = null
        echoDelay = echoFeedGain = echoMix = echoDry = null
        limiterNode = externalGain = externalDest = null
        workletLoaded = false
        isProcessing.value = false
        // Note: monitorEnabled is intentionally NOT reset here.
        // If the user had monitoring on and the stream is rebuilt (e.g. call starts),
        // the watcher will re-apply the correct gain value as soon as _buildChain wires
        // the new monitorGain node.
    }

    // ── Meter ─────────────────────────────────────────────────────────────

    function _startMeter(analyser: AnalyserNode): void {
        const data = new Uint8Array(analyser.frequencyBinCount)
        function tick() {
            analyser.getByteTimeDomainData(data)
            let max = 0
            for (const v of data) {
                const n = Math.abs((v - 128) / 128)
                if (n > max) max = n
            }
            inputLevel.value = max
            _meterFrame = requestAnimationFrame(tick)
        }
        _meterFrame = requestAnimationFrame(tick)
    }

    function _stopMeter(): void {
        if (_meterFrame !== null) {
            cancelAnimationFrame(_meterFrame)
            _meterFrame = null
        }
        inputLevel.value = 0
    }

    // ── Public API ────────────────────────────────────────────────────────

    async function processStream(raw: MediaStream): Promise<MediaStream> {
        if (ctx) await releaseStream()

        ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
        if (ctx.state === 'suspended') await ctx.resume()

        sourceNode = ctx.createMediaStreamSource(raw)
        await _buildChain()

        isProcessing.value = true
        return externalDest!.stream
    }

    async function releaseStream(): Promise<void> {
        await ctx?.close().catch(() => {})
        _teardown()
    }

    async function load(): Promise<void> {
        await _loadConfig()
    }

    async function dispose(): Promise<void> {
        await releaseStream()
    }

    return {
        fxState,
        externalMuted,
        monitorEnabled,
        isProcessing,
        inputLevel,
        processStream,
        releaseStream,
        load,
        dispose,
        getPreviewStream: () => previewDest?.stream ?? null,
    }
}