# Guessing Lines — NFL 2026

A mobile-first tool for setting your own point spread on every game of the 2026 NFL
regular season, then comparing it against the market once the game is over.

You enter a line for each game before kickoff. Guesses lock when the ball is kicked.
After the game finishes, **Reveal** shows the consensus spread, your line beside it,
and how far off you were.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the spread maths and schedule handling
npm run build      # static bundle in dist/, plus a generated service worker
npm run lint
npm run test:e2e   # browser smoke test against the build (see Testing below)
```

No server, no account, no backend. Everything lives in the browser, and the built
`dist/` is plain static files you can host anywhere — the build uses relative paths, so
a domain root and a subpath both work.

---

## How lines are quoted

Every number in the app is the **home team's** spread.

| You enter | Means |
|---|---|
| `-3.5` | home team favoured by 3.5 |
| `+7` | home team getting 7 |
| `0` or `PK` | pick'em |

The field echoes it back in words (`KC by 3.5`) so there is no ambiguity about which
side you took. The `−` / `+` buttons move the line half a point at a time; you can
also type directly, or use the arrow keys on a desktop keyboard.

## Grading

Reveal compares your line to the **median** spread across the bookmakers The Odds API
returns for that game. The median is used rather than the mean because a single book
hanging an off-market number should not drag the consensus.

| Error | Shown as |
|---|---|
| ≤ 0.25 | `Exact` |
| ≤ 1 | `Off by …` (sharp) |
| ≤ 2.5 | close |
| ≤ 6 | wide |
| > 6 | miss |

Taking the wrong favourite is called out separately — being off by two points is a
different mistake from having the wrong team laying the points. The week header rolls
it all up: average error, exact hits, within a point, worst miss.

Tapping the week name opens the season sheet: your cumulative numbers across every
graded week, your best week, and all 18 weeks at a glance — each showing either how
many lines you have set or, once graded, that week's average error. Tap any week to
jump to it.

---

## The Odds API

Get a key at [the-odds-api.com](https://the-odds-api.com/) (the free tier is 500
requests a month, which is far more than this app needs) and paste it into **Settings**.
It is stored in your browser's `localStorage` and sent only to `api.the-odds-api.com`.

### The one thing worth understanding

**The Odds API drops a game from the odds board as soon as it finishes.** The
`/v4/sports/americanfootball_nfl/odds` endpoint only returns games that have not
started. So "fetch the line after the game is played" is not something a free key can
do on its own — by then the line is gone.

The app handles this by **capturing** lines before kickoff:

1. While a week still has games to play, the app snapshots the consensus for each of
   them and stores it locally. That snapshot is hidden from you — the card just says
   a line was captured, never what it was.
2. When you hit **Reveal** after the games are over, it shows those captured lines.

Capture runs automatically at most once an hour whenever you open a week with games
still to play (toggleable in Settings), and there is a **Capture lines** button for
doing it by hand. Open the week once on game day and you will have a closing-ish line
to grade against.

Reveal falls back in this order:

1. **Your captured snapshot** — free, and genuinely a pre-game number.
2. **The historical odds endpoint** — the true closing line at kickoff. Requires a
   paid Odds API plan; enable it in Settings. If your key cannot use it, the app
   silently falls back rather than failing.
3. **The live board** — for anything somehow still listed.

If none of those has a line, the app says so plainly instead of inventing one.

### Request cost

| Action | Requests |
|---|---|
| Testing your key | 0 |
| Capture lines | 1 per region selected |
| Reveal from captured snapshots | 0 |
| Reveal via historical odds | 1 per region, per distinct kickoff time |

Rate limits, an expired key, a dead connection and a plan restriction each produce a
specific message rather than a generic failure.

---

## The bundled schedule — read this

The 2026 schedule shipped in `src/data/schedule-2026.json` is **generated**, and the
app shows a banner saying so until you replace it. Specifically:

**Derived from the NFL's published scheduling formula, and expected to be correct:**
each team's opponents — six division games home and away, four against a rotating
division in-conference (2026: AFC/NFC East ↔ West and North ↔ South), and four against
a rotating division cross-conference (2026: AFC East ↔ NFC North, AFC North ↔ NFC
South, AFC South ↔ NFC East, AFC West ↔ NFC West).

**Generated placeholders, and not to be trusted:**

- **Which week each game falls in, and every kickoff date and time.** That is the
  league's own scheduling output and cannot be derived from anything. The generator
  lays out a valid 18-week season (one bye each, nobody booked twice in a week) and
  labels each game `provisional: true`.
- **The two standings-based games and the 17th game**, which depend on the 2025 order
  of finish. `scripts/standings-2025.json` currently holds a placeholder (alphabetical)
  ordering. Put the real 2025 standings in that file and re-run `npm run schedule:generate`
  to fix those matchups.
- **The 17th-game division pairings**, whose rotation is not publicly derivable.

### Getting the real schedule

```bash
npm run schedule:fetch      # pulls the released schedule from ESPN's public API
```

This overwrites `src/data/schedule-2026.json`, clears the provisional flag, and
validates that a full 32-team, 17-game season came back before writing anything. It was
written against ESPN's documented response shape but could not be run where this repo
was built (no outbound network there), so give the first run a look.

You can also paste or upload schedule JSON in **Settings → Schedule**, which stores it
in the browser without touching the repo. The importer is forgiving about field names
and team spellings:

```json
{
  "season": 2026,
  "games": [
    { "week": 1, "away": "Dallas Cowboys", "home": "PHI", "kickoff": "2026-09-11T00:20:00Z" }
  ]
}
```

`away`/`awayTeam`/`away_team` and `kickoff`/`commence_time`/`date` all work, and team
names resolve from full names, nicknames or abbreviations. Games that cannot be
resolved are dropped rather than guessed at. **Use bundled** puts the generated
schedule back.

Replacing the schedule does not touch your guesses — they are keyed by
`season-week-away-home`, so a game keeps its guess as long as the matchup and week
stay the same.

---

## Installing it

It is a PWA. On a phone, add it to your home screen (Chromium browsers surface a
button in **Settings → Install**; on iOS use Share → Add to Home Screen) and it opens
full screen with its own icon.

A service worker precaches the app shell, so it opens with no signal — your guesses,
captured snapshots and already-revealed lines are local anyway. The worker never
touches `api.the-odds-api.com`: stale odds are worse than no odds. When you are
offline the app says so and disables the two actions that need a network, but you can
still enter and edit lines.

The worker is generated at build time by `scripts/build-sw.mjs`, which precaches
whatever the build just produced and versions the cache by its content. It is not
registered in dev.

## Testing

```bash
npm test                        # 21 unit tests, no browser needed
npm run build
npx playwright install chromium # once
npm run test:e2e                # 25 checks in a real browser
```

The e2e suite serves the production build, stubs The Odds API with a deterministic
payload, and walks the whole flow on a phone-sized viewport: entering and correcting a
line, persistence across a reload, capturing before kickoff (and confirming the
captured number stays hidden), revealing with the clock moved past kickoff, grading,
the season sheet, week navigation and the offline state. It fails on any console error.

CI runs lint, unit tests, the build, the schedule generator and the e2e suite on every
push.

## Storage

`localStorage`, under `ngl.v1.*`: guesses, captured snapshots, revealed lines,
settings, an imported schedule, and which week you were last on. If the browser blocks
storage (private windows, "block site data"), the app keeps working for the session and
says so in Settings instead of throwing.

Two tabs open on the same season stay in step: each adopts writes from the other and
only ever persists values it actually changed, so an idle tab cannot overwrite the one
you are typing in.

**Settings → Your data** exports everything to a JSON file and restores it, which is
also how you move a season between devices or browsers.

## Project layout

```
src/
  App.jsx                  week state, capture and reveal flows
  components/              game card, spread input, sheets, season overview
  hooks/                   persisted state, online status, install prompt
  lib/lines.js             parsing, formatting, consensus, grading
  lib/oddsApi.js           The Odds API client and typed errors
  lib/schedule.js          schedule normalising, event matching, kickoff gating
  lib/storage.js           localStorage with the failure modes handled
  data/teams.js            32 teams plus name resolution
  data/schedule-2026.json  generated; replace with the real thing
public/
  icon.svg                 source mark; PNGs are built from it
  manifest.webmanifest
scripts/
  build-schedule.mjs       formula-derived matchups + provisional week layout
  fetch-schedule.mjs       pull the real schedule from ESPN
  build-sw.mjs             generates dist/sw.js after a build
  build-icons.mjs          rasterises icon.svg (npm run icons)
  standings-2025.json      edit this, then re-run schedule:generate
test/
  *.test.mjs               node:test suites for lines and schedule
  e2e.mjs                  browser smoke test
```

## Deploying

`npm run build` produces a self-contained `dist/`. Serve it from anywhere static —
GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket. Two things worth knowing:

- Serve `index.html` for unknown paths if your host does SPA routing; the app has no
  routes, so a plain static host works as-is.
- `sw.js` must be served from the same directory as `index.html` (it is, by default)
  and should not be cached by the CDN for long, or updates will lag.
