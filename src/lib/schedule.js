import bundled from '../data/schedule-2026.json' with { type: 'json' }
import { TEAM_BY_ID, resolveTeamId } from '../data/teams.js'

export const GAME_LENGTH_MS = 3.25 * 60 * 60 * 1000 // ~3h15m from kickoff to final

/** Shape any schedule blob (bundled, imported, or fetched) into what the app uses. */
export function normalizeSchedule(raw) {
  if (!raw || !Array.isArray(raw.games)) throw new Error('Schedule has no `games` array')
  const games = []
  for (const g of raw.games) {
    const home = resolveTeamId(g.home ?? g.homeTeam ?? g.home_team)
    const away = resolveTeamId(g.away ?? g.awayTeam ?? g.away_team)
    const week = Number(g.week)
    const kickoff = g.kickoff ?? g.commence_time ?? g.date
    if (!home || !away || !Number.isFinite(week)) continue
    const kickoffMs = Date.parse(kickoff)
    if (!Number.isFinite(kickoffMs)) continue
    games.push({
      id: g.id || `${raw.season || 2026}-W${String(week).padStart(2, '0')}-${away}-${home}`,
      week,
      home,
      away,
      kickoff: new Date(kickoffMs).toISOString(),
      kickoffMs,
      slot: g.slot || '',
      neutralSite: Boolean(g.neutralSite ?? g.neutral_site),
      venue: g.venue || g.stadium || '',
      provisional: g.provisional ?? raw.provisional ?? false,
    })
  }
  if (!games.length) throw new Error('Schedule contained no usable games')
  games.sort((a, b) => a.week - b.week || a.kickoffMs - b.kickoffMs || a.id.localeCompare(b.id))

  const weeks = Math.max(raw.weeks || 0, ...games.map((g) => g.week))
  const byWeek = new Map()
  for (const g of games) {
    if (!byWeek.has(g.week)) byWeek.set(g.week, [])
    byWeek.get(g.week).push(g)
  }
  const byes = {}
  const all = Object.keys(TEAM_BY_ID)
  for (let w = 1; w <= weeks; w++) {
    const playing = new Set((byWeek.get(w) || []).flatMap((g) => [g.home, g.away]))
    byes[w] = all.filter((id) => !playing.has(id)).sort()
  }

  return {
    season: raw.season || 2026,
    weeks,
    source: raw.source || 'imported',
    provisional: Boolean(raw.provisional),
    note: raw.note || '',
    generatedAt: raw.generatedAt || null,
    games,
    byWeek,
    byes,
    byId: new Map(games.map((g) => [g.id, g])),
  }
}

export const bundledSchedule = () => normalizeSchedule(bundled)

export const kickedOff = (game, now = Date.now()) => now >= game.kickoffMs
export const likelyFinal = (game, now = Date.now()) => now >= game.kickoffMs + GAME_LENGTH_MS

/** The week to open on: the earliest week that still has a game left to finish. */
export function currentWeek(schedule, now = Date.now()) {
  for (let w = 1; w <= schedule.weeks; w++) {
    const games = schedule.byWeek.get(w) || []
    if (games.some((g) => !likelyFinal(g, now))) return w
  }
  return schedule.weeks
}

export function weekWindow(schedule, week) {
  const games = schedule.byWeek.get(week) || []
  if (!games.length) return null
  return { start: games[0].kickoffMs, end: games[games.length - 1].kickoffMs + GAME_LENGTH_MS }
}

/**
 * Pair Odds API events with scheduled games. Matching is on the team pair, with
 * kickoff used only as a tie-break - the bundled schedule's provisional times can
 * be days off, and the team pair is unique within a season anyway.
 */
export function indexEventsByGame(events, schedule, { maxDriftMs = 10 * 86400000 } = {}) {
  const map = new Map()
  for (const ev of events || []) {
    const home = resolveTeamId(ev.home_team)
    const away = resolveTeamId(ev.away_team)
    if (!home || !away) continue
    const evMs = Date.parse(ev.commence_time)
    let best = null
    for (const g of schedule.games) {
      // A neutral-site game can be listed with the sides the other way round;
      // take it, and flag it so the caller flips the sign of the spread.
      const flipped = g.home === away && g.away === home
      if (!flipped && (g.home !== home || g.away !== away)) continue
      const drift = Number.isFinite(evMs) ? Math.abs(evMs - g.kickoffMs) : 0
      if (drift > maxDriftMs) continue
      // Prefer a straight match over a flipped one at equal distance.
      const rank = drift + (flipped ? 1 : 0)
      if (!best || rank < best.rank) best = { game: g, drift, rank, flipped }
    }
    if (!best) continue
    const prior = map.get(best.game.id)
    if (prior && prior.rank <= best.rank) continue
    map.set(best.game.id, {
      event: ev,
      drift: best.drift,
      rank: best.rank,
      flipped: best.flipped,
      commenceTime: ev.commence_time,
    })
  }
  return map
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export const formatKickoff = (game) => {
  const d = new Date(game.kickoffMs)
  return `${dayFmt.format(d)} · ${timeFmt.format(d)}`
}

export const formatDayHeading = (ms) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(ms))

export const dayKey = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
