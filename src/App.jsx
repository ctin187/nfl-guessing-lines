import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameCard from './components/GameCard.jsx'
import SettingsSheet from './components/SettingsSheet.jsx'
import WeekPicker from './components/WeekPicker.jsx'
import WeekSummary from './components/WeekSummary.jsx'
import { usePersistentState } from './hooks/usePersistentState.js'
import { KEYS, remove } from './lib/storage.js'
import { consensusFromBookmakers, flipConsensus, gradeGuess, summarize } from './lib/lines.js'
import {
  fetchHistoricalSpreads, fetchUpcomingSpreads, OddsApiError,
} from './lib/oddsApi.js'
import {
  bundledSchedule, currentWeek, dayKey, formatDayHeading, indexEventsByGame, kickedOff, likelyFinal,
  normalizeSchedule,
} from './lib/schedule.js'

const DEFAULT_SETTINGS = {
  apiKey: '',
  regions: 'us',
  autoCapture: true,
  useHistorical: false,
}

const AUTO_CAPTURE_INTERVAL = 60 * 60 * 1000 // at most one automatic capture an hour

/** Turn one matched Odds API event into a stored consensus record. */
function toRecord(match, source, capturedAt) {
  const consensus = consensusFromBookmakers(match.event.bookmakers, match.event.home_team)
  if (!consensus) return null
  const c = match.flipped ? flipConsensus(consensus) : consensus
  return {
    line: c.line,
    mean: c.mean,
    min: c.min,
    max: c.max,
    books: c.books,
    source,
    capturedAt,
    commenceTime: match.commenceTime,
  }
}

export default function App() {
  const [customSchedule, setCustomSchedule] = usePersistentState(KEYS.schedule, null)
  const [ui, setUi] = usePersistentState(KEYS.ui, {})
  const [guesses, setGuesses] = usePersistentState(KEYS.guesses, {})
  const [snapshots, setSnapshots] = usePersistentState(KEYS.snapshots, {})
  const [reveals, setReveals] = usePersistentState(KEYS.reveals, {})
  const [settings, setSettings] = usePersistentState(KEYS.settings, DEFAULT_SETTINGS)

  const [schedule, scheduleError] = useMemo(() => {
    if (customSchedule) {
      try {
        return [normalizeSchedule(customSchedule), null]
      } catch (err) {
        return [bundledSchedule(), `Imported schedule was unusable (${err.message}); showing the bundled one.`]
      }
    }
    return [bundledSchedule(), null]
  }, [customSchedule])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])

  const [week, setWeekState] = useState(() => {
    const remembered = Number(ui.week)
    const fresh = ui.weekAt && Date.now() - ui.weekAt < 12 * 3600 * 1000
    if (fresh && remembered >= 1 && remembered <= 18) return remembered
    return currentWeek(bundledSchedule())
  })
  const setWeek = useCallback((w) => {
    setWeekState(w)
    setUi((prev) => ({ ...prev, week: w, weekAt: Date.now() }))
  }, [setUi])

  useEffect(() => {
    if (week > schedule.weeks) setWeek(schedule.weeks)
  }, [schedule.weeks, week, setWeek])

  const [showWeeks, setShowWeeks] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(null) // 'capture' | 'reveal'
  const [status, setStatus] = useState(null) // { tone, text }
  // A success note has said its piece after a few seconds; warnings and errors stay.
  useEffect(() => {
    if (status?.tone !== 'ok') return undefined
    const id = setTimeout(() => setStatus(null), 6000)
    return () => clearTimeout(id)
  }, [status])
  const [quota, setQuota] = useState(null)
  const abortRef = useRef(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const games = useMemo(() => schedule.byWeek.get(week) || [], [schedule, week])
  const phaseOf = useCallback(
    (g) => (likelyFinal(g, now) ? 'final' : kickedOff(g, now) ? 'live' : 'upcoming'),
    [now],
  )

  const entered = games.filter((g) => Number.isFinite(guesses[g.id])).length
  const revealedGames = games.filter((g) => reveals[g.id])
  const finalGames = games.filter((g) => phaseOf(g) === 'final')
  const upcomingGames = games.filter((g) => phaseOf(g) === 'upcoming')
  const pendingReveal = finalGames.filter((g) => !reveals[g.id])

  const summary = useMemo(
    () => summarize(revealedGames.map((g) => gradeGuess(guesses[g.id], reveals[g.id].line))),
    [revealedGames, guesses, reveals],
  )

  const weekStats = useCallback((w) => {
    const list = schedule.byWeek.get(w) || []
    return {
      total: list.length,
      entered: list.filter((g) => Number.isFinite(guesses[g.id])).length,
      revealed: list.filter((g) => reveals[g.id]).length,
    }
  }, [schedule, guesses, reveals])

  const setGuess = useCallback((gameId, value) => {
    setGuesses((prev) => {
      if (value === null || value === undefined) {
        if (!(gameId in prev)) return prev
        const next = { ...prev }
        delete next[gameId]
        return next
      }
      if (prev[gameId] === value) return prev
      return { ...prev, [gameId]: value }
    })
  }, [setGuesses])

  const noteQuota = useCallback((q) => { if (q) setQuota(q) }, [])

  const describeError = (err) => {
    if (err instanceof OddsApiError) {
      if (err.code === 'rate_limit') {
        return err.retryAfter
          ? `Rate limited. Try again in about ${err.retryAfter}s.`
          : err.message
      }
      return err.message
    }
    return err?.message || 'Something went wrong.'
  }

  /** Snapshot the current market for this week's games that have not kicked off. */
  const captureLines = useCallback(async ({ silent = false } = {}) => {
    const key = settings.apiKey.trim()
    if (!key) {
      if (!silent) setStatus({ tone: 'warn', text: 'Add your Odds API key in Settings to capture lines.' })
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (!silent) setBusy('capture')
    try {
      const { events, quota: q } = await fetchUpcomingSpreads({
        apiKey: key, regions: settings.regions, signal: controller.signal,
      })
      noteQuota(q)
      const matched = indexEventsByGame(events, schedule)
      const at = new Date().toISOString()
      const captured = {}
      for (const [gameId, match] of matched) {
        const game = schedule.byId.get(gameId)
        // Only keep genuinely pre-kickoff prices; a live line is not a closing line.
        const commence = Date.parse(match.commenceTime)
        if (Number.isFinite(commence) && commence <= Date.now()) continue
        if (!game || kickedOff(game)) continue
        const record = toRecord(match, 'captured', at)
        if (record) captured[gameId] = record
      }
      const count = Object.keys(captured).length
      if (count) setSnapshots((prev) => ({ ...prev, ...captured }))
      setUi((prev) => ({ ...prev, lastCaptureAt: Date.now() }))
      if (!silent) {
        setStatus(count
          ? { tone: 'ok', text: `Captured ${count} line${count === 1 ? '' : 's'} across the board.` }
          : { tone: 'warn', text: 'No pre-kickoff lines were posted for these games yet.' })
      }
    } catch (err) {
      if (err?.code === 'aborted') return
      if (!silent) setStatus({ tone: 'error', text: describeError(err) })
    } finally {
      if (!silent) setBusy(null)
    }
  }, [settings.apiKey, settings.regions, schedule, setSnapshots, setUi, noteQuota])

  // Automatic capture: only for a week that still has games to play, once an hour.
  const autoRef = useRef(false)
  useEffect(() => {
    if (!settings.autoCapture || !settings.apiKey.trim()) return
    if (!upcomingGames.length || autoRef.current) return
    if (ui.lastCaptureAt && Date.now() - ui.lastCaptureAt < AUTO_CAPTURE_INTERVAL) return
    autoRef.current = true
    captureLines({ silent: true }).finally(() => { autoRef.current = false })
  }, [settings.autoCapture, settings.apiKey, upcomingGames.length, ui.lastCaptureAt, captureLines])

  /**
   * Reveal: captured snapshots first (free and genuinely pre-game), then the
   * historical endpoint when the plan allows it, then the live board as a
   * last resort for anything still listed.
   */
  const revealWeek = useCallback(async () => {
    if (!pendingReveal.length) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy('reveal')
    setStatus(null)

    const resolved = {}
    const notes = []
    for (const game of pendingReveal) {
      const snap = snapshots[game.id]
      if (snap) resolved[game.id] = { ...snap, source: 'captured', revealedAt: new Date().toISOString() }
    }
    let missing = pendingReveal.filter((g) => !resolved[g.id])
    const key = settings.apiKey.trim()

    try {
      if (missing.length && key && settings.useHistorical) {
        // One snapshot per distinct kickoff time covers every game in that slot.
        const slots = [...new Set(missing.map((g) => g.kickoffMs))].sort((a, b) => a - b)
        for (const slotMs of slots) {
          if (controller.signal.aborted) return
          try {
            const at = new Date(slotMs - 60000).toISOString()
            const { events, quota: q } = await fetchHistoricalSpreads({
              apiKey: key, regions: settings.regions, date: at, signal: controller.signal,
            })
            noteQuota(q)
            const matched = indexEventsByGame(events, schedule)
            for (const game of missing) {
              if (game.kickoffMs !== slotMs) continue
              const match = matched.get(game.id)
              if (!match) continue
              const record = toRecord(match, 'historical', at)
              if (record) resolved[game.id] = { ...record, revealedAt: new Date().toISOString() }
            }
          } catch (err) {
            if (err?.code === 'aborted') return
            if (err?.code === 'plan' || err?.code === 'auth') {
              notes.push('Historical odds need a paid Odds API plan; used captured snapshots instead.')
              break
            }
            notes.push(describeError(err))
            break
          }
        }
        missing = pendingReveal.filter((g) => !resolved[g.id])
      }

      if (missing.length && key) {
        try {
          const { events, quota: q } = await fetchUpcomingSpreads({
            apiKey: key, regions: settings.regions, signal: controller.signal,
          })
          noteQuota(q)
          const matched = indexEventsByGame(events, schedule)
          const at = new Date().toISOString()
          for (const game of missing) {
            const match = matched.get(game.id)
            if (!match) continue
            const record = toRecord(match, 'live', at)
            if (record) resolved[game.id] = { ...record, revealedAt: at }
          }
        } catch (err) {
          if (err?.code === 'aborted') return
          notes.push(describeError(err))
        }
      }

      const count = Object.keys(resolved).length
      if (count) setReveals((prev) => ({ ...prev, ...resolved }))

      const stillMissing = pendingReveal.length - count
      if (count && !stillMissing) {
        setStatus({ tone: 'ok', text: `Revealed ${count} line${count === 1 ? '' : 's'}.` })
      } else if (count) {
        notes.unshift(`Revealed ${count} of ${pendingReveal.length}.`)
        setStatus({ tone: 'warn', text: `${notes.join(' ')} The rest have no market line on record — The Odds API drops games once they finish, so capture lines before kickoff (or enable historical odds) to have one to compare against.` })
      } else if (!key) {
        setStatus({ tone: 'warn', text: 'No captured lines for these games, and no API key set. Add a key in Settings, then capture lines before kickoff each week.' })
      } else {
        notes.push('No market line on record for these games. The Odds API drops a game from the live board once it finishes, so capture lines before kickoff (or turn on historical odds) to have one to compare against.')
        setStatus({ tone: 'warn', text: notes.join(' ') })
      }
    } finally {
      setBusy(null)
    }
  }, [pendingReveal, snapshots, settings, schedule, setReveals, noteQuota])

  const wipe = () => {
    for (const key of [KEYS.guesses, KEYS.snapshots, KEYS.reveals]) remove(key)
    setGuesses({}); setSnapshots({}); setReveals({})
    setStatus({ tone: 'ok', text: 'Cleared.' })
    setShowSettings(false)
  }

  const grouped = useMemo(() => {
    const out = []
    for (const game of games) {
      const key = dayKey(game.kickoffMs)
      if (!out.length || out[out.length - 1].key !== key) {
        out.push({ key, heading: formatDayHeading(game.kickoffMs), games: [] })
      }
      out[out.length - 1].games.push(game)
    }
    return out
  }, [games])

  const showProvisionalNote = schedule.provisional && !ui.dismissedProvisional
  const showKeyNote = !settings.apiKey.trim() && !ui.dismissedKeyNote

  return (
    <div className="app">
      <header className="header">
        <div className="header__top">
          <h1 className="brand">Guessing Lines <span>· {schedule.season}</span></h1>
          <button type="button" className="iconbtn" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
        <nav className="weeknav" aria-label="Week">
          <button
            type="button"
            className="weeknav__arrow"
            onClick={() => setWeek(week - 1)}
            disabled={week <= 1}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button type="button" className="weeknav__label" onClick={() => setShowWeeks(true)}>
            <strong>Week {week}</strong>
            <small>
              {games.length} games · {entered}/{games.length} set
              {revealedGames.length ? ` · ${revealedGames.length} revealed` : ''}
            </small>
          </button>
          <button
            type="button"
            className="weeknav__arrow"
            onClick={() => setWeek(week + 1)}
            disabled={week >= schedule.weeks}
            aria-label="Next week"
          >
            ›
          </button>
        </nav>
      </header>

      <main className="main">
        {scheduleError ? <div className="note note--error"><div className="note__body">{scheduleError}</div></div> : null}

        {showKeyNote ? (
          <div className="note">
            <div className="note__body">
              <strong>No API key yet.</strong> You can enter guesses now, but revealing needs a key from{' '}
              <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer">the-odds-api.com</a>.{' '}
              <button type="button" className="iconbtn" style={{ minHeight: 0, padding: '0 2px', textDecoration: 'underline' }} onClick={() => setShowSettings(true)}>Add it</button>
            </div>
            <button type="button" className="note__dismiss" aria-label="Dismiss" onClick={() => setUi((p) => ({ ...p, dismissedKeyNote: true }))}>×</button>
          </div>
        ) : null}

        {showProvisionalNote ? (
          <div className="note note--warn">
            <div className="note__body">
              <strong>Provisional dates.</strong> The bundled schedule derives each team's 17 opponents from the
              NFL's scheduling formula, but week placement and kickoff times are generated placeholders.
              Import the released schedule in Settings to fix them.
            </div>
            <button type="button" className="note__dismiss" aria-label="Dismiss" onClick={() => setUi((p) => ({ ...p, dismissedProvisional: true }))}>×</button>
          </div>
        ) : null}

        {status ? (
          <div className={`note${status.tone === 'error' ? ' note--error' : status.tone === 'warn' ? ' note--warn' : ''}`}>
            <div className="note__body">{status.text}</div>
            <button type="button" className="note__dismiss" aria-label="Dismiss" onClick={() => setStatus(null)}>×</button>
          </div>
        ) : null}

        {games.length ? (
          <WeekSummary
            total={games.length}
            entered={entered}
            summary={summary}
            revealed={revealedGames.length}
          />
        ) : null}

        {schedule.byes?.[week]?.length ? (
          <p className="daylabel">Bye: {schedule.byes[week].join(' · ')}</p>
        ) : null}

        {grouped.length ? grouped.map((group) => (
          <section key={group.key}>
            <h2 className="daylabel">{group.heading}</h2>
            {group.games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                guess={guesses[game.id] ?? null}
                reveal={reveals[game.id] || null}
                captured={Boolean(snapshots[game.id])}
                phase={phaseOf(game)}
                onGuess={(v) => setGuess(game.id, v)}
              />
            ))}
          </section>
        )) : (
          <p className="empty">No games scheduled for week {week}.</p>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => captureLines()}
            disabled={!upcomingGames.length || busy !== null}
            title={upcomingGames.length ? 'Snapshot the market for games that have not kicked off' : 'Every game this week has kicked off'}
          >
            {busy === 'capture' ? <span className="spinner" /> : null}
            {busy === 'capture' ? 'Capturing' : 'Capture lines'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={revealWeek}
            disabled={!pendingReveal.length || busy !== null}
          >
            {busy === 'reveal' ? <span className="spinner" /> : null}
            {busy === 'reveal'
              ? 'Revealing'
              : pendingReveal.length
                ? `Reveal ${pendingReveal.length} line${pendingReveal.length === 1 ? '' : 's'}`
                : finalGames.length
                  ? 'All revealed'
                  : 'Reveal lines'}
          </button>
        </div>

        <p className="footer">
          Lines are quoted from the home team&rsquo;s side. Guesses lock at kickoff.<br />
          Odds via <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer">The Odds API</a>.
        </p>
      </main>

      {showWeeks ? (
        <WeekPicker
          schedule={schedule}
          week={week}
          stats={weekStats}
          onPick={setWeek}
          onClose={() => setShowWeeks(false)}
        />
      ) : null}

      {showSettings ? (
        <SettingsSheet
          settings={settings}
          onSettings={setSettings}
          quota={quota}
          schedule={schedule}
          onImportSchedule={(blob) => { normalizeSchedule(blob); setCustomSchedule(blob) }}
          onResetSchedule={() => { setCustomSchedule(null); setStatus({ tone: 'ok', text: 'Back to the bundled schedule.' }); setShowSettings(false) }}
          onWipe={wipe}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </div>
  )
}
