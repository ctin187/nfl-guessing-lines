#!/usr/bin/env node
/**
 * Builds src/data/schedule-2026.json.
 *
 * What is real here: the opponent set. The NFL's scheduling formula is public and
 * deterministic, so every team's 17 opponents for 2026 fall out of it -
 *   6  home-and-home inside the division
 *   4  vs one other division in the same conference   (3-year rotation)
 *   4  vs one division in the other conference        (4-year rotation)
 *   2  vs the two remaining same-conference divisions, matched on 2025 finish
 *   1  vs the other conference, matched on 2025 finish (the 17th game)
 *
 * What is NOT real here: which week each matchup lands in, and its kickoff time.
 * That is the league's own output and cannot be derived. This script assigns weeks
 * with a seeded scheduler and marks every game `provisional: true`. Replace the
 * whole file with real data via `npm run schedule:fetch`, or import a schedule in
 * the app's settings sheet, whenever you have the released schedule to hand.
 *
 * Usage: node scripts/build-schedule.mjs [--seed 2026] [--out path]
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
const SEED = Number(argOf('--seed', '20260910'))
const OUT = resolve(ROOT, argOf('--out', 'src/data/schedule-2026.json'))

const DIV_ORDER = ['East', 'North', 'South', 'West']
const CONFS = ['AFC', 'NFC']

// ---------------------------------------------------------------- teams

const { TEAMS, TEAM_BY_ID: byId } = await import(pathToFileURL(resolve(ROOT, 'src/data/teams.js')).href)
const divisionKey = (t) => `${t.conf} ${t.div}`

const standings = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/standings-2025.json'), 'utf8'),
)
/** divisionKey -> [team ids, 1st through 4th] */
const ORDER = {}
for (const conf of CONFS) {
  for (const div of DIV_ORDER) {
    const key = `${conf} ${div}`
    const ids = standings[key]
    if (!Array.isArray(ids) || ids.length !== 4) {
      throw new Error(`standings-2025.json: "${key}" must list exactly 4 team ids`)
    }
    for (const id of ids) {
      if (!byId[id]) throw new Error(`standings-2025.json: unknown team id "${id}"`)
      if (divisionKey(byId[id]) !== key) {
        throw new Error(`standings-2025.json: ${id} is not in ${key}`)
      }
    }
    ORDER[key] = ids
  }
}

// ------------------------------------------------------- 2026 rotations

// Same-conference rotation, on a 3-year cycle. 2023 East-West / North-South,
// 2024 East-South / North-West, 2025 East-North / South-West -> 2026 repeats 2023.
const INTRA_2026 = { East: 'West', West: 'East', North: 'South', South: 'North' }

// Cross-conference rotation, on a 4-year cycle. Each AFC division's NFC opponent
// advances one step a year; 2025 was E-S / N-N / S-W / W-E, so 2026 is:
const INTER_2026 = { East: 'North', North: 'South', South: 'East', West: 'West' }

// The 17th game pairs divisions that do not already meet in INTER_2026, matched on
// order of finish. The league's published rotation for it is not derivable, so this
// pairing is one of the provisional parts of the file.
const SEVENTEENTH_2026 = { East: 'East', North: 'North', South: 'West', West: 'South' }
// The conference hosting the 17th game alternates every year; the NFC hosts in 2026.
const SEVENTEENTH_HOST_CONF = 'NFC'

for (const [a, b] of Object.entries(INTER_2026)) {
  if (SEVENTEENTH_2026[a] === b) {
    throw new Error(`17th-game pairing for AFC ${a} duplicates the 4-game rotation`)
  }
}

// ------------------------------------------------------------ matchups

/** @type {{home:string, away:string, kind:string}[]} */
const matchups = []
const add = (home, away, kind) => matchups.push({ home, away, kind })

// 1. Division: home-and-home.
for (const conf of CONFS) {
  for (const div of DIV_ORDER) {
    const ids = ORDER[`${conf} ${div}`]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        add(ids[i], ids[j], 'division')
        add(ids[j], ids[i], 'division')
      }
    }
  }
}

// 2 + 3. The two four-game blocks. Within a block each team plays all four
// opponents, two at home and two away: A[i] hosts B[j] when i + j is even.
const blockGames = (aIds, bIds, kind) => {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2 === 0) add(aIds[i], bIds[j], kind)
      else add(bIds[j], aIds[i], kind)
    }
  }
}

for (const conf of CONFS) {
  const seen = new Set()
  for (const div of DIV_ORDER) {
    const other = INTRA_2026[div]
    const pair = [div, other].sort().join('|')
    if (seen.has(pair)) continue
    seen.add(pair)
    blockGames(ORDER[`${conf} ${div}`], ORDER[`${conf} ${other}`], 'intraconference')
  }
}
for (const div of DIV_ORDER) {
  blockGames(ORDER[`AFC ${div}`], ORDER[`NFC ${INTER_2026[div]}`], 'interconference')
}

// 4. Two same-conference games against the divisions left over, matched on finish.
// Those leftover pairings form a 4-cycle across the divisions, so alternating
// hosts around the cycle gives every division exactly one home and one away game.
for (const conf of CONFS) {
  const pairs = []
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (INTRA_2026[DIV_ORDER[i]] !== DIV_ORDER[j]) pairs.push([DIV_ORDER[i], DIV_ORDER[j]])
    }
  }
  // The four leftover pairings always form a 4-cycle across the divisions.
  const adjacency = new Map(DIV_ORDER.map((d) => [d, []]))
  for (const [a, b] of pairs) {
    adjacency.get(a).push(b)
    adjacency.get(b).push(a)
  }
  const cycle = [DIV_ORDER.find((d) => adjacency.get(d).length === 2)]
  while (cycle.length < 4) {
    const cur = cycle[cycle.length - 1]
    const prev = cycle[cycle.length - 2]
    cycle.push(adjacency.get(cur).find((d) => d !== prev))
  }
  // Orienting every edge the same way round the cycle gives each division exactly
  // one home and one away game out of its two leftover pairings.
  for (let k = 0; k < 4; k++) {
    const host = cycle[k]
    const visitor = cycle[(k + 1) % 4]
    for (let rank = 0; rank < 4; rank++) {
      add(ORDER[`${conf} ${host}`][rank], ORDER[`${conf} ${visitor}`][rank], 'standings')
    }
  }
}

// 5. The 17th game.
for (const div of DIV_ORDER) {
  const afc = ORDER[`AFC ${div}`]
  const nfc = ORDER[`NFC ${SEVENTEENTH_2026[div]}`]
  for (let rank = 0; rank < 4; rank++) {
    if (SEVENTEENTH_HOST_CONF === 'NFC') add(nfc[rank], afc[rank], 'seventeenth')
    else add(afc[rank], nfc[rank], 'seventeenth')
  }
}

// ------------------------------------------------------------ validate

const counts = Object.fromEntries(TEAMS.map((t) => [t.id, { total: 0, home: 0, away: 0 }]))
const seenPairs = new Map()
for (const g of matchups) {
  counts[g.home].total++
  counts[g.home].home++
  counts[g.away].total++
  counts[g.away].away++
  const key = `${g.away}@${g.home}`
  seenPairs.set(key, (seenPairs.get(key) || 0) + 1)
}
for (const [k, n] of seenPairs) if (n > 1) throw new Error(`duplicate matchup ${k}`)
for (const t of TEAMS) {
  const c = counts[t.id]
  if (c.total !== 17) throw new Error(`${t.id} has ${c.total} games, expected 17`)
  const wantHome = t.conf === SEVENTEENTH_HOST_CONF ? 9 : 8
  if (c.home !== wantHome) throw new Error(`${t.id} has ${c.home} home games, expected ${wantHome}`)
}
if (matchups.length !== 272) throw new Error(`${matchups.length} games, expected 272`)

// --------------------------------------------------------- week layout

function mulberry32(a) {
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shuffled = (arr, rng) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const WEEKS = 18
// Byes run weeks 5-14. Each week's bye count must be even so the remaining teams
// pair up exactly; these ten counts sum to 32, one bye per team.
const BYE_PLAN = { 5: 2, 6: 2, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4, 12: 4, 13: 2, 14: 2 }

/** Assign byes, then decompose the 272 matchups into 18 weekly perfect matchings. */
function layOutWeeks(seed) {
  const rng = mulberry32(seed)
  const byeWeekOf = {}
  const pool = shuffled(TEAMS.map((t) => t.id), rng)
  let cursor = 0
  for (const [week, n] of Object.entries(BYE_PLAN)) {
    for (let i = 0; i < n; i++) byeWeekOf[pool[cursor++]] = Number(week)
  }

  const remaining = new Set(matchups.map((_, i) => i))
  const weekOf = new Array(matchups.length).fill(0)

  for (let week = 1; week <= WEEKS; week++) {
    const active = new Set(TEAMS.map((t) => t.id).filter((id) => byeWeekOf[id] !== week))
    // Candidate games for this week: both teams still active and not yet scheduled here.
    const candidates = [...remaining].filter(
      (i) => active.has(matchups[i].home) && active.has(matchups[i].away),
    )
    const optionsFor = new Map([...active].map((id) => [id, []]))
    for (const i of candidates) {
      optionsFor.get(matchups[i].home).push(i)
      optionsFor.get(matchups[i].away).push(i)
    }
    for (const [, list] of optionsFor) shuffleInPlace(list, rng)

    const picked = []
    const used = new Set()
    if (!match(active, optionsFor, used, picked)) return null
    for (const i of picked) {
      weekOf[i] = week
      remaining.delete(i)
    }
  }
  if (remaining.size) return null
  return { weekOf, byeWeekOf }
}

function shuffleInPlace(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
}

/** Exact backtracking search for a perfect matching over `active`, most-constrained first. */
function match(active, optionsFor, used, picked) {
  let pivot = null
  let best = Infinity
  for (const id of active) {
    if (used.has(id)) continue
    const open = optionsFor.get(id).filter((i) => {
      const g = matchups[i]
      return !used.has(g.home) && !used.has(g.away)
    })
    if (open.length < best) {
      best = open.length
      pivot = { id, open }
      if (best === 0) break
    }
  }
  if (!pivot) return true // everyone paired
  if (best === 0) return false
  for (const i of pivot.open) {
    const g = matchups[i]
    used.add(g.home)
    used.add(g.away)
    picked.push(i)
    if (match(active, optionsFor, used, picked)) return true
    picked.pop()
    used.delete(g.home)
    used.delete(g.away)
  }
  return false
}

let layout = null
for (let attempt = 0; attempt < 400 && !layout; attempt++) {
  layout = layOutWeeks(SEED + attempt * 7919)
}
if (!layout) throw new Error('could not lay out a valid 18-week schedule')

// ------------------------------------------------------------- kickoffs

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

// The 2026 opener is the Thursday after Labor Day (7 Sep 2026), so week 1 Thursday
// is 10 Sep 2026 and each later week shifts by seven days.
const WEEK1_THURSDAY = Date.UTC(2026, 8, 10)
const dayOfWeek = (week, offsetDays) => {
  const d = new Date(WEEK1_THURSDAY + (week - 1) * 7 * 86400000 + offsetDays * 86400000)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

const SLOTS = {
  TNF: { label: 'Thursday Night', offset: 0, h: 20, mi: 15 },
  SUN_EARLY: { label: 'Sunday early', offset: 3, h: 13, mi: 0 },
  SUN_LATE: { label: 'Sunday late', offset: 3, h: 16, mi: 25 },
  SNF: { label: 'Sunday Night', offset: 3, h: 20, mi: 20 },
  MNF: { label: 'Monday Night', offset: 4, h: 20, mi: 15 },
  SAT: { label: 'Saturday', offset: 2, h: 16, mi: 30 },
  W18: { label: 'Week 18', offset: 3, h: 16, mi: 25 },
}

const games = []
const rng = mulberry32(SEED ^ 0x5f3759df)
for (let week = 1; week <= WEEKS; week++) {
  const idx = matchups.map((_, i) => i).filter((i) => layout.weekOf[i] === week)
  const ordered = shuffled(idx, rng)
  ordered.forEach((i, n) => {
    const g = matchups[i]
    let slot
    if (week === 18) slot = SLOTS.W18
    else if (n === 0 && week <= 17) slot = SLOTS.TNF
    else if (n === 1) slot = SLOTS.SNF
    else if (n === 2 && week <= 17) slot = SLOTS.MNF
    else if (n <= 5) slot = SLOTS.SUN_LATE
    else slot = SLOTS.SUN_EARLY
    const { y, mo, d } = dayOfWeek(week, slot.offset)
    games.push({
      id: `2026-W${String(week).padStart(2, '0')}-${g.away}-${g.home}`,
      week,
      away: g.away,
      home: g.home,
      kickoff: zonedTimeToUtc('America/New_York', y, mo, d, slot.h, slot.mi),
      slot: slot.label,
      kind: g.kind,
      provisional: true,
    })
  })
}
games.sort((a, b) => a.week - b.week || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))

const byes = {}
for (const [id, week] of Object.entries(layout.byeWeekOf)) {
  ;(byes[week] ||= []).push(id)
}
for (const week of Object.keys(byes)) byes[week].sort()

const out = {
  season: 2026,
  seasonType: 'regular',
  weeks: WEEKS,
  generatedAt: new Date().toISOString(),
  source: 'generated',
  provisional: true,
  note:
    'Opponents are derived from the NFL scheduling formula and are expected to be correct. ' +
    'Week placement and kickoff times are generated placeholders, as are the 17th-game division ' +
    'pairings and any matchup that depends on the 2025 order of finish in scripts/standings-2025.json. ' +
    'Replace with the released schedule via `npm run schedule:fetch` or the in-app import.',
  byes,
  games,
}
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)

const perWeek = {}
for (const g of games) perWeek[g.week] = (perWeek[g.week] || 0) + 1
console.log(`Wrote ${games.length} games to ${OUT}`)
console.log(
  'Games per week:',
  Object.entries(perWeek).map(([w, n]) => `${w}:${n}`).join(' '),
)
