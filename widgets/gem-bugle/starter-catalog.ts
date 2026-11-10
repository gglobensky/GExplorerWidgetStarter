import type { SourceDisplay, SourceSection } from './model'

export type StarterSource = {
  id: string
  title: string
  publisher: string
  description: string
  feedUrl: string
  siteUrl: string
  section: SourceSection
  display: SourceDisplay
  provenance: string
}

/**
 * A deliberately small, reviewed shelf. Entries must be official HTTPS feeds,
 * require no account or API key, and remain opt-in. Non-feed daily features
 * belong in source adapters rather than being disguised as subscriptions.
 */
export const STARTER_SOURCES: readonly StarterSource[] = [
  {
    id: 'nasa-jpl-news',
    title: 'JPL News & Features',
    publisher: 'NASA Jet Propulsion Laboratory',
    description: 'Mission news, discoveries, and engineering dispatches from JPL.',
    feedUrl: 'https://www.jpl.nasa.gov/feeds/news/',
    siteUrl: 'https://www.jpl.nasa.gov/news/',
    section: 'science',
    display: 'summary',
    provenance: 'Official RSS feed published by NASA/JPL.',
  },
  {
    id: 'nasa-photojournal',
    title: 'NASA Photojournal',
    publisher: 'NASA Science',
    description: 'Newly published images and visual records from across the Solar System.',
    feedUrl: 'https://science.nasa.gov/feed/photojournal/latest-content/',
    siteUrl: 'https://science.nasa.gov/photojournal/',
    section: 'science',
    display: 'summary',
    provenance: 'Official RSS feed listed by NASA Science.',
  },
] as const

export function starterSource(id: string): StarterSource | undefined {
  return STARTER_SOURCES.find(source => source.id === id)
}
