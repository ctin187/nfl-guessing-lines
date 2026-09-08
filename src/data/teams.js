// The 32 NFL franchises. `name` matches the full team name The Odds API returns
// in its `home_team` / `away_team` fields, which is what we key odds lookups on.
export const TEAMS = [
  { id: 'BUF', city: 'Buffalo',      nick: 'Bills',     conf: 'AFC', div: 'East',  tz: 'America/New_York' },
  { id: 'MIA', city: 'Miami',        nick: 'Dolphins',  conf: 'AFC', div: 'East',  tz: 'America/New_York' },
  { id: 'NE',  city: 'New England',  nick: 'Patriots',  conf: 'AFC', div: 'East',  tz: 'America/New_York' },
  { id: 'NYJ', city: 'New York',     nick: 'Jets',      conf: 'AFC', div: 'East',  tz: 'America/New_York' },

  { id: 'BAL', city: 'Baltimore',    nick: 'Ravens',    conf: 'AFC', div: 'North', tz: 'America/New_York' },
  { id: 'CIN', city: 'Cincinnati',   nick: 'Bengals',   conf: 'AFC', div: 'North', tz: 'America/New_York' },
  { id: 'CLE', city: 'Cleveland',    nick: 'Browns',    conf: 'AFC', div: 'North', tz: 'America/New_York' },
  { id: 'PIT', city: 'Pittsburgh',   nick: 'Steelers',  conf: 'AFC', div: 'North', tz: 'America/New_York' },

  { id: 'HOU', city: 'Houston',      nick: 'Texans',    conf: 'AFC', div: 'South', tz: 'America/Chicago'  },
  { id: 'IND', city: 'Indianapolis', nick: 'Colts',     conf: 'AFC', div: 'South', tz: 'America/New_York' },
  { id: 'JAX', city: 'Jacksonville', nick: 'Jaguars',   conf: 'AFC', div: 'South', tz: 'America/New_York' },
  { id: 'TEN', city: 'Tennessee',    nick: 'Titans',    conf: 'AFC', div: 'South', tz: 'America/Chicago'  },

  { id: 'DEN', city: 'Denver',       nick: 'Broncos',   conf: 'AFC', div: 'West',  tz: 'America/Denver'   },
  { id: 'KC',  city: 'Kansas City',  nick: 'Chiefs',    conf: 'AFC', div: 'West',  tz: 'America/Chicago'  },
  { id: 'LV',  city: 'Las Vegas',    nick: 'Raiders',   conf: 'AFC', div: 'West',  tz: 'America/Los_Angeles' },
  { id: 'LAC', city: 'Los Angeles',  nick: 'Chargers',  conf: 'AFC', div: 'West',  tz: 'America/Los_Angeles' },

  { id: 'DAL', city: 'Dallas',       nick: 'Cowboys',   conf: 'NFC', div: 'East',  tz: 'America/Chicago'  },
  { id: 'NYG', city: 'New York',     nick: 'Giants',    conf: 'NFC', div: 'East',  tz: 'America/New_York' },
  { id: 'PHI', city: 'Philadelphia', nick: 'Eagles',    conf: 'NFC', div: 'East',  tz: 'America/New_York' },
  { id: 'WAS', city: 'Washington',   nick: 'Commanders',conf: 'NFC', div: 'East',  tz: 'America/New_York' },

  { id: 'CHI', city: 'Chicago',      nick: 'Bears',     conf: 'NFC', div: 'North', tz: 'America/Chicago'  },
  { id: 'DET', city: 'Detroit',      nick: 'Lions',     conf: 'NFC', div: 'North', tz: 'America/New_York' },
  { id: 'GB',  city: 'Green Bay',    nick: 'Packers',   conf: 'NFC', div: 'North', tz: 'America/Chicago'  },
  { id: 'MIN', city: 'Minnesota',    nick: 'Vikings',   conf: 'NFC', div: 'North', tz: 'America/Chicago'  },

  { id: 'ATL', city: 'Atlanta',      nick: 'Falcons',   conf: 'NFC', div: 'South', tz: 'America/New_York' },
  { id: 'CAR', city: 'Carolina',     nick: 'Panthers',  conf: 'NFC', div: 'South', tz: 'America/New_York' },
  { id: 'NO',  city: 'New Orleans',  nick: 'Saints',    conf: 'NFC', div: 'South', tz: 'America/Chicago'  },
  { id: 'TB',  city: 'Tampa Bay',    nick: 'Buccaneers',conf: 'NFC', div: 'South', tz: 'America/New_York' },

  { id: 'ARI', city: 'Arizona',      nick: 'Cardinals', conf: 'NFC', div: 'West',  tz: 'America/Phoenix'  },
  { id: 'LAR', city: 'Los Angeles',  nick: 'Rams',      conf: 'NFC', div: 'West',  tz: 'America/Los_Angeles' },
  { id: 'SF',  city: 'San Francisco',nick: '49ers',     conf: 'NFC', div: 'West',  tz: 'America/Los_Angeles' },
  { id: 'SEA', city: 'Seattle',      nick: 'Seahawks',  conf: 'NFC', div: 'West',  tz: 'America/Los_Angeles' },
].map((t) => ({ ...t, name: `${t.city} ${t.nick}` }))

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

/** Normalise a team string (from an API or an import) down to a comparable key. */
export function normalizeTeamKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Full name, nickname, abbreviation and a few aliases APIs and feeds actually use.
const LOOKUP = (() => {
  const map = new Map()
  const add = (key, id) => {
    const k = normalizeTeamKey(key)
    if (k) map.set(k, id)
  }
  for (const t of TEAMS) {
    add(t.name, t.id)
    add(t.id, t.id)
    add(t.nick, t.id)
    add(`${t.city} ${t.nick}`, t.id)
  }
  // Disambiguate the shared-market clubs and legacy/short forms.
  const aliases = {
    'ny jets': 'NYJ', 'new york jets': 'NYJ', 'jets': 'NYJ',
    'ny giants': 'NYG', 'new york giants': 'NYG', 'giants': 'NYG',
    'la rams': 'LAR', 'los angeles rams': 'LAR', 'st louis rams': 'LAR', 'rams': 'LAR',
    'la chargers': 'LAC', 'los angeles chargers': 'LAC', 'san diego chargers': 'LAC', 'chargers': 'LAC',
    'lar': 'LAR', 'lac': 'LAC', 'lv': 'LV', 'lvr': 'LV', 'oak': 'LV', 'oakland raiders': 'LV',
    'was': 'WAS', 'wsh': 'WAS', 'washington football team': 'WAS', 'washington redskins': 'WAS',
    'jac': 'JAX', 'gnb': 'GB', 'kan': 'KC', 'nwe': 'NE', 'nor': 'NO', 'sfo': 'SF', 'tam': 'TB',
    'ari': 'ARI', 'crd': 'ARI', 'rav': 'BAL', 'htx': 'HOU', 'clt': 'IND', 'oti': 'TEN',
  }
  for (const [k, v] of Object.entries(aliases)) add(k, v)
  // Bare city names, only where they are unambiguous.
  for (const t of TEAMS) {
    const k = normalizeTeamKey(t.city)
    if (!map.has(k) && !['new york', 'los angeles'].includes(k)) map.set(k, t.id)
  }
  return map
})()

/** Resolve any reasonable team string to a team id, or null when ambiguous/unknown. */
export function resolveTeamId(value) {
  if (!value) return null
  const key = normalizeTeamKey(value)
  if (LOOKUP.has(key)) return LOOKUP.get(key)
  // Last resort: a unique nickname appearing anywhere in the string.
  const hits = TEAMS.filter((t) => key.includes(normalizeTeamKey(t.nick)))
  return hits.length === 1 ? hits[0].id : null
}
