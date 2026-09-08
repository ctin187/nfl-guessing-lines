#!/usr/bin/env node
/**
 * Regenerates the screenshots in docs/ from the current build.
 *
 *   npm run build && node scripts/screenshots.mjs
 *
 * The Odds API is stubbed with a deterministic payload, and the clock is moved
 * past week 1 for the revealed shot, so the images are reproducible.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium, devices } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 4180)

const schedule = JSON.parse(readFileSync(resolve(ROOT, 'src/data/schedule-2026.json'), 'utf8'))
const { TEAM_BY_ID } = await import(pathToFileURL(resolve(ROOT, 'src/data/teams.js')).href)
const BOOKS = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'bovada']

const payloadFor = (week) => schedule.games.filter((g) => g.week === week).map((g, i) => {
  const base = -(((i * 3) % 14) / 2 + 1)
  return {
    id: `ev${week}-${i}`,
    commence_time: g.kickoff,
    home_team: TEAM_BY_ID[g.home].name,
    away_team: TEAM_BY_ID[g.away].name,
    bookmakers: BOOKS.map((key, b) => ({
      key,
      title: key,
      markets: [{
        key: 'spreads',
        outcomes: [
          { name: TEAM_BY_ID[g.home].name, point: base + (b - 2) * 0.5 },
          { name: TEAM_BY_ID[g.away].name, point: -(base + (b - 2) * 0.5) },
        ],
      }],
    })),
  }
})

const GUESSES = ['-3.5', '-1', '+2.5', '-7', '-2', '-4.5', '+1', '-6.5', '-3', '-9', '+3.5', '-1.5', '-5', '-2.5', '-8', '-4']

const { preview } = await import('vite')
const server = await preview({ root: ROOT, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } })
const BASE = server.resolvedUrls.local[0]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  // Eastern, because that is the timezone NFL kickoff windows are named for.
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
    timezoneId: 'America/New_York',
  })
  let week = 1
  await ctx.route('**api.the-odds-api.com/**', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json', 'x-requests-remaining': '463', 'x-requests-used': '37' },
    body: JSON.stringify(route.request().url().includes('/v4/sports/americanfootball_nfl/odds') ? payloadFor(week) : []),
  }))
  await ctx.addInitScript(() => {
    if (localStorage.getItem('ngl.v1.settings')) return
    localStorage.setItem('ngl.v1.settings', JSON.stringify({ apiKey: 'demo', regions: 'us', autoCapture: false, useHistorical: false }))
    localStorage.setItem('ngl.v1.ui', JSON.stringify({ dismissedKeyNote: true }))
  })

  // Fill and capture weeks 1 and 2 so the season sheet has a record to show.
  for (week of [1, 2]) {
    const page = await ctx.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle' })
    if (week === 2) await page.locator('.weeknav__arrow').nth(1).click()
    const inputs = page.locator('.stepper__input')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) {
      await inputs.nth(i).fill(GUESSES[(i + week) % GUESSES.length])
      await inputs.nth(i).blur()
    }
    await page.getByRole('button', { name: 'Capture lines' }).click()
    await page.waitForTimeout(1200)
    if (week === 1) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(150)
      await page.screenshot({ path: resolve(ROOT, 'docs/entry.png') })
    }
    await page.close()
  }

  // Reveal both weeks, then shoot the graded week and the season view.
  const after = await ctx.newPage()
  await after.goto(BASE, { waitUntil: 'networkidle' })
  for (week of [1, 2]) {
    while (Number((await after.locator('.weeknav__label strong').textContent()).replace(/\D/g, '')) !== week) {
      const current = Number((await after.locator('.weeknav__label strong').textContent()).replace(/\D/g, ''))
      await after.locator('.weeknav__arrow').nth(current < week ? 1 : 0).click()
      await after.waitForTimeout(150)
    }
    if (await after.locator('.btn--primary').isEnabled()) {
      await after.locator('.btn--primary').click()
      await after.waitForTimeout(900)
    }
  }
  while ((await after.locator('.weeknav__label strong').textContent()) !== 'Week 1') {
    await after.locator('.weeknav__arrow').first().click()
    await after.waitForTimeout(150)
  }
  await after.waitForSelector('.reveal')
  await after.evaluate(() => window.scrollTo(0, 0))
  await after.waitForTimeout(150)
  await after.screenshot({ path: resolve(ROOT, 'docs/revealed.png') })

  await after.locator('.weeknav__label').click()
  await after.waitForSelector('.weekgrid')
  await after.waitForTimeout(400)
  await after.screenshot({ path: resolve(ROOT, 'docs/season.png') })
  console.log('Wrote docs/entry.png, docs/revealed.png, docs/season.png')
} finally {
  await browser.close()
  await server.close()
}
