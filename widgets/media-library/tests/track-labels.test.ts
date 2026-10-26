import assert from 'node:assert/strict'
import test from 'node:test'
import { audioTrackLabel, languageName, subtitleTrackLabel } from '../track-labels.ts'

test('audio tracks: title, language, channels and codec', () => {
  assert.equal(audioTrackLabel({ index:0, codec:'aac', channels:6, language:'eng', title:null, default:true }, 0), 'English · 5.1 AAC')
  assert.equal(
    audioTrackLabel({ index:1, codec:'aac', channels:2, language:'eng', title:'Commentary with Eli Craig, Tyler Labine & Alan Tudyk', default:false }, 1),
    'Commentary with Eli Craig, Tyler Labine & Alan Tudyk · English · Stereo AAC')
  assert.equal(audioTrackLabel({ index:2, codec:'ac3', channels:6, language:'fre', title:'French', default:false }, 2), 'French · 5.1 Dolby Digital')
  assert.equal(audioTrackLabel({ index:3, codec:'', channels:null, language:'und', title:null, default:false }, 3), 'Track 4')
})

test('subtitle tracks: title and language; formats that can not be shown say so', () => {
  assert.equal(subtitleTrackLabel({ index:0, codec:'hdmv_pgs_subtitle', language:'eng', title:'SDH', default:false, image:true, vtt:null }, 0), 'SDH · English')
  assert.equal(subtitleTrackLabel({ index:1, codec:'hdmv_pgs_subtitle', language:'spa', title:'Latin American', default:false, image:true, vtt:null }, 1), 'Latin American · Spanish')
  assert.equal(subtitleTrackLabel({ index:2, codec:'subrip', language:null, title:null, default:false, image:false, vtt:'/cv/t/sub/2' }, 2), 'Subtitles 3')
  assert.equal(subtitleTrackLabel({ index:3, codec:'eia_608', language:'eng', title:null, default:false, image:false, vtt:null }, 3), "English (can't be shown)")
})

test('language codes', () => {
  assert.equal(languageName('ger'), 'German')
  assert.equal(languageName('xx'), 'XX')
  assert.equal(languageName('und'), null)
})
