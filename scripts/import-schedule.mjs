#!/usr/bin/env node
/**
 * Builds src/data/schedule-2026.json from the nflverse schedule dataset, which is
 * the real, released NFL schedule: dates, kickoff times, neutral sites and all.
 *
 *   npm run schedule:import                        # fetch the current CSV
 *   node scripts/import-schedule.mjs --csv ./games.csv --season 2027
 *
 * Source: https://github.com/nflverse/nfldata (data/games.csv), CC BY 4.0.
 *
 * Betting columns in that file are deliberately dropped. The point of this app is
 * to guess the line, so shipping one in the repo would be shipping the answer key.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const args = process.argv.slice(2)
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const DEFAULT_CSV = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
const SEASON = Number(argOf('--season', '2026'))
const SOURCE = argOf('--csv', DEFAULT_CSV)
const OUT = resolve(ROOT, argOf('--out', 'src/data/schedule-2026.json'))

const { resolveTeamId } = await import(pathToFileURL(resolve(ROOT, 'src/data/teams.js')).href)

// ------------------------------------------------------------------- input

async function readSource(source) {
  if (!/^https?:\/\//.test(source)) return readFileSync(resolve(ROOT, source), 'utf8')
  let res
  try {
    res = await fetch(source)
  } catch (err) {
    throw new Error(`could not reach ${source} (${err.message})`, { cause: err })
  }
  if (!res.ok) throw new Error(`${source} returned ${res.status}`)
  return res.text()
}

/** Minimal CSV reader: the nflverse file quotes fields containing commas. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const header = rows.shift()
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

// ------------------------------------------------------------------ times

/** Wall-clock time in a named zone -> the corresponding UTC instant. */
function zonedTimeToUtc(zone, y, mo, d, h, mi) {
  let ts = Date.UTC(y, mo - 1, d, h, mi)
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(ts))
    const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]))
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
    const drift = asUtc - Date.UTC(y, mo - 1, d, h, mi, 0)
    if (drift === 0) break
    ts -= drift
  }
  return new Date(ts).toISOString()
}

/** The broadcast window a game sits in, from its weekday and Eastern kickoff. */
function slotLabel(weekday, hour, minute, week) {
  const t = hour * 60 + minute
  if (weekday === 'Thursday') return t >= 17 * 60 ? 'Thursday Night' : 'Thursday'
  if (weekday === 'Friday') return 'Friday'
  if (weekday === 'Saturday') return 'Saturday'
  if (weekday === 'Monday') return t >= 17 * 60 ? 'Monday Night' : 'Monday'
  if (weekday === 'Tuesday' || weekday === 'Wednesday') return weekday
  if (week === 18) return 'Week 18'
  if (t >= 19 * 60) return 'Sunday Night'
  if (t >= 15 * 60) return 'Sunday late'
  if (t < 12 * 60) return 'Sunday morning'
  return 'Sunday early'
}

// ----------------------------------------------------------------- build

const rows = parseCsv(await readSource(SOURCE))
  .filter((r) => Number(r.season) === SEASON && r.game_type === 'REG')

if (!rows.length) {
  console.error(`No ${SEASON} regular-season rows in ${SOURCE}. Is the schedule released yet?`)
  process.exit(1)
}

const games = []
const skipped = []
for (const r of rows) {
  const home = resolveTeamId(r.home_team)
  const away = resolveTeamId(r.away_team)
  const week = Number(r.week)
  const [y, mo, d] = String(r.gameday).split('-').map(Number)
  const [h, mi] = String(r.gametime).split(':').map(Number)
  if (!home || !away || !Number.isFinite(week) || ![y, mo, d, h, mi].every(Number.isFinite)) {
    skipped.push(r.game_id || `${r.away_team}@${r.home_team}`)
    continue
  }
  const neutral = r.location && r.location !== 'Home'
  games.push({
    id: `${SEASON}-W${String(week).padStart(2, '0')}-${away}-${home}`,
    week,
    away,
    home,
    // nflverse quotes kickoff in US Eastern; the app works in UTC throughout.
    kickoff: zonedTimeToUtc('America/New_York', y, mo, d, h, mi),
    slot: slotLabel(r.weekday, h, mi, week),
    ...(neutral ? { neutralSite: true, venue: r.stadium || '' } : {}),
  })
}

// ------------------------------------------------------------- validate

const problems = []
if (skipped.length) problems.push(`could not read ${skipped.length} rows: ${skipped.slice(0, 5).join(', ')}`)
const perTeam = {}
for (const g of games) {
  perTeam[g.home] = (perTeam[g.home] || 0) + 1
  perTeam[g.away] = (perTeam[g.away] || 0) + 1
}
if (Object.keys(perTeam).length !== 32) problems.push(`saw ${Object.keys(perTeam).length} teams, expected 32`)
const wrong = Object.entries(perTeam).filter(([, n]) => n !== 17)
if (wrong.length) problems.push(`teams without 17 games: ${wrong.map(([t, n]) => `${t}(${n})`).join(', ')}`)
if (games.length !== 272) problems.push(`${games.length} games, expected 272`)
const seen = new Set()
for (const g of games) {
  for (const team of [g.home, g.away]) {
    const key = `${team}|${g.week}`
    if (seen.has(key)) problems.push(`${team} plays twice in week ${g.week}`)
    seen.add(key)
  }
}

if (problems.length) {
  console.error('Not writing the file - this does not look like a complete season:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

games.sort((a, b) => a.week - b.week || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))
const weeks = Math.max(...games.map((g) => g.week))

writeFileSync(OUT, `${JSON.stringify({
  season: SEASON,
  seasonType: 'regular',
  weeks,
  generatedAt: new Date().toISOString(),
  source: 'nflverse',
  sourceUrl: SOURCE,
  provisional: false,
  note: 'Released NFL schedule, imported from the nflverse dataset (CC BY 4.0). Betting columns are intentionally not included.',
  games,
}, null, 2)}\n`)

const perWeek = {}
for (const g of games) perWeek[g.week] = (perWeek[g.week] || 0) + 1
console.log(`Wrote ${games.length} games over ${weeks} weeks to ${OUT}`)
console.log('Games per week:', Object.entries(perWeek).map(([w, n]) => `${w}:${n}`).join(' '))
console.log(`Neutral sites: ${games.filter((g) => g.neutralSite).length}`)
