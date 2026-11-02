// widgets/game-library/stores/xbox.ts
//
// Xbox (PC Game Pass, the Microsoft Store) games (0.8.0, Phase 2). Each is installed in a folder of an Xbox games
// folder (C:\XboxGames\<game>\Content), with a MicrosoftGame.config naming its package (Identity Name and Publisher),
// its programs (Executable Id) and its name (ShellVisuals DefaultDisplayName). It starts as a Store app, by its app id
// "<package family name>!<executable id>" (GEM Shell's sdk.installedApps().launch, part B). The family name is
// "<name>_<publisher id>": the publisher id is Windows' hash of the publisher (publisherId below, checked against
// Microsoft's 8wekyb3d8bbwe).

export const XBOX_DEFAULT_FOLDERS = ['C:\\XboxGames']

export type XboxGame = {
  /** The app id GEM Shell starts ("Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft"). */
  appId: string
  title: string
  installDir: string
}

export type XboxConfig = {
  name: string
  publisher: string
  executableId?: string
  displayName?: string
  logos: string[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (all, e: string) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? all
  const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
  return Number.isFinite(code) ? String.fromCodePoint(code) : all
})

/** The attributes of the first <tag …> element, unescaped. */
function attributes(xml: string, tag: string): Record<string, string> | null {
  const m = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(xml)
  if (!m) return null
  const out: Record<string, string> = {}
  for (const a of m[1].matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[a[1]] = unescape(a[3] ?? a[4] ?? '')
  return out
}

/** MicrosoftGame.config's identity, first program and name; null when it isn't one. */
export function parseGameConfig(xml: string): XboxConfig | null {
  const text = xml.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '')
  if (!/<Game\b/i.test(text)) return null
  const identity = attributes(text, 'Identity')
  if (!identity?.Name || !identity.Publisher) return null
  const executable = attributes(text, 'Executable')
  const visuals = attributes(text, 'ShellVisuals') ?? {}
  const display = visuals.DefaultDisplayName?.trim()
  const logos = ['Square480x480Logo', 'Square150x150Logo', 'StoreLogo'].map(k => visuals[k]).filter((v): v is string => !!v && !/^ms-/i.test(v))
  return {
    name: identity.Name.trim(),
    publisher: identity.Publisher.trim(),
    executableId: executable?.Id?.trim() || undefined,
    // "ms-resource:…" names live in the package's resources: not readable here
    displayName: display && !/^ms-resource:/i.test(display) ? display : undefined,
    logos,
  }
}

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Windows' publisher id: the SHA-256 of the publisher (UTF-16LE), its first 64 bits and a zero bit, in 13 base-32
 * characters. sha256: the digest function (crypto.subtle in GEM Shell and in Node).
 */
export async function publisherId(publisher: string, sha256: (data: Uint8Array) => Promise<ArrayBuffer> = defaultSha256): Promise<string> {
  const bytes = new Uint8Array(publisher.length * 2)
  for (let i = 0; i < publisher.length; i += 1) {
    const c = publisher.charCodeAt(i)
    bytes[i * 2] = c & 0xff
    bytes[i * 2 + 1] = c >> 8
  }
  const hash = new Uint8Array(await sha256(bytes)).subarray(0, 8)
  let bits = ''
  for (const b of hash) bits += b.toString(2).padStart(8, '0')
  bits += '0'
  let out = ''
  for (let i = 0; i < 65; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

function defaultSha256(data: Uint8Array): Promise<ArrayBuffer> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (!subtle) return Promise.reject(new Error('No SHA-256 here.'))
  return subtle.digest('SHA-256', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
}

/** The game's app id, or null when its config names no program. */
export async function xboxAppId(config: XboxConfig, sha256?: (data: Uint8Array) => Promise<ArrayBuffer>): Promise<string | null> {
  if (!config.executableId) return null
  return `${config.name}_${await publisherId(config.publisher, sha256)}!${config.executableId}`
}

/** "Minecraft Launcher" from "C:\XboxGames\Minecraft Launcher\Content" when the config has no plain name. */
export function titleFromFolder(installDir: string): string {
  const parts = installDir.replace(/[\\/]+$/, '').split(/[\\/]/)
  const last = parts[parts.length - 1]
  return (/^content$/i.test(last) ? parts[parts.length - 2] : last) || installDir
}
