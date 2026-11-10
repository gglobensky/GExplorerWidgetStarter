import type { BugleSection, BugleSource, SourceSection } from './model'

const SECTIONS: BugleSection[] = ['latest', 'world', 'local', 'business', 'technology', 'science', 'culture', 'sports', 'opinion']

export type OpmlSubscription = {
  title: string
  feedUrl: string
  siteUrl?: string
  section: SourceSection
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower === 'amp') return '&'
    if (lower === 'lt') return '<'
    if (lower === 'gt') return '>'
    if (lower === 'quot') return '"'
    if (lower === 'apos') return "'"
    const radix = lower.startsWith('#x') ? 16 : 10
    const value = Number.parseInt(lower.replace(/^#x?/, ''), radix)
    return Number.isFinite(value) ? String.fromCodePoint(value) : match
  })
}

function attributes(tag: string): Record<string, string> {
  const values: Record<string, string> = {}
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (const match of tag.matchAll(pattern)) values[match[1].toLowerCase()] = decodeXml(match[2] ?? match[3] ?? '').trim()
  return values
}

function safeWebUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    url.hash = ''
    return url.href
  } catch { return undefined }
}

export function categorySection(category: string | undefined): SourceSection {
  if (!category) return 'auto'
  const words = category.toLowerCase().split(/[\s,;/|>]+/).filter(Boolean)
  for (const section of SECTIONS) {
    if (words.includes(section)) return section
    if (section === 'technology' && words.some(word => ['tech', 'computing', 'digital'].includes(word))) return section
    if (section === 'culture' && words.some(word => ['arts', 'art', 'books', 'film', 'music'].includes(word))) return section
  }
  return 'auto'
}

export function parseOpml(text: string): OpmlSubscription[] {
  if (!/<opml\b/i.test(text) || !/<body\b/i.test(text)) throw new Error('That file is not a readable OPML subscription list.')
  const subscriptions: OpmlSubscription[] = []
  const seen = new Set<string>()
  const folders: string[] = []
  const outlineStack: boolean[] = []
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, '')
  for (const match of withoutComments.matchAll(/<\/?outline\b[^>]*>/gi)) {
    if (/^<\/outline/i.test(match[0])) {
      if (outlineStack.pop()) folders.pop()
      continue
    }
    const attr = attributes(match[0])
    const feedUrl = safeWebUrl(attr.xmlurl ?? attr.url)
    const selfClosing = /\/\s*>$/.test(match[0])
    if (feedUrl) {
      if (!seen.has(feedUrl)) {
        seen.add(feedUrl)
        const siteUrl = safeWebUrl(attr.htmlurl)
        let fallbackTitle: string
        try { fallbackTitle = new URL(feedUrl).hostname } catch { fallbackTitle = 'Untitled feed' }
        subscriptions.push({
          title: (attr.title || attr.text || fallbackTitle).slice(0, 180),
          feedUrl,
          ...(siteUrl ? { siteUrl } : {}),
          section: categorySection(attr.category || folders[folders.length - 1]),
        })
      }
    } else if (!selfClosing) {
      folders.push(attr.category || attr.title || attr.text || '')
    }
    if (!selfClosing) outlineStack.push(!feedUrl)
  }
  if (!subscriptions.length) throw new Error('No RSS, Atom, or JSON feed addresses were found in that OPML file.')
  return subscriptions
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function createOpml(sources: BugleSource[], createdAt = Date.now()): string {
  const outlines = sources.map(source => {
    const category = source.section === 'auto' ? 'Automatic' : source.section.charAt(0).toUpperCase() + source.section.slice(1)
    const values = [
      'type="rss"',
      `text="${escapeXml(source.title)}"`,
      `title="${escapeXml(source.title)}"`,
      `xmlUrl="${escapeXml(source.feedUrl)}"`,
      source.siteUrl ? `htmlUrl="${escapeXml(source.siteUrl)}"` : '',
      `category="${escapeXml(category)}"`,
    ].filter(Boolean).join(' ')
    return `    <outline ${values}/>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>GEM Bugle subscriptions</title>\n    <dateCreated>${new Date(createdAt).toUTCString()}</dateCreated>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>\n`
}
