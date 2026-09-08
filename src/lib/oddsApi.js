// Client for The Odds API (https://the-odds-api.com/). A free key covers
// everything this app asks for.

const BASE = 'https://api.the-odds-api.com/v4'
export const SPORT = 'americanfootball_nfl'

export class OddsApiError extends Error {
  constructor(code, message, { status, quota, retryAfter } = {}) {
    super(message)
    this.name = 'OddsApiError'
    this.code = code
    this.status = status
    this.quota = quota
    this.retryAfter = retryAfter
  }
}

function readQuota(res) {
  const num = (h) => {
    const v = res.headers.get(h)
    return v === null || v === '' ? null : Number(v)
  }
  const remaining = num('x-requests-remaining')
  const used = num('x-requests-used')
  const last = num('x-requests-last')
  if (remaining === null && used === null) return null
  return { remaining, used, last, at: Date.now() }
}

async function request(path, params, { signal, timeoutMs = 12000 } = {}) {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  // Keep a slow mobile connection from hanging the UI forever.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onOuterAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onOuterAbort, { once: true })

  let res
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    if (signal?.aborted) throw new OddsApiError('aborted', 'Request cancelled')
    if (err?.name === 'AbortError') {
      throw new OddsApiError('timeout', 'The Odds API took too long to answer. Try again.')
    }
    throw new OddsApiError(
      'network',
      'Could not reach The Odds API. Check your connection and try again.',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }

  const quota = readQuota(res)
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.message || body?.error_code || ''
    } catch { /* body may not be JSON */ }

    if (res.status === 401) {
      throw new OddsApiError('auth', detail || 'That API key was rejected. Check it in Settings.', { status: 401, quota })
    }
    if (res.status === 422) {
      throw new OddsApiError('params', detail || 'The Odds API rejected those parameters.', { status: 422, quota })
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || null
      throw new OddsApiError('rate_limit', detail || 'Rate limited by The Odds API. Wait a moment and retry.', { status: 429, quota, retryAfter })
    }
    if (res.status === 402) {
      throw new OddsApiError('plan', detail || 'That request needs a paid Odds API plan.', { status: res.status, quota })
    }
    if (res.status >= 500) {
      throw new OddsApiError('server', 'The Odds API is having trouble right now. Try again shortly.', { status: res.status, quota })
    }
    throw new OddsApiError('http', detail || `The Odds API returned ${res.status}.`, { status: res.status, quota })
  }

  if (quota && quota.remaining !== null && quota.remaining <= 0) {
    // Still return the payload; the caller surfaces the warning.
  }
  const data = await res.json()
  return { data, quota }
}

/** Spreads for games that have not finished yet. Costs 1 credit per region+market. */
export async function fetchUpcomingSpreads({ apiKey, regions = 'us', oddsFormat = 'decimal', bookmakers, signal }) {
  if (!apiKey) throw new OddsApiError('auth', 'Add your Odds API key in Settings first.')
  const { data, quota } = await request(
    `/sports/${SPORT}/odds`,
    { apiKey, regions: bookmakers ? undefined : regions, bookmakers, markets: 'spreads', oddsFormat, dateFormat: 'iso' },
    { signal },
  )
  return { events: Array.isArray(data) ? data : [], quota }
}

/** Scores and completion flags. `daysFrom` (1-3 on the free tier) reaches back in time. */
export async function fetchScores({ apiKey, daysFrom = 3, signal }) {
  if (!apiKey) throw new OddsApiError('auth', 'Add your Odds API key in Settings first.')
  const { data, quota } = await request(
    `/sports/${SPORT}/scores`,
    { apiKey, daysFrom, dateFormat: 'iso' },
    { signal },
  )
  return { events: Array.isArray(data) ? data : [], quota }
}

/** Cheap key check: /sports costs no credits. */
export async function verifyKey({ apiKey, signal }) {
  if (!apiKey) throw new OddsApiError('auth', 'Enter a key first.')
  const { data, quota } = await request('/sports', { apiKey }, { signal })
  return { sports: Array.isArray(data) ? data.length : 0, quota }
}
