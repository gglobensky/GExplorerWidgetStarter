// widgets/game-library/stores/battlenet.ts
//
// Battle.net's launch codes (0.16.0): Battle.net has no link that starts a game (battlenet://<code> only opens the
// game's page), but its program does: Battle.net.exe --exec="launch <code>". GEM Shell runs that for the widget
// (sdk.appLinks().launch('battlenet', code), GAME-LIBRARY-SHELL-ADDITIONS.md part G); the widget gives the code.
// Battle.net's uninstall entries name the game, not its code: the codes by name, as Battle.net's own shortcuts use
// them. A game not listed starts from its program, as before (and its page can be opened).
// Sources: Steam guide "Run Games from Battlenet Launcher with Steam Overlay"; dafzor/bnetlauncher.

export const BATTLENET_SCHEME = 'battlenet'

/** The game's name, compared without case, accents, ™ ®, punctuation or "the". */
const nameKey = (title: string) => title
  .replace(/[™®©℠]/g, '')
  .normalize('NFKD').replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/^the /, '')
  .trim()

const CODES: Record<string, string> = {
  'world of warcraft': 'WoW',
  'overwatch': 'Pro',
  'overwatch 2': 'Pro',
  'diablo': 'D1',
  'diablo ii resurrected': 'OSI',
  'diablo iii': 'D3',
  'diablo iv': 'Fen',
  'diablo immortal': 'ANBS',
  'hearthstone': 'WTCG',
  'heroes of the storm': 'Hero',
  'starcraft': 'S1',
  'starcraft remastered': 'S1',
  'starcraft ii': 'S2',
  'warcraft orcs and humans': 'W1',
  'warcraft ii battle net edition': 'W2',
  'warcraft i remastered': 'W1R',
  'warcraft remastered': 'W1R',
  'warcraft ii remastered': 'W2R',
  'warcraft iii reforged': 'W3',
  'warcraft rumble': 'GRY',
  'blizzard arcade collection': 'RTRO',
  'crash bandicoot 4 it s about time': 'WLBY',
  'call of duty': 'AUKS',
  'call of duty black ops 4': 'VIPR',
  'call of duty black ops 6': 'BTLR',
  'call of duty black ops cold war': 'ZEUS',
  'call of duty modern warfare': 'ODIN',
  'call of duty modern warfare ii': 'NINA',
  'call of duty modern warfare iii': 'PNTA',
  'call of duty modern warfare 2 campaign remastered': 'LAZR',
  'call of duty vanguard': 'FORE',
}

/** Battle.net's launch code for the game it installed, by its name ("Diablo® IV" → "Fen"); undefined: not known. */
export function battlenetCode(title: string): string | undefined {
  return CODES[nameKey(title)]
}

/** Battle.net's page of the game (it opens Battle.net there; the user presses Play). */
export const battlenetPageUri = (code: string) => `battlenet://${code}`
