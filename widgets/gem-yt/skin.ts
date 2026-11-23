// GEM YT's own look (0.2.0): a late-night broadcast room. A library-ui skin (shared/library-ui/skins.ts): plain values,
// the same keys as the Video Club's and the Game Shop's, so their skins (and a skin editor later) fit it too.
import type { LibrarySkin } from '@shared/library-ui'

export const BROADCAST: LibrarySkin = {
  format: 1,
  id: 'broadcast',
  name: 'Broadcast',
  values: {
    'wall': '#17181c',
    'wall-pattern': 'repeating-linear-gradient(0deg, #ffffff04 0 1px, transparent 1px 4px), linear-gradient(#1d1f25, #17181c 60%, #111215)',
    'wall-light': 'radial-gradient(ellipse 55% 42% at 20% 0, #ff3b3b22, transparent 70%), radial-gradient(ellipse 55% 42% at 80% 0, #ff3b3b22, transparent 70%)',
    'bar': 'linear-gradient(#0d0e11f2, #0d0e11e6)',
    'floor': 'repeating-linear-gradient(90deg, #26272c 0 38px, #1e1f23 38px 40px), linear-gradient(#202126, #141518)',
    'floor-height': '42px',
    'unit': 'linear-gradient(90deg, #101114, #2a2c32 4%, #121316 6%, #121316 94%, #2a2c32 96%, #101114)',
    'unit-back': 'repeating-linear-gradient(90deg, #0c0d10 0 1px, #15161a 1px 44px), linear-gradient(#17181c, #0e0f12)',
    'unit-edge': '#2a2c32',
    'shelf-light': '#5d6068',
    'shelf': '#3a3c43',
    'shelf-dark': '#16171b',
    'sign': '#ffe9e9',
    'sign-glow': '#ff3b3b88',
    'sign-board': 'linear-gradient(#24151a, #150b0f)',
    'fg': '#f1f1f3',
    'muted': '#b4b5bd',
    'accent': '#ff4545',
    'warm': '#ffb547',
    'panel': '#1b1c21',
    'panel-high': '#26272e',
  },
}
