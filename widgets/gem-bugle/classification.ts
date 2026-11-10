import type { BugleItem, BugleSection, BugleSource, FeedItem } from './model'

const RULES: Array<{ section: Exclude<BugleSection, 'latest'>; words: RegExp }> = [
  { section: 'opinion', words: /\b(opinion|editorial|commentary|column|letters?)\b/i },
  { section: 'technology', words: /\b(technology|tech|software|hardware|computer|cyber|internet|ai|artificial intelligence|programming)\b/i },
  { section: 'science', words: /\b(science|space|astronomy|physics|biology|climate|research|medicine|health)\b/i },
  { section: 'business', words: /\b(business|economy|economic|markets?|finance|companies|company|stocks?|trade)\b/i },
  { section: 'sports', words: /\b(sport|football|soccer|hockey|baseball|basketball|tennis|golf|olympic|formula 1|f1)\b/i },
  { section: 'culture', words: /\b(culture|arts?|books?|film|movies?|music|television|theatre|theater|food|travel|entertainment)\b/i },
  { section: 'world', words: /\b(world|international|global|europe|asia|africa|americas|middle east|foreign)\b/i },
  { section: 'local', words: /\b(local|city|municipal|community|neighbourhood|neighborhood|regional)\b/i },
]

export function classifyItem(item: Pick<FeedItem, 'title' | 'summary' | 'categories'>, source: Pick<BugleSource, 'section' | 'title'>): BugleSection {
  if (source.section !== 'auto') return source.section
  const categories = item.categories.join(' ')
  const evidence = `${categories} ${item.title} ${item.summary ?? ''} ${source.title}`
  for (const rule of RULES) if (rule.words.test(evidence)) return rule.section
  return 'latest'
}

export function normalizeFeedItems(source: BugleSource, items: FeedItem[]): BugleItem[] {
  return items
    .filter(item => item.title.trim() && item.url.trim())
    .map(item => ({
      ...item,
      sourceId: source.id,
      sourceTitle: source.title,
      section: classifyItem(item, source),
      display: source.display,
    }))
}

function storyKey(item: BugleItem): string {
  try {
    const url = new URL(item.url)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key)
    }
    return url.href.toLowerCase()
  } catch {
    return item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  }
}

export function dedupeAndSort(items: BugleItem[], limit = 80): BugleItem[] {
  const seen = new Set<string>()
  return [...items]
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .filter(item => {
      const key = storyKey(item)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export function itemsBySection(items: BugleItem[]): Map<BugleSection, BugleItem[]> {
  const groups = new Map<BugleSection, BugleItem[]>()
  for (const item of items) groups.set(item.section, [...(groups.get(item.section) ?? []), item])
  return groups
}
