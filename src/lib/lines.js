// Everything in this app speaks one convention: a spread is quoted from the HOME
// team's point of view. -3.5 means the home team lays 3.5; +3.5 means it gets 3.5;
// 0 is a pick'em. Guesses, consensus lines and deltas all live in that space.

/** Parse user input or an API value into a home-team spread, or null. */
export function parseSpread(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'pk' || raw === "pick" || raw === "pick'em" || raw === 'ev') return 0
  const cleaned = raw.replace(/[−–—]/g, '-').replace(/\s+/g, '')
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** True while a string is a plausible in-progress edit ("-", "-3.", "+"). */
export function isPartialSpread(input) {
  const raw = String(input ?? '').trim().replace(/[−–—]/g, '-')
  return raw === '' || /^[+-]?(\d+\.?\d*|\.\d*)?$/.test(raw)
}

/** Format a spread with an explicit sign: -3.5, +7, PK. */
export function formatSpread(value, { pk = 'PK' } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  if (rounded === 0) return pk
  const abs = Math.abs(rounded)
  const digits = Number.isInteger(abs) ? 0 : Number.isInteger(abs * 10) ? 1 : 2
  return `${rounded < 0 ? '-' : '+'}${abs.toFixed(digits)}`
}

/** Plain-language read of a spread, e.g. "KC by 3.5". */
export function describeSpread(value, { home, away }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const rounded = Math.round(value * 100) / 100
  if (rounded === 0) return 'Pick’em'
  const abs = Math.abs(rounded)
  const digits = Number.isInteger(abs) ? 0 : Number.isInteger(abs * 10) ? 1 : 2
  return `${rounded < 0 ? home : away} by ${abs.toFixed(digits)}`
}

export const TICK = 0.5
export const clampSpread = (v) => Math.max(-60, Math.min(60, v))
export const stepSpread = (v, dir) =>
  clampSpread(Math.round(((v ?? 0) + dir * TICK) * 2) / 2)

/**
 * Consensus across bookmakers for one event, from the API's `bookmakers` array.
 * Returns the median home spread (books disagree by half-points constantly, and
 * the median is far less sensitive to one outlier book than the mean is).
 */
export function consensusFromBookmakers(bookmakers, homeTeamName, { onlyBooks } = {}) {
  const points = []
  const perBook = []
  for (const book of bookmakers || []) {
    if (onlyBooks?.length && !onlyBooks.includes(book.key)) continue
    const market = (book.markets || []).find((m) => m.key === 'spreads')
    if (!market) continue
    const outcome = (market.outcomes || []).find((o) => o.name === homeTeamName)
    if (!outcome || !Number.isFinite(Number(outcome.point))) continue
    const point = Number(outcome.point)
    points.push(point)
    perBook.push({ key: book.key, title: book.title, point, updatedAt: market.last_update })
  }
  if (!points.length) return null
  const sorted = points.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const mean = points.reduce((a, b) => a + b, 0) / points.length
  return {
    line: Math.round(median * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    books: points.length,
    perBook,
  }
}

const TIERS = [
  { max: 0.25, key: 'exact', label: 'Exact' },
  { max: 1.0, key: 'sharp', label: 'Sharp' },
  { max: 2.5, key: 'close', label: 'Close' },
  { max: 6.0, key: 'wide', label: 'Wide' },
  { max: Infinity, key: 'miss', label: 'Miss' },
]

/** Compare a guess with the revealed consensus. */
export function gradeGuess(guess, actual) {
  if (!Number.isFinite(guess) || !Number.isFinite(actual)) return null
  const delta = Math.round((guess - actual) * 100) / 100
  const error = Math.abs(delta)
  const tier = TIERS.find((t) => error <= t.max)
  const wrongSide = Math.sign(guess) !== 0 && Math.sign(actual) !== 0 &&
    Math.sign(guess) !== Math.sign(actual)
  let label
  if (tier.key === 'exact') label = 'Exact'
  else {
    const digits = Number.isInteger(error) ? 0 : Number.isInteger(error * 10) ? 1 : 2
    label = `Off by ${error.toFixed(digits)}`
  }
  return { delta, error, tier: tier.key, tierLabel: tier.label, label, wrongSide }
}

/** Roll a week's graded games into one line of scoreboard. */
export function summarize(graded) {
  const scored = graded.filter(Boolean)
  if (!scored.length) return null
  const errors = scored.map((g) => g.error)
  const total = errors.reduce((a, b) => a + b, 0)
  const sorted = errors.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return {
    count: scored.length,
    avgError: Math.round((total / scored.length) * 100) / 100,
    medianError:
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    exact: scored.filter((g) => g.tier === 'exact').length,
    withinOne: scored.filter((g) => g.error <= 1).length,
    wrongSide: scored.filter((g) => g.wrongSide).length,
    best: Math.min(...errors),
    worst: Math.max(...errors),
  }
}

/** Mirror a consensus so it reads from the other team's side. */
export function flipConsensus(c) {
  if (!c) return c
  return {
    ...c,
    line: -c.line,
    mean: -c.mean,
    min: -c.max,
    max: -c.min,
    perBook: c.perBook.map((b) => ({ ...b, point: -b.point })),
  }
}
