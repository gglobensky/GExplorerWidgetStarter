export const ALARM_SOUNDS = [
  { id: 'chime', label: 'Bright chime', description: 'A clear two-note alert' },
  { id: 'bell', label: 'Desk bell', description: 'A warm, vintage bell' },
  { id: 'pulse', label: 'Digital pulse', description: 'A crisp electronic signal' },
  { id: 'gentle', label: 'Gentle rise', description: 'A softer ascending reminder' },
] as const

export type AlarmSoundId = typeof ALARM_SOUNDS[number]['id']
export const DEFAULT_ALARM_SOUND: AlarmSoundId = 'chime'

export function validAlarmSound(value: unknown): AlarmSoundId {
  return ALARM_SOUNDS.some(sound => sound.id === value) ? value as AlarmSoundId : DEFAULT_ALARM_SOUND
}

type Sample = (time: number) => number
const clamp = (sample: number) => Math.max(-1, Math.min(1, sample))
const fade = (time: number, start: number, length: number) => Math.max(0, Math.min(1, (time - start) / length))
const sine = (frequency: number, time: number) => Math.sin(2 * Math.PI * frequency * time)

function tone(sound: AlarmSoundId): { seconds: number; sample: Sample } {
  if (sound === 'bell') return {
    seconds: 1.45,
    sample: time => {
      const strike = Math.exp(-3.2 * time) * fade(time, 0, .008)
      return strike * (sine(523.25, time) * .58 + sine(1046.5, time) * .27 + sine(1568, time) * .15)
    },
  }
  if (sound === 'pulse') return {
    seconds: 1.2,
    sample: time => {
      const beat = time % .3
      if (beat >= .15) return 0
      const envelope = fade(beat, 0, .008) * Math.min(1, (.15 - beat) / .025)
      return (sine(784, time) >= 0 ? .68 : -.68) * envelope
    },
  }
  if (sound === 'gentle') return {
    seconds: 1.8,
    sample: time => {
      const frequency = 392 + 196 * Math.min(1, time / 1.35)
      const envelope = fade(time, 0, .18) * Math.min(1, (1.8 - time) / .3)
      return envelope * (sine(frequency, time) * .7 + sine(frequency * 2, time) * .12)
    },
  }
  return {
    seconds: 1.2,
    sample: time => {
      const beat = time % .4, on = beat < .24
      const frequency = time < .6 ? 659.25 : 880
      const envelope = on ? fade(beat, 0, .012) * Math.min(1, (.24 - beat) / .05) : 0
      return sine(frequency, time) * envelope
    },
  }
}

/** A short PCM WAV generated locally and played through GEM's Audio Rack. */
export function alarmToneBlob(sound: AlarmSoundId = DEFAULT_ALARM_SOUND): Blob {
  const rate = 22050, definition = tone(validAlarmSound(sound)), samples = Math.floor(rate * definition.seconds)
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i) }
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(clamp(definition.sample(i / rate)) * 11500), true)
  return new Blob([bytes], { type: 'audio/wav' })
}
