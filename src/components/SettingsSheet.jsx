import { useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import { verifyKey } from '../lib/oddsApi.js'
import { exportAll, importAll, storageAvailable } from '../lib/storage.js'

const REGIONS = [
  { value: 'us', label: 'US' },
  { value: 'us,us2', label: 'US + US2 (more books)' },
  { value: 'uk', label: 'UK' },
  { value: 'au', label: 'Australia' },
  { value: 'eu', label: 'Europe' },
]

export default function SettingsSheet({
  settings, onSettings, quota, schedule, onImportSchedule, onResetSchedule, onClose, onWipe, install,
}) {
  const [showKey, setShowKey] = useState(false)
  const [check, setCheck] = useState(null)
  const [checking, setChecking] = useState(false)
  const [scheduleText, setScheduleText] = useState('')
  const [msg, setMsg] = useState(null)
  const fileInput = useRef(null)
  const backupInput = useRef(null)

  const set = (patch) => onSettings((s) => ({ ...s, ...patch }))

  const runCheck = async () => {
    setChecking(true)
    setCheck(null)
    try {
      const res = await verifyKey({ apiKey: settings.apiKey.trim() })
      setCheck({ ok: true, text: `Key works. ${res.quota?.remaining ?? '—'} requests left this month.` })
    } catch (err) {
      setCheck({ ok: false, text: err.message })
    } finally {
      setChecking(false)
    }
  }

  const applySchedule = (text) => {
    try {
      onImportSchedule(JSON.parse(text))
      setMsg({ ok: true, text: 'Schedule replaced.' })
      setScheduleText('')
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  const readFile = (input, handler) => {
    const file = input.current?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => handler(String(reader.result))
    reader.onerror = () => setMsg({ ok: false, text: 'Could not read that file.' })
    reader.readAsText(file)
    input.current.value = ''
  }

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `guessing-lines-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="field">
        <label htmlFor="apikey">The Odds API key</label>
        <div className="row">
          <input
            id="apikey"
            className="input"
            type={showKey ? 'text' : 'password'}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="paste your key"
            value={settings.apiKey}
            onChange={(e) => { set({ apiKey: e.target.value }); setCheck(null) }}
          />
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={runCheck}
            disabled={!settings.apiKey.trim() || checking}
          >
            {checking ? <span className="spinner" /> : null}
            {checking ? 'Checking' : 'Test'}
          </button>
        </div>
        <p className="field__hint">
          Free keys at <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer">the-odds-api.com</a> include
          500 requests a month, which is plenty here. The key is stored only in this browser and is sent
          only to the-odds-api.com.
        </p>
        {check ? (
          <p className="field__hint" style={{ color: check.ok ? 'var(--exact)' : 'var(--miss)' }}>{check.text}</p>
        ) : null}
        {quota ? (
          <p className="quota">
            Quota: {quota.remaining ?? '—'} remaining · {quota.used ?? '—'} used
            {quota.last !== null && quota.last !== undefined ? ` · last call cost ${quota.last}` : ''}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="regions">Bookmaker regions</label>
        <select
          id="regions"
          className="input"
          value={settings.regions}
          onChange={(e) => set({ regions: e.target.value })}
        >
          {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <p className="field__hint">
          Each region costs one request credit per call. US alone is the usual choice for NFL sides.
        </p>
      </div>

      <div className="switch">
        <input
          id="autocapture"
          type="checkbox"
          checked={settings.autoCapture}
          onChange={(e) => set({ autoCapture: e.target.checked })}
        />
        <div>
          <label htmlFor="autocapture"><b>Capture lines automatically</b></label>
          <small>
            Snapshots the market before kickoff, at most once an hour, whenever you open a week that
            still has games to play. Off means you capture by hand from the week screen.
          </small>
        </div>
      </div>

      <hr className="divider" />

      <div className="field">
        <label>Schedule</label>
        <p className="field__hint" style={{ marginTop: 0 }}>
          In use: <strong>{schedule.source}</strong>, {schedule.games.length} games over {schedule.weeks} weeks.
          {schedule.provisional
            ? ' Kickoff dates and times in the bundled schedule are generated placeholders — import the released schedule to fix them.'
            : ''}
        </p>
        <textarea
          className="input"
          placeholder='{"season":2026,"games":[{"week":1,"away":"DAL","home":"PHI","kickoff":"2026-09-11T00:20:00Z"}]}'
          value={scheduleText}
          onChange={(e) => setScheduleText(e.target.value)}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn--sm"
            disabled={!scheduleText.trim()}
            onClick={() => applySchedule(scheduleText)}
          >
            Import JSON
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => fileInput.current?.click()}>
            Load file
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onResetSchedule}>
            Use bundled
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={() => readFile(fileInput, applySchedule)}
          />
        </div>
      </div>

      <hr className="divider" />

      <div className="field">
        <label>Your data</label>
        <p className="field__hint" style={{ marginTop: 0 }}>
          {storageAvailable()
            ? 'Guesses, snapshots and reveals live in this browser only.'
            : 'This browser is blocking local storage, so anything you enter will be lost on reload. Export a backup before closing the tab.'}
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--sm" onClick={downloadBackup}>Export backup</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => backupInput.current?.click()}>
            Restore backup
          </button>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => {
              if (window.confirm('Delete every guess, snapshot and revealed line? This cannot be undone.')) onWipe()
            }}
          >
            Erase everything
          </button>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={() => readFile(backupInput, (text) => {
              try {
                const counts = importAll(JSON.parse(text))
                setMsg({ ok: true, text: `Restored ${counts.guesses} guesses and ${counts.reveals} reveals. Reloading…` })
                setTimeout(() => window.location.reload(), 700)
              } catch (err) {
                setMsg({ ok: false, text: err.message })
              }
            })}
          />
        </div>
      </div>

      {install?.available ? (
        <>
          <hr className="divider" />
          <div className="field">
            <label>Install</label>
            <p className="field__hint" style={{ marginTop: 0 }}>
              Add it to your home screen and it opens full screen, and works without a connection
              for everything except fetching odds.
            </p>
            <button type="button" className="btn btn--sm" style={{ marginTop: 8 }} onClick={install.install}>
              Add to home screen
            </button>
          </div>
        </>
      ) : null}

      {msg ? (
        <p className="field__hint" style={{ color: msg.ok ? 'var(--exact)' : 'var(--miss)' }}>{msg.text}</p>
      ) : null}
    </Sheet>
  )
}
