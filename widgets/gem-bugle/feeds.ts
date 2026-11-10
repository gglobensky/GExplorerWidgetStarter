import type { FeedDocument, FeedItem, SourceCandidate } from './model'

export type NetworkTextFetch = (url: string) => Promise<{
  ok: boolean
  status: number
  statusText?: string
  text(): Promise<string>
}>

const FEED_TYPES = /(?:rss|atom|json|feed)/i

export function normalizeWebUrl(value: string): string {
  const text = value.trim()
  if (!text) throw new Error('Enter a website or feed address.')
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try { url = new URL(withScheme) } catch { throw new Error('That address is not valid.') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only web addresses can be added.')
  url.hash = ''
  return url.href
}

function cleanText(value: string | null | undefined, max = 1000): string | undefined {
  if (!value) return undefined
  let text = value
  if (/[<&]/.test(value)) {
    const parsed = new DOMParser().parseFromString(value, 'text/html')
    text = parsed.body.textContent ?? value
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : undefined
}

function safeUrl(value: string | null | undefined, base: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.trim(), base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch { return undefined }
}

function firstElement(parent: ParentNode, names: string[]): Element | undefined {
  for (const name of names) {
    const byQualifiedName = (parent as Element).getElementsByTagName?.(name)?.[0]
    if (byQualifiedName) return byQualifiedName
    const all = (parent as Element).getElementsByTagName?.('*') ?? []
    for (const element of Array.from(all)) if (element.localName.toLowerCase() === name.toLowerCase()) return element
  }
  return undefined
}

function firstText(parent: ParentNode, names: string[], max = 1000): string | undefined {
  return cleanText(firstElement(parent, names)?.textContent, max)
}

function elements(parent: ParentNode, localName: string): Element[] {
  const all = (parent as Element).getElementsByTagName?.('*') ?? []
  return Array.from(all).filter(element => element.localName.toLowerCase() === localName.toLowerCase())
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}

function atomLink(parent: ParentNode, base: string): string | undefined {
  const links = elements(parent, 'link')
  const preferred = links.find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate') ?? links[0]
  return safeUrl(preferred?.getAttribute('href') ?? preferred?.textContent, base)
}

function rssImage(parent: ParentNode, base: string, summary?: string): string | undefined {
  const media = elements(parent, 'content').find(element => element.prefix === 'media' || element.getAttribute('medium') === 'image')
    ?? elements(parent, 'thumbnail')[0]
  const enclosure = elements(parent, 'enclosure').find(element => (element.getAttribute('type') ?? '').startsWith('image/'))
  const declared = safeUrl(media?.getAttribute('url') ?? enclosure?.getAttribute('url'), base)
  if (declared) return declared
  if (!summary || !/<img\b/i.test(summary)) return undefined
  const html = new DOMParser().parseFromString(summary, 'text/html')
  return safeUrl(html.querySelector('img')?.getAttribute('src'), base)
}

function parseXmlFeed(text: string, feedUrl: string): FeedDocument {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('The address did not return a readable RSS or Atom feed.')
  const root = xml.documentElement
  const isAtom = root.localName.toLowerCase() === 'feed'
  const channel = isAtom ? root : firstElement(root, ['channel']) ?? root
  const nodes = isAtom ? elements(root, 'entry') : elements(channel, 'item')
  if (!nodes.length && !['rss', 'rdf', 'feed'].includes(root.localName.toLowerCase()))
    throw new Error('The address is not an RSS, Atom, or JSON feed.')
  const siteUrl = isAtom ? atomLink(channel, feedUrl) : safeUrl(firstText(channel, ['link']), feedUrl)
  const title = firstText(channel, ['title'], 180) ?? new URL(feedUrl).hostname
  const items: FeedItem[] = nodes.slice(0, 60).flatMap((node, index) => {
    const itemUrl = isAtom ? atomLink(node, siteUrl ?? feedUrl) : safeUrl(firstText(node, ['link']), siteUrl ?? feedUrl)
      ?? safeUrl(firstText(node, ['guid']), siteUrl ?? feedUrl)
    const itemTitle = firstText(node, ['title'], 300)
    if (!itemUrl || !itemTitle) return []
    const rawSummary = firstElement(node, isAtom ? ['summary', 'content'] : ['description', 'encoded'])?.textContent ?? undefined
    const categories = elements(node, 'category')
      .map(element => cleanText(element.getAttribute('term') ?? element.textContent, 80))
      .filter((value): value is string => !!value)
    return [{
      id: firstText(node, ['id', 'guid'], 500) ?? itemUrl ?? `${feedUrl}#${index}`,
      title: itemTitle,
      url: itemUrl,
      publishedAt: parseDate(firstText(node, ['published', 'updated', 'pubDate', 'date'], 100)),
      author: firstText(node, ['author', 'creator'], 160),
      summary: cleanText(rawSummary, 1200),
      categories,
      imageUrl: rssImage(node, siteUrl ?? feedUrl, rawSummary),
    }]
  })
  return {
    feedUrl,
    siteUrl,
    title,
    description: firstText(channel, ['subtitle', 'description'], 500),
    language: firstText(channel, ['language'], 40),
    items,
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function parseJsonFeed(text: string, feedUrl: string): FeedDocument {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('The address did not return valid JSON.') }
  const data = record(parsed)
  if (typeof data.version !== 'string' || !data.version.includes('jsonfeed.org/version'))
    throw new Error('The JSON response is not a JSON Feed.')
  const siteUrl = safeUrl(data.home_page_url, feedUrl)
  const items: FeedItem[] = (Array.isArray(data.items) ? data.items : []).slice(0, 60).flatMap((value: unknown, index: number) => {
    const item = record(value)
    const url = safeUrl(item.url ?? item.external_url, siteUrl ?? feedUrl)
    const title = cleanText(item.title, 300)
    if (!url || !title) return []
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag: unknown): tag is string => typeof tag === 'string').slice(0, 20) : []
    const authors = Array.isArray(item.authors) ? item.authors : item.author ? [item.author] : []
    return [{
      id: typeof item.id === 'string' ? item.id : `${feedUrl}#${index}`,
      title,
      url,
      publishedAt: parseDate(item.date_published ?? item.date_modified),
      author: cleanText(record(authors[0]).name, 160),
      summary: cleanText(item.summary ?? item.content_text ?? item.content_html, 1200),
      categories: tags,
      imageUrl: safeUrl(item.image ?? item.banner_image, siteUrl ?? feedUrl),
    }]
  })
  return {
    feedUrl,
    siteUrl,
    title: cleanText(data.title, 180) ?? new URL(feedUrl).hostname,
    description: cleanText(data.description, 500),
    language: cleanText(data.language, 40),
    items,
  }
}

export function parseFeed(text: string, feedUrl: string): FeedDocument {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Error('The feed is empty.')
  return trimmed.startsWith('{') ? parseJsonFeed(trimmed, feedUrl) : parseXmlFeed(trimmed, feedUrl)
}

export function discoverFeedLinks(html: string, pageUrl: string): Array<{ url: string; title?: string }> {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const found = new Map<string, { url: string; title?: string }>()
  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel]'))) {
    const rel = link.rel.toLowerCase().split(/\s+/)
    if (!rel.includes('alternate') || !FEED_TYPES.test(`${link.type} ${link.title} ${link.href}`)) continue
    const url = safeUrl(link.getAttribute('href'), pageUrl)
    if (url) found.set(url, { url, title: cleanText(link.title, 120) })
  }
  return [...found.values()].slice(0, 12)
}

async function requestText(fetchText: NetworkTextFetch, url: string): Promise<string> {
  const response = await fetchText(url)
  if (!response.ok) throw new Error(`The site returned HTTP ${response.status}.`)
  return response.text()
}

export async function fetchFeed(fetchText: NetworkTextFetch, url: string): Promise<FeedDocument> {
  const feedUrl = normalizeWebUrl(url)
  return parseFeed(await requestText(fetchText, feedUrl), feedUrl)
}

export async function discoverSources(fetchText: NetworkTextFetch, input: string): Promise<SourceCandidate[]> {
  const url = normalizeWebUrl(input)
  const body = await requestText(fetchText, url)
  try {
    return [{ feed: parseFeed(body, url) }]
  } catch {
    const links = discoverFeedLinks(body, url)
    if (!links.length) throw new Error('No RSS, Atom, or JSON feeds were advertised by that page.')
    const candidates: SourceCandidate[] = []
    const failures: string[] = []
    for (const link of links.slice(0, 8)) {
      try {
        candidates.push({ feed: await fetchFeed(fetchText, link.url), discoveredAs: link.title })
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    if (!candidates.length) throw new Error(failures[0] ?? 'The advertised feeds could not be read.')
    return candidates
  }
}
