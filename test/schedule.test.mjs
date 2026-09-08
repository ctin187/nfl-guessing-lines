import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bundledSchedule, currentWeek, indexEventsByGame, kickedOff, likelyFinal, normalizeSchedule,
} from '../src/lib/schedule.js'
import { TEAM_BY_ID, resolveTeamId } from '../src/data/teams.js'

const schedule = bundledSchedule()

test('the bundled schedule is a complete 18-week regular season', () => {
  assert.equal(schedule.season, 2026)
  assert.equal(schedule.weeks, 18)
  assert.equal(schedule.games.length, 272)
  const per = {}
  for (const g of schedule.games) {
    per[g.home] = (per[g.home] || 0) + 1
    per[g.away] = (per[g.away] || 0) + 1
  }
  assert.equal(Object.keys(per).length, 32)
  for (const [team, n] of Object.entries(per)) assert.equal(n, 17, `${team} plays ${n}`)
})

test('no team is booked twice in a week, and every team gets exactly one bye', () => {
  const seen = new Set()
  for (const g of schedule.games) {
    for (const team of [g.home, g.away]) {
      const key = `${team}|${g.week}`
      assert.ok(!seen.has(key), `${team} plays twice in week ${g.week}`)
      seen.add(key)
    }
  }
  const byeCount = {}
  for (let w = 1; w <= schedule.weeks; w++) {
    for (const team of schedule.byes[w]) byeCount[team] = (byeCount[team] || 0) + 1
  }
  assert.equal(Object.keys(byeCount).length, 32)
  for (const [team, n] of Object.entries(byeCount)) assert.equal(n, 1, `${team} has ${n} byes`)
})

test('every matchup is unique and division rivals meet home and away', () => {
  const pairs = new Set()
  for (const g of schedule.games) {
    const key = `${g.away}@${g.home}`
    assert.ok(!pairs.has(key), `duplicate ${key}`)
    pairs.add(key)
  }
  for (const g of schedule.games) {
    if (g.kind !== 'division') continue
    assert.ok(pairs.has(`${g.home}@${g.away}`), `${g.away}@${g.home} has no return fixture`)
  }
})

test('normalizeSchedule accepts loose imports and rejects empty ones', () => {
  const s = normalizeSchedule({
    season: 2026,
    games: [
      { week: 1, away: 'Dallas Cowboys', home: 'PHI', kickoff: '2026-09-11T00:20:00Z' },
      { week: 1, away: 'KC', home: 'Denver Broncos', commence_time: '2026-09-13T17:00:00Z' },
      { week: 2, away: 'nonsense', home: 'PHI', kickoff: '2026-09-18T00:20:00Z' },
      { week: 3, away: 'KC', home: 'PHI', kickoff: 'not a date' },
    ],
  })
  assert.equal(s.games.length, 2)
  assert.equal(s.games[0].away, 'DAL')
  assert.equal(s.games[1].home, 'DEN')
  assert.equal(s.byes[1].length, 32 - 4)
  assert.throws(() => normalizeSchedule({ games: [] }), /no usable games/)
  assert.throws(() => normalizeSchedule(null), /games/)
})

test('kickoff gating: locked at kickoff, revealable once the game is over', () => {
  const game = { kickoffMs: Date.parse('2026-09-13T17:00:00Z') }
  const before = game.kickoffMs - 1000
  const during = game.kickoffMs + 60 * 60 * 1000
  const after = game.kickoffMs + 4 * 60 * 60 * 1000
  assert.equal(kickedOff(game, before), false)
  assert.equal(kickedOff(game, during), true)
  assert.equal(likelyFinal(game, during), false)
  assert.equal(likelyFinal(game, after), true)
})

test('currentWeek lands on the first week that still has a game to finish', () => {
  const wk3 = schedule.byWeek.get(3)
  const midWeek3 = wk3[0].kickoffMs + 1000
  assert.equal(currentWeek(schedule, midWeek3), 3)
  const beforeSeason = schedule.games[0].kickoffMs - 86400000
  assert.equal(currentWeek(schedule, beforeSeason), 1)
  const afterSeason = schedule.games[schedule.games.length - 1].kickoffMs + 10 * 86400000
  assert.equal(currentWeek(schedule, afterSeason), 18)
})

const teamName = (id) => TEAM_BY_ID[id].name
const asEvent = (game, { flip = false, drift = 0 } = {}) => ({
  id: `ev-${game.id}`,
  commence_time: new Date(game.kickoffMs + drift).toISOString(),
  home_team: teamName(flip ? game.away : game.home),
  away_team: teamName(flip ? game.home : game.away),
  bookmakers: [],
})

test('events match their scheduled game even when kickoff times drift', () => {
  const game = schedule.byWeek.get(4)[0]
  const matched = indexEventsByGame([asEvent(game, { drift: 3 * 86400000 })], schedule)
  assert.equal(matched.size, 1)
  assert.equal(matched.get(game.id).flipped, false)
})

test('a game listed with the sides reversed is matched and flagged', () => {
  const game = schedule.byWeek.get(5)[0]
  const matched = indexEventsByGame([asEvent(game, { flip: true })], schedule)
  assert.equal(matched.get(game.id).flipped, true)
})

test('unmatched or unknown events are dropped rather than guessed at', () => {
  assert.equal(indexEventsByGame([{ home_team: 'Toronto Argonauts', away_team: 'BC Lions' }], schedule).size, 0)
  const game = schedule.byWeek.get(2)[0]
  assert.equal(indexEventsByGame([asEvent(game, { drift: 40 * 86400000 })], schedule).size, 0)
})

test('team resolution copes with the shared-market clubs', () => {
  assert.equal(resolveTeamId('New York Jets'), 'NYJ')
  assert.equal(resolveTeamId('New York Giants'), 'NYG')
  assert.equal(resolveTeamId('Los Angeles Rams'), 'LAR')
  assert.equal(resolveTeamId('Los Angeles Chargers'), 'LAC')
  assert.equal(resolveTeamId('Washington Commanders'), 'WAS')
  assert.equal(resolveTeamId('New York'), null)
})
