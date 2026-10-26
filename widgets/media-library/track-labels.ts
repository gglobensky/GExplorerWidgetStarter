// widgets/media-library/track-labels.ts
//
// Names for a movie's audio and subtitle tracks in the player's menus (the shell's VideoHandle.tracks):
// the track's own title first ("Commentary with Eli Craig, Tyler Labine & Alan Tudyk", "SDH"), its
// language, then channels and codec for audio. No runtime imports (its tests run in plain Node).
import type { MediaTracks } from 'gexplorer/widgets'

type AudioTrack = MediaTracks['audio'][number]
type SubtitleTrack = MediaTracks['subtitles'][number]

/** ISO 639-2 (Matroska, MP4) and 639-1 codes to names; anything else is shown as its code. */
const LANGUAGES: Record<string, string> = {
  eng:'English', en:'English', fre:'French', fra:'French', fr:'French', spa:'Spanish', es:'Spanish',
  ger:'German', deu:'German', de:'German', ita:'Italian', it:'Italian', jpn:'Japanese', ja:'Japanese',
  por:'Portuguese', pt:'Portuguese', rus:'Russian', ru:'Russian', chi:'Chinese', zho:'Chinese', zh:'Chinese',
  kor:'Korean', ko:'Korean', dut:'Dutch', nld:'Dutch', nl:'Dutch', swe:'Swedish', sv:'Swedish',
  nor:'Norwegian', nob:'Norwegian', no:'Norwegian', dan:'Danish', da:'Danish', fin:'Finnish', fi:'Finnish',
  pol:'Polish', pl:'Polish', ara:'Arabic', ar:'Arabic', hin:'Hindi', hi:'Hindi', tur:'Turkish', tr:'Turkish',
  gre:'Greek', ell:'Greek', el:'Greek', heb:'Hebrew', he:'Hebrew', cze:'Czech', ces:'Czech', cs:'Czech',
  hun:'Hungarian', hu:'Hungarian', tha:'Thai', th:'Thai', vie:'Vietnamese', vi:'Vietnamese',
  ukr:'Ukrainian', uk:'Ukrainian', rum:'Romanian', ron:'Romanian', ro:'Romanian', ind:'Indonesian', id:'Indonesian',
}

export function languageName(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toLowerCase()
  if (!c || c === 'und' || c === 'zxx' || c === 'mis') return null
  return LANGUAGES[c] ?? c.toUpperCase()
}

function channelsName(n: number | null | undefined): string | null {
  if (!n) return null
  return n === 1 ? 'Mono' : n === 2 ? 'Stereo' : n === 6 ? '5.1' : n === 8 ? '7.1' : `${n} channels`
}

const CODECS: Record<string, string> = {
  aac:'AAC', ac3:'Dolby Digital', eac3:'Dolby Digital Plus', truehd:'Dolby TrueHD', dts:'DTS', mp3:'MP3',
  opus:'Opus', vorbis:'Vorbis', flac:'FLAC',
}

/** Distinct, non-empty parts, joined with " · " (a title that is just the language is said once). */
function join(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const p = (part ?? '').trim()
    if (!p || seen.has(p.toLowerCase())) continue
    seen.add(p.toLowerCase())
    out.push(p)
  }
  return out.join(' · ')
}

/** "English · 5.1 AAC", "Commentary with Eli Craig · English · Stereo AAC", "Track 2". */
export function audioTrackLabel(track: AudioTrack, index: number): string {
  const sound = [channelsName(track.channels), CODECS[track.codec?.toLowerCase()] ?? track.codec?.toUpperCase()].filter(Boolean).join(' ')
  return join([track.title, languageName(track.language), sound]) || `Track ${index + 1}`
}

/** "SDH · English", "Latin American · Spanish", "English (can't be shown)" for a format neither drawn nor shown. */
export function subtitleTrackLabel(track: SubtitleTrack, index: number): string {
  const name = join([track.title, languageName(track.language)]) || `Subtitles ${index + 1}`
  return track.vtt || track.image ? name : `${name} (can't be shown)`
}
