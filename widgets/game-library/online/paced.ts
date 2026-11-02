// widgets/game-library/online/paced.ts
//
// Requests to one web service, made gently (0.4.0, Phase 3; modelled on the Video Club's TMDB session): a least
// time between two starts, a few in flight at once, "too many requests" waited out (2, 4, 8, 16, 30 s), a 5xx or a
// dropped connection retried (1, 3, 9 s). GEM Shell refusing (the Network permission, a secret) and the service
// refusing the key stop the run: OnlineFatalError. A 404 answers null (the service doesn't know that game).
// GEM Shell's networkFetch rejects an answer that isn't 2xx ("HTTP 404: Not Found", 0.6.1): read as that status.

export type FetchResponse = { ok: boolean; status: number; statusText: string; json: () => Promise<any> }
/** part (0.11.0, GEM Shell part C2): a client-credentials secret's client id or access token (IGDB's). */
export type HeaderValue = string | { secret: string; format?: string; part?: 'clientId' | 'token' }
export type FetchPort = {
  networkFetch?: (url: string, options?: { method?: string; headers?: Record<string, HeaderValue>; body?: string }) => Promise<FetchResponse>
}

/** "HTTP 404: Not Found" (GEM Shell's rejection of an answer that isn't 2xx): 404. */
export function httpStatusOf(message: string): number | undefined {
  const m = /^HTTP (\d{3})\b/.exec(message)
  return m ? Number(m[1]) : undefined
}

/** A failure worth stopping for: the permission, the key. `service` says whose. */
export class OnlineFatalError extends Error {
  readonly service: string
  constructor(message: string, service: string) { super(message); this.service = service }
}

export type PacedOptions = {
  /** The service's name in messages ("Steam", "SteamGridDB"). */
  service: string
  minGapMs: number
  concurrency?: number
  headers?: Record<string, HeaderValue>
  /** Statuses meaning the key was refused (401 / 403 for SteamGridDB). */
  fatalStatuses?: number[]
  sleep?: (ms: number) => Promise<void>
}

export type PacedSession = ReturnType<typeof createPaced>

export function createPaced(port: FetchPort, options: PacedOptions) {
  const concurrency = Math.max(1, options.concurrency ?? 1)
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  let nextStart = 0
  let active = 0
  const waiting: Array<() => void> = []
  let requests = 0

  async function slot() {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve))
    active += 1
    const now = Date.now()
    const start = Math.max(now, nextStart)
    nextStart = start + options.minGapMs
    if (start > now) await sleep(start - now)
  }
  function release() {
    active -= 1
    waiting.shift()?.()
  }

  /** One request (a GET, or init's POST with a body: IGDB's), paced and retried: its JSON, or null for a 404. */
  async function json<T>(url: string, init?: { method?: string; body?: string }): Promise<T | null> {
    if (!port.networkFetch) throw new OnlineFatalError('GEM Shell gave this widget no network access.', options.service)
    const rateWaits = [2000, 4000, 8000, 16000, 30000]
    const errorWaits = [1000, 3000, 9000]
    let rateTries = 0
    let errorTries = 0
    for (;;) {
      await slot()
      let response: FetchResponse
      try {
        requests += 1
        response = await port.networkFetch(url, { ...(init?.method ? { method: init.method } : {}), ...(init?.body !== undefined ? { body: init.body } : {}), headers: { accept: 'application/json', ...options.headers } })
        release()
      } catch (error) {
        release()
        const code = (error as { code?: string } | null)?.code ?? ''
        const message = error instanceof Error ? error.message : String(error)
        // GEM Shell refused (the permission, the secret): no retry
        if (/^E_(?:SECRET|PERMISSION|DENIED|NEEDS)/.test(code) || /^E_(?:SECRET|PERMISSION|DENIED|NEEDS)/.test(message)
          || /permission (?:denied|not granted)/i.test(message)) {
          throw new OnlineFatalError(message, options.service)
        }
        const status = httpStatusOf(message)
        if (status === undefined) {
          if (errorTries >= errorWaits.length) throw error
          await sleep(errorWaits[errorTries++])
          continue
        }
        // The service answered, with an error: handled as its status below
        response = { ok: false, status, statusText: message.replace(/^HTTP \d{3}:?\s*/, ''), json: async () => null }
      }
      if (response.ok) return response.json() as Promise<T>
      if (response.status === 404) return null
      if (options.fatalStatuses?.includes(response.status)) {
        throw new OnlineFatalError(`${options.service} refused the request (${response.status} ${response.statusText}).`, options.service)
      }
      if (response.status === 429 && rateTries < rateWaits.length) {
        console.info(`[game-library] ${options.service} asked to slow down; waiting ${rateWaits[rateTries] / 1000} s.`)
        await sleep(rateWaits[rateTries++])
        continue
      }
      if (response.status >= 500 && errorTries < errorWaits.length) {
        await sleep(errorWaits[errorTries++])
        continue
      }
      throw new Error(`${options.service} request failed (${response.status} ${response.statusText}).`)
    }
  }

  return { json, requests: () => requests }
}
