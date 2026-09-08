/**
 * End-to-end smoke test against a production build, with The Odds API stubbed.
 *
 *   npm run build
 *   npx playwright install chromium     # once
 *   npm run test:e2e
 *
 * Covers the flows that unit tests cannot: entering a line, persistence across a
 * reload, capturing before kickoff, revealing once the games are over (the clock
 * is moved forward for that), the season sheet, and week navigation.
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const PORT = Number(process.env.PORT || 4178)
const BASE = `http://127.0.0.1:${PORT}`

const schedule = JSON.parse(readFileSync(new URL('../src/data/schedule-2026.json', import.meta.url), 'utf8'))
const { TEAM_BY_ID } = await import('../src/data/teams.js')
const week1 = schedule.games.filter((g) => g.week === 1)
const BOOKS = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'bovada']

/** Deterministic stub payload: home spreads walk from -1 to -7.5, books ±1. */
const oddsPayload = () => week1.map((g, i) => {
  const base = -(((i * 3) % 14) / 2 + 1)
  return {
    id: `ev${i}`,
    sport_key: 'americanfootball_nfl',
    commence_time: g.kickoff,
    home_team: TEAM_BY_ID[g.home].name,
    away_team: TEAM_BY_ID[g.away].name,
    bookmakers: BOOKS.map((key, b) => ({
      key,
      title: key,
      last_update: g.kickoff,
      markets: [{
        key: 'spreads',
        last_update: g.kickoff,
        outcomes: [
          { name: TEAM_BY_ID[g.home].name, price: 1.91, point: base + (b - 2) * 0.5 },
          { name: TEAM_BY_ID[g.away].name, price: 1.91, point: -(base + (b - 2) * 0.5) },
        ],
      }],
    })),
  }
})

const failures = []
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
  if (!ok) failures.push(label)
}

// --- serve the build ---------------------------------------------------------
// Vite's preview server runs in-process: no child to orphan, no port to race.
const { preview } = await import('vite')
const server = await preview({
  root: new URL('..', import.meta.url).pathname,
  preview: { port: PORT, strictPort: true, host: '127.0.0.1' },
})
const BASE_URL = server.resolvedUrls?.local?.[0] || BASE

let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  await ctx.route('**api.the-odds-api.com/**', (route) => route.fulfill({
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-requests-remaining': '487',
      'x-requests-used': '13',
      'x-requests-last': '1',
    },
    body: JSON.stringify(route.request().url().includes('/v4/sports/americanfootball_nfl/odds') ? oddsPayload() : []),
  }))

  const errors = []
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(String(e)))
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  }

  // --- entering lines --------------------------------------------------------
  const page = await ctx.newPage()
  watch(page)
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  check((await page.locator('.brand').textContent()).includes('Guessing Lines'), 'app renders')
  check((await page.locator('.card').count()) === week1.length, `week 1 lists ${week1.length} games`)

  const first = page.locator('.stepper__input').first()
  await first.fill('-3.5')
  await first.blur()
  check((await first.inputValue()) === '-3.5', 'typed line normalises')
  check(/by 3\.5$/.test(await page.locator('.stepper__hint').first().textContent()), 'hint reads in plain English')

  await page.locator('.stepper__btn').first().click()
  check((await first.inputValue()) === '-4', 'stepper moves half a point')
  await page.locator('.stepper__btn').nth(1).click()
  check((await first.inputValue()) === '-3.5', 'stepper moves back')

  await first.fill('abc')
  check(await page.locator('.stepper__input.is-invalid').first().isVisible(), 'invalid entry is flagged')
  await first.fill('-3.5')
  await first.blur()

  const inputs = page.locator('.stepper__input')
  for (let i = 1; i < 6; i++) {
    await inputs.nth(i).fill(String(-(i + 1)))
    await inputs.nth(i).blur()
  }
  check((await page.locator('.summary__stat b').first().textContent()) === `6/${week1.length}`, 'week progress counts entries')

  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  check((await page.locator('.stepper__input').first().inputValue()) === '-3.5', 'guesses survive a reload')

  // --- key + capture ---------------------------------------------------------
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('#apikey').fill('test-key')
  await page.getByRole('button', { name: 'Test' }).click()
  await page.waitForTimeout(400)
  check(await page.locator('.field__hint').filter({ hasText: 'Key works' }).isVisible(), 'key test reports quota')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Capture lines' }).click()
  await page.waitForSelector('.note', { timeout: 5000 })
  check(/Captured 16 lines/.test(await page.locator('.note').last().textContent()), 'capture stores every line')
  const hidden = await page.locator('.books').first().textContent()
  check(!/[-+]\d/.test(hidden), 'captured lines stay hidden before reveal')

  // --- reveal, with nothing kicked off yet -----------------------------------
  // The whole week is still upcoming here. Reveal must not be gated on kickoff.
  const revealBtn = page.locator('.btn--primary')
  check(await revealBtn.isEnabled(), 'reveal is available before any game kicks off')
  check(/Reveal 16 lines/.test(await revealBtn.textContent()), 'reveal offers every unrevealed game')
  await revealBtn.click()
  await page.waitForSelector('.reveal', { timeout: 5000 })
  check((await page.locator('.reveal').count()) === week1.length, 'every game reveals')
  check(/Exact|Off by/.test(await page.locator('.grade').first().textContent()), 'guesses are graded')
  check(/live from The Odds API/.test(await page.locator('.books').first().textContent()), 'reveal uses the current line')
  check(/^\d+\.\d\d$/.test(await page.locator('.summary__stat b').first().textContent()), 'week scoreboard shows avg error')
  check((await page.locator('.stepper__input').count()) === 0, 'inputs lock once revealed')
  check(/All revealed/.test(await page.locator('.btn--primary').textContent()), 'nothing left to reveal')
  await page.close()

  // --- week rollover, with the clock past week 1 -----------------------------
  const later = await ctx.newPage()
  watch(later)
  await later.clock.install({ time: new Date('2026-09-24T12:00:00Z') })
  await later.goto(BASE_URL, { waitUntil: 'networkidle' })
  await later.waitForTimeout(300)
  check(Number((await later.locator('.weeknav__label strong').textContent()).replace(/\D/g, '')) > 1,
    'a finished week rolls forward')
  while ((await later.locator('.weeknav__label strong').textContent()) !== 'Week 1') {
    await later.locator('.weeknav__arrow').first().click()
    await later.waitForTimeout(120)
  }
  check((await later.locator('.reveal').count()) === week1.length, 'revealed lines persist across sessions')

  // --- season sheet ----------------------------------------------------------
  await later.locator('.weeknav__label').click()
  await later.waitForSelector('.weekgrid')
  check((await later.locator('.weekcell').count()) === 18, 'season sheet lists 18 weeks')
  check(/avg/.test(await later.locator('.weekcell').first().textContent()), 'a graded week shows its average')
  check(/Avg error/i.test(await later.locator('.sheet__body .summary').textContent()), 'season totals are shown')
  await later.getByRole('button', { name: 'Week 12' }).click()
  check((await later.locator('.weeknav__label strong').textContent()) === 'Week 12', 'season sheet jumps to a week')
  await later.locator('.weeknav__arrow').first().click()
  check((await later.locator('.weeknav__label strong').textContent()) === 'Week 11', 'week arrows work')

  // --- offline ---------------------------------------------------------------
  await ctx.setOffline(true)
  await later.evaluate(() => window.dispatchEvent(new Event('offline')))
  check(/Offline/.test(await later.locator('.note--warn').first().textContent()), 'offline state is surfaced')
  await ctx.setOffline(false)

  check(errors.length === 0, `no console or page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`)

  // --- service worker, in a clean context with nothing intercepted -----------
  const swCtx = await browser.newContext({ ...devices['iPhone 13'] })
  const sw = await swCtx.newPage()
  await sw.goto(BASE_URL, { waitUntil: 'networkidle' })

  const registration = await sw.evaluate(async () => {
    const r = await navigator.serviceWorker.ready
    return Boolean(r.active)
  })
  check(registration, 'service worker activates')

  const cache = await sw.evaluate(async () => {
    const keys = await caches.keys()
    const c = await caches.open(keys[0])
    const urls = (await c.keys()).map((r) => r.url)
    return { count: urls.length, odds: urls.some((u) => u.includes('the-odds-api')) }
  })
  check(cache.count >= 8, `precaches the app shell (${cache.count} files)`)
  check(!cache.odds, 'never caches The Odds API')

  await swCtx.setOffline(true)
  await sw.reload({ waitUntil: 'domcontentloaded' })
  await sw.waitForSelector('.card', { timeout: 10000 })
  check((await sw.locator('.card').count()) > 0, 'app loads offline from the cache')
  check(await sw.locator('.actions .btn').first().isDisabled(), 'capture is disabled offline')
  await swCtx.close()
} finally {
  await browser?.close()
  await server.close()
}

console.log(failures.length ? `\n${failures.length} failing check(s)` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
