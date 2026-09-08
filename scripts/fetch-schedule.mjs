#!/usr/bin/env node
/**
 * Replaces src/data/schedule-2026.json with the real schedule from ESPN's public
 * scoreboard API (no key required), once the league has released it.
 *
 *   npm run schedule:fetch            # 2026 regular season
 *   node scripts/fetch-schedule.mjs --season 2027 --weeks 18
 *
 * Heads up: this was written against ESPN's documented response shape but could not
 * be run where this repo was built (that sandbox had no outbound network), so treat
 * the first run as a check. It validates what it gets before writing, and refuses to
 * overwrite a good file with a short or malformed season.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const args = process.argv.slice(2)
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const SEASON = Number(argOf('--season', '2026'))
const WEEKS = Number(argOf('--weeks', '18'))
const OUT = resolve(ROOT, argOf('--out', 'src/data/schedule-2026.json'))
const ENDPOINT = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

const { TEAMS, resolveTeamId } = await import(pathToFileURL(resolve(ROOT, 'src/data/teams.js')).href)
const byAbbr = new Map()
for (const t of TEAMS) {
  byAbbr.set(t.id.toUpperCase(), t.id)
  byAbbr.set(t.name.toLowerCase(), t.id)
}
// ESPN's abbreviations differ from ours for a handful of clubs.
for (const [espn, ours] of Object.entries({ WSH: 'WAS', LAR: 'LAR', LAC: 'LAC', LV: 'LV', JAX: 'JAX', GB: 'GB', KC: 'KC', NE: 'NE', NO: 'NO', SF: 'SF', TB: 'TB' })) {
  byAbbr.set(espn, ours)
}
const resolveTeam = (competitor) => {
  const t = competitor?.team || {}
  return (
    byAbbr.get(String(t.abbreviation || '').toUpperCase()) ||
    byAbbr.get(String(t.displayName || '').toLowerCase()) ||
    resolveTeamId(t.displayName || t.location || '') ||
    null
  )
}

async function getWeek(week) {
  const url = `${ENDPOINT}?dates=${SEASON}&seasontype=2&week=${week}&limit=100`
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    throw new Error(`week ${week}: could not reach ${ENDPOINT} (${err.message}). Check your network or proxy.`)
  }
  if (!res.ok) throw new Error(`week ${week}: ESPN returned ${res.status} for ${url}`)
  const body = await res.json()
  const out = []
  for (const event of body.events || []) {
    const comp = event.competitions?.[0]
    const competitors = comp?.competitors || []
    const homeC = competitors.find((c) => c.homeAway === 'home')
    const awayC = competitors.find((c) => c.homeAway === 'away')
    const home = resolveTeam(homeC)
    const away = resolveTeam(awayC)
    const kickoff = comp?.date || event.date
    if (!home || !away || !kickoff) {
      console.warn(`  skipped an event in week ${week}: ${event.name || event.id}`)
      continue
    }
    out.push({
      id: `${SEASON}-W${String(week).padStart(2, '0')}-${away}-${home}`,
      week,
      away,
      home,
      kickoff: new Date(kickoff).toISOString(),
      slot: comp?.notes?.[0]?.headline || '',
      neutralSite: Boolean(comp?.neutralSite),
      provisional: false,
    })
  }
  return out
}

const games = []
for (let week = 1; week <= WEEKS; week++) {
  process.stdout.write(`week ${week}… `)
  const weekGames = await getWeek(week)
  console.log(`${weekGames.length} games`)
  games.push(...weekGames)
}

// Refuse to write something obviously incomplete over a working file.
const perTeam = {}
for (const g of games) {
  perTeam[g.home] = (perTeam[g.home] || 0) + 1
  perTeam[g.away] = (perTeam[g.away] || 0) + 1
}
const problems = []
if (games.length < 200) problems.push(`only ${games.length} games came back`)
const short = Object.entries(perTeam).filter(([, n]) => n !== 17)
if (short.length) problems.push(`teams without 17 games: ${short.map(([t, n]) => `${t}(${n})`).join(', ')}`)
if (Object.keys(perTeam).length !== 32) problems.push(`saw ${Object.keys(perTeam).length} teams, expected 32`)

if (problems.length) {
  console.error('\nNot writing the file - the response does not look like a full season:')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nThe schedule may not be released yet. Re-run once it is.')
  process.exit(1)
}

games.sort((a, b) => a.week - b.week || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))
writeFileSync(OUT, `${JSON.stringify({
  season: SEASON,
  seasonType: 'regular',
  weeks: WEEKS,
  generatedAt: new Date().toISOString(),
  source: 'espn',
  provisional: false,
  note: 'Fetched from ESPN\'s public scoreboard API.',
  games,
}, null, 2)}\n`)
console.log(`\nWrote ${games.length} games to ${OUT}`)
